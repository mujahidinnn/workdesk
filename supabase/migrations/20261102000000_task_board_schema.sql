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

INSERT INTO public.m_features (feature_name, feature_key, icon_name, path)
VALUES ('Task Board', 'board', 'SquareKanban', '/boards');

INSERT INTO public.t_role_permissions (role_id, feature_id, can_create, can_read, can_update, can_delete)
SELECT rp.role_id, (SELECT id FROM public.m_features WHERE feature_key = 'board'),
       rp.can_create, rp.can_read, rp.can_update, rp.can_delete
FROM public.t_role_permissions rp
JOIN public.m_features f ON f.id = rp.feature_id
WHERE f.feature_key = 'daily-report';

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

CREATE TABLE public.t_tasks (
  id              bigserial PRIMARY KEY,
  board_id        int NOT NULL REFERENCES public.t_boards(id) ON DELETE CASCADE,
  column_id       int REFERENCES public.t_board_columns(id) ON DELETE RESTRICT,
  parent_id       bigint REFERENCES public.t_tasks(id) ON DELETE CASCADE,
  root_id         bigint NOT NULL DEFAULT 0,
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
  submitted_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  archived_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tasks_dates_order CHECK (due_date IS NULL OR start_date IS NULL OR due_date >= start_date),
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

CREATE FUNCTION public.task_lineage(p_task_id bigint) RETURNS TABLE (id bigint)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH RECURSIVE up AS (
    SELECT t.id, t.parent_id FROM t_tasks t WHERE t.id = p_task_id
    UNION ALL
    SELECT t.id, t.parent_id FROM t_tasks t JOIN up ON t.id = up.parent_id
  )
  SELECT up.id FROM up;
$$;

CREATE FUNCTION public.is_task_assignee(p_task_id bigint) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM t_task_assignees a
    WHERE a.user_id = auth.uid() AND a.task_id IN (SELECT id FROM public.task_lineage(p_task_id)));
$$;

CREATE FUNCTION public.can_work_task(p_task_id bigint) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT (public.is_task_assignee(p_task_id) AND public.is_board_member(public.task_board(p_task_id)))
      OR public.is_board_pic(public.task_board(p_task_id));
$$;

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
CREATE TRIGGER trg_tasks_before_write BEFORE INSERT OR UPDATE ON public.t_tasks
  FOR EACH ROW EXECUTE FUNCTION public.tasks_before_write();

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
CREATE FUNCTION public.task_assignees_before_delete() RETURNS trigger
  LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF current_user = 'authenticated'
     AND EXISTS (SELECT 1 FROM t_tasks WHERE id = OLD.task_id AND status = 'in_review') THEN
    RAISE EXCEPTION 'Assignees cannot change while the task is in review';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER trg_task_assignees_before_delete BEFORE DELETE ON public.t_task_assignees
  FOR EACH ROW EXECUTE FUNCTION public.task_assignees_before_delete();

CREATE TRIGGER trg_task_reviewers_before_insert BEFORE INSERT ON public.t_task_reviewers
  FOR EACH ROW EXECUTE FUNCTION public.task_reviewers_before_insert();

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

ALTER TABLE public.t_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t_board_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t_task_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t_task_reviewers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t_task_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t_task_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t_task_label_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_members_update ON public.m_project_members FOR UPDATE TO authenticated
  USING (public.has_permission('master', 'update') OR public.is_project_pic(project_id))
  WITH CHECK (public.has_permission('master', 'update') OR public.is_project_pic(project_id));

CREATE FUNCTION public.guard_project_member_identity() RETURNS trigger
  LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF current_user = 'authenticated'
     AND (NEW.project_id <> OLD.project_id OR NEW.user_id <> OLD.user_id) THEN
    RAISE EXCEPTION 'Only the member role can be changed';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_guard_project_member_identity BEFORE UPDATE ON public.m_project_members
  FOR EACH ROW EXECUTE FUNCTION public.guard_project_member_identity();

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
