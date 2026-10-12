CREATE OR REPLACE FUNCTION public.tasks_before_write() RETURNS trigger
  LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE
  v_parent t_tasks%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.board_id <> OLD.board_id THEN
    RAISE EXCEPTION 'A task cannot move to another board';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.parent_id IS NOT DISTINCT FROM OLD.parent_id THEN
    -- Not moving: tasks_after_reparent may be rewriting root/depth below a
    -- moved node, and rows are visited in no fixed order, so keep its values.
    IF current_user = 'authenticated' THEN
      NEW.root_id := OLD.root_id;
      NEW.depth := OLD.depth;
    END IF;
    IF NEW.parent_id IS NULL AND NEW.column_id IS DISTINCT FROM OLD.column_id
       AND NOT EXISTS (SELECT 1 FROM t_board_columns WHERE id = NEW.column_id AND board_id = NEW.board_id) THEN
      RAISE EXCEPTION 'That column belongs to another board';
    END IF;
  ELSIF NEW.parent_id IS NULL THEN
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
    NEW.status := 'todo';
    NEW.completed_at := NULL;
    NEW.completed_by := NULL;
    NEW.submitted_by := NULL;
  ELSE
    IF current_user = 'authenticated' AND (
         NEW.parent_id IS DISTINCT FROM OLD.parent_id
         OR NEW.column_id IS DISTINCT FROM OLD.column_id) THEN
      RAISE EXCEPTION 'Move tasks with move_task or reparent_task';
    END IF;
    IF current_user = 'authenticated' AND (
         NEW.status IS DISTINCT FROM OLD.status AND NOT (
           NEW.status IN ('todo', 'in_progress') AND OLD.status IN ('todo', 'in_progress'))
         OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
         OR NEW.completed_by IS DISTINCT FROM OLD.completed_by
         OR NEW.submitted_by IS DISTINCT FROM OLD.submitted_by
         OR NEW.task_no IS DISTINCT FROM OLD.task_no
         OR NEW.created_by IS DISTINCT FROM OLD.created_by) THEN
      RAISE EXCEPTION 'Review status and completion change only through submit and review';
    END IF;
    IF current_user = 'authenticated' AND OLD.status = 'in_review'
       AND (NEW.title, NEW.description, NEW.expected_output)
           IS DISTINCT FROM (OLD.title, OLD.description, OLD.expected_output) THEN
      RAISE EXCEPTION 'This task is in review; wait for the verdict before changing it';
    END IF;
    NEW.updated_at := now();
  END IF;

  IF NEW.parent_id IS NULL AND NEW.status <> 'done'
     AND (TG_OP = 'INSERT' OR NEW.column_id IS DISTINCT FROM OLD.column_id)
     AND EXISTS (SELECT 1 FROM t_board_columns WHERE id = NEW.column_id AND is_done_column) THEN
    RAISE EXCEPTION 'Only an approved task can go into a done column';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tasks_after_write() RETURNS trigger
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
  IF OLD.status = 'done' AND NEW.status = 'done'
     AND (NEW.title, NEW.description, NEW.expected_output)
         IS DISTINCT FROM (OLD.title, OLD.description, OLD.expected_output) THEN
    PERFORM public.reopen_lineage(NEW.id);
  END IF;
  IF OLD.status = 'done' AND NEW.status <> 'done' AND NEW.parent_id IS NOT NULL THEN
    PERFORM public.reopen_lineage(NEW.parent_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP POLICY tasks_update ON public.t_tasks;
CREATE POLICY tasks_update ON public.t_tasks FOR UPDATE TO authenticated
  USING (public.can_work_task(id)
         OR (created_by = auth.uid()
             AND NOT EXISTS (SELECT 1 FROM t_task_assignees a WHERE a.task_id = t_tasks.id)))
  WITH CHECK (public.is_board_member(board_id));

CREATE OR REPLACE FUNCTION public.task_steps_before_write() RETURNS trigger
  LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.assignee_id IS NOT NULL AND NEW.assignee_id IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.assignee_id END)
     AND NOT EXISTS (
       SELECT 1 FROM m_project_members
       WHERE project_id = public.board_project(public.task_board(NEW.task_id)) AND user_id = NEW.assignee_id) THEN
    RAISE EXCEPTION 'That user is not a member of this project';
  END IF;

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

  IF current_user = 'authenticated' THEN
    IF NOT public.can_work_task(NEW.task_id)
       AND (NEW.title, NEW.note, NEW.position, NEW.assignee_id)
           IS DISTINCT FROM (OLD.title, OLD.note, OLD.position, OLD.assignee_id) THEN
      RAISE EXCEPTION 'Only the task''s assignees can change this step';
    END IF;
    IF OLD.assignee_id IS NOT NULL AND NOT public.is_board_pic(public.task_board(NEW.task_id))
       AND (OLD.assignee_id <> auth.uid() OR NOT public.is_board_member(public.task_board(NEW.task_id))) THEN
      IF NEW.is_done IS DISTINCT FROM OLD.is_done THEN
        RAISE EXCEPTION 'Only the person this step is assigned to can tick it';
      END IF;
      IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN
        RAISE EXCEPTION 'Only the step''s owner or the PIC can hand it to someone else';
      END IF;
    END IF;
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

CREATE OR REPLACE FUNCTION public.task_steps_after_write() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_task_activity(NEW.task_id, 'step_added', jsonb_build_object('step_id', NEW.id, 'title', NEW.title));
    PERFORM public.reopen_lineage(NEW.task_id);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_task_activity(OLD.task_id, 'step_removed', jsonb_build_object('title', OLD.title));
    RETURN NULL;
  ELSIF NEW.is_done IS DISTINCT FROM OLD.is_done THEN
    PERFORM public.log_task_activity(NEW.task_id,
      CASE WHEN NEW.is_done THEN 'step_checked' ELSE 'step_unchecked' END,
      jsonb_build_object('step_id', NEW.id, 'title', NEW.title));
    IF NOT NEW.is_done THEN
      PERFORM public.reopen_lineage(NEW.task_id);
    END IF;
  ELSIF (NEW.title, NEW.note) IS DISTINCT FROM (OLD.title, OLD.note) THEN
    PERFORM public.reopen_lineage(NEW.task_id);
  END IF;

  IF NEW.assignee_id IS NOT NULL
     AND NEW.assignee_id IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.assignee_id END) THEN
    PERFORM public.log_task_activity(NEW.task_id, 'step_assigned',
      jsonb_build_object('step_id', NEW.id, 'title', NEW.title, 'user_id', NEW.assignee_id));
    PERFORM public.notify_user(NEW.assignee_id, public.actor_name() || ' assigned you a step', NEW.task_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP POLICY task_steps_update ON public.t_task_steps;
CREATE POLICY task_steps_update ON public.t_task_steps FOR UPDATE TO authenticated
  USING (public.can_work_task(task_id)
         OR (assignee_id = auth.uid() AND public.is_board_member(public.task_board(task_id))))
  WITH CHECK (public.can_work_task(task_id)
              OR (assignee_id = auth.uid() AND public.is_board_member(public.task_board(task_id))));

CREATE OR REPLACE FUNCTION public.can_review_task(p_task_id bigint) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.is_board_member(public.task_board(p_task_id))
     AND NOT EXISTS (SELECT 1 FROM t_task_assignees WHERE task_id = p_task_id AND user_id = auth.uid())
     AND (
       EXISTS (SELECT 1 FROM t_task_reviewers WHERE task_id = p_task_id AND user_id = auth.uid())
       OR (NOT EXISTS (SELECT 1 FROM t_task_reviewers WHERE task_id = p_task_id)
           AND (public.is_admin() OR EXISTS (
             SELECT 1 FROM m_project_members
             WHERE project_id = public.board_project(public.task_board(p_task_id))
               AND user_id = auth.uid() AND member_role IN ('pic', 'reviewer'))))
     );
$$;

CREATE OR REPLACE FUNCTION public.submit_review(p_task_id bigint) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_task t_tasks%ROWTYPE;
  v_reviewer uuid;
BEGIN
  SELECT * INTO v_task FROM t_tasks WHERE id = p_task_id FOR UPDATE;
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

  IF NOT EXISTS (SELECT 1 FROM t_task_reviewers WHERE task_id = p_task_id)
     AND NOT EXISTS (SELECT 1 FROM m_project_members
                     WHERE project_id = public.board_project(v_task.board_id) AND member_role IN ('pic', 'reviewer')) THEN
    RAISE EXCEPTION 'Nobody can review this yet: ask an admin to make someone PIC or reviewer of the project';
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

CREATE OR REPLACE FUNCTION public.review_task(p_task_id bigint, p_decision text, p_note text DEFAULT NULL)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_task     t_tasks%ROWTYPE;
  v_assignee uuid;
BEGIN
  SELECT * INTO v_task FROM t_tasks WHERE id = p_task_id FOR UPDATE;
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

  FOR v_assignee IN
    SELECT user_id FROM t_task_assignees WHERE task_id = p_task_id
    UNION SELECT v_task.submitted_by WHERE v_task.submitted_by IS NOT NULL
  LOOP
    PERFORM public.notify_user(v_assignee,
      public.actor_name() || CASE WHEN p_decision = 'approved' THEN ' approved your task' ELSE ' sent your task back' END,
      p_task_id);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.board_task_comments_after_insert() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_mentioned uuid;
BEGIN
  PERFORM public.log_task_activity(NEW.task_id, 'commented', jsonb_build_object('comment_id', NEW.id));
  FOREACH v_mentioned IN ARRAY (SELECT ARRAY(SELECT DISTINCT unnest(NEW.mentions))) LOOP
    IF EXISTS (SELECT 1 FROM m_project_members
               WHERE user_id = v_mentioned
                 AND project_id = public.board_project(public.task_board(NEW.task_id))) THEN
      PERFORM public.notify_user(v_mentioned, public.actor_name() || ' mentioned you on a task', NEW.task_id);
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE FUNCTION public.guard_board_ownership() RETURNS trigger
  LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;
  -- Separate branches: NEW has project_id on boards and board_id elsewhere.
  IF TG_TABLE_NAME = 't_boards' THEN
    IF NEW.project_id <> OLD.project_id THEN
      RAISE EXCEPTION 'This belongs to its board and cannot be moved';
    END IF;
  ELSIF NEW.board_id <> OLD.board_id THEN
    RAISE EXCEPTION 'This belongs to its board and cannot be moved';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_guard_board_ownership BEFORE UPDATE ON public.t_boards
  FOR EACH ROW EXECUTE FUNCTION public.guard_board_ownership();
CREATE TRIGGER trg_guard_board_ownership BEFORE UPDATE ON public.t_board_columns
  FOR EACH ROW EXECUTE FUNCTION public.guard_board_ownership();
CREATE TRIGGER trg_guard_board_ownership BEFORE UPDATE ON public.t_task_labels
  FOR EACH ROW EXECUTE FUNCTION public.guard_board_ownership();

DROP POLICY task_label_map_write ON public.t_task_label_map;
CREATE POLICY task_label_map_write ON public.t_task_label_map FOR ALL TO authenticated
  USING (public.can_work_task(task_id))
  WITH CHECK (public.can_work_task(task_id)
              AND EXISTS (SELECT 1 FROM t_task_labels l
                          WHERE l.id = label_id AND l.board_id = public.task_board(task_id)));

CREATE POLICY board_attachments_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'task-attachments' AND (storage.foldername(name))[1] = 'board'
         AND public.is_board_pic(public.task_board(public.board_file_task(name))));

