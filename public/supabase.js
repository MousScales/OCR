// Supabase client configuration for frontend
// Get these values from your Supabase project settings: https://supabase.com/dashboard

const SUPABASE_URL = import.meta.env?.VITE_SUPABASE_URL || window.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY || window.SUPABASE_ANON_KEY || '';

// Initialize Supabase client (will be loaded from CDN in HTML)
let supabase = null;

// Function to initialize Supabase
function initSupabase() {
  if (typeof window.supabase !== 'undefined') {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return supabase;
  }
  console.warn('Supabase client not loaded. Make sure to include the Supabase script in your HTML.');
  return null;
}

// Initialize on load
if (typeof window !== 'undefined') {
  // Wait for Supabase to load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSupabase);
  } else {
    initSupabase();
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { initSupabase, getSupabase: () => supabase };
}

