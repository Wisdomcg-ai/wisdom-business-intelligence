// /lib/supabase/client.ts
// This file creates a properly configured Supabase client for Next.js 14 App Router

import { createBrowserClient } from '@supabase/ssr'

// Create a Supabase client configured for client-side use
export function createClient() {
  // Get environment variables - these should be in your .env.local file
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  // Create the client with proper cookie handling for Next.js 14
  return createBrowserClient(
    supabaseUrl,
    supabaseAnonKey
  )
}