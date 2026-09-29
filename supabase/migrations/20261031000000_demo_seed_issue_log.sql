-- Issue Log demo data: tasks and problems follow the role and project, open
-- blockers cap progress at 70%, and comments run in office hours with the
-- owner closing resolved issues.

CREATE OR REPLACE FUNCTION public.superadmin_seed_demo_data(p_holidays JSONB DEFAULT '[]'::JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, extensions AS $seed$
DECLARE
  v_password  TEXT := 'Demo123!';
  v_tz        TEXT;
  v_today     DATE;
  v_now_time  TIME;
  v_mon       DATE;
  v_start     DATE;
  v_workdays  SMALLINT[];
  v_general   INT;
  v_ch        INT;
  v_run       INT;
  v_admin     UUID;
  u           RECORD;
  m           RECORD;
  v_emp_id    INT;
  v_msg_id    BIGINT;
  v_ref       DATE;
  v_andi_join DATE;
  v_poster    DATE;
  v_maint     DATE;
  v_notulen   DATE;
  v_pending   INT;
  v_survey    DATE;
  v_demo_when     TEXT;
  v_incident_when TEXT;
  v_arjuna UUID := '11111111-1111-4111-8111-111111111111';
  v_dewi   UUID := '22222222-2222-4222-8222-222222222222';
  v_bima   UUID := '33333333-3333-4333-8333-333333333333';
  v_gita   UUID := '44444444-4444-4444-8444-444444444444';
  v_surya  UUID := '55555555-5555-4555-8555-555555555555';
  v_maya   UUID := '66666666-6666-4666-8666-666666666666';
  v_rizky  UUID := '77777777-7777-4777-8777-777777777777';
  v_nadia  UUID := '88888888-8888-4888-8888-888888888888';
  v_fajar  UUID := '99999999-9999-4999-8999-999999999999';
  v_laras  UUID := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_yoga   UUID := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  v_citra  UUID := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  v_andi   UUID := 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Superadmin only';
  END IF;

  PERFORM public.superadmin_wipe_all_data();

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  UPDATE m_work_schedule SET locked_until = NULL WHERE TRUE;

  v_tz       := COALESCE((SELECT timezone FROM m_work_schedule LIMIT 1), 'Asia/Jakarta');
  v_today    := public.company_today();
  v_now_time := public.company_now_time();
  v_mon      := date_trunc('week', v_today)::DATE;
  v_start    := (date_trunc('month', v_today) - INTERVAL '2 months')::DATE;
  v_workdays := COALESCE((SELECT work_days FROM m_work_schedule LIMIT 1), '{1,2,3,4,5}');
  SELECT id INTO v_admin FROM auth.users WHERE email = 'admin@workdesk.com';

  INSERT INTO m_holidays (date, name, is_national)
  SELECT (h->>'date')::DATE, h->>'name', COALESCE((h->>'is_national')::BOOLEAN, TRUE)
  FROM jsonb_array_elements(p_holidays) h
  ON CONFLICT (date) DO NOTHING;

  -- Fixed-date holidays still land when the caller passes none (offline, SQL call).
  INSERT INTO m_holidays (date, name, is_national)
  SELECT make_date(y, f.m, f.d), f.name, TRUE
  FROM generate_series(EXTRACT(YEAR FROM v_today)::INT - 1, EXTRACT(YEAR FROM v_today)::INT + 1) AS y
  CROSS JOIN (VALUES
    (1, 1,  'Tahun Baru Masehi'),
    (5, 1,  'Hari Buruh Internasional'),
    (6, 1,  'Hari Lahir Pancasila'),
    (8, 17, 'Hari Kemerdekaan RI'),
    (12, 25, 'Hari Raya Natal')
  ) AS f(m, d, name)
  ON CONFLICT (date) DO NOTHING;

  INSERT INTO m_holidays (date, name, is_national)
  VALUES (v_today + 18, 'HUT WorkDesk (libur perusahaan)', FALSE)
  ON CONFLICT (date) DO NOTHING;

  -- Story beats are placed by workday index (n = 0 is the latest workday already underway),
  -- so weekday mentions in chat and the matching overtime rows agree whatever day the seed runs.
  v_ref := v_today;
  WHILE NOT (EXTRACT(ISODOW FROM v_ref)::SMALLINT = ANY (v_workdays))
        OR EXISTS (SELECT 1 FROM m_holidays WHERE date = v_ref)
        OR (v_ref = v_today AND v_now_time < TIME '10:00') LOOP
    v_ref := v_ref - 1;
  END LOOP;

  DROP TABLE IF EXISTS _wd;
  CREATE TEMP TABLE _wd ON COMMIT DROP AS
  SELECT (row_number() OVER (ORDER BY g.d DESC) - 1)::INT AS n, g.d::DATE AS d
  FROM generate_series(v_ref - 150, v_ref, INTERVAL '1 day') AS g(d)
  WHERE EXTRACT(ISODOW FROM g.d)::SMALLINT = ANY (v_workdays)
    AND NOT EXISTS (SELECT 1 FROM m_holidays h WHERE h.date = g.d::DATE);

  v_andi_join := (SELECT d FROM _wd WHERE n = 9);
  -- Poster asks for RSVP by Thursday, so it goes out Monday to Wednesday.
  v_poster  := LEAST(v_ref, date_trunc('week', v_ref)::DATE + 2);
  v_maint   := v_ref - ((EXTRACT(ISODOW FROM v_ref)::INT - 4 + 7) % 7);
  -- Minutes cover an early-week 14.00 meeting whose follow-ups run to Friday; today's may not have happened yet.
  v_notulen := (SELECT d FROM _wd WHERE n >= 1 AND EXTRACT(ISODOW FROM d) IN (1, 2) ORDER BY n LIMIT 1);
  -- The survey map says "lanjut besok", so day 2 must be the next calendar day.
  v_survey  := (SELECT a.d FROM _wd a JOIN _wd b ON b.n = a.n - 1 AND b.d = a.d + 1
                WHERE a.n >= 2 AND v_notulen NOT IN (a.d, b.d)
                ORDER BY a.n LIMIT 1);
  v_demo_when     := CASE WHEN (SELECT d FROM _wd WHERE n = 6) - (SELECT d FROM _wd WHERE n = 7) = 1 THEN 'kemarin'
                          ELSE 'hari ' || (ARRAY['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Minggu'])[EXTRACT(ISODOW FROM (SELECT d FROM _wd WHERE n = 7))::INT] END;
  v_incident_when := CASE WHEN (SELECT d FROM _wd WHERE n = 1) - (SELECT d FROM _wd WHERE n = 2) = 1 THEN 'kemarin'
                          ELSE 'hari ' || (ARRAY['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Minggu'])[EXTRACT(ISODOW FROM (SELECT d FROM _wd WHERE n = 2))::INT] END;

  FOR u IN
    SELECT * FROM (VALUES
      (v_arjuna, 'arjuna', 'Arjuna Wijaya',   'Admin',    'Engineering',        'Engineering Manager',      'EMP-001', 1650, 'Permanent', 21500000, 95000, 150000, 450000, 5),
      (v_dewi,   'dewi',   'Dewi Ratna',      'Manager',  'Project Management', 'Project Manager',          'EMP-002', 1180, 'Permanent', 16750000, 80000, 150000, 450000, 1),
      (v_laras,  'laras',  'Laras Setyawati', 'Manager',  'Finance',            'Finance & Payroll Lead',   'EMP-003', 1400, 'Permanent', 15200000, 78000, 150000, 400000, 3),
      (v_fajar,  'fajar',  'Fajar Nugroho',   'Employee', 'Engineering',        'DevOps Engineer',          'EMP-004',  980, 'Permanent', 13400000, 72000, 125000, 400000, 2),
      (v_bima,   'bima',   'Bima Aditya',     'Employee', 'Engineering',        'Backend Developer',        'EMP-005',  760, 'Permanent', 11200000, 62000, 125000, 350000, 1),
      (v_nadia,  'nadia',  'Nadia Putri',     'Employee', 'Engineering',        'Mobile Developer',         'EMP-006',  420, 'Permanent', 10600000, 60000, 125000, 350000, 4),
      (v_rizky,  'rizky',  'Rizky Pratama',   'Employee', 'Engineering',        'Frontend Developer',       'EMP-007',  300, 'Contract',  10150000, 58000, 125000, 350000, 2),
      (v_gita,   'gita',   'Gita Kirana',     'Employee', 'Design',             'UI/UX Designer',           'EMP-008',  540, 'Permanent',  9350000, 55000, 125000, 350000, 6),
      (v_surya,  'surya',  'Surya Candra',    'Employee', 'Quality Assurance',  'QA Engineer',              'EMP-009',  610, 'Permanent',  8900000, 52000, 125000, 350000, 3),
      (v_maya,   'maya',   'Maya Indira',     'Employee', 'Human Resources',    'HR Officer',               'EMP-010',  890, 'Permanent',  8400000, 48000, 125000, 350000, 1),
      (v_yoga,   'yoga',   'Yoga Permana',    'Employee', 'GIS & Data',         'GIS Analyst',              'EMP-011',  200, 'Contract',   8750000, 50000, 125000, 350000, 20),
      (v_citra,  'citra',  'Citra Anjani',    'Employee', 'Design',             'Graphic Designer',         'EMP-012',   85, 'Probation',  6800000, 40000, 100000, 300000, 8),
      (v_andi,   'andi',   'Andi Saputra',    'Employee', 'Engineering',        'Software Engineer Intern', 'EMP-013', v_today - v_andi_join, 'Intern', 3500000, 25000, 100000, 250000, 26)
    ) AS t(id, handle, full_name, role_name, department, role_title, emp_no, days_ago, emp_type, salary, ot_rate, local_rate, out_rate, seen_hours_ago)
  LOOP
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at, last_sign_in_at,
      confirmation_token, recovery_token, email_change, email_change_token_new
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated',
      u.handle || '@workdesk.demo', extensions.crypt(v_password, extensions.gen_salt('bf')), NOW(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', u.full_name),
      NOW() - make_interval(days => u.days_ago), NOW(),
      NOW() - make_interval(hours => u.seen_hours_ago),
      '', '', '', ''
    );

    INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    VALUES (
      gen_random_uuid(), u.id, u.id::TEXT,
      jsonb_build_object('sub', u.id::TEXT, 'email', u.handle || '@workdesk.demo', 'email_verified', TRUE, 'phone_verified', FALSE),
      'email', NOW() - make_interval(hours => u.seen_hours_ago), NOW() - make_interval(days => u.days_ago), NOW()
    );

    INSERT INTO m_employees (full_name, role_title, status, department, employee_number, employment_type, join_date, annual_leave_quota, created_at)
    VALUES (u.full_name, u.role_title, 'Active', u.department, u.emp_no, u.emp_type,
            (SELECT min(g.d)::DATE FROM generate_series(v_today - u.days_ago, v_today - u.days_ago + 6, INTERVAL '1 day') AS g(d)
             WHERE EXTRACT(ISODOW FROM g.d)::SMALLINT = ANY (v_workdays)),
            CASE WHEN u.emp_type IN ('Intern', 'Probation') THEN 0 ELSE 12 END,
            NOW() - make_interval(days => u.days_ago))
    RETURNING id INTO v_emp_id;

    UPDATE profiles
       SET role_id     = (SELECT id FROM m_roles WHERE role_name = u.role_name),
           employee_id = v_emp_id,
           full_name   = u.full_name,
           created_at  = NOW() - make_interval(days => u.days_ago)
     WHERE id = u.id;

    INSERT INTO t_employee_rates (profile_id, base_salary, overtime_rate, local_trip_rate, out_of_town_rate)
    VALUES (u.id, u.salary, u.ot_rate, u.local_rate, u.out_rate);
  END LOOP;

  UPDATE t_employee_rates SET updated_by = v_laras WHERE TRUE;

  INSERT INTO m_employees (full_name, role_title, status, department, employee_number, employment_type, join_date, resign_date, annual_leave_quota, created_at)
  VALUES ('Hendra Kusuma', 'Backend Developer', 'Inactive', 'Engineering', 'EMP-000', 'Contract',
          v_today - 700, v_today - 45, 12, NOW() - INTERVAL '700 days');

  INSERT INTO t_user_access_override (user_id, feature_id, can_read, is_override_active)
  SELECT v_maya, id, TRUE, TRUE FROM m_features WHERE feature_key = 'payroll';

  INSERT INTO m_projects (project_code, project_name, client, pic_name, pic_contact, priority, start_date, end_date, status_id, created_at)
  SELECT code, name, client, pic, contact, prio, v_today + s, v_today + e,
         (SELECT id FROM m_work_status WHERE status_name = st),
         NOW() - make_interval(days => GREATEST(14 - s, 10))
  FROM (VALUES
    ('PRJ-001', 'Fleet Tracking Dashboard',  'PT Sinar Logistik',              'Wisnu Pratama', '081234567801', 'High',   -150,   45, 'Development'),
    ('PRJ-002', 'HRIS Migration',            'PT Bumi Sejahtera',              'Sita Dewi',     '081234567802', 'Medium',  -40,  120, 'Requirement'),
    ('PRJ-003', 'Warehouse Mapping',         'PT Agro Nusantara',              'Aji Nugraha',   '081234567803', 'High',   -130,   -3, 'Client Review'),
    ('PRJ-004', 'Mobile Field Survey',       'Dinas Perhubungan Kota Bandung', 'Ratna Kusuma',  '081234567804', 'Medium',  -75,    6, 'Development'),
    ('PRJ-005', 'Smart Meter IoT Gateway',   'PT Energi Prima',                'Budi Hartono',  '081234567805', 'Low',      20,  200, 'Quotation'),
    ('PRJ-006', 'Company Profile Website',   'CV Kopi Nusantara',              'Intan Sari',    '081234567806', 'Low',    -200,  -60, 'Done'),
    ('PRJ-007', 'Land Parcel Digitization',  'BPN Kabupaten Sleman',           'Agus Salim',    '081234567807', 'Medium', -180, -120, 'Cancel')
  ) AS p(code, name, client, pic, contact, prio, s, e, st);

  INSERT INTO project_type_assignment (project_id, type_id)
  SELECT p.id, t.id
  FROM m_projects p
  JOIN (VALUES
    ('PRJ-001', 'Software'), ('PRJ-001', 'Hardware'),
    ('PRJ-002', 'Software'), ('PRJ-002', 'Data Collection'),
    ('PRJ-003', 'Mapping'),
    ('PRJ-004', 'Data Collection'), ('PRJ-004', 'Software'),
    ('PRJ-005', 'Hardware'),
    ('PRJ-006', 'Software'),
    ('PRJ-007', 'Mapping')
  ) AS a(code, type_name) ON a.code = p.project_code
  JOIN m_project_types t ON t.type_name = a.type_name;

  INSERT INTO m_project_members (project_id, user_id, created_at)
  SELECT p.id, a.uid, p.created_at
  FROM m_projects p
  JOIN (VALUES
    ('PRJ-001', v_arjuna), ('PRJ-001', v_dewi), ('PRJ-001', v_bima), ('PRJ-001', v_rizky),
    ('PRJ-001', v_nadia),  ('PRJ-001', v_fajar), ('PRJ-001', v_surya), ('PRJ-001', v_gita),
    ('PRJ-002', v_dewi),   ('PRJ-002', v_maya),  ('PRJ-002', v_laras), ('PRJ-002', v_bima),
    ('PRJ-002', v_rizky),  ('PRJ-002', v_surya),
    ('PRJ-003', v_dewi),   ('PRJ-003', v_yoga),  ('PRJ-003', v_gita),  ('PRJ-003', v_surya),
    ('PRJ-003', v_fajar),
    ('PRJ-004', v_dewi),   ('PRJ-004', v_nadia), ('PRJ-004', v_yoga),  ('PRJ-004', v_andi),
    ('PRJ-004', v_surya),  ('PRJ-004', v_citra),
    ('PRJ-005', v_arjuna), ('PRJ-005', v_dewi),  ('PRJ-005', v_fajar),
    ('PRJ-006', v_gita),   ('PRJ-006', v_citra), ('PRJ-006', v_rizky), ('PRJ-006', v_dewi),
    ('PRJ-007', v_dewi),   ('PRJ-007', v_yoga)
  ) AS a(code, uid) ON a.code = p.project_code;

  DROP TABLE IF EXISTS _seed_ot;
  CREATE TEMP TABLE _seed_ot ON COMMIT DROP AS
  SELECT * FROM (VALUES
    (v_fajar, 'Overtime',               (SELECT d FROM _wd WHERE n = 44), 1, '22:00'::TIME, '02:00'::TIME, 'PRJ-001', 'Maintenance window migrasi database produksi',            'Approved', v_arjuna, NULL),
    (v_dewi,  'BusinessTrip_OutOfTown', (SELECT d FROM _wd WHERE n = 41), 0, NULL,          NULL,          'PRJ-003', 'Kick-off meeting di gudang Surabaya',                     'Approved', v_arjuna, NULL),
    (v_yoga,  'BusinessTrip_OutOfTown', (SELECT d FROM _wd WHERE n = 40), 0, NULL,          NULL,          'PRJ-003', 'Survei lapangan gudang Surabaya hari 1',                  'Approved', v_dewi,   NULL),
    (v_yoga,  'BusinessTrip_OutOfTown', (SELECT d FROM _wd WHERE n = 39), 0, NULL,          NULL,          'PRJ-003', 'Survei lapangan gudang Surabaya hari 2',                  'Approved', v_dewi,   NULL),
    (v_nadia, 'Overtime',               (SELECT d FROM _wd WHERE n = 35), 0, '18:30',       '21:00',       'PRJ-004', 'Fix crash sinkronisasi sebelum uji lapangan',             'Approved', v_dewi,   NULL),
    (v_surya, 'BusinessTrip_Local',     (SELECT d FROM _wd WHERE n = 33), 0, NULL,          NULL,          'PRJ-004', 'Uji aplikasi survei bersama petugas Dishub',              'Approved', v_dewi,   NULL),
    (v_rizky, 'Overtime',               (SELECT d FROM _wd WHERE n = 31), 0, '19:00',       '22:00',       'PRJ-001', 'Kejar deadline sprint review',                            'Rejected', v_arjuna, 'Sprint review diundur, tidak perlu lembur'),
    (v_gita,  'BusinessTrip_Local',     (SELECT d FROM _wd WHERE n = 27), 0, NULL,          NULL,          'PRJ-001', 'Presentasi mockup dashboard di kantor PT Sinar Logistik', 'Approved', v_dewi,   NULL),
    (v_bima,  'Overtime',               (SELECT d FROM _wd WHERE n = 25), 0, '18:00',       '20:30',       'PRJ-002', 'Script migrasi data karyawan tahap 1',                    'Approved', v_dewi,   NULL),
    (v_fajar, 'Overtime',               (SELECT d FROM _wd WHERE n = 21), 0, '19:00',       '23:00',       'PRJ-001', 'Insiden server down, recovery dan post-mortem',           'Approved', v_arjuna, NULL),
    (v_arjuna,'BusinessTrip_OutOfTown', (SELECT d FROM _wd WHERE n = 18), 0, NULL,          NULL,          'PRJ-005', 'Presentasi solusi ke PT Energi Prima di Semarang',        'Approved', v_arjuna, NULL),
    (v_dewi,  'BusinessTrip_OutOfTown', (SELECT d FROM _wd WHERE n = 18), 0, NULL,          NULL,          'PRJ-005', 'Presentasi solusi ke PT Energi Prima di Semarang',        'Approved', v_arjuna, NULL),
    (v_maya,  'BusinessTrip_Local',     (SELECT d FROM _wd WHERE n = 12), 0, NULL,          NULL,          NULL,      'Job fair di kampus ITB',                                  'Approved', v_arjuna, NULL),
    (v_citra, 'Overtime',               (SELECT d FROM _wd WHERE n = 11), 0, '17:30',       '19:30',       'PRJ-005', 'Finalisasi deck pitching',                                'Rejected', v_dewi,   'Deck sudah disetujui siang, tidak perlu lembur'),
    (v_bima,  'Overtime',               (SELECT d FROM _wd WHERE n = 8),  0, '18:00',       '21:30',       'PRJ-001', 'Perbaikan bug kritikal sebelum demo klien',               'Approved', v_dewi,   NULL),
    (v_nadia, 'Overtime',               (SELECT d FROM _wd WHERE n = 7),  0, '18:00',       '20:00',       'PRJ-004', 'Build APK v0.9 untuk uji lapangan',                       'Approved', v_dewi,   NULL),
    (v_surya, 'Overtime',               (SELECT d FROM _wd WHERE n = 5),  0, '18:30',       '21:30',       'PRJ-001', 'Regresi QA menjelang rilis v2.3',                         'Approved', v_dewi,   NULL),
    (v_fajar, 'Overtime',               (SELECT d FROM _wd WHERE n = 4),  1, '22:00',       '01:30',       'PRJ-001', 'Deploy rilis v2.3 ke produksi dan pemantauan',            'Approved', v_dewi,   NULL),
    (v_fajar, 'Overtime',               (SELECT d FROM _wd WHERE n = 3),  0, '20:00',       '23:30',       'PRJ-002', 'Setup server staging HRIS',                               'Pending',  NULL,     NULL),
    (v_rizky, 'Overtime',               (SELECT d FROM _wd WHERE n = 2),  0, '18:00',       '21:00',       'PRJ-002', 'Integrasi halaman cuti HRIS',                             'Pending',  NULL,     NULL),
    (v_surya, 'Overtime',               (SELECT d FROM _wd WHERE n = 1),  0, '18:00',       '20:00',       'PRJ-004', 'Verifikasi bug fix sinkronisasi offline',                 'Pending',  NULL,     NULL),
    (v_yoga,  'BusinessTrip_Local',     v_survey,     0, NULL,   NULL,          'PRJ-004', 'Survei titik koordinat di Bandung hari 1',                'Approved', v_dewi,   NULL),
    (v_yoga,  'BusinessTrip_Local',     v_survey + 1, 0, NULL,   NULL,          'PRJ-004', 'Survei titik koordinat di Bandung hari 2, lanjutan karena hujan', 'Pending', NULL, NULL),
    (v_andi,  'BusinessTrip_Local',     v_survey + 1, 0, NULL,   NULL,          'PRJ-004', 'Pendampingan survei titik koordinat bersama Yoga',        'Pending',  NULL,     NULL),
    (v_fajar, 'Overtime',               v_maint + 2,  1, '22:00', '02:00',      NULL,      'Maintenance server staging',
     CASE WHEN v_maint + 2 < v_today THEN 'Approved' ELSE 'Pending' END,
     CASE WHEN v_maint + 2 < v_today THEN v_arjuna END, NULL)
  ) AS t(uid, type, d, span, st, et, code, activity, final, approver, note);

  v_pending := (SELECT count(*) FROM _seed_ot
                WHERE final = 'Pending' AND d >= date_trunc('month', v_today)::DATE);

  DROP TABLE IF EXISTS _seed_msg;
  CREATE TEMP TABLE _seed_msg (
    k INT, ch TEXT, sender UUID, body TEXT, d DATE, at TIME,
    reply INT, mentions UUID[], everyone BOOLEAN, fwd TEXT,
    edited BOOLEAN, pinned_by UUID
  ) ON COMMIT DROP;

  INSERT INTO _seed_msg VALUES
    (1,  'general', v_maya,   'Selamat pagi semua! Reminder: check-in di WorkDesk paling lambat jam 08.00, dan jangan lupa check-out sebelum pulang ya 🙏', (SELECT d FROM _wd WHERE n = 10), '07:50', NULL, '{}', FALSE, NULL, FALSE, NULL),
    (2,  'general', v_arjuna, '@everyone mohon isi laporan harian paling lambat jam 17.30. Laporan dipakai untuk rekap progres ke klien tiap Jumat.', (SELECT d FROM _wd WHERE n = 10), '08:05', NULL, '{}', TRUE, NULL, FALSE, v_arjuna),
    (3,  'general', v_bima,   'Siap pak 👍', (SELECT d FROM _wd WHERE n = 10), '08:12', 2, '{}', FALSE, NULL, FALSE, NULL),
    (4,  'general', v_citra,  'Izin tanya, kalau lembur pengajuannya di menu Overtime ya?', (SELECT d FROM _wd WHERE n = 10), '13:10', NULL, '{}', FALSE, NULL, FALSE, NULL),
    (5,  'general', v_maya,   '@Citra Anjani betul, isi jam mulai dan selesai. Nominalnya dihitung otomatis dari rate kamu.', (SELECT d FROM _wd WHERE n = 10), '13:25', 4, ARRAY[v_citra], FALSE, NULL, TRUE, NULL),
    (6,  'general', v_laras,  'Info: gaji dibayarkan setiap tanggal 25. Slip gaji bisa diunduh di menu Payroll setelah payroll bulan tersebut difinalisasi.', (SELECT d FROM _wd WHERE n = 7), '09:00', NULL, '{}', FALSE, NULL, FALSE, NULL),
    (7,  'general', v_dewi,   'Selamat untuk tim PRJ-001, demo ke PT Sinar Logistik ' || v_demo_when || ' lancar dan klien puas 🎉', (SELECT d FROM _wd WHERE n = 6), '09:30', NULL, '{}', FALSE, NULL, FALSE, NULL),
    (8,  'general', v_fajar,  'Mantap! Server aman selama demo, zero downtime.', (SELECT d FROM _wd WHERE n = 6), '09:45', 7, '{}', FALSE, NULL, FALSE, NULL),
    (9,  'general', v_gita,   'Keren timnya 🔥', (SELECT d FROM _wd WHERE n = 6), '10:00', 7, '{}', FALSE, NULL, FALSE, NULL),
    (18, 'general', v_arjuna, 'Slide townhall tadi pagi ya, buat yang ikut dari remote. Terima kasih kerja kerasnya semua 🙏', (SELECT d FROM _wd WHERE n = 5), '13:00', NULL, '{}', FALSE, NULL, FALSE, NULL),
    (19, 'general', v_nadia,  'Mantap pak, semangat terus! 💪', (SELECT d FROM _wd WHERE n = 5), '13:20', 18, '{}', FALSE, NULL, FALSE, NULL),
    (10, 'general', v_maya,   'Reminder: sisa kuota cuti tahunan bisa dicek di menu Leave. Pengajuan cuti paling lambat 7 hari sebelum tanggal cuti ya.', (SELECT d FROM _wd WHERE n = 3), '09:00', NULL, '{}', FALSE, NULL, FALSE, NULL),
    (11, 'general', v_andi,   'Halo semua, saya Andi, intern baru di tim engineering mulai hari ini. Mohon bimbingannya 🙏', v_andi_join, '09:30', NULL, '{}', FALSE, NULL, FALSE, NULL),
    (12, 'general', v_rizky,  'Welcome Andi!', v_andi_join, '09:40', 11, '{}', FALSE, NULL, FALSE, NULL),
    (13, 'general', v_arjuna, '@Andi Saputra welcome! Mentor kamu Bima ya, silakan sync dengan dia.', v_andi_join, '10:00', 11, ARRAY[v_andi], FALSE, NULL, FALSE, NULL),
    (17, 'general', v_bima,   '@Andi Saputra ini bahan belajar frontend yang dipakai tim: https://react.dev/learn', v_andi_join, '10:30', 11, NULL, FALSE, NULL, FALSE, NULL),
    (14, 'general', v_fajar,  'Maintenance server staging Sabtu ini jam 22.00-02.00, staging tidak bisa diakses selama itu.', v_maint, '09:30', NULL, '{}', FALSE, NULL, FALSE, NULL),
    (15, 'general', v_surya,  'Noted, regresi saya jadwalkan Senin pagi. Test E2E sekarang sudah pakai https://playwright.dev jadi lebih cepat.', v_maint, '10:00', 14, '{}', FALSE, NULL, FALSE, NULL),
    (16, 'general', v_maya,   'Jumat ini ada makan siang bersama di pantry jam 13.00, selesai Jumatan ya 🍱 Konfirmasi ke saya paling lambat Kamis, detailnya di poster.', v_poster, '08:45', NULL, '{}', FALSE, NULL, FALSE, NULL),
    (20, 'PRJ-001', v_dewi,   'Checklist requirement termin 2 sudah saya taruh di folder share. @Bima Aditya @Rizky Pratama tolong review bagian API dan UI.', (SELECT d FROM _wd WHERE n = 8), '09:00', NULL, NULL, FALSE, NULL, FALSE, v_dewi),
    (21, 'PRJ-001', v_bima,   'Sudah saya baca. Endpoint riwayat perjalanan perlu pagination, datanya bisa sampai ratusan ribu baris.', (SELECT d FROM _wd WHERE n = 8), '10:00', 20, '{}', FALSE, NULL, TRUE, NULL),
    (22, 'PRJ-001', v_rizky,  'UI tabelnya sudah siap untuk pagination server-side.', (SELECT d FROM _wd WHERE n = 8), '10:20', 21, '{}', FALSE, NULL, FALSE, NULL),
    (23, 'PRJ-001', v_arjuna, 'Pakai cursor pagination saja, jangan offset. Tabelnya bakal besar. Referensi: https://use-the-index-luke.com/no-offset', (SELECT d FROM _wd WHERE n = 8), '10:40', 21, '{}', FALSE, NULL, FALSE, NULL),
    (24, 'PRJ-001', v_surya,  'Rilis v2.3 lolos regresi, 2 bug minor sudah saya catat di issue log.', (SELECT d FROM _wd WHERE n = 4), '10:00', NULL, '{}', FALSE, NULL, FALSE, NULL),
    (25, 'PRJ-001', v_dewi,   'Terima kasih Surya. Deploy produksi malam ini ya @Fajar Nugroho', (SELECT d FROM _wd WHERE n = 4), '10:30', 24, NULL, FALSE, NULL, FALSE, NULL),
    (26, 'PRJ-001', v_fajar,  'Siap, saya standby dari jam 22.00.', (SELECT d FROM _wd WHERE n = 4), '11:00', 25, '{}', FALSE, NULL, FALSE, NULL),
    (27, 'PRJ-001', v_fajar,  'Post-mortem insiden ' || v_incident_when || ' siang: CPU prod-api-01 sempat 98% sekitar 20 menit karena query laporan tanpa index. Sudah di-hotfix, grafiknya terlampir.', (SELECT d FROM _wd WHERE n = 1), '09:15', NULL, '{}', FALSE, NULL, FALSE, NULL),
    (30, 'PRJ-001#design', v_gita,  'Mockup dashboard armada versi 3 sudah di Figma. Perubahan utama: peta jadi full width, ringkasan pindah ke panel kanan.', (SELECT d FROM _wd WHERE n = 11), '14:00', NULL, '{}', FALSE, NULL, FALSE, v_gita),
    (31, 'PRJ-001#design', v_rizky, 'Suka yang ini. Panel kanan bisa collapse di mobile?', (SELECT d FROM _wd WHERE n = 11), '15:00', 30, '{}', FALSE, NULL, FALSE, NULL),
    (32, 'PRJ-001#design', v_gita,  'Bisa, jadi bottom sheet di mobile. Sudah saya tambahkan di frame mobile.', (SELECT d FROM _wd WHERE n = 11), '15:30', 31, '{}', FALSE, NULL, TRUE, NULL),
    (33, 'PRJ-001#design', v_rizky, 'Untuk petanya saya pakai https://leafletjs.com, clustering marker juga sudah ada pluginnya.', (SELECT d FROM _wd WHERE n = 11), '16:00', 30, '{}', FALSE, NULL, FALSE, NULL),
    (35, 'PRJ-001#bugs',   v_surya, 'Bug: filter tanggal di laporan perjalanan ikut timezone browser, hasilnya geser 1 hari untuk user di WITA.', (SELECT d FROM _wd WHERE n = 5), '10:00', NULL, '{}', FALSE, NULL, FALSE, v_surya),
    (36, 'PRJ-001#bugs',   v_rizky, 'Oke saya cek, kayaknya parsing tanggalnya pakai new Date() langsung.', (SELECT d FROM _wd WHERE n = 5), '11:00', 35, '{}', FALSE, NULL, FALSE, NULL),
    (37, 'PRJ-001#bugs',   v_rizky, 'Fixed di PR #214, tolong verifikasi @Surya Candra', (SELECT d FROM _wd WHERE n = 4), '09:00', 35, NULL, FALSE, NULL, FALSE, NULL),
    (38, 'PRJ-001#bugs',   v_surya, 'Verified ✅', (SELECT d FROM _wd WHERE n = 4), '09:40', 37, '{}', FALSE, NULL, FALSE, NULL),
    (40, 'PRJ-004', v_nadia,  'APK v0.9 untuk uji lapangan sudah saya kirim ke tester.', (SELECT d FROM _wd WHERE n = 6), '10:00', NULL, '{}', FALSE, NULL, FALSE, NULL),
    (41, 'PRJ-004', v_yoga,   'Sudah saya install di 3 device. Mode offline jalan, tapi sinkron foto agak lama di sinyal 3G.', (SELECT d FROM _wd WHERE n = 6), '15:00', 40, '{}', FALSE, NULL, FALSE, NULL),
    (42, 'PRJ-004', v_nadia,  'Noted, saya tambahkan kompresi foto sebelum upload.', (SELECT d FROM _wd WHERE n = 6), '15:30', 41, '{}', FALSE, NULL, FALSE, NULL),
    (43, 'PRJ-004#lapangan', v_yoga,  'Titik survei hari ini: 42 dari 50 selesai, sisanya besok pagi karena hujan. Petanya terlampir.', v_survey, '16:45', NULL, '{}', FALSE, NULL, FALSE, NULL),
    (44, 'PRJ-004#lapangan', v_andi,  'Saya ikut besok ya Mas Yoga, sekalian belajar alurnya.', v_survey, '17:10', 43, '{}', FALSE, NULL, FALSE, NULL),
    (45, 'PRJ-004', v_dewi,   'Titik survei hari ini: 42 dari 50 selesai, sisanya besok pagi karena hujan. Petanya terlampir.', v_survey, '17:30', NULL, '{}', FALSE, 'Yoga Permana', FALSE, NULL),
    (50, 'PRJ-003', v_dewi,   'Notulen rapat progres dengan klien tadi siang terlampir. Poin utama: revisi batas zona B, review hasilnya hari Jumat.', v_notulen, '16:00', NULL, '{}', FALSE, NULL, FALSE, NULL),
    (51, 'PRJ-003', v_yoga,   'Siap bu, revisinya hari Kamis sudah bisa di-review.', v_notulen, '16:20', 50, '{}', FALSE, NULL, FALSE, NULL),
    (55, 'PRJ-002', v_laras,  'Untuk migrasi HRIS, data gaji jangan ikut dimigrasi dulu sebelum ada NDA dengan vendor ya.', (SELECT d FROM _wd WHERE n = 12), '10:00', NULL, '{}', FALSE, NULL, FALSE, v_laras),
    (56, 'PRJ-002', v_bima,   'Baik bu, script migrasi saya pisahkan per modul.', (SELECT d FROM _wd WHERE n = 12), '10:30', 55, '{}', FALSE, NULL, FALSE, NULL),
    (60, 'dm:arjuna:dewi', v_dewi,   'Pak, estimasi PRJ-005 saya kirim sore ini ya. Masih ada 2 item hardware yang harganya belum pasti.', (SELECT d FROM _wd WHERE n = 3), '09:00', NULL, '{}', FALSE, NULL, FALSE, NULL),
    (61, 'dm:arjuna:dewi', v_arjuna, 'Oke, kasih range saja dulu untuk item yang belum pasti.', (SELECT d FROM _wd WHERE n = 3), '09:20', 60, '{}', FALSE, NULL, FALSE, NULL),
    (62, 'dm:dewi:bima',   v_dewi,   'Bim, Andi mulai hari ini. Bisa bantu dia setup environment lokal?', v_andi_join, '08:50', NULL, '{}', FALSE, NULL, FALSE, NULL),
    (63, 'dm:dewi:bima',   v_bima,   'Bisa bu, habis makan siang saya pair dengan dia. Sekalian saya kasih bacaan soal RLS: https://supabase.com/docs/guides/database/postgres/row-level-security', v_andi_join, '09:10', 62, '{}', FALSE, NULL, FALSE, NULL),
    (64, 'dm:maya:citra',  v_maya,   'Citra, dokumen evaluasi masa probation kamu sudah saya kirim ke email ya.', (SELECT d FROM _wd WHERE n = 1), '10:00', NULL, '{}', FALSE, NULL, FALSE, NULL),
    (65, 'dm:maya:citra',  v_citra,  'Terima kasih mbak, saya isi hari ini.', (SELECT d FROM _wd WHERE n = 1), '10:30', 64, '{}', FALSE, NULL, FALSE, NULL),
    (66, 'dm:laras:arjuna',v_laras,
     CASE WHEN v_pending > 0
          THEN 'Pak, payroll bulan ini masih draft karena ada ' || v_pending || ' klaim lembur/dinas yang belum di-approve. '
               || CASE WHEN EXTRACT(DAY FROM v_ref) < 25 THEN 'Mohon di-approve sebelum tanggal 25 ya.'
                       ELSE 'Mohon di-approve hari ini supaya bisa segera difinalisasi.' END
          ELSE 'Pak, draft payroll bulan ini sudah saya generate. Saya finalisasi setelah klaim lembur bulan ini masuk semua.' END,
     (SELECT d FROM _wd WHERE n = 0), '08:30', NULL, '{}', FALSE, NULL, FALSE, NULL),
    (67, 'dm:gita:rizky',  v_gita,   'Riz, icon set baru sudah di Figma, pakai yang versi outline ya.', (SELECT d FROM _wd WHERE n = 2), '10:00', NULL, '{}', FALSE, NULL, FALSE, NULL),
    (68, 'dm:gita:rizky',  v_rizky,  'Siap, makasih Git 🙌', (SELECT d FROM _wd WHERE n = 2), '10:20', 67, '{}', FALSE, NULL, FALSE, NULL);

  -- Anyone posting or claiming overtime on a workday was at work that day.
  DROP TABLE IF EXISTS _seed_busy;
  CREATE TEMP TABLE _seed_busy ON COMMIT DROP AS
  SELECT DISTINCT sender AS uid, d FROM _seed_msg
  UNION
  SELECT uid, d FROM _seed_ot;

  INSERT INTO t_attendance (user_id, date, status, clock_in, clock_out, note, updated_by,
                            attachment_path, attachment_name)
  SELECT
    x.uid, x.d, x.status,
    CASE WHEN x.status = 'Hadir' THEN x.cin END,
    CASE WHEN x.status <> 'Hadir' THEN NULL
         WHEN x.d = v_today AND x.cout > v_now_time THEN NULL
         WHEN x.h % 97 = 0 AND x.d < v_today THEN NULL
         ELSE x.cout END,
    CASE x.status
      WHEN 'Sakit' THEN (ARRAY['Demam, istirahat di rumah', 'Flu berat', 'Sakit perut, sudah ke klinik', 'Migrain'])[(1 + x.h % 4)::INT]
      WHEN 'Izin'  THEN (ARRAY['Mengurus dokumen di kelurahan', 'Keperluan keluarga', 'Antar anak ke rumah sakit', 'Servis kendaraan'])[(1 + x.h % 4)::INT]
      WHEN 'Alpa'  THEN 'Tanpa keterangan'
      ELSE CASE WHEN x.h % 97 = 0 AND x.d < v_today THEN 'Lupa check-out' END
    END,
    NULL,
    -- A leading "/" means a static file in public/demo, not the storage bucket.
    CASE
      WHEN x.status = 'Sakit' AND x.h % 3 <> 0 THEN
        (ARRAY['/demo/surat-keterangan-sakit.png', '/demo/resep-obat.jpg'])[(1 + x.h % 2)::INT]
      WHEN x.status = 'Izin' AND x.h % 4 = 2 AND x.h % 3 <> 0 THEN '/demo/surat-kontrol-rumah-sakit.pdf'
      WHEN x.status = 'Izin' AND x.h % 4 = 3 THEN '/demo/nota-bengkel.jpg'
    END,
    CASE
      WHEN x.status = 'Sakit' AND x.h % 3 <> 0 THEN
        (ARRAY['surat-keterangan-sakit.png', 'resep-obat.jpg'])[(1 + x.h % 2)::INT]
      WHEN x.status = 'Izin' AND x.h % 4 = 2 AND x.h % 3 <> 0 THEN 'surat-kontrol-rumah-sakit.pdf'
      WHEN x.status = 'Izin' AND x.h % 4 = 3 THEN 'nota-bengkel.jpg'
    END
  FROM (
    SELECT pr.id AS uid, g.d::DATE AS d, h.h,
      CASE
        WHEN EXISTS (SELECT 1 FROM _seed_busy b WHERE b.uid = pr.id AND b.d = g.d::DATE) THEN 'Hadir'
        WHEN h.h % 100 < 2 THEN 'Sakit'
        WHEN h.h % 100 < 4 THEN 'Izin'
        WHEN h.h % 251 = 7 THEN 'Alpa'
        ELSE 'Hadir'
      END AS status,
      TIME '07:35' + make_interval(mins => (h.h % 40)::INT)
        + CASE WHEN h.h % 12 = 5 THEN make_interval(mins => (20 + h.h % 40)::INT) ELSE INTERVAL '0' END AS cin,
      TIME '17:00' + make_interval(mins => ((h.h / 7) % 110)::INT) AS cout
    FROM profiles pr
    CROSS JOIN generate_series(v_start, v_today, INTERVAL '1 day') AS g(d)
    CROSS JOIN LATERAL (SELECT public.demo_hash(pr.id::TEXT || g.d::TEXT) AS h) h
    WHERE NOT pr.is_superadmin
      AND pr.id IS DISTINCT FROM v_admin
      AND EXTRACT(ISODOW FROM g.d)::SMALLINT = ANY (v_workdays)
      AND NOT EXISTS (SELECT 1 FROM m_holidays hd WHERE hd.date = g.d::DATE)
      AND g.d::DATE >= (SELECT e.join_date FROM m_employees e WHERE e.id = pr.employee_id)
  ) x
  WHERE x.d < v_today OR (x.status = 'Hadir' AND x.cin <= v_now_time AND x.h % 5 <> 0);

  DROP TABLE IF EXISTS _seed_leave;
  CREATE TEMP TABLE _seed_leave ON COMMIT DROP AS
  SELECT * FROM (VALUES
    (v_dewi, 'Cuti', (SELECT d FROM _wd WHERE n = 47), (SELECT d FROM _wd WHERE n = 45), 'Cuti tahunan, liburan keluarga ke Lombok',        'Approved', v_arjuna, NULL, 20),
    (v_nadia, 'Cuti', (SELECT d FROM _wd WHERE n = 40), (SELECT d FROM _wd WHERE n = 36), 'Liburan keluarga ke Bali',                        'Approved', v_arjuna, NULL, 21),
    (v_bima, 'Cuti', (SELECT d FROM _wd WHERE n = 30), (SELECT d FROM _wd WHERE n = 28), 'Acara pernikahan saudara di Yogyakarta',          'Approved', v_dewi,   NULL, 14),
    (v_maya, 'Cuti', (SELECT d FROM _wd WHERE n = 20), (SELECT d FROM _wd WHERE n = 16), 'Cuti tahunan',                                    'Rejected', v_arjuna, 'Bentrok dengan jadwal rekrutmen massal, mohon geser ke bulan depan', 10),
    (v_yoga, 'Izin', (SELECT d FROM _wd WHERE n = 15), (SELECT d FROM _wd WHERE n = 15), 'Keperluan keluarga di Klaten',                    'Approved', v_dewi,   NULL, 3),
    (v_gita, 'Sakit', (SELECT d FROM _wd WHERE n = 14), (SELECT d FROM _wd WHERE n = 13), 'Tipes, surat dokter terlampir',                   'Approved', v_arjuna, NULL, 0),
    (v_surya, 'Izin', (SELECT d FROM _wd WHERE n = 9), (SELECT d FROM _wd WHERE n = 9), 'Mengurus perpanjangan SIM',                       'Approved', v_dewi,   NULL, 4),
    (v_laras, 'Sakit', (SELECT d FROM _wd WHERE n = 4), (SELECT d FROM _wd WHERE n = 4), 'Migrain, sudah periksa ke dokter',                'Approved', v_arjuna, NULL, 0),
    (v_rizky, 'Cuti',  v_mon + 7,  v_mon + 9,  'Menghadiri wisuda adik di Malang',                'Approved', v_arjuna, NULL, 9),
    (v_maya,  'Cuti',  v_mon + 10, v_mon + 11, 'Cuti tahunan, jadwal pengganti setelah rekrutmen', 'Approved', v_arjuna, NULL, 6),
    (v_fajar, 'Cuti',  v_mon + 14, v_mon + 18, 'Cuti tahunan, pulang kampung ke Padang',          'Pending',  NULL,     NULL, 14),
    (v_andi,  'Izin',  v_mon + 8,  v_mon + 8,  'Sidang skripsi di kampus',                        'Pending',  NULL,     NULL, 8),
    (v_citra, 'Izin',  v_mon + 9,  v_mon + 9,  'Kontrol ke dokter gigi',                          'Pending',  NULL,     NULL, 7)
  ) AS t(uid, type, s, e, reason, final, approver, note, filed_days_before);

  INSERT INTO t_leave_requests (user_id, type, start_date, end_date, reason, status, created_at, updated_at)
  SELECT uid, type, s, e, reason, 'Pending',
         LEAST(NOW() - INTERVAL '1 hour', (s - filed_days_before + TIME '09:15') AT TIME ZONE v_tz),
         LEAST(NOW() - INTERVAL '1 hour', (s - filed_days_before + TIME '09:15') AT TIME ZONE v_tz)
  FROM _seed_leave;

  UPDATE t_leave_requests l
     SET status = sl.final, approved_by = sl.approver, rejection_note = sl.note
    FROM _seed_leave sl
   WHERE l.user_id = sl.uid AND l.start_date = sl.s AND sl.final <> 'Pending';

  INSERT INTO t_overtime_business_trips (user_id, type, date, end_date, start_time, end_time, project_id, activity_description, status, created_at)
  SELECT o.uid, o.type, o.d, o.d + o.span, o.st, o.et,
         (SELECT id FROM m_projects WHERE project_code = o.code),
         o.activity, 'Pending',
         LEAST(NOW() - INTERVAL '1 hour', (o.d + 1 + TIME '09:00') AT TIME ZONE v_tz)
  FROM _seed_ot o;

  UPDATE t_overtime_business_trips t
     SET status = o.final, approved_by = o.approver, rejection_note = o.note
    FROM _seed_ot o
   WHERE t.user_id = o.uid AND t.date = o.d AND t.type = o.type
     AND o.final <> 'Pending';

  -- project_code NULL = generic task for the role, used when the day has no project
  -- or the role has no task written for that project.
  DROP TABLE IF EXISTS _seed_task_pool;
  CREATE TEMP TABLE _seed_task_pool ON COMMIT DROP AS
  SELECT role_title, project_code, descr FROM (VALUES
    ('Backend Developer', 'PRJ-001', 'Implementasi endpoint REST riwayat perjalanan armada'),
    ('Backend Developer', 'PRJ-001', 'Integrasi webhook GPS tracker vendor'),
    ('Backend Developer', 'PRJ-001', 'Perbaikan bug perhitungan jarak tempuh'),
    ('Backend Developer', 'PRJ-001', 'Optimasi query laporan bulanan armada'),
    ('Backend Developer', 'PRJ-002', 'Migrasi skema database HRIS ke Postgres'),
    ('Backend Developer', 'PRJ-002', 'Endpoint API pengajuan cuti HRIS'),
    ('Backend Developer', 'PRJ-002', 'Import data karyawan lama ke HRIS'),
    ('Backend Developer', NULL,      'Refactor service autentikasi ke rotasi JWT'),
    ('Backend Developer', NULL,      'Code review PR tim frontend'),
    ('Backend Developer', NULL,      'Unit test modul billing'),
    ('Frontend Developer', 'PRJ-001', 'Slicing halaman dashboard armada dari Figma'),
    ('Frontend Developer', 'PRJ-001', 'Implementasi peta live tracking dengan Leaflet'),
    ('Frontend Developer', 'PRJ-001', 'Perbaikan tabel laporan armada di layar mobile'),
    ('Frontend Developer', 'PRJ-001', 'Perbaikan bug filter tanggal di halaman laporan'),
    ('Frontend Developer', 'PRJ-002', 'Integrasi form cuti HRIS dengan API baru'),
    ('Frontend Developer', 'PRJ-002', 'Halaman profil karyawan HRIS'),
    ('Frontend Developer', 'PRJ-006', 'Slicing halaman company profile'),
    ('Frontend Developer', 'PRJ-006', 'Optimasi gambar dan SEO website'),
    ('Frontend Developer', NULL,      'Setup React Query dan caching data'),
    ('Frontend Developer', NULL,      'Aksesibilitas: label form dan navigasi keyboard'),
    ('Mobile Developer', 'PRJ-001', 'Aplikasi driver: notifikasi rute baru'),
    ('Mobile Developer', 'PRJ-001', 'Perbaikan crash aplikasi driver di Android 10'),
    ('Mobile Developer', 'PRJ-004', 'Mode offline untuk form survei lapangan'),
    ('Mobile Developer', 'PRJ-004', 'Sinkronisasi data survei ke server'),
    ('Mobile Developer', 'PRJ-004', 'Integrasi kamera dan geotag foto lapangan'),
    ('Mobile Developer', 'PRJ-004', 'Build dan distribusi APK survei ke tester'),
    ('Mobile Developer', NULL,      'Optimasi ukuran APK'),
    ('Mobile Developer', NULL,      'Upgrade versi SDK Android'),
    ('DevOps Engineer', 'PRJ-001', 'Dashboard monitoring server armada di Grafana'),
    ('DevOps Engineer', 'PRJ-001', 'Investigasi lonjakan CPU di server produksi'),
    ('DevOps Engineer', 'PRJ-001', 'Tuning autoscaling container'),
    ('DevOps Engineer', 'PRJ-003', 'Setup tile server peta gudang'),
    ('DevOps Engineer', 'PRJ-003', 'Rotasi sertifikat SSL domain klien'),
    ('DevOps Engineer', NULL,      'Setup pipeline CI/CD staging'),
    ('DevOps Engineer', NULL,      'Backup database terjadwal ke object storage'),
    ('DevOps Engineer', NULL,      'Hardening server produksi'),
    ('UI/UX Designer', 'PRJ-001', 'Mockup high-fidelity dashboard armada'),
    ('UI/UX Designer', 'PRJ-001', 'Usability test prototype dashboard dengan 5 responden'),
    ('UI/UX Designer', 'PRJ-003', 'Desain tampilan peta layout gudang'),
    ('UI/UX Designer', 'PRJ-003', 'Wireframe fitur pencarian rak'),
    ('UI/UX Designer', 'PRJ-006', 'Desain halaman beranda company profile'),
    ('UI/UX Designer', NULL,      'Design system: komponen tabel dan filter'),
    ('UI/UX Designer', NULL,      'Wireframe alur pengajuan cuti internal'),
    ('Graphic Designer', 'PRJ-004', 'Ikon kustom aplikasi survei'),
    ('Graphic Designer', 'PRJ-004', 'Ilustrasi empty state aplikasi survei'),
    ('Graphic Designer', 'PRJ-006', 'Aset banner website CV Kopi Nusantara'),
    ('Graphic Designer', 'PRJ-006', 'Revisi logo dan brand guideline klien'),
    ('Graphic Designer', NULL,      'Materi presentasi pitching PT Energi Prima'),
    ('Graphic Designer', NULL,      'Desain konten media sosial kantor'),
    ('QA Engineer', 'PRJ-001', 'Test case modul tracking armada'),
    ('QA Engineer', 'PRJ-001', 'Regresi rilis v2.3 dashboard armada'),
    ('QA Engineer', 'PRJ-002', 'Test case migrasi data HRIS'),
    ('QA Engineer', 'PRJ-003', 'Verifikasi peta gudang dengan data klien'),
    ('QA Engineer', 'PRJ-004', 'Uji lapangan aplikasi survei di Bandung'),
    ('QA Engineer', 'PRJ-004', 'Test sinkronisasi offline aplikasi survei'),
    ('QA Engineer', NULL,      'Automasi test E2E dengan Playwright'),
    ('QA Engineer', NULL,      'Verifikasi bug fix sprint berjalan'),
    ('HR Officer', 'PRJ-002', 'Mapping data karyawan untuk migrasi HRIS'),
    ('HR Officer', 'PRJ-002', 'Uji alur pengajuan cuti di HRIS baru'),
    ('HR Officer', NULL,      'Rekap absensi dan keterlambatan bulanan'),
    ('HR Officer', NULL,      'Screening CV kandidat frontend developer'),
    ('HR Officer', NULL,      'Wawancara kandidat QA engineer'),
    ('HR Officer', NULL,      'Onboarding karyawan baru'),
    ('HR Officer', NULL,      'Update data kontrak karyawan'),
    ('Finance & Payroll Lead', 'PRJ-002', 'Validasi modul payroll HRIS baru'),
    ('Finance & Payroll Lead', NULL,      'Rekonsiliasi pembayaran gaji bulan lalu'),
    ('Finance & Payroll Lead', NULL,      'Verifikasi klaim lembur dan perjalanan dinas'),
    ('Finance & Payroll Lead', NULL,      'Laporan PPh 21 bulanan'),
    ('Finance & Payroll Lead', NULL,      'Invoice termin 2 PT Sinar Logistik'),
    ('Finance & Payroll Lead', NULL,      'Pembayaran iuran BPJS Ketenagakerjaan'),
    ('Project Manager', 'PRJ-001', 'Rapat progres mingguan dengan PT Sinar Logistik'),
    ('Project Manager', 'PRJ-001', 'Menyusun BAST termin 1 Fleet Tracking'),
    ('Project Manager', 'PRJ-002', 'Pengumpulan requirement HRIS dengan klien'),
    ('Project Manager', 'PRJ-003', 'Koordinasi review klien Warehouse Mapping'),
    ('Project Manager', 'PRJ-004', 'Koordinasi UAT dengan Dishub Bandung'),
    ('Project Manager', 'PRJ-006', 'Serah terima website ke CV Kopi Nusantara'),
    ('Project Manager', NULL,      'Sprint planning dan grooming backlog'),
    ('Project Manager', NULL,      'Update timeline proyek dan risk register'),
    ('Project Manager', NULL,      'Proposal teknis PT Energi Prima'),
    ('Engineering Manager', 'PRJ-001', 'Review arsitektur modul notifikasi armada'),
    ('Engineering Manager', NULL,      'One-on-one dengan tim engineering'),
    ('Engineering Manager', NULL,      'Estimasi effort proyek Smart Meter'),
    ('Engineering Manager', NULL,      'Review perubahan skema database'),
    ('Engineering Manager', NULL,      'Interview teknis kandidat backend'),
    ('Engineering Manager', NULL,      'Standar code review tim'),
    ('GIS Analyst', 'PRJ-003', 'Digitasi batas gudang dari citra satelit'),
    ('GIS Analyst', 'PRJ-003', 'QC hasil digitasi batch 3'),
    ('GIS Analyst', 'PRJ-003', 'Konversi shapefile gudang ke GeoJSON'),
    ('GIS Analyst', 'PRJ-004', 'Validasi koordinat titik survei'),
    ('GIS Analyst', 'PRJ-004', 'Peta sebaran titik survei Bandung'),
    ('GIS Analyst', 'PRJ-007', 'Digitasi bidang tanah Sleman'),
    ('GIS Analyst', NULL,      'Merapikan basis data spasial internal'),
    ('Software Engineer Intern', 'PRJ-004', 'Mempelajari codebase modul survei'),
    ('Software Engineer Intern', 'PRJ-004', 'Perbaikan bug minor tampilan list survei'),
    ('Software Engineer Intern', NULL,      'Dokumentasi API internal'),
    ('Software Engineer Intern', NULL,      'Unit test helper tanggal'),
    ('Software Engineer Intern', NULL,      'Pair programming dengan mentor')
  ) AS p(role_title, project_code, descr);

  -- scope: 'any' | 'project' (needs some project) | a project code.
  -- problem is unique: the comments below join back on it to get the resolution.
  DROP TABLE IF EXISTS _seed_problem_pool;
  CREATE TEMP TABLE _seed_problem_pool ON COMMIT DROP AS
  SELECT * FROM (VALUES
    ('Backend Developer', 'PRJ-001', 'API vendor GPS sering timeout saat jam sibuk', 'Sudah pakai retry dan cache, timeout tidak muncul lagi.'),
    ('Backend Developer', 'any',     'Migrasi skema gagal di staging karena constraint lama', 'Constraint lama sudah di-drop, migrasi jalan normal.'),
    ('Backend Developer', 'project', 'Dokumentasi API dari klien tidak sesuai response aslinya', 'Klien sudah kirim dokumentasi revisi, sudah saya sesuaikan.'),
    ('Backend Developer', 'any',     'Query laporan lambat (>10 detik) di data produksi', 'Ditambah index komposit, sekarang di bawah 1 detik.'),
    ('Frontend Developer', 'project', 'Menunggu endpoint dari tim backend untuk integrasi', 'Endpoint sudah ada di staging, integrasi selesai.'),
    ('Frontend Developer', 'PRJ-001', 'Desain tabel laporan versi mobile belum final', 'Desain final dari Gita sudah masuk dan sudah diimplementasikan.'),
    ('Frontend Developer', 'any',     'Build gagal setelah update dependency', 'Versi dependency di-pin, build hijau lagi.'),
    ('Mobile Developer', 'any',     'Device uji Android 10 rusak, pinjam dari tim lain', 'Sudah dapat pinjaman device dari tim QA.'),
    ('Mobile Developer', 'PRJ-004', 'Sinkronisasi gagal di area sinyal lemah saat uji lapangan', 'Ditambah antrean retry offline, sinkronisasi sudah aman.'),
    ('Mobile Developer', 'any',     'Akun Play Console belum diberi akses rilis', 'Akses sudah diberikan, APK sudah naik ke internal testing.'),
    ('DevOps Engineer', 'any',     'Server staging down sejak pagi', 'Disk penuh karena log, sudah dibersihkan dan dipasang rotasi log.'),
    ('DevOps Engineer', 'project', 'Menunggu akses VPN dari klien', 'Akses VPN sudah diberikan klien.'),
    ('DevOps Engineer', 'any',     'Kuota object storage hampir penuh', 'Kuota sudah ditambah dan retensi backup diatur 30 hari.'),
    ('UI/UX Designer', 'project', 'Menunggu approval desain dari klien', 'Klien sudah approve dengan revisi minor.'),
    ('UI/UX Designer', 'any',     'Lisensi Figma tim habis, menunggu perpanjangan', 'Lisensi sudah diperpanjang Finance.'),
    ('UI/UX Designer', 'PRJ-001', 'Responden usability test banyak yang batal', 'Sudah jadwal ulang, 5 responden selesai dites.'),
    ('Graphic Designer', 'PRJ-006', 'Foto produk dari klien resolusinya rendah', 'Klien sudah kirim foto resolusi tinggi.'),
    ('Graphic Designer', 'PRJ-006', 'Revisi logo bolak-balik karena brief klien berubah', 'Brief final sudah disepakati di rapat.'),
    ('Graphic Designer', 'project', 'Feedback aset dari klien belum masuk', 'Feedback sudah masuk, revisi selesai.'),
    ('Graphic Designer', 'any',     'Font berlisensi untuk materi belum dibeli', 'Lisensi font sudah dibeli.'),
    ('QA Engineer', 'project', 'Data uji dari klien belum lengkap', 'Data uji lengkap sudah diterima.'),
    ('QA Engineer', 'any',     'Staging tidak stabil, test E2E sering gagal', 'Staging sudah stabil, test E2E jalan lagi.'),
    ('QA Engineer', 'project', 'Bug kritis belum di-fix, regresi tertunda', 'Fix sudah masuk, regresi lanjut dan lolos.'),
    ('HR Officer', 'any',     'Kandidat mundur di tahap offering', 'Kandidat cadangan sudah menerima offer.'),
    ('HR Officer', 'any',     'Data mesin fingerprint tidak sinkron', 'Mesin sudah disinkronkan ulang, data lengkap.'),
    ('HR Officer', 'PRJ-002', 'Format data karyawan dari klien berbeda dengan template', 'Mapping kolom sudah disepakati dengan klien.'),
    ('Finance & Payroll Lead', 'any', 'Klaim lembur belum dilengkapi bukti pendukung', 'Bukti sudah dilengkapi karyawan terkait.'),
    ('Finance & Payroll Lead', 'any', 'Pembayaran termin PT Sinar Logistik terlambat', 'Pembayaran termin sudah masuk rekening.'),
    ('Finance & Payroll Lead', 'any', 'Selisih rekonsiliasi gaji dengan mutasi bank', 'Selisih dari biaya transfer, sudah dijurnal.'),
    ('Project Manager', 'project', 'Spesifikasi berubah setelah rapat klien', 'Change request sudah ditandatangani klien.'),
    ('Project Manager', 'project', 'Jadwal UAT mundur karena tim klien belum siap', 'Jadwal UAT baru sudah disepakati.'),
    ('Project Manager', 'project', 'Dokumen BAST menunggu tanda tangan direksi klien', 'BAST sudah ditandatangani.'),
    ('Project Manager', 'any',     'Jadwal rapat bentrok dengan beberapa klien', 'Jadwal sudah diatur ulang.'),
    ('Engineering Manager', 'any', 'Kapasitas tim backend penuh untuk sprint ini', 'Sebagian task dipindah ke sprint berikutnya.'),
    ('Engineering Manager', 'any', 'Belum ada kandidat backend yang lolos tes teknis', 'Satu kandidat lolos, lanjut user interview.'),
    ('GIS Analyst', 'PRJ-003', 'Citra satelit area gudang tertutup awan', 'Pakai citra bulan lalu yang lebih bersih.'),
    ('GIS Analyst', 'PRJ-004', 'Banyak koordinat titik survei dari lapangan meleset', 'Titik yang meleset sudah divalidasi ulang dengan tim lapangan.'),
    ('GIS Analyst', 'any',     'Lisensi software GIS habis', 'Sementara pakai QGIS sampai lisensi diperpanjang.'),
    ('Software Engineer Intern', 'any', 'Belum dapat akses repo dan staging', 'Akses sudah diberikan Mas Fajar.'),
    ('Software Engineer Intern', 'any', 'Environment lokal error saat setup', 'Beres setelah pair dengan mentor.')
  ) AS p(role_title, scope, problem, resolution);

  INSERT INTO t_daily_tasks (date, employee_id, project_id, task_desc, progress_pct, problem_desc, is_resolved, created_at)
  SELECT
    a.date,
    e.id,
    proj.id,
    pool.descr,
    -- An open blocker never sits on a finished task.
    CASE WHEN prob.problem IS NOT NULL AND NOT st.resolved THEN LEAST(pg.v, 70) ELSE pg.v END,
    prob.problem,
    prob.problem IS NOT NULL AND st.resolved,
    CASE WHEN a.date < v_today
         THEN (a.date + TIME '15:30' + make_interval(mins => (k.k * 20 + h.h % 60)::INT)) AT TIME ZONE v_tz
         ELSE NOW() - make_interval(mins => (5 + h.h % 300)::INT) END
  FROM t_attendance a
  JOIN profiles pr ON pr.id = a.user_id
  JOIN m_employees e ON e.id = pr.employee_id
  CROSS JOIN generate_series(1, 5) AS k(k)
  CROSS JOIN LATERAL (SELECT public.demo_hash(a.user_id::TEXT || a.date::TEXT || k.k) AS h) h
  CROSS JOIN LATERAL (SELECT a.date < v_today - 3 AND h.h % 3 <> 0 AS resolved) st
  LEFT JOIN LATERAL (
    SELECT p.id, p.project_code, p.start_date, p.end_date,
           p.status_id = (SELECT id FROM m_work_status WHERE status_name = 'Done') AS done
    FROM m_projects p
    JOIN m_project_members mm ON mm.project_id = p.id AND mm.user_id = a.user_id
    WHERE a.date BETWEEN p.start_date AND p.end_date
    ORDER BY public.demo_hash(p.project_code || a.date::TEXT || k.k)
    LIMIT 1
  ) proj ON TRUE
  JOIN LATERAL (
    SELECT tp.descr FROM _seed_task_pool tp
    WHERE tp.role_title = e.role_title
      AND tp.project_code IS NOT DISTINCT FROM (
            SELECT proj.project_code WHERE EXISTS (
              SELECT 1 FROM _seed_task_pool x
              WHERE x.role_title = e.role_title AND x.project_code = proj.project_code))
    ORDER BY public.demo_hash(tp.descr || h.h::TEXT)
    LIMIT 1
  ) pool ON TRUE
  CROSS JOIN LATERAL (SELECT CASE
      WHEN proj.id IS NULL AND a.date < v_today - 3 THEN LEAST(100, 60 + (h.h % 5) * 10)
      WHEN proj.id IS NULL THEN 20 + (h.h % 8) * 10
      WHEN proj.done THEN 100
      ELSE LEAST(100, GREATEST(10,
             (round(10.0 * (a.date - proj.start_date + 1) / (proj.end_date - proj.start_date + 1)) * 10)::INT
             + (h.h % 3 - 1) * 10))
    END AS v) pg
  LEFT JOIN LATERAL (
    SELECT pp.problem FROM _seed_problem_pool pp
    WHERE h.h % 29 = 0
      AND pp.role_title = e.role_title
      AND (pp.scope = 'any'
           OR (pp.scope = 'project' AND proj.id IS NOT NULL)
           OR pp.scope = proj.project_code)
    ORDER BY public.demo_hash(pp.problem || a.date::TEXT || k.k)
    LIMIT 1
  ) prob ON TRUE
  WHERE a.status = 'Hadir'
    AND k.k <= 1 + (public.demo_hash(a.user_id::TEXT || a.date::TEXT) % 3)
             + CASE WHEN public.demo_hash(a.date::TEXT || a.user_id::TEXT) % 7 = 0 THEN 2 ELSE 0 END
    AND (a.date < v_today OR k.k = 1);

  -- Follow-ups land the next workday in office hours; the owner closes resolved issues.
  INSERT INTO t_task_comments (task_id, user_id, comment, mentions, created_at)
  SELECT t.id, c.uid, c.body, c.mentions, c.at
  FROM t_daily_tasks t
  JOIN profiles owner ON owner.employee_id = t.employee_id
  JOIN _seed_problem_pool pp ON pp.problem = t.problem_desc
  CROSS JOIN LATERAL (SELECT
      CASE WHEN owner.id = v_dewi THEN v_arjuna ELSE v_dewi END AS uid,
      COALESCE(
        ((SELECT d FROM _wd WHERE d > t.date ORDER BY d LIMIT 1)
          + TIME '09:00' + make_interval(mins => (t.id % 90)::INT)) AT TIME ZONE v_tz,
        t.created_at + INTERVAL '40 minutes') AS at) r
  CROSS JOIN LATERAL (VALUES
    (r.uid,
     CASE
       WHEN r.uid = v_arjuna THEN '@Dewi Ratna kalau perlu eskalasi ke manajemen klien kabari saya ya.'
       WHEN t.id % 3 = 0 AND t.project_id IS NOT NULL THEN 'Sudah saya sampaikan ke PIC klien, nanti saya kabari di sini.'
       WHEN t.id % 3 = 0 THEN 'Noted, saya bantu follow up.'
       WHEN t.id % 3 = 1 THEN 'Saya masukkan ke agenda rapat mingguan. cc @Arjuna Wijaya'
       ELSE '@' || owner.full_name || ' kabari di sini kalau sudah ada update ya.' END,
     CASE
       WHEN r.uid = v_arjuna THEN ARRAY[v_dewi]
       WHEN t.id % 3 = 0 THEN '{}'::UUID[]
       WHEN t.id % 3 = 1 THEN ARRAY[v_arjuna]
       ELSE ARRAY[owner.id] END,
     r.at,
     TRUE),
    (v_arjuna, 'Kalau besok belum beres, kita cari workaround dulu.', '{}'::UUID[],
     r.at + INTERVAL '2 hours',
     NOT t.is_resolved AND t.id % 2 = 0 AND v_arjuna NOT IN (owner.id, r.uid)),
    (owner.id, pp.resolution, '{}'::UUID[],
     r.at + INTERVAL '5 hours',
     t.is_resolved)
  ) AS c(uid, body, mentions, at, keep)
  WHERE c.keep AND c.at < NOW();

  -- The trigger stamps mention notifications with the comment time, so back-dated ones aren't "just now".

  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', v_laras, 'role', 'authenticated')::TEXT, true);

  FOR m IN SELECT gs::DATE AS period FROM generate_series(v_start::TIMESTAMP, date_trunc('month', v_today)::TIMESTAMP, INTERVAL '1 month') gs LOOP
    v_run := public.generate_payroll_run(m.period);

    UPDATE t_payroll_lines l
       SET bpjs  = ROUND(l.base_salary * 0.03) + ROUND(LEAST(l.base_salary, 12000000) * 0.01),
           pph21 = ROUND(l.gross * CASE
                     WHEN l.gross <=  5400000 THEN 0
                     WHEN l.gross <=  7500000 THEN 0.0075
                     WHEN l.gross <= 10350000 THEN 0.02
                     WHEN l.gross <= 13750000 THEN 0.04
                     WHEN l.gross <= 16950000 THEN 0.07
                     ELSE 0.09 END)
     WHERE l.run_id = v_run;

    UPDATE t_payroll_lines
       SET other_deduction = 750000, deduction_note = 'Cicilan kasbon (' ||
             CASE WHEN m.period = v_start THEN '1' ELSE '2' END || '/2)'
     WHERE run_id = v_run AND user_id = v_rizky AND m.period < date_trunc('month', v_today);

    IF m.period < date_trunc('month', v_today) THEN
      UPDATE t_payroll_runs SET status = 'Finalized', note = 'Disetujui direksi'
       WHERE id = v_run;
      UPDATE t_payroll_runs
         SET finalized_at = ((m.period + 23) + TIME '16:00') AT TIME ZONE v_tz
       WHERE id = v_run;
      UPDATE t_payroll_lines SET payment_status = 'Paid' WHERE run_id = v_run;
      UPDATE t_payroll_lines
         SET paid_at = ((m.period + 24) + TIME '10:00') AT TIME ZONE v_tz
       WHERE run_id = v_run;
    ELSE
      UPDATE t_payroll_runs SET note = CASE WHEN v_pending > 0 THEN 'Draft, menunggu klaim lembur yang masih pending' ELSE 'Draft' END
       WHERE id = v_run;
    END IF;

    UPDATE t_payroll_runs
       SET created_at = LEAST(NOW() - INTERVAL '1 hour', ((m.period + 20) + TIME '09:00') AT TIME ZONE v_tz)
     WHERE id = v_run;
  END LOOP;

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  SELECT id INTO v_general FROM t_chat_channels WHERE type = 'general';

  INSERT INTO t_chat_channels (type, project_id, name, created_at)
  SELECT 'project', p.id, n.name, NOW() - INTERVAL '40 days'
  FROM m_projects p
  JOIN (VALUES ('PRJ-001', 'design'), ('PRJ-001', 'bugs'), ('PRJ-004', 'lapangan')) AS n(code, name)
    ON n.code = p.project_code;

  INSERT INTO t_chat_channels (type, dm_user_a, dm_user_b, created_at)
  SELECT 'dm', LEAST(a, b), GREATEST(a, b), NOW() - INTERVAL '30 days'
  FROM (VALUES (v_arjuna, v_dewi), (v_dewi, v_bima), (v_maya, v_citra), (v_laras, v_arjuna), (v_gita, v_rizky)) AS d(a, b);

  UPDATE _seed_msg s
     SET mentions = COALESCE((
       SELECT array_agg(p.id) FROM profiles p
       WHERE p.full_name IS NOT NULL AND s.body LIKE '%@' || p.full_name || '%'), '{}')
   WHERE s.mentions IS NULL;

  DROP TABLE IF EXISTS _seed_msg_id;
  CREATE TEMP TABLE _seed_msg_id (k INT PRIMARY KEY, id BIGINT) ON COMMIT DROP;

  FOR m IN SELECT * FROM _seed_msg ORDER BY k LOOP
    v_ch := CASE
      WHEN m.ch = 'general' THEN v_general
      WHEN m.ch LIKE 'dm:%' THEN (
        SELECT c.id FROM t_chat_channels c
        JOIN profiles a ON a.id = c.dm_user_a
        JOIN profiles b ON b.id = c.dm_user_b
        WHERE c.type = 'dm'
          AND lower(split_part(a.full_name, ' ', 1)) IN (split_part(m.ch, ':', 2), split_part(m.ch, ':', 3))
          AND lower(split_part(b.full_name, ' ', 1)) IN (split_part(m.ch, ':', 2), split_part(m.ch, ':', 3)))
      ELSE (
        SELECT c.id FROM t_chat_channels c
        JOIN m_projects p ON p.id = c.project_id
        WHERE c.type = 'project'
          AND p.project_code = split_part(m.ch, '#', 1)
          AND c.name IS NOT DISTINCT FROM NULLIF(split_part(m.ch, '#', 2), ''))
    END;

    INSERT INTO t_chat_messages (
      channel_id, sender_id, body, reply_to_id, mentions, mentions_everyone,
      forwarded_from_sender_name, created_at, edited_at, pinned_at, pinned_by
    ) VALUES (
      v_ch, m.sender, m.body,
      (SELECT id FROM _seed_msg_id WHERE k = m.reply),
      m.mentions, m.everyone, m.fwd,
      LEAST(NOW() - INTERVAL '5 minutes', (m.d + m.at) AT TIME ZONE v_tz),
      CASE WHEN m.edited THEN LEAST(NOW(), (m.d + m.at + INTERVAL '4 minutes') AT TIME ZONE v_tz) END,
      CASE WHEN m.pinned_by IS NOT NULL THEN LEAST(NOW(), (m.d + m.at + INTERVAL '30 minutes') AT TIME ZONE v_tz) END,
      m.pinned_by
    ) RETURNING id INTO v_msg_id;

    INSERT INTO _seed_msg_id VALUES (m.k, v_msg_id);
  END LOOP;

  INSERT INTO t_chat_attachments (message_id, file_path, file_name, file_type, file_size, created_at)
  SELECT i.id, a.path, a.name, a.type, a.size, msg.created_at
  FROM (VALUES
    (30, '/demo/dashboard-armada-v3.png',               'Dashboard Armada v3.png',              'image/png',       94859),
    (35, '/demo/bug-filter-tanggal-wita.png',           'bug-filter-tanggal.png',               'image/png',       53794),
    (27, '/demo/cpu-prod-api-01.png',                   'grafana-cpu-prod-api-01.png',          'image/png',       35873),
    (43, '/demo/titik-survei-bandung.png',              'titik-survei-bandung.png',             'image/png',       101122),
    (45, '/demo/titik-survei-bandung.png',              'titik-survei-bandung.png',             'image/png',       101122),
    (50, '/demo/notulen-rapat-warehouse-mapping.pdf',   'Notulen Rapat Warehouse Mapping.pdf',  'application/pdf', 30430),
    (16, '/demo/poster-makan-siang-bersama.jpg',        'poster-makan-siang.jpg',               'image/jpeg',      87699),
    (18, '/demo/townhall-1.png',                         'Townhall - 1.png',                       'image/png',      260543),
    (18, '/demo/townhall-2.png',                         'Townhall - 2.png',                       'image/png',       53268),
    (18, '/demo/townhall-3.png',                         'Townhall - 3.png',                       'image/png',       45366),
    (18, '/demo/townhall-4.png',                         'Townhall - 4.png',                       'image/png',       60112)
  ) AS a(k, path, name, type, size)
  JOIN _seed_msg_id i ON i.k = a.k
  JOIN t_chat_messages msg ON msg.id = i.id;

  INSERT INTO t_chat_message_reactions (message_id, user_id, emoji, created_at)
  SELECT i.id, r.uid, r.emoji, LEAST(NOW(), msg.created_at + INTERVAL '10 minutes')
  FROM (VALUES
    (2, v_bima, '👍'), (2, v_gita, '👍'), (2, v_surya, '👍'), (2, v_nadia, '👌'),
    (18, v_dewi, '🔥'), (18, v_laras, '👏'), (18, v_bima, '👏'), (18, v_surya, '🔥'),
    (6, v_bima, '🙏'), (6, v_rizky, '🙏'), (6, v_citra, '❤️'),
    (7, v_arjuna, '🎉'), (7, v_bima, '🎉'), (7, v_rizky, '🎉'), (7, v_fajar, '🔥'), (7, v_surya, '🎉'),
    (11, v_maya, '👋'), (11, v_dewi, '👋'), (11, v_nadia, '👋'), (11, v_gita, '❤️'),
    (16, v_citra, '😋'), (16, v_andi, '😋'), (16, v_bima, '👍'),
    (24, v_dewi, '🙏'), (24, v_arjuna, '👍'),
    (30, v_rizky, '🔥'), (30, v_dewi, '👍'),
    (38, v_rizky, '🙌'),
    (43, v_dewi, '👍'),
    (68, v_gita, '👍')
  ) AS r(k, uid, emoji)
  JOIN _seed_msg_id i ON i.k = r.k
  JOIN t_chat_messages msg ON msg.id = i.id;

  INSERT INTO t_chat_channel_reads (channel_id, user_id, last_read_at)
  SELECT c.id, pr.id, NOW() - make_interval(hours => (2 + public.demo_hash(c.id::TEXT || pr.id::TEXT) % 30)::INT)
  FROM t_chat_channels c
  CROSS JOIN profiles pr
  WHERE NOT pr.is_superadmin
    AND public.chat_user_can_read(c.id, pr.id)
  ON CONFLICT (channel_id, user_id) DO NOTHING;

  UPDATE t_notifications n
     SET created_at = msg.created_at
    FROM t_chat_messages msg
   WHERE n.link = '/chat?channel=' || msg.channel_id
     AND n.body = left(msg.body, 140);

  UPDATE t_notifications n
     SET created_at = LEAST(NOW() - INTERVAL '1 minute', l.created_at + INTERVAL '5 hours')
    FROM t_leave_requests l
   WHERE n.link = '/leave' AND n.user_id = l.user_id
     AND n.body LIKE '%' || to_char(l.start_date, 'DD Mon YYYY') || '%';

  UPDATE t_notifications n
     SET created_at = LEAST(NOW() - INTERVAL '1 minute', o.created_at + INTERVAL '4 hours')
    FROM t_overtime_business_trips o
   WHERE n.link = '/overtime' AND n.user_id = o.user_id
     AND n.body LIKE '%' || o.type || '%' || to_char(o.date, 'DD Mon YYYY') || '%';

  UPDATE t_notifications SET is_read = TRUE WHERE created_at < NOW() - INTERVAL '2 days';

  DELETE FROM t_audit_log WHERE TRUE;

  INSERT INTO t_audit_log (actor_id, action, entity_type, entity_id, detail, created_at)
  SELECT COALESCE(a.updated_by, a.user_id), 'insert', 'attendance', a.id::TEXT,
         jsonb_build_object('after', to_jsonb(a) - 'clock_out' || jsonb_build_object('clock_out', NULL)),
         (a.date + COALESCE(a.clock_in, TIME '08:05')) AT TIME ZONE v_tz
  FROM t_attendance a
  WHERE a.status IN ('Hadir', 'Sakit', 'Izin', 'Alpa');

  INSERT INTO t_audit_log (actor_id, action, entity_type, entity_id, detail, created_at)
  SELECT COALESCE(a.updated_by, a.user_id), 'update', 'attendance', a.id::TEXT,
         jsonb_build_object('before', to_jsonb(a) - 'clock_out' || jsonb_build_object('clock_out', NULL),
                            'after',  to_jsonb(a)),
         (a.date + a.clock_out) AT TIME ZONE v_tz
  FROM t_attendance a
  WHERE a.clock_out IS NOT NULL;

  INSERT INTO t_audit_log (actor_id, action, entity_type, entity_id, detail, created_at)
  SELECT e.id, 'create', 'daily_task', t.id::TEXT,
         jsonb_build_object('task_desc', t.task_desc, 'progress_pct', t.progress_pct),
         t.created_at
  FROM t_daily_tasks t
  JOIN profiles e ON e.employee_id = t.employee_id;

  INSERT INTO t_audit_log (actor_id, action, entity_type, entity_id, detail, created_at)
  SELECT l.user_id, 'insert', 'leave', l.id::TEXT,
         jsonb_build_object('after', to_jsonb(l) || jsonb_build_object('status', 'Pending', 'approved_by', NULL, 'rejection_note', NULL)),
         l.created_at
  FROM t_leave_requests l;

  INSERT INTO t_audit_log (actor_id, action, entity_type, entity_id, detail, created_at)
  SELECT l.approved_by, 'update', 'leave', l.id::TEXT,
         jsonb_build_object('before', to_jsonb(l) || jsonb_build_object('status', 'Pending', 'approved_by', NULL, 'rejection_note', NULL),
                            'after', to_jsonb(l)),
         LEAST(NOW(), l.created_at + INTERVAL '5 hours')
  FROM t_leave_requests l WHERE l.status <> 'Pending';

  INSERT INTO t_audit_log (actor_id, action, entity_type, entity_id, detail, created_at)
  SELECT o.user_id, 'insert', 'overtime', o.id::TEXT,
         jsonb_build_object('after', to_jsonb(o) || jsonb_build_object('status', 'Pending', 'approved_by', NULL, 'rejection_note', NULL)),
         o.created_at
  FROM t_overtime_business_trips o;

  INSERT INTO t_audit_log (actor_id, action, entity_type, entity_id, detail, created_at)
  SELECT o.approved_by, 'update', 'overtime', o.id::TEXT,
         jsonb_build_object('before', to_jsonb(o) || jsonb_build_object('status', 'Pending', 'approved_by', NULL, 'rejection_note', NULL),
                            'after', to_jsonb(o)),
         LEAST(NOW(), o.created_at + INTERVAL '4 hours')
  FROM t_overtime_business_trips o WHERE o.status <> 'Pending';

  INSERT INTO t_audit_log (actor_id, action, entity_type, entity_id, detail, created_at)
  SELECT v_laras, 'insert', 'payroll_run', r.id::TEXT, jsonb_build_object('after', to_jsonb(r) || jsonb_build_object('status', 'Draft')), r.created_at
  FROM t_payroll_runs r
  UNION ALL
  SELECT v_laras, 'update', 'payroll_run', r.id::TEXT,
         jsonb_build_object('before', to_jsonb(r) || jsonb_build_object('status', 'Draft', 'finalized_at', NULL, 'finalized_by', NULL),
                            'after', to_jsonb(r)),
         r.finalized_at
  FROM t_payroll_runs r WHERE r.status = 'Finalized';

  INSERT INTO t_audit_log (actor_id, action, entity_type, entity_id, detail, created_at)
  SELECT v_maya, 'create', 'employee', e.id::TEXT,
         jsonb_build_object('full_name', e.full_name, 'role_title', e.role_title, 'employment_type', e.employment_type),
         e.created_at
  FROM m_employees e WHERE e.join_date >= v_start
  UNION ALL
  SELECT v_arjuna, 'insert', 'access_override', o.id::TEXT,
         jsonb_build_object('after', to_jsonb(o)), NOW() - INTERVAL '20 days'
  FROM t_user_access_override o
  UNION ALL
  SELECT v_dewi, 'create', 'project', p.id::TEXT,
         jsonb_build_object('project_code', p.project_code, 'project_name', p.project_name, 'client', p.client),
         p.created_at
  FROM m_projects p WHERE p.created_at >= v_start;

  UPDATE m_work_schedule
     SET locked_until = (v_start + INTERVAL '1 month' - INTERVAL '1 day')::DATE
   WHERE TRUE;

  RETURN jsonb_build_object('seeded', TRUE, 'password', v_password);
END;
$seed$;
