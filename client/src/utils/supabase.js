import { createClient } from '@supabase/supabase-js';

let browserClient = null;

export function getSupabaseBrowserClient() {
  if (browserClient) return browserClient;

  const url = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
  const publishableKey = String(
    import.meta.env.VITE_PUBLISHABLE_KEY || ''
  ).trim();

  if (!url || !publishableKey) {
    throw new Error(
      'Missing VITE_SUPABASE_URL or VITE_PUBLISHABLE_KEY in client env'
    );
  }

  browserClient = createClient(url, publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return browserClient;
}
