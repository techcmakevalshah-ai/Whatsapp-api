import { createClient } from '@supabase/supabase-js';

const fallbackUrl = 'https://hdpvabvizwiawonpvzlb.supabase.co';
const fallbackPublishableKey = 'sb_publishable_3jtMFXgr41bcGW1x1WZQqw_YVLi2a_I';

const url = import.meta.env.VITE_SUPABASE_URL || fallbackUrl;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || fallbackPublishableKey;

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'implicit',
  },
});
