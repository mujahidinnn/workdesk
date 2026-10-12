CREATE OR REPLACE FUNCTION public.tasks_before_write() RETURNS trigger
  LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE
  v_parent t_tasks%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.board_id <> OLD.board_id AND current_user = 'authenticated' THEN
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

CREATE FUNCTION public.move_task_to_board(p_task_id bigint, p_board_id int)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_task    t_tasks%ROWTYPE;
  v_column  int;
  v_start   int;
  v_n       int;
  v_missing int;
BEGIN
  SELECT * INTO v_task FROM t_tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND OR v_task.parent_id IS NOT NULL THEN
    RAISE EXCEPTION 'Only a top-level card can move to another board';
  END IF;
  IF v_task.board_id = p_board_id THEN
    RAISE EXCEPTION 'The card is already on that board';
  END IF;
  IF NOT public.can_work_task(p_task_id) OR NOT public.is_board_member(p_board_id)
     OR NOT public.has_permission('board', 'create') THEN
    RAISE EXCEPTION 'You need to work on this card and belong to the other project';
  END IF;

  SELECT count(*) INTO v_missing FROM (
    SELECT a.user_id FROM t_task_assignees a JOIN t_tasks t ON t.id = a.task_id WHERE t.root_id = v_task.root_id
    UNION SELECT r.user_id FROM t_task_reviewers r JOIN t_tasks t ON t.id = r.task_id WHERE t.root_id = v_task.root_id
    UNION SELECT s.assignee_id FROM t_task_steps s JOIN t_tasks t ON t.id = s.task_id
          WHERE t.root_id = v_task.root_id AND s.assignee_id IS NOT NULL
  ) p(user_id)
  WHERE NOT EXISTS (SELECT 1 FROM m_project_members m
                    WHERE m.project_id = public.board_project(p_board_id) AND m.user_id = p.user_id);
  IF v_missing > 0 THEN
    RAISE EXCEPTION '% people on this card are not members of the other project; add them there first', v_missing;
  END IF;

  SELECT id INTO v_column FROM t_board_columns
  WHERE board_id = p_board_id AND NOT is_done_column ORDER BY position LIMIT 1;
  IF v_column IS NULL THEN
    RAISE EXCEPTION 'The other board has no open column';
  END IF;

  SELECT count(*) INTO v_n FROM t_tasks WHERE root_id = v_task.root_id;
  UPDATE t_boards SET next_task_no = next_task_no + v_n
  WHERE id = p_board_id RETURNING next_task_no - v_n INTO v_start;

  DELETE FROM t_task_label_map m USING t_tasks t WHERE t.id = m.task_id AND t.root_id = v_task.root_id;

  WITH ordered AS (
    SELECT id, row_number() OVER (ORDER BY depth, position, id) - 1 AS k
    FROM t_tasks WHERE root_id = v_task.root_id
  )
  UPDATE t_tasks t SET
    board_id = p_board_id,
    task_no = v_start + o.k,
    column_id = CASE WHEN t.id = p_task_id THEN v_column END,
    position = CASE WHEN t.id = p_task_id
                    THEN (SELECT COALESCE(max(x.position), 0) + 1024 FROM t_tasks x WHERE x.column_id = v_column)
                    ELSE t.position END
  FROM ordered o WHERE o.id = t.id;

  PERFORM public.log_task_activity(p_task_id, 'moved_board',
    jsonb_build_object('from', v_task.board_id, 'to', p_board_id));
END;
$$;

CREATE FUNCTION public.withdraw_review(p_task_id bigint) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_task t_tasks%ROWTYPE;
BEGIN
  SELECT * INTO v_task FROM t_tasks WHERE id = p_task_id FOR UPDATE;
  IF v_task.status IS DISTINCT FROM 'in_review' THEN
    RAISE EXCEPTION 'This task is not waiting for review';
  END IF;
  IF NOT (public.is_task_assignee(p_task_id) OR v_task.submitted_by = auth.uid()
          OR public.is_board_pic(v_task.board_id)) THEN
    RAISE EXCEPTION 'Only an assignee, the submitter or the PIC can withdraw this';
  END IF;
  UPDATE t_tasks SET status = 'in_progress', submitted_by = NULL WHERE id = p_task_id;
  PERFORM public.log_task_activity(p_task_id, 'withdrawn', '{}'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.move_task_to_board(bigint, int), public.withdraw_review(bigint) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.notify_my_overdue() RETURNS int
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_count int;
BEGIN
  INSERT INTO t_notifications (user_id, title, body, link)
  SELECT auth.uid(), 'Task overdue', public.task_label(t.id), public.task_link(t.id)
  FROM t_tasks t
  WHERE (EXISTS (SELECT 1 FROM t_task_assignees a WHERE a.task_id = t.id AND a.user_id = auth.uid())
         OR EXISTS (SELECT 1 FROM t_task_steps s
                    WHERE s.task_id = t.id AND s.assignee_id = auth.uid() AND NOT s.is_done))
    AND t.due_date < CURRENT_DATE AND t.status <> 'done' AND t.archived_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM t_notifications n
      WHERE n.user_id = auth.uid() AND n.title = 'Task overdue'
        AND n.link = public.task_link(t.id) AND n.created_at >= CURRENT_DATE);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.task_assignees_before_insert() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM m_project_members
    WHERE project_id = public.board_project(public.task_board(NEW.task_id)) AND user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'That user is not a member of this project';
  END IF;
  -- Serialise inserts per task, then re-check with a fresh snapshot: of two
  -- members claiming the same free task, the second finds it taken.
  PERFORM 1 FROM t_tasks WHERE id = NEW.task_id FOR UPDATE;
  IF current_setting('role', true) = 'authenticated' AND NOT public.can_work_task(NEW.task_id)
     AND EXISTS (SELECT 1 FROM t_task_assignees WHERE task_id = NEW.task_id) THEN
    RAISE EXCEPTION 'Someone else took this task first';
  END IF;
  NEW.assigned_by := COALESCE(auth.uid(), NEW.assigned_by);
  NEW.assigned_at := now();
  RETURN NEW;
END;
$$;
