/**
 * Recover from supabase-js auth-lock timeouts.
 *
 * Supabase-js v2 uses `navigator.locks` to serialise auth operations across
 * tabs. When a lock is orphaned — typically after a JWT key rotation or a
 * crashed sibling tab — every subsequent auth call hangs forever waiting for
 * a lock that will never release. The browser client is configured with
 * `lockAcquireTimeout: 10_000` (see `src/lib/supabase/client.ts`) so the wait
 * fails fast instead. This helper detects the resulting error and walks the
 * user through a clean recovery.
 *
 * Detection: check `err.isAcquireTimeout === true` (Supabase's documented
 * pattern — they recommend the property over `instanceof` checks because the
 * concrete class isn't always reachable across bundling layers).
 *
 * Recovery: wipe localStorage + sessionStorage + IndexedDB Supabase entries,
 * then full reload. Don't bother calling `supabase.auth.signOut()` first —
 * that itself takes a lock and would re-hang.
 */

/** True when the error came from a supabase-js navigator.locks acquire timeout. */
export function isLockTimeoutError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  return (err as { isAcquireTimeout?: unknown }).isAcquireTimeout === true
}

/**
 * Wipe every Supabase-managed storage entry and reload. Call from a login
 * page's catch block when `isLockTimeoutError(err)` is true. The user will
 * land back on the same page with a fresh client and no orphaned locks.
 */
export async function recoverFromLockTimeout(): Promise<void> {
  if (typeof window === 'undefined') return

  try {
    // localStorage — supabase keys are namespaced `sb-<project-ref>-auth-token` etc.
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const k = window.localStorage.key(i)
      if (k && (k.startsWith('sb-') || k.startsWith('supabase.'))) {
        window.localStorage.removeItem(k)
      }
    }
  } catch {
    // private mode / storage disabled — fall through to reload
  }

  try {
    for (let i = window.sessionStorage.length - 1; i >= 0; i--) {
      const k = window.sessionStorage.key(i)
      if (k && (k.startsWith('sb-') || k.startsWith('supabase.'))) {
        window.sessionStorage.removeItem(k)
      }
    }
  } catch {
    /* no-op */
  }

  // IndexedDB — supabase-js doesn't use it by default but `@supabase/ssr`
  // creates a database when cookie storage isn't available. Best-effort.
  try {
    const dbs = (await (window.indexedDB as IDBFactory & {
      databases?: () => Promise<{ name?: string }[]>
    }).databases?.()) ?? []
    for (const db of dbs) {
      if (db.name && (db.name.startsWith('sb-') || db.name.includes('supabase'))) {
        window.indexedDB.deleteDatabase(db.name)
      }
    }
  } catch {
    /* no-op — older browsers don't expose indexedDB.databases() */
  }

  // Hard reload to drop the in-memory Supabase singleton + any held locks.
  window.location.reload()
}
