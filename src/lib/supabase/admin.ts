import { createClient } from '@supabase/supabase-js';

/**
 * Create a Supabase admin client with service role key
 * BYPASSES RLS - Use only for admin operations in API routes
 * Never expose this client to the browser
 */
export function createServiceRoleClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );
}
