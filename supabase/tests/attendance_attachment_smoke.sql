-- Smoke test for the attendance attachment migrations.
-- Needs the same test.uid / test.role auth shim as security_smoke.sql.
--   psql -d <scratch> -v ON_ERROR_STOP=1 -f supabase/tests/attendance_attachment_smoke.sql
-- Prints "ALL CHECKS PASSED" and rolls nothing back, so use a throwaway DB.

\set ON_ERROR_STOP on

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000000b1', 'att-emp1@test.local'),
  ('00000000-0000-0000-0000-0000000000b2', 'att-emp2@test.local'),
  ('00000000-0000-0000-0000-0000000000ba', 'att-admin@test.local'),
  ('00000000-0000-0000-0000-0000000000bd', 'att-deleter@test.local');

SELECT set_config('test.role', 'service_role', false);
UPDATE profiles SET role_id = (SELECT id FROM m_roles WHERE role_name = 'Employee')
 WHERE id IN ('00000000-0000-0000-0000-0000000000b1',
              '00000000-0000-0000-0000-0000000000b2',
              '00000000-0000-0000-0000-0000000000bd');
UPDATE profiles SET role_id = (SELECT id FROM m_roles WHERE role_name = 'Admin')
 WHERE id = '00000000-0000-0000-0000-0000000000ba';
SELECT set_config('test.role', '', false);

-- May delete attendance but not edit it.
INSERT INTO t_user_access_override
  (user_id, feature_id, can_create, can_read, can_update, can_delete, is_override_active)
SELECT '00000000-0000-0000-0000-0000000000bd', id, false, true, false, true, true
  FROM m_features WHERE feature_key = 'attendance';

INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES
  ('attendance-attachments', '00000000-0000-0000-0000-0000000000b1/keep.pdf', '00000000-0000-0000-0000-0000000000b1'),
  ('attendance-attachments', '00000000-0000-0000-0000-0000000000b1/by-admin.pdf', '00000000-0000-0000-0000-0000000000b1'),
  ('attendance-attachments', '00000000-0000-0000-0000-0000000000b1/by-deleter.pdf', '00000000-0000-0000-0000-0000000000b1');

-- What the Storage API sets before its own DELETE; RLS still decides.
SELECT set_config('storage.allow_delete_query', 'true', false);

DO $$
DECLARE
  v_count INT;
BEGIN
  -- 1. Izin / Sakit without a note is refused, with one it goes in
  SET LOCAL ROLE authenticated;
  PERFORM set_config('test.uid', '00000000-0000-0000-0000-0000000000b1', true);
  PERFORM set_config('test.role', 'authenticated', true);
  BEGIN
    INSERT INTO t_attendance (user_id, date, status, note)
    VALUES ('00000000-0000-0000-0000-0000000000b1', CURRENT_DATE, 'Sakit', '   ');
    RESET ROLE;
    RAISE EXCEPTION 'FAIL 1a: Sakit saved with a blank note';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  INSERT INTO t_attendance (user_id, date, status, note, attachment_path, attachment_name)
  VALUES ('00000000-0000-0000-0000-0000000000b1', CURRENT_DATE, 'Izin', 'Urus KTP',
          '00000000-0000-0000-0000-0000000000b1/keep.pdf', 'surat.pdf');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RESET ROLE;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL 1b: Izin with a note was refused';
  END IF;

  -- 2. Uploads only into your own folder
  SET LOCAL ROLE authenticated;
  INSERT INTO storage.objects (bucket_id, name, owner_id)
  VALUES ('attendance-attachments', '00000000-0000-0000-0000-0000000000b1/own.pdf',
          '00000000-0000-0000-0000-0000000000b1');
  BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner_id)
    VALUES ('attendance-attachments', '00000000-0000-0000-0000-0000000000b2/forged.pdf',
            '00000000-0000-0000-0000-0000000000b1');
    RESET ROLE;
    RAISE EXCEPTION 'FAIL 2: uploaded into another user''s folder';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  RESET ROLE;

  -- 3. Another employee can see it (attendance.read) but not delete it
  SET LOCAL ROLE authenticated;
  PERFORM set_config('test.uid', '00000000-0000-0000-0000-0000000000b2', true);
  SELECT COUNT(*) INTO v_count FROM storage.objects
   WHERE name = '00000000-0000-0000-0000-0000000000b1/keep.pdf';
  IF v_count <> 1 THEN
    RESET ROLE;
    RAISE EXCEPTION 'FAIL 3a: an attendance reader cannot open the attachment';
  END IF;
  DELETE FROM storage.objects WHERE name = '00000000-0000-0000-0000-0000000000b1/keep.pdf';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RESET ROLE;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL 3b: another employee deleted someone''s attachment';
  END IF;

  -- 4. Admin (update + delete) and a delete-only user may remove it
  SET LOCAL ROLE authenticated;
  PERFORM set_config('test.uid', '00000000-0000-0000-0000-0000000000ba', true);
  DELETE FROM storage.objects WHERE name = '00000000-0000-0000-0000-0000000000b1/by-admin.pdf';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RESET ROLE;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL 4a: an admin cannot delete an attachment';
  END IF;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('test.uid', '00000000-0000-0000-0000-0000000000bd', true);
  DELETE FROM storage.objects WHERE name = '00000000-0000-0000-0000-0000000000b1/by-deleter.pdf';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RESET ROLE;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL 4b: attendance.delete alone cannot remove the attachment';
  END IF;

  -- 5. The owner may remove their own file
  SET LOCAL ROLE authenticated;
  PERFORM set_config('test.uid', '00000000-0000-0000-0000-0000000000b1', true);
  DELETE FROM storage.objects WHERE name = '00000000-0000-0000-0000-0000000000b1/own.pdf';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RESET ROLE;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL 5: the owner cannot delete their own attachment';
  END IF;

  RAISE NOTICE 'ALL CHECKS PASSED';
END;
$$;
