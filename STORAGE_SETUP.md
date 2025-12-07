# Supabase Storage Setup Guide

## Step 1: Create Storage Bucket

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Navigate to **Storage** (left sidebar)
4. Click **New bucket**
5. Configure:
   - **Name**: `documents`
   - **Public bucket**: ✅ **YES** (check this box - important!)
   - Click **Create bucket**

## Step 2: Set Up Bucket Policies

1. In the Storage section, click on the `documents` bucket
2. Go to **Policies** tab
3. Click **New Policy**
4. Select **For full customization**
5. Name: `Allow public read access`
6. Policy definition:
   ```sql
   (bucket_id = 'documents'::text)
   ```
7. Allowed operation: **SELECT** (for reading files)
8. Click **Review** then **Save policy**

5. Create another policy for uploads:
   - Name: `Allow authenticated uploads`
   - Policy definition:
     ```sql
     (bucket_id = 'documents'::text)
     ```
   - Allowed operation: **INSERT** (for uploading files)
   - Click **Review** then **Save policy**

## Step 3: Update Database Schema

Run this SQL in your Supabase SQL Editor:

```sql
-- Add file_path column if it doesn't exist
ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS file_path TEXT;

-- Create index for file_path
CREATE INDEX IF NOT EXISTS idx_documents_file_path ON documents(file_path);
```

Or run the `supabase-storage-migration.sql` file.

## Step 4: Verify Setup

1. Upload a document through your app
2. Check Storage → documents bucket - you should see the file
3. Click on the file - you should see a public URL
4. The file should display correctly in the document viewer

## Benefits of Using Storage

- ✅ No base64 encoding issues
- ✅ Faster file loading
- ✅ Better for large files
- ✅ Direct URL access
- ✅ More reliable than database storage
- ✅ Better performance

