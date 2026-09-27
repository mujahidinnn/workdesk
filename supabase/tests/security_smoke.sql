-- Smoke test for the rules in 20261003000000_security_and_mvp_hardening.sql.
-- Nothing is rolled back, so run it on a throwaway DB with every migration applied:
--   psql -d <scratch> -v ON_ERROR_STOP=1 -f supabase/tests/security_smoke.sql

\set ON_ERROR_STOP on

-- Supabase grants these in production; a bare Postgres does not.
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'admin@test.local'),
  ('00000000-0000-0000-0000-0000000000e1', 'emp1@test.local'),
  ('00000000-0000-0000-0000-0000000000e2', 'emp2@test.local'),
  ('00000000-0000-0000-0000-0000000000e3', 'emp3@test.local');

INSERT INTO m_employees (id, full_name, role_title) VALUES
  (9001, 'Emp One', 'Dev'), (9002, 'Emp Two', 'Dev');

-- The role guard refuses role changes with no session, so fixtures act as the
-- service role (like an edge function). Profiles already exist via handle_new_user().
SELECT set_config('test.role', 'service_role', false);
UPDATE profiles SET role_id = (SELECT id FROM m_roles WHERE role_name = 'Admin')
 WHERE id = '00000000-0000-0000-0000-0000000000a1';
UPDATE profiles SET employee_id = 9001
 WHERE id = '00000000-0000-0000-0000-0000000000e1';
UPDATE profiles SET employee_id = 9002
 WHERE id = '00000000-0000-0000-0000-0000000000e2';

-- e3 has no profile row (handle_new_user() swallows its errors): the old escalation path.
DELETE FROM profiles WHERE id = '00000000-0000-0000-0000-0000000000e3';

SELECT set_config('test.role', '', false);

INSERT INTO t_employee_rates (profile_id, base_salary, overtime_rate, local_trip_rate, out_of_town_rate)
VALUES ('00000000-0000-0000-0000-0000000000e1', 5000000, 25000, 150000, 400000);

INSERT INTO m_projects (id, project_code, project_name, client)
VALUES (9001, 'P-TEST', 'Test Project', 'ACME');

INSERT INTO t_daily_tasks (id, date, employee_id, project_id, task_desc)
VALUES (9001, CURRENT_DATE, 9001, 9001, 'Emp One task');

INSERT INTO m_work_schedule (id, clock_in_time, clock_out_time, late_tolerance_minutes)
VALUES (1, '08:00', '17:00', 15)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION pg_temp.act_as(p_uid TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('test.uid', p_uid, false);
  PERFORM set_config('test.role', 'authenticated', false);
END;
$$;

DO $$
DECLARE
  v_count INT;
  v_status TEXT;
  v_date DATE;
  v_clock TIME;
  v_hours NUMERIC;
  v_money NUMERIC;
BEGIN
  -- 1. An employee cannot touch someone else's daily report
  SET LOCAL ROLE authenticated;
  PERFORM set_config('test.uid', '00000000-0000-0000-0000-0000000000e2', true);
  PERFORM set_config('test.role', 'authenticated', true);

  UPDATE t_daily_tasks SET task_desc = 'hijacked' WHERE id = 9001;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL 1a: employee updated another employee''s task';
  END IF;

  -- Their own row is fine.
  INSERT INTO t_daily_tasks (date, employee_id, project_id, task_desc)
  VALUES (CURRENT_DATE, 9002, 9001, 'Emp Two task');

  BEGIN
    INSERT INTO t_daily_tasks (date, employee_id, project_id, task_desc)
    VALUES (CURRENT_DATE, 9001, 9001, 'posted as someone else');
    RAISE EXCEPTION 'FAIL 1b: employee posted a task as another employee';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;  -- expected
  END;

  RESET ROLE;

  -- 2. A profile insert by a signed-in user cannot grant Admin
  SET LOCAL ROLE authenticated;
  PERFORM set_config('test.uid', '00000000-0000-0000-0000-0000000000e3', true);

  INSERT INTO profiles (id, full_name, role_id, employee_id)
  VALUES ('00000000-0000-0000-0000-0000000000e3', 'Sneaky',
          (SELECT id FROM m_roles WHERE role_name = 'Admin'), 9001);

  RESET ROLE;
  SELECT r.role_name INTO v_status
  FROM profiles p JOIN m_roles r ON r.id = p.role_id
  WHERE p.id = '00000000-0000-0000-0000-0000000000e3';
  IF v_status <> 'Employee' THEN
    RAISE EXCEPTION 'FAIL 2a: self-inserted profile kept role %', v_status;
  END IF;

  SELECT employee_id INTO v_count FROM profiles
  WHERE id = '00000000-0000-0000-0000-0000000000e3';
  IF v_count IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 2b: self-inserted profile linked itself to an employee';
  END IF;

  -- 3. An employee cannot re-point their profile at another employee
  SET LOCAL ROLE authenticated;
  PERFORM set_config('test.uid', '00000000-0000-0000-0000-0000000000e1', true);
  BEGIN
    UPDATE profiles SET employee_id = 9002
    WHERE id = '00000000-0000-0000-0000-0000000000e1';
    RAISE EXCEPTION 'FAIL 3: employee re-linked their profile';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL 3%' THEN RAISE; END IF;  -- expected guard message
  END;
  RESET ROLE;

  -- 4. Self check-in is stamped by the server, not the client
  SET LOCAL ROLE authenticated;
  PERFORM set_config('test.uid', '00000000-0000-0000-0000-0000000000e1', true);

  INSERT INTO t_attendance (user_id, date, status, clock_in)
  VALUES ('00000000-0000-0000-0000-0000000000e1', CURRENT_DATE - 30, 'Hadir', '03:00');

  RESET ROLE;
  SELECT date, clock_in INTO v_date, v_clock FROM t_attendance
  WHERE user_id = '00000000-0000-0000-0000-0000000000e1';
  IF v_date <> company_today() THEN
    RAISE EXCEPTION 'FAIL 4a: back-dated check-in was accepted (%)', v_date;
  END IF;
  IF v_clock = '03:00' THEN
    RAISE EXCEPTION 'FAIL 4b: the device clock was trusted';
  END IF;

  -- Checking out in the same second is refused with a readable message.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('test.uid', '00000000-0000-0000-0000-0000000000e1', true);
  BEGIN
    PERFORM attendance_check_out();
    RAISE EXCEPTION 'FAIL 4c: a zero length day was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL 4c%' THEN RAISE; END IF;  -- expected guard message
  END;
  RESET ROLE;

  -- After a real working day, check-out closes the row.
  UPDATE t_attendance SET clock_in = '08:00'
   WHERE user_id = '00000000-0000-0000-0000-0000000000e1';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('test.uid', '00000000-0000-0000-0000-0000000000e1', true);
  PERFORM attendance_check_out();
  RESET ROLE;

  SELECT clock_out INTO v_clock FROM t_attendance
  WHERE user_id = '00000000-0000-0000-0000-0000000000e1';
  IF v_clock IS NULL THEN
    RAISE EXCEPTION 'FAIL 4d: check-out did not stamp clock_out';
  END IF;

  -- 5. Overtime cannot be approved by the person who filed it
  INSERT INTO t_overtime_business_trips
    (id, user_id, type, date, start_time, end_time, activity_description, duration_hours)
  VALUES (9001, '00000000-0000-0000-0000-0000000000a1', 'Overtime', CURRENT_DATE,
          '18:00', '20:00', 'own overtime', 2);

  SET LOCAL ROLE authenticated;
  PERFORM set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', true);
  BEGIN
    UPDATE t_overtime_business_trips
       SET status = 'Approved', approved_by = '00000000-0000-0000-0000-0000000000a1'
     WHERE id = 9001;
    RAISE EXCEPTION 'FAIL 5: an admin approved their own overtime';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;  -- expected: the row fails the policy's WITH CHECK
  END;
  RESET ROLE;

  -- 5b. A rejected request can be resubmitted, an approved one is locked for its owner.
  UPDATE t_overtime_business_trips SET status = 'Rejected',
         rejection_note = 'not this month', approved_by = NULL
   WHERE id = 9001;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', true);
  UPDATE t_overtime_business_trips
     SET status = 'Pending', rejection_note = NULL, activity_description = 'fixed'
   WHERE id = 9001;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RESET ROLE;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL 5b: a rejected request could not be resubmitted';
  END IF;

  UPDATE t_overtime_business_trips SET status = 'Approved' WHERE id = 9001;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', true);
  UPDATE t_overtime_business_trips SET activity_description = 'sneaky edit'
   WHERE id = 9001;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RESET ROLE;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL 5c: an approved request was edited by its owner';
  END IF;

  -- 6. Hours and money come from the server, not the form
  INSERT INTO t_overtime_business_trips
    (id, user_id, type, date, start_time, end_time, activity_description,
     duration_hours, daily_allowance)
  VALUES (9002, '00000000-0000-0000-0000-0000000000e1', 'Overtime', CURRENT_DATE,
          '18:00', '20:00', 'two hours, claimed as 99', 99, 99999999);

  SELECT duration_hours INTO v_hours FROM t_overtime_business_trips WHERE id = 9002;
  IF v_hours <> 2 THEN
    RAISE EXCEPTION 'FAIL 6a: stored % hours instead of the computed 2', v_hours;
  END IF;

  SELECT daily_allowance INTO v_money FROM t_overtime_business_trips WHERE id = 9002;
  IF v_money <> 50000 THEN
    RAISE EXCEPTION 'FAIL 6b: pay was % instead of 2 hours times the 25000 rate', v_money;
  END IF;

  -- A trip ignores the hourly rate and takes the flat one.
  INSERT INTO t_overtime_business_trips
    (id, user_id, type, date, activity_description, daily_allowance)
  VALUES (9003, '00000000-0000-0000-0000-0000000000e1', 'BusinessTrip_OutOfTown',
          CURRENT_DATE, 'client site', 1);

  SELECT daily_allowance INTO v_money FROM t_overtime_business_trips WHERE id = 9003;
  IF v_money <> 400000 THEN
    RAISE EXCEPTION 'FAIL 6c: trip allowance was % instead of the 400000 rate', v_money;
  END IF;

  -- 6d. An overnight shift is four hours, a typo is still refused
  INSERT INTO t_overtime_business_trips
    (id, user_id, type, date, end_date, start_time, end_time, activity_description)
  VALUES (9004, '00000000-0000-0000-0000-0000000000e1', 'Overtime', CURRENT_DATE,
          CURRENT_DATE + 1, '22:00', '02:00', 'overnight release');

  SELECT duration_hours INTO v_hours FROM t_overtime_business_trips WHERE id = 9004;
  IF v_hours <> 4 THEN
    RAISE EXCEPTION 'FAIL 6d: overnight shift came out as % hours', v_hours;
  END IF;

  BEGIN
    INSERT INTO t_overtime_business_trips
      (user_id, type, date, start_time, end_time, activity_description)
    VALUES ('00000000-0000-0000-0000-0000000000e1', 'Overtime', CURRENT_DATE,
            '18:00', '08:00', 'typo, not marked overnight');
    RAISE EXCEPTION 'FAIL 6e: a same day shift ending before it started was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;  -- expected
  END;

  BEGIN
    INSERT INTO t_overtime_business_trips
      (user_id, type, date, end_date, start_time, end_time, activity_description)
    VALUES ('00000000-0000-0000-0000-0000000000e1', 'Overtime', CURRENT_DATE,
            CURRENT_DATE + 5, '22:00', '02:00', 'five nights');
    RAISE EXCEPTION 'FAIL 6f: a shift spanning five days was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;  -- expected
  END;

  -- 7. Approving leave writes the attendance rows
  INSERT INTO t_leave_requests (id, user_id, type, start_date, end_date, reason)
  VALUES (9001, '00000000-0000-0000-0000-0000000000e2', 'Cuti',
          CURRENT_DATE + 7, CURRENT_DATE + 13, 'family');  -- 7 days: always spans a workday

  UPDATE t_leave_requests
     SET status = 'Approved', approved_by = '00000000-0000-0000-0000-0000000000a1'
   WHERE id = 9001;

  SELECT COUNT(*) INTO v_count FROM t_attendance
  WHERE user_id = '00000000-0000-0000-0000-0000000000e2' AND status = 'Cuti';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'FAIL 7a: approved leave wrote no attendance rows';
  END IF;

  SELECT COUNT(*) INTO v_count FROM t_notifications
  WHERE user_id = '00000000-0000-0000-0000-0000000000e2';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'FAIL 7b: approved leave sent no notification';
  END IF;

  -- 7c. Resubmitting does not fire a decision notification
  SELECT COUNT(*) INTO v_count FROM t_notifications
  WHERE user_id = '00000000-0000-0000-0000-0000000000e2';

  UPDATE t_leave_requests SET status = 'Rejected', rejection_note = 'no' WHERE id = 9001;
  UPDATE t_leave_requests SET status = 'Pending', rejection_note = NULL WHERE id = 9001;

  IF (SELECT COUNT(*) FROM t_notifications
      WHERE user_id = '00000000-0000-0000-0000-0000000000e2') <> v_count + 1 THEN
    RAISE EXCEPTION 'FAIL 7c: resubmitting a leave request sent a decision notice';
  END IF;

  -- 8. A closed period refuses further edits
  UPDATE m_work_schedule SET locked_until = CURRENT_DATE + 30;
  BEGIN
    INSERT INTO t_overtime_business_trips
      (user_id, type, date, start_time, end_time, activity_description, duration_hours)
    VALUES ('00000000-0000-0000-0000-0000000000e1', 'Overtime', CURRENT_DATE,
            '18:00', '20:00', 'in a closed month', 2);
    RAISE EXCEPTION 'FAIL 8: a closed period still accepted a new row';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL 8%' THEN RAISE; END IF;  -- expected guard message
  END;
  UPDATE m_work_schedule SET locked_until = NULL;

  -- 9. The staff directory hides e-mail from non-admins
  SET LOCAL ROLE authenticated;
  PERFORM set_config('test.uid', '00000000-0000-0000-0000-0000000000e1', true);
  SELECT COUNT(*) INTO v_count FROM get_users_with_email() WHERE email <> '';
  RESET ROLE;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL 9a: an employee read colleagues'' e-mail addresses';
  END IF;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', true);
  SELECT COUNT(*) INTO v_count FROM get_users_with_email() WHERE email <> '';
  RESET ROLE;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'FAIL 9b: an admin can no longer read e-mail addresses';
  END IF;

  -- 10. Chat guard: text is the sender's, pin is the channel's
  -- Project 9001 got its chat channel from the create-project trigger.
  INSERT INTO m_project_members (project_id, user_id) VALUES
    (9001, '00000000-0000-0000-0000-0000000000e1'),
    (9001, '00000000-0000-0000-0000-0000000000e2');

  INSERT INTO t_chat_messages (id, channel_id, sender_id, body)
  VALUES (9001, (SELECT id FROM t_chat_channels WHERE project_id = 9001),
          '00000000-0000-0000-0000-0000000000e1', 'original'),
         (9002, (SELECT id FROM t_chat_channels WHERE type = 'general'),
          '00000000-0000-0000-0000-0000000000e1', 'announcement');

  SET LOCAL ROLE authenticated;
  PERFORM set_config('test.uid', '00000000-0000-0000-0000-0000000000e2', true);
  -- e2 is in the project but did not send it: the pin must move, the body must not.
  UPDATE t_chat_messages
     SET body = 'hijacked', pinned_at = '2000-01-01', channel_id = 9999
   WHERE id = 9001;
  RESET ROLE;

  SELECT body INTO v_status FROM t_chat_messages WHERE id = 9001;
  IF v_status <> 'original' THEN
    RAISE EXCEPTION 'FAIL 10a: a non-sender rewrote someone else''s message';
  END IF;

  SELECT COUNT(*) INTO v_count FROM t_chat_messages
  WHERE id = 9001
    AND pinned_by = '00000000-0000-0000-0000-0000000000e2'
    AND pinned_at > '2020-01-01'
    AND edited_at IS NULL;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL 10b: pin was not stamped as (me, now), or an edit leaked';
  END IF;

  -- The sender's own edit goes through and gets marked as edited.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('test.uid', '00000000-0000-0000-0000-0000000000e1', true);
  UPDATE t_chat_messages SET body = 'fixed typo' WHERE id = 9001;
  RESET ROLE;

  SELECT COUNT(*) INTO v_count FROM t_chat_messages
  WHERE id = 9001 AND body = 'fixed typo' AND edited_at IS NOT NULL;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL 10c: the sender could not edit, or edited_at went unstamped';
  END IF;

  -- 10d. Pinning in General is an admin's call, not any employee's
  SET LOCAL ROLE authenticated;
  PERFORM set_config('test.uid', '00000000-0000-0000-0000-0000000000e1', true);
  BEGIN
    UPDATE t_chat_messages SET pinned_at = NOW() WHERE id = 9002;
    RESET ROLE;
    RAISE EXCEPTION 'FAIL 10d: an employee pinned a message in General';
  EXCEPTION WHEN raise_exception THEN
    RESET ROLE;
    IF SQLERRM LIKE 'FAIL 10d%' THEN RAISE; END IF;  -- expected guard message
  END;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', true);
  UPDATE t_chat_messages SET pinned_at = NOW() WHERE id = 9002;
  RESET ROLE;

  SELECT COUNT(*) INTO v_count FROM t_chat_messages
  WHERE id = 9002 AND pinned_by = '00000000-0000-0000-0000-0000000000a1';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL 10e: an admin can no longer pin in General';
  END IF;

  -- 11. Approval workflow and pay can't be self-served
  SET LOCAL ROLE authenticated;
  PERFORM set_config('test.uid', '00000000-0000-0000-0000-0000000000e1', true);
  PERFORM set_config('test.role', 'authenticated', true);
  BEGIN
    INSERT INTO t_overtime_business_trips (user_id, type, date, start_time, end_time, activity_description, status)
    VALUES ('00000000-0000-0000-0000-0000000000e1', 'Overtime', CURRENT_DATE, '18:00', '20:00', 'x', 'Approved');
    RESET ROLE;
    RAISE EXCEPTION 'FAIL 11a: an employee filed overtime as already approved';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
  END;

  SET LOCAL ROLE authenticated;
  INSERT INTO t_overtime_business_trips (id, user_id, type, date, start_time, end_time, activity_description)
  VALUES (9011, '00000000-0000-0000-0000-0000000000e1', 'Overtime', CURRENT_DATE, '18:00', '20:00', 'x');
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', true);
  BEGIN
    UPDATE t_overtime_business_trips SET end_time = '23:00', status = 'Approved' WHERE id = 9011;
    RESET ROLE;
    RAISE EXCEPTION 'FAIL 11b: an approver rewrote the hours of a request';
  EXCEPTION WHEN raise_exception THEN
    RESET ROLE;
    IF SQLERRM LIKE 'FAIL 11b%' THEN RAISE; END IF;  -- expected guard message
  END;

  SET LOCAL ROLE authenticated;
  UPDATE t_overtime_business_trips SET status = 'Approved' WHERE id = 9011;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RESET ROLE;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL 11c: an admin can no longer approve overtime';
  END IF;

  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO t_employee_rates (profile_id, base_salary)
    VALUES ('00000000-0000-0000-0000-0000000000a1', 99999999);
    RESET ROLE;
    RAISE EXCEPTION 'FAIL 11d: a payroll officer set their own salary';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
  END;

  RAISE NOTICE 'ALL CHECKS PASSED';
END;
$$;
