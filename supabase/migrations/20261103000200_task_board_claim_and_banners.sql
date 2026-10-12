DROP POLICY task_assignees_insert ON public.t_task_assignees;
CREATE POLICY task_assignees_insert ON public.t_task_assignees FOR INSERT TO authenticated
  WITH CHECK (
    public.can_work_task(task_id)
    OR (NOT EXISTS (SELECT 1 FROM t_task_assignees a WHERE a.task_id = t_task_assignees.task_id)
        AND (EXISTS (SELECT 1 FROM t_tasks t WHERE t.id = task_id AND t.created_by = auth.uid())
             OR (user_id = auth.uid() AND public.is_board_member(public.task_board(task_id))))));

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('board-banners', 'board-banners', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

CREATE FUNCTION public.banner_board(p_name text) RETURNS int
  LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN (storage.foldername(p_name))[1] ~ '^[0-9]{1,9}$'
              THEN ((storage.foldername(p_name))[1])::int END;
$$;

CREATE POLICY board_banners_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'board-banners' AND public.is_board_member(public.banner_board(name)));
CREATE POLICY board_banners_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'board-banners' AND public.is_board_pic(public.banner_board(name)));
CREATE POLICY board_banners_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'board-banners' AND public.is_board_pic(public.banner_board(name)));
