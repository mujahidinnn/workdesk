ALTER TABLE public.m_divisions ADD COLUMN description text;

INSERT INTO public.m_divisions (name, color, description) VALUES
  ('Marketing', '#ca8a04', 'Campaigns, promotion and market research'),
  ('Creative Content', '#c026d3', 'Copywriting, design assets, photo and video')
ON CONFLICT (name) DO NOTHING;
