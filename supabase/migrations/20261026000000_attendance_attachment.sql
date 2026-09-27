-- Izin / Sakit must say why; a supporting file (letter, photo) is optional.
ALTER TABLE public.t_attendance
  ADD COLUMN attachment_path text,
  ADD COLUMN attachment_name text;

-- NOT VALID: old rows without a note stay, every new write is checked.
ALTER TABLE public.t_attendance
  ADD CONSTRAINT attendance_note_required
  CHECK (status NOT IN ('Izin', 'Sakit') OR btrim(COALESCE(note, '')) <> '') NOT VALID;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
  ('attendance-attachments', 'attendance-attachments', false, 10485760, ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
ON CONFLICT (id) DO NOTHING;

-- Uploads land in the uploader's own folder: <auth.uid()>/<uuid>.<ext>.
CREATE POLICY attendance_attachments_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'attendance-attachments' AND (auth.uid())::text = (storage.foldername(name))[1]);
CREATE POLICY attendance_attachments_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'attendance-attachments'
    AND ((auth.uid())::text = (storage.foldername(name))[1] OR public.has_permission('attendance', 'read')));
CREATE POLICY attendance_attachments_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'attendance-attachments'
    AND (owner_id = (auth.uid())::text OR public.has_permission('attendance', 'update')));
