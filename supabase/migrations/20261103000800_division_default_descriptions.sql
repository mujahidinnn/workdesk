UPDATE public.m_divisions d
SET description = v.description
FROM (VALUES
  ('Backend', 'APIs, databases and server-side services'),
  ('Frontend', 'Web interfaces and client-side logic'),
  ('Mobile', 'Android and iOS applications'),
  ('UI/UX', 'User research, wireframes and interface design'),
  ('QA', 'Testing, bug verification and release quality'),
  ('DevOps', 'Infrastructure, CI/CD, deployment and monitoring'),
  ('PM', 'Planning, coordination and stakeholder communication'),
  ('GIS', 'Maps, spatial data and geographic analysis')
) AS v(name, description)
WHERE d.name = v.name AND d.description IS NULL;
