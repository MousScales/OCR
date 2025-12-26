-- ============================================
-- COMPLETE SUPABASE SETUP SQL
-- ============================================
-- Run this entire file in Supabase SQL Editor
-- Go to: Supabase Dashboard -> SQL Editor -> New Query
-- ============================================

-- ============================================
-- PART 1: CREATE DOCUMENTS TABLE
-- ============================================

-- Create table if it doesn't exist
CREATE TABLE IF NOT EXISTS documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  size BIGINT NOT NULL,
  section TEXT NOT NULL CHECK (section IN ('poa', 'section2', 'section3')),
  file_data BYTEA, -- Optional: store file content if needed
  analysis_data JSONB, -- Store analysis results
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add file_path column if it doesn't exist (for existing tables)
ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS file_path TEXT;

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_documents_section ON documents(section);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_file_path ON documents(file_path);

-- Enable Row Level Security (RLS)
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations (for anonymous/anonymous key access)
-- This allows the app to work with the anon key without requiring authentication
CREATE POLICY "Allow all operations for anon users" ON documents
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Optional: Create a function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- PART 2: STORAGE BUCKET POLICIES
-- ============================================
-- Note: You must create the bucket first in the UI:
-- Storage -> New Bucket -> Name: "documents" -> Public: Yes
-- Then run these policies

-- Policy 1: Allow public read access
CREATE POLICY "Allow public read access" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'documents'::text);

-- Policy 2: Allow authenticated uploads (insert)
CREATE POLICY "Allow authenticated uploads" ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'documents'::text);

-- Policy 3: Allow authenticated updates
CREATE POLICY "Allow authenticated updates" ON storage.objects
  FOR UPDATE
  USING (bucket_id = 'documents'::text);

-- Policy 4: Allow authenticated deletes
CREATE POLICY "Allow authenticated deletes" ON storage.objects
  FOR DELETE
  USING (bucket_id = 'documents'::text);

-- ============================================
-- VERIFICATION QUERIES (Optional - run to check)
-- ============================================

-- Check if table exists and has correct structure
-- SELECT column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name = 'documents';

-- Check if indexes exist
-- SELECT indexname, indexdef 
-- FROM pg_indexes 
-- WHERE tablename = 'documents';

-- Check if policies exist
-- SELECT policyname, cmd 
-- FROM pg_policies 
-- WHERE tablename = 'documents';

-- ============================================
-- SETUP COMPLETE!
-- ============================================
-- Next steps:
-- 1. Create Storage bucket in UI: Storage -> New Bucket -> "documents" -> Public: Yes
-- 2. The policies above will apply once the bucket is created
-- 3. Test by uploading a document through your app
-- ============================================

