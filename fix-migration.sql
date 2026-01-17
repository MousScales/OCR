-- ============================================
-- FIX: Add missing file_path column
-- ============================================
-- Run this if you get "column file_path does not exist" error
-- ============================================

-- Add file_path column if it doesn't exist
ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS file_path TEXT;

-- Create index for file_path if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_documents_file_path ON documents(file_path);

-- Verify the column was added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'documents' AND column_name = 'file_path';






