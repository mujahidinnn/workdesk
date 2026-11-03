-- Smoke test for 20261105000000_ai_command.sql. Commits its fixtures:
--   supabase/tests/scratch_db.sh supabase/tests/ai_command_smoke.sql

\set ON_ERROR_STOP on

LOAD 'safeupdate';

GRANT USAGE ON SCHEMA public TO anon, authenticated;
-- Stand-in for Supabase's default grants, except the new ai objects: those must
-- rely on the ACL the migration sets itself.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT c.oid::regclass AS rel FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind IN ('r', 'S') AND c.relname !~ '^(t|m)_ai_' LOOP
    EXECUTE format('GRANT ALL ON %s TO authenticated', r.rel);
  END LOOP;
  FOR r IN SELECT p.oid::regprocedure AS fn FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname !~ '^ai_' LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.fn);
  END LOOP;
END;
$$;

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'ai-a@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', 'ai-b@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', 'ai-m@test.local');

SELECT set_config('test.role', 'service_role', false);
UPDATE profiles SET role_id = (SELECT id FROM m_roles WHERE role_name = 'Admin')
 WHERE id = '00000000-0000-0000-0000-0000000000c1';
SELECT set_config('test.role', '', false);

INSERT INTO t_ai_conversations (id, user_id) VALUES
  (9001, '00000000-0000-0000-0000-0000000000a1'),
  (9002, '00000000-0000-0000-0000-0000000000b1');
INSERT INTO t_ai_messages (id, conversation_id, role, content) VALUES
  (9101, 9001, 'assistant', '{"text":"a","proposals":[{"id":"p1","status":"pending"},{"id":"p2","status":"pending"},{"id":"p3","status":"pending"}]}'),
  (9102, 9002, 'assistant', '{"text":"b","proposals":[{"id":"q1","status":"pending"}]}');

CREATE OR REPLACE FUNCTION pg_temp.act_as(p_uid TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  RESET ROLE;
  PERFORM set_config('test.uid', p_uid, false);
  PERFORM set_config('test.role', 'authenticated', false);
  SET LOCAL ROLE authenticated;
END;
$$;

DO $$
DECLARE
  a CONSTANT TEXT := '00000000-0000-0000-0000-0000000000a1';
  b CONSTANT TEXT := '00000000-0000-0000-0000-0000000000b1';
  m CONSTANT TEXT := '00000000-0000-0000-0000-0000000000c1';
  n int;
  ok boolean;
  c jsonb;
  job text;
BEGIN
  -- 1. Isolation and no client writes to messages.
  PERFORM pg_temp.act_as(a);
  SELECT count(*) INTO n FROM t_ai_conversations WHERE id = 9002;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL 1a: A sees B conversation'; END IF;
  SELECT count(*) INTO n FROM t_ai_messages WHERE conversation_id = 9002;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL 1b: A sees B messages'; END IF;
  SELECT count(*) INTO n FROM t_ai_messages WHERE conversation_id = 9001;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL 1c: A cannot see own message'; END IF;
  BEGIN
    INSERT INTO t_ai_messages (conversation_id, role, content) VALUES (9001, 'user', '{"text":"x"}');
    RAISE EXCEPTION 'FAIL 1d: insert allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    SELECT count(*) INTO n FROM t_ai_usage;
    RAISE EXCEPTION 'FAIL 1e: usage readable';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- 2. Ownership.
  BEGIN
    ok := ai_set_proposal_status(9102, 'q1', 'executing');
  EXCEPTION WHEN OTHERS THEN ok := false;
  END;
  IF ok THEN RAISE EXCEPTION 'FAIL 2: A claimed B proposal'; END IF;

  -- 3. Claim race and transitions.
  IF NOT ai_set_proposal_status(9101, 'p1', 'executing') THEN RAISE EXCEPTION 'FAIL 3a: first claim lost'; END IF;
  IF ai_set_proposal_status(9101, 'p1', 'executing') THEN RAISE EXCEPTION 'FAIL 3b: second claim won'; END IF;
  IF ai_set_proposal_status(9101, 'p1', 'pending') THEN RAISE EXCEPTION 'FAIL 3c: executing -> pending allowed'; END IF;
  IF NOT ai_set_proposal_status(9101, 'p1', 'executed', '{"id":42}') THEN RAISE EXCEPTION 'FAIL 3d: executed refused'; END IF;
  SELECT content INTO c FROM t_ai_messages WHERE id = 9101;
  IF c -> 'proposals' -> 0 ->> 'status' <> 'executed' OR c -> 'proposals' -> 0 -> 'result' ->> 'id' <> '42'
     OR c -> 'proposals' -> 0 ->> 'status_at' IS NULL THEN
    RAISE EXCEPTION 'FAIL 3e: result not stored: %', c;
  END IF;
  IF c -> 'proposals' -> 1 ->> 'status' <> 'pending' THEN RAISE EXCEPTION 'FAIL 3f: neighbour touched'; END IF;
  IF NOT ai_set_proposal_status(9101, 'p2', 'cancelled') THEN RAISE EXCEPTION 'FAIL 3g: cancel refused'; END IF;
  IF ai_set_proposal_status(9101, 'p2', 'executing') THEN RAISE EXCEPTION 'FAIL 3h: cancelled -> executing allowed'; END IF;
  IF ai_set_proposal_status(9101, 'p3', 'executed') THEN RAISE EXCEPTION 'FAIL 3i: pending -> executed allowed'; END IF;
  IF NOT ai_set_proposal_status(9101, 'p3', 'executing') OR NOT ai_set_proposal_status(9101, 'p3', 'failed', '{"error":"boom"}') THEN
    RAISE EXCEPTION 'FAIL 3j: failed path';
  END IF;
  SELECT content INTO c FROM t_ai_messages WHERE id = 9101;
  IF c -> 'proposals' -> 2 ->> 'error' <> 'boom' THEN RAISE EXCEPTION 'FAIL 3k: error not stored'; END IF;
  IF ai_set_proposal_status(9101, 'nope', 'executing') THEN RAISE EXCEPTION 'FAIL 3l: unknown proposal'; END IF;
  -- 3m. Oversized results are rejected and leave the proposal untouched.
  RESET ROLE;
  INSERT INTO t_ai_messages (id, conversation_id, role, content) VALUES
    (9103, 9001, 'assistant', '{"text":"c","proposals":[{"id":"r1","status":"executing"}]}');
  PERFORM pg_temp.act_as(a);
  BEGIN
    PERFORM ai_set_proposal_status(9103, 'r1', 'executed',
      jsonb_build_object('blob', (SELECT string_agg(md5(i::text), '') FROM generate_series(1, 400) i)));
    RAISE EXCEPTION 'FAIL 3m: oversized result accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'result_too_large' THEN RAISE; END IF;
  END;
  IF NOT ai_set_proposal_status(9103, 'r1', 'executed', '{"id":1}') THEN RAISE EXCEPTION 'FAIL 3n: small result refused'; END IF;

  -- 4. Settings.
  BEGIN
    UPDATE m_ai_settings SET daily_limit = 5 WHERE id;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN RAISE EXCEPTION 'FAIL 4a: A updated settings'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM pg_temp.act_as(m);
  UPDATE m_ai_settings SET daily_limit = 2 WHERE id;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL 4b: master cannot update settings'; END IF;
  BEGIN
    UPDATE m_ai_settings SET daily_limit = 1001 WHERE id;
    RAISE EXCEPTION 'FAIL 4c: 1001 accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- 5. Quota, limit 2. The day is the Jakarta date even when the session is UTC.
  PERFORM pg_temp.act_as(a);
  SET LOCAL TIME ZONE 'UTC';
  IF ai_day('2026-11-02 23:30+00') <> '2026-11-03' OR ai_day('2026-11-02 16:59+00') <> '2026-11-02' THEN
    RAISE EXCEPTION 'FAIL 5z: ai_day is not the WIB day';
  END IF;
  IF ai_consume_quota() <> 1 OR ai_consume_quota() <> 0 THEN RAISE EXCEPTION 'FAIL 5a: remaining'; END IF;
  BEGIN
    PERFORM ai_consume_quota();
    RAISE EXCEPTION 'FAIL 5b: third call allowed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'quota_exceeded' THEN RAISE; END IF;
  END;
  IF ai_quota_today() <> '{"used":2,"limit":2}'::jsonb THEN RAISE EXCEPTION 'FAIL 5c: %', ai_quota_today(); END IF;
  -- B has a full row dated yesterday (Jakarta) and a row for the Jakarta day under UTC.
  RESET ROLE;
  INSERT INTO t_ai_usage VALUES (b::uuid, ai_day() - 1, 2);
  PERFORM pg_temp.act_as(b);
  SET LOCAL TIME ZONE 'UTC';
  IF ai_consume_quota() <> 1 THEN RAISE EXCEPTION 'FAIL 5d: yesterday counted'; END IF;
  RESET ROLE;
  UPDATE t_ai_usage SET count = 2 WHERE user_id = b::uuid AND day = ai_day();
  PERFORM pg_temp.act_as(b);
  BEGIN
    PERFORM ai_consume_quota();
    RAISE EXCEPTION 'FAIL 5e: UTC day used instead of WIB';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'quota_exceeded' THEN RAISE; END IF;
  END;

  -- 5f. A missing settings row counts as limit 0.
  RESET ROLE;
  DELETE FROM m_ai_settings WHERE id;
  PERFORM pg_temp.act_as(m);
  BEGIN
    PERFORM ai_consume_quota();
    RAISE EXCEPTION 'FAIL 5f: NULL limit allowed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'quota_exceeded' THEN RAISE; END IF;
  END;
  RESET ROLE;
  INSERT INTO m_ai_settings (daily_limit) VALUES (2);
  PERFORM pg_temp.act_as(b);

  -- 6. ai_mode.
  UPDATE profiles SET ai_mode = 'auto' WHERE id = b::uuid;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL 6a: ai_mode not updated'; END IF;
  BEGIN
    UPDATE profiles SET ai_mode = 'x' WHERE id = b::uuid;
    RAISE EXCEPTION 'FAIL 6b: bad ai_mode accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- 7. Retention: run the scheduled command itself.
  RESET ROLE;
  INSERT INTO t_ai_conversations (id, user_id, updated_at) VALUES
    (9003, a::uuid, now() - interval '31 days'), (9004, a::uuid, now() - interval '29 days');
  INSERT INTO t_ai_usage VALUES (m::uuid, ai_day() - 8, 1),
                                (m::uuid, ai_day() - 6, 1);
  SELECT command INTO job FROM cron.job WHERE jobname = 'ai-retention';
  IF job IS NULL THEN RAISE EXCEPTION 'FAIL 7a: no ai-retention job'; END IF;
  EXECUTE job;
  IF EXISTS (SELECT 1 FROM t_ai_conversations WHERE id = 9003) THEN RAISE EXCEPTION 'FAIL 7b: old conversation kept'; END IF;
  IF NOT EXISTS (SELECT 1 FROM t_ai_conversations WHERE id = 9004) THEN RAISE EXCEPTION 'FAIL 7c: recent conversation deleted'; END IF;
  SELECT count(*) INTO n FROM t_ai_usage WHERE user_id = m::uuid;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL 7d: usage retention, % rows left', n; END IF;
  IF (SELECT schedule FROM cron.job WHERE jobname = 'ai-retention') <> '0 19 * * *' THEN RAISE EXCEPTION 'FAIL 7e: schedule'; END IF;

  -- 8. anon cannot call the RPCs.
  IF has_function_privilege('anon', 'public.ai_consume_quota()', 'execute')
     OR has_function_privilege('anon', 'public.ai_day(timestamptz)', 'execute')
     OR has_function_privilege('anon', 'public.ai_set_proposal_status(bigint,text,text,jsonb)', 'execute') THEN
    RAISE EXCEPTION 'FAIL 8: anon can execute';
  END IF;

  RAISE NOTICE 'ai_command_smoke: all passed';
END;
$$;
