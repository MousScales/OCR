-- ============================================
-- COMPLETE SUPABASE SETUP FROM SCRATCH
-- ============================================
-- Run this entire file in Supabase SQL Editor
-- Go to: Supabase Dashboard -> SQL Editor -> New Query
-- This sets up EVERYTHING needed for the OCR system
-- ============================================

-- ============================================
-- PART 1: CREATE DOCUMENTS TABLE
-- ============================================

-- Drop table if it exists (for fresh start)
DROP TABLE IF EXISTS documents CASCADE;

-- Create documents table
CREATE TABLE documents (
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
CREATE INDEX idx_documents_section ON documents(section);
CREATE INDEX idx_documents_created_at ON documents(created_at DESC);
CREATE INDEX idx_documents_file_path ON documents(file_path);

-- ============================================
-- PART 2: ENABLE RLS AND CREATE POLICIES FOR DOCUMENTS TABLE
-- ============================================

-- Enable Row Level Security (RLS)
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON documents;
DROP POLICY IF EXISTS "Allow all operations for anon users" ON documents;
DROP POLICY IF EXISTS "Public Access" ON documents;

-- Create policy to allow all operations with anon key (no authentication required)
CREATE POLICY "Allow all operations for anon users" ON documents
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================
-- PART 3: CREATE TRIGGER FOR UPDATED_AT TIMESTAMP
-- ============================================

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
-- PART 4: STORAGE POLICIES
-- ============================================
-- IMPORTANT: You must create the bucket FIRST in the UI:
-- 1. Go to: Storage -> New Bucket
-- 2. Name: "documents"
-- 3. Public: Yes (check the box)
-- 4. Then run the policies below
--
-- NOTE: These policies may require owner permissions.
-- If you get "must be owner" error, use the UI method:
-- Go to Storage -> documents bucket -> Policies tab -> New Policy

-- Drop existing storage policies if they exist
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Public can upload" ON storage.objects;
DROP POLICY IF EXISTS "Public can update" ON storage.objects;
DROP POLICY IF EXISTS "Public can delete" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read access" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated updates" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated deletes" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon updates" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon deletes" ON storage.objects;

-- Enable RLS on storage.objects (if not already enabled)
-- This may require owner permissions - if it fails, the bucket policies
-- can be set up via the UI instead
DO $$
BEGIN
  -- Try to enable RLS
  ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Cannot enable RLS on storage.objects - use UI method for storage policies';
  WHEN OTHERS THEN
    RAISE NOTICE 'Error enabling RLS: %', SQLERRM;
END $$;

-- Policy 1: Allow public read access (anyone can view files)
CREATE POLICY "Public Access" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'documents');

-- Policy 2: Allow anonymous uploads (insert) - works with anon key
CREATE POLICY "Public can upload" ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'documents');

-- Policy 3: Allow anonymous updates
CREATE POLICY "Public can update" ON storage.objects
  FOR UPDATE
  USING (bucket_id = 'documents')
  WITH CHECK (bucket_id = 'documents');

-- Policy 4: Allow anonymous deletes
CREATE POLICY "Public can delete" ON storage.objects
  FOR DELETE
  USING (bucket_id = 'documents');

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Check if documents table exists and has correct structure
SELECT 
  column_name, 
  data_type,
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'documents'
ORDER BY ordinal_position;

-- Check if indexes exist
SELECT 
  indexname, 
  indexdef 
FROM pg_indexes 
WHERE tablename = 'documents';

-- Check if RLS policies exist for documents table
SELECT 
  policyname, 
  cmd,
  roles
FROM pg_policies 
WHERE tablename = 'documents';

-- Check if storage policies exist
SELECT 
  policyname,
  cmd
FROM pg_policies 
WHERE tablename = 'objects' 
  AND schemaname = 'storage'
  AND (policyname LIKE '%Public%' OR policyname LIKE '%public%')
ORDER BY policyname;

-- ============================================
-- SETUP COMPLETE!
-- ============================================
-- Next steps:
-- 1. Create Storage bucket in UI: 
--    Storage -> New Bucket -> Name: "documents" -> Public: Yes
-- 2. If storage policies failed with "must be owner" error:
--    Go to Storage -> documents bucket -> Policies tab
--    Create 4 policies manually (see STORAGE_SETUP_INSTRUCTIONS.md)
-- 3. Test by uploading a document through your app
-- ============================================

