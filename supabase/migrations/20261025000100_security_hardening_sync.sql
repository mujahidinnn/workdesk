-- Replays security fixes already folded into 20260919000000_init.sql so existing
-- databases get them without a reset. Idempotent on fresh databases.

-- Overtime is filed as Pending; only an approver moves it on.
DROP POLICY IF EXISTS overtime_insert ON public.t_overtime_business_trips;
CREATE POLICY overtime_insert ON public.t_overtime_business_trips FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) AND ((status)::text = 'Pending'::text) AND (approved_by IS NULL) AND (rejection_note IS NULL)));

-- Payroll officers don't set their own pay.
DROP POLICY IF EXISTS rates_insert ON public.t_employee_rates;
CREATE POLICY rates_insert ON public.t_employee_rates FOR INSERT TO authenticated WITH CHECK ((public.is_payroll_officer() AND (profile_id <> auth.uid())));
DROP POLICY IF EXISTS rates_update ON public.t_employee_rates;
CREATE POLICY rates_update ON public.t_employee_rates FOR UPDATE TO authenticated USING ((public.is_payroll_officer() AND (profile_id <> auth.uid()))) WITH CHECK ((public.is_payroll_officer() AND (profile_id <> auth.uid())));
DROP POLICY IF EXISTS payroll_lines_update ON public.t_payroll_lines;
CREATE POLICY payroll_lines_update ON public.t_payroll_lines FOR UPDATE TO authenticated USING ((public.is_payroll_officer() AND (user_id <> auth.uid()))) WITH CHECK ((public.is_payroll_officer() AND (user_id <> auth.uid())));

-- Self check-in is limited to what the gate modal offers.
DROP POLICY IF EXISTS attendance_insert ON public.t_attendance;
CREATE POLICY attendance_insert ON public.t_attendance FOR INSERT TO authenticated WITH CHECK ((((user_id = auth.uid()) AND (status = ANY (ARRAY['Hadir'::text, 'Izin'::text, 'Sakit'::text]))) OR public.has_permission('attendance'::text, 'create'::text)));

-- Access changes are audited by triggers and edge functions, not the client.
DROP POLICY IF EXISTS audit_insert_own ON public.t_audit_log;
CREATE POLICY audit_insert_own ON public.t_audit_log FOR INSERT TO authenticated WITH CHECK (((actor_id = auth.uid()) AND (entity_type <> ALL (ARRAY['user'::text, 'user_role'::text, 'role_permission'::text, 'access_override'::text, 'profile'::text]))));

-- Task attachments are deleted by their uploader or a master editor.
DROP POLICY IF EXISTS attachments_delete ON public.t_task_attachments;
CREATE POLICY attachments_delete ON public.t_task_attachments FOR DELETE TO authenticated USING (((uploaded_by = auth.uid()) OR public.has_permission('master'::text, 'update'::text)));
DROP POLICY IF EXISTS task_attachments_delete ON storage.objects;
CREATE POLICY task_attachments_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'task-attachments' AND (owner_id = (auth.uid())::text OR public.has_permission('master', 'update')));

-- No SVG in chat uploads.
UPDATE storage.buckets SET allowed_mime_types = ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/*', 'audio/*', 'application/pdf',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/csv', 'application/zip', 'application/x-zip-compressed']
 WHERE id = 'chat-attachments';

-- E-mail addresses are for admins only.
CREATE OR REPLACE FUNCTION public.get_users_with_email() RETURNS TABLE(id uuid, full_name text, email text, role_id integer, role_name text, employee_id integer, employee_name text, employee_role_title text, avatar_url text, created_at timestamp with time zone, banned_until timestamp with time zone, is_superadmin boolean)
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
CREATE OR REPLACE FUNCTION public.guard_approval_edit() RETURNS trigger
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
DROP TRIGGER IF EXISTS trg_guard_approval_edit ON public.t_leave_requests;
CREATE TRIGGER trg_guard_approval_edit BEFORE UPDATE ON public.t_leave_requests FOR EACH ROW EXECUTE FUNCTION public.guard_approval_edit();
DROP TRIGGER IF EXISTS trg_guard_approval_edit ON public.t_overtime_business_trips;
CREATE TRIGGER trg_guard_approval_edit BEFORE UPDATE ON public.t_overtime_business_trips FOR EACH ROW EXECUTE FUNCTION public.guard_approval_edit();

-- Demo logins are public, so Auth API changes to them are refused. ensure_default_admin
-- and the seed run as the function owner, so they can still reset these rows.
CREATE OR REPLACE FUNCTION public.lock_demo_credentials() RETURNS trigger
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
DROP TRIGGER IF EXISTS lock_demo_credentials ON auth.users;
CREATE TRIGGER lock_demo_credentials BEFORE UPDATE ON auth.users FOR EACH ROW EXECUTE FUNCTION public.lock_demo_credentials();
