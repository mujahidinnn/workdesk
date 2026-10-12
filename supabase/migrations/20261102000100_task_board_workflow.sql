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
  IF NOT FOUND OR NOT public.is_task_assignee(p_task_id)
     OR NOT public.is_board_member(v_task.board_id) THEN
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

  UPDATE t_tasks SET status = 'in_review', submitted_by = auth.uid() WHERE id = p_task_id;
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
  v_task     t_tasks%ROWTYPE;
  v_assignee uuid;
BEGIN
  SELECT * INTO v_task FROM t_tasks WHERE id = p_task_id;
  IF v_task.status IS DISTINCT FROM 'in_review' THEN
    RAISE EXCEPTION 'This task is not waiting for review';
  END IF;
  IF NOT public.can_review_task(p_task_id) OR v_task.submitted_by = auth.uid() THEN
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

ALTER TABLE public.t_task_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t_task_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t_board_task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t_board_task_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY task_reviews_select ON public.t_task_reviews FOR SELECT TO authenticated
  USING (public.is_board_member(public.task_board(task_id)));
CREATE POLICY task_activity_select ON public.t_task_activity FOR SELECT TO authenticated
  USING (public.is_board_member(public.task_board(task_id)));

CREATE POLICY board_task_comments_select ON public.t_board_task_comments FOR SELECT TO authenticated
  USING (public.is_board_member(public.task_board(task_id)));
CREATE POLICY board_task_comments_insert ON public.t_board_task_comments FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_board_member(public.task_board(task_id)));
CREATE POLICY board_task_comments_update ON public.t_board_task_comments FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.is_board_member(public.task_board(task_id)))
  WITH CHECK (user_id = auth.uid() AND public.is_board_member(public.task_board(task_id)));

CREATE FUNCTION public.board_task_comments_before_update() RETURNS trigger
  LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.task_id <> OLD.task_id OR NEW.user_id <> OLD.user_id THEN
    RAISE EXCEPTION 'A comment cannot move to another task';
  END IF;
  NEW.created_at := OLD.created_at;
  NEW.edited_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_board_task_comments_before_update BEFORE UPDATE ON public.t_board_task_comments
  FOR EACH ROW EXECUTE FUNCTION public.board_task_comments_before_update();
CREATE POLICY board_task_comments_delete ON public.t_board_task_comments FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_board_pic(public.task_board(task_id)));

CREATE POLICY board_task_attachments_select ON public.t_board_task_attachments FOR SELECT TO authenticated
  USING (public.is_board_member(public.task_board(task_id)));
CREATE POLICY board_task_attachments_insert ON public.t_board_task_attachments FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = auth.uid() AND public.is_board_member(public.task_board(task_id)));
CREATE POLICY board_task_attachments_delete ON public.t_board_task_attachments FOR DELETE TO authenticated
  USING (uploaded_by = auth.uid() OR public.is_board_pic(public.task_board(task_id)));

-- Board files live under board/<task_id>/ in the existing bucket. Storage
-- policies OR together, so the daily-report ones must stop covering board/.
DROP POLICY task_attachments_read ON storage.objects;
CREATE POLICY task_attachments_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'task-attachments' AND public.has_permission('daily-report', 'read')
         AND (storage.foldername(name))[1] IS DISTINCT FROM 'board');
DROP POLICY task_attachments_insert ON storage.objects;
CREATE POLICY task_attachments_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'task-attachments' AND public.has_permission('daily-report', 'create')
              AND (storage.foldername(name))[1] IS DISTINCT FROM 'board');

CREATE FUNCTION public.board_file_task(p_name text) RETURNS bigint
  LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN (storage.foldername(p_name))[2] ~ '^[0-9]{1,18}$'
              THEN ((storage.foldername(p_name))[2])::bigint END;
$$;

CREATE POLICY board_attachments_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'task-attachments' AND (storage.foldername(name))[1] = 'board'
         AND public.is_board_member(public.task_board(public.board_file_task(name))));
CREATE POLICY board_attachments_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'task-attachments' AND (storage.foldername(name))[1] = 'board'
              AND public.is_board_member(public.task_board(public.board_file_task(name))));

ALTER PUBLICATION supabase_realtime ADD TABLE public.t_task_activity, public.t_board_task_comments;

-- Helpers above serve triggers and RPCs, which run as the owner. Clients
-- (PostgREST exposes every public function) must not call them directly.
REVOKE EXECUTE ON FUNCTION public.reopen_lineage(bigint), public.notify_user(uuid, text, bigint),
  public.log_task_activity(bigint, text, jsonb), public.slot_task(bigint, int, bigint, bigint, bigint),
  public.task_label(bigint), public.task_link(bigint), public.actor_name()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_board(int), public.move_task(bigint, int, bigint, bigint),
  public.reparent_task(bigint, bigint, int, bigint, bigint), public.move_step(bigint, bigint, bigint),
  public.submit_review(bigint), public.review_task(bigint, text, text), public.notify_my_overdue()
  FROM PUBLIC, anon;
