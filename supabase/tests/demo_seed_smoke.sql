-- Smoke test for the demo seed (superadmin_seed_demo_data and its task board
-- part). Seeds twice, so the wipe and every cascade run on board data too:
--   supabase/tests/scratch_db.sh supabase/tests/demo_seed_smoke.sql

\set ON_ERROR_STOP on

-- PostgREST sessions preload pg-safeupdate (UPDATE/DELETE need a WHERE);
-- the seed is called through PostgREST, so test it the same way.
LOAD 'safeupdate';

INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-00000000005a', 'root@test.local');
ALTER TABLE profiles DISABLE TRIGGER trg_guard_superadmin_flag;
UPDATE profiles SET is_superadmin = TRUE WHERE id = '00000000-0000-0000-0000-00000000005a';
ALTER TABLE profiles ENABLE TRIGGER trg_guard_superadmin_flag;
-- Through jwt claims, not test.uid: the seed itself switches users that way.
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000005a","role":"authenticated"}', false);

SELECT public.superadmin_seed_demo_data();
SELECT public.superadmin_seed_demo_data();

DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT count(*) INTO v_count FROM t_boards;
  IF v_count <> 5 THEN RAISE EXCEPTION 'FAIL 1: expected 5 boards, got %', v_count; END IF;
  SELECT count(*) INTO v_count FROM t_tasks;
  IF v_count < 25 THEN RAISE EXCEPTION 'FAIL 2: only % tasks', v_count; END IF;

  SELECT count(*) INTO v_count FROM t_tasks t
  LEFT JOIN t_tasks p ON p.id = t.parent_id
  LEFT JOIN t_board_columns c ON c.id = t.column_id
  WHERE (t.parent_id IS NULL AND (t.root_id <> t.id OR t.depth <> 0 OR c.board_id IS DISTINCT FROM t.board_id))
     OR (t.parent_id IS NOT NULL AND (t.column_id IS NOT NULL OR t.root_id <> p.root_id OR t.depth <> p.depth + 1));
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL 3: % tasks with a broken tree', v_count; END IF;

  SELECT count(*) INTO v_count FROM t_boards b
  WHERE b.next_task_no <> (SELECT COALESCE(max(task_no), 0) + 1 FROM t_tasks WHERE board_id = b.id);
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL 4: task counter out of step on % boards', v_count; END IF;

  SELECT count(*) INTO v_count FROM t_tasks t
  WHERE (t.status = 'done' AND (t.completed_at IS NULL OR NOT EXISTS (
           SELECT 1 FROM t_task_reviews r WHERE r.task_id = t.id AND r.decision = 'approved')))
     OR (t.status IN ('in_review', 'done') AND t.submitted_by IS NULL)
     OR (t.status IN ('in_review', 'done') AND (
           EXISTS (SELECT 1 FROM t_task_steps s WHERE s.task_id = t.id AND NOT s.is_done)
           OR EXISTS (SELECT 1 FROM t_tasks c WHERE c.parent_id = t.id AND c.status <> 'done')
           OR COALESCE(t.expected_output, '') = ''));
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL 5: % tasks in an unreachable state', v_count; END IF;

  SELECT count(*) INTO v_count FROM t_tasks t JOIN t_board_columns c ON c.id = t.column_id
  WHERE c.is_done_column <> (t.status = 'done');
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL 6: % cards in the wrong done/open column', v_count; END IF;

  SELECT count(*) INTO v_count FROM t_task_assignees a
  JOIN t_tasks t ON t.id = a.task_id JOIN t_boards b ON b.id = t.board_id
  WHERE NOT EXISTS (SELECT 1 FROM m_project_members m WHERE m.project_id = b.project_id AND m.user_id = a.user_id);
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL 7: % assignees outside their project', v_count; END IF;

  SELECT count(*) INTO v_count FROM t_task_steps s
  WHERE s.is_done AND (s.done_at IS NULL OR s.done_at > NOW() OR NOT EXISTS (
    SELECT 1 FROM t_task_assignees a WHERE a.user_id = s.done_by
      AND a.task_id IN (SELECT id FROM public.task_lineage(s.task_id))));
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL 8: % steps ticked by the wrong person or time', v_count; END IF;

  SELECT count(*) INTO v_count FROM t_task_reviews r JOIN t_task_assignees a
    ON a.task_id = r.task_id AND a.user_id = r.reviewer_id;
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL 9: % self-reviews', v_count; END IF;

  SELECT count(*) INTO v_count FROM t_task_activity WHERE created_at > NOW() OR actor_id IS NULL;
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL 10: % activity rows in the future or without actor', v_count; END IF;
  SELECT count(*) INTO v_count FROM t_task_activity;
  IF v_count < 100 THEN RAISE EXCEPTION 'FAIL 11: only % activity rows', v_count; END IF;
  SELECT count(*) INTO v_count FROM t_daily_tasks WHERE board_task_id IS NOT NULL;
  IF v_count = 0 THEN RAISE EXCEPTION 'FAIL 12: no daily entry links to a board task'; END IF;
  SELECT count(*) INTO v_count FROM m_project_members WHERE member_role = 'pic';
  IF v_count = 0 THEN RAISE EXCEPTION 'FAIL 13: no project has a PIC'; END IF;

  SELECT count(*) INTO v_count FROM pg_trigger
  WHERE tgrelid IN ('t_tasks'::regclass, 't_task_steps'::regclass, 't_task_assignees'::regclass)
    AND NOT tgisinternal AND tgenabled = 'D';
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL 14: % board triggers left disabled', v_count; END IF;

  SELECT count(*) INTO v_count FROM t_boards WHERE background IS NULL OR background NOT LIKE 'preset:%';
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL 15: % demo boards without an illustration', v_count; END IF;
  SELECT count(*) INTO v_count FROM t_task_steps WHERE is_done AND assignee_id IS NOT NULL AND done_by <> assignee_id;
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL 16: % owned steps ticked by someone else', v_count; END IF;
  SELECT count(*) INTO v_count FROM t_task_steps WHERE assignee_id IS NOT NULL;
  IF v_count = 0 THEN RAISE EXCEPTION 'FAIL 17: no step names an owner'; END IF;

  RAISE NOTICE 'DEMO SEED CHECKS PASSED';
END;
$$;
