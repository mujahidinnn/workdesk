-- Smoke test for the payroll rules in 20261007000000_add_payroll_runs.sql.
-- Commits its fixtures, so run only on a throwaway DB with all migrations applied:
--   psql -d <scratch> -v ON_ERROR_STOP=1 -f supabase/tests/payroll_smoke.sql

\set ON_ERROR_STOP on

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'payroll-admin@test.local'),
  ('00000000-0000-0000-0000-0000000000e1', 'payroll-emp1@test.local'),
  ('00000000-0000-0000-0000-0000000000e2', 'payroll-emp2@test.local')
ON CONFLICT DO NOTHING;

-- The role guard refuses role changes without a session, so act as service_role
-- (profiles already exist via handle_new_user()).
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);

UPDATE profiles SET role_id = (SELECT id FROM m_roles WHERE role_name = 'Admin'),
                    full_name = 'Payroll Admin'
 WHERE id = '00000000-0000-0000-0000-0000000000a1';
UPDATE profiles SET role_id = (SELECT id FROM m_roles WHERE role_name = 'Employee'),
                    full_name = 'Emp One'
 WHERE id = '00000000-0000-0000-0000-0000000000e1';
UPDATE profiles SET role_id = (SELECT id FROM m_roles WHERE role_name = 'Employee'),
                    full_name = 'Emp Two'
 WHERE id = '00000000-0000-0000-0000-0000000000e2';

SELECT set_config('request.jwt.claims', '', false);

INSERT INTO t_employee_rates (profile_id, base_salary, overtime_rate, local_trip_rate, out_of_town_rate)
VALUES
  ('00000000-0000-0000-0000-0000000000e1', 8000000, 50000, 100000, 300000),
  ('00000000-0000-0000-0000-0000000000e2', 6000000, 40000,  80000, 250000);

-- emp1: approved work plus rejected/pending rows that must not count. emp2: no work.
INSERT INTO t_overtime_business_trips
  (user_id, type, date, start_time, end_time, activity_description, status)
VALUES
  ('00000000-0000-0000-0000-0000000000e1', 'Overtime', '2026-03-05', '18:00', '21:00', 'ot approved', 'Approved'),
  ('00000000-0000-0000-0000-0000000000e1', 'Overtime', '2026-03-06', '18:00', '20:00', 'ot approved', 'Approved'),
  ('00000000-0000-0000-0000-0000000000e1', 'Overtime', '2026-03-07', '18:00', '23:00', 'ot rejected', 'Rejected'),
  ('00000000-0000-0000-0000-0000000000e1', 'Overtime', '2026-03-08', '18:00', '23:00', 'ot pending',  'Pending'),
  ('00000000-0000-0000-0000-0000000000e1', 'BusinessTrip_Local', '2026-03-09', NULL, NULL, 'trip', 'Approved'),
  -- A different month, so the period boundary is exercised.
  ('00000000-0000-0000-0000-0000000000e1', 'Overtime', '2026-04-01', '18:00', '22:00', 'next month', 'Approved');

CREATE OR REPLACE FUNCTION pg_temp.act_as(p_uid TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::TEXT, true);
END;
$$;

DO $$
DECLARE
  v_run_id  INT;
  v_line    t_payroll_lines%ROWTYPE;
  v_count   INT;
  v_net     NUMERIC;
  v_status  TEXT;
  v_paid_at TIMESTAMPTZ;
BEGIN
  -- 1. An employee cannot open a payroll run
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
  BEGIN
    PERFORM generate_payroll_run('2026-03-01');
    RAISE EXCEPTION 'FAIL 1: an employee opened a payroll run';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL 1%' THEN RAISE; END IF;
  END;
  RESET ROLE;

  -- 2. The admin's run counts approved rows only, inside the month
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
  v_run_id := generate_payroll_run('2026-03-01');

  SELECT * INTO v_line FROM t_payroll_lines
   WHERE run_id = v_run_id AND user_id = '00000000-0000-0000-0000-0000000000e1';

  IF v_line.overtime_hours <> 5 THEN
    RAISE EXCEPTION 'FAIL 2a: overtime hours were % not 5', v_line.overtime_hours;
  END IF;
  IF v_line.overtime_pay <> 250000 THEN
    RAISE EXCEPTION 'FAIL 2b: overtime pay was % not 250000', v_line.overtime_pay;
  END IF;
  IF v_line.local_trip_days <> 1 OR v_line.local_trip_pay <> 100000 THEN
    RAISE EXCEPTION 'FAIL 2c: local trip was % days / %', v_line.local_trip_days, v_line.local_trip_pay;
  END IF;
  IF v_line.gross <> 8350000 THEN
    RAISE EXCEPTION 'FAIL 2d: gross was % not 8350000', v_line.gross;
  END IF;
  IF v_line.net <> v_line.gross THEN
    RAISE EXCEPTION 'FAIL 2e: net differs from gross with no deductions';
  END IF;

  -- 3. Someone with a rate but no work still gets a line
  SELECT COUNT(*) INTO v_count FROM t_payroll_lines
   WHERE run_id = v_run_id AND user_id = '00000000-0000-0000-0000-0000000000e2';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL 3: an employee with no overtime dropped out of the run';
  END IF;

  -- 4. Deductions are optional, and bounded by what was earned
  UPDATE t_payroll_lines SET pph21 = 200000, bpjs = 150000
   WHERE run_id = v_run_id AND user_id = '00000000-0000-0000-0000-0000000000e1';
  SELECT net INTO v_net FROM t_payroll_lines
   WHERE run_id = v_run_id AND user_id = '00000000-0000-0000-0000-0000000000e1';
  IF v_net <> 8000000 THEN
    RAISE EXCEPTION 'FAIL 4a: net after deductions was % not 8000000', v_net;
  END IF;

  BEGIN
    UPDATE t_payroll_lines SET other_deduction = 99000000
     WHERE run_id = v_run_id AND user_id = '00000000-0000-0000-0000-0000000000e1';
    RAISE EXCEPTION 'FAIL 4b: a deduction larger than the earnings was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  -- 5. Regenerating restates earnings and keeps the deductions
  PERFORM generate_payroll_run('2026-03-01');
  SELECT * INTO v_line FROM t_payroll_lines
   WHERE run_id = v_run_id AND user_id = '00000000-0000-0000-0000-0000000000e1';
  IF v_line.pph21 <> 200000 OR v_line.bpjs <> 150000 THEN
    RAISE EXCEPTION 'FAIL 5a: regenerating wiped the deductions';
  END IF;
  IF v_line.gross <> 8350000 THEN
    RAISE EXCEPTION 'FAIL 5b: regenerating changed the gross to %', v_line.gross;
  END IF;
  SELECT COUNT(*) INTO v_count FROM t_payroll_lines WHERE run_id = v_run_id;
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'FAIL 5c: regenerating duplicated lines, % rows', v_count;
  END IF;

  -- 6. A draft is nobody's payslip yet
  PERFORM pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
  SELECT COUNT(*) INTO v_count FROM t_payroll_lines;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL 6: an employee read a draft payroll line';
  END IF;

  -- 7. Finalizing freezes the money
  PERFORM pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
  UPDATE t_payroll_runs SET status = 'Finalized' WHERE id = v_run_id;
  SELECT finalized_at IS NOT NULL INTO v_status FROM t_payroll_runs WHERE id = v_run_id;
  IF v_status <> 'true' THEN
    RAISE EXCEPTION 'FAIL 7a: finalizing did not stamp finalized_at';
  END IF;

  BEGIN
    UPDATE t_payroll_lines SET pph21 = 0
     WHERE run_id = v_run_id AND user_id = '00000000-0000-0000-0000-0000000000e1';
    RAISE EXCEPTION 'FAIL 7b: a finalized deduction was edited';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL 7b%' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM generate_payroll_run('2026-03-01');
    RAISE EXCEPTION 'FAIL 7c: a finalized run was regenerated';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL 7c%' THEN RAISE; END IF;
  END;

  BEGIN
    UPDATE t_payroll_runs SET status = 'Draft' WHERE id = v_run_id;
    RAISE EXCEPTION 'FAIL 7d: a finalized run was reopened';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL 7d%' THEN RAISE; END IF;
  END;

  -- 8. Payment status still moves, and carries its own timestamp
  UPDATE t_payroll_lines SET payment_status = 'Paid'
   WHERE run_id = v_run_id AND user_id = '00000000-0000-0000-0000-0000000000e1';
  SELECT paid_at INTO v_paid_at FROM t_payroll_lines
   WHERE run_id = v_run_id AND user_id = '00000000-0000-0000-0000-0000000000e1';
  IF v_paid_at IS NULL THEN
    RAISE EXCEPTION 'FAIL 8a: Paid did not stamp paid_at';
  END IF;

  UPDATE t_payroll_lines SET payment_status = 'Unpaid'
   WHERE run_id = v_run_id AND user_id = '00000000-0000-0000-0000-0000000000e1';
  SELECT paid_at INTO v_paid_at FROM t_payroll_lines
   WHERE run_id = v_run_id AND user_id = '00000000-0000-0000-0000-0000000000e1';
  IF v_paid_at IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 8b: going back to Unpaid kept paid_at';
  END IF;

  -- 9. A finalized run is each employee's own payslip, and only theirs
  PERFORM pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
  SELECT COUNT(*) INTO v_count FROM t_payroll_lines;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL 9a: employee saw % payroll lines, expected only their own', v_count;
  END IF;

  BEGIN
    UPDATE t_payroll_lines SET payment_status = 'Paid' WHERE user_id = auth.uid();
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count <> 0 THEN
      RAISE EXCEPTION 'FAIL 9b: an employee marked their own payslip paid';
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  -- 10. A finalized run cannot be deleted
  PERFORM pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
  BEGIN
    DELETE FROM t_payroll_runs WHERE id = v_run_id;
    RAISE EXCEPTION 'FAIL 10: a finalized run was deleted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL 10%' THEN RAISE; END IF;
  END;

  RESET ROLE;
  RAISE NOTICE 'PAYROLL CHECKS PASSED';
END;
$$;
