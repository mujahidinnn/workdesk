-- Lets uploaders delete their own attachment files when a message is deleted.
DROP POLICY IF EXISTS chat_attachments_storage_delete ON storage.objects;
CREATE POLICY chat_attachments_storage_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'chat-attachments' AND owner_id = (auth.uid())::text);
