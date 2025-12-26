# Storage Bucket Setup Instructions

## Step 1: Create the Bucket

1. Go to **Supabase Dashboard** → **Storage**
2. Click **"New Bucket"**
3. **Name:** `documents` (exact name, lowercase)
4. **Public bucket:** ✅ Check this box (IMPORTANT!)
5. Click **"Create bucket"**

## Step 2: Set Up Storage Policies (via UI)

After creating the bucket, you need to set up policies:

1. Go to **Storage** → Click on the **"documents"** bucket
2. Click on the **"Policies"** tab
3. Click **"New Policy"**

### Policy 1: Public Read Access
- **Policy name:** `Public Access`
- **Allowed operation:** SELECT
- **Policy definition:**
  ```sql
  bucket_id = 'documents'
  ```
- Click **"Review"** then **"Save policy"**

### Policy 2: Public Upload
- **Policy name:** `Public can upload`
- **Allowed operation:** INSERT
- **Policy definition:**
  ```sql
  bucket_id = 'documents'
  ```
- Click **"Review"** then **"Save policy"**

### Policy 3: Public Update
- **Policy name:** `Public can update`
- **Allowed operation:** UPDATE
- **Policy definition:**
  ```sql
  bucket_id = 'documents'
  ```
- Click **"Review"** then **"Save policy"**

### Policy 4: Public Delete
- **Policy name:** `Public can delete`
- **Allowed operation:** DELETE
- **Policy definition:**
  ```sql
  bucket_id = 'documents'
  ```
- Click **"Review"** then **"Save policy"**

## Alternative: Use SQL with Service Role (Advanced)

If you have access to the service role key, you can run the SQL in `fix-storage-policies.sql` using the service role key instead of the anon key. However, this is not recommended for security reasons.

## Verify Setup

After setting up the policies, try uploading a document. You should see:
- ✅ File uploaded to Storage
- ✅ Document saved to Supabase with ID

If you still see errors, check:
1. Bucket is named exactly `documents` (lowercase)
2. Bucket is set to **Public**
3. All 4 policies are created
4. Policies use the exact condition: `bucket_id = 'documents'`

