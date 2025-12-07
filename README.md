# OCR System - POA Document Analysis

A web application for analyzing Power of Attorney (POA) documents using OCR and AI.

## Features

- **Document Upload**: Upload PDF or image files for analysis
- **POA Detection**: Automatically detects if a document is a Power of Attorney
- **State-Specific Analysis**: Analyzes POA documents for compliance with specific U.S. state requirements
- **PIN Protection**: Site-wide PIN protection (PIN: 11335)
- **Document Management**: Organize documents by section (POA, Section 2, Section 3)

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file with your OpenAI API key:
```
OPENAI_API_KEY=your_api_key_here
```

3. For local development:
   - Frontend: `npm start` (runs on port 5500)
   - Backend: `npm run server` (runs on port 5000)

## Deployment to Vercel

1. Push your code to GitHub
2. Connect your repository to Vercel
3. Add environment variable `OPENAI_API_KEY` in Vercel dashboard
4. Deploy

The backend API endpoints are automatically deployed as Vercel serverless functions:
- `/api/check-poa` - Check if a document is a POA
- `/api/analyze-poa` - Analyze a POA document for a specific state

## Project Structure

- `public/` - Frontend files (HTML, assets)
- `api/` - Vercel serverless functions
- `server.js` - Express server for local development
- `vercel.json` - Vercel configuration

## Technologies

- Node.js
- Express
- OpenAI API
- Tesseract.js (OCR)
- Sharp (Image processing)
- PDF-parse

