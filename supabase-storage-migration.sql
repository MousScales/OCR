-- Add file_path column to store Supabase Storage path
-- Run this in Supabase SQL Editor

ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS file_path TEXT;

-- Create index for file_path
CREATE INDEX IF NOT EXISTS idx_documents_file_path ON documents(file_path);

-- Note: You'll also need to create a Storage bucket named 'documents' in Supabase
-- Go to Storage -> Create Bucket -> Name: 'documents' -> Public: Yes

