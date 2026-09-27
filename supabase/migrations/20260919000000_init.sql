SET check_function_bodies = false;

CREATE FUNCTION public.apply_approved_leave() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  d         DATE;
  v_days    SMALLINT[];
BEGIN
  NEW.updated_at := NOW();

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'Approved' THEN
    SELECT COALESCE(work_days, '{1,2,3,4,5}') INTO v_days FROM m_work_schedule LIMIT 1;
    v_days := COALESCE(v_days, '{1,2,3,4,5}');

    d := NEW.start_date;
    WHILE d <= NEW.end_date LOOP
      IF EXTRACT(ISODOW FROM d)::SMALLINT = ANY (v_days)
         AND NOT EXISTS (SELECT 1 FROM m_holidays h WHERE h.date = d) THEN
        INSERT INTO t_attendance (user_id, date, status, note, updated_by)
        VALUES (NEW.user_id, d, NEW.type, NEW.reason, NEW.approved_by)
        ON CONFLICT (user_id, date) DO UPDATE
          SET status = EXCLUDED.status,
              note = EXCLUDED.note,
              updated_by = EXCLUDED.updated_by,
              updated_at = NOW();
      END IF;
      d := d + 1;
    END LOOP;
  END IF;

  IF NEW.status NOT IN ('Approved', 'Rejected') THEN
    RETURN NEW;
  END IF;

  INSERT INTO t_notifications (user_id, title, body, link)
  VALUES (
    NEW.user_id,
    CASE WHEN NEW.status = 'Approved' THEN 'Leave approved' ELSE 'Leave rejected' END,
    'Your ' || NEW.type || ' request for ' || to_char(NEW.start_date, 'DD Mon YYYY')
      || ' - ' || to_char(NEW.end_date, 'DD Mon YYYY') || ' was ' || lower(NEW.status) || '.'
      || COALESCE(' Reason: ' || NULLIF(NEW.rejection_note, ''), ''),
    '/leave'
  );

  RETURN NEW;
END;
$$;

CREATE TABLE public.t_attendance (
    id integer NOT NULL,
    user_id uuid NOT NULL,
    date date NOT NULL,
    status text NOT NULL,
    clock_in time without time zone,
    clock_out time without time zone,
    note text,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT t_attendance_status_check CHECK ((status = ANY (ARRAY['Hadir'::text, 'Izin'::text, 'Sakit'::text, 'Cuti'::text, 'Alpa'::text])))
);

CREATE FUNCTION public.attendance_check_out() RETURNS public.t_attendance
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_row t_attendance;
  v_now TIME := company_now_time();
BEGIN
  SELECT * INTO v_row FROM t_attendance
   WHERE user_id = auth.uid()
     AND date = company_today()
     AND status = 'Hadir'
     AND clock_in IS NOT NULL
     AND clock_out IS NULL;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'No open check-in to close for today';
  END IF;

  IF v_now <= v_row.clock_in THEN
    RAISE EXCEPTION 'Check-out must be later than check-in';
  END IF;

  UPDATE t_attendance
     SET clock_out = v_now, updated_at = NOW()
   WHERE id = v_row.id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE FUNCTION public.audit_row_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_entity TEXT := TG_ARGV[0];
  v_id     TEXT;
  v_detail JSONB;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_id := OLD.id::TEXT;
    v_detail := jsonb_build_object('before', to_jsonb(OLD));
  ELSE
    v_id := NEW.id::TEXT;
    v_detail := CASE
      WHEN TG_OP = 'UPDATE' THEN jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW))
      ELSE jsonb_build_object('after', to_jsonb(NEW))
    END;
  END IF;

  INSERT INTO t_audit_log (actor_id, action, entity_type, entity_id, detail)
  VALUES (auth.uid(), lower(TG_OP), v_entity, v_id, v_detail);

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE FUNCTION public.chat_channel_member_ids(p_channel_id integer) RETURNS SETOF uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_channel t_chat_channels%ROWTYPE;
BEGIN
  SELECT * INTO v_channel FROM t_chat_channels WHERE id = p_channel_id;
  IF v_channel.type = 'general' THEN
    RETURN QUERY SELECT id FROM profiles;
  ELSIF v_channel.type = 'project' THEN
    RETURN QUERY
      SELECT user_id FROM m_project_members WHERE project_id = v_channel.project_id
      UNION
      SELECT p.id FROM profiles p JOIN m_roles r ON r.id = p.role_id WHERE r.role_name = 'Admin';
  ELSIF v_channel.type = 'dm' THEN
    RETURN QUERY SELECT unnest(ARRAY[v_channel.dm_user_a, v_channel.dm_user_b]);
  END IF;
END;
$$;

CREATE FUNCTION public.chat_message_update_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.id                         := OLD.id;
  NEW.channel_id                 := OLD.channel_id;
  NEW.sender_id                  := OLD.sender_id;
  NEW.created_at                 := OLD.created_at;
  NEW.reply_to_id                := OLD.reply_to_id;
  NEW.forwarded_from_sender_name := OLD.forwarded_from_sender_name;

  IF auth.uid() = OLD.sender_id THEN
    IF NEW.body IS DISTINCT FROM OLD.body THEN
      IF btrim(NEW.body) = '' THEN
        RAISE EXCEPTION 'Message body cannot be empty';
      END IF;
      NEW.edited_at := NOW();
    ELSE
      NEW.edited_at := OLD.edited_at;
    END IF;
  ELSE
    NEW.body              := OLD.body;
    NEW.mentions          := OLD.mentions;
    NEW.mentions_everyone := OLD.mentions_everyone;
    NEW.edited_at         := OLD.edited_at;
  END IF;

  IF NEW.pinned_at IS DISTINCT FROM OLD.pinned_at THEN
    IF (SELECT type FROM t_chat_channels WHERE id = OLD.channel_id) = 'general'
       AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only an admin can pin in General';
    END IF;
    IF NEW.pinned_at IS NULL THEN
      NEW.pinned_by := NULL;
    ELSE
      NEW.pinned_at := NOW();
      NEW.pinned_by := auth.uid();
    END IF;
  ELSE
    NEW.pinned_by := OLD.pinned_by;
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.chat_user_can_read(p_channel_id integer, p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    c.type = 'general'
    OR (c.type = 'project' AND (
      EXISTS (SELECT 1 FROM m_project_members m WHERE m.project_id = c.project_id AND m.user_id = p_user_id)
      OR EXISTS (SELECT 1 FROM profiles p JOIN m_roles r ON r.id = p.role_id WHERE p.id = p_user_id AND r.role_name = 'Admin')
    ))
    OR (c.type = 'dm' AND p_user_id IN (c.dm_user_a, c.dm_user_b))
  FROM t_chat_channels c WHERE c.id = p_channel_id;
$$;

CREATE FUNCTION public.company_now_time() RETURNS time without time zone
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT (NOW() AT TIME ZONE COALESCE((SELECT timezone FROM m_work_schedule LIMIT 1), 'Asia/Jakarta'))::TIME;
$$;

CREATE FUNCTION public.company_today() RETURNS date
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT (NOW() AT TIME ZONE COALESCE((SELECT timezone FROM m_work_schedule LIMIT 1), 'Asia/Jakarta'))::DATE;
$$;

CREATE FUNCTION public.compute_overtime_totals() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_rate NUMERIC(12,2);
BEGIN
  IF NEW.type = 'Overtime' THEN
    NEW.end_date := COALESCE(NEW.end_date, NEW.date);

    IF NEW.start_time IS NOT NULL AND NEW.end_time IS NOT NULL THEN
      NEW.duration_hours := ROUND(
        EXTRACT(EPOCH FROM (
          (NEW.end_date + NEW.end_time) - (NEW.date + NEW.start_time)
        )) / 3600.0, 2);
    ELSE
      NEW.duration_hours := NULL;
    END IF;

    SELECT overtime_rate INTO v_rate FROM t_employee_rates WHERE profile_id = NEW.user_id;
    NEW.daily_allowance := ROUND(COALESCE(NEW.duration_hours, 0) * COALESCE(v_rate, 0));
  ELSE
    NEW.end_date := NULL;
    NEW.duration_hours := NULL;

    SELECT CASE NEW.type
             WHEN 'BusinessTrip_Local' THEN local_trip_rate
             ELSE out_of_town_rate
           END
      INTO v_rate
      FROM t_employee_rates WHERE profile_id = NEW.user_id;
    NEW.daily_allowance := COALESCE(v_rate, 0);
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.create_project_chat_channel() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO t_chat_channels (type, project_id) VALUES ('project', NEW.id)
  ON CONFLICT (project_id) WHERE name IS NULL AND type = 'project' DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.ensure_default_admin() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'extensions'
    AS $$
DECLARE
  v_email  CONSTANT TEXT := 'admin@workdesk.com';
  v_pass   CONSTANT TEXT := 'Admin123!';
  v_id     UUID;
  v_claims TEXT := current_setting('request.jwt.claims', true);
BEGIN
  SELECT id INTO v_id FROM auth.users WHERE email = v_email;

  IF v_id IS NULL THEN
    v_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
      v_email, extensions.crypt(v_pass, extensions.gen_salt('bf')), NOW(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"admin"}'::jsonb,
      NOW(), NOW(), '', '', '', ''
    );
    INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    VALUES (
      gen_random_uuid(), v_id, v_id::TEXT,
      jsonb_build_object('sub', v_id::TEXT, 'email', v_email, 'email_verified', TRUE, 'phone_verified', FALSE),
      'email', NOW(), NOW(), NOW()
    );
  ELSE
    UPDATE auth.users
       SET encrypted_password = extensions.crypt(v_pass, extensions.gen_salt('bf')),
           banned_until       = NULL,
           updated_at         = NOW()
     WHERE id = v_id;
  END IF;

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  UPDATE profiles
     SET role_id   = (SELECT id FROM m_roles WHERE role_name = 'Admin'),
         full_name = COALESCE(full_name, 'admin')
   WHERE id = v_id;
  PERFORM set_config('request.jwt.claims', COALESCE(v_claims, ''), true);
END;
$$;

CREATE FUNCTION public.generate_payroll_run(p_period date) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_start  DATE := date_trunc('month', p_period)::DATE;
  v_end    DATE := (date_trunc('month', p_period) + INTERVAL '1 month')::DATE;
  v_run_id INT;
  v_status TEXT;
BEGIN
  IF NOT public.is_payroll_officer() THEN
    RAISE EXCEPTION 'Only Admin or Manager may run payroll';
  END IF;

  SELECT id, status INTO v_run_id, v_status
    FROM t_payroll_runs WHERE period = v_start;

  IF v_run_id IS NULL THEN
    INSERT INTO t_payroll_runs (period, created_by)
    VALUES (v_start, auth.uid())
    RETURNING id INTO v_run_id;
  ELSIF v_status = 'Finalized' THEN
    RAISE EXCEPTION 'Payroll for % is finalized', to_char(v_start, 'YYYY-MM');
  END IF;

  INSERT INTO t_payroll_lines AS l (
    run_id, user_id, base_salary, overtime_hours, overtime_pay,
    local_trip_days, local_trip_pay, out_of_town_days, out_of_town_pay
  )
  SELECT
    v_run_id,
    p.user_id,
    COALESCE(r.base_salary, 0),
    COALESCE(SUM(o.duration_hours)  FILTER (WHERE o.type = 'Overtime'), 0),
    COALESCE(SUM(o.daily_allowance) FILTER (WHERE o.type = 'Overtime'), 0),
    COUNT(o.id)                     FILTER (WHERE o.type = 'BusinessTrip_Local'),
    COALESCE(SUM(o.daily_allowance) FILTER (WHERE o.type = 'BusinessTrip_Local'), 0),
    COUNT(o.id)                     FILTER (WHERE o.type = 'BusinessTrip_OutOfTown'),
    COALESCE(SUM(o.daily_allowance) FILTER (WHERE o.type = 'BusinessTrip_OutOfTown'), 0)
  FROM (
    SELECT profile_id AS user_id FROM t_employee_rates
    UNION
    SELECT user_id FROM t_overtime_business_trips
     WHERE status = 'Approved' AND date >= v_start AND date < v_end
  ) p
  LEFT JOIN t_employee_rates r ON r.profile_id = p.user_id
  LEFT JOIN t_overtime_business_trips o
         ON o.user_id = p.user_id
        AND o.status = 'Approved'
        AND o.date >= v_start AND o.date < v_end
  GROUP BY p.user_id, r.base_salary
  ON CONFLICT (run_id, user_id) DO UPDATE SET
    base_salary      = EXCLUDED.base_salary,
    overtime_hours   = EXCLUDED.overtime_hours,
    overtime_pay     = EXCLUDED.overtime_pay,
    local_trip_days  = EXCLUDED.local_trip_days,
    local_trip_pay   = EXCLUDED.local_trip_pay,
    out_of_town_days = EXCLUDED.out_of_town_days,
    out_of_town_pay  = EXCLUDED.out_of_town_pay
  WHERE l.payment_status = 'Unpaid';

  RETURN v_run_id;

EXCEPTION WHEN check_violation THEN
  RAISE EXCEPTION 'Payroll % cannot be regenerated: %. Clear the deductions on the affected line first.',
    to_char(v_start, 'YYYY-MM'), SQLERRM;
END;
$$;

CREATE FUNCTION public.get_or_create_dm_channel(p_other_user uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_a UUID;
  v_b UUID;
  v_id INT;
BEGIN
  IF p_other_user IS NULL OR p_other_user = auth.uid() THEN
    RAISE EXCEPTION 'Invalid DM target';
  END IF;

  IF auth.uid() < p_other_user THEN
    v_a := auth.uid(); v_b := p_other_user;
  ELSE
    v_a := p_other_user; v_b := auth.uid();
  END IF;

  SELECT id INTO v_id FROM t_chat_channels WHERE dm_user_a = v_a AND dm_user_b = v_b;
  IF v_id IS NULL THEN
    INSERT INTO t_chat_channels (type, dm_user_a, dm_user_b) VALUES ('dm', v_a, v_b)
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;

CREATE FUNCTION public.get_unread_mention_counts() RETURNS TABLE(channel_id integer, unread_count bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT m.channel_id, COUNT(*)::bigint
  FROM t_chat_messages m
  JOIN t_chat_channels c ON c.id = m.channel_id
  LEFT JOIN t_chat_channel_reads r ON r.channel_id = m.channel_id AND r.user_id = auth.uid()
  WHERE m.sender_id <> auth.uid()
    AND public.chat_user_can_read(m.channel_id, auth.uid())
    AND m.created_at > COALESCE(r.last_read_at, 'epoch'::timestamptz)
    AND (m.mentions_everyone OR auth.uid() = ANY(m.mentions) OR c.type = 'dm')
  GROUP BY m.channel_id;
$$;

CREATE FUNCTION public.get_users_with_email() RETURNS TABLE(id uuid, full_name text, email text, role_id integer, role_name text, employee_id integer, employee_name text, employee_role_title text, avatar_url text, created_at timestamp with time zone, banned_until timestamp with time zone, is_superadmin boolean)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
  SELECT
    p.id,
    p.full_name,
    CASE WHEN public.is_admin() THEN u.email ELSE '' END,
    p.role_id,
    r.role_name,
    p.employee_id,
    e.full_name  AS employee_name,
    e.role_title AS employee_role_title,
    p.avatar_url,
    p.created_at,
    u.banned_until,
    p.is_superadmin
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  LEFT JOIN public.m_roles r ON r.id = p.role_id
  LEFT JOIN public.m_employees e ON e.id = p.employee_id
  WHERE NOT p.is_superadmin OR public.is_superadmin()
  ORDER BY p.created_at ASC;
$$;

-- Approvers decide on someone else's request; they don't get to rewrite it.
CREATE FUNCTION public.guard_approval_edit() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF auth.role() <> 'service_role' AND auth.uid() IS NOT NULL AND auth.uid() <> OLD.user_id
     AND (to_jsonb(NEW) - ARRAY['status', 'approved_by', 'rejection_note', 'updated_at'])
         IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status', 'approved_by', 'rejection_note', 'updated_at']) THEN
    RAISE EXCEPTION 'Approvers can only change the status and rejection note';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.guard_overtime_period() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF period_is_locked(NEW.date) THEN
    RAISE EXCEPTION 'That period is closed and can no longer be changed';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.guard_payroll_line_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT status INTO v_status FROM t_payroll_runs
   WHERE id = COALESCE(NEW.run_id, OLD.run_id);

  IF TG_OP = 'DELETE' THEN
    IF v_status = 'Finalized' THEN
      RAISE EXCEPTION 'A finalized payroll line cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;

  IF v_status = 'Finalized' AND (
       NEW.base_salary      IS DISTINCT FROM OLD.base_salary
    OR NEW.overtime_hours   IS DISTINCT FROM OLD.overtime_hours
    OR NEW.overtime_pay     IS DISTINCT FROM OLD.overtime_pay
    OR NEW.local_trip_days  IS DISTINCT FROM OLD.local_trip_days
    OR NEW.local_trip_pay   IS DISTINCT FROM OLD.local_trip_pay
    OR NEW.out_of_town_days IS DISTINCT FROM OLD.out_of_town_days
    OR NEW.out_of_town_pay  IS DISTINCT FROM OLD.out_of_town_pay
    OR NEW.pph21            IS DISTINCT FROM OLD.pph21
    OR NEW.bpjs             IS DISTINCT FROM OLD.bpjs
    OR NEW.other_deduction  IS DISTINCT FROM OLD.other_deduction
    OR NEW.user_id          IS DISTINCT FROM OLD.user_id
    OR NEW.run_id           IS DISTINCT FROM OLD.run_id
  ) THEN
    RAISE EXCEPTION 'Payroll for this period is finalized, only the payment status can change';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
    NEW.paid_at := CASE WHEN NEW.payment_status = 'Paid' THEN NOW() ELSE NULL END;
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.guard_payroll_run_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'Finalized' THEN
      RAISE EXCEPTION 'A finalized payroll run cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'Finalized' AND NEW.status = 'Draft' THEN
    RAISE EXCEPTION 'A finalized payroll run cannot be reopened';
  END IF;

  IF OLD.period IS DISTINCT FROM NEW.period THEN
    RAISE EXCEPTION 'A payroll run cannot change the month it covers';
  END IF;

  IF OLD.status = 'Draft' AND NEW.status = 'Finalized' THEN
    NEW.finalized_at := NOW();
    NEW.finalized_by := auth.uid();
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.guard_profile_role_change() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_actor_rank INT;
  v_old_rank   INT;
  v_new_rank   INT;
  v_old_role   INT := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.role_id END;
  v_old_emp    INT := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.employee_id END;
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NULL THEN
      RETURN NEW;
    END IF;
    IF NOT has_permission('master', 'update') THEN
      SELECT id INTO NEW.role_id FROM m_roles WHERE role_name = 'Employee' LIMIT 1;
      NEW.employee_id := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.employee_id IS DISTINCT FROM v_old_emp
     AND NOT has_permission('master', 'update') THEN
    RAISE EXCEPTION 'You cannot change which employee record a profile is linked to';
  END IF;

  IF NEW.role_id IS DISTINCT FROM v_old_role THEN
    IF auth.uid() = NEW.id THEN
      RAISE EXCEPTION 'You cannot change your own role';
    END IF;

    SELECT r.rank INTO v_actor_rank
    FROM profiles p JOIN m_roles r ON r.id = p.role_id
    WHERE p.id = auth.uid();

    SELECT COALESCE(rank, 2147483647) INTO v_old_rank FROM m_roles WHERE id = v_old_role;
    SELECT COALESCE(rank, 2147483647) INTO v_new_rank FROM m_roles WHERE id = NEW.role_id;
    v_old_rank := COALESCE(v_old_rank, 2147483647);
    v_new_rank := COALESCE(v_new_rank, 2147483647);

    IF v_actor_rank IS NULL THEN
      RAISE EXCEPTION 'Only someone with an assigned role can change roles';
    END IF;

    IF v_actor_rank >= v_old_rank THEN
      RAISE EXCEPTION 'You can only change the role of someone below your own role';
    END IF;

    IF v_actor_rank >= v_new_rank THEN
      RAISE EXCEPTION 'You cannot assign a role at or above your own rank';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.guard_superadmin_flag() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.is_superadmin IS DISTINCT FROM OLD.is_superadmin
     AND auth.uid() IS NOT NULL
     AND NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Only a superadmin can change that flag';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_full_name  TEXT;
  v_role_id    INT;
BEGIN
  v_full_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'name', ''),
    split_part(NEW.email, '@', 1)
  );

  SELECT id INTO v_role_id FROM m_roles WHERE role_name = 'Employee' LIMIT 1;

  INSERT INTO profiles (id, full_name, role_id, avatar_url)
  VALUES (
    NEW.id,
    v_full_name,
    v_role_id,
    COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'avatar_url', ''),
      NULLIF(NEW.raw_user_meta_data->>'picture', '')
    )
  )
  ON CONFLICT (id) DO UPDATE
    SET full_name  = EXCLUDED.full_name,
        avatar_url = COALESCE(EXCLUDED.avatar_url, profiles.avatar_url);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user error for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.has_permission(p_feature_key text, p_action text) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE(
    (SELECT CASE p_action
       WHEN 'create' THEN o.can_create
       WHEN 'read'   THEN o.can_read
       WHEN 'update' THEN o.can_update
       WHEN 'delete' THEN o.can_delete
     END
     FROM t_user_access_override o
     JOIN m_features f ON f.id = o.feature_id
     WHERE o.user_id = auth.uid()
       AND f.feature_key = p_feature_key
       AND o.is_override_active
     LIMIT 1),
    (SELECT CASE p_action
       WHEN 'create' THEN rp.can_create
       WHEN 'read'   THEN rp.can_read
       WHEN 'update' THEN rp.can_update
       WHEN 'delete' THEN rp.can_delete
     END
     FROM t_role_permissions rp
     JOIN m_features f ON f.id = rp.feature_id
     JOIN profiles p ON p.role_id = rp.role_id
     WHERE p.id = auth.uid() AND f.feature_key = p_feature_key
     LIMIT 1),
    FALSE
  );
$$;

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p
    JOIN m_roles r ON r.id = p.role_id
    WHERE p.id = auth.uid() AND r.role_name = 'Admin'
  );
$$;

CREATE FUNCTION public.is_payroll_officer() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p JOIN m_roles r ON r.id = p.role_id
    WHERE p.id = auth.uid() AND r.role_name IN ('Admin', 'Manager')
  );
$$;

CREATE FUNCTION public.is_superadmin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE((SELECT is_superadmin FROM profiles WHERE id = auth.uid()), FALSE);
$$;

-- The demo logins are printed on the login page. Changes made through the
-- Auth API (profile settings, admin ban) are refused; ensure_default_admin
-- and the seed run as the function owner, so they still reset these rows.
CREATE FUNCTION public.lock_demo_credentials() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF current_user = 'supabase_auth_admin'
     AND (OLD.email = 'admin@workdesk.com' OR OLD.email LIKE '%@workdesk.demo')
     AND (NEW.email IS DISTINCT FROM OLD.email
       OR NEW.email_change IS DISTINCT FROM OLD.email_change
       OR NEW.encrypted_password IS DISTINCT FROM OLD.encrypted_password
       OR NEW.banned_until IS DISTINCT FROM OLD.banned_until) THEN
    RAISE EXCEPTION 'Demo account credentials are locked';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.log_client_error(p_source text, p_message text, p_context jsonb DEFAULT NULL::jsonb) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  INSERT INTO t_error_log (user_id, source, message, context)
  VALUES (
    auth.uid(),
    left(p_source, 64),
    left(p_message, 1000),
    CASE WHEN length(p_context::TEXT) <= 4000 THEN p_context END
  );
$$;

CREATE FUNCTION public.my_employee_id() RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT employee_id FROM profiles WHERE id = auth.uid();
$$;

CREATE FUNCTION public.notify_chat_message() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_channel     t_chat_channels%ROWTYPE;
  v_sender_name TEXT;
  v_recipient   UUID;
  v_mentioned   UUID;
BEGIN
  SELECT * INTO v_channel FROM t_chat_channels WHERE id = NEW.channel_id;
  SELECT COALESCE(full_name, 'Someone') INTO v_sender_name FROM profiles WHERE id = NEW.sender_id;

  IF v_channel.type = 'dm' THEN
    v_recipient := CASE WHEN v_channel.dm_user_a = NEW.sender_id THEN v_channel.dm_user_b ELSE v_channel.dm_user_a END;
    INSERT INTO t_notifications (user_id, title, body, link)
    VALUES (v_recipient, v_sender_name || ' sent you a message', left(NEW.body, 140), '/chat?channel=' || NEW.channel_id);
  ELSIF NEW.mentions_everyone THEN
    FOR v_mentioned IN SELECT * FROM public.chat_channel_member_ids(NEW.channel_id) LOOP
      IF v_mentioned <> NEW.sender_id THEN
        INSERT INTO t_notifications (user_id, title, body, link)
        VALUES (v_mentioned, v_sender_name || ' mentioned @everyone', left(NEW.body, 140), '/chat?channel=' || NEW.channel_id);
      END IF;
    END LOOP;
  ELSE
    FOREACH v_mentioned IN ARRAY NEW.mentions LOOP
      IF v_mentioned <> NEW.sender_id AND public.chat_user_can_read(NEW.channel_id, v_mentioned) THEN
        INSERT INTO t_notifications (user_id, title, body, link)
        VALUES (v_mentioned, v_sender_name || ' mentioned you', left(NEW.body, 140), '/chat?channel=' || NEW.channel_id);
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.notify_overtime_status_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('Approved', 'Rejected') THEN
    INSERT INTO t_notifications (user_id, title, body, link)
    VALUES (
      NEW.user_id,
      CASE WHEN NEW.status = 'Approved' THEN 'Request approved' ELSE 'Request rejected' END,
      CASE
        WHEN NEW.status = 'Approved'
          THEN 'Your ' || NEW.type || ' request for ' || to_char(NEW.date, 'DD Mon YYYY') || ' was approved.'
        ELSE 'Your ' || NEW.type || ' request for ' || to_char(NEW.date, 'DD Mon YYYY') || ' was rejected.'
             || COALESCE(' Reason: ' || NULLIF(NEW.rejection_note, ''), '')
      END,
      '/overtime'
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.period_is_locked(p_date date) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT p_date <= COALESCE((SELECT locked_until FROM m_work_schedule LIMIT 1), '1900-01-01'::DATE);
$$;

CREATE FUNCTION public.skip_superadmin_attendance() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM profiles WHERE id = NEW.user_id AND is_superadmin) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.stamp_attendance() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := NOW();
    IF period_is_locked(NEW.date) THEN
      RAISE EXCEPTION 'That period is closed and can no longer be changed';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.user_id = auth.uid() AND NOT has_permission('attendance', 'create') THEN
    NEW.date := company_today();
    NEW.clock_in  := CASE WHEN NEW.status = 'Hadir' THEN company_now_time() END;
    NEW.clock_out := NULL;
  END IF;

  IF period_is_locked(NEW.date) THEN
    RAISE EXCEPTION 'That period is closed and can no longer be changed';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.superadmin_bootstrap(p_email text, p_password text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'extensions'
    AS $$
DECLARE
  v_id UUID;
BEGIN
  IF length(COALESCE(p_password, '')) < 8 THEN
    RAISE EXCEPTION 'Password must be at least 8 characters';
  END IF;

  SELECT id INTO v_id FROM auth.users WHERE email = p_email;

  IF v_id IS NOT NULL THEN
    UPDATE auth.users
       SET encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
           email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
           banned_until       = NULL,
           updated_at         = NOW()
     WHERE id = v_id;
  ELSE
    v_id := gen_random_uuid();

    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
      p_email, extensions.crypt(p_password, extensions.gen_salt('bf')), NOW(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Superadmin"}'::jsonb,
      NOW(), NOW(), '', '', '', ''
    );

    INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    VALUES (
      gen_random_uuid(), v_id, v_id::TEXT,
      jsonb_build_object('sub', v_id::TEXT, 'email', p_email, 'email_verified', TRUE, 'phone_verified', FALSE),
      'email', NULL, NOW(), NOW()
    );
  END IF;

  INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  SELECT gen_random_uuid(), v_id, v_id::TEXT,
         jsonb_build_object('sub', v_id::TEXT, 'email', p_email, 'email_verified', TRUE, 'phone_verified', FALSE),
         'email', NULL, NOW(), NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM auth.identities WHERE user_id = v_id AND provider = 'email'
  );

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  UPDATE profiles
     SET full_name     = COALESCE(full_name, 'Superadmin'),
         is_superadmin = TRUE,
         role_id       = (SELECT id FROM m_roles WHERE role_name = 'Admin')
   WHERE id = v_id;

  PERFORM set_config('request.jwt.claims', '', true);

  RETURN v_id;
END;
$$;

CREATE FUNCTION public.superadmin_monitor() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'storage'
    AS $$
DECLARE
  v_today DATE := public.company_today();
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Superadmin only';
  END IF;

  RETURN jsonb_build_object(
    'failed_logins', (
      SELECT COALESCE(jsonb_agg(x ORDER BY x.created_at DESC), '[]'::JSONB)
      FROM (
        SELECT context->>'email' AS email, message, created_at
        FROM t_error_log
        WHERE source = 'auth.login' AND created_at >= NOW() - INTERVAL '7 days'
        ORDER BY created_at DESC LIMIT 20
      ) x
    ),
    'inactive_accounts', (
      SELECT COALESCE(jsonb_agg(x ORDER BY x.last_sign_in_at NULLS FIRST), '[]'::JSONB)
      FROM (
        SELECT p.id, p.full_name, u.email, u.last_sign_in_at
        FROM profiles p JOIN auth.users u ON u.id = p.id
        WHERE NOT p.is_superadmin
          AND u.email <> 'admin@workdesk.com'
          AND (u.banned_until IS NULL OR u.banned_until <= NOW())
          AND (u.last_sign_in_at IS NULL OR u.last_sign_in_at < NOW() - INTERVAL '30 days')
      ) x
    ),
    'access_changes', (
      SELECT COALESCE(jsonb_agg(x ORDER BY x.created_at DESC), '[]'::JSONB)
      FROM (
        SELECT a.action, a.entity_type, a.entity_id, a.created_at, p.full_name AS actor
        FROM t_audit_log a LEFT JOIN profiles p ON p.id = a.actor_id
        WHERE a.entity_type IN ('user_role', 'user', 'role_permission', 'access_override')
           OR (a.entity_type = 'profile' AND a.action = 'update'
               AND (a.detail->'before'->'role_id' IS DISTINCT FROM a.detail->'after'->'role_id'
                 OR a.detail->'before'->'is_superadmin' IS DISTINCT FROM a.detail->'after'->'is_superadmin'))
        ORDER BY a.created_at DESC LIMIT 20
      ) x
    ),

    'errors', jsonb_build_object(
      'last_24h', (SELECT count(*) FROM t_error_log
                   WHERE source <> 'auth.login' AND created_at >= NOW() - INTERVAL '24 hours'),
      'recent', (
        SELECT COALESCE(jsonb_agg(x ORDER BY x.created_at DESC), '[]'::JSONB)
        FROM (
          SELECT e.source, e.message, e.created_at, p.full_name AS user_name
          FROM t_error_log e LEFT JOIN profiles p ON p.id = e.user_id
          WHERE e.source <> 'auth.login'
          ORDER BY e.created_at DESC LIMIT 20
        ) x
      )
    ),
    'orphans', jsonb_build_object(
      'accounts_without_employee', (
        SELECT COALESCE(jsonb_agg(COALESCE(full_name, id::TEXT)), '[]'::JSONB)
        FROM profiles WHERE employee_id IS NULL AND NOT is_superadmin
          AND id NOT IN (SELECT id FROM auth.users WHERE email = 'admin@workdesk.com')
      ),
      'employees_without_account', (
        SELECT COALESCE(jsonb_agg(e.full_name), '[]'::JSONB)
        FROM m_employees e
        WHERE e.status = 'Active'
          AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.employee_id = e.id)
      ),
      'projects_without_members', (
        SELECT COALESCE(jsonb_agg(pr.project_name), '[]'::JSONB)
        FROM m_projects pr
        WHERE NOT EXISTS (SELECT 1 FROM m_project_members m WHERE m.project_id = pr.id)
      )
    ),
    'storage', (
      SELECT COALESCE(jsonb_agg(x ORDER BY x.bytes DESC), '[]'::JSONB)
      FROM (
        SELECT bucket_id AS bucket, count(*) AS files,
               COALESCE(sum((metadata->>'size')::BIGINT), 0) AS bytes
        FROM storage.objects GROUP BY bucket_id
      ) x
    ),

    'attendance_today', jsonb_build_object(
      'date', v_today,
      'missing', (
        SELECT COALESCE(jsonb_agg(COALESCE(p.full_name, u.email) ORDER BY p.full_name), '[]'::JSONB)
        FROM profiles p JOIN auth.users u ON u.id = p.id
        WHERE NOT p.is_superadmin
          AND u.email <> 'admin@workdesk.com'
          AND (u.banned_until IS NULL OR u.banned_until <= NOW())
          AND NOT EXISTS (SELECT 1 FROM t_attendance a WHERE a.user_id = p.id AND a.date = v_today)
      ),
      'recorded', (
        SELECT count(*) FROM t_attendance a
        JOIN profiles p ON p.id = a.user_id
        WHERE a.date = v_today AND NOT p.is_superadmin
      )
    ),
    'stale_approvals', (
      SELECT COALESCE(jsonb_agg(x ORDER BY x.created_at), '[]'::JSONB)
      FROM (
        SELECT 'leave' AS kind, l.type, p.full_name, l.created_at
        FROM t_leave_requests l JOIN profiles p ON p.id = l.user_id
        WHERE l.status = 'Pending' AND l.created_at < NOW() - INTERVAL '3 days'
        UNION ALL
        SELECT 'overtime', o.type, p.full_name, o.created_at
        FROM t_overtime_business_trips o JOIN profiles p ON p.id = o.user_id
        WHERE o.status = 'Pending' AND o.created_at < NOW() - INTERVAL '3 days'
      ) x
    ),
    'payroll', jsonb_build_object(
      'locked_until', (SELECT locked_until FROM m_work_schedule LIMIT 1),
      'runs', (
        SELECT COALESCE(jsonb_agg(x ORDER BY x.period DESC), '[]'::JSONB)
        FROM (
          SELECT period, status, finalized_at
          FROM t_payroll_runs ORDER BY period DESC LIMIT 6
        ) x
      )
    ),

    'top_actors', (
      SELECT COALESCE(jsonb_agg(x ORDER BY x.n DESC), '[]'::JSONB)
      FROM (
        SELECT COALESCE(p.full_name, 'system') AS name, count(*) AS n
        FROM t_audit_log a LEFT JOIN profiles p ON p.id = a.actor_id
        WHERE a.created_at >= NOW() - INTERVAL '30 days'
        GROUP BY 1 ORDER BY 2 DESC LIMIT 5
      ) x
    ),
    'top_entities', (
      SELECT COALESCE(jsonb_agg(x ORDER BY x.n DESC), '[]'::JSONB)
      FROM (
        SELECT entity_type AS name, count(*) AS n
        FROM t_audit_log
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY 1 ORDER BY 2 DESC LIMIT 5
      ) x
    ),
    'active_now', (
      SELECT COALESCE(jsonb_agg(x ORDER BY x.last_at DESC), '[]'::JSONB)
      FROM (
        SELECT p.full_name AS name, max(a.created_at) AS last_at
        FROM t_audit_log a JOIN profiles p ON p.id = a.actor_id
        WHERE a.created_at >= NOW() - INTERVAL '15 minutes'
        GROUP BY p.full_name
      ) x
    )
  );
END;
$$;

CREATE FUNCTION public.superadmin_stats() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
DECLARE
  v_counts JSONB := '{}'::JSONB;
  r        RECORD;
  v_n      BIGINT;
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Superadmin only';
  END IF;

  FOR r IN
    SELECT c.relname AS t
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', r.t) INTO v_n;
    v_counts := v_counts || jsonb_build_object(r.t, v_n);
  END LOOP;

  RETURN jsonb_build_object(
    'tables', v_counts,
    'accounts', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', p.id, 'full_name', p.full_name, 'email', u.email,
        'role', r2.role_name, 'is_superadmin', p.is_superadmin,
        'banned', u.banned_until IS NOT NULL AND u.banned_until > NOW(),
        'last_sign_in_at', u.last_sign_in_at
      ) ORDER BY u.last_sign_in_at DESC NULLS LAST), '[]'::JSONB)
      FROM profiles p
      JOIN auth.users u ON u.id = p.id
      LEFT JOIN m_roles r2 ON r2.id = p.role_id
    ),
    'recent_audit', (
      SELECT COALESCE(jsonb_agg(a ORDER BY a.created_at DESC), '[]'::JSONB)
      FROM (SELECT * FROM t_audit_log ORDER BY created_at DESC LIMIT 20) a
    ),
    'activity', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'hour', h.hour, 'action', h.action, 'n', h.n
      ) ORDER BY h.hour), '[]'::JSONB)
      FROM (
        SELECT date_trunc('hour', created_at) AS hour, action, count(*) AS n
        FROM t_audit_log
        WHERE created_at >= NOW() - INTERVAL '15 days'
        GROUP BY 1, 2
      ) h
    )
  );
END;
$$;

CREATE FUNCTION public.superadmin_wipe_all_data() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
DECLARE
  r       RECORD;
  v_users BIGINT;
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Superadmin only';
  END IF;

  FOR r IN
    SELECT c.oid::regclass AS t
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  LOOP
    EXECUTE format('ALTER TABLE %s DISABLE TRIGGER USER', r.t);
  END LOOP;

  DELETE FROM t_audit_log                WHERE TRUE;
  DELETE FROM t_notifications            WHERE TRUE;
  DELETE FROM t_task_comments            WHERE TRUE;
  DELETE FROM t_task_attachments         WHERE TRUE;
  DELETE FROM t_chat_attachments         WHERE TRUE;
  DELETE FROM t_chat_message_reactions   WHERE TRUE;
  DELETE FROM t_chat_channel_reads       WHERE TRUE;
  DELETE FROM t_chat_messages            WHERE TRUE;
  DELETE FROM t_chat_channels            WHERE type <> 'general';
  DELETE FROM t_payroll_lines            WHERE TRUE;
  DELETE FROM t_payroll_runs             WHERE TRUE;
  DELETE FROM t_overtime_business_trips  WHERE TRUE;
  DELETE FROM t_employee_rates           WHERE TRUE;
  DELETE FROM t_leave_requests           WHERE TRUE;
  DELETE FROM t_attendance               WHERE TRUE;
  DELETE FROM t_daily_tasks              WHERE TRUE;
  DELETE FROM t_user_access_override     WHERE TRUE;
  DELETE FROM project_type_assignment    WHERE TRUE;
  DELETE FROM m_project_members          WHERE TRUE;
  DELETE FROM m_projects                 WHERE TRUE;
  DELETE FROM m_holidays                 WHERE TRUE;

  DELETE FROM auth.users
   WHERE id NOT IN (SELECT id FROM profiles WHERE is_superadmin)
     AND email <> 'admin@workdesk.com';
  GET DIAGNOSTICS v_users = ROW_COUNT;

  DELETE FROM m_employees WHERE TRUE;

  PERFORM public.ensure_default_admin();

  FOR r IN
    SELECT c.oid::regclass AS t
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  LOOP
    EXECUTE format('ALTER TABLE %s ENABLE TRIGGER USER', r.t);
  END LOOP;

  RETURN jsonb_build_object('deleted_accounts', v_users);
END;
$$;

CREATE TABLE public.m_employees (
    id integer NOT NULL,
    full_name text NOT NULL,
    role_title text NOT NULL,
    status text DEFAULT 'Active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    employee_number text,
    department text,
    employment_type text DEFAULT 'Permanent'::text NOT NULL,
    join_date date,
    resign_date date,
    annual_leave_quota integer DEFAULT 12 NOT NULL
);

CREATE SEQUENCE public.m_employees_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.m_employees_id_seq OWNED BY public.m_employees.id;

CREATE TABLE public.m_features (
    id integer NOT NULL,
    feature_name text NOT NULL,
    feature_key text NOT NULL,
    icon_name text,
    path text
);

CREATE SEQUENCE public.m_features_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.m_features_id_seq OWNED BY public.m_features.id;

CREATE TABLE public.m_holidays (
    id integer NOT NULL,
    date date NOT NULL,
    name text NOT NULL,
    is_national boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE public.m_holidays_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.m_holidays_id_seq OWNED BY public.m_holidays.id;

CREATE TABLE public.m_project_members (
    project_id integer NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.m_project_types (
    id integer NOT NULL,
    type_name text NOT NULL
);

CREATE SEQUENCE public.m_project_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.m_project_types_id_seq OWNED BY public.m_project_types.id;

CREATE TABLE public.m_projects (
    id integer NOT NULL,
    project_code text NOT NULL,
    project_name text NOT NULL,
    client text NOT NULL,
    pic_name text,
    pic_contact character varying(30),
    priority text DEFAULT 'Medium'::text NOT NULL,
    start_date date,
    end_date date,
    status_id integer,
    created_at timestamp with time zone DEFAULT now()
);

CREATE SEQUENCE public.m_projects_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.m_projects_id_seq OWNED BY public.m_projects.id;

CREATE TABLE public.m_roles (
    id integer NOT NULL,
    role_name text NOT NULL,
    rank integer DEFAULT 100 NOT NULL
);

CREATE SEQUENCE public.m_roles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.m_roles_id_seq OWNED BY public.m_roles.id;

CREATE TABLE public.m_work_schedule (
    id integer NOT NULL,
    clock_in_time time without time zone DEFAULT '08:00:00'::time without time zone NOT NULL,
    clock_out_time time without time zone DEFAULT '17:00:00'::time without time zone NOT NULL,
    late_tolerance_minutes integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    timezone text DEFAULT 'Asia/Jakarta'::text NOT NULL,
    work_days smallint[] DEFAULT '{1,2,3,4,5}'::smallint[] NOT NULL,
    locked_until date,
    company_name text DEFAULT 'WorkDesk'::text NOT NULL
);

CREATE SEQUENCE public.m_work_schedule_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.m_work_schedule_id_seq OWNED BY public.m_work_schedule.id;

CREATE TABLE public.m_work_status (
    id integer NOT NULL,
    status_name text NOT NULL
);

CREATE SEQUENCE public.m_work_status_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.m_work_status_id_seq OWNED BY public.m_work_status.id;

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    role_id integer,
    employee_id integer,
    full_name text,
    avatar_url text,
    language_preference text DEFAULT 'en'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    phone_number text,
    is_superadmin boolean DEFAULT false NOT NULL
);

CREATE TABLE public.project_type_assignment (
    project_id integer NOT NULL,
    type_id integer NOT NULL
);

CREATE SEQUENCE public.t_attendance_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.t_attendance_id_seq OWNED BY public.t_attendance.id;

CREATE TABLE public.t_audit_log (
    id bigint NOT NULL,
    actor_id uuid,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    detail jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE public.t_audit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.t_audit_log_id_seq OWNED BY public.t_audit_log.id;

CREATE TABLE public.t_chat_attachments (
    id bigint NOT NULL,
    message_id bigint NOT NULL,
    file_path text NOT NULL,
    file_name text NOT NULL,
    file_type text,
    file_size integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE public.t_chat_attachments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.t_chat_attachments_id_seq OWNED BY public.t_chat_attachments.id;

CREATE TABLE public.t_chat_channel_reads (
    channel_id integer NOT NULL,
    user_id uuid NOT NULL,
    last_read_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.t_chat_channels (
    id integer NOT NULL,
    type text NOT NULL,
    project_id integer,
    dm_user_a uuid,
    dm_user_b uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    name text,
    CONSTRAINT chat_channels_dm_ordered CHECK (((dm_user_a IS NULL) OR (dm_user_a < dm_user_b))),
    CONSTRAINT t_chat_channels_type_check CHECK ((type = ANY (ARRAY['general'::text, 'project'::text, 'dm'::text])))
);

CREATE SEQUENCE public.t_chat_channels_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.t_chat_channels_id_seq OWNED BY public.t_chat_channels.id;

CREATE TABLE public.t_chat_message_reactions (
    id bigint NOT NULL,
    message_id bigint NOT NULL,
    user_id uuid NOT NULL,
    emoji text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE public.t_chat_message_reactions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.t_chat_message_reactions_id_seq OWNED BY public.t_chat_message_reactions.id;

CREATE TABLE public.t_chat_messages (
    id bigint NOT NULL,
    channel_id integer NOT NULL,
    sender_id uuid NOT NULL,
    body text NOT NULL,
    reply_to_id bigint,
    mentions uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    forwarded_from_sender_name text,
    mentions_everyone boolean DEFAULT false NOT NULL,
    edited_at timestamp with time zone,
    pinned_at timestamp with time zone,
    pinned_by uuid
);

CREATE SEQUENCE public.t_chat_messages_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.t_chat_messages_id_seq OWNED BY public.t_chat_messages.id;

CREATE TABLE public.t_daily_tasks (
    id integer NOT NULL,
    date date NOT NULL,
    employee_id integer,
    project_id integer,
    task_desc text NOT NULL,
    progress_pct integer DEFAULT 0 NOT NULL,
    problem_desc text,
    is_resolved boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

CREATE SEQUENCE public.t_daily_tasks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.t_daily_tasks_id_seq OWNED BY public.t_daily_tasks.id;

CREATE TABLE public.t_employee_rates (
    id integer NOT NULL,
    profile_id uuid NOT NULL,
    overtime_rate numeric(12,2) DEFAULT 0 NOT NULL,
    local_trip_rate numeric(12,2) DEFAULT 0 NOT NULL,
    out_of_town_rate numeric(12,2) DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    base_salary numeric(12,2) DEFAULT 0 NOT NULL
);

CREATE SEQUENCE public.t_employee_rates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.t_employee_rates_id_seq OWNED BY public.t_employee_rates.id;

CREATE TABLE public.t_error_log (
    id bigint NOT NULL,
    user_id uuid,
    source text NOT NULL,
    message text NOT NULL,
    context jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE public.t_error_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.t_error_log_id_seq OWNED BY public.t_error_log.id;

CREATE TABLE public.t_leave_requests (
    id integer NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    reason text NOT NULL,
    status text DEFAULT 'Pending'::text NOT NULL,
    approved_by uuid,
    rejection_note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT t_leave_requests_check CHECK ((end_date >= start_date)),
    CONSTRAINT t_leave_requests_status_check CHECK ((status = ANY (ARRAY['Pending'::text, 'Approved'::text, 'Rejected'::text]))),
    CONSTRAINT t_leave_requests_type_check CHECK ((type = ANY (ARRAY['Cuti'::text, 'Izin'::text, 'Sakit'::text])))
);

CREATE SEQUENCE public.t_leave_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.t_leave_requests_id_seq OWNED BY public.t_leave_requests.id;

CREATE TABLE public.t_notifications (
    id integer NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    body text,
    link text,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE public.t_notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.t_notifications_id_seq OWNED BY public.t_notifications.id;

CREATE TABLE public.t_overtime_business_trips (
    id integer NOT NULL,
    user_id uuid NOT NULL,
    type character varying(30) NOT NULL,
    date date NOT NULL,
    start_time time without time zone,
    end_time time without time zone,
    project_id integer,
    activity_description text NOT NULL,
    duration_hours numeric(5,2),
    daily_allowance numeric(12,2),
    status character varying(20) DEFAULT 'Pending'::character varying NOT NULL,
    approved_by uuid,
    rejection_note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    end_date date,
    CONSTRAINT t_overtime_business_trips_status_check CHECK (((status)::text = ANY (ARRAY[('Pending'::character varying)::text, ('Approved'::character varying)::text, ('Rejected'::character varying)::text]))),
    CONSTRAINT t_overtime_business_trips_type_check CHECK (((type)::text = ANY (ARRAY[('Overtime'::character varying)::text, ('BusinessTrip_Local'::character varying)::text, ('BusinessTrip_OutOfTown'::character varying)::text])))
);

CREATE SEQUENCE public.t_overtime_dl_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.t_overtime_dl_id_seq OWNED BY public.t_overtime_business_trips.id;

CREATE TABLE public.t_payroll_lines (
    id integer NOT NULL,
    run_id integer NOT NULL,
    user_id uuid NOT NULL,
    base_salary numeric(14,2) DEFAULT 0 NOT NULL,
    overtime_hours numeric(8,2) DEFAULT 0 NOT NULL,
    overtime_pay numeric(14,2) DEFAULT 0 NOT NULL,
    local_trip_days integer DEFAULT 0 NOT NULL,
    local_trip_pay numeric(14,2) DEFAULT 0 NOT NULL,
    out_of_town_days integer DEFAULT 0 NOT NULL,
    out_of_town_pay numeric(14,2) DEFAULT 0 NOT NULL,
    pph21 numeric(14,2) DEFAULT 0 NOT NULL,
    bpjs numeric(14,2) DEFAULT 0 NOT NULL,
    other_deduction numeric(14,2) DEFAULT 0 NOT NULL,
    deduction_note text,
    gross numeric(14,2) GENERATED ALWAYS AS ((((base_salary + overtime_pay) + local_trip_pay) + out_of_town_pay)) STORED,
    net numeric(14,2) GENERATED ALWAYS AS (((((((base_salary + overtime_pay) + local_trip_pay) + out_of_town_pay) - pph21) - bpjs) - other_deduction)) STORED,
    payment_status text DEFAULT 'Unpaid'::text NOT NULL,
    paid_at timestamp with time zone,
    CONSTRAINT payroll_line_amounts_positive CHECK (((base_salary >= (0)::numeric) AND (overtime_pay >= (0)::numeric) AND (local_trip_pay >= (0)::numeric) AND (out_of_town_pay >= (0)::numeric) AND (overtime_hours >= (0)::numeric) AND (local_trip_days >= 0) AND (out_of_town_days >= 0) AND (pph21 >= (0)::numeric) AND (bpjs >= (0)::numeric) AND (other_deduction >= (0)::numeric))),
    CONSTRAINT payroll_line_net_not_negative CHECK ((((pph21 + bpjs) + other_deduction) <= (((base_salary + overtime_pay) + local_trip_pay) + out_of_town_pay))),
    CONSTRAINT t_payroll_lines_payment_status_check CHECK ((payment_status = ANY (ARRAY['Unpaid'::text, 'Paid'::text])))
);

CREATE SEQUENCE public.t_payroll_lines_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.t_payroll_lines_id_seq OWNED BY public.t_payroll_lines.id;

CREATE TABLE public.t_payroll_runs (
    id integer NOT NULL,
    period date NOT NULL,
    status text DEFAULT 'Draft'::text NOT NULL,
    note text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    finalized_by uuid,
    finalized_at timestamp with time zone,
    CONSTRAINT payroll_period_is_month_start CHECK ((period = (date_trunc('month'::text, (period)::timestamp with time zone))::date)),
    CONSTRAINT t_payroll_runs_status_check CHECK ((status = ANY (ARRAY['Draft'::text, 'Finalized'::text])))
);

CREATE SEQUENCE public.t_payroll_runs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.t_payroll_runs_id_seq OWNED BY public.t_payroll_runs.id;

CREATE TABLE public.t_role_permissions (
    id integer NOT NULL,
    role_id integer,
    feature_id integer,
    can_create boolean DEFAULT false NOT NULL,
    can_read boolean DEFAULT true NOT NULL,
    can_update boolean DEFAULT false NOT NULL,
    can_delete boolean DEFAULT false NOT NULL
);

CREATE SEQUENCE public.t_role_permissions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.t_role_permissions_id_seq OWNED BY public.t_role_permissions.id;

CREATE TABLE public.t_task_attachments (
    id integer NOT NULL,
    task_id integer NOT NULL,
    file_path text NOT NULL,
    file_name text NOT NULL,
    uploaded_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE public.t_task_attachments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.t_task_attachments_id_seq OWNED BY public.t_task_attachments.id;

CREATE TABLE public.t_task_comments (
    id integer NOT NULL,
    task_id integer NOT NULL,
    user_id uuid NOT NULL,
    comment text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE public.t_task_comments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.t_task_comments_id_seq OWNED BY public.t_task_comments.id;

CREATE TABLE public.t_user_access_override (
    id integer NOT NULL,
    user_id uuid,
    feature_id integer,
    can_create boolean,
    can_read boolean,
    can_update boolean,
    can_delete boolean,
    is_override_active boolean DEFAULT true NOT NULL
);

CREATE SEQUENCE public.t_user_access_override_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.t_user_access_override_id_seq OWNED BY public.t_user_access_override.id;

ALTER TABLE ONLY public.m_employees ALTER COLUMN id SET DEFAULT nextval('public.m_employees_id_seq'::regclass);

ALTER TABLE ONLY public.m_features ALTER COLUMN id SET DEFAULT nextval('public.m_features_id_seq'::regclass);

ALTER TABLE ONLY public.m_holidays ALTER COLUMN id SET DEFAULT nextval('public.m_holidays_id_seq'::regclass);

ALTER TABLE ONLY public.m_project_types ALTER COLUMN id SET DEFAULT nextval('public.m_project_types_id_seq'::regclass);

ALTER TABLE ONLY public.m_projects ALTER COLUMN id SET DEFAULT nextval('public.m_projects_id_seq'::regclass);

ALTER TABLE ONLY public.m_roles ALTER COLUMN id SET DEFAULT nextval('public.m_roles_id_seq'::regclass);

ALTER TABLE ONLY public.m_work_schedule ALTER COLUMN id SET DEFAULT nextval('public.m_work_schedule_id_seq'::regclass);

ALTER TABLE ONLY public.m_work_status ALTER COLUMN id SET DEFAULT nextval('public.m_work_status_id_seq'::regclass);

ALTER TABLE ONLY public.t_attendance ALTER COLUMN id SET DEFAULT nextval('public.t_attendance_id_seq'::regclass);

ALTER TABLE ONLY public.t_audit_log ALTER COLUMN id SET DEFAULT nextval('public.t_audit_log_id_seq'::regclass);

ALTER TABLE ONLY public.t_chat_attachments ALTER COLUMN id SET DEFAULT nextval('public.t_chat_attachments_id_seq'::regclass);

ALTER TABLE ONLY public.t_chat_channels ALTER COLUMN id SET DEFAULT nextval('public.t_chat_channels_id_seq'::regclass);

ALTER TABLE ONLY public.t_chat_message_reactions ALTER COLUMN id SET DEFAULT nextval('public.t_chat_message_reactions_id_seq'::regclass);

ALTER TABLE ONLY public.t_chat_messages ALTER COLUMN id SET DEFAULT nextval('public.t_chat_messages_id_seq'::regclass);

ALTER TABLE ONLY public.t_daily_tasks ALTER COLUMN id SET DEFAULT nextval('public.t_daily_tasks_id_seq'::regclass);

ALTER TABLE ONLY public.t_employee_rates ALTER COLUMN id SET DEFAULT nextval('public.t_employee_rates_id_seq'::regclass);

ALTER TABLE ONLY public.t_error_log ALTER COLUMN id SET DEFAULT nextval('public.t_error_log_id_seq'::regclass);

ALTER TABLE ONLY public.t_leave_requests ALTER COLUMN id SET DEFAULT nextval('public.t_leave_requests_id_seq'::regclass);

ALTER TABLE ONLY public.t_notifications ALTER COLUMN id SET DEFAULT nextval('public.t_notifications_id_seq'::regclass);

ALTER TABLE ONLY public.t_overtime_business_trips ALTER COLUMN id SET DEFAULT nextval('public.t_overtime_dl_id_seq'::regclass);

ALTER TABLE ONLY public.t_payroll_lines ALTER COLUMN id SET DEFAULT nextval('public.t_payroll_lines_id_seq'::regclass);

ALTER TABLE ONLY public.t_payroll_runs ALTER COLUMN id SET DEFAULT nextval('public.t_payroll_runs_id_seq'::regclass);

ALTER TABLE ONLY public.t_role_permissions ALTER COLUMN id SET DEFAULT nextval('public.t_role_permissions_id_seq'::regclass);

ALTER TABLE ONLY public.t_task_attachments ALTER COLUMN id SET DEFAULT nextval('public.t_task_attachments_id_seq'::regclass);

ALTER TABLE ONLY public.t_task_comments ALTER COLUMN id SET DEFAULT nextval('public.t_task_comments_id_seq'::regclass);

ALTER TABLE ONLY public.t_user_access_override ALTER COLUMN id SET DEFAULT nextval('public.t_user_access_override_id_seq'::regclass);

ALTER TABLE public.t_attendance
    ADD CONSTRAINT attendance_clock_order CHECK (((clock_in IS NULL) OR (clock_out IS NULL) OR (clock_out > clock_in))) NOT VALID;

ALTER TABLE public.t_daily_tasks
    ADD CONSTRAINT daily_tasks_progress_range CHECK (((progress_pct >= 0) AND (progress_pct <= 100))) NOT VALID;

ALTER TABLE public.t_employee_rates
    ADD CONSTRAINT employee_rates_base_positive CHECK ((base_salary >= (0)::numeric)) NOT VALID;

ALTER TABLE public.t_employee_rates
    ADD CONSTRAINT employee_rates_positive CHECK (((overtime_rate >= (0)::numeric) AND (local_trip_rate >= (0)::numeric) AND (out_of_town_rate >= (0)::numeric))) NOT VALID;

ALTER TABLE public.m_employees
    ADD CONSTRAINT employees_date_order CHECK (((join_date IS NULL) OR (resign_date IS NULL) OR (resign_date >= join_date))) NOT VALID;

ALTER TABLE public.m_employees
    ADD CONSTRAINT employees_employment_type_valid CHECK ((employment_type = ANY (ARRAY['Permanent'::text, 'Contract'::text, 'Probation'::text, 'Intern'::text]))) NOT VALID;

ALTER TABLE public.m_employees
    ADD CONSTRAINT employees_quota_positive CHECK ((annual_leave_quota >= 0)) NOT VALID;

ALTER TABLE public.m_employees
    ADD CONSTRAINT employees_status_valid CHECK ((status = ANY (ARRAY['Active'::text, 'Inactive'::text]))) NOT VALID;

ALTER TABLE ONLY public.m_employees
    ADD CONSTRAINT m_employees_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.m_features
    ADD CONSTRAINT m_features_feature_key_key UNIQUE (feature_key);

ALTER TABLE ONLY public.m_features
    ADD CONSTRAINT m_features_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.m_holidays
    ADD CONSTRAINT m_holidays_date_key UNIQUE (date);

ALTER TABLE ONLY public.m_holidays
    ADD CONSTRAINT m_holidays_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.m_project_members
    ADD CONSTRAINT m_project_members_pkey PRIMARY KEY (project_id, user_id);

ALTER TABLE ONLY public.m_project_types
    ADD CONSTRAINT m_project_types_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.m_projects
    ADD CONSTRAINT m_projects_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.m_projects
    ADD CONSTRAINT m_projects_project_code_key UNIQUE (project_code);

ALTER TABLE ONLY public.m_roles
    ADD CONSTRAINT m_roles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.m_roles
    ADD CONSTRAINT m_roles_role_name_key UNIQUE (role_name);

ALTER TABLE ONLY public.m_work_schedule
    ADD CONSTRAINT m_work_schedule_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.m_work_status
    ADD CONSTRAINT m_work_status_pkey PRIMARY KEY (id);

ALTER TABLE public.t_overtime_business_trips
    ADD CONSTRAINT overtime_allowance_positive CHECK (((daily_allowance IS NULL) OR (daily_allowance >= (0)::numeric))) NOT VALID;

ALTER TABLE public.t_overtime_business_trips
    ADD CONSTRAINT overtime_duration_sane CHECK (((duration_hours IS NULL) OR ((duration_hours > (0)::numeric) AND (duration_hours <= (24)::numeric)))) NOT VALID;

ALTER TABLE public.t_overtime_business_trips
    ADD CONSTRAINT overtime_end_date_range CHECK (((end_date IS NULL) OR ((end_date = date) OR (end_date = (date + 1))))) NOT VALID;

ALTER TABLE public.t_overtime_business_trips
    ADD CONSTRAINT overtime_time_order CHECK (((start_time IS NULL) OR (end_time IS NULL) OR (COALESCE(end_date, date) > date) OR (end_time > start_time))) NOT VALID;

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.project_type_assignment
    ADD CONSTRAINT project_type_assignment_pkey PRIMARY KEY (project_id, type_id);

ALTER TABLE public.m_projects
    ADD CONSTRAINT projects_date_order CHECK (((start_date IS NULL) OR (end_date IS NULL) OR (end_date >= start_date))) NOT VALID;

ALTER TABLE public.m_projects
    ADD CONSTRAINT projects_priority_valid CHECK ((priority = ANY (ARRAY['Low'::text, 'Medium'::text, 'High'::text]))) NOT VALID;

ALTER TABLE ONLY public.t_attendance
    ADD CONSTRAINT t_attendance_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.t_attendance
    ADD CONSTRAINT t_attendance_user_id_date_key UNIQUE (user_id, date);

ALTER TABLE ONLY public.t_audit_log
    ADD CONSTRAINT t_audit_log_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.t_chat_attachments
    ADD CONSTRAINT t_chat_attachments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.t_chat_channel_reads
    ADD CONSTRAINT t_chat_channel_reads_pkey PRIMARY KEY (channel_id, user_id);

ALTER TABLE ONLY public.t_chat_channels
    ADD CONSTRAINT t_chat_channels_dm_user_a_dm_user_b_key UNIQUE (dm_user_a, dm_user_b);

ALTER TABLE ONLY public.t_chat_channels
    ADD CONSTRAINT t_chat_channels_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.t_chat_message_reactions
    ADD CONSTRAINT t_chat_message_reactions_message_id_user_id_emoji_key UNIQUE (message_id, user_id, emoji);

ALTER TABLE ONLY public.t_chat_message_reactions
    ADD CONSTRAINT t_chat_message_reactions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.t_chat_messages
    ADD CONSTRAINT t_chat_messages_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.t_daily_tasks
    ADD CONSTRAINT t_daily_tasks_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.t_employee_rates
    ADD CONSTRAINT t_employee_rates_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.t_employee_rates
    ADD CONSTRAINT t_employee_rates_profile_id_key UNIQUE (profile_id);

ALTER TABLE ONLY public.t_error_log
    ADD CONSTRAINT t_error_log_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.t_leave_requests
    ADD CONSTRAINT t_leave_requests_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.t_notifications
    ADD CONSTRAINT t_notifications_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.t_overtime_business_trips
    ADD CONSTRAINT t_overtime_business_trips_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.t_payroll_lines
    ADD CONSTRAINT t_payroll_lines_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.t_payroll_lines
    ADD CONSTRAINT t_payroll_lines_run_id_user_id_key UNIQUE (run_id, user_id);

ALTER TABLE ONLY public.t_payroll_runs
    ADD CONSTRAINT t_payroll_runs_period_key UNIQUE (period);

ALTER TABLE ONLY public.t_payroll_runs
    ADD CONSTRAINT t_payroll_runs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.t_role_permissions
    ADD CONSTRAINT t_role_permissions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.t_role_permissions
    ADD CONSTRAINT t_role_permissions_role_id_feature_id_key UNIQUE (role_id, feature_id);

ALTER TABLE ONLY public.t_task_attachments
    ADD CONSTRAINT t_task_attachments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.t_task_comments
    ADD CONSTRAINT t_task_comments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.t_user_access_override
    ADD CONSTRAINT t_user_access_override_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.t_user_access_override
    ADD CONSTRAINT t_user_access_override_user_id_feature_id_key UNIQUE (user_id, feature_id);

ALTER TABLE public.m_work_schedule
    ADD CONSTRAINT work_schedule_tolerance_positive CHECK ((late_tolerance_minutes >= 0)) NOT VALID;

CREATE UNIQUE INDEX chat_channels_general_singleton ON public.t_chat_channels USING btree (type) WHERE (type = 'general'::text);

CREATE UNIQUE INDEX chat_channels_project_default_singleton ON public.t_chat_channels USING btree (project_id) WHERE ((name IS NULL) AND (type = 'project'::text));

CREATE INDEX idx_attendance_date ON public.t_attendance USING btree (date DESC);

CREATE INDEX idx_attendance_user_date ON public.t_attendance USING btree (user_id, date DESC);

CREATE INDEX idx_audit_log_actor ON public.t_audit_log USING btree (actor_id);

CREATE INDEX idx_audit_log_created ON public.t_audit_log USING btree (created_at DESC);

CREATE INDEX idx_chat_messages_channel ON public.t_chat_messages USING btree (channel_id, created_at);

CREATE INDEX idx_chat_messages_pinned ON public.t_chat_messages USING btree (channel_id, pinned_at DESC) WHERE (pinned_at IS NOT NULL);

CREATE INDEX idx_daily_tasks_date ON public.t_daily_tasks USING btree (date DESC);

CREATE INDEX idx_daily_tasks_employee ON public.t_daily_tasks USING btree (employee_id);

CREATE INDEX idx_daily_tasks_project ON public.t_daily_tasks USING btree (project_id);

CREATE INDEX idx_error_log_created ON public.t_error_log USING btree (created_at DESC);

CREATE INDEX idx_leave_status ON public.t_leave_requests USING btree (status);

CREATE INDEX idx_leave_user ON public.t_leave_requests USING btree (user_id, start_date DESC);

CREATE INDEX idx_notifications_user ON public.t_notifications USING btree (user_id, created_at DESC);

CREATE INDEX idx_overtime_date ON public.t_overtime_business_trips USING btree (date DESC);

CREATE INDEX idx_overtime_status ON public.t_overtime_business_trips USING btree (status);

CREATE INDEX idx_overtime_user ON public.t_overtime_business_trips USING btree (user_id);

CREATE INDEX idx_payroll_lines_run ON public.t_payroll_lines USING btree (run_id);

CREATE INDEX idx_payroll_lines_user ON public.t_payroll_lines USING btree (user_id);

CREATE INDEX idx_task_attachments_task ON public.t_task_attachments USING btree (task_id);

CREATE INDEX idx_task_comments_task ON public.t_task_comments USING btree (task_id);

CREATE UNIQUE INDEX m_employees_employee_number_key ON public.m_employees USING btree (employee_number) WHERE (employee_number IS NOT NULL);

CREATE UNIQUE INDEX m_project_types_type_name_key ON public.m_project_types USING btree (type_name);

CREATE UNIQUE INDEX m_work_schedule_singleton ON public.m_work_schedule USING btree ((true));

CREATE UNIQUE INDEX m_work_status_status_name_key ON public.m_work_status USING btree (status_name);

CREATE UNIQUE INDEX profiles_employee_id_key ON public.profiles USING btree (employee_id) WHERE (employee_id IS NOT NULL);

CREATE TRIGGER guard_profile_role_change BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.guard_profile_role_change();

CREATE TRIGGER skip_superadmin_attendance BEFORE INSERT ON public.t_attendance FOR EACH ROW EXECUTE FUNCTION public.skip_superadmin_attendance();

CREATE TRIGGER trg_apply_approved_leave BEFORE UPDATE ON public.t_leave_requests FOR EACH ROW EXECUTE FUNCTION public.apply_approved_leave();

CREATE TRIGGER trg_guard_approval_edit BEFORE UPDATE ON public.t_leave_requests FOR EACH ROW EXECUTE FUNCTION public.guard_approval_edit();

CREATE TRIGGER trg_guard_approval_edit BEFORE UPDATE ON public.t_overtime_business_trips FOR EACH ROW EXECUTE FUNCTION public.guard_approval_edit();

CREATE TRIGGER trg_audit_access_override AFTER INSERT OR DELETE OR UPDATE ON public.t_user_access_override FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('access_override');

CREATE TRIGGER trg_audit_attendance AFTER INSERT OR DELETE OR UPDATE ON public.t_attendance FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('attendance');

CREATE TRIGGER trg_audit_leave AFTER INSERT OR DELETE OR UPDATE ON public.t_leave_requests FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('leave');

CREATE TRIGGER trg_audit_overtime AFTER INSERT OR DELETE OR UPDATE ON public.t_overtime_business_trips FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('overtime');

CREATE TRIGGER trg_audit_payroll_line AFTER DELETE OR UPDATE ON public.t_payroll_lines FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('payroll_line');

CREATE TRIGGER trg_audit_payroll_run AFTER INSERT OR DELETE OR UPDATE ON public.t_payroll_runs FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('payroll_run');

CREATE TRIGGER trg_audit_profiles AFTER UPDATE ON public.profiles FOR EACH ROW WHEN (((old.role_id IS DISTINCT FROM new.role_id) OR (old.employee_id IS DISTINCT FROM new.employee_id))) EXECUTE FUNCTION public.audit_row_change('profile');

CREATE TRIGGER trg_audit_role_permission AFTER INSERT OR DELETE OR UPDATE ON public.t_role_permissions FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('role_permission');

CREATE TRIGGER trg_chat_message_update_guard BEFORE UPDATE ON public.t_chat_messages FOR EACH ROW EXECUTE FUNCTION public.chat_message_update_guard();

CREATE TRIGGER trg_compute_overtime_totals BEFORE INSERT OR UPDATE OF type, date, end_date, start_time, end_time, user_id ON public.t_overtime_business_trips FOR EACH ROW EXECUTE FUNCTION public.compute_overtime_totals();

CREATE TRIGGER trg_create_project_chat_channel AFTER INSERT ON public.m_projects FOR EACH ROW EXECUTE FUNCTION public.create_project_chat_channel();

CREATE TRIGGER trg_guard_overtime_period BEFORE INSERT OR UPDATE ON public.t_overtime_business_trips FOR EACH ROW EXECUTE FUNCTION public.guard_overtime_period();

CREATE TRIGGER trg_guard_payroll_line BEFORE DELETE OR UPDATE ON public.t_payroll_lines FOR EACH ROW EXECUTE FUNCTION public.guard_payroll_line_change();

CREATE TRIGGER trg_guard_payroll_run BEFORE DELETE OR UPDATE ON public.t_payroll_runs FOR EACH ROW EXECUTE FUNCTION public.guard_payroll_run_change();

CREATE TRIGGER trg_guard_profile_role_insert BEFORE INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.guard_profile_role_change();

CREATE TRIGGER trg_guard_superadmin_flag BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.guard_superadmin_flag();

CREATE TRIGGER trg_notify_chat_message AFTER INSERT ON public.t_chat_messages FOR EACH ROW EXECUTE FUNCTION public.notify_chat_message();

CREATE TRIGGER trg_notify_overtime_status AFTER UPDATE ON public.t_overtime_business_trips FOR EACH ROW EXECUTE FUNCTION public.notify_overtime_status_change();

CREATE TRIGGER trg_stamp_attendance BEFORE INSERT OR UPDATE ON public.t_attendance FOR EACH ROW EXECUTE FUNCTION public.stamp_attendance();

ALTER TABLE ONLY public.m_project_members
    ADD CONSTRAINT m_project_members_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.m_projects(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.m_project_members
    ADD CONSTRAINT m_project_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.m_projects
    ADD CONSTRAINT m_projects_status_id_fkey FOREIGN KEY (status_id) REFERENCES public.m_work_status(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.m_work_schedule
    ADD CONSTRAINT m_work_schedule_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.m_employees(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.m_roles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.project_type_assignment
    ADD CONSTRAINT project_type_assignment_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.m_projects(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.project_type_assignment
    ADD CONSTRAINT project_type_assignment_type_id_fkey FOREIGN KEY (type_id) REFERENCES public.m_project_types(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.t_attendance
    ADD CONSTRAINT t_attendance_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.t_attendance
    ADD CONSTRAINT t_attendance_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.t_audit_log
    ADD CONSTRAINT t_audit_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.t_chat_attachments
    ADD CONSTRAINT t_chat_attachments_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.t_chat_messages(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.t_chat_channel_reads
    ADD CONSTRAINT t_chat_channel_reads_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.t_chat_channels(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.t_chat_channel_reads
    ADD CONSTRAINT t_chat_channel_reads_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.t_chat_channels
    ADD CONSTRAINT t_chat_channels_dm_user_a_fkey FOREIGN KEY (dm_user_a) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.t_chat_channels
    ADD CONSTRAINT t_chat_channels_dm_user_b_fkey FOREIGN KEY (dm_user_b) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.t_chat_channels
    ADD CONSTRAINT t_chat_channels_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.m_projects(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.t_chat_message_reactions
    ADD CONSTRAINT t_chat_message_reactions_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.t_chat_messages(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.t_chat_message_reactions
    ADD CONSTRAINT t_chat_message_reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.t_chat_messages
    ADD CONSTRAINT t_chat_messages_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.t_chat_channels(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.t_chat_messages
    ADD CONSTRAINT t_chat_messages_pinned_by_fkey FOREIGN KEY (pinned_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.t_chat_messages
    ADD CONSTRAINT t_chat_messages_reply_to_id_fkey FOREIGN KEY (reply_to_id) REFERENCES public.t_chat_messages(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.t_chat_messages
    ADD CONSTRAINT t_chat_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.t_daily_tasks
    ADD CONSTRAINT t_daily_tasks_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.m_employees(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.t_daily_tasks
    ADD CONSTRAINT t_daily_tasks_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.m_projects(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.t_employee_rates
    ADD CONSTRAINT t_employee_rates_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.t_employee_rates
    ADD CONSTRAINT t_employee_rates_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.t_error_log
    ADD CONSTRAINT t_error_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.t_leave_requests
    ADD CONSTRAINT t_leave_requests_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.t_leave_requests
    ADD CONSTRAINT t_leave_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.t_notifications
    ADD CONSTRAINT t_notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.t_overtime_business_trips
    ADD CONSTRAINT t_overtime_business_trips_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.t_overtime_business_trips
    ADD CONSTRAINT t_overtime_business_trips_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.m_projects(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.t_overtime_business_trips
    ADD CONSTRAINT t_overtime_business_trips_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.t_payroll_lines
    ADD CONSTRAINT t_payroll_lines_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.t_payroll_runs(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.t_payroll_lines
    ADD CONSTRAINT t_payroll_lines_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.t_payroll_runs
    ADD CONSTRAINT t_payroll_runs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.t_payroll_runs
    ADD CONSTRAINT t_payroll_runs_finalized_by_fkey FOREIGN KEY (finalized_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.t_role_permissions
    ADD CONSTRAINT t_role_permissions_feature_id_fkey FOREIGN KEY (feature_id) REFERENCES public.m_features(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.t_role_permissions
    ADD CONSTRAINT t_role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.m_roles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.t_task_attachments
    ADD CONSTRAINT t_task_attachments_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.t_daily_tasks(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.t_task_attachments
    ADD CONSTRAINT t_task_attachments_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.t_task_comments
    ADD CONSTRAINT t_task_comments_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.t_daily_tasks(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.t_task_comments
    ADD CONSTRAINT t_task_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.t_user_access_override
    ADD CONSTRAINT t_user_access_override_feature_id_fkey FOREIGN KEY (feature_id) REFERENCES public.m_features(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.t_user_access_override
    ADD CONSTRAINT t_user_access_override_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE POLICY attachments_delete ON public.t_task_attachments FOR DELETE TO authenticated USING (((uploaded_by = auth.uid()) OR public.has_permission('master'::text, 'update'::text)));

CREATE POLICY attachments_insert ON public.t_task_attachments FOR INSERT TO authenticated WITH CHECK (public.has_permission('daily-report'::text, 'create'::text));

CREATE POLICY attachments_select ON public.t_task_attachments FOR SELECT TO authenticated USING (public.has_permission('daily-report'::text, 'read'::text));

CREATE POLICY attendance_delete ON public.t_attendance FOR DELETE TO authenticated USING ((public.has_permission('attendance'::text, 'delete'::text) AND (NOT public.period_is_locked(date))));

CREATE POLICY attendance_insert ON public.t_attendance FOR INSERT TO authenticated WITH CHECK ((((user_id = auth.uid()) AND (status = ANY (ARRAY['Hadir'::text, 'Izin'::text, 'Sakit'::text]))) OR public.has_permission('attendance'::text, 'create'::text)));

CREATE POLICY attendance_select ON public.t_attendance FOR SELECT TO authenticated USING (public.has_permission('attendance'::text, 'read'::text));

CREATE POLICY attendance_update ON public.t_attendance FOR UPDATE TO authenticated USING ((public.has_permission('attendance'::text, 'update'::text) AND (NOT public.period_is_locked(date)))) WITH CHECK ((public.has_permission('attendance'::text, 'update'::text) AND (NOT public.period_is_locked(date))));

CREATE POLICY audit_insert_own ON public.t_audit_log FOR INSERT TO authenticated WITH CHECK (((actor_id = auth.uid()) AND (entity_type <> ALL (ARRAY['user'::text, 'user_role'::text, 'role_permission'::text, 'access_override'::text, 'profile'::text]))));

CREATE POLICY audit_select_admin ON public.t_audit_log FOR SELECT TO authenticated USING (public.is_admin());

CREATE POLICY chat_attachments_insert ON public.t_chat_attachments FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.t_chat_messages m
  WHERE ((m.id = t_chat_attachments.message_id) AND (m.sender_id = auth.uid())))));

CREATE POLICY chat_attachments_select ON public.t_chat_attachments FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.t_chat_messages m
  WHERE ((m.id = t_chat_attachments.message_id) AND public.chat_user_can_read(m.channel_id, auth.uid())))));

CREATE POLICY chat_channels_insert_thread ON public.t_chat_channels FOR INSERT TO authenticated WITH CHECK (((type = 'project'::text) AND (name IS NOT NULL) AND public.is_admin() AND (EXISTS ( SELECT 1
   FROM public.m_projects
  WHERE (m_projects.id = t_chat_channels.project_id)))));

CREATE POLICY chat_channels_select ON public.t_chat_channels FOR SELECT TO authenticated USING (public.chat_user_can_read(id, auth.uid()));

CREATE POLICY chat_messages_delete ON public.t_chat_messages FOR DELETE TO authenticated USING ((sender_id = auth.uid()));

CREATE POLICY chat_messages_insert ON public.t_chat_messages FOR INSERT TO authenticated WITH CHECK (((sender_id = auth.uid()) AND public.chat_user_can_read(channel_id, auth.uid())));

CREATE POLICY chat_messages_select ON public.t_chat_messages FOR SELECT TO authenticated USING (public.chat_user_can_read(channel_id, auth.uid()));

CREATE POLICY chat_messages_update ON public.t_chat_messages FOR UPDATE TO authenticated USING (public.chat_user_can_read(channel_id, auth.uid())) WITH CHECK (public.chat_user_can_read(channel_id, auth.uid()));

CREATE POLICY chat_reactions_delete ON public.t_chat_message_reactions FOR DELETE TO authenticated USING ((user_id = auth.uid()));

CREATE POLICY chat_reactions_insert ON public.t_chat_message_reactions FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.t_chat_messages m
  WHERE ((m.id = t_chat_message_reactions.message_id) AND public.chat_user_can_read(m.channel_id, auth.uid()))))));

CREATE POLICY chat_reactions_select ON public.t_chat_message_reactions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.t_chat_messages m
  WHERE ((m.id = t_chat_message_reactions.message_id) AND public.chat_user_can_read(m.channel_id, auth.uid())))));

CREATE POLICY chat_reads_insert_own ON public.t_chat_channel_reads FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) AND public.chat_user_can_read(channel_id, auth.uid())));

CREATE POLICY chat_reads_select_own ON public.t_chat_channel_reads FOR SELECT TO authenticated USING ((user_id = auth.uid()));

CREATE POLICY chat_reads_update_own ON public.t_chat_channel_reads FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

CREATE POLICY comments_delete_own ON public.t_task_comments FOR DELETE TO authenticated USING (((user_id = auth.uid()) OR public.is_admin()));

CREATE POLICY comments_insert ON public.t_task_comments FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) AND public.has_permission('daily-report'::text, 'read'::text)));

CREATE POLICY comments_select ON public.t_task_comments FOR SELECT TO authenticated USING (public.has_permission('daily-report'::text, 'read'::text));

CREATE POLICY daily_tasks_delete ON public.t_daily_tasks FOR DELETE TO authenticated USING ((public.has_permission('daily-report'::text, 'delete'::text) AND ((employee_id = public.my_employee_id()) OR public.has_permission('master'::text, 'delete'::text))));

CREATE POLICY daily_tasks_insert ON public.t_daily_tasks FOR INSERT TO authenticated WITH CHECK ((public.has_permission('daily-report'::text, 'create'::text) AND ((employee_id = public.my_employee_id()) OR public.has_permission('master'::text, 'update'::text))));

CREATE POLICY daily_tasks_select ON public.t_daily_tasks FOR SELECT TO authenticated USING (public.has_permission('daily-report'::text, 'read'::text));

CREATE POLICY daily_tasks_update ON public.t_daily_tasks FOR UPDATE TO authenticated USING ((public.has_permission('daily-report'::text, 'update'::text) AND ((employee_id = public.my_employee_id()) OR public.has_permission('master'::text, 'update'::text)))) WITH CHECK ((public.has_permission('daily-report'::text, 'update'::text) AND ((employee_id = public.my_employee_id()) OR public.has_permission('master'::text, 'update'::text))));

CREATE POLICY employees_delete ON public.m_employees FOR DELETE TO authenticated USING (public.has_permission('master'::text, 'delete'::text));

CREATE POLICY employees_insert ON public.m_employees FOR INSERT TO authenticated WITH CHECK (public.has_permission('master'::text, 'create'::text));

CREATE POLICY employees_select ON public.m_employees FOR SELECT TO authenticated USING (true);

CREATE POLICY employees_update ON public.m_employees FOR UPDATE TO authenticated USING (public.has_permission('master'::text, 'update'::text)) WITH CHECK (public.has_permission('master'::text, 'update'::text));

CREATE POLICY error_log_select_superadmin ON public.t_error_log FOR SELECT TO authenticated USING (public.is_superadmin());

CREATE POLICY features_delete ON public.m_features FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY features_insert ON public.m_features FOR INSERT TO authenticated WITH CHECK (public.is_admin());

CREATE POLICY features_select ON public.m_features FOR SELECT TO authenticated USING (true);

CREATE POLICY features_update ON public.m_features FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY holidays_delete ON public.m_holidays FOR DELETE TO authenticated USING (public.has_permission('holidays'::text, 'delete'::text));

CREATE POLICY holidays_insert ON public.m_holidays FOR INSERT TO authenticated WITH CHECK (public.has_permission('holidays'::text, 'create'::text));

CREATE POLICY holidays_select ON public.m_holidays FOR SELECT TO authenticated USING (public.has_permission('holidays'::text, 'read'::text));

CREATE POLICY holidays_update ON public.m_holidays FOR UPDATE TO authenticated USING (public.has_permission('holidays'::text, 'update'::text)) WITH CHECK (public.has_permission('holidays'::text, 'update'::text));

CREATE POLICY leave_delete ON public.t_leave_requests FOR DELETE TO authenticated USING (((user_id = auth.uid()) AND (status = ANY (ARRAY['Pending'::text, 'Rejected'::text]))));

CREATE POLICY leave_insert ON public.t_leave_requests FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) AND (status = 'Pending'::text)));

CREATE POLICY leave_select ON public.t_leave_requests FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM (public.profiles p
     JOIN public.m_roles r ON ((r.id = p.role_id)))
  WHERE ((p.id = auth.uid()) AND (r.role_name = ANY (ARRAY['Admin'::text, 'Manager'::text])))))));

CREATE POLICY leave_update ON public.t_leave_requests FOR UPDATE TO authenticated USING ((((user_id = auth.uid()) AND (status = ANY (ARRAY['Pending'::text, 'Rejected'::text]))) OR ((user_id <> auth.uid()) AND (EXISTS ( SELECT 1
   FROM (public.profiles p
     JOIN public.m_roles r ON ((r.id = p.role_id)))
  WHERE ((p.id = auth.uid()) AND (r.role_name = ANY (ARRAY['Admin'::text, 'Manager'::text])))))))) WITH CHECK ((((user_id = auth.uid()) AND (status = 'Pending'::text)) OR ((user_id <> auth.uid()) AND ((approved_by IS NULL) OR (approved_by = auth.uid())) AND (EXISTS ( SELECT 1
   FROM (public.profiles p
     JOIN public.m_roles r ON ((r.id = p.role_id)))
  WHERE ((p.id = auth.uid()) AND (r.role_name = ANY (ARRAY['Admin'::text, 'Manager'::text]))))))));

ALTER TABLE public.m_employees ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.m_features ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.m_holidays ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.m_project_members ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.m_project_types ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.m_projects ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.m_roles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.m_work_schedule ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.m_work_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY notifications_select_own ON public.t_notifications FOR SELECT TO authenticated USING ((user_id = auth.uid()));

CREATE POLICY notifications_update_own ON public.t_notifications FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

CREATE POLICY overrides_delete ON public.t_user_access_override FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY overrides_insert ON public.t_user_access_override FOR INSERT TO authenticated WITH CHECK (public.is_admin());

CREATE POLICY overrides_select ON public.t_user_access_override FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.is_admin()));

CREATE POLICY overrides_update ON public.t_user_access_override FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY overtime_delete ON public.t_overtime_business_trips FOR DELETE TO authenticated USING (((user_id = auth.uid()) AND ((status)::text = ANY (ARRAY[('Pending'::character varying)::text, ('Rejected'::character varying)::text]))));

CREATE POLICY overtime_insert ON public.t_overtime_business_trips FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) AND ((status)::text = 'Pending'::text) AND (approved_by IS NULL) AND (rejection_note IS NULL)));

CREATE POLICY overtime_select ON public.t_overtime_business_trips FOR SELECT USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM (public.profiles p
     JOIN public.m_roles r ON ((r.id = p.role_id)))
  WHERE ((p.id = auth.uid()) AND (r.role_name = ANY (ARRAY['Admin'::text, 'Manager'::text])))))));

CREATE POLICY overtime_update ON public.t_overtime_business_trips FOR UPDATE TO authenticated USING ((((user_id = auth.uid()) AND ((status)::text = ANY (ARRAY[('Pending'::character varying)::text, ('Rejected'::character varying)::text]))) OR ((user_id <> auth.uid()) AND (EXISTS ( SELECT 1
   FROM (public.profiles p
     JOIN public.m_roles r ON ((r.id = p.role_id)))
  WHERE ((p.id = auth.uid()) AND (r.role_name = ANY (ARRAY['Admin'::text, 'Manager'::text])))))))) WITH CHECK ((((user_id = auth.uid()) AND ((status)::text = 'Pending'::text)) OR ((user_id <> auth.uid()) AND ((approved_by IS NULL) OR (approved_by = auth.uid())) AND (EXISTS ( SELECT 1
   FROM (public.profiles p
     JOIN public.m_roles r ON ((r.id = p.role_id)))
  WHERE ((p.id = auth.uid()) AND (r.role_name = ANY (ARRAY['Admin'::text, 'Manager'::text]))))))));

CREATE POLICY payroll_lines_delete ON public.t_payroll_lines FOR DELETE TO authenticated USING (public.is_payroll_officer());

CREATE POLICY payroll_lines_select ON public.t_payroll_lines FOR SELECT TO authenticated USING ((public.is_payroll_officer() OR ((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.t_payroll_runs r
  WHERE ((r.id = t_payroll_lines.run_id) AND (r.status = 'Finalized'::text)))))));

CREATE POLICY payroll_lines_update ON public.t_payroll_lines FOR UPDATE TO authenticated USING ((public.is_payroll_officer() AND (user_id <> auth.uid()))) WITH CHECK ((public.is_payroll_officer() AND (user_id <> auth.uid())));

CREATE POLICY payroll_runs_delete ON public.t_payroll_runs FOR DELETE TO authenticated USING (public.is_payroll_officer());

CREATE POLICY payroll_runs_select ON public.t_payroll_runs FOR SELECT TO authenticated USING ((public.is_payroll_officer() OR (status = 'Finalized'::text)));

CREATE POLICY payroll_runs_update ON public.t_payroll_runs FOR UPDATE TO authenticated USING (public.is_payroll_officer()) WITH CHECK (public.is_payroll_officer());

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_delete_admin ON public.profiles FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY profiles_insert_own ON public.profiles FOR INSERT TO authenticated WITH CHECK ((auth.uid() = id));

CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated USING (((NOT is_superadmin) OR (id = auth.uid()) OR public.is_superadmin()));

CREATE POLICY profiles_update_admin ON public.profiles FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));

CREATE POLICY project_members_delete ON public.m_project_members FOR DELETE TO authenticated USING ((public.has_permission('master'::text, 'create'::text) OR public.has_permission('master'::text, 'update'::text)));

CREATE POLICY project_members_insert ON public.m_project_members FOR INSERT TO authenticated WITH CHECK ((public.has_permission('master'::text, 'create'::text) OR public.has_permission('master'::text, 'update'::text)));

CREATE POLICY project_members_select ON public.m_project_members FOR SELECT TO authenticated USING (true);

ALTER TABLE public.project_type_assignment ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_types_delete ON public.m_project_types FOR DELETE TO authenticated USING (public.has_permission('master'::text, 'delete'::text));

CREATE POLICY project_types_insert ON public.m_project_types FOR INSERT TO authenticated WITH CHECK (public.has_permission('master'::text, 'create'::text));

CREATE POLICY project_types_select ON public.m_project_types FOR SELECT TO authenticated USING (true);

CREATE POLICY project_types_update ON public.m_project_types FOR UPDATE TO authenticated USING (public.has_permission('master'::text, 'update'::text)) WITH CHECK (public.has_permission('master'::text, 'update'::text));

CREATE POLICY projects_delete ON public.m_projects FOR DELETE TO authenticated USING (public.has_permission('master'::text, 'delete'::text));

CREATE POLICY projects_insert ON public.m_projects FOR INSERT TO authenticated WITH CHECK (public.has_permission('master'::text, 'create'::text));

CREATE POLICY projects_select ON public.m_projects FOR SELECT TO authenticated USING (true);

CREATE POLICY projects_update ON public.m_projects FOR UPDATE TO authenticated USING (public.has_permission('master'::text, 'update'::text)) WITH CHECK (public.has_permission('master'::text, 'update'::text));

CREATE POLICY pta_delete ON public.project_type_assignment FOR DELETE TO authenticated USING ((public.has_permission('master'::text, 'create'::text) OR public.has_permission('master'::text, 'update'::text)));

CREATE POLICY pta_insert ON public.project_type_assignment FOR INSERT TO authenticated WITH CHECK ((public.has_permission('master'::text, 'create'::text) OR public.has_permission('master'::text, 'update'::text)));

CREATE POLICY pta_select ON public.project_type_assignment FOR SELECT TO authenticated USING (true);

CREATE POLICY rates_insert ON public.t_employee_rates FOR INSERT TO authenticated WITH CHECK ((public.is_payroll_officer() AND (profile_id <> auth.uid())));

CREATE POLICY rates_select ON public.t_employee_rates FOR SELECT USING (((profile_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM (public.profiles p
     JOIN public.m_roles r ON ((r.id = p.role_id)))
  WHERE ((p.id = auth.uid()) AND (r.role_name = ANY (ARRAY['Admin'::text, 'Manager'::text])))))));

CREATE POLICY rates_update ON public.t_employee_rates FOR UPDATE TO authenticated USING ((public.is_payroll_officer() AND (profile_id <> auth.uid()))) WITH CHECK ((public.is_payroll_officer() AND (profile_id <> auth.uid())));

CREATE POLICY role_perms_delete ON public.t_role_permissions FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY role_perms_insert ON public.t_role_permissions FOR INSERT TO authenticated WITH CHECK (public.is_admin());

CREATE POLICY role_perms_select ON public.t_role_permissions FOR SELECT TO authenticated USING (true);

CREATE POLICY role_perms_update ON public.t_role_permissions FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY roles_delete ON public.m_roles FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY roles_insert ON public.m_roles FOR INSERT TO authenticated WITH CHECK (public.is_admin());

CREATE POLICY roles_select ON public.m_roles FOR SELECT TO authenticated USING (true);

CREATE POLICY roles_update ON public.m_roles FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

ALTER TABLE public.t_attendance ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.t_audit_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.t_chat_attachments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.t_chat_channel_reads ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.t_chat_channels ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.t_chat_message_reactions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.t_chat_messages ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.t_daily_tasks ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.t_employee_rates ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.t_error_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.t_leave_requests ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.t_notifications ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.t_overtime_business_trips ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.t_payroll_lines ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.t_payroll_runs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.t_role_permissions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.t_task_attachments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.t_task_comments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.t_user_access_override ENABLE ROW LEVEL SECURITY;

CREATE POLICY work_schedule_select ON public.m_work_schedule FOR SELECT TO authenticated USING (true);

CREATE POLICY work_schedule_update ON public.m_work_schedule FOR UPDATE TO authenticated USING (public.has_permission('attendance'::text, 'update'::text)) WITH CHECK (public.has_permission('attendance'::text, 'update'::text));

CREATE POLICY work_status_delete ON public.m_work_status FOR DELETE TO authenticated USING (public.has_permission('master'::text, 'delete'::text));

CREATE POLICY work_status_insert ON public.m_work_status FOR INSERT TO authenticated WITH CHECK (public.has_permission('master'::text, 'create'::text));

CREATE POLICY work_status_select ON public.m_work_status FOR SELECT TO authenticated USING (true);

CREATE POLICY work_status_update ON public.m_work_status FOR UPDATE TO authenticated USING (public.has_permission('master'::text, 'update'::text)) WITH CHECK (public.has_permission('master'::text, 'update'::text));

REVOKE EXECUTE ON FUNCTION public.ensure_default_admin() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER lock_demo_credentials BEFORE UPDATE ON auth.users FOR EACH ROW EXECUTE FUNCTION public.lock_demo_credentials();

ALTER PUBLICATION supabase_realtime ADD TABLE
  public.m_employees,
  public.m_holidays,
  public.m_project_types,
  public.m_projects,
  public.m_work_status,
  public.project_type_assignment,
  public.t_attendance,
  public.t_chat_attachments,
  public.t_chat_channels,
  public.t_chat_message_reactions,
  public.t_chat_messages,
  public.t_daily_tasks,
  public.t_leave_requests,
  public.t_notifications,
  public.t_overtime_business_trips,
  public.t_task_comments;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
  ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('task-attachments', 'task-attachments', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('chat-attachments', 'chat-attachments', false, 52428800, ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/*', 'audio/*', 'application/pdf',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/csv', 'application/zip', 'application/x-zip-compressed'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY avatars_public_read ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'avatars');
CREATE POLICY avatars_user_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (auth.uid())::text = (storage.foldername(name))[1]);
CREATE POLICY avatars_user_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (auth.uid())::text = (storage.foldername(name))[1]);
CREATE POLICY avatars_user_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (auth.uid())::text = (storage.foldername(name))[1]);
CREATE POLICY task_attachments_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'task-attachments' AND public.has_permission('daily-report', 'read'));
CREATE POLICY task_attachments_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'task-attachments' AND public.has_permission('daily-report', 'create'));
CREATE POLICY task_attachments_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'task-attachments' AND (owner_id = (auth.uid())::text OR public.has_permission('master', 'update')));
CREATE POLICY chat_attachments_storage_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'chat-attachments' AND public.chat_user_can_read(((storage.foldername(name))[1])::integer, auth.uid()));
CREATE POLICY chat_attachments_storage_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-attachments' AND public.chat_user_can_read(((storage.foldername(name))[1])::integer, auth.uid()));

INSERT INTO public.m_roles (id, role_name, rank) VALUES
  (1, 'Admin', 1),
  (2, 'Manager', 2),
  (3, 'Employee', 3);
SELECT setval('public.m_roles_id_seq', 3);

INSERT INTO public.m_features (id, feature_name, feature_key, icon_name, path) VALUES
  (1, 'Dashboard', 'dashboard', 'LayoutDashboard', '/'),
  (2, 'Daily Report', 'daily-report', 'ClipboardList', '/daily-report'),
  (3, 'Timeline', 'timeline', 'CalendarRange', '/timeline'),
  (4, 'Issue Log', 'issues', 'AlertOctagon', '/issues'),
  (5, 'Export Center', 'export', 'Download', '/export'),
  (6, 'Master Hub', 'master', 'Database', '/master'),
  (7, 'Overtime & Business Trip', 'overtime-business-trip', 'Clock', '/overtime'),
  (8, 'Work Calendar', 'holidays', 'CalendarDays', '/calendar'),
  (9, 'Attendance', 'attendance', 'CalendarCheck', '/attendance'),
  (10, 'Leave', 'leave', 'CalendarOff', '/leave'),
  (11, 'Payroll', 'payroll', 'Wallet', '/payroll');
SELECT setval('public.m_features_id_seq', 11);

INSERT INTO public.t_role_permissions (role_id, feature_id, can_create, can_read, can_update, can_delete)
SELECT r.id, f.id, p.c, p.r, p.u, p.d
FROM (VALUES
  ('Admin',    'dashboard',              true,  true,  true,  true),
  ('Admin',    'daily-report',           true,  true,  true,  true),
  ('Admin',    'timeline',               true,  true,  true,  true),
  ('Admin',    'issues',                 true,  true,  true,  true),
  ('Admin',    'export',                 true,  true,  true,  true),
  ('Admin',    'master',                 true,  true,  true,  true),
  ('Admin',    'overtime-business-trip', true,  true,  true,  true),
  ('Admin',    'holidays',               true,  true,  true,  true),
  ('Admin',    'attendance',             true,  true,  true,  true),
  ('Admin',    'leave',                  true,  true,  true,  true),
  ('Admin',    'payroll',                true,  true,  true,  true),
  ('Manager',  'dashboard',              true,  true,  true,  false),
  ('Manager',  'daily-report',           true,  true,  true,  false),
  ('Manager',  'timeline',               true,  true,  true,  false),
  ('Manager',  'issues',                 true,  true,  true,  false),
  ('Manager',  'export',                 true,  true,  true,  false),
  ('Manager',  'master',                 false, true,  false, false),
  ('Manager',  'overtime-business-trip', true,  true,  true,  false),
  ('Manager',  'holidays',               false, true,  false, false),
  ('Manager',  'attendance',             false, true,  false, false),
  ('Manager',  'leave',                  true,  true,  true,  false),
  ('Manager',  'payroll',                true,  true,  true,  false),
  ('Employee', 'dashboard',              false, true,  false, false),
  ('Employee', 'daily-report',           true,  true,  true,  false),
  ('Employee', 'timeline',               false, true,  false, false),
  ('Employee', 'issues',                 false, true,  false, false),
  ('Employee', 'export',                 false, false, false, false),
  ('Employee', 'master',                 false, false, false, false),
  ('Employee', 'overtime-business-trip', false, true,  false, false),
  ('Employee', 'holidays',               false, true,  false, false),
  ('Employee', 'attendance',             false, true,  false, false),
  ('Employee', 'leave',                  true,  true,  false, false),
  ('Employee', 'payroll',                false, true,  false, false)
) AS p(role_name, feature_key, c, r, u, d)
JOIN public.m_roles r ON r.role_name = p.role_name
JOIN public.m_features f ON f.feature_key = p.feature_key;

INSERT INTO public.m_work_status (status_name) VALUES
  ('MOU'), ('Requirement'), ('Cancel'), ('Client Review'), ('Quotation'), ('Done'), ('Development');

INSERT INTO public.m_project_types (type_name) VALUES
  ('Software'), ('Hardware'), ('Data Collection'), ('Mapping');

INSERT INTO public.m_work_schedule (clock_in_time, clock_out_time, late_tolerance_minutes, work_days, timezone, company_name)
VALUES ('08:00', '17:00', 0, '{1,2,3,4,5}', 'Asia/Jakarta', 'WorkDesk');

INSERT INTO public.t_chat_channels (type) VALUES ('general');

SELECT public.ensure_default_admin();
