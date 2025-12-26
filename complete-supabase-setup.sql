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
  file_path TEXT, -- Path to file in Storage bucket
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_documents_section ON documents(section);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_file_path ON documents(file_path);

-- Enable Row Level Security (RLS)
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON documents;
DROP POLICY IF EXISTS "Allow all operations for anon users" ON documents;

-- Create policy to allow all operations with anon key (no authentication required)
CREATE POLICY "Allow all operations for anon users" ON documents
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_documents_updated_at ON documents;
CREATE TRIGGER update_documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- PART 2: STORAGE BUCKET POLICIES
-- ============================================
-- IMPORTANT: You must create the bucket FIRST in the UI:
-- 1. Go to: Storage -> New Bucket
-- 2. Name: "documents"
-- 3. Public: Yes (check the box)
-- 4. Then run the policies below

-- Drop existing storage policies if they exist
DROP POLICY IF EXISTS "Allow public read access" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated updates" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated deletes" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon updates" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon deletes" ON storage.objects;

-- Policy 1: Allow public read access (anyone can view files)
CREATE POLICY "Allow public read access" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'documents'::text);

-- Policy 2: Allow anonymous uploads (insert) - works with anon key
CREATE POLICY "Allow anon uploads" ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'documents'::text);

-- Policy 3: Allow anonymous updates
CREATE POLICY "Allow anon updates" ON storage.objects
  FOR UPDATE
  USING (bucket_id = 'documents'::text)
  WITH CHECK (bucket_id = 'documents'::text);

-- Policy 4: Allow anonymous deletes
CREATE POLICY "Allow anon deletes" ON storage.objects
  FOR DELETE
  USING (bucket_id = 'documents'::text);

-- ============================================
-- VERIFICATION QUERIES (Optional - run to check)
-- ============================================

-- Check if table exists and has correct structure
-- SELECT column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name = 'documents'
-- ORDER BY ordinal_position;

-- Check if indexes exist
-- SELECT indexname, indexdef 
-- FROM pg_indexes 
-- WHERE tablename = 'documents';

-- Check if RLS policies exist for documents table
-- SELECT policyname, cmd, roles
-- FROM pg_policies 
-- WHERE tablename = 'documents';

-- Check if storage policies exist
-- SELECT policyname, cmd
-- FROM pg_policies 
-- WHERE tablename = 'objects' AND schemaname = 'storage';

-- ============================================
-- SETUP COMPLETE!
-- ============================================
-- Next steps:
-- 1. Create Storage bucket in UI: 
--    Storage -> New Bucket -> Name: "documents" -> Public: Yes
-- 2. The storage policies above will apply once the bucket is created
-- 3. Test by uploading a document through your app
-- ============================================

