// /lib/supabase/client.ts
// This file creates a properly configured Supabase client for Next.js 14 App Router

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

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
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  // Create the client with proper cookie handling for Next.js 14
  supabaseInstance = createBrowserClient(
    supabaseUrl,
    supabaseAnonKey
  )

  return supabaseInstance
}