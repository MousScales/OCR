-- ============================================
-- STORAGE POLICIES SQL (Requires Owner Permissions)
-- ============================================
-- This SQL matches the UI setup in STORAGE_SETUP_INSTRUCTIONS.md
-- 
-- IMPORTANT: This requires owner/service role permissions.
-- If you get "must be owner" error, use the UI method instead:
-- Go to Storage → documents bucket → Policies tab → New Policy
-- ============================================
-- Run this AFTER creating the "documents" bucket
-- Go to: Supabase Dashboard -> SQL Editor -> New Query
-- ============================================

-- Step 1: Drop any existing policies for documents bucket
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

-- Step 2: Ensure RLS is enabled on storage.objects
-- (This may require owner permissions)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Step 3: Create Policy 1 - Public Read Access (SELECT)
-- Matches: Policy name: "Public Access", Operation: SELECT
CREATE POLICY "Public Access" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'documents');

-- Step 4: Create Policy 2 - Public Upload (INSERT)
-- Matches: Policy name: "Public can upload", Operation: INSERT
CREATE POLICY "Public can upload" ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'documents');

-- Step 5: Create Policy 3 - Public Update (UPDATE)
-- Matches: Policy name: "Public can update", Operation: UPDATE
CREATE POLICY "Public can update" ON storage.objects
  FOR UPDATE
  USING (bucket_id = 'documents')
  WITH CHECK (bucket_id = 'documents');

-- Step 6: Create Policy 4 - Public Delete (DELETE)
-- Matches: Policy name: "Public can delete", Operation: DELETE
CREATE POLICY "Public can delete" ON storage.objects
  FOR DELETE
  USING (bucket_id = 'documents');

-- ============================================
-- VERIFICATION
-- ============================================
-- Run this to verify all policies were created:
SELECT 
  policyname,
  cmd as operation,
  qual as using_clause,
  with_check
FROM pg_policies
WHERE schemaname = 'storage' 
  AND tablename = 'objects'
  AND (policyname LIKE '%Public%' OR policyname LIKE '%public%')
ORDER BY policyname;

-- Expected output: 4 policies
-- 1. "Public Access" - SELECT
-- 2. "Public can delete" - DELETE
-- 3. "Public can update" - UPDATE
-- 4. "Public can upload" - INSERT






