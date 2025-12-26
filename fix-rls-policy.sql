-- ============================================
-- FIX RLS POLICIES FOR ANONYMOUS ACCESS
-- ============================================
-- This fixes the RLS policy to allow anonymous access
-- Run this in Supabase SQL Editor
-- ============================================

-- Drop the existing policy if it exists
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON documents;

-- Create a new policy that allows anonymous access (for anon key)
CREATE POLICY "Allow all operations for anon users" ON documents
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Verify the policy was created
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'documents';

