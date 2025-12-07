# Supabase Setup Guide

## Step 1: Create a Supabase Project

1. Go to [https://supabase.com](https://supabase.com) and sign up/login
2. Click "New Project"
3. Fill in your project details:
   - Name: Your project name
   - Database Password: Choose a strong password
   - Region: Choose closest to your users
4. Wait for the project to be created (takes a few minutes)

## Step 2: Get Your Supabase Credentials

1. In your Supabase dashboard, go to **Settings** → **API**
2. Copy the following:
   - **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - **anon/public key** (for frontend/client-side)
   - **service_role key** (for backend/server-side - keep this secret!)

## Step 3: Add Environment Variables

### For Local Development (.env file):
```env
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

### For Vercel Deployment:
1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add:
   - `SUPABASE_URL` = your project URL
   - `SUPABASE_ANON_KEY` = your anon key
   - `SUPABASE_SERVICE_ROLE_KEY` = your service role key

### For Frontend (public/index.html and public/main.html):
Add this script tag before your other scripts:
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script>
  // Set Supabase credentials (or use environment variables)
  window.SUPABASE_URL = 'https://xxxxx.supabase.co';
  window.SUPABASE_ANON_KEY = 'your_anon_key_here';
</script>
```

## Step 4: Create Database Tables (Optional)

If you want to store documents in Supabase, create a table:

1. Go to **Table Editor** in Supabase dashboard
2. Click **New Table**
3. Name it `documents` (or whatever you prefer)
4. Add columns:
   - `id` (uuid, primary key, default: `gen_random_uuid()`)
   - `name` (text)
   - `type` (text)
   - `size` (bigint)
   - `section` (text) - for POA, Section 2, Section 3
   - `created_at` (timestamp, default: `now()`)
   - `file_data` (bytea) - optional, for storing file content
   - `analysis_data` (jsonb) - optional, for storing analysis results

## Step 5: Install Dependencies

```bash
npm install
```

## Usage Examples

### Frontend (Browser):
```javascript
// In your HTML files, after Supabase is loaded
const supabase = window.supabase.createClient(
  window.SUPABASE_URL,
  window.SUPABASE_ANON_KEY
);

// Insert a document record
async function saveDocument(documentData) {
  const { data, error } = await supabase
    .from('documents')
    .insert([documentData]);
  
  if (error) console.error('Error:', error);
  else console.log('Saved:', data);
}

// Fetch documents
async function getDocuments(section) {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('section', section);
  
  if (error) console.error('Error:', error);
  else return data;
}
```

### Backend (Node.js/Serverless):
```javascript
const supabase = require('./supabase-client');

// Insert document
async function saveDocument(documentData) {
  const { data, error } = await supabase
    .from('documents')
    .insert([documentData]);
  
  if (error) throw error;
  return data;
}
```

## Security Notes

- **Never expose your SERVICE_ROLE_KEY** in frontend code
- Use **ANON_KEY** for frontend operations
- Set up Row Level Security (RLS) policies in Supabase for data protection
- The SERVICE_ROLE_KEY bypasses RLS, so only use it in server-side code

## Next Steps

- Set up authentication if needed
- Configure Row Level Security policies
- Set up storage buckets if you want to store files
- Create indexes for better query performance

