# Database Setup Guide

## Step 1: Create the Database Table

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project: `qecirwhseouzckdlqipg`
3. Navigate to **SQL Editor** (left sidebar)
4. Click **New Query**
5. Copy and paste the entire contents of `supabase-migration.sql`
6. Click **Run** (or press Ctrl+Enter)

This will create:
- A `documents` table to store all uploaded documents
- Indexes for faster queries
- Row Level Security (RLS) policies
- Automatic timestamp updates

## Step 2: Verify the Table

1. Go to **Table Editor** in Supabase Dashboard
2. You should see a `documents` table with these columns:
   - `id` (UUID, primary key)
   - `name` (text) - document filename
   - `type` (text) - MIME type (e.g., "application/pdf")
   - `size` (bigint) - file size in bytes
   - `section` (text) - "poa", "section2", or "section3"
   - `file_data` (bytea) - optional file content
   - `analysis_data` (jsonb) - optional analysis results
   - `created_at` (timestamp)
   - `updated_at` (timestamp)

## Step 3: Test the Integration

1. Open your application
2. Upload a document through the POA section
3. Check the browser console - you should see "Document saved to Supabase"
4. Go to Supabase Dashboard → Table Editor → documents
5. You should see your uploaded document in the table

## How It Works

### Saving Documents:
- When you upload a file in `index.html`, it automatically saves to:
  1. **Supabase database** (primary storage)
  2. **localStorage** (backup/offline support)

### Loading Documents:
- When you open `main.html`, it loads documents from:
  1. **Supabase database** (primary source)
  2. Falls back to **localStorage** if Supabase is unavailable

### File Storage:
- Files smaller than 5MB: Stored as base64 in `file_data` column
- Files larger than 5MB: Only metadata is stored (name, type, size)
- You can adjust this limit in `public/index.html` in the `saveDocumentToStorage` function

## Customization

### Change File Size Limit:
In `public/index.html`, find:
```javascript
if (file.size < 5 * 1024 * 1024) { // Only store files < 5MB
```
Change `5` to your desired limit in MB.

### Store Analysis Results:
When analysis is complete, you can save it to the `analysis_data` column:
```javascript
await supabase
  .from('documents')
  .update({ analysis_data: analysisResult })
  .eq('id', documentId);
```

## Troubleshooting

### Documents not saving?
- Check browser console for errors
- Verify Supabase credentials are correct
- Check that the table was created successfully
- Ensure RLS policies allow inserts

### Documents not loading?
- Check browser console for errors
- Verify Supabase connection
- Check network tab for API calls
- Documents will fall back to localStorage if Supabase fails

### RLS Policy Issues?
If you get permission errors, you may need to adjust the RLS policy in Supabase:
1. Go to **Authentication** → **Policies**
2. Find the `documents` table
3. Adjust policies as needed

