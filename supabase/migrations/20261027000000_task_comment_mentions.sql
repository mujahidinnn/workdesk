-- @mentions in issue/task comments: people only, no @everyone broadcast.
ALTER TABLE public.t_task_comments
  ADD COLUMN IF NOT EXISTS mentions uuid[] NOT NULL DEFAULT '{}';

CREATE OR REPLACE FUNCTION public.notify_task_comment_mention() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_author_name TEXT;
  v_mentioned   UUID;
BEGIN
  SELECT COALESCE(full_name, 'Someone') INTO v_author_name FROM profiles WHERE id = NEW.user_id;

  FOREACH v_mentioned IN ARRAY (SELECT ARRAY(SELECT DISTINCT unnest(NEW.mentions))) LOOP
    IF v_mentioned <> NEW.user_id AND EXISTS (SELECT 1 FROM profiles WHERE id = v_mentioned) THEN
      INSERT INTO t_notifications (user_id, title, body, link)
      VALUES (v_mentioned, v_author_name || ' mentioned you in a comment', left(NEW.comment, 140), '/issues');
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_task_comment_mention ON public.t_task_comments;
CREATE TRIGGER trg_notify_task_comment_mention AFTER INSERT ON public.t_task_comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_task_comment_mention();
