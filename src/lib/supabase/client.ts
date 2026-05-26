// /lib/supabase/client.ts
// This file creates a properly configured Supabase client for Next.js 14 App Router

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabasePublishableKey } from './keys'

// Singleton instance to prevent multiple clients causing auth state flickering
let supabaseInstance: SupabaseClient | null = null

// Create a Supabase client configured for client-side use
export function createClient() {
  // Return existing instance if available (singleton pattern)
  if (supabaseInstance) {
    return supabaseInstance
  }

  // Get environment variables - these should be in your .env.local file
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabasePublishableKey = getSupabasePublishableKey()

  // Create the client with proper cookie handling for Next.js 14.
  //
  // The `auth.lockAcquireTimeout` setting caps auth-lock acquisition at 10s
  // so a stuck navigator.locks entry throws LockAcquireTimeoutError instead
  // of hanging forever. Without this, an orphaned lock from a previous tab
  // (or a session left over from a JWT key rotation) wedges every subsequent
  // auth call — sign-in succeeds at the network layer but the next
  // getUser() never returns. The thrown error is caught at the call site
  // (login pages) so the user gets a recover-and-retry path instead of a
  // forever spinner. Check `err.isAcquireTimeout === true` to detect.
  //
  // Type cast: `lockAcquireTimeout` is an auth-js runtime option that the
  // `@supabase/ssr` type re-exports don't yet surface. Drop the cast once the
  // types catch up. Keep the runtime value.
  supabaseInstance = createBrowserClient(supabaseUrl, supabasePublishableKey, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    auth: { lockAcquireTimeout: 10_000 } as any,
  })

  return supabaseInstance
}