/**
 * Supabase API key resolvers.
 *
 * Supabase is migrating from legacy JWT-based keys (`anon` / `service_role`) to
 * the new key system (`sb_publishable_...` / `sb_secret_...`). Legacy keys
 * remain valid until end of 2026.
 *
 * These resolvers prefer the new env vars and fall back to the legacy ones, so
 * the app keeps running before AND after the new keys are provisioned in each
 * environment. Once the new keys are verified everywhere, the legacy env vars
 * (and the fallbacks below) can be removed.
 *
 * - Publishable key — browser-safe, respects RLS. Replaces the `anon` key.
 * - Secret key      — server-only, bypasses RLS. Replaces `service_role`.
 *
 * IMPORTANT: `getSupabaseSecretKey()` must only ever be called in server-side
 * code (route handlers, server actions, scripts). Never import it into a client
 * component. The new keys are NOT JWTs — they cannot be placed in an
 * `Authorization: Bearer` header; pass them as the SDK key argument or the
 * `apikey` header only.
 */

/**
 * Resolve the Supabase publishable (browser-safe) key.
 * Prefers `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, falls back to the legacy
 * `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
 */
export function getSupabasePublishableKey(): string {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!key) {
    throw new Error(
      'Missing Supabase publishable key — set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ' +
        '(or the legacy NEXT_PUBLIC_SUPABASE_ANON_KEY).',
    )
  }
  return key
}

/**
 * Resolve the Supabase secret (server-only, RLS-bypassing) key.
 * Prefers `SUPABASE_SECRET_KEY`, falls back to the two legacy names the
 * codebase historically used: `SUPABASE_SERVICE_KEY` and
 * `SUPABASE_SERVICE_ROLE_KEY`.
 *
 * Server-side only. Never call this from browser/client code.
 */
export function getSupabaseSecretKey(): string {
  const key =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!key) {
    throw new Error(
      'Missing Supabase secret key — set SUPABASE_SECRET_KEY ' +
        '(or a legacy SUPABASE_SERVICE_KEY / SUPABASE_SERVICE_ROLE_KEY).',
    )
  }
  return key
}
