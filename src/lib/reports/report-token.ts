// Phase 35 D-20 / R9: HMAC-SHA256-signed report view token, now with a signed expiry.
//
// Current format:
//   `${base64url(`${statusId}|${expEpochSeconds}`)}.${base64url(hmac_sha256(payload))}`
//   The expiry is INSIDE the signed payload, so it cannot be tampered with — changing
//   it breaks the HMAC. A token stops verifying once `expEpochSeconds` has passed.
//
// Legacy format (pre-R9):
//   `${base64url(statusId)}.${base64url(hmac_sha256(payload))}` — no embedded expiry.
//   These were valid indefinitely. R9 honors them through a 30-day grace window
//   (LEGACY_TOKEN_SUNSET) so links already in the wild keep working briefly, then
//   they are rejected — no never-expiring link survives long-term.
//
// Secret: process.env.REPORT_LINK_SECRET (32-byte recommended, `openssl rand -hex 32`).
// Rotating the secret invalidates every existing token (the global kill-switch).
import crypto from 'crypto'

/** Default lifetime of a newly-issued report link. */
const DEFAULT_TTL_DAYS = 60

/**
 * R9 grace window. Pre-R9 tokens carry no embedded expiry; they are accepted until
 * this instant, then rejected. Set to 30 days after the R9 deploy so links already
 * shared keep working long enough to roll over naturally, without leaving any
 * never-expiring link valid forever.
 */
const LEGACY_TOKEN_SUNSET_MS = Date.parse('2026-07-02T00:00:00Z')

const SECONDS_PER_DAY = 24 * 60 * 60

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

function signPayload(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url')
}

export interface SignReportTokenOptions {
  /** Link lifetime in days (default 60). */
  ttlDays?: number
  /** Issue time — injectable for deterministic tests (default now). */
  now?: Date
}

export function signReportToken(statusId: string, opts?: SignReportTokenOptions): string {
  if (!statusId || typeof statusId !== 'string') {
    throw new Error('signReportToken: statusId is required')
  }
  const secret = getSecret()
  const nowMs = (opts?.now ?? new Date()).getTime()
  const ttlDays = opts?.ttlDays ?? DEFAULT_TTL_DAYS
  const expSeconds = Math.floor(nowMs / 1000) + Math.floor(ttlDays * SECONDS_PER_DAY)

  const payload = Buffer.from(`${statusId}|${expSeconds}`, 'utf8').toString('base64url')
  const sig = signPayload(payload, secret)
  return `${payload}.${sig}`
}

export interface VerifyReportTokenOptions {
  /** Verification time — injectable for deterministic tests (default now). */
  now?: Date
}

export function verifyReportToken(token: string, opts?: VerifyReportTokenOptions): string | null {
  try {
    if (!token || typeof token !== 'string' || !token.includes('.')) return null
    const [payload, sig] = token.split('.')
    if (!payload || !sig) return null

    const secret = getSecret()
    const expected = signPayload(payload, secret)

    const sigBuf = Buffer.from(sig, 'utf8')
    const expBuf = Buffer.from(expected, 'utf8')
    if (sigBuf.length !== expBuf.length) return null
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null

    // Signature is valid → the payload is trustworthy (HMAC covers it).
    const decoded = Buffer.from(payload, 'base64url').toString('utf8')
    if (!decoded) return null

    const nowMs = (opts?.now ?? new Date()).getTime()

    // statusId is a UUID and never contains '|', so the LAST '|' separates the
    // expiry. No separator ⇒ a legacy (pre-R9) token with no embedded expiry.
    const sep = decoded.lastIndexOf('|')
    if (sep === -1) {
      if (nowMs >= LEGACY_TOKEN_SUNSET_MS) return null // grace window elapsed
      return decoded
    }

    const statusId = decoded.slice(0, sep)
    const expSeconds = Number(decoded.slice(sep + 1))
    if (!statusId || !Number.isFinite(expSeconds)) return null
    if (nowMs >= expSeconds * 1000) return null // expired

    return statusId
  } catch {
    return null
  }
}
