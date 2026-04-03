-- Storage policies for session-transcripts bucket
-- Run AFTER creating the bucket in Supabase Storage UI

-- Allow coaches to upload transcripts for their clients
CREATE POLICY "coach_upload_transcripts"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'session-transcripts'
  AND EXISTS (
    SELECT 1 FROM businesses b
    WHERE b.assigned_coach_id = auth.uid()
  )
);

-- Allow coaches to view/download transcripts for their clients
CREATE POLICY "coach_view_transcripts"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'session-transcripts'
  AND EXISTS (
    SELECT 1 FROM businesses b
    WHERE b.assigned_coach_id = auth.uid()
  )
);

-- Allow business owners to view their transcripts
CREATE POLICY "business_owner_view_transcripts"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'session-transcripts'
  AND EXISTS (
    SELECT 1 FROM businesses b
    WHERE b.owner_id = auth.uid()
  )
);

-- Allow business users to view transcripts
CREATE POLICY "business_user_view_transcripts"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'session-transcripts'
  AND EXISTS (
    SELECT 1 FROM business_users bu
    WHERE bu.user_id = auth.uid()
  )
);

-- Allow coaches to delete transcripts they uploaded
CREATE POLICY "coach_delete_transcripts"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'session-transcripts'
  AND EXISTS (
    SELECT 1 FROM businesses b
    WHERE b.assigned_coach_id = auth.uid()
  )
);
