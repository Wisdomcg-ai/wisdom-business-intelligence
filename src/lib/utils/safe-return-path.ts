/**
 * Where a flow may send the user back to (S2, 22 Sep 2026 system diagnostic).
 *
 * The Xero connect flow carried a caller-supplied `return_to` from
 * /api/Xero/auth through the signed OAuth state, the pending-connection row and
 * the org picker, and navigated to it unchecked: an absolute URL gave an open
 * redirect after connecting, and a `javascript:` value ran in the session of
 * whoever clicked Connect or Cancel on the picker (Matt, a coach).
 *
 * Only a same-site path is accepted; anything else becomes the fallback. Pure
 * and dependency-free so the browser (select-org page) and the routes share it.
 */

const DEFAULT_RETURN_PATH = '/integrations'
// A reserved TLD — parsing against it tells a relative path from anything that
// would leave the site, without depending on the deployment's real origin.
const PARSE_BASE = 'https://return-path.invalid'

export function safeReturnPath(value: unknown, fallback: string = DEFAULT_RETURN_PATH): string {
  if (typeof value !== 'string') return fallback
  const v = value.trim()
  // "//host" and "/\host" are protocol-relative to browsers; backslashes and
  // control characters are normalised away by URL parsers in ways that can
  // turn a "path" into a host.
  if (!v.startsWith('/') || v.startsWith('//') || v.includes('\\')) return fallback
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F]/.test(v)) return fallback

  let url: URL
  try {
    url = new URL(v, PARSE_BASE)
  } catch {
    return fallback
  }
  if (url.origin !== PARSE_BASE) return fallback
  return url.pathname + url.search + url.hash
}

/** A safe return path with query parameters set (replacing any of the same name). */
export function withReturnParams(value: unknown, params: Record<string, string>): string {
  const url = new URL(safeReturnPath(value), PARSE_BASE)
  for (const [key, val] of Object.entries(params)) url.searchParams.set(key, val)
  return url.pathname + url.search + url.hash
}
