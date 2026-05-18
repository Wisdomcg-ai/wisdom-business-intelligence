import { createBrowserClient } from '@supabase/ssr';
import { getSupabasePublishableKey } from './supabase/keys';

export const createClient = () => {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    getSupabasePublishableKey()
  );
};