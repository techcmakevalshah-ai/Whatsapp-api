import { createClient } from '@supabase/supabase-js';

const PROJECT_URL = 'https://hdpvabvizwiawonpvzlb.supabase.co';

export function supabaseAdmin() {
  const url = process.env.SUPABASE_URL || PROJECT_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing in Vercel environment variables.');
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
