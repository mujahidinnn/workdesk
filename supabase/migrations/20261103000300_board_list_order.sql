CREATE TABLE public.t_board_order (
  user_id    uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id int NOT NULL REFERENCES public.m_projects(id) ON DELETE CASCADE,
  position   numeric NOT NULL,
  PRIMARY KEY (user_id, project_id)
);

ALTER TABLE public.t_board_order ENABLE ROW LEVEL SECURITY;
CREATE POLICY board_order_own ON public.t_board_order FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
