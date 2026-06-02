/**
 * R17 / C-21 — validated access to the Xero OAuth client credentials.
 *
 * Previously the token-refresh auth header interpolated `process.env.XERO_CLIENT_ID`
 * / `XERO_CLIENT_SECRET` directly, so a missing var silently produced an
 * `undefined:undefined` Basic-auth header (→ a confusing 401 from Xero) rather
 * than a clear configuration error. This getter fails fast with a precise message.
 */
export function getXeroClientCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.XERO_CLIENT_ID
  const clientSecret = process.env.XERO_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error(
      'Xero OAuth credentials missing: XERO_CLIENT_ID and XERO_CLIENT_SECRET must be set.',
    )
  }
  return { clientId, clientSecret }
}
