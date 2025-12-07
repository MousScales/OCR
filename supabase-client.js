// Supabase client for Node.js backend/serverless functions
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Default Supabase credentials (can be overridden by environment variables)
const supabaseUrl = process.env.SUPABASE_URL || 'https://qecirwhseouzckdlqipg.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFlY2lyd2hzZW91emNrZGxxaXBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUwNzYyODQsImV4cCI6MjA4MDY1MjI4NH0.ar6x-jUzJwKa6WtmM6vnHXmYnARQuLNN0OifdLMbOTo';

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('Supabase credentials not found. Make sure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in your .env file.');
}

// Create Supabase client
// Use SERVICE_ROLE_KEY for server-side operations (bypasses RLS)
// Use ANON_KEY for client-side operations (respects RLS)
const supabase = createClient(supabaseUrl, supabaseServiceKey);

module.exports = supabase;

