// Phase 35 D-20: HMAC-SHA256-signed report view token.
// Format: `${base64url(statusId)}.${base64url(hmac_sha256(base64url(statusId)))}`
// Secret: process.env.REPORT_LINK_SECRET (32-byte recommended, `openssl rand -hex 32`).
// Rotating the secret invalidates every existing token (D-21, accepted tradeoff).
//
// Tokens do NOT encode an expiry or issued-at timestamp — per D-21 they are
// valid indefinitely. The only global kill-switch is rotating the secret.
import crypto from 'crypto'

function getSecret(): string {
  const secret = process.env.REPORT_LINK_SECRET
  if (!secret || secret.length < 16) {
    throw new Error(
      'REPORT_LINK_SECRET not configured (or too short). ' +
      'Generate with: openssl rand -hex 32'
    )
  }
  return secret
}

export function signReportToken(statusId: string): string {
  if (!statusId || typeof statusId !== 'string') {
    throw new Error('signReportToken: statusId is required')
  }
  const secret = getSecret()
  const payload = Buffer.from(statusId, 'utf8').toString('base64url')
  const sig = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('base64url')
  return `${payload}.${sig}`
}

export function verifyReportToken(token: string): string | null {
  try {
    if (!token || typeof token !== 'string' || !token.includes('.')) return null
    const [payload, sig] = token.split('.')
    if (!payload || !sig) return null

    const secret = getSecret()
    const expected = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('base64url')

    const sigBuf = Buffer.from(sig, 'utf8')
    const expBuf = Buffer.from(expected, 'utf8')
    if (sigBuf.length !== expBuf.length) return null
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null

    const statusId = Buffer.from(payload, 'base64url').toString('utf8')
    if (!statusId) return null
    return statusId
  } catch {
    return null
  }
}
