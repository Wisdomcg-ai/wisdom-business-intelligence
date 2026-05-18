import { createClient } from '@supabase/supabase-js';
import { getSupabaseSecretKey } from '@/lib/supabase/keys';

/**
 * Create a Supabase admin client with service role key
 * BYPASSES RLS - Use only for admin operations in API routes
 * Never expose this client to the browser
 */
export function createServiceRoleClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    getSupabaseSecretKey(),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      },
      global: {
        fetch: (url: any, init: any) => fetch(url, { ...init, cache: 'no-store' as RequestCache })
      }
    }
  );
}
