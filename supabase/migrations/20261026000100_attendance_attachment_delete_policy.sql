-- Whoever may delete an attendance row may also delete its attachment.
DROP POLICY IF EXISTS attendance_attachments_delete ON storage.objects;
CREATE POLICY attendance_attachments_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'attendance-attachments'
    AND (owner_id = (auth.uid())::text
      OR public.has_permission('attendance', 'update')
      OR public.has_permission('attendance', 'delete')));
