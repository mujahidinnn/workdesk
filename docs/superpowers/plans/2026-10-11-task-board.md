# Task Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Trello/Jira-style task board per project. It covers multi-assignee cards split by division, a nested task tree with steps and expected outputs, server-enforced tick/assign/review rules, drag and drop, an activity trail, notifications, workload counts, and links from the daily log.

**Architecture:**
- Two Supabase migrations hold every rule: RLS, `BEFORE`/`AFTER` triggers, and `SECURITY DEFINER` RPCs. A direct client write that skips review is refused by the database.
- The React side loads one board into a single React Query cache entry and builds the tree in pure `src/lib/` functions, which are unit-tested.
- Cards move with `@dnd-kit` and optimistic cache updates. Realtime invalidates the cache.

**Tech Stack:** Supabase Postgres 17 (RLS, plpgsql), React 18 + Vite, TanStack Query v5, `@dnd-kit/core` 6 / `@dnd-kit/sortable` 10, Tailwind + shadcn/ui, i18next, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-11-task-board-design.md`

**Deviations from the spec, decided while validating this plan:**
- Progress and workload are computed in `src/lib/taskTree.ts` and `src/lib/workload.ts` from rows the client already has. The SQL views `v_task_progress` and `v_task_workload` are dropped: one implementation, unit-tested, no recursive CTE per request.
- `m_employees.division_id` is dropped. Division lives on each task, and workload filters by task division.
- New policy `project_members_update`: a project PIC, or a Master Hub editor, can change `member_role`.
- `syncProjectMembers` now diffs instead of delete-and-reinsert. Without this, editing a project in Master Hub would reset every role to `member`.
- DB error messages are in English, like the rest of the migrations. UI strings go through i18n (en + id).

## Global Constraints

- Never run `git commit`. The user commits. Each task ends by printing a suggested commit message.
- Commit messages, comments, and docs use a plain human tone with no em dashes (GUIDELINE.md).
- Only one new runtime dependency: `@dnd-kit/core@^6.3.1`, `@dnd-kit/sortable@^10.0.0`, `@dnd-kit/utilities@^3.2.2`.
- Rules that protect data live in SQL (RLS, triggers, RPCs) and are proved in `supabase/tests/board_smoke.sql`. `src/lib/taskPermissions.ts` only hides UI the DB would refuse.
- Pages are flat files in `src/pages/`, registered in `src/router.tsx` with `guarded("board", ...)`. There is one data-access hook file per thing in `src/hooks/`, and components live in `src/components/board/`.
- Every user-facing string goes through `t()`, with keys in both `src/locales/en.json` and `src/locales/id.json`.
- Local Node is 22 while `package.json` pins 24, so `npx` refuses to run inside the repo. Use `pnpm dlx` and `./node_modules/.bin/*`.
- Migration file names: `20261102000000_task_board_schema.sql`, `20261102000100_task_board_workflow.sql`.

## Review Focus

1. **Moving a card into a "done" column before approval.** The card must snap back with a toast, not vanish or stay. UI pre-check in `BoardColumns.onDragEnd`, DB check in `tasks_before_write` (smoke case 12).
2. **New work under an approved node.** Adding a step or subtask, or unticking a step, must reopen that node and every ancestor to `in_progress`. A finished goal must never stay "done" with open parts (smoke case 15).
3. **Editing a project in Master Hub.** Member roles must survive. `syncProjectMembers` diffs instead of delete-all. Check: set a PIC on the board, edit the project's name in Master Hub, and the PIC role is still there.
4. **Self-approval by a PIC or admin who is also an assignee.** It must be refused (smoke case 10, `canReviewTask` unit test).
5. **Two people dragging at once.** Realtime refetch must not undo a drag in progress. `BoardColumns` only resyncs from the server when `active == null`.

---

### Task 1: Scratch database harness for SQL smoke tests

**Files:**
- Create: `supabase/tests/scratch_db.sh` (already in the working tree, untracked; verify it matches)

**Interfaces:**
- Consumes: Docker, image `public.ecr.aws/supabase/postgres:17.11.0.004` (already pulled locally).
- Produces: `supabase/tests/scratch_db.sh <test.sql>` runs one smoke file on a fresh DB with every migration. Run with no argument, it leaves the DB up on port 54377 and prints its URL (used by Task 3).

- [ ] **Step 1: Confirm the file content**

Create `supabase/tests/scratch_db.sh`:

```bash
#!/usr/bin/env bash
# Throwaway Postgres with every migration applied, for the *_smoke.sql tests.
#   supabase/tests/scratch_db.sh supabase/tests/security_smoke.sql
# One test per run: the smoke files commit fixtures that would collide.
# With no test file it leaves the DB running and prints its URL (for gen types).
# Stubs auth.uid()/auth.role() to read test.uid/test.role, and the bits of
# storage the migrations touch. The container is removed on exit.
set -euo pipefail
cd "$(dirname "$0")/../.."
IMAGE=public.ecr.aws/supabase/postgres:17.11.0.004
NAME=workdesk-smoke-$$
PORT=${SMOKE_PORT:-54377}
export PGPASSWORD=postgres
docker run -d --rm --name "$NAME" -e POSTGRES_PASSWORD=postgres -p "$PORT:5432" "$IMAGE" >/dev/null
trap 'docker rm -f "$NAME" >/dev/null' EXIT
psqlx() { psql -h localhost -p "$PORT" -U supabase_admin -d postgres -q -v ON_ERROR_STOP=1 "$@"; }
for _ in $(seq 1 60); do psqlx -c 'select 1' >/dev/null 2>&1 && break; sleep 2; done
sleep 3
psqlx <<'SQL'
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(coalesce(nullif(current_setting('test.uid', true), ''),
                         nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'), '')::uuid $$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('test.role', true), ''),
                  nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role') $$;
ALTER TABLE auth.users
  ADD COLUMN IF NOT EXISTS email_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmation_token text,
  ADD COLUMN IF NOT EXISTS recovery_token text,
  ADD COLUMN IF NOT EXISTS email_change text,
  ADD COLUMN IF NOT EXISTS email_change_token_new text,
  ADD COLUMN IF NOT EXISTS email_change_token_current text,
  ADD COLUMN IF NOT EXISTS banned_until timestamptz,
  ADD COLUMN IF NOT EXISTS last_sign_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_sso_user boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE TABLE IF NOT EXISTS auth.identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, provider_id text,
  identity_data jsonb, provider text, last_sign_in_at timestamptz,
  created_at timestamptz, updated_at timestamptz, email text);
CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY, name text, public boolean, file_size_limit bigint,
  allowed_mime_types text[], owner uuid, created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text,
  owner uuid, owner_id text, metadata jsonb, created_at timestamptz DEFAULT now());
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT ALL ON storage.objects, storage.buckets TO authenticated;
CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[]
  LANGUAGE sql IMMUTABLE AS $$ SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
SQL
for f in supabase/migrations/*.sql; do psqlx -f "$f" >/dev/null; done
if [ $# -eq 0 ]; then
  trap - EXIT
  echo "postgresql://supabase_admin:postgres@localhost:$PORT/postgres  (docker rm -f $NAME when done)"
  exit 0
fi
psqlx -f "$1"
```

- [ ] **Step 2: Run the existing smoke tests through it**

Run each command separately:
```bash
supabase/tests/scratch_db.sh supabase/tests/security_smoke.sql 2>&1 | grep -E "PASSED|ERROR"
supabase/tests/scratch_db.sh supabase/tests/payroll_smoke.sql 2>&1 | grep -E "PASSED|ERROR"
supabase/tests/scratch_db.sh supabase/tests/attendance_attachment_smoke.sql 2>&1 | grep -E "PASSED|ERROR"
```
Expected: `ALL CHECKS PASSED`, `PAYROLL CHECKS PASSED`, `ALL CHECKS PASSED`, and no `ERROR`.

- [ ] **Step 3: Print the suggested commit message (do not commit)**

```
test: add a throwaway Postgres runner for the SQL smoke tests
```


### Task 2: Database: board schema, rules, workflow RPCs, smoke test

**Files:**
- Create: `supabase/tests/board_smoke.sql`
- Create: `supabase/migrations/20261102000000_task_board_schema.sql`
- Create: `supabase/migrations/20261102000100_task_board_workflow.sql`

**Interfaces:**
- Consumes: `has_permission(text,text)`, `is_admin()`, `m_projects`, `m_project_members`, `profiles`, `t_notifications`, `t_daily_tasks`, storage bucket `task-attachments`.
- Produces tables: `m_divisions`, `t_boards`, `t_board_columns`, `t_tasks`, `t_task_assignees`, `t_task_reviewers`, `t_task_steps`, `t_task_labels`, `t_task_label_map`, `t_task_reviews`, `t_task_activity`, `t_board_task_comments`, `t_board_task_attachments`. New columns: `m_project_members.member_role`, `t_daily_tasks.board_task_id`. Feature key `board`.
- Produces RPCs:
  - `ensure_board(p_project_id int) -> t_boards`
  - `move_task(p_task_id bigint, p_column_id int, p_before_id bigint, p_after_id bigint)`
  - `reparent_task(p_task_id bigint, p_new_parent_id bigint, p_column_id int, p_before_id bigint, p_after_id bigint)`
  - `move_step(p_step_id bigint, p_before_id bigint, p_after_id bigint)`
  - `submit_review(p_task_id bigint)`
  - `review_task(p_task_id bigint, p_decision text, p_note text)`
  - `notify_my_overdue() -> int`
- Produces helpers: `is_task_assignee`, `can_work_task`, `can_review_task`, `is_board_member`, `is_board_pic`, `task_lineage`.

- [ ] **Step 1: Write the failing smoke test**

Create `supabase/tests/board_smoke.sql`:

```sql
-- Smoke test for the task board rules (20261102000000_task_board_schema.sql,
-- 20261102000100_task_board_workflow.sql). Commits its fixtures:
--   supabase/tests/scratch_db.sh supabase/tests/board_smoke.sql

\set ON_ERROR_STOP on

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- a1 admin, p1 PIC, r1 reviewer, e1/e2 developers, o1 not in the project.
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
  -- 1. Outsiders cannot open a board; members get one with default columns.
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

  -- 2. Task numbers come from the board, not the client.
  INSERT INTO t_tasks (board_id, column_id, title, task_no, status)
  VALUES (v_board, v_backlog, 'Notifikasi Sistem', 777, 'done') RETURNING id INTO v_root;
  SELECT task_no || ':' || status INTO v_text FROM t_tasks WHERE id = v_root;
  IF v_text <> '1:todo' THEN RAISE EXCEPTION 'FAIL 2: task got %', v_text; END IF;

  -- 3. Assigning: creator may take a fresh card; assignees may add members; never outsiders.
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
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- 4. Unassigning is for whoever assigned, or the PIC.
  PERFORM pg_temp.act_as(e2);
  DELETE FROM t_task_assignees WHERE task_id = v_root AND user_id = e1::uuid;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL 4: e2 removed an assignee e1 added'; END IF;

  -- 5. Outsiders see nothing.
  PERFORM pg_temp.act_as(o1);
  SELECT count(*) INTO v_count FROM t_tasks WHERE board_id = v_board;
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL 5: an outsider can read board tasks'; END IF;

  -- 6. Subtasks: an assignee of the parent may add them; others may not.
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

  -- 7. Ticking steps: assignees of the node or an ancestor only; done_by is stamped.
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

  -- 8. Status shortcuts are refused.
  BEGIN
    UPDATE t_tasks SET status = 'done' WHERE id = v_child;
    RAISE EXCEPTION 'FAIL 8a: status set to done without review';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;
  UPDATE t_tasks SET status = 'in_progress' WHERE id = v_child;

  -- 9. Submit needs finished steps, finished subtasks, and an expected output.
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

  -- 10. Assignees never approve their own work, not even the PIC.
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

  -- 11. Reject needs a note; approve closes the node and notifies assignees.
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

  -- 12. A card only enters a done column once approved.
  PERFORM pg_temp.act_as(e1);
  BEGIN
    PERFORM public.move_task(v_root, v_done, NULL, NULL);
    RAISE EXCEPTION 'FAIL 12a: an open card entered the done column';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;

  -- 13. No cycles.
  BEGIN
    PERFORM public.reparent_task(v_root, v_grand, NULL, NULL, NULL);
    RAISE EXCEPTION 'FAIL 13: a task became a child of its own grandchild';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;

  -- 14. Activity is written by the server only, and it did record the work.
  BEGIN
    INSERT INTO t_task_activity (task_id, action) VALUES (v_root, 'forged');
    RAISE EXCEPTION 'FAIL 14a: a client wrote to the activity log';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  SELECT count(*) INTO v_count FROM t_task_activity WHERE task_id = v_child AND action = 'step_checked';
  IF v_count <> 1 THEN RAISE EXCEPTION 'FAIL 14b: step check not logged'; END IF;

  -- 15. Full loop to the done column, then new work reopens the chain.
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

  -- 16. Moving cards keeps order between neighbours.
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

  -- 17. Members cannot promote themselves; the PIC can set roles.
  PERFORM pg_temp.act_as(e1);
  UPDATE m_project_members SET member_role = 'pic' WHERE project_id = 9101 AND user_id = e1::uuid;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL 17a: a member promoted themselves to PIC'; END IF;
  PERFORM pg_temp.act_as(p1);
  UPDATE m_project_members SET member_role = 'reviewer' WHERE project_id = 9101 AND user_id = e2::uuid;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN RAISE EXCEPTION 'FAIL 17b: the PIC could not set a role'; END IF;

  RESET ROLE;
  RAISE NOTICE 'BOARD CHECKS PASSED';
END;
$$;
```

- [ ] **Step 2: Run it and watch it fail**

```bash
supabase/tests/scratch_db.sh supabase/tests/board_smoke.sql 2>&1 | grep -m1 ERROR
```
Expected: `ERROR:  column "member_role" of relation "m_project_members" does not exist`.

- [ ] **Step 3: Write the schema migration**

Create `supabase/migrations/20261102000000_task_board_schema.sql`:

```sql
-- Task board, part 1: divisions, boards, columns, nested tasks, assignees,
-- reviewers, checklist steps, labels. Access rules live here too, so every
-- table is born with RLS on. RPCs, activity, notifications: next migration.

-- Divisions ------------------------------------------------------------------

CREATE TABLE public.m_divisions (
  id         serial PRIMARY KEY,
  name       text NOT NULL UNIQUE CHECK (length(trim(name)) > 0),
  color      text,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.m_divisions (name, color) VALUES
  ('Backend', '#2563eb'), ('Frontend', '#7c3aed'), ('Mobile', '#0891b2'),
  ('UI/UX', '#db2777'), ('QA', '#16a34a'), ('DevOps', '#ea580c'), ('PM', '#64748b');

ALTER TABLE public.m_project_members
  ADD COLUMN member_role text NOT NULL DEFAULT 'member'
  CHECK (member_role IN ('pic', 'member', 'reviewer'));

ALTER TABLE public.m_divisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY divisions_select ON public.m_divisions FOR SELECT TO authenticated USING (true);
CREATE POLICY divisions_insert ON public.m_divisions FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('master', 'create'));
CREATE POLICY divisions_update ON public.m_divisions FOR UPDATE TO authenticated
  USING (public.has_permission('master', 'update'));
CREATE POLICY divisions_delete ON public.m_divisions FOR DELETE TO authenticated
  USING (public.has_permission('master', 'delete'));

-- Feature key: same defaults per role as the daily report.
INSERT INTO public.m_features (feature_name, feature_key, icon_name, path)
VALUES ('Task Board', 'board', 'SquareKanban', '/boards');

INSERT INTO public.t_role_permissions (role_id, feature_id, can_create, can_read, can_update, can_delete)
SELECT rp.role_id, (SELECT id FROM public.m_features WHERE feature_key = 'board'),
       rp.can_create, rp.can_read, rp.can_update, rp.can_delete
FROM public.t_role_permissions rp
JOIN public.m_features f ON f.id = rp.feature_id
WHERE f.feature_key = 'daily-report';

-- Boards and columns ---------------------------------------------------------

CREATE TABLE public.t_boards (
  id           serial PRIMARY KEY,
  project_id   int NOT NULL UNIQUE REFERENCES public.m_projects(id) ON DELETE CASCADE,
  name         text NOT NULL,
  background   text,
  next_task_no int NOT NULL DEFAULT 1,
  created_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.t_board_columns (
  id             serial PRIMARY KEY,
  board_id       int NOT NULL REFERENCES public.t_boards(id) ON DELETE CASCADE,
  name           text NOT NULL CHECK (length(trim(name)) > 0),
  color          text,
  position       numeric NOT NULL,
  wip_limit      int CHECK (wip_limit IS NULL OR wip_limit > 0),
  is_done_column boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_board_columns_board ON public.t_board_columns (board_id, position);

-- Tasks: one table for every level of the tree ------------------------------

CREATE TABLE public.t_tasks (
  id              bigserial PRIMARY KEY,
  board_id        int NOT NULL REFERENCES public.t_boards(id) ON DELETE CASCADE,
  column_id       int REFERENCES public.t_board_columns(id) ON DELETE RESTRICT,
  parent_id       bigint REFERENCES public.t_tasks(id) ON DELETE CASCADE,
  root_id         bigint NOT NULL DEFAULT 0,  -- set by tasks_before_write()
  depth           int NOT NULL DEFAULT 0,
  task_no         int NOT NULL DEFAULT 0,
  title           text NOT NULL CHECK (length(trim(title)) > 0),
  description     text,
  expected_output text,
  division_id     int REFERENCES public.m_divisions(id) ON DELETE SET NULL,
  priority        text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  start_date      date,
  due_date        date,
  estimate_hours  numeric(6,2) CHECK (estimate_hours IS NULL OR estimate_hours >= 0),
  status          text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'in_review', 'done')),
  position        numeric NOT NULL DEFAULT 0,
  created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  completed_at    timestamptz,
  completed_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  archived_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tasks_dates_order CHECK (due_date IS NULL OR start_date IS NULL OR due_date >= start_date),
  -- Only a root card sits in a column; children live inside their parent.
  CONSTRAINT tasks_root_has_column CHECK ((parent_id IS NULL) = (column_id IS NOT NULL)),
  CONSTRAINT tasks_board_no_key UNIQUE (board_id, task_no)
);
CREATE INDEX idx_tasks_column ON public.t_tasks (board_id, column_id, position);
CREATE INDEX idx_tasks_parent ON public.t_tasks (parent_id, position);
CREATE INDEX idx_tasks_root ON public.t_tasks (root_id);
CREATE INDEX idx_tasks_open_due ON public.t_tasks (due_date) WHERE status <> 'done';

CREATE TABLE public.t_task_assignees (
  task_id     bigint NOT NULL REFERENCES public.t_tasks(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, user_id)
);
CREATE INDEX idx_task_assignees_user ON public.t_task_assignees (user_id);

CREATE TABLE public.t_task_reviewers (
  task_id bigint NOT NULL REFERENCES public.t_tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, user_id)
);

CREATE TABLE public.t_task_steps (
  id         bigserial PRIMARY KEY,
  task_id    bigint NOT NULL REFERENCES public.t_tasks(id) ON DELETE CASCADE,
  title      text NOT NULL CHECK (length(trim(title)) > 0),
  note       text,
  position   numeric NOT NULL DEFAULT 0,
  is_done    boolean NOT NULL DEFAULT false,
  done_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  done_at    timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_task_steps_task ON public.t_task_steps (task_id, position);

CREATE TABLE public.t_task_labels (
  id       serial PRIMARY KEY,
  board_id int NOT NULL REFERENCES public.t_boards(id) ON DELETE CASCADE,
  name     text NOT NULL CHECK (length(trim(name)) > 0),
  color    text NOT NULL DEFAULT '#64748b',
  UNIQUE (board_id, name)
);

CREATE TABLE public.t_task_label_map (
  task_id  bigint NOT NULL REFERENCES public.t_tasks(id) ON DELETE CASCADE,
  label_id int NOT NULL REFERENCES public.t_task_labels(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, label_id)
);

-- Access helpers -------------------------------------------------------------
-- SECURITY DEFINER so policies can call them without recursing into RLS.

CREATE FUNCTION public.board_project(p_board_id int) RETURNS int
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT project_id FROM t_boards WHERE id = p_board_id;
$$;

CREATE FUNCTION public.task_board(p_task_id bigint) RETURNS int
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT board_id FROM t_tasks WHERE id = p_task_id;
$$;

CREATE FUNCTION public.is_project_member(p_project_id int) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.is_admin() OR EXISTS (
    SELECT 1 FROM m_project_members WHERE project_id = p_project_id AND user_id = auth.uid());
$$;

CREATE FUNCTION public.is_project_pic(p_project_id int) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.is_admin() OR EXISTS (
    SELECT 1 FROM m_project_members
    WHERE project_id = p_project_id AND user_id = auth.uid() AND member_role = 'pic');
$$;

CREATE FUNCTION public.is_board_member(p_board_id int) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.is_project_member(public.board_project(p_board_id));
$$;

CREATE FUNCTION public.is_board_pic(p_board_id int) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.is_project_pic(public.board_project(p_board_id));
$$;

-- The task itself plus every ancestor up to the root.
CREATE FUNCTION public.task_lineage(p_task_id bigint) RETURNS TABLE (id bigint)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH RECURSIVE up AS (
    SELECT t.id, t.parent_id FROM t_tasks t WHERE t.id = p_task_id
    UNION ALL
    SELECT t.id, t.parent_id FROM t_tasks t JOIN up ON t.id = up.parent_id
  )
  SELECT up.id FROM up;
$$;

-- Assigned to this node or to any ancestor: owning a goal means owning its parts.
CREATE FUNCTION public.is_task_assignee(p_task_id bigint) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM t_task_assignees a
    WHERE a.user_id = auth.uid() AND a.task_id IN (SELECT id FROM public.task_lineage(p_task_id)));
$$;

CREATE FUNCTION public.can_work_task(p_task_id bigint) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.is_task_assignee(p_task_id) OR public.is_board_pic(public.task_board(p_task_id));
$$;

-- Named reviewers win; with none named, any PIC or reviewer of the project.
-- A direct assignee never reviews their own node, admins included.
CREATE FUNCTION public.can_review_task(p_task_id bigint) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT NOT EXISTS (SELECT 1 FROM t_task_assignees WHERE task_id = p_task_id AND user_id = auth.uid())
     AND (
       EXISTS (SELECT 1 FROM t_task_reviewers WHERE task_id = p_task_id AND user_id = auth.uid())
       OR (NOT EXISTS (SELECT 1 FROM t_task_reviewers WHERE task_id = p_task_id)
           AND (public.is_admin() OR EXISTS (
             SELECT 1 FROM m_project_members
             WHERE project_id = public.board_project(public.task_board(p_task_id))
               AND user_id = auth.uid() AND member_role IN ('pic', 'reviewer'))))
     );
$$;

-- Triggers -------------------------------------------------------------------
-- RPCs run as the owner, so current_user = 'authenticated' means "a direct
-- write from the client" and is what the guards below refuse.

CREATE FUNCTION public.guard_board_counter() RETURNS trigger
  LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF current_user = 'authenticated' AND NEW.next_task_no IS DISTINCT FROM OLD.next_task_no THEN
    RAISE EXCEPTION 'Task numbers are assigned by the system';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_guard_board_counter BEFORE UPDATE ON public.t_boards
  FOR EACH ROW EXECUTE FUNCTION public.guard_board_counter();

-- The counter is bumped as the owner; the guard above only stops clients.
CREATE FUNCTION public.take_task_no(p_board_id int) RETURNS int
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_no int;
BEGIN
  IF pg_trigger_depth() = 0 THEN
    RAISE EXCEPTION 'Task numbers are assigned by the system';
  END IF;
  UPDATE t_boards SET next_task_no = next_task_no + 1
  WHERE id = p_board_id RETURNING next_task_no - 1 INTO v_no;
  RETURN v_no;
END;
$$;

-- Not SECURITY DEFINER: current_user must stay 'authenticated' for the guard.
CREATE FUNCTION public.tasks_before_write() RETURNS trigger
  LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE
  v_parent t_tasks%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.board_id <> OLD.board_id THEN
    RAISE EXCEPTION 'A task cannot move to another board';
  END IF;

  IF NEW.parent_id IS NULL THEN
    NEW.root_id := NEW.id;
    NEW.depth := 0;
    IF NOT EXISTS (SELECT 1 FROM t_board_columns WHERE id = NEW.column_id AND board_id = NEW.board_id) THEN
      RAISE EXCEPTION 'That column belongs to another board';
    END IF;
  ELSE
    SELECT * INTO v_parent FROM t_tasks WHERE id = NEW.parent_id;
    IF v_parent.board_id <> NEW.board_id THEN
      RAISE EXCEPTION 'The parent task is on another board';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.parent_id IS DISTINCT FROM OLD.parent_id
       AND NEW.id IN (SELECT id FROM public.task_lineage(NEW.parent_id)) THEN
      RAISE EXCEPTION 'A task cannot become a subtask of its own subtask';
    END IF;
    NEW.root_id := v_parent.root_id;
    NEW.depth := v_parent.depth + 1;
    NEW.column_id := NULL;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.task_no := public.take_task_no(NEW.board_id);
    NEW.created_by := COALESCE(auth.uid(), NEW.created_by);
    -- A new node starts open whatever the client sent.
    NEW.status := 'todo';
    NEW.completed_at := NULL;
    NEW.completed_by := NULL;
  ELSE
    IF current_user = 'authenticated' AND (
         NEW.status IS DISTINCT FROM OLD.status AND NOT (
           NEW.status IN ('todo', 'in_progress') AND OLD.status IN ('todo', 'in_progress'))
         OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
         OR NEW.completed_by IS DISTINCT FROM OLD.completed_by
         OR NEW.task_no IS DISTINCT FROM OLD.task_no
         OR NEW.created_by IS DISTINCT FROM OLD.created_by) THEN
      RAISE EXCEPTION 'Review status and completion change only through submit and review';
    END IF;
    NEW.updated_at := now();
  END IF;

  -- Checked on entry only: a done card reopened by new work stays put.
  IF NEW.parent_id IS NULL AND NEW.status <> 'done'
     AND (TG_OP = 'INSERT' OR NEW.column_id IS DISTINCT FROM OLD.column_id)
     AND EXISTS (SELECT 1 FROM t_board_columns WHERE id = NEW.column_id AND is_done_column) THEN
    RAISE EXCEPTION 'Only an approved task can go into a done column';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_tasks_before_write BEFORE INSERT OR UPDATE ON public.t_tasks
  FOR EACH ROW EXECUTE FUNCTION public.tasks_before_write();

-- Reparenting moves a whole subtree: refresh root_id/depth below it.
CREATE FUNCTION public.tasks_after_reparent() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  WITH RECURSIVE down AS (
    SELECT c.id, NEW.depth + 1 AS depth FROM t_tasks c WHERE c.parent_id = NEW.id
    UNION ALL
    SELECT c.id, down.depth + 1 FROM t_tasks c JOIN down ON c.parent_id = down.id
  )
  UPDATE t_tasks t SET root_id = NEW.root_id, depth = down.depth
  FROM down WHERE t.id = down.id AND (t.root_id <> NEW.root_id OR t.depth <> down.depth);
  RETURN NULL;
END;
$$;
CREATE TRIGGER trg_tasks_after_reparent AFTER UPDATE OF parent_id ON public.t_tasks
  FOR EACH ROW WHEN (NEW.parent_id IS DISTINCT FROM OLD.parent_id)
  EXECUTE FUNCTION public.tasks_after_reparent();

CREATE FUNCTION public.guard_column_delete() RETURNS trigger
  LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM t_tasks WHERE column_id = OLD.id) THEN
    RAISE EXCEPTION 'Move the tasks out of this column first';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER trg_guard_column_delete BEFORE DELETE ON public.t_board_columns
  FOR EACH ROW EXECUTE FUNCTION public.guard_column_delete();

-- Assignees must belong to the project; who assigned is always the caller.
CREATE FUNCTION public.task_assignees_before_insert() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM m_project_members
    WHERE project_id = public.board_project(public.task_board(NEW.task_id)) AND user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'That user is not a member of this project';
  END IF;
  NEW.assigned_by := COALESCE(auth.uid(), NEW.assigned_by);
  NEW.assigned_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_task_assignees_before_insert BEFORE INSERT ON public.t_task_assignees
  FOR EACH ROW EXECUTE FUNCTION public.task_assignees_before_insert();

CREATE FUNCTION public.task_reviewers_before_insert() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM m_project_members
    WHERE project_id = public.board_project(public.task_board(NEW.task_id)) AND user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'That reviewer is not a member of this project';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_task_reviewers_before_insert BEFORE INSERT ON public.t_task_reviewers
  FOR EACH ROW EXECUTE FUNCTION public.task_reviewers_before_insert();

-- Who ticked a step is stamped by the server, never trusted from the client.
CREATE FUNCTION public.task_steps_before_write() RETURNS trigger
  LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(auth.uid(), NEW.created_by);
    NEW.is_done := false;
    NEW.done_by := NULL;
    NEW.done_at := NULL;
    RETURN NEW;
  END IF;
  IF NEW.task_id <> OLD.task_id THEN
    RAISE EXCEPTION 'A step cannot move to another task';
  END IF;
  IF NEW.is_done IS DISTINCT FROM OLD.is_done THEN
    NEW.done_by := CASE WHEN NEW.is_done THEN auth.uid() END;
    NEW.done_at := CASE WHEN NEW.is_done THEN now() END;
  ELSE
    NEW.done_by := OLD.done_by;
    NEW.done_at := OLD.done_at;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_task_steps_before_write BEFORE INSERT OR UPDATE ON public.t_task_steps
  FOR EACH ROW EXECUTE FUNCTION public.task_steps_before_write();

-- RLS ------------------------------------------------------------------------

ALTER TABLE public.t_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t_board_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t_task_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t_task_reviewers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t_task_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t_task_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t_task_label_map ENABLE ROW LEVEL SECURITY;

-- Roles inside a project: Master Hub editors, or the project's own PIC.
CREATE POLICY project_members_update ON public.m_project_members FOR UPDATE TO authenticated
  USING (public.has_permission('master', 'update') OR public.is_project_pic(project_id))
  WITH CHECK (public.has_permission('master', 'update') OR public.is_project_pic(project_id));

-- Boards are created by ensure_board(), never inserted directly.
CREATE POLICY boards_select ON public.t_boards FOR SELECT TO authenticated
  USING (public.has_permission('board', 'read') AND public.is_project_member(project_id));
CREATE POLICY boards_update ON public.t_boards FOR UPDATE TO authenticated
  USING (public.is_project_pic(project_id)) WITH CHECK (public.is_project_pic(project_id));

CREATE POLICY board_columns_select ON public.t_board_columns FOR SELECT TO authenticated
  USING (public.has_permission('board', 'read') AND public.is_board_member(board_id));
CREATE POLICY board_columns_insert ON public.t_board_columns FOR INSERT TO authenticated
  WITH CHECK (public.is_board_pic(board_id));
CREATE POLICY board_columns_update ON public.t_board_columns FOR UPDATE TO authenticated
  USING (public.is_board_pic(board_id)) WITH CHECK (public.is_board_pic(board_id));
CREATE POLICY board_columns_delete ON public.t_board_columns FOR DELETE TO authenticated
  USING (public.is_board_pic(board_id));

CREATE POLICY tasks_select ON public.t_tasks FOR SELECT TO authenticated
  USING (public.has_permission('board', 'read') AND public.is_board_member(board_id));
CREATE POLICY tasks_insert ON public.t_tasks FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission('board', 'create') AND public.is_board_member(board_id)
    AND (parent_id IS NULL OR public.can_work_task(parent_id)));
CREATE POLICY tasks_update ON public.t_tasks FOR UPDATE TO authenticated
  USING (public.can_work_task(id) OR created_by = auth.uid())
  WITH CHECK (public.is_board_member(board_id));
CREATE POLICY tasks_delete ON public.t_tasks FOR DELETE TO authenticated
  USING (
    public.is_board_pic(board_id)
    OR (created_by = auth.uid()
        AND NOT EXISTS (SELECT 1 FROM t_tasks c WHERE c.parent_id = t_tasks.id)
        AND NOT EXISTS (SELECT 1 FROM t_task_assignees a WHERE a.task_id = t_tasks.id AND a.user_id <> auth.uid())));

CREATE POLICY task_assignees_select ON public.t_task_assignees FOR SELECT TO authenticated
  USING (public.is_board_member(public.task_board(task_id)));
CREATE POLICY task_assignees_insert ON public.t_task_assignees FOR INSERT TO authenticated
  WITH CHECK (
    public.can_work_task(task_id)
    -- The creator may take or hand out a fresh, still unassigned node.
    OR (NOT EXISTS (SELECT 1 FROM t_task_assignees a WHERE a.task_id = t_task_assignees.task_id)
        AND EXISTS (SELECT 1 FROM t_tasks t WHERE t.id = task_id AND t.created_by = auth.uid())));
CREATE POLICY task_assignees_delete ON public.t_task_assignees FOR DELETE TO authenticated
  USING (assigned_by = auth.uid() OR public.is_board_pic(public.task_board(task_id)));

CREATE POLICY task_reviewers_select ON public.t_task_reviewers FOR SELECT TO authenticated
  USING (public.is_board_member(public.task_board(task_id)));
CREATE POLICY task_reviewers_insert ON public.t_task_reviewers FOR INSERT TO authenticated
  WITH CHECK (public.is_board_pic(public.task_board(task_id)));
CREATE POLICY task_reviewers_delete ON public.t_task_reviewers FOR DELETE TO authenticated
  USING (public.is_board_pic(public.task_board(task_id)));

CREATE POLICY task_steps_select ON public.t_task_steps FOR SELECT TO authenticated
  USING (public.is_board_member(public.task_board(task_id)));
CREATE POLICY task_steps_insert ON public.t_task_steps FOR INSERT TO authenticated
  WITH CHECK (public.can_work_task(task_id));
CREATE POLICY task_steps_update ON public.t_task_steps FOR UPDATE TO authenticated
  USING (public.can_work_task(task_id)) WITH CHECK (public.can_work_task(task_id));
CREATE POLICY task_steps_delete ON public.t_task_steps FOR DELETE TO authenticated
  USING (public.can_work_task(task_id));

CREATE POLICY task_labels_select ON public.t_task_labels FOR SELECT TO authenticated
  USING (public.is_board_member(board_id));
CREATE POLICY task_labels_write ON public.t_task_labels FOR ALL TO authenticated
  USING (public.is_board_pic(board_id)) WITH CHECK (public.is_board_pic(board_id));

CREATE POLICY task_label_map_select ON public.t_task_label_map FOR SELECT TO authenticated
  USING (public.is_board_member(public.task_board(task_id)));
CREATE POLICY task_label_map_write ON public.t_task_label_map FOR ALL TO authenticated
  USING (public.can_work_task(task_id)) WITH CHECK (public.can_work_task(task_id));

ALTER PUBLICATION supabase_realtime ADD TABLE
  public.t_board_columns, public.t_tasks, public.t_task_assignees, public.t_task_steps;
```

- [ ] **Step 4: Write the workflow migration**

Create `supabase/migrations/20261102000100_task_board_workflow.sql`:

```sql
-- Task board, part 2: reviews, activity trail, comments, attachments,
-- notifications, and the RPCs that move cards and close the review loop.

CREATE TABLE public.t_task_reviews (
  id          bigserial PRIMARY KEY,
  task_id     bigint NOT NULL REFERENCES public.t_tasks(id) ON DELETE CASCADE,
  reviewer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decision    text NOT NULL CHECK (decision IN ('approved', 'rejected')),
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_task_reviews_task ON public.t_task_reviews (task_id, created_at DESC);

CREATE TABLE public.t_task_activity (
  id         bigserial PRIMARY KEY,
  task_id    bigint NOT NULL REFERENCES public.t_tasks(id) ON DELETE CASCADE,
  actor_id   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action     text NOT NULL,
  detail     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_task_activity_task ON public.t_task_activity (task_id, created_at DESC);

CREATE TABLE public.t_board_task_comments (
  id         bigserial PRIMARY KEY,
  task_id    bigint NOT NULL REFERENCES public.t_tasks(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  comment    text NOT NULL CHECK (length(trim(comment)) > 0),
  mentions   uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at  timestamptz
);
CREATE INDEX idx_board_task_comments_task ON public.t_board_task_comments (task_id, created_at);

CREATE TABLE public.t_board_task_attachments (
  id          bigserial PRIMARY KEY,
  task_id     bigint NOT NULL REFERENCES public.t_tasks(id) ON DELETE CASCADE,
  file_path   text NOT NULL,
  file_name   text NOT NULL,
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_board_task_attachments_task ON public.t_board_task_attachments (task_id);

ALTER TABLE public.t_daily_tasks
  ADD COLUMN board_task_id bigint REFERENCES public.t_tasks(id) ON DELETE SET NULL;
CREATE INDEX idx_daily_tasks_board_task ON public.t_daily_tasks (board_task_id);

-- Helpers --------------------------------------------------------------------

CREATE FUNCTION public.task_link(p_task_id bigint) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT '/boards/' || board_id || '?task=' || task_no FROM t_tasks WHERE id = p_task_id;
$$;

CREATE FUNCTION public.task_label(p_task_id bigint) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT '#' || task_no || ' ' || left(title, 120) FROM t_tasks WHERE id = p_task_id;
$$;

CREATE FUNCTION public.actor_name() RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE((SELECT full_name FROM profiles WHERE id = auth.uid()), 'Someone');
$$;

CREATE FUNCTION public.log_task_activity(p_task_id bigint, p_action text, p_detail jsonb)
  RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  -- Rows cascading away with their task have nothing left to attach to.
  INSERT INTO t_task_activity (task_id, actor_id, action, detail)
  SELECT p_task_id, auth.uid(), p_action, COALESCE(p_detail, '{}'::jsonb)
  WHERE EXISTS (SELECT 1 FROM t_tasks WHERE id = p_task_id);
$$;

CREATE FUNCTION public.notify_user(p_user uuid, p_title text, p_task_id bigint)
  RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  INSERT INTO t_notifications (user_id, title, body, link)
  SELECT p_user, p_title, public.task_label(p_task_id), public.task_link(p_task_id)
  WHERE p_user IS DISTINCT FROM auth.uid()
    AND EXISTS (SELECT 1 FROM t_tasks WHERE id = p_task_id);
$$;

-- Any new work under a closed node reopens it and everything above it.
CREATE FUNCTION public.reopen_lineage(p_task_id bigint) RETURNS void
  LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  UPDATE t_tasks SET status = 'in_progress', completed_at = NULL, completed_by = NULL
  WHERE id IN (SELECT id FROM public.task_lineage(p_task_id))
    AND status IN ('in_review', 'done');
$$;

-- Position between two siblings. Renumbers the sibling list once the gap
-- runs out, so fractional keys never lose precision.
CREATE FUNCTION public.slot_task(p_task_id bigint, p_column_id int, p_parent_id bigint,
                                 p_before_id bigint, p_after_id bigint)
  RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_board  int := public.task_board(p_task_id);
  v_before numeric;
  v_after  numeric;
BEGIN
  FOR i IN 1..2 LOOP
    SELECT position INTO v_before FROM t_tasks WHERE id = p_before_id;
    SELECT position INTO v_after FROM t_tasks WHERE id = p_after_id;
    IF v_before IS NULL OR v_after IS NULL OR v_after - v_before > 0.000001 THEN EXIT; END IF;
    WITH ordered AS (
      SELECT id, row_number() OVER (ORDER BY position, id) * 1024 AS pos
      FROM t_tasks
      WHERE board_id = v_board AND id <> p_task_id
        AND parent_id IS NOT DISTINCT FROM p_parent_id
        AND column_id IS NOT DISTINCT FROM p_column_id)
    UPDATE t_tasks t SET position = ordered.pos FROM ordered WHERE t.id = ordered.id;
  END LOOP;
  RETURN CASE
    WHEN v_before IS NULL AND v_after IS NULL THEN 1024
    WHEN v_before IS NULL THEN v_after - 1024
    WHEN v_after IS NULL THEN v_before + 1024
    ELSE (v_before + v_after) / 2
  END;
END;
$$;

-- Activity + notification triggers -------------------------------------------

CREATE FUNCTION public.tasks_after_write() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_new jsonb := to_jsonb(NEW);
  v_old jsonb;
  v_field text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_task_activity(NEW.id, 'created',
      jsonb_build_object('title', NEW.title, 'parent_id', NEW.parent_id));
    IF NEW.parent_id IS NOT NULL THEN
      PERFORM public.reopen_lineage(NEW.parent_id);
    END IF;
    RETURN NULL;
  END IF;

  v_old := to_jsonb(OLD);
  FOREACH v_field IN ARRAY ARRAY['title', 'description', 'expected_output', 'division_id',
    'priority', 'start_date', 'due_date', 'estimate_hours', 'status'] LOOP
    IF v_new -> v_field IS DISTINCT FROM v_old -> v_field THEN
      PERFORM public.log_task_activity(NEW.id, 'updated',
        jsonb_build_object('field', v_field, 'from', v_old -> v_field, 'to', v_new -> v_field));
    END IF;
  END LOOP;
  IF NEW.column_id IS DISTINCT FROM OLD.column_id THEN
    PERFORM public.log_task_activity(NEW.id, 'moved',
      jsonb_build_object('from', OLD.column_id, 'to', NEW.column_id));
  END IF;
  IF NEW.parent_id IS DISTINCT FROM OLD.parent_id THEN
    PERFORM public.log_task_activity(NEW.id, 'reparented',
      jsonb_build_object('from', OLD.parent_id, 'to', NEW.parent_id));
    IF NEW.parent_id IS NOT NULL AND NEW.status <> 'done' THEN
      PERFORM public.reopen_lineage(NEW.parent_id);
    END IF;
  END IF;
  IF NEW.archived_at IS DISTINCT FROM OLD.archived_at THEN
    PERFORM public.log_task_activity(NEW.id,
      CASE WHEN NEW.archived_at IS NULL THEN 'restored' ELSE 'archived' END, '{}'::jsonb);
  END IF;
  -- A child leaving "done" means its parent is no longer finished either.
  IF OLD.status = 'done' AND NEW.status <> 'done' AND NEW.parent_id IS NOT NULL THEN
    PERFORM public.reopen_lineage(NEW.parent_id);
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER trg_tasks_after_write AFTER INSERT OR UPDATE ON public.t_tasks
  FOR EACH ROW EXECUTE FUNCTION public.tasks_after_write();

CREATE FUNCTION public.task_assignees_after_write() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_task_activity(NEW.task_id, 'assigned', jsonb_build_object('user_id', NEW.user_id));
    PERFORM public.notify_user(NEW.user_id, public.actor_name() || ' assigned you a task', NEW.task_id);
    RETURN NULL;
  END IF;
  PERFORM public.log_task_activity(OLD.task_id, 'unassigned', jsonb_build_object('user_id', OLD.user_id));
  PERFORM public.notify_user(OLD.user_id, public.actor_name() || ' removed you from a task', OLD.task_id);
  RETURN NULL;
END;
$$;
CREATE TRIGGER trg_task_assignees_after_write AFTER INSERT OR DELETE ON public.t_task_assignees
  FOR EACH ROW EXECUTE FUNCTION public.task_assignees_after_write();

CREATE FUNCTION public.task_steps_after_write() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_task_activity(NEW.task_id, 'step_added', jsonb_build_object('step_id', NEW.id, 'title', NEW.title));
    PERFORM public.reopen_lineage(NEW.task_id);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_task_activity(OLD.task_id, 'step_removed', jsonb_build_object('title', OLD.title));
  ELSIF NEW.is_done IS DISTINCT FROM OLD.is_done THEN
    PERFORM public.log_task_activity(NEW.task_id,
      CASE WHEN NEW.is_done THEN 'step_checked' ELSE 'step_unchecked' END,
      jsonb_build_object('step_id', NEW.id, 'title', NEW.title));
    IF NOT NEW.is_done THEN
      PERFORM public.reopen_lineage(NEW.task_id);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER trg_task_steps_after_write AFTER INSERT OR UPDATE OR DELETE ON public.t_task_steps
  FOR EACH ROW EXECUTE FUNCTION public.task_steps_after_write();

CREATE FUNCTION public.board_task_comments_after_insert() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_mentioned uuid;
BEGIN
  PERFORM public.log_task_activity(NEW.task_id, 'commented', jsonb_build_object('comment_id', NEW.id));
  FOREACH v_mentioned IN ARRAY (SELECT ARRAY(SELECT DISTINCT unnest(NEW.mentions))) LOOP
    IF EXISTS (SELECT 1 FROM profiles WHERE id = v_mentioned) THEN
      PERFORM public.notify_user(v_mentioned, public.actor_name() || ' mentioned you on a task', NEW.task_id);
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;
CREATE TRIGGER trg_board_task_comments_after_insert AFTER INSERT ON public.t_board_task_comments
  FOR EACH ROW EXECUTE FUNCTION public.board_task_comments_after_insert();

-- RPCs -----------------------------------------------------------------------

CREATE FUNCTION public.ensure_board(p_project_id int) RETURNS public.t_boards
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_board t_boards%ROWTYPE;
BEGIN
  IF NOT (public.has_permission('board', 'read') AND public.is_project_member(p_project_id)) THEN
    RAISE EXCEPTION 'You are not a member of this project';
  END IF;
  SELECT * INTO v_board FROM t_boards WHERE project_id = p_project_id;
  IF FOUND THEN RETURN v_board; END IF;

  INSERT INTO t_boards (project_id, name, created_by)
  SELECT id, project_name, auth.uid() FROM m_projects WHERE id = p_project_id
  ON CONFLICT (project_id) DO NOTHING
  RETURNING * INTO v_board;
  IF v_board.id IS NULL THEN
    SELECT * INTO v_board FROM t_boards WHERE project_id = p_project_id;
    RETURN v_board;
  END IF;

  INSERT INTO t_board_columns (board_id, name, position, is_done_column)
  SELECT v_board.id, c.name, c.ord * 1024, c.name = 'Done'
  FROM unnest(ARRAY['Backlog', 'Current Sprint', 'Running', 'Bug', 'Ready to Test', 'Done'])
       WITH ORDINALITY AS c(name, ord);
  RETURN v_board;
END;
$$;

-- p_before_id / p_after_id: the cards that will sit above and below.
CREATE FUNCTION public.move_task(p_task_id bigint, p_column_id int,
                                 p_before_id bigint DEFAULT NULL, p_after_id bigint DEFAULT NULL)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_task t_tasks%ROWTYPE;
BEGIN
  SELECT * INTO v_task FROM t_tasks WHERE id = p_task_id;
  IF NOT FOUND OR NOT public.can_work_task(p_task_id) THEN
    RAISE EXCEPTION 'Only an assignee or the project PIC can move this task';
  END IF;
  IF v_task.parent_id IS NOT NULL THEN
    RAISE EXCEPTION 'Subtasks move inside their parent, not between columns';
  END IF;
  UPDATE t_tasks
  SET column_id = p_column_id,
      position = public.slot_task(p_task_id, p_column_id, NULL, p_before_id, p_after_id)
  WHERE id = p_task_id;
END;
$$;

-- p_new_parent_id NULL promotes the node to a card in p_column_id.
CREATE FUNCTION public.reparent_task(p_task_id bigint, p_new_parent_id bigint, p_column_id int DEFAULT NULL,
                                     p_before_id bigint DEFAULT NULL, p_after_id bigint DEFAULT NULL)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.can_work_task(p_task_id) THEN
    RAISE EXCEPTION 'Only an assignee or the project PIC can move this task';
  END IF;
  IF p_new_parent_id IS NOT NULL AND NOT public.can_work_task(p_new_parent_id) THEN
    RAISE EXCEPTION 'You cannot add subtasks under that task';
  END IF;
  IF p_new_parent_id IS NULL AND p_column_id IS NULL THEN
    RAISE EXCEPTION 'Pick a column for a top-level task';
  END IF;
  UPDATE t_tasks
  SET parent_id = p_new_parent_id,
      column_id = CASE WHEN p_new_parent_id IS NULL THEN p_column_id END,
      position = public.slot_task(p_task_id, CASE WHEN p_new_parent_id IS NULL THEN p_column_id END,
                                  p_new_parent_id, p_before_id, p_after_id)
  WHERE id = p_task_id;
END;
$$;

CREATE FUNCTION public.move_step(p_step_id bigint, p_before_id bigint DEFAULT NULL, p_after_id bigint DEFAULT NULL)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_task   bigint;
  v_before numeric;
  v_after  numeric;
BEGIN
  SELECT task_id INTO v_task FROM t_task_steps WHERE id = p_step_id;
  IF v_task IS NULL OR NOT public.can_work_task(v_task) THEN
    RAISE EXCEPTION 'Only an assignee or the project PIC can reorder steps';
  END IF;
  SELECT position INTO v_before FROM t_task_steps WHERE id = p_before_id AND task_id = v_task;
  SELECT position INTO v_after FROM t_task_steps WHERE id = p_after_id AND task_id = v_task;
  IF v_before IS NOT NULL AND v_after IS NOT NULL AND v_after - v_before <= 0.000001 THEN
    WITH ordered AS (
      SELECT id, row_number() OVER (ORDER BY position, id) * 1024 AS pos
      FROM t_task_steps WHERE task_id = v_task AND id <> p_step_id)
    UPDATE t_task_steps s SET position = ordered.pos FROM ordered WHERE s.id = ordered.id;
    SELECT position INTO v_before FROM t_task_steps WHERE id = p_before_id;
    SELECT position INTO v_after FROM t_task_steps WHERE id = p_after_id;
  END IF;
  UPDATE t_task_steps SET position = CASE
    WHEN v_before IS NULL AND v_after IS NULL THEN 1024
    WHEN v_before IS NULL THEN v_after - 1024
    WHEN v_after IS NULL THEN v_before + 1024
    ELSE (v_before + v_after) / 2 END
  WHERE id = p_step_id;
END;
$$;

CREATE FUNCTION public.submit_review(p_task_id bigint) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_task t_tasks%ROWTYPE;
  v_reviewer uuid;
BEGIN
  SELECT * INTO v_task FROM t_tasks WHERE id = p_task_id;
  IF NOT FOUND OR NOT public.is_task_assignee(p_task_id) THEN
    RAISE EXCEPTION 'Only an assignee can submit this task for review';
  END IF;
  IF v_task.status IN ('in_review', 'done') THEN
    RAISE EXCEPTION 'This task is already in review or done';
  END IF;
  IF COALESCE(trim(v_task.expected_output), '') = '' THEN
    RAISE EXCEPTION 'Fill in the expected output before submitting';
  END IF;
  IF EXISTS (SELECT 1 FROM t_task_steps WHERE task_id = p_task_id AND NOT is_done) THEN
    RAISE EXCEPTION 'Finish every step before submitting';
  END IF;
  IF EXISTS (SELECT 1 FROM t_tasks WHERE parent_id = p_task_id AND status <> 'done' AND archived_at IS NULL) THEN
    RAISE EXCEPTION 'Every subtask must be approved first';
  END IF;

  UPDATE t_tasks SET status = 'in_review' WHERE id = p_task_id;
  PERFORM public.log_task_activity(p_task_id, 'submitted_review', '{}'::jsonb);

  FOR v_reviewer IN
    SELECT user_id FROM t_task_reviewers WHERE task_id = p_task_id
    UNION
    SELECT m.user_id FROM m_project_members m
    WHERE m.project_id = public.board_project(v_task.board_id)
      AND m.member_role IN ('pic', 'reviewer')
      AND NOT EXISTS (SELECT 1 FROM t_task_reviewers WHERE task_id = p_task_id)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM t_task_assignees WHERE task_id = p_task_id AND user_id = v_reviewer) THEN
      PERFORM public.notify_user(v_reviewer, public.actor_name() || ' asked you to review a task', p_task_id);
    END IF;
  END LOOP;
END;
$$;

CREATE FUNCTION public.review_task(p_task_id bigint, p_decision text, p_note text DEFAULT NULL)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_status   text;
  v_assignee uuid;
BEGIN
  SELECT status INTO v_status FROM t_tasks WHERE id = p_task_id;
  IF v_status IS DISTINCT FROM 'in_review' THEN
    RAISE EXCEPTION 'This task is not waiting for review';
  END IF;
  IF NOT public.can_review_task(p_task_id) THEN
    RAISE EXCEPTION 'You cannot review this task';
  END IF;
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Decision must be approved or rejected';
  END IF;
  IF p_decision = 'rejected' AND COALESCE(trim(p_note), '') = '' THEN
    RAISE EXCEPTION 'Say what needs fixing when you reject';
  END IF;

  INSERT INTO t_task_reviews (task_id, reviewer_id, decision, note)
  VALUES (p_task_id, auth.uid(), p_decision, NULLIF(trim(p_note), ''));

  UPDATE t_tasks SET
    status = CASE WHEN p_decision = 'approved' THEN 'done' ELSE 'in_progress' END,
    completed_at = CASE WHEN p_decision = 'approved' THEN now() END,
    completed_by = CASE WHEN p_decision = 'approved' THEN auth.uid() END
  WHERE id = p_task_id;
  PERFORM public.log_task_activity(p_task_id, p_decision, jsonb_build_object('note', p_note));

  FOR v_assignee IN SELECT user_id FROM t_task_assignees WHERE task_id = p_task_id LOOP
    PERFORM public.notify_user(v_assignee,
      public.actor_name() || CASE WHEN p_decision = 'approved' THEN ' approved your task' ELSE ' sent your task back' END,
      p_task_id);
  END LOOP;
END;
$$;

-- Called by the client once per app load; at most one reminder per task per day.
CREATE FUNCTION public.notify_my_overdue() RETURNS int
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_count int;
BEGIN
  INSERT INTO t_notifications (user_id, title, body, link)
  SELECT auth.uid(), 'Task overdue', public.task_label(t.id), public.task_link(t.id)
  FROM t_tasks t
  JOIN t_task_assignees a ON a.task_id = t.id AND a.user_id = auth.uid()
  WHERE t.due_date < CURRENT_DATE AND t.status <> 'done' AND t.archived_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM t_notifications n
      WHERE n.user_id = auth.uid() AND n.title = 'Task overdue'
        AND n.link = public.task_link(t.id) AND n.created_at >= CURRENT_DATE);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- RLS ------------------------------------------------------------------------

ALTER TABLE public.t_task_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t_task_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t_board_task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t_board_task_attachments ENABLE ROW LEVEL SECURITY;

-- Reviews and activity are written by the functions above only.
CREATE POLICY task_reviews_select ON public.t_task_reviews FOR SELECT TO authenticated
  USING (public.is_board_member(public.task_board(task_id)));
CREATE POLICY task_activity_select ON public.t_task_activity FOR SELECT TO authenticated
  USING (public.is_board_member(public.task_board(task_id)));

CREATE POLICY board_task_comments_select ON public.t_board_task_comments FOR SELECT TO authenticated
  USING (public.is_board_member(public.task_board(task_id)));
CREATE POLICY board_task_comments_insert ON public.t_board_task_comments FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_board_member(public.task_board(task_id)));
CREATE POLICY board_task_comments_update ON public.t_board_task_comments FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY board_task_comments_delete ON public.t_board_task_comments FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_board_pic(public.task_board(task_id)));

CREATE POLICY board_task_attachments_select ON public.t_board_task_attachments FOR SELECT TO authenticated
  USING (public.is_board_member(public.task_board(task_id)));
CREATE POLICY board_task_attachments_insert ON public.t_board_task_attachments FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = auth.uid() AND public.is_board_member(public.task_board(task_id)));
CREATE POLICY board_task_attachments_delete ON public.t_board_task_attachments FOR DELETE TO authenticated
  USING (uploaded_by = auth.uid() OR public.is_board_pic(public.task_board(task_id)));

-- Board files live under board/<task_id>/ in the existing bucket.
CREATE POLICY board_attachments_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'task-attachments' AND (storage.foldername(name))[1] = 'board'
         AND public.is_board_member(public.task_board(((storage.foldername(name))[2])::bigint)));
CREATE POLICY board_attachments_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'task-attachments' AND (storage.foldername(name))[1] = 'board'
              AND public.is_board_member(public.task_board(((storage.foldername(name))[2])::bigint)));

ALTER PUBLICATION supabase_realtime ADD TABLE public.t_task_activity, public.t_board_task_comments;
```

- [ ] **Step 5: Run the board smoke test**

```bash
supabase/tests/scratch_db.sh supabase/tests/board_smoke.sql 2>&1 | grep -E "PASSED|ERROR|FAIL"
```
Expected: `NOTICE:  BOARD CHECKS PASSED`.

- [ ] **Step 6: Re-run the older smoke tests (the new migrations must not break them)**

```bash
supabase/tests/scratch_db.sh supabase/tests/security_smoke.sql 2>&1 | grep -E "PASSED|ERROR"
supabase/tests/scratch_db.sh supabase/tests/payroll_smoke.sql 2>&1 | grep -E "PASSED|ERROR"
supabase/tests/scratch_db.sh supabase/tests/attendance_attachment_smoke.sql 2>&1 | grep -E "PASSED|ERROR"
```
Expected: three PASSED lines.

- [ ] **Step 7: Print the suggested commit message (do not commit)**

```
feat(db): task board schema, review workflow and access rules
```


### Task 3: Generated types, shared TS types, DnD dependency, member sync fix

**Files:**
- Modify: `src/integrations/supabase/types.ts` (regenerated)
- Modify: `src/lib/types.ts`
- Modify: `src/hooks/useProjects.ts` (`syncProjectMembers`)
- Modify: `package.json`, `pnpm-lock.yaml`

**Interfaces:**
- Consumes: migrations from Task 2.
- Produces TS types in `src/lib/types.ts`: `TaskStatus`, `TaskPriority`, `MemberRole`, `TaskSource`, `Division`, `Board`, `BoardColumn`, `BoardTask`, `BoardTaskRow` (adds `assignees`, `reviewers`, `steps`, `labels`, `reviews`), `TaskStep`, `TaskLabel`, `BoardMember`, `TaskActivity`.
- Task 8 adds `DailyTask.board_task_id` and `DailyTaskWithRelations.board_task`. Do not add them here.

- [ ] **Step 1: Install drag and drop**

```bash
pnpm add @dnd-kit/core@^6.3.1 @dnd-kit/sortable@^10.0.0 @dnd-kit/utilities@^3.2.2
```
Expected: three `+ @dnd-kit/...` lines.

- [ ] **Step 2: Regenerate Supabase types from the migrations**

```bash
supabase/tests/scratch_db.sh            # prints the URL and the container name
pnpm dlx supabase@2 gen types typescript \
  --db-url "postgresql://supabase_admin:postgres@localhost:54377/postgres?sslmode=disable" \
  --schema public > /tmp/types.gen.ts
pnpm dlx prettier@3.6.2 --write /tmp/types.gen.ts
python3 - <<'EOF'
# Keep the hand-kept header (Json, __InternalSupabase, graphql_public); take public from the generator.
p = "src/integrations/supabase/types.ts"
orig, gen = open(p).read(), open("/tmp/types.gen.ts").read()
k = "\n  public: {\n"
open(p, "w").write(orig[:orig.index(k)] + gen[gen.index(k):])
EOF
docker rm -f $(docker ps -q --filter name=workdesk-smoke)
grep -c "t_tasks: {\|move_task: {\|t_board_task_comments: {" src/integrations/supabase/types.ts
```
Expected: the final grep prints `3` or more. `root_id` in `t_tasks.Insert` is optional (it has a DB default).

- [ ] **Step 3: Add the board types**

Append to `src/lib/types.ts`. The diff below also shows the two daily-log lines, but those belong to Task 8. Apply only the `// Task board` block now.

Modify `src/lib/types.ts` (apply this diff; context lines show where):

```diff
--- a/src/lib/types.ts
+++ b/src/lib/types.ts
@@ -52,12 +52,15 @@ export interface DailyTask {
   progress_pct: number;
   problem_desc: string | null;
   is_resolved: boolean;
+  board_task_id: number | null;
   created_at: string;
 }
 
 export interface DailyTaskWithRelations extends DailyTask {
   employee: Employee;
   project: Project;
+  // Only the main daily-report query embeds it.
+  board_task?: Pick<BoardTask, "id" | "task_no" | "board_id" | "title"> | null;
 }
 
 export interface DashboardSummary {
@@ -425,3 +428,108 @@ export interface LeaveRequest {
 export interface LeaveRequestWithProfile extends LeaveRequest {
   submitter: Pick<Profile, "id" | "full_name" | "avatar_url"> | null;
 }
+
+// Task board ------------------------------------------------------------------
+
+export type TaskStatus = "todo" | "in_progress" | "in_review" | "done";
+export type TaskPriority = "low" | "medium" | "high" | "urgent";
+export type MemberRole = "pic" | "member" | "reviewer";
+/** Which comment/attachment tables a task panel reads: daily log or board. */
+export type TaskSource = "daily" | "board";
+
+export interface Division {
+  id: number;
+  name: string;
+  color: string | null;
+  is_active: boolean;
+}
+
+export interface Board {
+  id: number;
+  project_id: number;
+  name: string;
+  background: string | null;
+  next_task_no: number;
+  created_by: string | null;
+  created_at: string;
+}
+
+export interface BoardColumn {
+  id: number;
+  board_id: number;
+  name: string;
+  color: string | null;
+  position: number;
+  wip_limit: number | null;
+  is_done_column: boolean;
+}
+
+export interface BoardTask {
+  id: number;
+  board_id: number;
+  column_id: number | null;
+  parent_id: number | null;
+  root_id: number;
+  depth: number;
+  task_no: number;
+  title: string;
+  description: string | null;
+  expected_output: string | null;
+  division_id: number | null;
+  priority: TaskPriority;
+  start_date: string | null;
+  due_date: string | null;
+  estimate_hours: number | null;
+  status: TaskStatus;
+  position: number;
+  created_by: string | null;
+  completed_at: string | null;
+  completed_by: string | null;
+  archived_at: string | null;
+  created_at: string;
+  updated_at: string;
+}
+
+/** A task as the board query returns it, with just enough of its children. */
+export interface BoardTaskRow extends BoardTask {
+  assignees: { user_id: string; assigned_by: string | null }[];
+  reviewers: { user_id: string }[];
+  steps: { id: number; is_done: boolean }[];
+  labels: { label_id: number }[];
+  reviews: { decision: "approved" | "rejected"; created_at: string }[];
+}
+
+export interface TaskStep {
+  id: number;
+  task_id: number;
+  title: string;
+  note: string | null;
+  position: number;
+  is_done: boolean;
+  done_by: string | null;
+  done_at: string | null;
+  created_by: string | null;
+  created_at: string;
+}
+
+export interface TaskLabel {
+  id: number;
+  board_id: number;
+  name: string;
+  color: string;
+}
+
+export interface BoardMember {
+  user_id: string;
+  member_role: MemberRole;
+  profile: Pick<Profile, "id" | "full_name" | "avatar_url"> | null;
+}
+
+export interface TaskActivity {
+  id: number;
+  task_id: number;
+  actor_id: string | null;
+  action: string;
+  detail: Record<string, unknown>;
+  created_at: string;
+}
```

- [ ] **Step 4: Make member sync keep roles**

Modify `src/hooks/useProjects.ts` (apply this diff; context lines show where):

```diff
--- a/src/hooks/useProjects.ts
+++ b/src/hooks/useProjects.ts
@@ -99,15 +99,28 @@ async function syncProjectTypes(projectId: number, typeIds: number[]) {
   }
 }
 
+// Diff, not delete-all: each row carries a member_role the task board relies on.
 async function syncProjectMembers(projectId: number, userIds: string[]) {
-  const { error: delErr } = await supabase
+  const { data: current, error } = await supabase
     .from("m_project_members")
-    .delete()
+    .select("user_id")
     .eq("project_id", projectId);
-  if (delErr) throw delErr;
+  if (error) throw error;
+  const have = new Set(current.map((r) => r.user_id));
+
+  const removed = [...have].filter((id) => !userIds.includes(id));
+  if (removed.length > 0) {
+    const { error: delErr } = await supabase
+      .from("m_project_members")
+      .delete()
+      .eq("project_id", projectId)
+      .in("user_id", removed);
+    if (delErr) throw delErr;
+  }
 
-  if (userIds.length > 0) {
-    const rows = userIds.map((user_id) => ({ project_id: projectId, user_id }));
+  const added = userIds.filter((id) => !have.has(id));
+  if (added.length > 0) {
+    const rows = added.map((user_id) => ({ project_id: projectId, user_id }));
     const { error: insErr } = await supabase
       .from("m_project_members")
       .insert(rows);
```

- [ ] **Step 5: Type-check**

```bash
./node_modules/.bin/tsc -b --noEmit
```
Expected: no output, exit 0.

- [ ] **Step 6: Print the suggested commit message (do not commit)**

```
feat: board types, dnd-kit, keep project member roles on edit
```


### Task 4: Pure board logic with unit tests

**Files:**
- Create: `src/lib/position.ts`, `src/lib/taskTree.ts`, `src/lib/taskPermissions.ts`, `src/lib/boardFilter.ts`, `src/lib/workload.ts`
- Test: `src/lib/__tests__/boardFixtures.ts`, `position.test.ts`, `taskTree.test.ts`, `taskPermissions.test.ts`, `boardFilter.test.ts`, `workload.test.ts`

**Interfaces:**
- Consumes: `BoardTaskRow`, `BoardColumn`, `MemberRole`, `TaskStatus` from Task 3.
- Produces:
  - `positionBetween(before: number|null, after: number|null): number`
  - `neighbourIds(ids: number[], index: number): { beforeId: number|null; afterId: number|null }`
  - `interface TaskNode { task: BoardTaskRow; children: TaskNode[] }`
  - `buildTaskTree(rows): { roots: TaskNode[]; byId: Map<number, TaskNode> }`
  - `groupRootsByColumn(roots, columns): Record<number, number[]>`
  - `computeProgress(node): { done; total; pct }`
  - `countDescendants(node): number`
  - `lineage(byId, id): TaskNode[]`
  - `lineageAssigneeIds(byId, id): Set<string>`
  - `isSentBack(task): boolean`
  - `interface TaskAccess { userId; isAdmin; memberRole }`
  - `isBoardPic(a)`
  - `canWorkTask(a, lineageAssignees)`
  - `canUnassign(a, assignedBy)`
  - `submitBlocker(a, node, lineageAssignees): SubmitBlocker | null`
  - `canReviewTask(a, task)`
  - `accessFor(userId, isAdmin, members): TaskAccess`
  - `interface BoardFilter { q; assignee?; division?; label?; due? }`
  - `EMPTY_FILTER`
  - `isFiltering(f)`
  - `matchesFilter(node, f, today)`
  - `summarizeWorkload(rows, today): Map<string, WorkloadCounts>`
  - `emptyCounts()`
  - `openCount(c)`

- [ ] **Step 1: Write the test fixture**

Create `src/lib/__tests__/boardFixtures.ts`:

```ts
import type { BoardTaskRow } from "../types";

/** A live board task with defaults; override what the test cares about. */
export function row(over: Partial<BoardTaskRow> & { id: number }): BoardTaskRow {
  return {
    board_id: 1,
    column_id: over.parent_id ? null : 10,
    parent_id: null,
    root_id: over.id,
    depth: 0,
    task_no: over.id,
    title: `T${over.id}`,
    description: null,
    expected_output: null,
    division_id: null,
    priority: "medium",
    start_date: null,
    due_date: null,
    estimate_hours: null,
    status: "todo",
    position: over.id * 1024,
    created_by: null,
    completed_at: null,
    completed_by: null,
    archived_at: null,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    assignees: [],
    reviewers: [],
    steps: [],
    labels: [],
    reviews: [],
    ...over,
  };
}
```

- [ ] **Step 2: Write the failing tests**

Create `src/lib/__tests__/position.test.ts`:

```ts
import { expect, test } from "vitest";
import { neighbourIds, positionBetween } from "../position";

test("positionBetween fills edges and gaps", () => {
  expect(positionBetween(null, null)).toBe(1024);
  expect(positionBetween(null, 1024)).toBe(0);
  expect(positionBetween(2048, null)).toBe(3072);
  expect(positionBetween(1024, 2048)).toBe(1536);
});

test("positionBetween keeps order through repeated inserts", () => {
  let after = 1024;
  for (let i = 0; i < 30; i++) {
    const p = positionBetween(0, after);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(after);
    after = p;
  }
});

test("neighbourIds reads both sides of the moved item", () => {
  expect(neighbourIds([7, 8, 9], 0)).toEqual({ beforeId: null, afterId: 8 });
  expect(neighbourIds([7, 8, 9], 1)).toEqual({ beforeId: 7, afterId: 9 });
  expect(neighbourIds([7, 8, 9], 2)).toEqual({ beforeId: 8, afterId: null });
  expect(neighbourIds([7], 0)).toEqual({ beforeId: null, afterId: null });
});
```

Create `src/lib/__tests__/taskTree.test.ts`:

```ts
import { expect, test } from "vitest";
import {
  buildTaskTree,
  computeProgress,
  countDescendants,
  groupRootsByColumn,
  isSentBack,
  lineage,
  lineageAssigneeIds,
} from "../taskTree";
import type { BoardColumn } from "../types";
import { row } from "./boardFixtures";

const rows = [
  row({ id: 1, assignees: [{ user_id: "u1", assigned_by: "u1" }] }),
  row({ id: 2, parent_id: 1, status: "done", steps: [{ id: 1, is_done: true }] }),
  row({
    id: 3,
    parent_id: 1,
    position: 1,
    assignees: [{ user_id: "u2", assigned_by: "u1" }],
    steps: [
      { id: 2, is_done: true },
      { id: 3, is_done: false },
    ],
  }),
  row({ id: 4, parent_id: 3 }),
  row({ id: 5, archived_at: "2026-10-02T00:00:00Z" }),
  row({ id: 6, parent_id: 5 }),
  row({ id: 7, column_id: 11, position: 1 }),
];

test("buildTaskTree nests, sorts by position, drops archived subtrees", () => {
  const { roots, byId } = buildTaskTree(rows);
  expect(roots.map((r) => r.task.id)).toEqual([7, 1]);
  expect(byId.get(1)!.children.map((c) => c.task.id)).toEqual([3, 2]);
  expect(byId.has(5)).toBe(false);
  expect(byId.has(6)).toBe(false);
});

test("groupRootsByColumn keeps empty columns", () => {
  const { roots } = buildTaskTree(rows);
  const cols = [{ id: 10 }, { id: 11 }, { id: 12 }] as BoardColumn[];
  expect(groupRootsByColumn(roots, cols)).toEqual({ 10: [1], 11: [7], 12: [] });
});

test("computeProgress counts subtree steps and descendant nodes", () => {
  const { byId } = buildTaskTree(rows);
  // steps 2/3 done, descendants 3 (#2 done, #3, #4): 3 of 6
  expect(computeProgress(byId.get(1)!)).toEqual({ done: 3, total: 6, pct: 50 });
  expect(computeProgress(byId.get(4)!)).toEqual({ done: 0, total: 0, pct: 0 });
  expect(countDescendants(byId.get(1)!)).toBe(3);
});

test("lineage and lineageAssigneeIds walk up to the root", () => {
  const { byId } = buildTaskTree(rows);
  expect(lineage(byId, 4).map((n) => n.task.id)).toEqual([1, 3, 4]);
  expect([...lineageAssigneeIds(byId, 4)].sort()).toEqual(["u1", "u2"]);
  expect([...lineageAssigneeIds(byId, 2)]).toEqual(["u1"]);
});

test("isSentBack reads the latest review only", () => {
  const rejected = { decision: "rejected" as const, created_at: "2026-10-03" };
  const approved = { decision: "approved" as const, created_at: "2026-10-02" };
  expect(isSentBack(row({ id: 1, status: "in_progress", reviews: [approved, rejected] }))).toBe(true);
  expect(isSentBack(row({ id: 1, status: "in_review", reviews: [rejected] }))).toBe(false);
  expect(isSentBack(row({ id: 1, status: "in_progress" }))).toBe(false);
});
```

Create `src/lib/__tests__/taskPermissions.test.ts`:

```ts
import { expect, test } from "vitest";
import { buildTaskTree, lineageAssigneeIds } from "../taskTree";
import {
  canReviewTask,
  canUnassign,
  canWorkTask,
  submitBlocker,
  type TaskAccess,
} from "../taskPermissions";
import { row } from "./boardFixtures";

const dev: TaskAccess = { userId: "u2", isAdmin: false, memberRole: "member" };
const pic: TaskAccess = { userId: "p1", isAdmin: false, memberRole: "pic" };
const reviewer: TaskAccess = { userId: "r1", isAdmin: false, memberRole: "reviewer" };

test("canWorkTask: lineage assignees and the PIC", () => {
  expect(canWorkTask(dev, new Set(["u2"]))).toBe(true);
  expect(canWorkTask(dev, new Set(["u1"]))).toBe(false);
  expect(canWorkTask(pic, new Set())).toBe(true);
  expect(canWorkTask({ ...dev, isAdmin: true }, new Set())).toBe(true);
});

test("canUnassign: whoever assigned, or the PIC", () => {
  expect(canUnassign(dev, "u2")).toBe(true);
  expect(canUnassign(dev, "u1")).toBe(false);
  expect(canUnassign(pic, "u1")).toBe(true);
});

test("submitBlocker walks the same checks as submit_review()", () => {
  const rows = [
    row({ id: 1, assignees: [{ user_id: "u2", assigned_by: "u2" }] }),
    row({ id: 2, parent_id: 1, status: "todo" }),
  ];
  const { byId } = buildTaskTree(rows);
  const ids = lineageAssigneeIds(byId, 1);
  expect(submitBlocker(reviewer, byId.get(1)!, ids)).toBe("not_assignee");
  expect(submitBlocker(dev, byId.get(1)!, ids)).toBe("output");

  rows[0] = { ...rows[0], expected_output: "x", steps: [{ id: 1, is_done: false }] };
  let t = buildTaskTree(rows);
  expect(submitBlocker(dev, t.byId.get(1)!, ids)).toBe("steps");

  rows[0] = { ...rows[0], steps: [{ id: 1, is_done: true }] };
  t = buildTaskTree(rows);
  expect(submitBlocker(dev, t.byId.get(1)!, ids)).toBe("subtasks");

  rows[1] = { ...rows[1], status: "done" };
  t = buildTaskTree(rows);
  expect(submitBlocker(dev, t.byId.get(1)!, ids)).toBe(null);

  rows[0] = { ...rows[0], status: "in_review" };
  t = buildTaskTree(rows);
  expect(submitBlocker(dev, t.byId.get(1)!, ids)).toBe("status");
});

test("canReviewTask: never your own, named reviewers win", () => {
  const waiting = row({
    id: 1,
    status: "in_review",
    assignees: [{ user_id: "p1", assigned_by: "p1" }],
  });
  expect(canReviewTask(pic, waiting)).toBe(false);
  expect(canReviewTask(reviewer, waiting)).toBe(true);
  expect(canReviewTask(dev, waiting)).toBe(false);
  const named = { ...waiting, reviewers: [{ user_id: "u2" }] };
  expect(canReviewTask(dev, named)).toBe(true);
  expect(canReviewTask(reviewer, named)).toBe(false);
  expect(canReviewTask(reviewer, { ...waiting, status: "in_progress" })).toBe(false);
});
```

Create `src/lib/__tests__/boardFilter.test.ts`:

```ts
import { expect, test } from "vitest";
import { buildTaskTree } from "../taskTree";
import { isFiltering, matchesFilter } from "../boardFilter";
import { row } from "./boardFixtures";

const today = new Date(2026, 9, 11);
const { byId } = buildTaskTree([
  row({ id: 1, title: "Notifikasi" }),
  row({
    id: 2,
    parent_id: 1,
    title: "Websocket",
    division_id: 3,
    due_date: "2026-10-09",
    assignees: [{ user_id: "u2", assigned_by: "u1" }],
  }),
  row({ id: 3, title: "Export RKP", due_date: "2026-10-15", labels: [{ label_id: 9 }] }),
]);

test("a card matches through any descendant", () => {
  expect(matchesFilter(byId.get(1)!, { q: "socket" }, today)).toBe(true);
  expect(matchesFilter(byId.get(1)!, { q: "", assignee: "u2" }, today)).toBe(true);
  expect(matchesFilter(byId.get(1)!, { q: "", division: 3 }, today)).toBe(true);
  expect(matchesFilter(byId.get(3)!, { q: "", assignee: "u2" }, today)).toBe(false);
});

test("task number, label and due filters", () => {
  expect(matchesFilter(byId.get(3)!, { q: "#3" }, today)).toBe(true);
  expect(matchesFilter(byId.get(3)!, { q: "", label: 9 }, today)).toBe(true);
  expect(matchesFilter(byId.get(1)!, { q: "", due: "overdue" }, today)).toBe(true);
  expect(matchesFilter(byId.get(3)!, { q: "", due: "overdue" }, today)).toBe(false);
  expect(matchesFilter(byId.get(3)!, { q: "", due: "week" }, today)).toBe(true);
});

test("isFiltering ignores blank search", () => {
  expect(isFiltering({ q: "  " })).toBe(false);
  expect(isFiltering({ q: "", label: 1 })).toBe(true);
});
```

Create `src/lib/__tests__/workload.test.ts`:

```ts
import { expect, test } from "vitest";
import { openCount, summarizeWorkload } from "../workload";

test("summarizeWorkload buckets by status, flags overdue, counts recent done", () => {
  const today = new Date(2026, 9, 11);
  const m = summarizeWorkload(
    [
      { user_id: "a", status: "todo", due_date: "2026-10-10", completed_at: null },
      { user_id: "a", status: "in_progress", due_date: "2026-10-11", completed_at: null },
      { user_id: "a", status: "in_review", due_date: null, completed_at: null },
      { user_id: "a", status: "done", due_date: "2026-10-01", completed_at: "2026-10-05T10:00:00Z" },
      { user_id: "a", status: "done", due_date: null, completed_at: "2026-10-01T10:00:00Z" },
      { user_id: "b", status: "done", due_date: null, completed_at: null },
    ],
    today,
  );
  expect(m.get("a")).toEqual({ todo: 1, in_progress: 1, in_review: 1, overdue: 1, done_7d: 1 });
  expect(openCount(m.get("a")!)).toBe(3);
  expect(m.get("b")).toEqual({ todo: 0, in_progress: 0, in_review: 0, overdue: 0, done_7d: 0 });
});
```

- [ ] **Step 3: Run them and watch them fail**

```bash
./node_modules/.bin/vitest run src/lib/__tests__/position.test.ts src/lib/__tests__/taskTree.test.ts src/lib/__tests__/taskPermissions.test.ts src/lib/__tests__/boardFilter.test.ts src/lib/__tests__/workload.test.ts
```
Expected: 5 failed files with `Failed to resolve import "../position"` (and similar).

- [ ] **Step 4: Implement the libs**

Create `src/lib/position.ts`:

```ts
/** Fractional sort key between two neighbours; null means the list edge.
 * Same rule as slot_task() in SQL, used for the optimistic cache update. */
export function positionBetween(
  before: number | null,
  after: number | null,
): number {
  if (before == null && after == null) return 1024;
  if (before == null) return after! - 1024;
  if (after == null) return before + 1024;
  return (before + after) / 2;
}

/** Ids either side of `index` in a list that already holds the moved item. */
export function neighbourIds(
  ids: number[],
  index: number,
): { beforeId: number | null; afterId: number | null } {
  return {
    beforeId: index > 0 ? ids[index - 1] : null,
    afterId: index < ids.length - 1 ? ids[index + 1] : null,
  };
}
```

Create `src/lib/taskTree.ts`:

```ts
import type { BoardColumn, BoardTaskRow } from "./types";

export interface TaskNode {
  task: BoardTaskRow;
  children: TaskNode[];
}

const byPosition = (a: TaskNode, b: TaskNode) =>
  a.task.position - b.task.position || a.task.id - b.task.id;

/** Live rows into a forest. Archived nodes drop out along with their subtree. */
export function buildTaskTree(rows: BoardTaskRow[]): {
  roots: TaskNode[];
  byId: Map<number, TaskNode>;
} {
  const all = new Map<number, TaskNode>();
  for (const r of rows) if (!r.archived_at) all.set(r.id, { task: r, children: [] });
  const roots: TaskNode[] = [];
  for (const node of all.values()) {
    if (node.task.parent_id == null) roots.push(node);
    else all.get(node.task.parent_id)?.children.push(node);
  }
  const byId = new Map<number, TaskNode>();
  const visit = (list: TaskNode[]) => {
    list.sort(byPosition);
    for (const n of list) {
      byId.set(n.task.id, n);
      visit(n.children);
    }
  };
  visit(roots);
  return { roots, byId };
}

/** Root card ids per column, in board order. */
export function groupRootsByColumn(
  roots: TaskNode[],
  columns: BoardColumn[],
): Record<number, number[]> {
  const out: Record<number, number[]> = {};
  for (const c of columns) out[c.id] = [];
  for (const r of roots) {
    if (r.task.column_id != null) out[r.task.column_id]?.push(r.task.id);
  }
  return out;
}

export interface Progress {
  done: number;
  total: number;
  pct: number;
}

/** Every step in the subtree plus every node below this one counts as a unit. */
export function computeProgress(node: TaskNode): Progress {
  let done = 0;
  let total = 0;
  const walk = (n: TaskNode, isSelf: boolean) => {
    for (const s of n.task.steps) {
      total++;
      if (s.is_done) done++;
    }
    if (!isSelf) {
      total++;
      if (n.task.status === "done") done++;
    }
    n.children.forEach((c) => walk(c, false));
  };
  walk(node, true);
  const pct =
    total === 0
      ? node.task.status === "done"
        ? 100
        : 0
      : Math.round((done / total) * 100);
  return { done, total, pct };
}

export function countDescendants(node: TaskNode): number {
  return node.children.reduce((n, c) => n + 1 + countDescendants(c), 0);
}

/** Root first, the node itself last. */
export function lineage(byId: Map<number, TaskNode>, id: number): TaskNode[] {
  const out: TaskNode[] = [];
  for (let n = byId.get(id); n; ) {
    out.unshift(n);
    n = n.task.parent_id == null ? undefined : byId.get(n.task.parent_id);
  }
  return out;
}

/** Everyone assigned to this node or an ancestor: they may work on it. */
export function lineageAssigneeIds(
  byId: Map<number, TaskNode>,
  id: number,
): Set<string> {
  return new Set(
    lineage(byId, id).flatMap((n) => n.task.assignees.map((a) => a.user_id)),
  );
}

/** Rejected and not yet resubmitted. */
export function isSentBack(task: BoardTaskRow): boolean {
  if (task.status !== "in_progress" || task.reviews.length === 0) return false;
  const last = task.reviews.reduce((a, b) =>
    a.created_at > b.created_at ? a : b,
  );
  return last.decision === "rejected";
}
```

Create `src/lib/taskPermissions.ts`:

```ts
// Mirrors the RLS rules in 20261102000000_task_board_schema.sql and the
// RPCs in 20261102000100_task_board_workflow.sql. Hides actions only; the
// database is what refuses them.
import type { TaskNode } from "./taskTree";
import type { BoardTaskRow, MemberRole } from "./types";

export interface TaskAccess {
  userId: string;
  isAdmin: boolean;
  /** Caller's role in the board's project, null when not a member. */
  memberRole: MemberRole | null;
}

export const isBoardPic = (a: TaskAccess) =>
  a.isAdmin || a.memberRole === "pic";

/** Edit, add subtasks/steps, tick steps, assign others, move the card. */
export function canWorkTask(a: TaskAccess, lineageAssignees: Set<string>) {
  return isBoardPic(a) || lineageAssignees.has(a.userId);
}

export function canUnassign(a: TaskAccess, assignedBy: string | null) {
  return isBoardPic(a) || assignedBy === a.userId;
}

export type SubmitBlocker =
  | "not_assignee"
  | "status"
  | "output"
  | "steps"
  | "subtasks";

/** Why "Submit for review" is not available yet, or null when it is. */
export function submitBlocker(
  a: TaskAccess,
  node: TaskNode,
  lineageAssignees: Set<string>,
): SubmitBlocker | null {
  const t = node.task;
  if (!lineageAssignees.has(a.userId)) return "not_assignee";
  if (t.status === "in_review" || t.status === "done") return "status";
  if (!t.expected_output?.trim()) return "output";
  if (t.steps.some((s) => !s.is_done)) return "steps";
  if (node.children.some((c) => c.task.status !== "done")) return "subtasks";
  return null;
}

export function canReviewTask(a: TaskAccess, task: BoardTaskRow) {
  if (task.status !== "in_review") return false;
  if (task.assignees.some((x) => x.user_id === a.userId)) return false;
  if (task.reviewers.length > 0)
    return task.reviewers.some((r) => r.user_id === a.userId);
  return a.isAdmin || a.memberRole === "pic" || a.memberRole === "reviewer";
}

export function accessFor(
  userId: string,
  isAdmin: boolean,
  members: { user_id: string; member_role: MemberRole }[],
): TaskAccess {
  return {
    userId,
    isAdmin,
    memberRole: members.find((m) => m.user_id === userId)?.member_role ?? null,
  };
}
```

Create `src/lib/boardFilter.ts`:

```ts
import { addDays, format } from "date-fns";
import type { TaskNode } from "./taskTree";

export interface BoardFilter {
  q: string;
  assignee?: string;
  division?: number;
  label?: number;
  due?: "overdue" | "week";
}

export const EMPTY_FILTER: BoardFilter = { q: "" };

export const isFiltering = (f: BoardFilter) =>
  !!(f.q.trim() || f.assignee || f.division || f.label || f.due);

/** A card shows when it, or anything under it, matches every active filter. */
export function matchesFilter(node: TaskNode, f: BoardFilter, today: Date): boolean {
  const t = node.task;
  const q = f.q.trim().toLowerCase();
  const todayIso = format(today, "yyyy-MM-dd");
  const weekIso = format(addDays(today, 7), "yyyy-MM-dd");
  const self =
    (!q || t.title.toLowerCase().includes(q) || `#${t.task_no}` === q) &&
    (!f.assignee || t.assignees.some((a) => a.user_id === f.assignee)) &&
    (!f.division || t.division_id === f.division) &&
    (!f.label || t.labels.some((l) => l.label_id === f.label)) &&
    (!f.due ||
      (t.status !== "done" &&
        !!t.due_date &&
        (f.due === "overdue" ? t.due_date < todayIso : t.due_date <= weekIso)));
  return self || node.children.some((c) => matchesFilter(c, f, today));
}
```

Create `src/lib/workload.ts`:

```ts
import { differenceInCalendarDays, parseISO } from "date-fns";
import type { TaskStatus } from "./types";

export interface WorkloadInput {
  user_id: string;
  status: TaskStatus;
  due_date: string | null;
  completed_at: string | null;
}

export interface WorkloadCounts {
  todo: number;
  in_progress: number;
  in_review: number;
  overdue: number;
  done_7d: number;
}

export const emptyCounts = (): WorkloadCounts => ({
  todo: 0,
  in_progress: 0,
  in_review: 0,
  overdue: 0,
  done_7d: 0,
});

/** One row per (assignee, task). Overdue counts on top of the status bucket. */
export function summarizeWorkload(
  rows: WorkloadInput[],
  today: Date,
): Map<string, WorkloadCounts> {
  const out = new Map<string, WorkloadCounts>();
  for (const r of rows) {
    const c = out.get(r.user_id) ?? emptyCounts();
    out.set(r.user_id, c);
    if (r.status === "done") {
      if (r.completed_at && differenceInCalendarDays(today, parseISO(r.completed_at)) < 7)
        c.done_7d++;
      continue;
    }
    c[r.status]++;
    if (r.due_date && differenceInCalendarDays(today, parseISO(r.due_date)) > 0)
      c.overdue++;
  }
  return out;
}

/** Open work, the number a lead balances. */
export const openCount = (c: WorkloadCounts) =>
  c.todo + c.in_progress + c.in_review;
```

- [ ] **Step 5: Run the whole suite**

```bash
./node_modules/.bin/vitest run
```
Expected: `Test Files  16 passed`, `Tests  69 passed`.

- [ ] **Step 6: Print the suggested commit message (do not commit)**

```
feat: task tree, ordering, filter, workload and permission helpers
```


### Task 5: Data hooks

**Files:**
- Create: `src/hooks/useDivisions.ts`, `useBoards.ts`, `useBoard.ts`, `useBoardColumns.ts`, `useBoardTasks.ts`, `useTaskSteps.ts`, `useTaskActivity.ts`, `useMyTasks.ts`, `useTaskWorkload.ts`
- Modify: `src/hooks/useTaskComments.ts`, `src/hooks/useTaskAttachments.ts`, `src/hooks/useDailyTasks.ts` (append `useDailyTasksForBoardTask` only)
- Modify: `src/components/daily-report/TaskComments.tsx`, `src/components/daily-report/TaskAttachments.tsx` (optional `source` prop)

**Interfaces:**
- Consumes: RPCs and tables from Task 2, types from Task 3, `positionBetween`, `summarizeWorkload` from Task 4, `subscribeShared` from `src/lib/realtimeSubscription.ts`.
- Produces:
  - `boardKey(id)`, `TASK_SELECT`, `interface BoardData { board; columns; tasks; labels; members }`, `useBoard(boardId)` (with realtime), `useSetMemberRole(boardId, projectId)`.
  - `useBoardStats()`, `useEnsureBoard()`.
  - `useAddColumn`, `useUpdateColumn`, `useDeleteColumn`.
  - Task writes: `useCreateTask`, `useUpdateTask`, `useDeleteTask`, `useAssign`, `useUnassign`, `useToggleReviewer`, `useToggleLabel`, `useCreateLabel`, `useMoveTask` (optimistic), `useReparentTask`, `useSubmitReview`, `useReviewTask`, all taking `boardId`.
  - `useTaskSteps(taskId)`, `useTaskStepWrites(boardId, taskId) -> { add, update, remove, move }`.
  - `useTaskActivity(taskId)`, `useMyTasks() -> { assigned, toReview, roles }`, `useTaskWorkload(divisionId?)`.
  - `useDivisions`, `useSaveDivision`, `useDeleteDivision`.
  - `useDailyTasksForBoardTask(boardTaskId)`.
  - `TaskComments` / `TaskAttachments` take `source?: TaskSource` (default `"daily"`, so existing callers are unchanged).

- [ ] **Step 1: Divisions, boards list, one board**

Create `src/hooks/useDivisions.ts`:

```ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Division } from "@/lib/types";
import { toast } from "sonner";

export function useDivisions() {
  return useQuery<Division[]>({
    queryKey: ["divisions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("m_divisions")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as Division[];
    },
    staleTime: 60_000,
  });
}

export function useSaveDivision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id?: number; name: string }) => {
      const { error } = id
        ? await supabase.from("m_divisions").update({ name }).eq("id", id)
        : await supabase.from("m_divisions").insert({ name });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["divisions"] });
      toast.success("Division saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteDivision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("m_divisions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["divisions"] });
      toast.success("Division deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
```

Create `src/hooks/useBoards.ts`:

```ts
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Board, TaskStatus } from "@/lib/types";
import { toast } from "sonner";

export interface BoardCardStats {
  board_id: number;
  project_id: number;
  open: number;
  overdue: number;
  done: number;
}

/** Root-card counts per existing board; projects without a board are absent. */
export function useBoardStats() {
  return useQuery<Record<number, BoardCardStats>>({
    queryKey: ["board-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("t_boards")
        .select("id, project_id, t_tasks(status, due_date, archived_at, parent_id)")
        .is("t_tasks.parent_id", null)
        .is("t_tasks.archived_at", null);
      if (error) throw error;
      const today = new Date().toISOString().slice(0, 10);
      const out: Record<number, BoardCardStats> = {};
      for (const b of data) {
        const tasks = b.t_tasks as { status: TaskStatus; due_date: string | null }[];
        const open = tasks.filter((t) => t.status !== "done");
        out[b.project_id] = {
          board_id: b.id,
          project_id: b.project_id,
          open: open.length,
          overdue: open.filter((t) => t.due_date && t.due_date < today).length,
          done: tasks.length - open.length,
        };
      }
      return out;
    },
  });
}

/** Opens (creating on first visit) the board of a project. */
export function useEnsureBoard() {
  return useMutation({
    mutationFn: async (projectId: number) => {
      const { data, error } = await supabase.rpc("ensure_board", {
        p_project_id: projectId,
      });
      if (error) throw error;
      return data as Board;
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
```

Create `src/hooks/useBoard.ts`:

```ts
import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subscribeShared } from "@/lib/realtimeSubscription";
import type {
  Board,
  BoardColumn,
  BoardMember,
  BoardTaskRow,
  MemberRole,
  Project,
  TaskLabel,
} from "@/lib/types";
import { toast } from "sonner";

export interface BoardData {
  board: Board & {
    project: Pick<Project, "id" | "project_code" | "project_name">;
  };
  columns: BoardColumn[];
  tasks: BoardTaskRow[];
  labels: TaskLabel[];
  members: BoardMember[];
}

export const boardKey = (boardId: number) => ["board", boardId] as const;

export const TASK_SELECT =
  "*, assignees:t_task_assignees(user_id, assigned_by), reviewers:t_task_reviewers(user_id), steps:t_task_steps(id, is_done), labels:t_task_label_map(label_id), reviews:t_task_reviews(decision, created_at)";

/** Whole board in one cache entry: every live node, so trees and counts are local. */
export function useBoard(boardId: number) {
  const qc = useQueryClient();

  useEffect(() => {
    const refresh = () => qc.invalidateQueries({ queryKey: boardKey(boardId) });
    // ponytail: assignees/steps have no board_id to filter on, so every visible
    // change refetches this board; add board_id to them if boards get busy.
    return subscribeShared(`board-${boardId}`, (ch) => {
      ch.on("postgres_changes", { event: "*", schema: "public", table: "t_tasks", filter: `board_id=eq.${boardId}` }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "t_board_columns", filter: `board_id=eq.${boardId}` }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "t_task_assignees" }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "t_task_steps" }, refresh);
    });
  }, [boardId, qc]);

  return useQuery<BoardData>({
    queryKey: boardKey(boardId),
    enabled: Number.isFinite(boardId),
    queryFn: async () => {
      const [board, columns, tasks, labels] = await Promise.all([
        supabase
          .from("t_boards")
          .select("*, project:m_projects(id, project_code, project_name)")
          .eq("id", boardId)
          .single(),
        supabase.from("t_board_columns").select("*").eq("board_id", boardId).order("position"),
        supabase.from("t_tasks").select(TASK_SELECT).eq("board_id", boardId).is("archived_at", null),
        supabase.from("t_task_labels").select("*").eq("board_id", boardId).order("name"),
      ]);
      for (const r of [board, columns, tasks, labels]) if (r.error) throw r.error;
      const members = await supabase
        .from("m_project_members")
        .select("user_id, member_role, profile:profiles(id, full_name, avatar_url)")
        .eq("project_id", board.data!.project_id);
      if (members.error) throw members.error;
      return {
        board: board.data as BoardData["board"],
        columns: columns.data as BoardColumn[],
        tasks: tasks.data as unknown as BoardTaskRow[],
        labels: labels.data as TaskLabel[],
        members: members.data as BoardMember[],
      };
    },
  });
}

export function useSetMemberRole(boardId: number, projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: MemberRole }) => {
      const { error } = await supabase
        .from("m_project_members")
        .update({ member_role: role })
        .eq("project_id", projectId)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: boardKey(boardId) }),
    onError: (e: Error) => toast.error(e.message),
  });
}
```

- [ ] **Step 2: Columns and task writes**

Create `src/hooks/useBoardColumns.ts`:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { BoardColumn } from "@/lib/types";
import { boardKey } from "./useBoard";
import { toast } from "sonner";

type ColumnPatch = Partial<
  Pick<BoardColumn, "name" | "color" | "wip_limit" | "is_done_column" | "position">
>;

export function useAddColumn(boardId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, position }: { name: string; position: number }) => {
      const { error } = await supabase
        .from("t_board_columns")
        .insert({ board_id: boardId, name, position });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: boardKey(boardId) }),
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateColumn(boardId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: ColumnPatch & { id: number }) => {
      const { error } = await supabase.from("t_board_columns").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: boardKey(boardId) }),
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteColumn(boardId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("t_board_columns").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: boardKey(boardId) }),
    onError: (e: Error) => toast.error(e.message),
  });
}
```

Create `src/hooks/useBoardTasks.ts`:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { positionBetween } from "@/lib/position";
import type { BoardTask } from "@/lib/types";
import { boardKey, type BoardData } from "./useBoard";
import { toast } from "sonner";

export type TaskPatch = Partial<
  Pick<
    BoardTask,
    | "title"
    | "description"
    | "expected_output"
    | "division_id"
    | "priority"
    | "start_date"
    | "due_date"
    | "estimate_hours"
    | "status"
    | "archived_at"
  >
>;

/** Every board write refreshes the board and the open task's side panels. */
function useBoardWrite<V>(
  boardId: number,
  fn: (v: V) => Promise<unknown>,
  taskIdOf?: (v: V) => number,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: boardKey(boardId) });
      qc.invalidateQueries({ queryKey: ["board-stats"] });
      if (taskIdOf) qc.invalidateQueries({ queryKey: ["task-activity", taskIdOf(v)] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

const ok = ({ error }: { error: unknown }) => {
  if (error) throw error;
};

export function useCreateTask(boardId: number) {
  return useBoardWrite(
    boardId,
    async (v: {
      title: string;
      position: number;
      column_id?: number | null;
      parent_id?: number | null;
      division_id?: number | null;
    }) => {
      const { data, error } = await supabase
        .from("t_tasks")
        .insert({ board_id: boardId, ...v })
        .select("id, task_no")
        .single();
      if (error) throw error;
      return data;
    },
  );
}

export function useUpdateTask(boardId: number) {
  return useBoardWrite(
    boardId,
    async ({ id, ...patch }: TaskPatch & { id: number }) =>
      ok(await supabase.from("t_tasks").update(patch).eq("id", id)),
    (v) => v.id,
  );
}

export function useDeleteTask(boardId: number) {
  return useBoardWrite(boardId, async (id: number) =>
    ok(await supabase.from("t_tasks").delete().eq("id", id)),
  );
}

export function useAssign(boardId: number) {
  return useBoardWrite(
    boardId,
    async (v: { taskId: number; userId: string }) =>
      ok(await supabase.from("t_task_assignees").insert({ task_id: v.taskId, user_id: v.userId })),
    (v) => v.taskId,
  );
}

export function useUnassign(boardId: number) {
  return useBoardWrite(
    boardId,
    async (v: { taskId: number; userId: string }) => {
      const { error, count } = await supabase
        .from("t_task_assignees")
        .delete({ count: "exact" })
        .eq("task_id", v.taskId)
        .eq("user_id", v.userId);
      if (error) throw error;
      if (count === 0) throw new Error("Only whoever assigned them, or the PIC, can remove this person");
    },
    (v) => v.taskId,
  );
}

export function useToggleReviewer(boardId: number) {
  return useBoardWrite(
    boardId,
    async (v: { taskId: number; userId: string; on: boolean }) =>
      ok(
        v.on
          ? await supabase.from("t_task_reviewers").insert({ task_id: v.taskId, user_id: v.userId })
          : await supabase.from("t_task_reviewers").delete().eq("task_id", v.taskId).eq("user_id", v.userId),
      ),
  );
}

export function useToggleLabel(boardId: number) {
  return useBoardWrite(
    boardId,
    async (v: { taskId: number; labelId: number; on: boolean }) =>
      ok(
        v.on
          ? await supabase.from("t_task_label_map").insert({ task_id: v.taskId, label_id: v.labelId })
          : await supabase.from("t_task_label_map").delete().eq("task_id", v.taskId).eq("label_id", v.labelId),
      ),
  );
}

export function useCreateLabel(boardId: number) {
  return useBoardWrite(boardId, async (v: { name: string; color: string }) =>
    ok(await supabase.from("t_task_labels").insert({ board_id: boardId, ...v })),
  );
}

interface MoveVars {
  taskId: number;
  columnId: number;
  beforeId: number | null;
  afterId: number | null;
}

/** Optimistic: the card lands at once, and snaps back if the server refuses. */
export function useMoveTask(boardId: number) {
  const qc = useQueryClient();
  const key = boardKey(boardId);
  return useMutation({
    mutationFn: async (v: MoveVars) =>
      ok(
        await supabase.rpc("move_task", {
          p_task_id: v.taskId,
          p_column_id: v.columnId,
          p_before_id: v.beforeId ?? undefined,
          p_after_id: v.afterId ?? undefined,
        }),
      ),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<BoardData>(key);
      if (prev) {
        const pos = (id: number | null) =>
          prev.tasks.find((t) => t.id === id)?.position ?? null;
        const position = positionBetween(pos(v.beforeId), pos(v.afterId));
        qc.setQueryData<BoardData>(key, {
          ...prev,
          tasks: prev.tasks.map((t) =>
            t.id === v.taskId ? { ...t, column_id: v.columnId, position } : t,
          ),
        });
      }
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast.error(e.message);
    },
    onSettled: (_d, _e, v) => {
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["task-activity", v.taskId] });
    },
  });
}

export function useReparentTask(boardId: number) {
  return useBoardWrite(
    boardId,
    async (v: {
      taskId: number;
      parentId: number | null;
      columnId?: number;
      beforeId: number | null;
      afterId: number | null;
    }) =>
      ok(
        await supabase.rpc("reparent_task", {
          p_task_id: v.taskId,
          p_new_parent_id: v.parentId as number,
          p_column_id: v.columnId,
          p_before_id: v.beforeId ?? undefined,
          p_after_id: v.afterId ?? undefined,
        }),
      ),
    (v) => v.taskId,
  );
}

export function useSubmitReview(boardId: number) {
  return useBoardWrite(
    boardId,
    async (taskId: number) => ok(await supabase.rpc("submit_review", { p_task_id: taskId })),
    (taskId) => taskId,
  );
}

export function useReviewTask(boardId: number) {
  return useBoardWrite(
    boardId,
    async (v: { taskId: number; decision: "approved" | "rejected"; note: string }) =>
      ok(
        await supabase.rpc("review_task", {
          p_task_id: v.taskId,
          p_decision: v.decision,
          p_note: v.note,
        }),
      ),
    (v) => v.taskId,
  );
}
```

- [ ] **Step 3: Steps, activity, my tasks, workload**

Create `src/hooks/useTaskSteps.ts`:

```ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TaskStep } from "@/lib/types";
import { boardKey } from "./useBoard";
import { toast } from "sonner";

const stepsKey = (taskId: number) => ["task-steps", taskId] as const;

export function useTaskSteps(taskId: number | null) {
  return useQuery<TaskStep[]>({
    queryKey: stepsKey(taskId ?? 0),
    enabled: taskId != null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("t_task_steps")
        .select("*")
        .eq("task_id", taskId!)
        .order("position")
        .order("id");
      if (error) throw error;
      return data as TaskStep[];
    },
  });
}

/** Step writes touch the card's progress too, so the board refreshes as well. */
function useStepWrite<V>(boardId: number, taskId: number, fn: (v: V) => Promise<void>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: stepsKey(taskId) });
      qc.invalidateQueries({ queryKey: boardKey(boardId) });
      qc.invalidateQueries({ queryKey: ["task-activity", taskId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useTaskStepWrites(boardId: number, taskId: number) {
  const add = useStepWrite(boardId, taskId, async (v: { title: string; position: number }) => {
    const { error } = await supabase.from("t_task_steps").insert({ task_id: taskId, ...v });
    if (error) throw error;
  });
  const update = useStepWrite(
    boardId,
    taskId,
    async ({ id, ...patch }: { id: number; title?: string; note?: string | null; is_done?: boolean }) => {
      const { error, count } = await supabase
        .from("t_task_steps")
        .update(patch, { count: "exact" })
        .eq("id", id);
      if (error) throw error;
      if (count === 0) throw new Error("Only an assignee or the project PIC can change this step");
    },
  );
  const remove = useStepWrite(boardId, taskId, async (id: number) => {
    const { error } = await supabase.from("t_task_steps").delete().eq("id", id);
    if (error) throw error;
  });
  const move = useStepWrite(
    boardId,
    taskId,
    async (v: { stepId: number; beforeId: number | null; afterId: number | null }) => {
      const { error } = await supabase.rpc("move_step", {
        p_step_id: v.stepId,
        p_before_id: v.beforeId ?? undefined,
        p_after_id: v.afterId ?? undefined,
      });
      if (error) throw error;
    },
  );
  return { add, update, remove, move };
}
```

Create `src/hooks/useTaskActivity.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TaskActivity } from "@/lib/types";

export function useTaskActivity(taskId: number | null) {
  return useQuery<TaskActivity[]>({
    queryKey: ["task-activity", taskId],
    enabled: taskId != null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("t_task_activity")
        .select("*")
        .eq("task_id", taskId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as TaskActivity[];
    },
  });
}
```

Create `src/hooks/useMyTasks.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/auth";
import { TASK_SELECT } from "./useBoard";
import type { BoardTaskRow, MemberRole } from "@/lib/types";

export type MyTask = BoardTaskRow & {
  board: { id: number; name: string; project_id: number };
};

export interface MyTasksData {
  assigned: MyTask[];
  /** Waiting for review on boards where the caller may review. */
  toReview: MyTask[];
  roles: Record<number, MemberRole>;
}

const SELECT = `${TASK_SELECT}, board:t_boards(id, name, project_id)`;

export function useMyTasks() {
  const { user } = useAuth();
  return useQuery<MyTasksData>({
    queryKey: ["my-tasks", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [mine, review, roles] = await Promise.all([
        supabase.from("t_task_assignees").select("task_id").eq("user_id", user!.id),
        supabase.from("t_tasks").select(SELECT).eq("status", "in_review").is("archived_at", null),
        supabase.from("m_project_members").select("project_id, member_role").eq("user_id", user!.id),
      ]);
      for (const r of [mine, review, roles]) if (r.error) throw r.error;
      const ids = mine.data!.map((r) => r.task_id);
      const assigned = ids.length
        ? await supabase.from("t_tasks").select(SELECT).in("id", ids).is("archived_at", null)
        : { data: [], error: null };
      if (assigned.error) throw assigned.error;
      return {
        assigned: assigned.data as unknown as MyTask[],
        toReview: review.data as unknown as MyTask[],
        roles: Object.fromEntries(
          roles.data!.map((r) => [r.project_id, r.member_role as MemberRole]),
        ),
      };
    },
  });
}
```

Create `src/hooks/useTaskWorkload.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { summarizeWorkload, type WorkloadCounts } from "@/lib/workload";
import type { TaskStatus } from "@/lib/types";

/** Open/overdue/review counts per assignee across every board the caller can see. */
export function useTaskWorkload(divisionId?: number) {
  return useQuery<Map<string, WorkloadCounts>>({
    queryKey: ["task-workload", divisionId ?? null],
    queryFn: async () => {
      let q = supabase
        .from("t_task_assignees")
        .select("user_id, task:t_tasks!inner(status, due_date, completed_at, archived_at, division_id)")
        .is("task.archived_at", null);
      if (divisionId) q = q.eq("task.division_id", divisionId);
      const { data, error } = await q;
      if (error) throw error;
      return summarizeWorkload(
        data.map((r) => {
          const t = r.task as { status: TaskStatus; due_date: string | null; completed_at: string | null };
          return { user_id: r.user_id, ...t };
        }),
        new Date(),
      );
    },
  });
}
```

- [ ] **Step 4: Let comments and attachments serve board tasks**

Modify `src/hooks/useTaskComments.ts` (apply this diff; context lines show where):

```diff
--- a/src/hooks/useTaskComments.ts
+++ b/src/hooks/useTaskComments.ts
@@ -2,27 +2,34 @@ import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
 import { supabase } from "@/integrations/supabase/client";
 import { useAuth } from "@/context/auth";
 import { toast } from "sonner";
-import type { TaskCommentWithAuthor } from "@/lib/types";
+import type { TaskCommentWithAuthor, TaskSource } from "@/lib/types";
 
-export function useTaskComments(taskId: number | null) {
+// Both tables have the same comment columns; the cast picks one for typing.
+const TABLE = {
+  daily: "t_task_comments",
+  board: "t_board_task_comments",
+} as const;
+const table = (source: TaskSource) => TABLE[source] as "t_task_comments";
+
+export function useTaskComments(taskId: number | null, source: TaskSource = "daily") {
   return useQuery<TaskCommentWithAuthor[]>({
-    queryKey: ["task-comments", taskId],
+    queryKey: ["task-comments", source, taskId],
     enabled: taskId != null,
     queryFn: async () => {
       const { data, error } = await supabase
-        .from("t_task_comments")
+        .from(table(source))
         .select(
-          "*, author:profiles!t_task_comments_user_id_fkey(id, full_name, avatar_url)",
+          `*, author:profiles!${TABLE[source]}_user_id_fkey(id, full_name, avatar_url)`,
         )
         .eq("task_id", taskId!)
         .order("created_at", { ascending: true });
       if (error) throw error;
-      return data as TaskCommentWithAuthor[];
+      return data as unknown as TaskCommentWithAuthor[];
     },
   });
 }
 
-export function useAddTaskComment() {
+export function useAddTaskComment(source: TaskSource = "daily") {
   const { user } = useAuth();
   const qc = useQueryClient();
   return useMutation({
@@ -37,30 +44,28 @@ export function useAddTaskComment() {
     }) => {
       if (!user) throw new Error("Not signed in");
       const { error } = await supabase
-        .from("t_task_comments")
+        .from(table(source))
         .insert({ task_id: taskId, user_id: user.id, comment, mentions });
       if (error) throw error;
     },
     onSuccess: (_data, { taskId }) => {
-      qc.invalidateQueries({ queryKey: ["task-comments", taskId] });
+      qc.invalidateQueries({ queryKey: ["task-comments", source, taskId] });
       qc.invalidateQueries({ queryKey: ["problems-log"] });
+      qc.invalidateQueries({ queryKey: ["task-activity", taskId] });
     },
     onError: (e: Error) => toast.error(e.message),
   });
 }
 
-export function useDeleteTaskComment() {
+export function useDeleteTaskComment(source: TaskSource = "daily") {
   const qc = useQueryClient();
   return useMutation({
     mutationFn: async ({ id }: { id: number; taskId: number }) => {
-      const { error } = await supabase
-        .from("t_task_comments")
-        .delete()
-        .eq("id", id);
+      const { error } = await supabase.from(table(source)).delete().eq("id", id);
       if (error) throw error;
     },
     onSuccess: (_data, { taskId }) => {
-      qc.invalidateQueries({ queryKey: ["task-comments", taskId] });
+      qc.invalidateQueries({ queryKey: ["task-comments", source, taskId] });
       qc.invalidateQueries({ queryKey: ["problems-log"] });
     },
     onError: (e: Error) => toast.error(e.message),
```

Modify `src/hooks/useTaskAttachments.ts` (apply this diff; context lines show where):

```diff
--- a/src/hooks/useTaskAttachments.ts
+++ b/src/hooks/useTaskAttachments.ts
@@ -2,22 +2,34 @@ import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
 import { supabase } from "@/integrations/supabase/client";
 import { useAuth } from "@/context/auth";
 import { toast } from "sonner";
-import type { TaskAttachment } from "@/lib/types";
+import type { TaskAttachment, TaskSource } from "@/lib/types";
 
 const BUCKET = "task-attachments";
 const SIGNED_URL_TTL = 60 * 60; // 1 hour; the bucket is private, so no public URLs.
 
+// Same columns in both tables; board files sit under board/<task_id>/.
+const TABLE = {
+  daily: "t_task_attachments",
+  board: "t_board_task_attachments",
+} as const;
+const table = (source: TaskSource) => TABLE[source] as "t_task_attachments";
+const folder = (source: TaskSource, taskId: number) =>
+  source === "board" ? `board/${taskId}` : `${taskId}`;
+
 export interface TaskAttachmentWithUrl extends TaskAttachment {
   url: string | null;
 }
 
-export function useTaskAttachments(taskId: number | null) {
+export function useTaskAttachments(
+  taskId: number | null,
+  source: TaskSource = "daily",
+) {
   return useQuery<TaskAttachmentWithUrl[]>({
-    queryKey: ["task-attachments", taskId],
+    queryKey: ["task-attachments", source, taskId],
     enabled: taskId != null,
     queryFn: async () => {
       const { data, error } = await supabase
-        .from("t_task_attachments")
+        .from(table(source))
         .select("*")
         .eq("task_id", taskId!)
         .order("created_at", { ascending: true });
@@ -37,21 +49,21 @@ export function useTaskAttachments(taskId: number | null) {
   });
 }
 
-export function useUploadTaskAttachment() {
+export function useUploadTaskAttachment(source: TaskSource = "daily") {
   const { user } = useAuth();
   const qc = useQueryClient();
   return useMutation({
     mutationFn: async ({ taskId, file }: { taskId: number; file: File }) => {
       if (!user) throw new Error("Not signed in");
       const ext = file.name.split(".").pop();
-      const path = `${taskId}/${crypto.randomUUID()}.${ext}`;
+      const path = `${folder(source, taskId)}/${crypto.randomUUID()}.${ext}`;
       const { error: uploadErr } = await supabase.storage
         .from(BUCKET)
         .upload(path, file);
       if (uploadErr) throw uploadErr;
 
       const { error: insertErr } = await supabase
-        .from("t_task_attachments")
+        .from(table(source))
         .insert({
           task_id: taskId,
           file_path: path,
@@ -64,13 +76,13 @@ export function useUploadTaskAttachment() {
       }
     },
     onSuccess: (_data, { taskId }) => {
-      qc.invalidateQueries({ queryKey: ["task-attachments", taskId] });
+      qc.invalidateQueries({ queryKey: ["task-attachments", source, taskId] });
     },
     onError: (e: Error) => toast.error(e.message),
   });
 }
 
-export function useDeleteTaskAttachment() {
+export function useDeleteTaskAttachment(source: TaskSource = "daily") {
   const qc = useQueryClient();
   return useMutation({
     mutationFn: async ({
@@ -86,13 +98,13 @@ export function useDeleteTaskAttachment() {
         .remove([filePath]);
       if (storageErr) throw storageErr;
       const { error } = await supabase
-        .from("t_task_attachments")
+        .from(table(source))
         .delete()
         .eq("id", id);
       if (error) throw error;
     },
     onSuccess: (_data, { taskId }) => {
-      qc.invalidateQueries({ queryKey: ["task-attachments", taskId] });
+      qc.invalidateQueries({ queryKey: ["task-attachments", source, taskId] });
     },
     onError: (e: Error) => toast.error(e.message),
   });
```

Modify `src/components/daily-report/TaskComments.tsx` (apply this diff; context lines show where):

```diff
--- a/src/components/daily-report/TaskComments.tsx
+++ b/src/components/daily-report/TaskComments.tsx
@@ -15,19 +15,20 @@ import { useAuth } from "@/context/auth";
 import { useDateFnsLocale } from "@/lib/dateLocale";
 import { messageParts } from "@/lib/chat";
 import { cn } from "@/lib/utils";
-import type { UserWithEmail } from "@/lib/types";
+import type { TaskSource, UserWithEmail } from "@/lib/types";
 
 interface TaskCommentsProps {
   taskId: number;
+  source?: TaskSource;
 }
 
-export function TaskComments({ taskId }: TaskCommentsProps) {
+export function TaskComments({ taskId, source = "daily" }: TaskCommentsProps) {
   const { t } = useTranslation();
   const dateFnsLocale = useDateFnsLocale();
   const { user, isAdmin } = useAuth();
-  const { data: comments = [], isLoading } = useTaskComments(taskId);
-  const addComment = useAddTaskComment();
-  const deleteComment = useDeleteTaskComment();
+  const { data: comments = [], isLoading } = useTaskComments(taskId, source);
+  const addComment = useAddTaskComment(source);
+  const deleteComment = useDeleteTaskComment(source);
   const [value, setValue] = useState("");
   const { data: allUsers = [] } = useUsers();
   const people = useMemo(
```

Modify `src/components/daily-report/TaskAttachments.tsx` (apply this diff; context lines show where):

```diff
--- a/src/components/daily-report/TaskAttachments.tsx
+++ b/src/components/daily-report/TaskAttachments.tsx
@@ -9,6 +9,7 @@ import {
   useDeleteTaskAttachment,
 } from "@/hooks/useTaskAttachments";
 import { cn } from "@/lib/utils";
+import type { TaskSource } from "@/lib/types";
 
 const MAX_FILE_SIZE = 10 * 1024 * 1024; // matches the storage bucket's file_size_limit
 
@@ -18,13 +19,17 @@ function isImage(fileName: string) {
 
 interface TaskAttachmentsProps {
   taskId: number;
+  source?: TaskSource;
 }
 
-export function TaskAttachments({ taskId }: TaskAttachmentsProps) {
+export function TaskAttachments({
+  taskId,
+  source = "daily",
+}: TaskAttachmentsProps) {
   const { t } = useTranslation();
-  const { data: attachments = [], isLoading } = useTaskAttachments(taskId);
-  const upload = useUploadTaskAttachment();
-  const deleteAttachment = useDeleteTaskAttachment();
+  const { data: attachments = [], isLoading } = useTaskAttachments(taskId, source);
+  const upload = useUploadTaskAttachment(source);
+  const deleteAttachment = useDeleteTaskAttachment(source);
   const fileInputRef = useRef<HTMLInputElement>(null);
 
   function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
```

- [ ] **Step 5: Daily entries linked to a board task**

Append to `src/hooks/useDailyTasks.ts` (the `board_task` embed in `useDailyTasks` comes in Task 8):

```ts
/** Daily entries that point at one board task, newest first. */
export function useDailyTasksForBoardTask(boardTaskId: number | null) {
  return useQuery<DailyTaskWithRelations[]>({
    queryKey: ["daily-tasks", "board-task", boardTaskId],
    enabled: boardTaskId != null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("t_daily_tasks")
        .select("*, employee:m_employees(*), project:m_projects(*)")
        .eq("board_task_id", boardTaskId!)
        .order("date", { ascending: false });
      if (error) throw error;
      return data as unknown as DailyTaskWithRelations[];
    },
  });
}
```

- [ ] **Step 6: Type-check and test**

```bash
./node_modules/.bin/tsc -b --noEmit && ./node_modules/.bin/vitest run 2>&1 | grep -E "Test Files|Tests"
```
Expected: no tsc output, then `16 passed` / `69 passed`.

- [ ] **Step 7: Print the suggested commit message (do not commit)**

```
feat: data hooks for boards, tasks, steps, activity and workload
```


### Task 6: Task detail dialog and its shared pieces, plus i18n

**Files:**
- Create in `src/components/board/`: `BoardContext.tsx`, `taskStyles.ts`, `dndKeys.ts`, `AvatarStack.tsx`, `EditableText.tsx`, `PeoplePicker.tsx`, `TaskMetaFields.tsx`, `ReviewDialog.tsx`, `TaskStatusBar.tsx`, `TaskSteps.tsx`, `TaskSubtree.tsx`, `MoveTaskMenu.tsx`, `TaskActivityFeed.tsx`, `TaskDailyLogs.tsx`, `TaskDetailDialog.tsx`
- Modify: `src/locales/en.json`, `src/locales/id.json` (via the script below)

**Interfaces:**
- Consumes: Task 4 libs, Task 5 hooks, `TaskComments`/`TaskAttachments` with `source="board"`.
- Produces:
  - `BoardProvider({ data })` and `useBoardCtx() -> { data, boardId, roots, byId, access, people, divisions, canWork(taskId) }`.
  - `cardKey`, `colKey`, `parseKey`.
  - `STATUS_STYLE`, `PRIORITY_STYLE`.
  - `TaskDetailDialog({ taskNo, onOpen, onClose })`.
  - All `board.*` i18n keys, plus `nav.items.boards|myTasks`, `nav.descriptions.boards|myTasks`, `taskForm.fields.boardTask`, `taskForm.placeholders.boardTask`, `master.tabs.divisions`, `master.masterList.divisions.*`.

- [ ] **Step 1: Board context and small shared pieces**

Create `src/components/board/BoardContext.tsx`:

```tsx
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useAuth } from "@/context/auth";
import { useDivisions } from "@/hooks/useDivisions";
import type { BoardData } from "@/hooks/useBoard";
import { buildTaskTree, lineageAssigneeIds, type TaskNode } from "@/lib/taskTree";
import { accessFor, canWorkTask, type TaskAccess } from "@/lib/taskPermissions";
import type { BoardMember, Division } from "@/lib/types";

interface BoardCtx {
  data: BoardData;
  boardId: number;
  roots: TaskNode[];
  byId: Map<number, TaskNode>;
  access: TaskAccess;
  people: Map<string, BoardMember>;
  divisions: Division[];
  canWork: (taskId: number) => boolean;
}

const Ctx = createContext<BoardCtx | null>(null);

/** Everything a board screen derives once from the cached board query. */
export function BoardProvider({ data, children }: { data: BoardData; children: ReactNode }) {
  const { user, isAdmin } = useAuth();
  const { data: divisions = [] } = useDivisions();
  const value = useMemo<BoardCtx>(() => {
    const { roots, byId } = buildTaskTree(data.tasks);
    const access = accessFor(user?.id ?? "", isAdmin(), data.members);
    return {
      data,
      boardId: data.board.id,
      roots,
      byId,
      access,
      people: new Map(data.members.map((m) => [m.user_id, m])),
      divisions,
      canWork: (id) => canWorkTask(access, lineageAssigneeIds(byId, id)),
    };
  }, [data, divisions, user?.id, isAdmin]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBoardCtx() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useBoardCtx outside BoardProvider");
  return ctx;
}
```

Create `src/components/board/taskStyles.ts`:

```ts
import type { TaskPriority, TaskStatus } from "@/lib/types";

export const STATUS_STYLE: Record<TaskStatus, string> = {
  todo: "bg-muted text-muted-foreground",
  in_progress: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  in_review: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  done: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
};

export const PRIORITY_STYLE: Record<TaskPriority, string> = {
  low: "text-muted-foreground",
  medium: "text-sky-600 dark:text-sky-400",
  high: "text-amber-600 dark:text-amber-400",
  urgent: "text-red-600 dark:text-red-400",
};

export const STATUSES: TaskStatus[] = ["todo", "in_progress", "in_review", "done"];
export const PRIORITIES: TaskPriority[] = ["low", "medium", "high", "urgent"];
```

Create `src/components/board/dndKeys.ts`:

```ts
import type { UniqueIdentifier } from "@dnd-kit/core";

// Cards and columns share one DndContext, so their ids carry a kind prefix.
export const cardKey = (id: number) => `task-${id}`;
export const colKey = (id: number) => `col-${id}`;

export const parseKey = (k: UniqueIdentifier) => {
  const [kind, id] = String(k).split("-");
  return { kind: kind as "task" | "col", id: Number(id) };
};
```

Create `src/components/board/AvatarStack.tsx`:

```tsx
import { UserAvatar } from "@/components/ui/UserAvatar";
import { useBoardCtx } from "./BoardContext";

/** Up to `max` member avatars, then a +N. */
export function AvatarStack({ userIds, max = 4 }: { userIds: string[]; max?: number }) {
  const { people } = useBoardCtx();
  const shown = userIds.slice(0, max);
  return (
    <div className="flex -space-x-1.5">
      {shown.map((id) => {
        const p = people.get(id)?.profile;
        return (
          <UserAvatar
            key={id}
            name={p?.full_name ?? "?"}
            avatarUrl={p?.avatar_url}
            size="xs"
            className="ring-2 ring-card"
          />
        );
      })}
      {userIds.length > max && (
        <span className="ml-2 text-[10px] text-muted-foreground">+{userIds.length - max}</span>
      )}
    </div>
  );
}
```

Create `src/components/board/EditableText.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/** Plain text that turns into a textarea on click and saves on blur. */
export function EditableText({
  value,
  onSave,
  placeholder,
  disabled,
  className,
  multiline = true,
}: {
  value: string | null;
  onSave: (v: string | null) => void;
  placeholder: string;
  disabled?: boolean;
  className?: string;
  multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => setDraft(value ?? ""), [value]);

  function commit() {
    setEditing(false);
    const next = draft.trim() || null;
    if (next !== (value?.trim() || null)) onSave(next);
  }

  if (editing && !disabled) {
    return (
      <Textarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setDraft(value ?? "");
            setEditing(false);
          }
          if (e.key === "Enter" && (!multiline || e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            commit();
          }
        }}
        className={cn("text-sm", multiline ? "min-h-[90px]" : "min-h-0 resize-none", className)}
      />
    );
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setEditing(true)}
      className={cn(
        "w-full whitespace-pre-wrap rounded-md px-2 py-1.5 text-left text-sm",
        !disabled && "hover:bg-muted",
        value ? "text-foreground" : "text-muted-foreground",
        className,
      )}
    >
      {value || placeholder}
    </button>
  );
}
```

Create `src/components/board/PeoplePicker.tsx`:

```tsx
import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { cn } from "@/lib/utils";
import { useBoardCtx } from "./BoardContext";

/** Project members with a tick for the selected ones; toggles one at a time. */
export function PeoplePicker({
  selected,
  onToggle,
  isLocked,
  trigger,
}: {
  selected: string[];
  onToggle: (userId: string, on: boolean) => void;
  /** Selected people the caller may not remove. */
  isLocked?: (userId: string) => boolean;
  trigger: ReactNode;
}) {
  const { data } = useBoardCtx();
  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1">
        <div className="max-h-72 overflow-y-auto">
          {data.members.map((m) => {
            const on = selected.includes(m.user_id);
            const locked = on && isLocked?.(m.user_id);
            return (
              <button
                key={m.user_id}
                type="button"
                disabled={locked}
                onClick={() => onToggle(m.user_id, !on)}
                className={cn(
                  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted",
                  locked && "opacity-50",
                )}
              >
                <UserAvatar name={m.profile?.full_name ?? "?"} avatarUrl={m.profile?.avatar_url} size="xs" />
                <span className="flex-1 truncate text-left">{m.profile?.full_name}</span>
                {on && <Check className="h-4 w-4 text-primary" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Meta fields, status bar, review**

Create `src/components/board/TaskMetaFields.tsx`:

```tsx
import { Plus, Tag } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  useAssign,
  useCreateLabel,
  useToggleLabel,
  useToggleReviewer,
  useUnassign,
  useUpdateTask,
  type TaskPatch,
} from "@/hooks/useBoardTasks";
import { canUnassign, isBoardPic } from "@/lib/taskPermissions";
import type { TaskNode } from "@/lib/taskTree";
import { useBoardCtx } from "./BoardContext";
import { AvatarStack } from "./AvatarStack";
import { PeoplePicker } from "./PeoplePicker";
import { PRIORITIES, PRIORITY_STYLE } from "./taskStyles";

const NONE = "none";
const LABEL_COLORS = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#64748b"];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export function TaskMetaFields({ node }: { node: TaskNode }) {
  const { t } = useTranslation();
  const { boardId, data, divisions, access, canWork } = useBoardCtx();
  const task = node.task;
  const editable = canWork(task.id) || task.created_by === access.userId;
  const update = useUpdateTask(boardId);
  const assign = useAssign(boardId);
  const unassign = useUnassign(boardId);
  const toggleReviewer = useToggleReviewer(boardId);
  const toggleLabel = useToggleLabel(boardId);
  const createLabel = useCreateLabel(boardId);
  const save = (patch: TaskPatch) => update.mutate({ id: task.id, ...patch });
  const assigneeIds = task.assignees.map((a) => a.user_id);
  // The creator may hand out a fresh, unassigned node (task_assignees_insert).
  const canAssign = canWork(task.id) || (assigneeIds.length === 0 && task.created_by === access.userId);
  const pic = isBoardPic(access);

  const addButton = (
    <button type="button" className="rounded-full border border-dashed border-border p-1 text-muted-foreground hover:bg-muted" aria-label={t("board.meta.add")}>
      <Plus className="h-3.5 w-3.5" />
    </button>
  );

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
      <Field label={t("board.meta.assignees")}>
        <div className="flex items-center gap-2">
          <AvatarStack userIds={assigneeIds} max={6} />
          {canAssign && (
            <PeoplePicker
              selected={assigneeIds}
              isLocked={(uid) => !canUnassign(access, task.assignees.find((a) => a.user_id === uid)?.assigned_by ?? null)}
              onToggle={(userId, on) => (on ? assign : unassign).mutate({ taskId: task.id, userId })}
              trigger={addButton}
            />
          )}
        </div>
      </Field>

      <Field label={t("board.meta.reviewers")}>
        <div className="flex items-center gap-2">
          {task.reviewers.length ? (
            <AvatarStack userIds={task.reviewers.map((r) => r.user_id)} />
          ) : (
            <span className="text-xs text-muted-foreground">{t("board.meta.reviewersDefault")}</span>
          )}
          {pic && (
            <PeoplePicker
              selected={task.reviewers.map((r) => r.user_id)}
              onToggle={(userId, on) => toggleReviewer.mutate({ taskId: task.id, userId, on })}
              trigger={addButton}
            />
          )}
        </div>
      </Field>

      <Field label={t("board.meta.division")}>
        <Select
          disabled={!editable}
          value={task.division_id ? String(task.division_id) : NONE}
          onValueChange={(v) => save({ division_id: v === NONE ? null : Number(v) })}
        >
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE} className="text-xs">{t("board.meta.none")}</SelectItem>
            {divisions.filter((d) => d.is_active || d.id === task.division_id).map((d) => (
              <SelectItem key={d.id} value={String(d.id)} className="text-xs">{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label={t("board.meta.priority")}>
        <Select disabled={!editable} value={task.priority} onValueChange={(v) => save({ priority: v as TaskPatch["priority"] })}>
          <SelectTrigger className={cn("h-8 text-xs", PRIORITY_STYLE[task.priority])}><SelectValue /></SelectTrigger>
          <SelectContent>
            {PRIORITIES.map((p) => (
              <SelectItem key={p} value={p} className={cn("text-xs", PRIORITY_STYLE[p])}>{t(`board.priority.${p}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <DatePickerField
        label={t("board.meta.start")}
        value={task.start_date}
        onChange={(v) => save({ start_date: v })}
        clearLabel={t("board.meta.clear")}
        className={editable ? undefined : "pointer-events-none opacity-60"}
      />
      <DatePickerField
        label={t("board.meta.due")}
        value={task.due_date}
        fromDate={task.start_date}
        onChange={(v) => save({ due_date: v })}
        clearLabel={t("board.meta.clear")}
        className={editable ? undefined : "pointer-events-none opacity-60"}
      />

      <Field label={t("board.meta.estimate")}>
        <Input
          type="number"
          min={0}
          step={0.5}
          disabled={!editable}
          defaultValue={task.estimate_hours ?? ""}
          key={task.estimate_hours ?? "none"}
          onBlur={(e) => {
            const v = e.target.value === "" ? null : Number(e.target.value);
            if (v !== task.estimate_hours) save({ estimate_hours: v });
          }}
          className="h-8 text-xs"
        />
      </Field>

      <Field label={t("board.meta.labels")}>
        <div className="flex flex-wrap items-center gap-1">
          {data.labels.filter((l) => task.labels.some((x) => x.label_id === l.id)).map((l) => (
            <span key={l.id} className="rounded px-1.5 py-0.5 text-[11px] text-white" style={{ background: l.color }}>{l.name}</span>
          ))}
          {editable && (
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label={t("board.meta.labels")}>
                  <Tag className="h-3.5 w-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-56 space-y-1 p-2">
                {data.labels.map((l) => {
                  const on = task.labels.some((x) => x.label_id === l.id);
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => toggleLabel.mutate({ taskId: task.id, labelId: l.id, on: !on })}
                      className={cn("flex w-full items-center gap-2 rounded px-2 py-1 text-xs hover:bg-muted", on && "font-semibold")}
                    >
                      <span className="h-3 w-3 rounded" style={{ background: l.color }} />
                      {l.name}
                    </button>
                  );
                })}
                {pic && (
                  <Input
                    placeholder={t("board.meta.newLabel")}
                    className="h-7 text-xs"
                    onKeyDown={(e) => {
                      const name = e.currentTarget.value.trim();
                      if (e.key !== "Enter" || !name) return;
                      createLabel.mutate({ name, color: LABEL_COLORS[data.labels.length % LABEL_COLORS.length] });
                      e.currentTarget.value = "";
                    }}
                  />
                )}
              </PopoverContent>
            </Popover>
          )}
        </div>
      </Field>
    </div>
  );
}
```

Create `src/components/board/ReviewDialog.tsx`:

```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useReviewTask } from "@/hooks/useBoardTasks";
import { useBoardCtx } from "./BoardContext";

export function ReviewDialog({
  taskId,
  decision,
  onClose,
}: {
  taskId: number;
  decision: "approved" | "rejected" | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { boardId } = useBoardCtx();
  const review = useReviewTask(boardId);
  const [note, setNote] = useState("");
  const needsNote = decision === "rejected" && !note.trim();

  return (
    <Dialog open={decision != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {decision === "approved" ? t("board.review.approveTitle") : t("board.review.rejectTitle")}
          </DialogTitle>
        </DialogHeader>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={decision === "rejected" ? t("board.review.rejectPlaceholder") : t("board.review.notePlaceholder")}
          className="min-h-[100px] text-sm"
        />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
          <Button
            disabled={needsNote}
            loading={review.isPending}
            variant={decision === "rejected" ? "destructive" : "default"}
            onClick={() =>
              decision &&
              review.mutate(
                { taskId, decision, note },
                {
                  onSuccess: () => {
                    setNote("");
                    onClose();
                  },
                },
              )
            }
          >
            {decision === "approved" ? t("board.review.approve") : t("board.review.reject")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

Create `src/components/board/TaskStatusBar.tsx`:

```tsx
import { useState } from "react";
import { Check, Send, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSubmitReview, useUpdateTask } from "@/hooks/useBoardTasks";
import { canReviewTask, submitBlocker } from "@/lib/taskPermissions";
import { isSentBack, lineageAssigneeIds, type TaskNode } from "@/lib/taskTree";
import { useBoardCtx } from "./BoardContext";
import { ReviewDialog } from "./ReviewDialog";
import { STATUS_STYLE } from "./taskStyles";

export function TaskStatusBar({ node }: { node: TaskNode }) {
  const { t } = useTranslation();
  const { boardId, byId, access, canWork } = useBoardCtx();
  const update = useUpdateTask(boardId);
  const submit = useSubmitReview(boardId);
  const [decision, setDecision] = useState<"approved" | "rejected" | null>(null);
  const task = node.task;
  const blocker = submitBlocker(access, node, lineageAssigneeIds(byId, task.id));
  const open = task.status === "todo" || task.status === "in_progress";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={cn("rounded px-2 py-1 text-xs font-medium", STATUS_STYLE[task.status])}>
        {t(`board.status.${task.status}`)}
      </span>
      {isSentBack(task) && (
        <span className="rounded bg-red-500/15 px-2 py-1 text-xs text-red-600 dark:text-red-400">{t("board.sentBack")}</span>
      )}
      {open && canWork(task.id) && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => update.mutate({ id: task.id, status: task.status === "todo" ? "in_progress" : "todo" })}
        >
          {task.status === "todo" ? t("board.actions.start") : t("board.actions.backToTodo")}
        </Button>
      )}
      {open && blocker !== "not_assignee" && (
        <Button
          size="sm"
          disabled={blocker != null}
          loading={submit.isPending}
          onClick={() => submit.mutate(task.id)}
          title={blocker ? t(`board.blockers.${blocker}`) : undefined}
        >
          <Send className="mr-1 h-3.5 w-3.5" />
          {t("board.actions.submit")}
        </Button>
      )}
      {open && blocker && blocker !== "not_assignee" && (
        <span className="text-xs text-muted-foreground">{t(`board.blockers.${blocker}`)}</span>
      )}
      {canReviewTask(access, task) && (
        <>
          <Button size="sm" onClick={() => setDecision("approved")}>
            <Check className="mr-1 h-3.5 w-3.5" />
            {t("board.review.approve")}
          </Button>
          <Button size="sm" variant="destructive" onClick={() => setDecision("rejected")}>
            <X className="mr-1 h-3.5 w-3.5" />
            {t("board.review.reject")}
          </Button>
        </>
      )}
      <ReviewDialog taskId={task.id} decision={decision} onClose={() => setDecision(null)} />
    </div>
  );
}
```

- [ ] **Step 3: Steps, subtree, move menu**

Create `src/components/board/TaskSteps.tsx`:

```tsx
import { useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, ListChecks, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { format, parseISO } from "date-fns";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useTaskSteps, useTaskStepWrites } from "@/hooks/useTaskSteps";
import { neighbourIds } from "@/lib/position";
import type { TaskStep } from "@/lib/types";
import { useBoardCtx } from "./BoardContext";
import { EditableText } from "./EditableText";

function StepRow({ step, canWork, writes }: { step: TaskStep; canWork: boolean; writes: ReturnType<typeof useTaskStepWrites> }) {
  const { t } = useTranslation();
  const { people } = useBoardCtx();
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: step.id, disabled: !canWork });
  const doneBy = step.done_by ? people.get(step.done_by)?.profile?.full_name : null;
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className="group flex items-start gap-2 rounded-md py-1 hover:bg-muted/50">
      {canWork && (
        <button type="button" className="mt-1.5 cursor-grab text-muted-foreground opacity-0 group-hover:opacity-100" aria-label={t("board.steps.reorder")} {...attributes} {...listeners}>
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      )}
      <Checkbox
        className="mt-2"
        checked={step.is_done}
        disabled={!canWork}
        onCheckedChange={(v) => writes.update.mutate({ id: step.id, is_done: v === true })}
        aria-label={step.title}
      />
      <div className="min-w-0 flex-1">
        <EditableText
          value={step.title}
          multiline={false}
          disabled={!canWork}
          placeholder={t("board.steps.titlePlaceholder")}
          onSave={(v) => v && writes.update.mutate({ id: step.id, title: v })}
          className={step.is_done ? "line-through text-muted-foreground" : undefined}
        />
        <EditableText
          value={step.note}
          disabled={!canWork}
          placeholder={canWork ? t("board.steps.notePlaceholder") : ""}
          onSave={(v) => writes.update.mutate({ id: step.id, note: v })}
          className="text-xs text-muted-foreground"
        />
        {step.is_done && step.done_at && (
          <p className="px-2 text-[11px] text-emerald-600 dark:text-emerald-400">
            {t("board.steps.doneBy", { name: doneBy ?? "?", at: format(parseISO(step.done_at), "d MMM yyyy HH:mm") })}
          </p>
        )}
      </div>
      {canWork && (
        <button type="button" onClick={() => writes.remove.mutate(step.id)} className="mt-1.5 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100" aria-label={t("board.steps.delete")}>
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/** The checklist that leads to the expected output; only assignees can tick. */
export function TaskSteps({ taskId }: { taskId: number }) {
  const { t } = useTranslation();
  const { boardId, canWork: canWorkTask } = useBoardCtx();
  const canWork = canWorkTask(taskId);
  const { data: steps = [] } = useTaskSteps(taskId);
  const writes = useTaskStepWrites(boardId, taskId);
  const [order, setOrder] = useState<number[] | null>(null);
  const ids = order ?? steps.map((s) => s.id);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const done = steps.filter((s) => s.is_done).length;

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const next = arrayMove(ids, ids.indexOf(Number(active.id)), ids.indexOf(Number(over.id)));
    setOrder(next);
    writes.move.mutate(
      { stepId: Number(active.id), ...neighbourIds(next, next.indexOf(Number(active.id))) },
      { onSettled: () => setOrder(null) },
    );
  }

  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <ListChecks className="h-4 w-4" />
        {t("board.steps.title")}
        <span className="text-xs font-normal text-muted-foreground">{done}/{steps.length}</span>
      </h3>
      {steps.length > 0 && <Progress value={(done / steps.length) * 100} className="h-1.5" />}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {ids.map((id) => {
            const step = steps.find((s) => s.id === id);
            return step ? <StepRow key={id} step={step} canWork={canWork} writes={writes} /> : null;
          })}
        </SortableContext>
      </DndContext>
      {canWork && (
        <Input
          placeholder={t("board.steps.addPlaceholder")}
          className="h-8 text-sm"
          onKeyDown={(e) => {
            const title = e.currentTarget.value.trim();
            if (e.key !== "Enter" || !title) return;
            const last = steps.reduce((m, s) => Math.max(m, s.position), 0);
            writes.add.mutate({ title, position: last + 1024 });
            e.currentTarget.value = "";
          }}
        />
      )}
    </section>
  );
}
```

Create `src/components/board/TaskSubtree.tsx`:

```tsx
import { useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronRight, GitBranch, GripVertical } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useCreateTask, useReparentTask } from "@/hooks/useBoardTasks";
import { neighbourIds } from "@/lib/position";
import { computeProgress, type TaskNode } from "@/lib/taskTree";
import { useBoardCtx } from "./BoardContext";
import { AvatarStack } from "./AvatarStack";
import { STATUS_STYLE } from "./taskStyles";

function SubtaskRow({ node, depth, onOpen, sortable }: { node: TaskNode; depth: number; onOpen: (taskNo: number) => void; sortable: boolean }) {
  const { t } = useTranslation();
  const { divisions, canWork } = useBoardCtx();
  const [expanded, setExpanded] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: node.task.id,
    disabled: !sortable || !canWork(node.task.id),
  });
  const task = node.task;
  const progress = computeProgress(node);
  const division = divisions.find((d) => d.id === task.division_id);

  return (
    <div ref={sortable ? setNodeRef : undefined} style={sortable ? { transform: CSS.Transform.toString(transform), transition } : undefined}>
      <div className="group flex items-center gap-1.5 rounded-md py-1 pr-1 hover:bg-muted/50" style={{ paddingLeft: depth * 16 }}>
        {sortable && canWork(task.id) ? (
          <button type="button" className="cursor-grab text-muted-foreground opacity-0 group-hover:opacity-100" aria-label={t("board.subtasks.reorder")} {...attributes} {...listeners}>
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        ) : (
          <span className="w-3.5" />
        )}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={cn("text-muted-foreground", node.children.length === 0 && "invisible")}
          aria-label={t("board.subtasks.expand")}
        >
          <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-90")} />
        </button>
        <button type="button" onClick={() => onOpen(task.task_no)} className="min-w-0 flex-1 truncate text-left text-sm hover:underline">
          <span className="mr-1 font-mono text-[11px] text-muted-foreground">#{task.task_no}</span>
          {task.title}
        </button>
        {division && (
          <span className="rounded px-1.5 text-[10px] text-white" style={{ background: division.color ?? "#64748b" }}>{division.name}</span>
        )}
        {progress.total > 0 && <span className="text-[11px] tabular-nums text-muted-foreground">{progress.done}/{progress.total}</span>}
        <span className={cn("rounded px-1.5 text-[10px]", STATUS_STYLE[task.status])}>{t(`board.status.${task.status}`)}</span>
        <AvatarStack userIds={task.assignees.map((a) => a.user_id)} max={3} />
      </div>
      {expanded && node.children.map((c) => <SubtaskRow key={c.task.id} node={c} depth={depth + 1} onOpen={onOpen} sortable={false} />)}
    </div>
  );
}

/** Direct subtasks reorder by drag; deeper levels expand in place. */
export function TaskSubtree({ node, onOpen }: { node: TaskNode; onOpen: (taskNo: number) => void }) {
  const { t } = useTranslation();
  const { boardId, canWork } = useBoardCtx();
  const create = useCreateTask(boardId);
  const reparent = useReparentTask(boardId);
  const [order, setOrder] = useState<number[] | null>(null);
  const ids = order ?? node.children.map((c) => c.task.id);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const next = arrayMove(ids, ids.indexOf(Number(active.id)), ids.indexOf(Number(over.id)));
    setOrder(next);
    reparent.mutate(
      { taskId: Number(active.id), parentId: node.task.id, ...neighbourIds(next, next.indexOf(Number(active.id))) },
      { onSettled: () => setOrder(null) },
    );
  }

  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <GitBranch className="h-4 w-4" />
        {t("board.subtasks.title")}
        <span className="text-xs font-normal text-muted-foreground">{node.children.length}</span>
      </h3>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {ids.map((id) => {
            const child = node.children.find((c) => c.task.id === id);
            return child ? <SubtaskRow key={id} node={child} depth={0} onOpen={onOpen} sortable /> : null;
          })}
        </SortableContext>
      </DndContext>
      {canWork(node.task.id) && (
        <Input
          placeholder={t("board.subtasks.addPlaceholder")}
          className="h-8 text-sm"
          onKeyDown={(e) => {
            const title = e.currentTarget.value.trim();
            if (e.key !== "Enter" || !title) return;
            const last = node.children.reduce((m, c) => Math.max(m, c.task.position), 0);
            create.mutate({ title, parent_id: node.task.id, position: last + 1024, division_id: node.task.division_id });
            e.currentTarget.value = "";
          }}
        />
      )}
    </section>
  );
}
```

Create `src/components/board/MoveTaskMenu.tsx`:

```tsx
import { useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { useMoveTask, useReparentTask } from "@/hooks/useBoardTasks";
import { lineage, type TaskNode } from "@/lib/taskTree";
import { useBoardCtx } from "./BoardContext";

/** Keyboard/touch-friendly alternative to dragging: column moves and reparenting. */
export function MoveTaskMenu({ node }: { node: TaskNode }) {
  const { t } = useTranslation();
  const { boardId, data, roots, byId, canWork } = useBoardCtx();
  const move = useMoveTask(boardId);
  const reparent = useReparentTask(boardId);
  const [picking, setPicking] = useState(false);
  const task = node.task;
  if (!canWork(task.id)) return null;

  const lastId = (list: TaskNode[]) => list[list.length - 1]?.task.id ?? null;
  const lastRootIn = (columnId: number) =>
    lastId(roots.filter((r) => r.task.column_id === columnId && r.task.id !== task.id));

  function toColumn(columnId: number) {
    const beforeId = lastRootIn(columnId);
    if (task.parent_id == null) move.mutate({ taskId: task.id, columnId, beforeId, afterId: null });
    else reparent.mutate({ taskId: task.id, parentId: null, columnId, beforeId, afterId: null });
  }

  // A node cannot move under itself or its own subtree.
  const candidates = [...byId.values()].filter(
    (n) => n.task.id !== task.parent_id && !lineage(byId, n.task.id).some((a) => a.task.id === task.id) && canWork(n.task.id),
  );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline">
            <ArrowRightLeft className="mr-1 h-3.5 w-3.5" />
            {t("board.move.title")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              {task.parent_id == null ? t("board.move.toColumn") : t("board.move.promote")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {data.columns.map((c) => (
                <DropdownMenuItem key={c.id} disabled={c.id === task.column_id} onClick={() => toColumn(c.id)}>
                  {c.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem onClick={() => setPicking(true)}>{t("board.move.underTask")}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={picking} onOpenChange={setPicking}>
        <DialogContent className="max-w-md p-0">
          <DialogHeader className="px-4 pt-4">
            <DialogTitle>{t("board.move.underTask")}</DialogTitle>
          </DialogHeader>
          <Command>
            <CommandInput placeholder={t("board.move.search")} />
            <CommandList>
              <CommandEmpty>{t("board.move.none")}</CommandEmpty>
              {candidates.map((n) => (
                <CommandItem
                  key={n.task.id}
                  value={`#${n.task.task_no} ${n.task.title}`}
                  onSelect={() => {
                    setPicking(false);
                    reparent.mutate({
                      taskId: task.id,
                      parentId: n.task.id,
                      beforeId: lastId(n.children),
                      afterId: null,
                    });
                  }}
                >
                  <span className="mr-2 font-mono text-xs text-muted-foreground">#{n.task.task_no}</span>
                  <span style={{ paddingLeft: n.task.depth * 12 }}>{n.task.title}</span>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 4: Activity, daily logs, the dialog**

Create `src/components/board/TaskActivityFeed.tsx`:

```tsx
import { formatDistanceToNow, parseISO } from "date-fns";
import { useTranslation } from "react-i18next";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { useTaskActivity } from "@/hooks/useTaskActivity";
import { useDateFnsLocale } from "@/lib/dateLocale";
import type { TaskActivity } from "@/lib/types";
import { useBoardCtx } from "./BoardContext";

function describe(a: TaskActivity, t: (k: string, o?: Record<string, unknown>) => string, name: (id: unknown) => string, column: (id: unknown) => string) {
  const d = a.detail;
  switch (a.action) {
    case "updated":
      return t("board.activity.updated", { field: t(`board.fields.${String(d.field)}`), to: d.to == null ? "-" : String(d.to) });
    case "moved":
      return t("board.activity.moved", { from: column(d.from), to: column(d.to) });
    case "assigned":
    case "unassigned":
      return t(`board.activity.${a.action}`, { name: name(d.user_id) });
    case "step_added":
    case "step_checked":
    case "step_unchecked":
    case "step_removed":
      return t(`board.activity.${a.action}`, { title: String(d.title ?? "") });
    case "rejected":
    case "approved":
      return t(`board.activity.${a.action}`, { note: d.note ? `: ${String(d.note)}` : "" });
    default:
      return t(`board.activity.${a.action}`);
  }
}

/** Who did what to this node, newest first. Written by DB triggers only. */
export function TaskActivityFeed({ taskId }: { taskId: number }) {
  const { t } = useTranslation();
  const locale = useDateFnsLocale();
  const { people, data } = useBoardCtx();
  const { data: items = [], isLoading } = useTaskActivity(taskId);
  const name = (id: unknown) => people.get(String(id))?.profile?.full_name ?? "?";
  const column = (id: unknown) => data.columns.find((c) => c.id === Number(id))?.name ?? "-";

  if (isLoading) return <p className="text-xs text-muted-foreground">{t("common.loading")}</p>;
  return (
    <ol className="space-y-3">
      {items.map((a) => {
        const actor = a.actor_id ? people.get(a.actor_id)?.profile : null;
        return (
          <li key={a.id} className="flex gap-2">
            <UserAvatar name={actor?.full_name ?? "?"} avatarUrl={actor?.avatar_url} size="sm" />
            <div className="min-w-0 text-xs">
              <p className="text-foreground">
                <span className="font-semibold">{actor?.full_name ?? t("board.activity.system")}</span>{" "}
                {describe(a, t, name, column)}
              </p>
              <p className="text-muted-foreground">{formatDistanceToNow(parseISO(a.created_at), { addSuffix: true, locale })}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
```

Create `src/components/board/TaskDailyLogs.tsx`:

```tsx
import { format, parseISO } from "date-fns";
import { NotebookPen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDailyTasksForBoardTask } from "@/hooks/useDailyTasks";

/** Daily report entries that say they worked on this node. */
export function TaskDailyLogs({ taskId }: { taskId: number }) {
  const { t } = useTranslation();
  const { data: logs = [] } = useDailyTasksForBoardTask(taskId);
  if (logs.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <NotebookPen className="h-4 w-4" />
        {t("board.dailyLogs.title")}
        <span className="text-xs font-normal text-muted-foreground">{logs.length}</span>
      </h3>
      <ul className="space-y-1.5">
        {logs.map((l) => (
          <li key={l.id} className="rounded-md bg-muted/50 px-2 py-1.5 text-xs">
            <span className="font-medium">{l.employee?.full_name}</span>
            <span className="ml-2 text-muted-foreground">{format(parseISO(l.date), "d MMM yyyy")} · {l.progress_pct}%</span>
            <p className="mt-0.5 text-foreground/90">{l.task_desc}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

Create `src/components/board/TaskDetailDialog.tsx`:

```tsx
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { TaskComments } from "@/components/daily-report/TaskComments";
import { TaskAttachments } from "@/components/daily-report/TaskAttachments";
import { useUpdateTask } from "@/hooks/useBoardTasks";
import { isBoardPic } from "@/lib/taskPermissions";
import { lineage } from "@/lib/taskTree";
import { useBoardCtx } from "./BoardContext";
import { EditableText } from "./EditableText";
import { MoveTaskMenu } from "./MoveTaskMenu";
import { TaskActivityFeed } from "./TaskActivityFeed";
import { TaskDailyLogs } from "./TaskDailyLogs";
import { TaskMetaFields } from "./TaskMetaFields";
import { TaskStatusBar } from "./TaskStatusBar";
import { TaskSteps } from "./TaskSteps";
import { TaskSubtree } from "./TaskSubtree";

/** One node of the tree; subtasks open in place and the breadcrumb walks back up. */
export function TaskDetailDialog({
  taskNo,
  onOpen,
  onClose,
}: {
  taskNo: number | null;
  onOpen: (taskNo: number) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { boardId, byId, data, access, canWork } = useBoardCtx();
  const update = useUpdateTask(boardId);
  const row = taskNo == null ? undefined : data.tasks.find((x) => x.task_no === taskNo);
  const node = row ? byId.get(row.id) : undefined;
  if (!node) return null;

  const task = node.task;
  const editable = canWork(task.id) || task.created_by === access.userId;
  const column = data.columns.find((c) => c.id === lineage(byId, task.id)[0]?.task.column_id);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[90vh] max-w-5xl flex-col gap-0 p-0">
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[1fr_340px]">
          <div className="min-h-0 space-y-5 overflow-y-auto p-5 scrollbar-thin">
            <nav className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              {column && <span className="rounded bg-muted px-1.5 py-0.5">{column.name}</span>}
              {lineage(byId, task.id).slice(0, -1).map((a) => (
                <button key={a.task.id} type="button" onClick={() => onOpen(a.task.task_no)} className="inline-flex items-center gap-1 hover:text-foreground">
                  <ChevronRight className="h-3 w-3" />#{a.task.task_no} {a.task.title}
                </button>
              ))}
            </nav>

            <div>
              <DialogTitle asChild>
                <div className="flex items-start gap-2">
                  <span className="mt-1.5 font-mono text-sm text-muted-foreground">#{task.task_no}</span>
                  <EditableText
                    value={task.title}
                    multiline={false}
                    disabled={!editable}
                    placeholder={t("board.card.titlePlaceholder")}
                    onSave={(v) => v && update.mutate({ id: task.id, title: v })}
                    className="text-lg font-semibold"
                  />
                </div>
              </DialogTitle>
              <DialogDescription className="sr-only">{t("board.card.detail")}</DialogDescription>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <TaskStatusBar node={node} />
              <div className="flex gap-2">
                <MoveTaskMenu node={node} />
                {isBoardPic(access) && (
                  <Button size="sm" variant="ghost" onClick={() => update.mutate({ id: task.id, archived_at: new Date().toISOString() }, { onSuccess: onClose })}>
                    {t("board.actions.archive")}
                  </Button>
                )}
              </div>
            </div>

            <TaskMetaFields node={node} />

            <section className="space-y-1">
              <h3 className="text-sm font-semibold">{t("board.fields.description")}</h3>
              <EditableText
                value={task.description}
                disabled={!editable}
                placeholder={t("board.card.descriptionPlaceholder")}
                onSave={(v) => update.mutate({ id: task.id, description: v })}
              />
            </section>

            <section className="space-y-1">
              <h3 className="text-sm font-semibold">{t("board.fields.expected_output")}</h3>
              <EditableText
                value={task.expected_output}
                disabled={!editable}
                placeholder={t("board.card.outputPlaceholder")}
                onSave={(v) => update.mutate({ id: task.id, expected_output: v })}
                className="border-l-2 border-primary/40"
              />
            </section>

            <TaskSteps taskId={task.id} />
            <TaskSubtree node={node} onOpen={onOpen} />
            <TaskAttachments taskId={task.id} source="board" />
            <TaskDailyLogs taskId={task.id} />
          </div>

          <aside className="flex min-h-0 flex-col border-t border-border p-4 md:border-l md:border-t-0">
            <Tabs defaultValue="comments" className="flex min-h-0 flex-1 flex-col">
              <TabsList className="self-start">
                <TabsTrigger value="comments">{t("board.tabs.comments")}</TabsTrigger>
                <TabsTrigger value="activity">{t("board.tabs.activity")}</TabsTrigger>
              </TabsList>
              <TabsContent value="comments" className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
                <TaskComments taskId={task.id} source="board" />
              </TabsContent>
              <TabsContent value="activity" className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
                <TaskActivityFeed taskId={task.id} />
              </TabsContent>
            </Tabs>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Add the strings**

Save this as `/tmp/i18n_board.py`, then run `python3 /tmp/i18n_board.py .` from the repo root. It merges keys and leaves the rest of each file untouched.

```python
# Merges the task-board strings into src/locales/{en,id}.json.
import json, sys
root = sys.argv[1]
EN = {
 "board": {
  "status": {"todo": "To do", "in_progress": "In progress", "in_review": "In review", "done": "Done"},
  "priority": {"low": "Low", "medium": "Medium", "high": "High", "urgent": "Urgent"},
  "roles": {"pic": "PIC", "reviewer": "Reviewer", "member": "Member"},
  "views": {"board": "Board", "list": "List", "workload": "Workload"},
  "sentBack": "Sent back",
  "actions": {"start": "Start", "backToTodo": "Back to to do", "submit": "Submit for review", "archive": "Archive"},
  "blockers": {"not_assignee": "Only an assignee can submit", "status": "Already in review or done", "output": "Fill in the expected output first", "steps": "Finish every step first", "subtasks": "Every subtask must be approved first"},
  "review": {"approve": "Approve", "reject": "Send back", "approveTitle": "Approve this task", "rejectTitle": "Send this task back", "notePlaceholder": "Optional note for the assignees", "rejectPlaceholder": "What needs fixing? (required)"},
  "boards": {"title": "Task Boards", "subtitle": "One board per project. Open a project to plan and track its work.", "search": "Search projects...", "empty": "No projects yet", "emptyHint": "You only see projects you are a member of.", "open": "{{count}} open", "overdue": "{{count}} overdue", "done": "{{count}} done"},
  "card": {"add": "Add a card", "titlePlaceholder": "Task title", "detail": "Task details", "descriptionPlaceholder": "What is this task about? Add context, links, acceptance notes...", "outputPlaceholder": "What exactly is delivered when this is done?"},
  "column": {"add": "Add column", "namePrompt": "Column name", "menu": "Column options", "rename": "Rename", "wip": "Set WIP limit", "wipPrompt": "Maximum cards in this column (empty for no limit)", "markDone": "Mark as done column", "unmarkDone": "Unmark done column", "delete": "Delete column", "deleteNonEmpty": "Move the cards out to delete"},
  "errors": {"doneNeedsApproval": "Only an approved task can go into a done column"},
  "fields": {"title": "title", "description": "Description", "expected_output": "Expected output", "division_id": "division", "priority": "priority", "start_date": "start date", "due_date": "due date", "estimate_hours": "estimate", "status": "status"},
  "filter": {"search": "Search title or #number...", "mine": "My tasks", "allPeople": "Everyone", "allDivisions": "All divisions", "allLabels": "All labels", "anyDue": "Any due date", "overdue": "Overdue", "week": "Due in 7 days"},
  "list": {"task": "Task", "column": "Column", "division": "Division", "assignees": "Assignees", "status": "Status", "progress": "Progress", "due": "Due"},
  "members": {"hint": "Roles decide who can manage the board (PIC) and who reviews work (PIC, Reviewer). Add or remove members in Master Hub."},
  "meta": {"add": "Add", "assignees": "Assignees", "reviewers": "Reviewers", "reviewersDefault": "Any PIC or reviewer", "division": "Division", "priority": "Priority", "start": "Start", "due": "Due", "estimate": "Estimate (hours)", "labels": "Labels", "newLabel": "New label, press Enter", "none": "None", "clear": "Clear"},
  "move": {"title": "Move", "toColumn": "To column", "promote": "Make it a card in", "underTask": "Make it a subtask of...", "search": "Search tasks...", "none": "No task fits"},
  "myTasks": {"title": "My Tasks", "mine": "Assigned to me", "review": "To review ({{count}})", "empty": "Nothing assigned to you", "noReview": "Nothing waiting for your review", "groups": {"overdue": "Overdue", "today": "Due today", "week": "Next 7 days", "later": "Later", "noDue": "No due date"}},
  "steps": {"title": "Steps", "addPlaceholder": "Add a step, press Enter", "titlePlaceholder": "Step", "notePlaceholder": "Add a note", "delete": "Delete step", "reorder": "Drag to reorder", "doneBy": "Done by {{name}} on {{at}}"},
  "subtasks": {"title": "Subtasks", "addPlaceholder": "Add a subtask, press Enter", "expand": "Show subtasks", "reorder": "Drag to reorder"},
  "tabs": {"comments": "Comments", "activity": "Activity"},
  "activity": {"system": "System", "created": "created this task", "updated": "changed {{field}} to {{to}}", "moved": "moved this from {{from}} to {{to}}", "reparented": "moved this in the task tree", "archived": "archived this task", "restored": "restored this task", "assigned": "assigned {{name}}", "unassigned": "removed {{name}}", "step_added": "added step \"{{title}}\"", "step_checked": "completed \"{{title}}\"", "step_unchecked": "reopened \"{{title}}\"", "step_removed": "deleted step \"{{title}}\"", "submitted_review": "submitted this for review", "approved": "approved this task{{note}}", "rejected": "sent this back{{note}}", "commented": "commented"},
  "dailyLogs": {"title": "Daily log entries"},
  "workload": {"person": "Person", "open": "Open", "todo": "To do", "in_progress": "In progress", "in_review": "In review", "overdue": "Overdue", "done_7d": "Done (7d)", "dashboardTitle": "Task workload"}
 },
 "nav.items": {"boards": "Task Boards", "myTasks": "My Tasks"},
 "nav.descriptions": {"boards": "Plan project work as cards, subtasks and steps", "myTasks": "Everything assigned to you, and what waits for your review"},
 "taskForm.fields": {"boardTask": "Board task"},
 "taskForm.placeholders": {"boardTask": "Not linked to a board task"},
 "master.tabs": {"divisions": "Divisions"},
 "master.masterList": {"divisions": {"title": "Divisions", "subtitle": "Teams that board tasks are split by", "itemLabel": "Division", "deleteTitle": "Delete division?", "deleteDesc": "Tasks in \"{{name}}\" keep their content but lose the division."}}
}
ID = {
 "board": {
  "status": {"todo": "Belum mulai", "in_progress": "Dikerjakan", "in_review": "Direview", "done": "Selesai"},
  "priority": {"low": "Rendah", "medium": "Sedang", "high": "Tinggi", "urgent": "Mendesak"},
  "roles": {"pic": "PIC", "reviewer": "Reviewer", "member": "Anggota"},
  "views": {"board": "Board", "list": "Daftar", "workload": "Beban kerja"},
  "sentBack": "Dikembalikan",
  "actions": {"start": "Mulai", "backToTodo": "Kembalikan ke belum mulai", "submit": "Ajukan review", "archive": "Arsipkan"},
  "blockers": {"not_assignee": "Hanya assignee yang bisa mengajukan", "status": "Sudah direview atau selesai", "output": "Isi output yang diharapkan dulu", "steps": "Selesaikan semua langkah dulu", "subtasks": "Semua subtask harus di-approve dulu"},
  "review": {"approve": "Approve", "reject": "Kembalikan", "approveTitle": "Approve task ini", "rejectTitle": "Kembalikan task ini", "notePlaceholder": "Catatan untuk assignee (opsional)", "rejectPlaceholder": "Apa yang perlu diperbaiki? (wajib)"},
  "boards": {"title": "Task Board", "subtitle": "Satu board per project. Buka project untuk merencanakan dan memantau pekerjaannya.", "search": "Cari project...", "empty": "Belum ada project", "emptyHint": "Kamu hanya melihat project tempat kamu menjadi anggota.", "open": "{{count}} aktif", "overdue": "{{count}} terlambat", "done": "{{count}} selesai"},
  "card": {"add": "Tambah card", "titlePlaceholder": "Judul task", "detail": "Detail task", "descriptionPlaceholder": "Task ini tentang apa? Tambahkan konteks, link, catatan penerimaan...", "outputPlaceholder": "Apa persisnya yang dihasilkan saat task ini selesai?"},
  "column": {"add": "Tambah kolom", "namePrompt": "Nama kolom", "menu": "Opsi kolom", "rename": "Ganti nama", "wip": "Atur batas WIP", "wipPrompt": "Maksimal card di kolom ini (kosongkan untuk tanpa batas)", "markDone": "Jadikan kolom selesai", "unmarkDone": "Batalkan kolom selesai", "delete": "Hapus kolom", "deleteNonEmpty": "Pindahkan card dulu untuk menghapus"},
  "errors": {"doneNeedsApproval": "Hanya task yang sudah di-approve yang bisa masuk kolom selesai"},
  "fields": {"title": "judul", "description": "Deskripsi", "expected_output": "Output yang diharapkan", "division_id": "divisi", "priority": "prioritas", "start_date": "tanggal mulai", "due_date": "tenggat", "estimate_hours": "estimasi", "status": "status"},
  "filter": {"search": "Cari judul atau #nomor...", "mine": "Task saya", "allPeople": "Semua orang", "allDivisions": "Semua divisi", "allLabels": "Semua label", "anyDue": "Semua tenggat", "overdue": "Terlambat", "week": "Tenggat 7 hari"},
  "list": {"task": "Task", "column": "Kolom", "division": "Divisi", "assignees": "Assignee", "status": "Status", "progress": "Progres", "due": "Tenggat"},
  "members": {"hint": "Role menentukan siapa yang mengelola board (PIC) dan siapa yang mereview pekerjaan (PIC, Reviewer). Tambah atau hapus anggota di Master Hub."},
  "meta": {"add": "Tambah", "assignees": "Assignee", "reviewers": "Reviewer", "reviewersDefault": "PIC atau reviewer mana pun", "division": "Divisi", "priority": "Prioritas", "start": "Mulai", "due": "Tenggat", "estimate": "Estimasi (jam)", "labels": "Label", "newLabel": "Label baru, tekan Enter", "none": "Tidak ada", "clear": "Hapus"},
  "move": {"title": "Pindah", "toColumn": "Ke kolom", "promote": "Jadikan card di", "underTask": "Jadikan subtask dari...", "search": "Cari task...", "none": "Tidak ada task yang cocok"},
  "myTasks": {"title": "Task Saya", "mine": "Ditugaskan ke saya", "review": "Perlu direview ({{count}})", "empty": "Belum ada task untukmu", "noReview": "Tidak ada yang menunggu review darimu", "groups": {"overdue": "Terlambat", "today": "Tenggat hari ini", "week": "7 hari ke depan", "later": "Nanti", "noDue": "Tanpa tenggat"}},
  "steps": {"title": "Langkah", "addPlaceholder": "Tambah langkah, tekan Enter", "titlePlaceholder": "Langkah", "notePlaceholder": "Tambah catatan", "delete": "Hapus langkah", "reorder": "Seret untuk mengurutkan", "doneBy": "Diselesaikan {{name}} pada {{at}}"},
  "subtasks": {"title": "Subtask", "addPlaceholder": "Tambah subtask, tekan Enter", "expand": "Tampilkan subtask", "reorder": "Seret untuk mengurutkan"},
  "tabs": {"comments": "Komentar", "activity": "Aktivitas"},
  "activity": {"system": "Sistem", "created": "membuat task ini", "updated": "mengubah {{field}} menjadi {{to}}", "moved": "memindahkan dari {{from}} ke {{to}}", "reparented": "memindahkan task ini di pohon task", "archived": "mengarsipkan task ini", "restored": "memulihkan task ini", "assigned": "menugaskan {{name}}", "unassigned": "melepas {{name}}", "step_added": "menambah langkah \"{{title}}\"", "step_checked": "menyelesaikan \"{{title}}\"", "step_unchecked": "membuka lagi \"{{title}}\"", "step_removed": "menghapus langkah \"{{title}}\"", "submitted_review": "mengajukan review", "approved": "meng-approve task ini{{note}}", "rejected": "mengembalikan task ini{{note}}", "commented": "berkomentar"},
  "dailyLogs": {"title": "Entri daily log"},
  "workload": {"person": "Orang", "open": "Aktif", "todo": "Belum mulai", "in_progress": "Dikerjakan", "in_review": "Direview", "overdue": "Terlambat", "done_7d": "Selesai (7h)", "dashboardTitle": "Beban kerja task"}
 },
 "nav.items": {"boards": "Task Board", "myTasks": "Task Saya"},
 "nav.descriptions": {"boards": "Rencanakan pekerjaan project sebagai card, subtask, dan langkah", "myTasks": "Semua yang ditugaskan ke kamu, dan yang menunggu review darimu"},
 "taskForm.fields": {"boardTask": "Task board"},
 "taskForm.placeholders": {"boardTask": "Tidak ditautkan ke task board"},
 "master.tabs": {"divisions": "Divisi"},
 "master.masterList": {"divisions": {"title": "Divisi", "subtitle": "Tim yang dipakai untuk membagi task board", "itemLabel": "Divisi", "deleteTitle": "Hapus divisi?", "deleteDesc": "Task di \"{{name}}\" tetap ada, hanya divisinya dikosongkan."}}
}
for lang, frag in (("en", EN), ("id", ID)):
    p = f"{root}/src/locales/{lang}.json"
    d = json.load(open(p, encoding="utf-8"))
    for path, val in frag.items():
        node = d
        for k in path.split("."):
            node = node.setdefault(k, {})
        node.update(val)
    json.dump(d, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    open(p, "a").write("\n")
```

Check: `python3 -c "import json;[json.load(open(f'src/locales/{l}.json')) for l in ('en','id')]"` prints nothing.

- [ ] **Step 6: Type-check**

```bash
./node_modules/.bin/tsc -b --noEmit
```
Expected: exit 0.

- [ ] **Step 7: Print the suggested commit message (do not commit)**

```
feat: task detail with steps, subtasks, review, activity
```


### Task 7: Board screen: columns with drag and drop, list and workload views, routes

**Files:**
- Create in `src/components/board/`: `TaskCard.tsx`, `ColumnHeader.tsx`, `BoardColumn.tsx`, `BoardColumns.tsx`, `MembersPopover.tsx`, `BoardHeader.tsx`, `BoardListView.tsx`, `WorkloadTable.tsx`
- Create: `src/pages/BoardsPage.tsx`, `src/pages/BoardPage.tsx`
- Modify: `src/router.tsx`, `src/lib/navigation.ts`

**Interfaces:**
- Consumes: Task 6 context and dialog, Task 5 hooks, Task 4 libs.
- Produces: routes `/boards`, `/boards/:boardId?task=<task_no>`, `/my-tasks` (page in Task 8). Also `WorkloadTable({ counts, members, onPick? })`, reused by Task 8.

- [ ] **Step 1: Cards and columns**

Create `src/components/board/TaskCard.tsx`:

```tsx
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarClock, CheckSquare, GitBranch, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { computeProgress, countDescendants, isSentBack, type TaskNode } from "@/lib/taskTree";
import { useBoardCtx } from "./BoardContext";
import { AvatarStack } from "./AvatarStack";
import { STATUS_STYLE } from "./taskStyles";
import { cardKey } from "./dndKeys";

export function TaskCardBody({ node }: { node: TaskNode }) {
  const { t } = useTranslation();
  const { data, divisions } = useBoardCtx();
  const task = node.task;
  const progress = computeProgress(node);
  const subtasks = countDescendants(node);
  const division = divisions.find((d) => d.id === task.division_id);
  const labels = data.labels.filter((l) => task.labels.some((x) => x.label_id === l.id));
  const today = format(new Date(), "yyyy-MM-dd");
  const overdue = task.status !== "done" && !!task.due_date && task.due_date < today;

  return (
    <div
      className="w-full text-left rounded-lg border border-border bg-card p-2.5 shadow-sm hover:border-primary/40 space-y-2"
    >
      {labels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {labels.map((l) => (
            <span key={l.id} className="h-1.5 w-8 rounded-full" style={{ background: l.color }} title={l.name} />
          ))}
        </div>
      )}
      <p className="text-[13px] leading-snug text-foreground">
        <span className="mr-1 font-mono text-[11px] text-muted-foreground">#{task.task_no}</span>
        {task.title}
      </p>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        {division && (
          <span className="rounded px-1.5 py-0.5 text-white" style={{ background: division.color ?? "#64748b" }}>
            {division.name}
          </span>
        )}
        {task.status !== "todo" && (
          <span className={cn("rounded px-1.5 py-0.5", STATUS_STYLE[task.status])}>
            {t(`board.status.${task.status}`)}
          </span>
        )}
        {isSentBack(task) && (
          <span className="inline-flex items-center gap-1 rounded bg-red-500/15 px-1.5 py-0.5 text-red-600 dark:text-red-400">
            <RotateCcw className="h-3 w-3" />
            {t("board.sentBack")}
          </span>
        )}
        {task.due_date && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded px-1.5 py-0.5",
              task.status === "done"
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                : overdue
                  ? "bg-red-500/15 text-red-600 dark:text-red-400"
                  : "bg-muted text-muted-foreground",
            )}
          >
            <CalendarClock className="h-3 w-3" />
            {format(parseISO(task.due_date), "d MMM")}
          </span>
        )}
        {progress.total > 0 && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded px-1.5 py-0.5",
              progress.done === progress.total
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                : "bg-muted text-muted-foreground",
            )}
          >
            <CheckSquare className="h-3 w-3" />
            {progress.done}/{progress.total}
          </span>
        )}
        {subtasks > 0 && (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <GitBranch className="h-3 w-3" />
            {subtasks}
          </span>
        )}
      </div>
      {task.assignees.length > 0 && (
        <div className="flex justify-end">
          <AvatarStack userIds={task.assignees.map((a) => a.user_id)} />
        </div>
      )}
    </div>
  );
}

/** Click or Enter opens the card; Space picks it up for keyboard dragging. */
export function SortableTaskCard({ node, onOpen }: { node: TaskNode; onOpen: () => void }) {
  const { canWork } = useBoardCtx();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: cardKey(node.task.id),
    disabled: !canWork(node.task.id),
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("rounded-lg cursor-pointer focus-visible:ring-2 focus-visible:ring-ring outline-none", isDragging && "opacity-40")}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
        else listeners?.onKeyDown?.(e);
      }}
    >
      <TaskCardBody node={node} />
    </div>
  );
}
```

Create `src/components/board/ColumnHeader.tsx`:

```tsx
import { useState } from "react";
import { CheckCircle2, MoreHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useDeleteColumn, useUpdateColumn } from "@/hooks/useBoardColumns";
import type { BoardColumn } from "@/lib/types";
import { useBoardCtx } from "./BoardContext";

export function ColumnHeader({
  column,
  count,
  dragHandle,
}: {
  column: BoardColumn;
  count: number;
  dragHandle: Record<string, unknown>;
}) {
  const { t } = useTranslation();
  const { boardId, access } = useBoardCtx();
  const update = useUpdateColumn(boardId);
  const remove = useDeleteColumn(boardId);
  const [editing, setEditing] = useState(false);
  const canManage = access.isAdmin || access.memberRole === "pic";
  const overWip = column.wip_limit != null && count > column.wip_limit;

  function rename(name: string) {
    setEditing(false);
    if (name.trim() && name.trim() !== column.name) update.mutate({ id: column.id, name: name.trim() });
  }

  function askWip() {
    const v = window.prompt(t("board.column.wipPrompt"), column.wip_limit?.toString() ?? "");
    if (v === null) return;
    const n = Number(v);
    update.mutate({ id: column.id, wip_limit: v.trim() && n > 0 ? Math.floor(n) : null });
  }

  return (
    <div className="flex items-center gap-2 px-1" {...(canManage ? dragHandle : {})}>
      {editing ? (
        <Input
          autoFocus
          defaultValue={column.name}
          className="h-7 text-sm"
          onBlur={(e) => rename(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") rename(e.currentTarget.value);
            if (e.key === "Escape") setEditing(false);
          }}
        />
      ) : (
        <p className="flex-1 truncate text-sm font-semibold text-foreground">
          {column.is_done_column && <CheckCircle2 className="mr-1 inline h-3.5 w-3.5 text-emerald-500" />}
          {column.name}
        </p>
      )}
      <span className={cn("text-xs tabular-nums", overWip ? "font-semibold text-red-500" : "text-muted-foreground")}>
        {count}
        {column.wip_limit != null && `/${column.wip_limit}`}
      </span>
      {canManage && (
        <DropdownMenu>
          <DropdownMenuTrigger className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label={t("board.column.menu")}>
            <MoreHorizontal className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setEditing(true)}>{t("board.column.rename")}</DropdownMenuItem>
            <DropdownMenuItem onClick={askWip}>{t("board.column.wip")}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => update.mutate({ id: column.id, is_done_column: !column.is_done_column })}>
              {column.is_done_column ? t("board.column.unmarkDone") : t("board.column.markDone")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive"
              disabled={count > 0}
              onClick={() => remove.mutate(column.id)}
            >
              {count > 0 ? t("board.column.deleteNonEmpty") : t("board.column.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
```

Create `src/components/board/BoardColumn.tsx`:

```tsx
import { useState } from "react";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCreateTask } from "@/hooks/useBoardTasks";
import type { BoardColumn as Column } from "@/lib/types";
import { useBoardCtx } from "./BoardContext";
import { ColumnHeader } from "./ColumnHeader";
import { SortableTaskCard } from "./TaskCard";
import { cardKey, colKey } from "./dndKeys";

export function BoardColumn({
  column,
  cardIds,
  onOpen,
}: {
  column: Column;
  /** Visible cards, in order. */
  cardIds: number[];
  onOpen: (taskNo: number) => void;
}) {
  const { t } = useTranslation();
  const { boardId, byId, data } = useBoardCtx();
  const create = useCreateTask(boardId);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: colKey(column.id),
  });

  function add() {
    const value = title.trim();
    if (!value) return setAdding(false);
    const last = data.tasks
      .filter((x) => x.column_id === column.id)
      .reduce((m, x) => Math.max(m, x.position), 0);
    create.mutate(
      { title: value, column_id: column.id, position: last + 1024 },
      { onSuccess: () => setTitle("") },
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex max-h-full w-72 shrink-0 flex-col gap-2 rounded-xl bg-muted/60 p-2",
        isDragging && "opacity-50",
      )}
    >
      <ColumnHeader column={column} count={cardIds.length} dragHandle={{ ...attributes, ...listeners }} />
      <SortableContext items={cardIds.map(cardKey)} strategy={verticalListSortingStrategy}>
        <div className="flex min-h-8 flex-col gap-2 overflow-y-auto scrollbar-thin">
          {cardIds.map((id) => {
            const node = byId.get(id);
            return node ? (
              <SortableTaskCard key={id} node={node} onOpen={() => onOpen(node.task.task_no)} />
            ) : null;
          })}
        </div>
      </SortableContext>
      {adding ? (
        <div className="space-y-2">
          <Textarea
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("board.card.titlePlaceholder")}
            className="min-h-[60px] text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                add();
              }
              if (e.key === "Escape") setAdding(false);
            }}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={add} loading={create.isPending}>
              {t("board.card.add")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted"
        >
          <Plus className="h-4 w-4" />
          {t("board.card.add")}
        </button>
      )}
    </div>
  );
}
```

Create `src/components/board/BoardColumns.tsx`:

```tsx
import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useMoveTask } from "@/hooks/useBoardTasks";
import { useAddColumn, useUpdateColumn } from "@/hooks/useBoardColumns";
import { groupRootsByColumn } from "@/lib/taskTree";
import { neighbourIds, positionBetween } from "@/lib/position";
import { useBoardCtx } from "./BoardContext";
import { BoardColumn } from "./BoardColumn";
import { colKey, parseKey } from "./dndKeys";
import { TaskCardBody } from "./TaskCard";

export function BoardColumns({
  visible,
  onOpen,
}: {
  /** Root ids that pass the current filter. */
  visible: Set<number>;
  onOpen: (taskNo: number) => void;
}) {
  const { t } = useTranslation();
  const { boardId, data, roots, byId, access } = useBoardCtx();
  const moveTask = useMoveTask(boardId);
  const updateColumn = useUpdateColumn(boardId);
  const addColumn = useAddColumn(boardId);
  const canManage = access.isAdmin || access.memberRole === "pic";

  const serverCards = useMemo(() => groupRootsByColumn(roots, data.columns), [roots, data.columns]);
  const serverCols = useMemo(() => data.columns.map((c) => c.id), [data.columns]);
  const [cards, setCards] = useState(serverCards);
  const [cols, setCols] = useState(serverCols);
  const [active, setActive] = useState<UniqueIdentifier | null>(null);

  // Server state wins whenever nothing is mid-drag.
  useEffect(() => {
    if (active == null) {
      setCards(serverCards);
      setCols(serverCols);
    }
  }, [serverCards, serverCols, active]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] },
    }),
  );

  const columnOf = (key: UniqueIdentifier): number | null => {
    const { kind, id } = parseKey(key);
    if (kind === "col") return id;
    const found = Object.entries(cards).find(([, ids]) => ids.includes(id));
    return found ? Number(found[0]) : null;
  };

  function onDragOver({ active: a, over }: DragOverEvent) {
    if (!over || parseKey(a.id).kind !== "task") return;
    const id = parseKey(a.id).id;
    const from = columnOf(a.id);
    const to = columnOf(over.id);
    if (from == null || to == null || from === to) return;
    setCards((prev) => {
      const target = [...prev[to]];
      const overIdx = parseKey(over.id).kind === "task" ? target.indexOf(parseKey(over.id).id) : -1;
      target.splice(overIdx < 0 ? target.length : overIdx, 0, id);
      return { ...prev, [from]: prev[from].filter((x) => x !== id), [to]: target };
    });
  }

  function onDragEnd({ active: a, over }: DragEndEvent) {
    setActive(null);
    if (!over) return;
    const { kind, id } = parseKey(a.id);

    if (kind === "col") {
      const to = columnOf(over.id);
      if (to == null || to === id) return;
      const next = arrayMove(cols, cols.indexOf(id), cols.indexOf(to));
      setCols(next);
      const { beforeId, afterId } = neighbourIds(next, next.indexOf(id));
      const pos = (cid: number | null) => data.columns.find((c) => c.id === cid)?.position ?? null;
      updateColumn.mutate({ id, position: positionBetween(pos(beforeId), pos(afterId)) });
      return;
    }

    const col = columnOf(a.id);
    if (col == null) return;
    let list = cards[col];
    const overId = parseKey(over.id);
    if (overId.kind === "task" && overId.id !== id && list.includes(overId.id)) {
      list = arrayMove(list, list.indexOf(id), list.indexOf(overId.id));
      setCards({ ...cards, [col]: list });
    }
    const index = list.indexOf(id);
    if (serverCards[col]?.indexOf(id) === index) return;

    const column = data.columns.find((c) => c.id === col);
    if (column?.is_done_column && byId.get(id)?.task.status !== "done") {
      setCards(serverCards);
      toast.error(t("board.errors.doneNeedsApproval"));
      return;
    }
    moveTask.mutate({ taskId: id, columnId: col, ...neighbourIds(list, index) });
  }

  const activeNode = active != null && parseKey(active).kind === "task" ? byId.get(parseKey(active).id) : undefined;

  function newColumn() {
    const name = window.prompt(t("board.column.namePrompt"))?.trim();
    if (!name) return;
    const last = data.columns.reduce((m, c) => Math.max(m, c.position), 0);
    addColumn.mutate({ name, position: last + 1024 });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={({ active: a }) => setActive(a.id)}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActive(null)}
    >
      <div className="flex h-full items-start gap-3 overflow-x-auto pb-3 scrollbar-thin">
        <SortableContext items={cols.map(colKey)} strategy={horizontalListSortingStrategy}>
          {cols.map((cid) => {
            const column = data.columns.find((c) => c.id === cid);
            return column ? (
              <BoardColumn
                key={cid}
                column={column}
                cardIds={(cards[cid] ?? []).filter((id) => visible.has(id))}
                onOpen={onOpen}
              />
            ) : null;
          })}
        </SortableContext>
        {canManage && (
          <button
            type="button"
            onClick={newColumn}
            className="flex w-72 shrink-0 items-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted/50"
          >
            <Plus className="h-4 w-4" />
            {t("board.column.add")}
          </button>
        )}
      </div>
      <DragOverlay>{activeNode ? <TaskCardBody node={activeNode} /> : null}</DragOverlay>
    </DndContext>
  );
}
```

- [ ] **Step 2: Header, members, list, workload**

Create `src/components/board/MembersPopover.tsx`:

```tsx
import { Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/UserAvatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/context/auth";
import { useSetMemberRole } from "@/hooks/useBoard";
import { isBoardPic } from "@/lib/taskPermissions";
import type { MemberRole } from "@/lib/types";
import { useBoardCtx } from "./BoardContext";
import { AvatarStack } from "./AvatarStack";

const ROLES: MemberRole[] = ["pic", "reviewer", "member"];

/** Who is on the project and in which role. Membership itself lives in Master Hub. */
export function MembersPopover() {
  const { t } = useTranslation();
  const { canUpdate } = useAuth();
  const { boardId, data, access } = useBoardCtx();
  const setRole = useSetMemberRole(boardId, data.board.project_id);
  const canEdit = isBoardPic(access) || canUpdate("master");

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" className="gap-2">
          <AvatarStack userIds={data.members.map((m) => m.user_id)} max={5} />
          <Users className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-1 p-2">
        <p className="px-1 pb-1 text-xs text-muted-foreground">{t("board.members.hint")}</p>
        {data.members.map((m) => (
          <div key={m.user_id} className="flex items-center gap-2 rounded px-1 py-1">
            <UserAvatar name={m.profile?.full_name ?? "?"} avatarUrl={m.profile?.avatar_url} size="sm" />
            <span className="flex-1 truncate text-sm">{m.profile?.full_name}</span>
            <Select
              disabled={!canEdit}
              value={m.member_role}
              onValueChange={(role) => setRole.mutate({ userId: m.user_id, role: role as MemberRole })}
            >
              <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r} className="text-xs">{t(`board.roles.${r}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}
```

Create `src/components/board/BoardHeader.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import { FilterSelect } from "@/components/master-hub/FilterSelect";
import { SearchInput } from "@/components/master-hub/MasterSection";
import { cn } from "@/lib/utils";
import type { BoardFilter } from "@/lib/boardFilter";
import { useBoardCtx } from "./BoardContext";
import { MembersPopover } from "./MembersPopover";

export type BoardView = "board" | "list" | "workload";
const VIEWS: BoardView[] = ["board", "list", "workload"];

export function BoardHeader({
  filter,
  onFilter,
  view,
  onView,
}: {
  filter: BoardFilter;
  onFilter: (f: BoardFilter) => void;
  view: BoardView;
  onView: (v: BoardView) => void;
}) {
  const { t } = useTranslation();
  const { data, divisions, access } = useBoardCtx();
  const set = (patch: Partial<BoardFilter>) => onFilter({ ...filter, ...patch });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-mono text-xs text-muted-foreground">{data.board.project.project_code}</p>
          <h1 className="text-lg font-semibold text-foreground">{data.board.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          <MembersPopover />
          <div className="flex items-center gap-0.5 rounded-lg border border-border bg-segment p-0.5">
            {VIEWS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => onView(v)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium",
                  view === v ? "border border-border bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(`board.views.${v}`)}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={filter.q} onChange={(q) => set({ q })} placeholder={t("board.filter.search")} />
        <button
          type="button"
          onClick={() => set({ assignee: filter.assignee ? undefined : access.userId })}
          className={cn(
            "h-8 rounded-md border px-3 text-xs",
            filter.assignee === access.userId ? "border-primary/50 text-primary" : "border-border bg-secondary text-muted-foreground",
          )}
        >
          {t("board.filter.mine")}
        </button>
        <FilterSelect
          value={filter.assignee}
          onChange={(assignee) => set({ assignee })}
          allLabel={t("board.filter.allPeople")}
          options={data.members.map((m) => ({ value: m.user_id, label: m.profile?.full_name ?? "?" }))}
        />
        <FilterSelect
          value={filter.division?.toString()}
          onChange={(v) => set({ division: v ? Number(v) : undefined })}
          allLabel={t("board.filter.allDivisions")}
          options={divisions.map((d) => ({ value: String(d.id), label: d.name }))}
        />
        {data.labels.length > 0 && (
          <FilterSelect
            value={filter.label?.toString()}
            onChange={(v) => set({ label: v ? Number(v) : undefined })}
            allLabel={t("board.filter.allLabels")}
            options={data.labels.map((l) => ({ value: String(l.id), label: l.name }))}
          />
        )}
        <FilterSelect
          value={filter.due}
          onChange={(due) => set({ due })}
          allLabel={t("board.filter.anyDue")}
          options={[
            { value: "overdue" as const, label: t("board.filter.overdue") },
            { value: "week" as const, label: t("board.filter.week") },
          ]}
        />
      </div>
    </div>
  );
}
```

Create `src/components/board/BoardListView.tsx`:

```tsx
import { Fragment } from "react";
import { format, parseISO } from "date-fns";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { computeProgress, type TaskNode } from "@/lib/taskTree";
import { useBoardCtx } from "./BoardContext";
import { AvatarStack } from "./AvatarStack";
import { STATUS_STYLE } from "./taskStyles";

function Rows({ node, depth, onOpen }: { node: TaskNode; depth: number; onOpen: (taskNo: number) => void }) {
  const { t } = useTranslation();
  const { divisions, data } = useBoardCtx();
  const task = node.task;
  const progress = computeProgress(node);
  return (
    <Fragment>
      <tr className="border-b border-border hover:bg-muted/40 cursor-pointer" onClick={() => onOpen(task.task_no)}>
        <td className="px-3 py-2 text-sm" style={{ paddingLeft: 12 + depth * 18 }}>
          <span className="mr-1.5 font-mono text-[11px] text-muted-foreground">#{task.task_no}</span>
          {task.title}
        </td>
        <td className="px-3 py-2 text-xs text-muted-foreground">
          {depth === 0 ? data.columns.find((c) => c.id === task.column_id)?.name : ""}
        </td>
        <td className="px-3 py-2 text-xs">{divisions.find((d) => d.id === task.division_id)?.name}</td>
        <td className="px-3 py-2"><AvatarStack userIds={task.assignees.map((a) => a.user_id)} /></td>
        <td className="px-3 py-2">
          <span className={cn("rounded px-1.5 py-0.5 text-[11px]", STATUS_STYLE[task.status])}>{t(`board.status.${task.status}`)}</span>
        </td>
        <td className="px-3 py-2 text-xs tabular-nums">{progress.total ? `${progress.pct}%` : ""}</td>
        <td className="px-3 py-2 text-xs">{task.due_date ? format(parseISO(task.due_date), "d MMM yyyy") : ""}</td>
      </tr>
      {node.children.map((c) => <Rows key={c.task.id} node={c} depth={depth + 1} onOpen={onOpen} />)}
    </Fragment>
  );
}

/** The whole tree as one indented table: every goal with all its parts. */
export function BoardListView({ visible, onOpen }: { visible: Set<number>; onOpen: (taskNo: number) => void }) {
  const { t } = useTranslation();
  const { roots, data } = useBoardCtx();
  const colOrder = new Map(data.columns.map((c, i) => [c.id, i]));
  const shown = roots
    .filter((r) => visible.has(r.task.id))
    .sort((a, b) => (colOrder.get(a.task.column_id!) ?? 0) - (colOrder.get(b.task.column_id!) ?? 0) || a.task.position - b.task.position);
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[760px]">
        <thead>
          <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            {["task", "column", "division", "assignees", "status", "progress", "due"].map((h) => (
              <th key={h} className="px-3 py-2 font-medium">{t(`board.list.${h}`)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => <Rows key={r.task.id} node={r} depth={0} onOpen={onOpen} />)}
        </tbody>
      </table>
    </div>
  );
}
```

Create `src/components/board/WorkloadTable.tsx`:

```tsx
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { cn } from "@/lib/utils";
import { emptyCounts, openCount, type WorkloadCounts } from "@/lib/workload";
import type { BoardMember } from "@/lib/types";

const COLS: (keyof WorkloadCounts)[] = ["todo", "in_progress", "in_review", "overdue", "done_7d"];

/** Assignee x status counts; the heaviest open load reads darkest. */
export function WorkloadTable({
  counts,
  members,
  onPick,
}: {
  counts: Map<string, WorkloadCounts>;
  members: BoardMember[];
  onPick?: (userId: string) => void;
}) {
  const { t } = useTranslation();
  const rows = useMemo(
    () =>
      members
        .map((m) => ({ m, c: counts.get(m.user_id) ?? emptyCounts() }))
        .sort((a, b) => openCount(b.c) - openCount(a.c)),
    [counts, members],
  );
  const max = Math.max(1, ...rows.map((r) => openCount(r.c)));

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2 font-medium">{t("board.workload.person")}</th>
            <th className="px-3 py-2 font-medium">{t("board.workload.open")}</th>
            {COLS.map((c) => <th key={c} className="px-3 py-2 font-medium">{t(`board.workload.${c}`)}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ m, c }) => (
            <tr key={m.user_id} className={cn("border-b border-border", onPick && "cursor-pointer hover:bg-muted/40")} onClick={() => onPick?.(m.user_id)}>
              <td className="flex items-center gap-2 px-3 py-2">
                <UserAvatar name={m.profile?.full_name ?? "?"} avatarUrl={m.profile?.avatar_url} size="sm" />
                {m.profile?.full_name}
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-24 rounded-full bg-muted">
                    <div className="h-2 rounded-full bg-primary" style={{ width: `${(openCount(c) / max) * 100}%` }} />
                  </div>
                  <span className="tabular-nums">{openCount(c)}</span>
                </div>
              </td>
              {COLS.map((k) => (
                <td key={k} className={cn("px-3 py-2 tabular-nums", k === "overdue" && c.overdue > 0 && "font-semibold text-red-500")}>{c[k]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Pages**

Create `src/pages/BoardsPage.tsx`:

```tsx
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CheckCircle2, CircleDot, SquareKanban } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SearchInput } from "@/components/master-hub/MasterSection";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAuth } from "@/context/auth";
import { useBoardStats, useEnsureBoard } from "@/hooks/useBoards";
import { useProjects } from "@/hooks/useProjects";
import { CLOSED_PROJECT_STATUSES } from "@/lib/types";

export default function BoardsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const { data: projects = [], isLoading } = useProjects();
  const { data: stats = {} } = useBoardStats();
  const ensure = useEnsureBoard();
  const [q, setQ] = useState("");

  const mine = useMemo(
    () =>
      projects
        .filter((p) => isAdmin() || p.member_user_ids?.includes(user?.id ?? ""))
        .filter((p) => !CLOSED_PROJECT_STATUSES.includes(p.work_status?.status_name ?? ""))
        .filter((p) => `${p.project_code} ${p.project_name} ${p.client}`.toLowerCase().includes(q.toLowerCase())),
    [projects, isAdmin, user?.id, q],
  );

  function open(projectId: number) {
    const known = stats[projectId]?.board_id;
    if (known) return navigate(`/boards/${known}`);
    ensure.mutate(projectId, { onSuccess: (b) => navigate(`/boards/${b.id}`) });
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">{t("board.boards.title")}</h1>
          <p className="text-xs text-muted-foreground">{t("board.boards.subtitle")}</p>
        </div>
        <SearchInput value={q} onChange={setQ} placeholder={t("board.boards.search")} />
      </div>
      {!isLoading && mine.length === 0 ? (
        <EmptyState icon={SquareKanban} title={t("board.boards.empty")} description={t("board.boards.emptyHint")} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {mine.map((p) => {
            const s = stats[p.id];
            return (
              <button
                key={p.id}
                type="button"
                disabled={ensure.isPending}
                onClick={() => open(p.id)}
                className="space-y-3 rounded-xl border border-border bg-card p-4 text-left hover:border-primary/40"
              >
                <div>
                  <p className="font-mono text-xs text-muted-foreground">{p.project_code}</p>
                  <p className="font-semibold text-foreground">{p.project_name}</p>
                  <p className="text-xs text-muted-foreground">{p.client}</p>
                </div>
                <div className="flex gap-3 text-xs">
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <CircleDot className="h-3.5 w-3.5" />{t("board.boards.open", { count: s?.open ?? 0 })}
                  </span>
                  <span className="inline-flex items-center gap-1 text-red-500">
                    <AlertTriangle className="h-3.5 w-3.5" />{t("board.boards.overdue", { count: s?.overdue ?? 0 })}
                  </span>
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />{t("board.boards.done", { count: s?.done ?? 0 })}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

Create `src/pages/BoardPage.tsx`:

```tsx
import { useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { PageFallback } from "@/components/layout/PageFallback";
import { BoardProvider, useBoardCtx } from "@/components/board/BoardContext";
import { BoardHeader, type BoardView } from "@/components/board/BoardHeader";
import { BoardColumns } from "@/components/board/BoardColumns";
import { BoardListView } from "@/components/board/BoardListView";
import { TaskDetailDialog } from "@/components/board/TaskDetailDialog";
import { WorkloadTable } from "@/components/board/WorkloadTable";
import { useBoard } from "@/hooks/useBoard";
import { EMPTY_FILTER, matchesFilter, type BoardFilter } from "@/lib/boardFilter";
import { summarizeWorkload } from "@/lib/workload";

function BoardScreen() {
  const { data, roots } = useBoardCtx();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<BoardFilter>(EMPTY_FILTER);
  const [view, setView] = useState<BoardView>("board");

  const visible = useMemo(() => {
    const today = new Date();
    return new Set(roots.filter((r) => matchesFilter(r, filter, today)).map((r) => r.task.id));
  }, [roots, filter]);

  const workload = useMemo(
    () =>
      summarizeWorkload(
        data.tasks.flatMap((x) => x.assignees.map((a) => ({ user_id: a.user_id, status: x.status, due_date: x.due_date, completed_at: x.completed_at }))),
        new Date(),
      ),
    [data.tasks],
  );

  const taskNo = params.get("task");
  const openTask = (no: number) => setParams((p) => { p.set("task", String(no)); return p; });
  const closeTask = () => setParams((p) => { p.delete("task"); return p; });

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <BoardHeader filter={filter} onFilter={setFilter} view={view} onView={setView} />
      <div className="min-h-0 flex-1">
        {view === "board" && <BoardColumns visible={visible} onOpen={openTask} />}
        {view === "list" && <BoardListView visible={visible} onOpen={openTask} />}
        {view === "workload" && (
          <WorkloadTable
            counts={workload}
            members={data.members}
            onPick={(userId) => {
              setFilter({ ...EMPTY_FILTER, assignee: userId });
              setView("board");
            }}
          />
        )}
      </div>
      <TaskDetailDialog taskNo={taskNo ? Number(taskNo) : null} onOpen={openTask} onClose={closeTask} />
    </div>
  );
}

export default function BoardPage() {
  const boardId = Number(useParams().boardId);
  const { data, isLoading, error } = useBoard(boardId);
  if (isLoading) return <PageFallback />;
  if (error || !data) return <p className="text-sm text-destructive">{(error as Error | null)?.message ?? "Board not found"}</p>;
  return (
    <BoardProvider data={data}>
      <BoardScreen />
    </BoardProvider>
  );
}
```

- [ ] **Step 4: Routes and sidebar**

`MyTasksPage` is created in Task 8. Until then, keep its `lazy` import and route commented out, or do Task 8 before type-checking.

Modify `src/router.tsx` (apply this diff; context lines show where):

```diff
--- a/src/router.tsx
+++ b/src/router.tsx
@@ -7,6 +7,9 @@ import { PageFallback } from "./components/layout/PageFallback";
 // the Excel writer and the PDF writer along with it.
 const DashboardPage = lazy(() => import("./pages/DashboardPage"));
 const DailyReportPage = lazy(() => import("./pages/DailyReportPage"));
+const BoardsPage = lazy(() => import("./pages/BoardsPage"));
+const BoardPage = lazy(() => import("./pages/BoardPage"));
+const MyTasksPage = lazy(() => import("./pages/MyTasksPage"));
 const MasterHubPage = lazy(() => import("./pages/MasterHubPage"));
 const TimelinePage = lazy(() => import("./pages/TimelinePage"));
 const CalendarPage = lazy(() => import("./pages/CalendarPage"));
@@ -51,6 +54,9 @@ export const routers = [
             path: "daily-report",
             element: guarded("daily-report", <DailyReportPage />),
           },
+          { path: "boards", element: guarded("board", <BoardsPage />) },
+          { path: "boards/:boardId", element: guarded("board", <BoardPage />) },
+          { path: "my-tasks", element: guarded("board", <MyTasksPage />) },
           { path: "timeline", element: guarded("timeline", <TimelinePage />) },
           { path: "calendar", element: guarded("holidays", <CalendarPage />) },
           {
```

Modify `src/lib/navigation.ts` (apply this diff; context lines show where):

```diff
--- a/src/lib/navigation.ts
+++ b/src/lib/navigation.ts
@@ -13,6 +13,8 @@ import {
   MessageCircle,
   Wallet,
   ShieldCheck,
+  SquareKanban,
+  ListTodo,
   type LucideIcon,
 } from "lucide-react";
 import { useTranslation } from "react-i18next";
@@ -55,6 +57,20 @@ export function useNavGroups(): NavGroup[] {
           featureKey: "daily-report",
           description: t("nav.descriptions.dailyReport"),
         },
+        {
+          href: "/boards",
+          label: t("nav.items.boards"),
+          icon: SquareKanban,
+          featureKey: "board",
+          description: t("nav.descriptions.boards"),
+        },
+        {
+          href: "/my-tasks",
+          label: t("nav.items.myTasks"),
+          icon: ListTodo,
+          featureKey: "board",
+          description: t("nav.descriptions.myTasks"),
+        },
         {
           href: "/timeline",
           label: t("nav.items.timeline"),
```

- [ ] **Step 5: Build and lint**

```bash
pnpm build && pnpm lint
```
Expected: `built in`, and lint reports 0 errors. The only new warning is `react-refresh/only-export-components` in `BoardContext.tsx`, the same pattern as `context/auth.tsx`.

- [ ] **Step 6: Print the suggested commit message (do not commit)**

```
feat: task board page with drag and drop, list and workload views
```


### Task 8: My Tasks, daily log link, overdue reminders, divisions master, dashboard

**Files:**
- Create: `src/pages/MyTasksPage.tsx`, `src/components/board/BoardTaskChip.tsx`, `src/components/daily-report/BoardTaskSelect.tsx`, `src/components/master-hub/DivisionsSection.tsx`, `src/components/dashboard/TaskWorkloadCard.tsx`
- Modify: `src/lib/types.ts` (daily-log lines), `src/hooks/useDailyTasks.ts` (embed), `src/components/daily-report/TaskFormDialog.tsx`, `src/components/daily-report/DailyReportTable.tsx`, `src/pages/DailyReportPage.tsx`, `src/hooks/useNotifications.ts`, `src/pages/MasterHubPage.tsx`, `src/pages/DashboardPage.tsx`

**Interfaces:**
- Consumes: `useMyTasks`, `useTaskWorkload`, `useDivisions*`, `WorkloadTable`, `canReviewTask`, RPC `notify_my_overdue`.
- Produces: `DailyTask.board_task_id: number | null`, `DailyTaskWithRelations.board_task?`, `TaskFormValues.board_task_id?`.

- [ ] **Step 1: My Tasks page**

Create `src/pages/MyTasksPage.tsx`:

```tsx
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { addDays, format, parseISO } from "date-fns";
import { ListTodo } from "lucide-react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/ui/EmptyState";
import { STATUS_STYLE } from "@/components/board/taskStyles";
import { useAuth } from "@/context/auth";
import { useMyTasks, type MyTask } from "@/hooks/useMyTasks";
import { canReviewTask } from "@/lib/taskPermissions";
import { cn } from "@/lib/utils";

type Group = "overdue" | "today" | "week" | "later" | "noDue";

function groupOf(task: MyTask, today: string, week: string): Group {
  if (!task.due_date) return "noDue";
  if (task.due_date < today) return "overdue";
  if (task.due_date === today) return "today";
  if (task.due_date <= week) return "week";
  return "later";
}

function TaskLine({ task }: { task: MyTask }) {
  const { t } = useTranslation();
  return (
    <Link
      to={`/boards/${task.board.id}?task=${task.task_no}`}
      className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:border-primary/40"
    >
      <span className="font-mono text-xs text-muted-foreground">#{task.task_no}</span>
      <span className="min-w-0 flex-1 truncate">{task.title}</span>
      <span className="hidden text-xs text-muted-foreground sm:inline">{task.board.name}</span>
      <span className={cn("rounded px-1.5 py-0.5 text-[11px]", STATUS_STYLE[task.status])}>{t(`board.status.${task.status}`)}</span>
      {task.due_date && <span className="text-xs tabular-nums text-muted-foreground">{format(parseISO(task.due_date), "d MMM")}</span>}
    </Link>
  );
}

export default function MyTasksPage() {
  const { t } = useTranslation();
  const { user, isAdmin } = useAuth();
  const { data, isLoading } = useMyTasks();
  const [tab, setTab] = useState<"mine" | "review">("mine");

  const groups = useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    const week = format(addDays(new Date(), 7), "yyyy-MM-dd");
    const out: Record<Group, MyTask[]> = { overdue: [], today: [], week: [], later: [], noDue: [] };
    for (const task of data?.assigned ?? []) if (task.status !== "done") out[groupOf(task, today, week)].push(task);
    for (const list of Object.values(out)) list.sort((a, b) => (a.due_date ?? "9").localeCompare(b.due_date ?? "9"));
    return out;
  }, [data]);

  const toReview = useMemo(
    () =>
      (data?.toReview ?? []).filter((task) =>
        canReviewTask({ userId: user?.id ?? "", isAdmin: isAdmin(), memberRole: data?.roles[task.board.project_id] ?? null }, task),
      ),
    [data, user?.id, isAdmin],
  );

  const tabs = [
    { id: "mine" as const, label: t("board.myTasks.mine") },
    { id: "review" as const, label: t("board.myTasks.review", { count: toReview.length }) },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">{t("board.myTasks.title")}</h1>
        <div className="flex gap-0.5 rounded-lg border border-border bg-segment p-0.5">
          {tabs.map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => setTab(x.id)}
              className={cn("rounded-md px-3 py-1.5 text-xs font-medium", tab === x.id ? "border border-border bg-card shadow-sm" : "text-muted-foreground")}
            >
              {x.label}
            </button>
          ))}
        </div>
      </div>
      {isLoading ? null : tab === "review" ? (
        toReview.length ? (
          <div className="space-y-2">{toReview.map((task) => <TaskLine key={task.id} task={task} />)}</div>
        ) : (
          <EmptyState icon={ListTodo} title={t("board.myTasks.noReview")} />
        )
      ) : Object.values(groups).every((g) => g.length === 0) ? (
        <EmptyState icon={ListTodo} title={t("board.myTasks.empty")} />
      ) : (
        (Object.keys(groups) as Group[]).filter((g) => groups[g].length).map((g) => (
          <section key={g} className="space-y-2">
            <h2 className={cn("text-sm font-semibold", g === "overdue" && "text-red-500")}>
              {t(`board.myTasks.groups.${g}`)} <span className="font-normal text-muted-foreground">{groups[g].length}</span>
            </h2>
            {groups[g].map((task) => <TaskLine key={task.id} task={task} />)}
          </section>
        ))
      )}
    </div>
  );
}
```

If you commented out the `/my-tasks` route in Task 7, restore it now.

- [ ] **Step 2: Daily log link**

Create `src/components/board/BoardTaskChip.tsx`:

```tsx
import { Link } from "react-router-dom";
import { SquareKanban } from "lucide-react";

export interface LinkedBoardTask {
  id: number;
  task_no: number;
  board_id: number;
  title: string;
}

/** "#118" link from a daily log entry to the board task it worked on. */
export function BoardTaskChip({ task }: { task: LinkedBoardTask }) {
  return (
    <Link
      to={`/boards/${task.board_id}?task=${task.task_no}`}
      onClick={(e) => e.stopPropagation()}
      title={task.title}
      className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/20"
    >
      <SquareKanban className="h-3 w-3" />#{task.task_no}
    </Link>
  );
}
```

Create `src/components/daily-report/BoardTaskSelect.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMyTasks } from "@/hooks/useMyTasks";

const NONE = "none";

/** Optional link from a daily entry to one of the caller's open board tasks. */
export function BoardTaskSelect({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const { t } = useTranslation();
  const { data } = useMyTasks();
  const open = (data?.assigned ?? []).filter(
    (task) => task.status !== "done" || task.id === value,
  );
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground font-medium">
        {t("taskForm.fields.boardTask")}{" "}
        <span className="text-muted-foreground/50">
          {t("taskForm.fields.problemOptional")}
        </span>
      </Label>
      <Select
        value={value ? String(value) : NONE}
        onValueChange={(v) => onChange(v === NONE ? null : Number(v))}
      >
        <SelectTrigger className="bg-secondary border-border text-foreground text-sm h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="bg-card border-border">
          <SelectItem value={NONE} className="text-sm">
            {t("taskForm.placeholders.boardTask")}
          </SelectItem>
          {open.map((task) => (
            <SelectItem key={task.id} value={String(task.id)} className="text-sm">
              <span className="font-mono text-xs text-primary">#{task.task_no}</span>
              <span className="ml-2">{task.title}</span>
              <span className="ml-2 text-muted-foreground text-xs">{task.board.name}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
```

Apply the two daily-log lines from the `src/lib/types.ts` diff in Task 3 (`board_task_id` on `DailyTask`, `board_task?` on `DailyTaskWithRelations`), then:

Modify `src/hooks/useDailyTasks.ts` (apply this diff; context lines show where):

```diff
--- a/src/hooks/useDailyTasks.ts
+++ b/src/hooks/useDailyTasks.ts
@@ -37,7 +37,8 @@ export function useDailyTasks(filters: DailyTaskFilters = {}) {
             *,
             project_type_assignment(type:m_project_types(id, type_name)),
             status:m_work_status(id, status_name)
-          )
+          ),
+          board_task:t_tasks(id, task_no, board_id, title)
         `,
         );
       if (filters.employeeId)
@@ -321,3 +322,20 @@ export function useWeeklyWorkload() {
     refetchInterval: 60_000,
   });
 }
+
+/** Daily entries that point at one board task, newest first. */
+export function useDailyTasksForBoardTask(boardTaskId: number | null) {
+  return useQuery<DailyTaskWithRelations[]>({
+    queryKey: ["daily-tasks", "board-task", boardTaskId],
+    enabled: boardTaskId != null,
+    queryFn: async () => {
+      const { data, error } = await supabase
+        .from("t_daily_tasks")
+        .select("*, employee:m_employees(*), project:m_projects(*)")
+        .eq("board_task_id", boardTaskId!)
+        .order("date", { ascending: false });
+      if (error) throw error;
+      return data as unknown as DailyTaskWithRelations[];
+    },
+  });
+}
```

(Skip the `useDailyTasksForBoardTask` hunk if Task 5 already added it.)

Modify `src/components/daily-report/TaskFormDialog.tsx` (apply this diff; context lines show where):

```diff
--- a/src/components/daily-report/TaskFormDialog.tsx
+++ b/src/components/daily-report/TaskFormDialog.tsx
@@ -21,6 +21,7 @@ import {
   SelectValue,
 } from "@/components/ui/select";
 import { TaskAttachments } from "./TaskAttachments";
+import { BoardTaskSelect } from "./BoardTaskSelect";
 import type { DailyTaskWithRelations, Employee, Project } from "@/lib/types";
 
 interface TaskFormDialogProps {
@@ -40,6 +41,7 @@ export interface TaskFormValues {
   task_desc: string;
   progress_pct: number;
   problem_desc?: string;
+  board_task_id?: number | null;
 }
 
 export function TaskFormDialog({
@@ -76,6 +78,7 @@ export function TaskFormDialog({
         task_desc: task.task_desc,
         progress_pct: task.progress_pct,
         problem_desc: task.problem_desc || "",
+        board_task_id: task.board_task_id,
       });
     } else {
       reset({
@@ -83,6 +86,7 @@ export function TaskFormDialog({
         progress_pct: 0,
         task_desc: "",
         problem_desc: "",
+        board_task_id: null,
       });
     }
   }, [task, reset, open]);
@@ -201,6 +205,11 @@ export function TaskFormDialog({
             </Select>
           </div>
 
+          <BoardTaskSelect
+            value={watch("board_task_id") ?? null}
+            onChange={(v) => setValue("board_task_id", v)}
+          />
+
           <div className="space-y-1.5">
             <Label className="text-xs text-muted-foreground font-medium">
               {t("taskForm.fields.taskDesc")}
```

Modify `src/components/daily-report/DailyReportTable.tsx` (apply this diff; context lines show where):

```diff
--- a/src/components/daily-report/DailyReportTable.tsx
+++ b/src/components/daily-report/DailyReportTable.tsx
@@ -18,6 +18,7 @@ import type { DailyTaskWithRelations, Project } from "@/lib/types";
 import { PROJECT_BADGE_COLORS as projectBadgeColors } from "@/lib/colorPalettes";
 import { Checkbox } from "@/components/ui/checkbox";
 import { cn } from "@/lib/utils";
+import { BoardTaskChip } from "@/components/board/BoardTaskChip";
 
 interface DailyReportTableProps {
   /** Already filtered by the parent's shared search/filter toolbar */
@@ -274,6 +275,11 @@ export function DailyReportTable({
 
                           <td className="px-4 py-3 max-w-[260px]">
                             <p className="text-xs text-foreground/90 line-clamp-2 leading-snug">
+                              {task.board_task && (
+                                <span className="mr-1.5">
+                                  <BoardTaskChip task={task.board_task} />
+                                </span>
+                              )}
                               {task.task_desc}
                             </p>
                           </td>
```

Modify `src/pages/DailyReportPage.tsx` (apply this diff; context lines show where):

```diff
--- a/src/pages/DailyReportPage.tsx
+++ b/src/pages/DailyReportPage.tsx
@@ -118,6 +118,7 @@ export default function DailyReportPage() {
       task_desc: data.task_desc,
       progress_pct: data.progress_pct,
       problem_desc: data.problem_desc || null,
+      board_task_id: data.board_task_id ?? null,
     };
     if (editingTask) {
       updateTask.mutate(
```

- [ ] **Step 3: Overdue reminders on load**

Modify `src/hooks/useNotifications.ts` (apply this diff; context lines show where):

```diff
--- a/src/hooks/useNotifications.ts
+++ b/src/hooks/useNotifications.ts
@@ -55,7 +55,7 @@ function playNotificationSound() {
 }
 
 export function useNotifications() {
-  const { user } = useAuth();
+  const { user, canRead } = useAuth();
   const qc = useQueryClient();
 
   const query = useQuery<Notification[]>({
@@ -72,6 +72,13 @@ export function useNotifications() {
     },
   });
 
+  // Overdue board tasks become notifications once per load; the RPC skips
+  // tasks already reminded today, so a remount does no harm.
+  const canBoard = canRead("board");
+  useEffect(() => {
+    if (user?.id && canBoard) void supabase.rpc("notify_my_overdue");
+  }, [user?.id, canBoard]);
+
   // Inserts reach this client only via Realtime (no client INSERT policy, 20260922 migration).
   // Keyed on user id, not `user` (new ref per auth event), to avoid recreating the channel and racing a duplicate subscription.
   const userId = user?.id;
```

- [ ] **Step 4: Divisions in Master Hub**

Create `src/components/master-hub/DivisionsSection.tsx`:

```tsx
import { useState } from "react";
import { Network } from "lucide-react";
import { useTranslation } from "react-i18next";
import { MasterListTable } from "./MasterListTable";
import { MasterListFormDialog } from "./MasterListFormDialog";
import { DeleteConfirmationModal } from "@/components/ui/DeleteConfirmationModal";
import { useDeleteDivision, useDivisions, useSaveDivision } from "@/hooks/useDivisions";

/** Master list of divisions that board tasks are split by. */
export function DivisionsSection() {
  const { t } = useTranslation();
  const { data: divisions = [], isLoading } = useDivisions();
  const save = useSaveDivision();
  const remove = useDeleteDivision();
  const [editing, setEditing] = useState<{ id: number; label: string } | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState<{ id: number; label: string } | null>(null);

  return (
    <>
      <MasterListTable
        tourId="divisions"
        title={t("master.masterList.divisions.title")}
        subtitle={t("master.masterList.divisions.subtitle")}
        itemLabel={t("master.masterList.divisions.itemLabel")}
        icon={Network}
        items={divisions.map((d) => ({ id: d.id, label: d.name }))}
        onAdd={() => {
          setEditing(null);
          setDialogOpen(true);
        }}
        onEdit={(item) => {
          setEditing(item);
          setDialogOpen(true);
        }}
        onDelete={(id) => setDeleting({ id, label: divisions.find((d) => d.id === id)?.name ?? String(id) })}
        isLoading={isLoading}
      />
      <MasterListFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={t("master.masterList.divisions.itemLabel")}
        initialValue={editing?.label ?? null}
        onSubmit={(name) => save.mutate({ id: editing?.id, name }, { onSuccess: () => setDialogOpen(false) })}
        loading={save.isPending}
      />
      <DeleteConfirmationModal
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title={t("master.masterList.divisions.deleteTitle")}
        description={t("master.masterList.divisions.deleteDesc", { name: deleting?.label })}
        isPending={remove.isPending}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id);
          setDeleting(null);
        }}
      />
    </>
  );
}
```

Modify `src/pages/MasterHubPage.tsx` (apply this diff; context lines show where):

```diff
--- a/src/pages/MasterHubPage.tsx
+++ b/src/pages/MasterHubPage.tsx
@@ -5,6 +5,7 @@ import {
   Users,
   Tag,
   ListChecks,
+  Network,
   UserCog,
   History,
   Download,
@@ -17,6 +18,7 @@ import { ProjectsKanban } from "@/components/master-hub/ProjectsKanban";
 import { EmployeesTable } from "@/components/master-hub/EmployeesTable";
 import { MasterListTable } from "@/components/master-hub/MasterListTable";
 import { MasterListFormDialog } from "@/components/master-hub/MasterListFormDialog";
+import { DivisionsSection } from "@/components/master-hub/DivisionsSection";
 import { UserManagement } from "@/components/master-hub/UserManagement";
 import { AuditLogTable } from "@/components/master-hub/AuditLogTable";
 import { FilterSelect } from "@/components/master-hub/FilterSelect";
@@ -88,6 +90,7 @@ type TabId =
   | "employees"
   | "proj-types"
   | "proj-status"
+  | "divisions"
   | "users"
   | "audit-log";
 
@@ -128,6 +131,12 @@ export default function MasterHubPage() {
       icon: ListChecks,
       adminOnly: false,
     },
+    {
+      id: "divisions" as TabId,
+      labelKey: "master.tabs.divisions",
+      icon: Network,
+      adminOnly: false,
+    },
     {
       id: "projects" as TabId,
       labelKey: "master.tabs.projects",
@@ -614,6 +623,8 @@ export default function MasterHubPage() {
             />
           )}
 
+          {activeTab === "divisions" && <DivisionsSection />}
+
           {activeTab === "proj-status" && (
             <MasterListTable
               tourId="proj-status"
```

- [ ] **Step 5: Dashboard workload card**

Create `src/components/dashboard/TaskWorkloadCard.tsx`:

```tsx
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FilterSelect } from "@/components/master-hub/FilterSelect";
import { WorkloadTable } from "@/components/board/WorkloadTable";
import { useDivisions } from "@/hooks/useDivisions";
import { useTaskWorkload } from "@/hooks/useTaskWorkload";
import { useUsers } from "@/hooks/useUsers";
import type { BoardMember } from "@/lib/types";

/** Board task load per person across every project the viewer can see. */
export function TaskWorkloadCard() {
  const { t } = useTranslation();
  const [division, setDivision] = useState<string>();
  const { data: divisions = [] } = useDivisions();
  const { data: counts } = useTaskWorkload(division ? Number(division) : undefined);
  const { data: users = [] } = useUsers();
  const people = useMemo<BoardMember[]>(
    () =>
      users
        .filter((u) => counts?.has(u.id))
        .map((u) => ({ user_id: u.id, member_role: "member", profile: { id: u.id, full_name: u.full_name, avatar_url: u.avatar_url } })),
    [users, counts],
  );
  if (!counts || people.length === 0) return null;
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{t("board.workload.dashboardTitle")}</h2>
        <FilterSelect
          value={division}
          onChange={setDivision}
          allLabel={t("board.filter.allDivisions")}
          options={divisions.map((d) => ({ value: String(d.id), label: d.name }))}
        />
      </div>
      <WorkloadTable counts={counts} members={people} />
    </section>
  );
}
```

Modify `src/pages/DashboardPage.tsx` (apply this diff; context lines show where):

```diff
--- a/src/pages/DashboardPage.tsx
+++ b/src/pages/DashboardPage.tsx
@@ -15,6 +15,8 @@ import { ProductivityGauge } from "@/components/dashboard/ProductivityGauge";
 import { TasksPerProjectChart } from "@/components/dashboard/TasksPerProjectChart";
 import { RecentProblemsCard } from "@/components/dashboard/RecentProblemsCard";
 import { WorkloadHeatmap } from "@/components/dashboard/WorkloadHeatmap";
+import { TaskWorkloadCard } from "@/components/dashboard/TaskWorkloadCard";
+import { AccessControl } from "@/components/auth/AccessControl";
 import { UpcomingCards } from "@/components/dashboard/UpcomingCards";
 import {
   useDashboardSummary,
@@ -160,6 +162,10 @@ export default function DashboardPage() {
       </div>
 
       <UpcomingCards />
+
+      <AccessControl feature="board" action="read">
+        <TaskWorkloadCard />
+      </AccessControl>
     </div>
   );
 }
```

- [ ] **Step 6: Build, lint, test**

```bash
pnpm build && pnpm lint && ./node_modules/.bin/vitest run 2>&1 | grep -E "Test Files|Tests"
```
Expected: build ok, 0 lint errors, `16 passed` / `69 passed`.

- [ ] **Step 7: Print the suggested commit message (do not commit)**

```
feat: my tasks, daily log links, overdue reminders, divisions
```


### Task 9: Docs and end-to-end check in the running app

**Files:**
- Modify: `GUIDELINE.md`

**Interfaces:**
- Consumes: everything above.
- Produces: an updated feature table and test notes.

- [ ] **Step 1: Update GUIDELINE.md**

Modify `GUIDELINE.md` (apply this diff; context lines show where):

```diff
--- a/GUIDELINE.md
+++ b/GUIDELINE.md
@@ -39,6 +39,8 @@ calculations live in `src/lib/`.
 | --- | --- | --- | --- |
 | Dashboard | `DashboardPage.tsx` | `useDailyTasks`, `useHrisSummary` | `components/dashboard/` |
 | Daily report | `DailyReportPage.tsx` | `useDailyTasks` | `components/daily-report/` |
+| Task board | `BoardsPage.tsx`, `BoardPage.tsx` | `useBoards`, `useBoard`, `useBoardTasks`, `useBoardColumns`, `useTaskSteps`, `useTaskActivity` | `components/board/` |
+| My tasks | `MyTasksPage.tsx` | `useMyTasks` | reuses `board/` |
 | Timeline | `TimelinePage.tsx` | `useDailyTasks`, `useTaskComments` | reuses `daily-report/` |
 | Issues | `IssuesPage.tsx` | `useDailyTasks`, `useEmployees` | reuses `daily-report/` |
 | Attendance | `AttendancePage.tsx` | `useAttendance`, `useWorkSchedule` | `components/attendance/` |
@@ -57,7 +59,9 @@ Shared helpers worth knowing before writing a new one: `lib/attendance.ts`
 (late, early leave, hours worked), `lib/workday.ts` (working days, period
 ranges), `lib/period.ts` (period filtering by date prefix),
 `lib/permissions.ts` (role and override merge), `lib/payroll.ts` (gross pay
-recap per employee).
+recap per employee), `lib/taskTree.ts` (board task tree and progress),
+`lib/taskPermissions.ts` (who may work on, submit or review a board task),
+`lib/position.ts` (fractional card order).
 
 ## Adding Code
 
@@ -80,8 +84,14 @@ Ownership, approval rules, the period lock, the clock stamps and the audit
 trail are enforced by RLS policies and triggers, not by the UI. The UI only
 hides actions the database would refuse. The rules live in
 `supabase/migrations/`, with runnable proof in `supabase/tests/security_smoke.sql`
-and, for payroll, `supabase/tests/payroll_smoke.sql`. When you add a rule that protects data,
-add it there and add a case to the matching test.
+and, for payroll, `supabase/tests/payroll_smoke.sql`, for the task board,
+`supabase/tests/board_smoke.sql`. When you add a rule that protects data,
+add it there and add a case to the matching test. Run one with
+`supabase/tests/scratch_db.sh supabase/tests/<name>.sql` (needs Docker).
+
+Task board in particular: a node is finished only through `submit_review()`
+and `review_task()`, nobody approves their own node, and only a node's
+assignees (or an ancestor's, or the project PIC) may tick its steps.
 
 Payroll in particular: a run's earnings come from `generate_payroll_run()`,
 never from an insert by the client, and finalizing a run freezes every
@@ -93,7 +103,9 @@ amount on it. Deductions are optional and capped at what was earned.
 covered is the pure logic where a silent mistake costs money or misstates
 attendance (`lib/attendance.ts`, `lib/workday.ts`, `lib/period.ts`,
 `lib/permissions.ts`, `lib/payroll.ts`, `calcDurationHours`,
-`countLeaveWorkingDays`). Add a case
+`countLeaveWorkingDays`) and the task board logic (`lib/taskTree.ts`,
+`lib/taskPermissions.ts`, `lib/position.ts`, `lib/boardFilter.ts`,
+`lib/workload.ts`). Add a case
 there when you touch one of those. Database rules are proved by the SQL smoke
 test above, not by these.
 
```

- [ ] **Step 2: Apply the migrations to the dev Supabase project**

Apply both migrations in the Supabase SQL editor of the project in `supabase/config.toml` (`qihokegrcowojjllvfdw`), in file order. This changes a shared database, so ask the user before doing it. Expected: no error. Then `select feature_key from m_features where feature_key = 'board';` returns one row.

- [ ] **Step 3: Walk the flow in two browsers**

Run `pnpm dev`, then sign in as two users who are both members of one project. Make one of them `pic` via the Members popover.
1. Open `/boards`, then the project. Six default columns appear.
2. User A adds a card, opens it, assigns self and user B, sets division, due date, expected output, adds 2 steps and 1 subtask. User B's notification bell rings.
3. User B ticks a step. The step shows "Done by B". The card badge reads `1/3`. User A's open board updates without a reload.
4. Drag the card across columns and reorder inside a column, then reload: the order holds. Drag it into "Done": it snaps back with the "approved" toast.
5. Submit is disabled with a reason until all steps and subtasks are done. Then the assignee submits, and the PIC sees Approve/Send back (the assignee does not). Send back without a note: the button stays disabled.
6. Approve the subtask, then the card. Move it to Done. Add a step: the card shows "In progress" again.
7. In `/daily-report`, log an entry linked to the card. The chip `#n` opens the card, and the card lists the entry.
8. `/my-tasks` shows the card under its due group. The PIC's "To review" tab lists submitted tasks.
9. Phone width (DevTools 390px): columns scroll sideways, a long-press drags, and "Move" works from the menu.

- [ ] **Step 4: Print the suggested commit message (do not commit)**

```
docs: task board in GUIDELINE
```

