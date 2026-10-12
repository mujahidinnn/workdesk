-- Deleting a project (Master Hub, demo reset) must take its board along.
-- RESTRICT on column_id fired mid-cascade, before the cards were gone, and the
-- column guard refused even though the whole board was being removed.

ALTER TABLE public.t_tasks DROP CONSTRAINT t_tasks_column_id_fkey;
ALTER TABLE public.t_tasks
  ADD CONSTRAINT t_tasks_column_id_fkey FOREIGN KEY (column_id)
  REFERENCES public.t_board_columns(id);

CREATE OR REPLACE FUNCTION public.guard_column_delete() RETURNS trigger
  LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM t_boards WHERE id = OLD.board_id)
     AND EXISTS (SELECT 1 FROM t_tasks WHERE column_id = OLD.id) THEN
    RAISE EXCEPTION 'Move the tasks out of this column first';
  END IF;
  RETURN OLD;
END;
$$;
