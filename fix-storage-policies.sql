-- ============================================
-- FIX STORAGE POLICIES FOR DOCUMENTS BUCKET
-- ============================================
-- Run this AFTER creating the "documents" bucket
-- Go to: Supabase Dashboard -> SQL Editor -> New Query
-- ============================================

-- Drop all existing storage policies for documents bucket
DROP POLICY IF EXISTS "Allow public read access" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated updates" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated deletes" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon updates" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon deletes" ON storage.objects;
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Public can upload" ON storage.objects;
DROP POLICY IF EXISTS "Public can update" ON storage.objects;
DROP POLICY IF EXISTS "Public can delete" ON storage.objects;

-- Enable RLS on storage.objects (if not already enabled)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

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

-- Verify the policies were created
SELECT 
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'storage' 
  AND tablename = 'objects'
  AND policyname LIKE '%Public%'
ORDER BY policyname;

