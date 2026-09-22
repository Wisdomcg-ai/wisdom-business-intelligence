/**
 * Press-affinity for recon-round claims: for the first few minutes a queued
 * request may only be claimed by the runner machine belonging to the person
 * who pressed the button, so Vanessa's click runs on her PC (her Chrome, her
 * Xero session) and Matt's click runs on his Mac. After the window, any
 * runner may claim it — affinity is a routing preference, never a security
 * boundary (the token already authorizes claiming), so every ambiguity here
 * resolves toward "the run still happens".
 */
/**
 * MUST stay well below the queue's 30-min pickup window (PICKUP_WINDOW_MINUTES
 * in the recon-round routes): the fall-open-to-any-runner path only exists
 * while the row is still pending, so an affinity window >= the pickup window
 * would let a mismatched press expire without ever falling open — permanent
 * starvation for a presser whose own machine is down. Pinned by a test.
 */
export const AFFINITY_WINDOW_MINUTES = 5

export function affinityEligible(params: {
  /** Email of the runner machine's owner, as declared in its env file. */
  declaredOwnerEmail: string | null
  /** Email of the user who queued the request (null: scheduled/worker rows). */
  requesterEmail: string | null
  /** When the request was queued. */
  requestedAt: string
  /** Claim-time clock, injected for testability. */
  nowMs: number
}): boolean {
  const { declaredOwnerEmail, requesterEmail, requestedAt, nowMs } = params
  // A runner that declares no owner is a generic runner: legacy behavior,
  // claims anything immediately.
  if (!declaredOwnerEmail) return true
  // A request with no resolvable requester has no preferred machine.
  if (!requesterEmail) return true
  if (declaredOwnerEmail.trim().toLowerCase() === requesterEmail.trim().toLowerCase()) return true
  const requestedMs = Date.parse(requestedAt)
  // An unparseable timestamp must not wedge the queue.
  if (Number.isNaN(requestedMs)) return true
  return nowMs - requestedMs > AFFINITY_WINDOW_MINUTES * 60_000
}
