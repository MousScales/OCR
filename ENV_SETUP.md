# Environment Variables Setup

## Required Environment Variables

### For Vercel Deployment:

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add the following variables:

#### PDF Conversion API Key
- **Name:** `PDF_CO_API_KEY`
- **Value:** `bizmoustaphagueye@gmail.com_PZoDB58C3KwLq4eNccAuNFPiVowJT9CDbrUHd0pGUooy95add7j7YwE9677KnXJ2`
- **Environment:** Production, Preview, Development (select all)

#### OpenAI API Key (if not already set)
- **Name:** `OPENAI_API_KEY`
- **Value:** Your OpenAI API key
- **Environment:** Production, Preview, Development (select all)

#### Supabase Credentials (if not already set)
- **Name:** `SUPABASE_URL`
- **Value:** Your Supabase project URL
- **Environment:** Production, Preview, Development (select all)

- **Name:** `SUPABASE_ANON_KEY` or `SUPABASE_SERVICE_ROLE_KEY`
- **Value:** Your Supabase anon key or service role key
- **Environment:** Production, Preview, Development (select all)

### For Local Development:

Create a `.env` file in the root directory:

```env
# PDF Conversion API (pdf.co)
PDF_CO_API_KEY=bizmoustaphagueye@gmail.com_PZoDB58C3KwLq4eNccAuNFPiVowJT9CDbrUHd0pGUooy95add7j7YwE9677KnXJ2

# OpenAI API
OPENAI_API_KEY=your_openai_api_key_here

# Supabase
SUPABASE_URL=your_supabase_url_here
SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

**Important:** 
- Never commit the `.env` file to git (it's already in `.gitignore`)
- The `.env` file is for local development only
- For production, use Vercel's environment variables

## How It Works

The PDF conversion API key is used to automatically convert PDFs to images when:
- Local PDF-to-image conversion fails (missing dependencies in serverless)
- PDF is a scanned document with no extractable text
- PDF processing encounters errors

This allows the system to automatically handle PDFs without showing errors to users.

