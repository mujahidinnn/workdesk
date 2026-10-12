ALTER TABLE public.t_task_steps
  ADD COLUMN assignee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE INDEX idx_task_steps_assignee ON public.t_task_steps (assignee_id) WHERE NOT is_done;

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
    IF NEW.is_done IS DISTINCT FROM OLD.is_done AND OLD.assignee_id IS NOT NULL
       AND OLD.assignee_id <> auth.uid() AND NOT public.is_board_pic(public.task_board(NEW.task_id)) THEN
      RAISE EXCEPTION 'Only the person this step is assigned to can tick it';
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

DROP POLICY task_steps_update ON public.t_task_steps;
CREATE POLICY task_steps_update ON public.t_task_steps FOR UPDATE TO authenticated
  USING (public.can_work_task(task_id) OR assignee_id = auth.uid())
  WITH CHECK (public.can_work_task(task_id) OR assignee_id = auth.uid());

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
