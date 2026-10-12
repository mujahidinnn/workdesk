-- Smoke test for the task board rules (20261102000000_task_board_schema.sql,
-- 20261102000100_task_board_workflow.sql). Commits its fixtures:
--   supabase/tests/scratch_db.sh supabase/tests/board_smoke.sql

\set ON_ERROR_STOP on

-- PostgREST sessions preload pg-safeupdate (UPDATE/DELETE need a WHERE).
LOAD 'safeupdate';

-- 0. Checked before the blanket GRANT below, which stands in for Supabase's
-- defaults: internal helpers are not RPCs, and anon reaches none of the board RPCs.
DO $$
DECLARE
  f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY['public.reopen_lineage(bigint)', 'public.notify_user(uuid,text,bigint)',
    'public.log_task_activity(bigint,text,jsonb)', 'public.slot_task(bigint,integer,bigint,bigint,bigint)',
    'public.task_label(bigint)', 'public.task_link(bigint)', 'public.actor_name()'] LOOP
    IF has_function_privilege('authenticated', f, 'execute') OR has_function_privilege('anon', f, 'execute') THEN
      RAISE EXCEPTION 'FAIL 0a: % is callable by clients', f;
    END IF;
  END LOOP;
  FOREACH f IN ARRAY ARRAY['public.ensure_board(integer)', 'public.move_task(bigint,integer,bigint,bigint)',
    'public.reparent_task(bigint,bigint,integer,bigint,bigint)', 'public.move_step(bigint,bigint,bigint)',
    'public.submit_review(bigint)', 'public.review_task(bigint,text,text)', 'public.notify_my_overdue()'] LOOP
    IF has_function_privilege('anon', f, 'execute') THEN
      RAISE EXCEPTION 'FAIL 0b: anon can call %', f;
    END IF;
  END LOOP;
END;
$$;

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
-- Take the internal helpers back again, so triggers and RPCs are tested with
-- the same ACL production has.
REVOKE EXECUTE ON FUNCTION public.reopen_lineage(bigint), public.notify_user(uuid,text,bigint),
    public.log_task_activity(bigint,text,jsonb), public.slot_task(bigint,integer,bigint,bigint,bigint),
    public.task_label(bigint), public.task_link(bigint), public.actor_name() FROM authenticated;

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'board-admin@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', 'board-pic@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', 'board-reviewer@test.local'),
  ('00000000-0000-0000-0000-0000000000e1', 'board-dev1@test.local'),
  ('00000000-0000-0000-0000-0000000000e2', 'board-dev2@test.local'),
  ('00000000-0000-0000-0000-0000000000f1', 'board-outsider@test.local');

SELECT set_config('test.role', 'service_role', false);
UPDATE profiles SET role_id = (SELECT id FROM m_roles WHERE role_name = 'Admin')
 WHERE id = '00000000-0000-0000-0000-0000000000a1';
SELECT set_config('test.role', '', false);

INSERT INTO m_projects (id, project_code, project_name, client) VALUES (9101, 'P-BOARD', 'Board Project', 'ACME');
INSERT INTO m_project_members (project_id, user_id, member_role) VALUES
  (9101, '00000000-0000-0000-0000-0000000000b1', 'pic'),
  (9101, '00000000-0000-0000-0000-0000000000c1', 'reviewer'),
  (9101, '00000000-0000-0000-0000-0000000000e1', 'member'),
  (9101, '00000000-0000-0000-0000-0000000000e2', 'member');

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
  a1 CONSTANT TEXT := '00000000-0000-0000-0000-0000000000a1';
  p1 CONSTANT TEXT := '00000000-0000-0000-0000-0000000000b1';
  r1 CONSTANT TEXT := '00000000-0000-0000-0000-0000000000c1';
  e1 CONSTANT TEXT := '00000000-0000-0000-0000-0000000000e1';
  e2 CONSTANT TEXT := '00000000-0000-0000-0000-0000000000e2';
  o1 CONSTANT TEXT := '00000000-0000-0000-0000-0000000000f1';
  v_board   INT;
  v_backlog INT;
  v_done    INT;
  v_root    BIGINT;
  v_child   BIGINT;
  v_grand   BIGINT;
  v_step    BIGINT;
  v_count   INT;
  v_text    TEXT;
BEGIN
  PERFORM pg_temp.act_as(o1);
  BEGIN
    PERFORM public.ensure_board(9101);
    RAISE EXCEPTION 'FAIL 1a: an outsider opened the board';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;

  PERFORM pg_temp.act_as(e1);
  SELECT id INTO v_board FROM public.ensure_board(9101);
  SELECT count(*) INTO v_count FROM t_board_columns WHERE board_id = v_board;
  IF v_count <> 6 THEN RAISE EXCEPTION 'FAIL 1b: expected 6 default columns, got %', v_count; END IF;
  SELECT id INTO v_backlog FROM t_board_columns WHERE board_id = v_board AND name = 'Backlog';
  SELECT id INTO v_done FROM t_board_columns WHERE board_id = v_board AND is_done_column;

  INSERT INTO t_tasks (board_id, column_id, title, task_no, status)
  VALUES (v_board, v_backlog, 'Notifikasi Sistem', 777, 'done') RETURNING id INTO v_root;
  SELECT task_no || ':' || status INTO v_text FROM t_tasks WHERE id = v_root;
  IF v_text <> '1:todo' THEN RAISE EXCEPTION 'FAIL 2: task got %', v_text; END IF;

  INSERT INTO t_task_assignees (task_id, user_id) VALUES (v_root, e1::uuid);
  INSERT INTO t_task_assignees (task_id, user_id) VALUES (v_root, e2::uuid);
  BEGIN
    INSERT INTO t_task_assignees (task_id, user_id) VALUES (v_root, o1::uuid);
    RAISE EXCEPTION 'FAIL 3a: assigned someone outside the project';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.act_as(r1);
  BEGIN
    INSERT INTO t_task_assignees (task_id, user_id) VALUES (v_root, r1::uuid);
    RAISE EXCEPTION 'FAIL 3b: a non-assignee assigned themselves';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;

  PERFORM pg_temp.act_as(e2);
  DELETE FROM t_task_assignees WHERE task_id = v_root AND user_id = e1::uuid;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL 4: e2 removed an assignee e1 added'; END IF;

  PERFORM pg_temp.act_as(o1);
  SELECT count(*) INTO v_count FROM t_tasks WHERE board_id = v_board;
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL 5: an outsider can read board tasks'; END IF;

  PERFORM pg_temp.act_as(e2);
  INSERT INTO t_tasks (board_id, parent_id, title, expected_output)
  VALUES (v_board, v_root, 'BE: API notifikasi', 'Endpoint /notifications live')
  RETURNING id INTO v_child;
  INSERT INTO t_tasks (board_id, parent_id, title) VALUES (v_board, v_child, 'Websocket')
  RETURNING id INTO v_grand;
  SELECT root_id || ':' || depth INTO v_text FROM t_tasks WHERE id = v_grand;
  IF v_text <> v_root || ':2' THEN RAISE EXCEPTION 'FAIL 6a: grandchild lineage is %', v_text; END IF;

  PERFORM pg_temp.act_as(r1);
  BEGIN
    INSERT INTO t_tasks (board_id, parent_id, title) VALUES (v_board, v_root, 'sneaky');
    RAISE EXCEPTION 'FAIL 6b: a non-assignee added a subtask';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM pg_temp.act_as(e2);
  INSERT INTO t_task_steps (task_id, title, is_done, done_by)
  VALUES (v_child, 'Buat tabel notifikasi', true, r1::uuid) RETURNING id INTO v_step;
  SELECT is_done::text INTO v_text FROM t_task_steps WHERE id = v_step;
  IF v_text <> 'false' THEN RAISE EXCEPTION 'FAIL 7a: a step was created already ticked'; END IF;

  PERFORM pg_temp.act_as(r1);
  UPDATE t_task_steps SET is_done = true WHERE id = v_step;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL 7b: a non-assignee ticked a step'; END IF;

  PERFORM pg_temp.act_as(e1);
  UPDATE t_task_steps SET is_done = true, done_by = r1::uuid WHERE id = v_step;
  SELECT done_by::text INTO v_text FROM t_task_steps WHERE id = v_step;
  IF v_text <> e1 THEN RAISE EXCEPTION 'FAIL 7c: done_by is % instead of the ancestor assignee', v_text; END IF;

  BEGIN
    UPDATE t_tasks SET status = 'done' WHERE id = v_child;
    RAISE EXCEPTION 'FAIL 8a: status set to done without review';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;
  UPDATE t_tasks SET status = 'in_progress' WHERE id = v_child;

  BEGIN
    PERFORM public.submit_review(v_child);
    RAISE EXCEPTION 'FAIL 9a: submitted with an open subtask';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.submit_review(v_grand);
    RAISE EXCEPTION 'FAIL 9b: submitted without an expected output';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;

  UPDATE t_tasks SET expected_output = 'Socket push works' WHERE id = v_grand;
  PERFORM pg_temp.act_as(p1);
  INSERT INTO t_task_assignees (task_id, user_id) VALUES (v_grand, p1::uuid);
  PERFORM public.submit_review(v_grand);
  BEGIN
    PERFORM public.review_task(v_grand, 'approved', NULL);
    RAISE EXCEPTION 'FAIL 10a: an assignee approved their own task';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;

  PERFORM pg_temp.act_as(r1);
  BEGIN
    PERFORM public.review_task(v_grand, 'rejected', '  ');
    RAISE EXCEPTION 'FAIL 11a: rejected without a note';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;
  PERFORM public.review_task(v_grand, 'approved', NULL);
  RESET ROLE;
  SELECT status INTO v_text FROM t_tasks WHERE id = v_grand;
  IF v_text <> 'done' THEN RAISE EXCEPTION 'FAIL 11b: approved task is %', v_text; END IF;
  SELECT count(*) INTO v_count FROM t_notifications
  WHERE user_id = p1::uuid AND title LIKE '%approved your task';
  IF v_count <> 1 THEN RAISE EXCEPTION 'FAIL 11c: assignee got % approval notifications', v_count; END IF;

  PERFORM pg_temp.act_as(e1);
  BEGIN
    PERFORM public.move_task(v_root, v_done, NULL, NULL);
    RAISE EXCEPTION 'FAIL 12a: an open card entered the done column';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.reparent_task(v_root, v_grand, NULL, NULL, NULL);
    RAISE EXCEPTION 'FAIL 13: a task became a child of its own grandchild';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;

  BEGIN
    INSERT INTO t_task_activity (task_id, action) VALUES (v_root, 'forged');
    RAISE EXCEPTION 'FAIL 14a: a client wrote to the activity log';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  SELECT count(*) INTO v_count FROM t_task_activity WHERE task_id = v_child AND action = 'step_checked';
  IF v_count <> 1 THEN RAISE EXCEPTION 'FAIL 14b: step check not logged'; END IF;

  PERFORM pg_temp.act_as(e2);
  PERFORM public.submit_review(v_child);
  PERFORM pg_temp.act_as(r1);
  PERFORM public.review_task(v_child, 'approved', NULL);
  PERFORM pg_temp.act_as(e1);
  UPDATE t_tasks SET expected_output = 'Notifikasi realtime untuk usulan RT' WHERE id = v_root;
  PERFORM public.submit_review(v_root);
  PERFORM pg_temp.act_as(p1);
  PERFORM public.review_task(v_root, 'approved', NULL);
  PERFORM public.move_task(v_root, v_done, NULL, NULL);

  PERFORM pg_temp.act_as(e2);
  INSERT INTO t_task_steps (task_id, title) VALUES (v_child, 'Tambah bulk delete');
  RESET ROLE;
  SELECT string_agg(status, ',' ORDER BY depth) INTO v_text FROM t_tasks WHERE id IN (v_root, v_child);
  IF v_text <> 'in_progress,in_progress' THEN RAISE EXCEPTION 'FAIL 15: reopen left %', v_text; END IF;

  PERFORM pg_temp.act_as(e1);
  INSERT INTO t_tasks (board_id, column_id, title) VALUES (v_board, v_backlog, 'B') RETURNING id INTO v_child;
  INSERT INTO t_task_assignees (task_id, user_id) VALUES (v_child, e1::uuid);
  PERFORM public.move_task(v_child, v_backlog, NULL, NULL);
  INSERT INTO t_tasks (board_id, column_id, title) VALUES (v_board, v_backlog, 'A') RETURNING id INTO v_grand;
  INSERT INTO t_task_assignees (task_id, user_id) VALUES (v_grand, e1::uuid);
  PERFORM public.move_task(v_grand, v_backlog, NULL, v_child);
  SELECT string_agg(title, '' ORDER BY position) INTO v_text
  FROM t_tasks WHERE id IN (v_child, v_grand);
  IF v_text <> 'AB' THEN RAISE EXCEPTION 'FAIL 16: order is %', v_text; END IF;

  PERFORM pg_temp.act_as(e1);
  UPDATE m_project_members SET member_role = 'pic' WHERE project_id = 9101 AND user_id = e1::uuid;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL 17a: a member promoted themselves to PIC'; END IF;
  PERFORM pg_temp.act_as(p1);
  UPDATE m_project_members SET member_role = 'reviewer' WHERE project_id = 9101 AND user_id = e2::uuid;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN RAISE EXCEPTION 'FAIL 17b: the PIC could not set a role'; END IF;

  PERFORM pg_temp.act_as(e1);
  BEGIN
    PERFORM public.reopen_lineage(v_root);
    RAISE EXCEPTION 'FAIL 18: a client called reopen_lineage';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM pg_temp.act_as(r1);
  INSERT INTO t_tasks (board_id, column_id, title) VALUES (v_board, v_backlog, 'R goal') RETURNING id INTO v_root;
  INSERT INTO t_task_assignees (task_id, user_id) VALUES (v_root, r1::uuid);
  INSERT INTO t_tasks (board_id, parent_id, title, expected_output)
  VALUES (v_board, v_root, 'R part', 'done') RETURNING id INTO v_child;
  INSERT INTO t_task_assignees (task_id, user_id) VALUES (v_child, e1::uuid);
  PERFORM public.submit_review(v_child);
  BEGIN
    PERFORM public.review_task(v_child, 'approved', NULL);
    RAISE EXCEPTION 'FAIL 19a: the submitter approved their own submission';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;
  BEGIN
    DELETE FROM t_task_assignees WHERE task_id = v_child AND user_id = e1::uuid;
    RAISE EXCEPTION 'FAIL 19b: an assignee was removed during review';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;

  BEGIN
    UPDATE t_tasks SET parent_id = v_grand WHERE id = v_root;
    RAISE EXCEPTION 'FAIL 20a: parent_id changed by a direct update';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE t_tasks SET column_id = v_done WHERE id = v_root;
    RAISE EXCEPTION 'FAIL 20b: column_id changed by a direct update';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;

  PERFORM pg_temp.act_as(e1);
  INSERT INTO storage.objects (bucket_id, name, owner_id)
  VALUES ('task-attachments', 'board/' || v_root || '/spec.png', e1);
  PERFORM pg_temp.act_as(o1);
  SELECT count(*) INTO v_count FROM storage.objects WHERE name LIKE 'board/%';
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL 21a: an outsider can see board files'; END IF;
  BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner_id)
    VALUES ('task-attachments', 'board/' || v_root || '/x.png', o1);
    RAISE EXCEPTION 'FAIL 21b: an outsider uploaded into a board folder';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
  INSERT INTO storage.objects (bucket_id, name) VALUES ('task-attachments', 'board/abc/y.png');
  PERFORM pg_temp.act_as(e1);
  SELECT count(*) INTO v_count FROM storage.objects WHERE bucket_id = 'task-attachments';
  IF v_count < 1 THEN RAISE EXCEPTION 'FAIL 21c: a member lost sight of board files'; END IF;

  PERFORM pg_temp.act_as(p1);
  BEGIN
    UPDATE m_project_members SET user_id = o1::uuid WHERE project_id = 9101 AND user_id = e1::uuid;
    RAISE EXCEPTION 'FAIL 22: a PIC rewrote a membership row';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;

  RESET ROLE;
  DELETE FROM m_project_members WHERE project_id = 9101 AND user_id = e1::uuid;
  PERFORM pg_temp.act_as(e1);
  BEGIN
    PERFORM public.move_task(v_grand, v_backlog, NULL, NULL);
    RAISE EXCEPTION 'FAIL 23: a removed member moved a task';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;

  PERFORM pg_temp.act_as(p1);
  INSERT INTO t_board_task_comments (task_id, user_id, comment)
  VALUES (v_root, p1::uuid, 'first') RETURNING id INTO v_step;
  BEGIN
    UPDATE t_board_task_comments SET task_id = v_grand WHERE id = v_step;
    RAISE EXCEPTION 'FAIL 24a: a comment moved to another task';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;
  UPDATE t_board_task_comments SET comment = 'edited' WHERE id = v_step;
  RESET ROLE;
  SELECT CASE WHEN edited_at IS NULL THEN 'unstamped' ELSE 'ok' END INTO v_text
  FROM t_board_task_comments WHERE id = v_step;
  IF v_text <> 'ok' THEN RAISE EXCEPTION 'FAIL 24b: edit was not stamped'; END IF;

  PERFORM pg_temp.act_as(p1);
  INSERT INTO t_tasks (board_id, column_id, title) VALUES (v_board, v_backlog, 'Unclaimed') RETURNING id INTO v_child;
  PERFORM pg_temp.act_as(r1);
  INSERT INTO t_task_assignees (task_id, user_id) VALUES (v_child, r1::uuid);
  BEGIN
    INSERT INTO t_task_assignees (task_id, user_id) VALUES (v_grand, r1::uuid);
    RAISE EXCEPTION 'FAIL 26a: joined a task that already has assignees';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.act_as(p1);
  INSERT INTO t_tasks (board_id, column_id, title) VALUES (v_board, v_backlog, 'Unclaimed 2') RETURNING id INTO v_child;
  PERFORM pg_temp.act_as(r1);
  BEGIN
    INSERT INTO t_task_assignees (task_id, user_id) VALUES (v_child, e2::uuid);
    RAISE EXCEPTION 'FAIL 26b: claimed an unassigned task for someone else';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM pg_temp.act_as(p1);
  INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES ('board-banners', v_board || '/b.jpg', p1);
  PERFORM pg_temp.act_as(r1);
  SELECT count(*) INTO v_count FROM storage.objects WHERE bucket_id = 'board-banners';
  IF v_count <> 1 THEN RAISE EXCEPTION 'FAIL 27a: a member cannot see the banner'; END IF;
  BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES ('board-banners', v_board || '/x.jpg', r1);
    RAISE EXCEPTION 'FAIL 27b: a non-PIC uploaded a banner';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM pg_temp.act_as(o1);
  SELECT count(*) INTO v_count FROM storage.objects WHERE bucket_id = 'board-banners';
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL 27c: an outsider can see banners'; END IF;

  PERFORM pg_temp.act_as(r1);
  INSERT INTO t_board_order (project_id, position) VALUES (9101, 1);
  PERFORM pg_temp.act_as(p1);
  SELECT count(*) INTO v_count FROM t_board_order;
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL 28a: saw someone else''s board order'; END IF;
  BEGIN
    INSERT INTO t_board_order (user_id, project_id, position) VALUES (r1::uuid, 9101, 2);
    RAISE EXCEPTION 'FAIL 28b: wrote someone else''s board order';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM pg_temp.act_as(p1);
  INSERT INTO t_tasks (board_id, column_id, title) VALUES (v_board, v_backlog, 'Stepwise') RETURNING id INTO v_child;
  INSERT INTO t_task_assignees (task_id, user_id) VALUES (v_child, e2::uuid);
  PERFORM pg_temp.act_as(e2);
  INSERT INTO t_task_steps (task_id, title, assignee_id) VALUES (v_child, 'Owned by r1', r1::uuid) RETURNING id INTO v_step;
  BEGIN
    INSERT INTO t_task_steps (task_id, title, assignee_id) VALUES (v_child, 'Outsider', o1::uuid);
    RAISE EXCEPTION 'FAIL 29a: a step was given to someone outside the project';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE t_task_steps SET is_done = true WHERE id = v_step;
    RAISE EXCEPTION 'FAIL 29b: a task assignee ticked a step owned by someone else';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.act_as(r1);
  UPDATE t_task_steps SET is_done = true WHERE id = v_step;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN RAISE EXCEPTION 'FAIL 29c: the step owner could not tick it'; END IF;
  BEGIN
    UPDATE t_task_steps SET title = 'renamed' WHERE id = v_step;
    RAISE EXCEPTION 'FAIL 29d: a step owner rewrote the step';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;
  RESET ROLE;
  SELECT count(*) INTO v_count FROM t_notifications WHERE user_id = r1::uuid AND title LIKE '%assigned you a step';
  IF v_count <> 1 THEN RAISE EXCEPTION 'FAIL 29e: step owner got % notifications', v_count; END IF;

  PERFORM pg_temp.act_as(p1);
  INSERT INTO t_tasks (board_id, column_id, title) VALUES (v_board, v_backlog, 'Tree A') RETURNING id INTO v_root;
  INSERT INTO t_tasks (board_id, parent_id, title) VALUES (v_board, v_root, 'Tree A.1') RETURNING id INTO v_child;
  INSERT INTO t_tasks (board_id, parent_id, title) VALUES (v_board, v_child, 'Tree A.1.1') RETURNING id INTO v_grand;
  UPDATE t_tasks SET description = 'touched' WHERE id = v_child;  -- new tuple, later ctid
  INSERT INTO t_tasks (board_id, column_id, title) VALUES (v_board, v_backlog, 'Tree B') RETURNING id INTO v_step;
  PERFORM public.reparent_task(v_root, v_step, NULL, NULL, NULL);
  RESET ROLE;
  SELECT count(*) INTO v_count FROM t_tasks
  WHERE id IN (v_root, v_child, v_grand)
    AND (root_id <> v_step OR depth <> CASE id WHEN v_root THEN 1 WHEN v_child THEN 2 ELSE 3 END);
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL 30: % nodes kept a stale root or depth', v_count; END IF;

  PERFORM pg_temp.act_as(p1);
  INSERT INTO t_tasks (board_id, column_id, title, expected_output) VALUES (v_board, v_backlog, 'Owned steps', 'x') RETURNING id INTO v_root;
  INSERT INTO t_task_assignees (task_id, user_id) VALUES (v_root, e2::uuid);
  INSERT INTO t_task_steps (task_id, title, assignee_id) VALUES (v_root, 'r1 step', r1::uuid) RETURNING id INTO v_step;
  PERFORM pg_temp.act_as(e2);
  BEGIN
    UPDATE t_task_steps SET assignee_id = e2::uuid WHERE id = v_step;
    RAISE EXCEPTION 'FAIL 31: a task assignee took over a step owned by someone else';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;

  PERFORM pg_temp.act_as(r1);
  INSERT INTO t_tasks (board_id, column_id, title) VALUES (v_board, v_backlog, 'Handed over') RETURNING id INTO v_child;
  INSERT INTO t_task_assignees (task_id, user_id) VALUES (v_child, e2::uuid);
  UPDATE t_tasks SET expected_output = 'rewritten' WHERE id = v_child;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL 32: the creator edited a card they handed over'; END IF;

  PERFORM pg_temp.act_as(e2);
  UPDATE t_task_steps SET is_done = true WHERE task_id = v_root AND assignee_id IS NULL;
  PERFORM pg_temp.act_as(r1);
  UPDATE t_task_steps SET is_done = true WHERE id = v_step;
  PERFORM pg_temp.act_as(e2);
  PERFORM public.submit_review(v_root);
  BEGIN
    UPDATE t_tasks SET expected_output = 'changed in review' WHERE id = v_root;
    RAISE EXCEPTION 'FAIL 33a: content changed while in review';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.act_as(r1);
  PERFORM public.review_task(v_root, 'approved', NULL);
  PERFORM pg_temp.act_as(e2);
  UPDATE t_tasks SET expected_output = 'changed after approval' WHERE id = v_root;
  RESET ROLE;
  SELECT status INTO v_text FROM t_tasks WHERE id = v_root;
  IF v_text <> 'in_progress' THEN RAISE EXCEPTION 'FAIL 33b: edited approved work stayed %', v_text; END IF;

  PERFORM pg_temp.act_as(e2);
  INSERT INTO t_board_task_comments (task_id, user_id, comment, mentions)
  VALUES (v_root, e2::uuid, 'hey @outsider', ARRAY[o1::uuid]);
  RESET ROLE;
  SELECT count(*) INTO v_count FROM t_notifications WHERE user_id = o1::uuid;
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL 34: an outsider was notified about a board task'; END IF;

  INSERT INTO m_projects (id, project_code, project_name, client) VALUES (9102, 'P-OTHER', 'Other', 'ACME');
  INSERT INTO m_project_members (project_id, user_id, member_role) VALUES (9102, p1::uuid, 'pic');
  INSERT INTO t_boards (project_id, name) VALUES (9102, 'Other') RETURNING id INTO v_count;
  INSERT INTO t_task_labels (board_id, name) VALUES (v_count, 'Foreign') RETURNING id INTO v_done;
  PERFORM pg_temp.act_as(p1);
  BEGIN
    INSERT INTO t_task_label_map (task_id, label_id) VALUES (v_root, v_done);
    RAISE EXCEPTION 'FAIL 35a: a label from another board was attached';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE t_board_columns SET board_id = v_count WHERE id = v_backlog;
    RAISE EXCEPTION 'FAIL 35b: a column moved to another board';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;
  RESET ROLE;
  SELECT id INTO v_done FROM t_board_columns WHERE board_id = v_board AND is_done_column;

  PERFORM pg_temp.act_as(e2);
  UPDATE t_tasks SET status = 'in_progress' WHERE id = v_root;
  INSERT INTO t_task_steps (task_id, title, assignee_id) VALUES (v_root, 'r1 again', r1::uuid) RETURNING id INTO v_step;
  RESET ROLE;
  DELETE FROM m_project_members WHERE project_id = 9101 AND user_id = r1::uuid;
  PERFORM pg_temp.act_as(r1);
  UPDATE t_task_steps SET is_done = true WHERE id = v_step;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL 36: a former member ticked their old step'; END IF;
  RESET ROLE;
  INSERT INTO m_project_members (project_id, user_id, member_role) VALUES (9101, r1::uuid, 'reviewer');

  INSERT INTO m_projects (id, project_code, project_name, client) VALUES (9103, 'P-NOPIC', 'No PIC', 'ACME');
  INSERT INTO m_project_members (project_id, user_id) VALUES (9103, e2::uuid);
  PERFORM pg_temp.act_as(e2);
  SELECT id INTO v_count FROM public.ensure_board(9103);
  INSERT INTO t_tasks (board_id, column_id, title, expected_output)
  VALUES (v_count, (SELECT id FROM t_board_columns WHERE board_id = v_count AND name = 'Backlog'), 'Lonely', 'x')
  RETURNING id INTO v_child;
  INSERT INTO t_task_assignees (task_id, user_id) VALUES (v_child, e2::uuid);
  BEGIN
    PERFORM public.submit_review(v_child);
    RAISE EXCEPTION 'FAIL 37: submitted with nobody to review it';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;
  RESET ROLE;

  PERFORM pg_temp.act_as(p1);
  INSERT INTO t_tasks (board_id, column_id, title) VALUES (v_board, v_backlog, 'Mover') RETURNING id INTO v_root;
  INSERT INTO t_tasks (board_id, parent_id, title) VALUES (v_board, v_root, 'Mover child') RETURNING id INTO v_child;
  INSERT INTO t_task_assignees (task_id, user_id) VALUES (v_child, e2::uuid);
  SELECT id INTO v_count FROM t_boards WHERE project_id = 9102;
  RESET ROLE;
  INSERT INTO t_board_columns (board_id, name, position) VALUES (v_count, 'Backlog', 1024);
  PERFORM pg_temp.act_as(p1);
  BEGIN
    PERFORM public.move_task_to_board(v_root, v_count);
    RAISE EXCEPTION 'FAIL 38a: moved a card whose assignee is not on the target project';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;
  RESET ROLE;
  INSERT INTO m_project_members (project_id, user_id) VALUES (9102, e2::uuid);
  PERFORM pg_temp.act_as(p1);
  PERFORM public.move_task_to_board(v_root, v_count);
  RESET ROLE;
  SELECT count(*) INTO v_grand FROM t_tasks
  WHERE id IN (v_root, v_child) AND board_id = v_count AND root_id = v_root;
  IF v_grand <> 2 THEN RAISE EXCEPTION 'FAIL 38b: subtree did not move whole'; END IF;
  SELECT count(*) INTO v_grand FROM t_tasks t JOIN t_board_columns c ON c.id = t.column_id
  WHERE t.id = v_root AND c.board_id = v_count;
  IF v_grand <> 1 THEN RAISE EXCEPTION 'FAIL 38c: moved card has no column on its new board'; END IF;
  SELECT count(*) INTO v_grand FROM (SELECT task_no FROM t_tasks WHERE board_id = v_count GROUP BY task_no HAVING count(*) > 1) d;
  IF v_grand <> 0 THEN RAISE EXCEPTION 'FAIL 38d: task numbers collide on the new board'; END IF;

  PERFORM pg_temp.act_as(p1);
  INSERT INTO t_tasks (board_id, column_id, title, expected_output) VALUES (v_board, v_backlog, 'Withdraw me', 'x') RETURNING id INTO v_root;
  INSERT INTO t_task_assignees (task_id, user_id) VALUES (v_root, e2::uuid);
  PERFORM pg_temp.act_as(e2);
  PERFORM public.submit_review(v_root);
  PERFORM pg_temp.act_as(r1);
  BEGIN
    PERFORM public.withdraw_review(v_root);
    RAISE EXCEPTION 'FAIL 39a: a reviewer withdrew someone else''s submission';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.act_as(e2);
  PERFORM public.withdraw_review(v_root);
  RESET ROLE;
  SELECT status || ':' || COALESCE(submitted_by::text, '-') INTO v_text FROM t_tasks WHERE id = v_root;
  IF v_text <> 'in_progress:-' THEN RAISE EXCEPTION 'FAIL 39b: withdrawn task is %', v_text; END IF;

  PERFORM pg_temp.act_as(p1);
  INSERT INTO t_tasks (board_id, column_id, title, due_date) VALUES (v_board, v_backlog, 'Late', CURRENT_DATE - 2) RETURNING id INTO v_root;
  INSERT INTO t_task_assignees (task_id, user_id) VALUES (v_root, p1::uuid);
  INSERT INTO t_task_steps (task_id, title, assignee_id) VALUES (v_root, 'late step', r1::uuid);
  PERFORM pg_temp.act_as(r1);
  SELECT public.notify_my_overdue() INTO v_grand;
  IF v_grand < 1 THEN RAISE EXCEPTION 'FAIL 40: a step owner got no overdue reminder'; END IF;
  RESET ROLE;

  RESET ROLE;
  DELETE FROM m_projects WHERE id = 9101;
  SELECT count(*) INTO v_count FROM t_tasks WHERE board_id = v_board;
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL 25: cards outlived their project'; END IF;

  RESET ROLE;
  RAISE NOTICE 'BOARD CHECKS PASSED';
END;
$$;
