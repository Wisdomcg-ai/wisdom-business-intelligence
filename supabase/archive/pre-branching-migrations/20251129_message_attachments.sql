-- Add attachment support to messages
-- This migration adds columns to store file attachment metadata

-- Add attachment columns to messages table
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS attachment_url TEXT,
ADD COLUMN IF NOT EXISTS attachment_name TEXT,
ADD COLUMN IF NOT EXISTS attachment_size INTEGER,
ADD COLUMN IF NOT EXISTS attachment_type TEXT;

-- Create storage bucket for message attachments (run this in Supabase dashboard or via API)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('message-attachments', 'message-attachments', false);

-- Storage policies for message-attachments bucket
-- These need to be run after the bucket is created

-- Policy: Users can upload to their own business folder
-- CREATE POLICY "Users can upload message attachments" ON storage.objects
-- FOR INSERT WITH CHECK (
--   bucket_id = 'message-attachments' AND
--   auth.role() = 'authenticated'
-- );

-- Policy: Users can view attachments from their business
-- CREATE POLICY "Users can view message attachments" ON storage.objects
-- FOR SELECT USING (
--   bucket_id = 'message-attachments' AND
--   auth.role() = 'authenticated'
-- );

-- Policy: Users can delete their own uploads
-- CREATE POLICY "Users can delete own attachments" ON storage.objects
-- FOR DELETE USING (
--   bucket_id = 'message-attachments' AND
--   auth.uid()::text = (storage.foldername(name))[1]
-- );

COMMENT ON COLUMN messages.attachment_url IS 'URL to the attached file in storage';
COMMENT ON COLUMN messages.attachment_name IS 'Original filename of the attachment';
COMMENT ON COLUMN messages.attachment_size IS 'File size in bytes';
COMMENT ON COLUMN messages.attachment_type IS 'MIME type of the attachment';
