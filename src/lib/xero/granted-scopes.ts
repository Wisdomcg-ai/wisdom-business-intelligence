/**
 * Which OAuth scopes does a Xero connection actually hold?
 *
 * Adding a scope to the app's consent request (src/app/api/Xero/auth/route.ts)
 * changes nothing for an org until that org re-consents. So the scopes we ASK
 * for and the scopes a given connection HAS are different facts, and until
 * now only the first was known. This module derives the second from what Xero
 * hands us, so every connection write (connect, multi-tenant completion, and
 * the 6-hourly refresh) can record it in `xero_connections.granted_scopes`.
 *
 * Two sources, in order of preference:
 *   1. The token endpoint's `scope` field — a space-delimited string on both
 *      the authorization-code and refresh-token responses.
 *   2. The access token itself. Xero access tokens are JWTs whose payload
 *      carries a `scope` claim (an array of strings). We only DECODE the
 *      payload here — never verify — because we are reading a token Xero just
 *      issued to us over TLS, not authenticating anything with it.
 *
 * Returns null when neither source yields anything, so callers can leave an
 * existing value untouched rather than overwrite it with an empty list.
 *
 * Fleet visibility only. Features gate on the API's actual response (a 403
 * from the endpoint), never on this column.
 */

export const XERO_BUDGETS_SCOPE = 'accounting.budgets.read'

/** Split a space-delimited OAuth scope string into a sorted, de-duplicated list. */
export function parseScopeString(scope: unknown): string[] {
  if (typeof scope !== 'string') return []
  return normalise(scope.split(/\s+/))
}

/**
 * Read the `scope` claim out of a JWT access token's payload without verifying
 * the signature. Returns null for anything that is not a three-part JWT with a
 * JSON payload, or whose payload has no usable `scope` claim.
 */
export function readScopesFromAccessToken(accessToken: unknown): string[] | null {
  if (typeof accessToken !== 'string') return null
  const parts = accessToken.split('.')
  if (parts.length !== 3 || !parts[1]) return null
  let payload: unknown
  try {
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (!payload || typeof payload !== 'object') return null
  const claim = (payload as { scope?: unknown }).scope
  if (Array.isArray(claim)) {
    const scopes = normalise(claim.filter((s): s is string => typeof s === 'string'))
    return scopes.length > 0 ? scopes : null
  }
  if (typeof claim === 'string') {
    const scopes = parseScopeString(claim)
    return scopes.length > 0 ? scopes : null
  }
  return null
}

/**
 * Best available answer for "what scopes does this token carry": the token
 * response's `scope` string when present, else the JWT claim, else null.
 */
export function resolveGrantedScopes(input: {
  scope?: unknown
  accessToken?: unknown
}): string[] | null {
  const fromResponse = parseScopeString(input.scope)
  if (fromResponse.length > 0) return fromResponse
  return readScopesFromAccessToken(input.accessToken)
}

/** True when `granted` is known and includes `scope`. Unknown (null) is false. */
export function hasScope(granted: readonly string[] | null | undefined, scope: string): boolean {
  return Array.isArray(granted) && granted.includes(scope)
}

/**
 * The columns to merge into a `xero_connections` write for a freshly received
 * token, or an empty object when the scopes could not be determined (so the
 * write leaves the existing value alone).
 */
export function grantedScopesColumns(
  granted: string[] | null,
  now: Date = new Date(),
): { granted_scopes: string[]; scopes_granted_at: string } | Record<string, never> {
  if (!granted || granted.length === 0) return {}
  return { granted_scopes: granted, scopes_granted_at: now.toISOString() }
}

/**
 * Did a write fail because `granted_scopes` / `scopes_granted_at` do not exist
 * yet where the write landed? Two shapes: Postgres `42703 undefined_column`
 * (migration not applied — prod migrations are applied by hand after merge),
 * and PostgREST `PGRST204` (column exists but the schema cache has not
 * reloaded). Callers use this to retry the write WITHOUT the scope columns,
 * because scope bookkeeping must never cost us a rotated refresh token.
 */
export function isMissingColumnError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const { code, message } = error as { code?: unknown; message?: unknown }
  if (code === '42703' || code === 'PGRST204') return true
  return typeof message === 'string' && /granted_scopes|scopes_granted_at/.test(message) && /column/i.test(message)
}

function normalise(scopes: string[]): string[] {
  return Array.from(new Set(scopes.map((s) => s.trim()).filter(Boolean))).sort()
}
