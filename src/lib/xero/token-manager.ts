/**
 * Xero Token Manager
 *
 * Centralized token refresh logic with:
 * - Standardized 15-minute refresh threshold
 * - Retry logic with exponential backoff
 * - Race condition prevention via database locking + post-lock row re-fetch
 *   (closes Hole A — see 53-RESEARCH.md §4)
 * - Pre-deactivation row re-fetch (closes Hole B — see 53-RESEARCH.md §4)
 * - Per-error-code policy: invalid_grant terminal, unauthorized_client retry x3,
 *   invalid_client never deactivates (config bug), 5xx/network/generic-400 transient
 * - Structured deactivation log line (Sentry insertion point for 53-05)
 */

import { SupabaseClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { encrypt, decrypt } from '@/lib/utils/encryption';

// Standardized refresh threshold - refresh if token expires within 15 minutes.
// Exported (53-04 F2) so cron consumers can infer still_valid vs refreshed
// without duplicating the constant. If you change this, the cron's pre-call
// staleness inference automatically stays in sync.
export const REFRESH_THRESHOLD_MINUTES = 15;
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;
// Upper bound on how long we'll sleep on a 429 Retry-After inside a single
// invocation (REL-N3). Xero's daily-limit 429 can carry a multi-hour
// Retry-After; sleeping that long would just burn the function (and time out)
// only to wake up still throttled, so beyond this we defer the retry to the
// caller / next cron tick instead.
const MAX_RETRY_AFTER_MS = 60000;

// Refresh-lock coordination (REL-N4).
//   LOCK_TTL_MS — how long a held refresh lock stays valid before it is
//     considered stale. A waiter polls for *exactly* this window: that is the
//     longest a healthy lock-holder could legitimately be mid-refresh (Xero
//     backoff/retries included) before its lock ages out and a waiter may take
//     over. acquireRefreshLock uses the same constant for its staleness cutoff.
//   LOCK_POLL_INTERVAL_MS — how often a waiter re-checks for the sibling's
//     rotated token / a freed lock.
const LOCK_TTL_MS = 30000;
const LOCK_POLL_INTERVAL_MS = 2000;

// REL-N5: persisting a freshly-rotated token is mandatory — Xero has already
// invalidated the previous refresh token by the time we get a 200, so the new
// token is the ONLY valid one. Retry the save a few times (short backoff) so a
// transient write blip can't strand the connection on a dead token. Kept small
// to avoid materially adding to the refresh cron's per-tenant time budget.
const MAX_TOKEN_SAVE_ATTEMPTS = 3;
const TOKEN_SAVE_RETRY_DELAY_MS = 200;

// Error types for better handling
export type TokenRefreshError =
  | 'token_expired_permanently' // Refresh token expired (60 days), need to reconnect
  | 'token_revoked' // User revoked access in Xero
  | 'network_error' // Transient network issue
  | 'rate_limited' // Too many requests
  | 'server_error' // Xero API error
  | 'database_error' // Failed to save tokens
  | 'unknown';

export interface TokenRefreshResult {
  success: boolean;
  accessToken?: string;
  error?: TokenRefreshError;
  message?: string;
  shouldDeactivate?: boolean; // True if connection should be marked inactive
}

export interface XeroConnection {
  id: string;
  business_id: string;
  tenant_id: string;
  tenant_name: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  is_active: boolean;
  token_refreshing_at?: string | null;
  updated_at?: string;
}

// ─── Internal helpers (53-03) ────────────────────────────────────────────────

/**
 * Stable rationale strings used by 53-05 as Sentry tag values.
 */
type DeactivationRationale =
  | 'invalid_grant_confirmed'
  | 'unauthorized_client_3x_exhausted'
  | 'access_denied_terminal'
  | 'invalid_client_ops_bug_no_deactivate'
  | 'race_detected_no_deactivate'
  | 'generic_400_no_deactivate';

interface DeactivationLogPayload {
  decision: 'deactivate' | 'no_deactivate';
  rationale: DeactivationRationale;
  connection_id: string;
  business_id?: string;
  tenant_id?: string;
  attempt: number;
  xero_status: number;
  xero_error_code: string;
  xero_error_body: string; // truncated to 500 chars
  expires_at_pre: string;
  expires_at_post?: string;
  updated_at_pre?: string;
  updated_at_post?: string;
}

/**
 * Single structured log line for every deactivation decision.
 * 53-05 will wrap this with Sentry.captureException; 53-03 only ensures
 * the data is in scope.
 */
function logDeactivationDecision(payload: DeactivationLogPayload): void {
  // Single line, JSON-serializable. 53-05 will replace this with Sentry capture.
  console.error('[Token Manager] deactivation_decision', JSON.stringify(payload));
}

/**
 * Parse the JSON `error` field out of a Xero error response body.
 * Returns '' if not parseable or absent.
 */
function extractErrorCode(errorText: string): string {
  try {
    const data = JSON.parse(errorText);
    return typeof data.error === 'string' ? data.error : '';
  } catch {
    return '';
  }
}

function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1) + '…';
}

/**
 * Parse an HTTP Retry-After header into milliseconds (REL-N3).
 * Supports both RFC-7231 forms: delta-seconds (e.g. "30") and an HTTP-date
 * (e.g. "Wed, 21 Oct 2026 07:28:00 GMT"). Returns null when the header is
 * absent or unparseable; clamps past dates to 0.
 */
function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (trimmed === '') return null;

  // delta-seconds form — a bare non-negative integer count of seconds.
  if (/^\d+$/.test(trimmed)) {
    return parseInt(trimmed, 10) * 1000;
  }

  // HTTP-date form — wait until the given instant (never negative).
  const dateMs = Date.parse(trimmed);
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }

  return null;
}

/**
 * Re-fetch a connection row after a token refresh failure to detect
 * whether a sibling process rotated the token while we were calling Xero.
 * Returns the latest row + a `raceDetected` flag (true if expires_at advanced
 * past the threshold OR updated_at is newer than the snapshot we held).
 *
 * SELECT includes business_id + tenant_id so the deactivation log payload
 * can populate those fields (53-05 needs them for Sentry tags — F3 fix).
 */
async function refetchConnectionForRaceCheck(
  connectionId: string,
  preFailureUpdatedAt: string | undefined,
  supabase: SupabaseClient
): Promise<{
  row: (XeroConnection & { updated_at: string }) | null;
  raceDetected: boolean;
}> {
  const { data, error } = await supabase
    .from('xero_connections')
    .select('id, business_id, tenant_id, expires_at, updated_at, access_token, refresh_token, is_active')
    .eq('id', connectionId)
    .single();

  if (error || !data) {
    return { row: null, raceDetected: false };
  }

  const now = new Date();
  const thresholdTime = new Date(now.getTime() + REFRESH_THRESHOLD_MINUTES * 60 * 1000);
  const expiresAtAdvanced = new Date(data.expires_at) > thresholdTime;
  const updatedAtAdvanced = preFailureUpdatedAt
    ? new Date(data.updated_at) > new Date(preFailureUpdatedAt)
    : false;

  return {
    row: data as XeroConnection & { updated_at: string },
    raceDetected: expiresAtAdvanced || updatedAtAdvanced,
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Get a valid access token, refreshing if needed
 * This is the main entry point for all Xero API calls
 */
export async function getValidAccessToken(
  connectionOrId: XeroConnection | { id: string },
  supabase: SupabaseClient
): Promise<TokenRefreshResult> {
  // Always re-fetch connection from database to ensure we have latest tokens
  // This prevents stale token issues when another process has refreshed
  const connectionId = connectionOrId.id;

  const { data: connection, error: fetchError } = await supabase
    .from('xero_connections')
    .select('*')
    .eq('id', connectionId)
    .single();

  if (fetchError || !connection) {
    console.error('[Token Manager] Failed to fetch connection:', fetchError);
    return {
      success: false,
      error: 'database_error',
      message: 'Failed to fetch connection from database',
      shouldDeactivate: false
    };
  }

  const now = new Date();
  const expiry = new Date(connection.expires_at);
  const thresholdTime = new Date(now.getTime() + REFRESH_THRESHOLD_MINUTES * 60 * 1000);

  // Decrypt tokens
  let decryptedAccessToken: string;
  let decryptedRefreshToken: string;

  try {
    decryptedAccessToken = decrypt(connection.access_token);
    decryptedRefreshToken = decrypt(connection.refresh_token);
  } catch (error) {
    console.error('[Token Manager] Failed to decrypt tokens:', error);
    return {
      success: false,
      error: 'database_error',
      message: 'Failed to decrypt tokens',
      shouldDeactivate: true
    };
  }

  // If token is still valid beyond threshold, return it
  if (expiry > thresholdTime) {
    console.log(`[Token Manager] Token still valid, expires at ${expiry.toISOString()}`);
    return {
      success: true,
      accessToken: decryptedAccessToken
    };
  }

  console.log(`[Token Manager] Token expires at ${expiry.toISOString()}, refreshing...`);

  // Check if another process is already refreshing (race condition prevention)
  let lockResult = await acquireRefreshLock(connection.id, supabase);

  // Snapshot of the row state we're going to use for the refresh.
  // If we acquire the lock, we re-fetch (closing Hole A); otherwise we use
  // the initial fetch that we already did above (best-effort fallback).
  let workingRow: any = connection;

  if (!lockResult.acquired) {
    // ─── REL-N4: poll for the lock-holder's result up to the lock TTL ──────
    // A sibling holds the refresh lock. The previous code slept a fixed 2s
    // ONCE and, if the holder hadn't finished, fell straight through to an
    // UNLOCKED self-refresh. Under Xero backoff the holder's refresh routinely
    // takes >2s, so every concurrent caller would then refresh in parallel —
    // each rotating the single-use refresh token out from under the others
    // (a rotated-token stampede that bricks the connection).
    //
    // Instead, poll for up to ~LOCK_TTL_MS — the longest a healthy holder can
    // legitimately be mid-refresh:
    //   - if the sibling rotates the token (expires_at advances past the
    //     threshold) → return that fresh token immediately;
    //   - if the lock frees up (sibling released it, or its lock aged past the
    //     TTL) → take it over and do a *locked* refresh via the acquired path;
    //   - only if the entire TTL window elapses with neither happening (holder
    //     wedged) do we fall through to a best-effort unlocked self-refresh, so
    //     a stuck sibling can't block this caller forever.
    console.log('[Token Manager] Another process is refreshing, waiting for it to finish...');

    const pollDeadline = Date.now() + LOCK_TTL_MS;
    while (Date.now() < pollDeadline) {
      await sleep(LOCK_POLL_INTERVAL_MS);

      const { data: updatedConnection } = await supabase
        .from('xero_connections')
        .select('*')
        .eq('id', connection.id)
        .single();

      // Sibling completed the refresh — use its rotated token.
      if (updatedConnection && new Date(updatedConnection.expires_at) > thresholdTime) {
        try {
          return {
            success: true,
            accessToken: decrypt(updatedConnection.access_token)
          };
        } catch (err) {
          console.error('[Token Manager] Failed to decrypt sibling-rotated access token:', err);
          return {
            success: false,
            error: 'database_error',
            message: 'Failed to decrypt sibling-rotated tokens',
            shouldDeactivate: false,
          };
        }
      }

      // Token still stale. Try to take over the lock — this succeeds once the
      // sibling releases it (or its lock ages past the TTL). If we get it, drop
      // into the locked-refresh path below (which re-fetches the freshest row).
      lockResult = await acquireRefreshLock(connection.id, supabase);
      if (lockResult.acquired) {
        break;
      }
    }

    if (!lockResult.acquired) {
      // TTL elapsed and the lock never cleared — the holder is wedged. Best-effort
      // UNLOCKED self-refresh with the freshest row we can read, so this caller
      // isn't blocked indefinitely by a stuck sibling.
      console.warn('[Token Manager] Refresh lock did not clear within TTL; attempting best-effort unlocked refresh.');
      const { data: latestRow } = await supabase
        .from('xero_connections')
        .select('*')
        .eq('id', connection.id)
        .single();

      if (latestRow) {
        // One last check: a sibling may have rotated right at the deadline.
        if (new Date(latestRow.expires_at) > thresholdTime) {
          try {
            return {
              success: true,
              accessToken: decrypt(latestRow.access_token)
            };
          } catch (err) {
            console.error('[Token Manager] Failed to decrypt sibling-rotated access token (post-TTL):', err);
            return {
              success: false,
              error: 'database_error',
              message: 'Failed to decrypt sibling-rotated tokens',
              shouldDeactivate: false,
            };
          }
        }

        workingRow = latestRow;
        try {
          decryptedRefreshToken = decrypt(latestRow.refresh_token);
        } catch {
          // Keep stale rt; refreshTokenWithRetry will fail and surface error.
        }
      }
    }
  }

  if (lockResult.acquired) {
    // ─── Hole A close: re-fetch row immediately after acquiring the lock. ──
    // A sibling may have completed a full refresh between our initial fetch
    // and our lock acquire. If expires_at advanced past threshold, short-circuit
    // success (no Xero call needed). Otherwise, re-decrypt the now-fresh
    // refresh_token before calling Xero.
    const { data: freshRow, error: refetchErr } = await supabase
      .from('xero_connections')
      .select('*')
      .eq('id', connection.id)
      .single();

    if (refetchErr || !freshRow) {
      await releaseRefreshLock(connection.id, supabase);
      console.error('[Token Manager] Post-lock re-fetch failed:', refetchErr);
      return {
        success: false,
        error: 'database_error',
        message: 'Failed to re-fetch connection after acquiring lock',
        shouldDeactivate: false,
      };
    }

    workingRow = freshRow;

    // If a sibling already refreshed during our lock-acquisition window,
    // expires_at will be past the threshold — short-circuit success.
    if (new Date(freshRow.expires_at) > thresholdTime) {
      await releaseRefreshLock(connection.id, supabase);
      try {
        return {
          success: true,
          accessToken: decrypt(freshRow.access_token),
        };
      } catch (err) {
        console.error('[Token Manager] Failed to decrypt sibling-rotated access token (post-lock):', err);
        return {
          success: false,
          error: 'database_error',
          message: 'Failed to decrypt sibling-rotated tokens (post-lock)',
          shouldDeactivate: false,
        };
      }
    }

    // Re-decrypt with the fresh refresh_token before calling Xero
    try {
      decryptedRefreshToken = decrypt(freshRow.refresh_token);
    } catch (err) {
      await releaseRefreshLock(connection.id, supabase);
      console.error('[Token Manager] Failed to decrypt fresh refresh token:', err);
      return {
        success: false,
        error: 'database_error',
        message: 'Failed to decrypt refresh token after lock acquire',
        shouldDeactivate: false,
      };
    }
  }

  // decryptedAccessToken is no longer used past this point — the refresh path
  // takes over. Suppress unused-var noise for clarity.
  void decryptedAccessToken;

  try {
    // Attempt refresh with retry logic. Pass workingRow context so the
    // pre-deactivation refetch (Hole B) can compare against fresh state.
    const result = await refreshTokenWithRetry(
      decryptedRefreshToken,
      connection.id,
      supabase,
      {
        business_id: workingRow.business_id,
        tenant_id: workingRow.tenant_id,
        expires_at_pre: workingRow.expires_at,
        updated_at_pre: workingRow.updated_at,
      }
    );

    return result;
  } finally {
    // Always release the lock if we acquired it. (Releasing when we don't
    // hold it would still be safe — it just clears token_refreshing_at —
    // but skip the extra DB write.)
    if (lockResult.acquired) {
      await releaseRefreshLock(connection.id, supabase);
    }
  }
}

interface RefreshContext {
  business_id?: string;
  tenant_id?: string;
  expires_at_pre: string;
  updated_at_pre?: string;
}

/**
 * Refresh token with exponential backoff retry.
 *
 * Per-error-code policy (53-03):
 *   - invalid_grant      → re-fetch row; if no race, deactivate. Terminal.
 *   - access_denied      → re-fetch row; if no race, deactivate. Terminal.
 *   - unauthorized_client → retry up to MAX_RETRIES; deactivate ONLY if the
 *     final attempt still returns unauthorized_client (after race re-check).
 *   - invalid_client     → never deactivate (config/ops bug). Retry like transient.
 *   - generic 400 (no error field) → retry like transient. Never deactivate.
 *   - 429, 5xx, network → retry like transient. Never deactivate.
 */
async function refreshTokenWithRetry(
  refreshToken: string,
  connectionId: string,
  supabase: SupabaseClient,
  ctx: RefreshContext,
  attempt: number = 1
): Promise<TokenRefreshResult> {
  try {
    const response = await fetch('https://identity.xero.com/connect/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(
          `${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`
        ).toString('base64')}`
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      })
    });

    if (response.ok) {
      const tokens = await response.json();

      // Calculate new expiry
      const newExpiry = new Date();
      newExpiry.setSeconds(newExpiry.getSeconds() + tokens.expires_in);

      // ─── REL-N5: persist the rotated token, with retry. ────────────────────
      // Xero rotates refresh tokens: the moment this 200 came back, the OLD
      // refresh token was invalidated and the only valid one is the freshly
      // issued `tokens.refresh_token`. If we fail to persist it, the DB is left
      // holding a now-dead token; the next refresh reads it, gets invalid_grant,
      // and a perfectly healthy tenant is deactivated by a transient write blip.
      //
      // So we MUST persist before reporting success. The new token is valid and
      // in-hand, so a write blip is fully recoverable — retry a few times.
      const encryptedAccessToken = encrypt(tokens.access_token);
      const encryptedRefreshToken = encrypt(tokens.refresh_token);
      const newExpiryIso = newExpiry.toISOString();

      let updateError: unknown = null;
      for (let saveAttempt = 1; saveAttempt <= MAX_TOKEN_SAVE_ATTEMPTS; saveAttempt++) {
        const { error } = await supabase
          .from('xero_connections')
          .update({
            access_token: encryptedAccessToken,
            refresh_token: encryptedRefreshToken,
            expires_at: newExpiryIso,
            updated_at: new Date().toISOString()
          })
          .eq('id', connectionId);

        if (!error) {
          updateError = null;
          break;
        }

        updateError = error;
        console.error(
          `[Token Manager] Failed to save refreshed tokens (attempt ${saveAttempt}/${MAX_TOKEN_SAVE_ATTEMPTS}):`,
          error,
        );
        if (saveAttempt < MAX_TOKEN_SAVE_ATTEMPTS) {
          await sleep(TOKEN_SAVE_RETRY_DELAY_MS);
        }
      }

      if (updateError) {
        // Rotation succeeded at Xero but we could NOT persist the new token
        // after every retry. Do NOT report success — that would mask a real
        // token desync and strand the connection on a dead DB token. Return a
        // transient, NON-deactivating failure so the caller retries (Xero keeps
        // the previous refresh token valid for a short grace window) instead of
        // committing to an unpersisted rotation. The connection stays active.
        try {
          Sentry.captureMessage('Xero token rotated but failed to persist', {
            level: 'error',
            tags: {
              invariant: 'xero_token_persist_failed',
              connection_id: connectionId,
              tenant_id: ctx.tenant_id ?? 'unknown',
              business_id: ctx.business_id ?? 'unknown',
            },
          } as any);
        } catch {
          // Sentry outage must never change the return contract below.
        }
        return {
          success: false,
          error: 'database_error',
          message: 'Token refreshed but failed to save to database after retries',
          shouldDeactivate: false,
        };
      }

      console.log('[Token Manager] Token refreshed successfully, expires:', newExpiryIso);
      return {
        success: true,
        accessToken: tokens.access_token
      };
    }

    // Handle error responses
    const errorText = await response.text();
    const errorCode = extractErrorCode(errorText);
    const errorInfo = categorizeError(response.status, errorText, attempt);

    // ─── Hole B close: pre-deactivation refetch. ───────────────────────────
    // If the policy says "deactivate", re-fetch the row to detect a sibling
    // who successfully rotated while we were calling Xero. If raceDetected,
    // suppress deactivation and return the sibling's fresh access_token.
    if (errorInfo.shouldDeactivate) {
      const { row: postFailureRow, raceDetected } = await refetchConnectionForRaceCheck(
        connectionId,
        ctx.updated_at_pre,
        supabase,
      );

      if (raceDetected && postFailureRow) {
        logDeactivationDecision({
          decision: 'no_deactivate',
          rationale: 'race_detected_no_deactivate',
          connection_id: connectionId,
          business_id: postFailureRow.business_id ?? ctx.business_id,
          tenant_id: postFailureRow.tenant_id ?? ctx.tenant_id,
          attempt,
          xero_status: response.status,
          xero_error_code: errorCode,
          xero_error_body: truncate(errorText, 500),
          expires_at_pre: ctx.expires_at_pre,
          expires_at_post: postFailureRow.expires_at,
          updated_at_pre: ctx.updated_at_pre,
          updated_at_post: postFailureRow.updated_at,
        });
        try {
          return { success: true, accessToken: decrypt(postFailureRow.access_token) };
        } catch (decryptErr) {
          console.error('[Token Manager] Race detected but failed to decrypt sibling token:', decryptErr);
          return {
            success: false,
            error: 'database_error',
            message: 'Race detected but failed to decrypt sibling token',
            shouldDeactivate: false,
          };
        }
      }

      // Confirmed no race. Pick the rationale based on the error code.
      let rationale: DeactivationRationale;
      if (errorCode === 'access_denied') {
        rationale = 'access_denied_terminal';
      } else if (errorCode === 'unauthorized_client') {
        rationale = 'unauthorized_client_3x_exhausted';
      } else {
        // invalid_grant (or any future terminal code that lands here)
        rationale = 'invalid_grant_confirmed';
      }

      logDeactivationDecision({
        decision: 'deactivate',
        rationale,
        connection_id: connectionId,
        business_id: postFailureRow?.business_id ?? ctx.business_id,
        tenant_id: postFailureRow?.tenant_id ?? ctx.tenant_id,
        attempt,
        xero_status: response.status,
        xero_error_code: errorCode,
        xero_error_body: truncate(errorText, 500),
        expires_at_pre: ctx.expires_at_pre,
        expires_at_post: postFailureRow?.expires_at,
        updated_at_pre: ctx.updated_at_pre,
        updated_at_post: postFailureRow?.updated_at,
      });

      console.error(`[Token Manager] Permanent token error: ${errorInfo.error} - ${errorInfo.message}`);

      // ─── Phase 53-05: Sentry capture for system-detected deactivation. ──
      // ONE event per real deactivation. User-initiated disconnects use the
      // /api/Xero/disconnect DELETE path (53-01) and never reach this branch,
      // so everything captured here is unintentional / observable failure.
      // The cron route (53-04) intentionally does NOT capture deactivations
      // — that would double-report; only the canonical event below fires.
      // Wrapped in try/catch so a Sentry outage NEVER aborts the deactivation
      // DB write that follows.
      try {
        Sentry.captureMessage('Xero connection deactivated', {
          level: 'error',
          tags: {
            invariant: 'xero_connection_deactivated',
            tenant_id: postFailureRow?.tenant_id ?? ctx.tenant_id ?? 'unknown',
            business_id: postFailureRow?.business_id ?? ctx.business_id ?? 'unknown',
            connection_id: connectionId,
            error_code: errorCode || 'unknown',
            // Sentry tags MUST be strings — coerce attempt explicitly.
            retry_count: String(attempt),
          },
          extra: {
            xero_status: response.status,
            // Truncate to 4KB to stay well under Sentry's per-event size cap
            // and avoid leaking arbitrary-length response bodies.
            xero_error_body: errorText.slice(0, 4096),
            xero_message: errorInfo.message,
            attempt,
          },
        } as any);
      } catch {
        // Sentry outage must never abort the deactivation write below.
      }

      // Mark connection as inactive
      await supabase
        .from('xero_connections')
        .update({
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', connectionId);

      return errorInfo;
    }

    // For transient errors, retry with backoff. On a 429 (rate limit), honor
    // Xero's Retry-After header instead of blindly using exponential backoff —
    // otherwise we retry too soon and trip the limiter again (REL-N3).
    if (attempt < MAX_RETRIES) {
      const backoffMs = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
      const retryAfterMs =
        response.status === 429 ? parseRetryAfterMs(response.headers.get('retry-after')) : null;

      if (retryAfterMs != null && retryAfterMs > MAX_RETRY_AFTER_MS) {
        // Xero is rate-limiting us for longer than we can usefully wait inside a
        // single invocation. Don't burn the function on a sleep that will still
        // be throttled on wake — surface the transient error so the caller (or
        // the next cron tick) retries later.
        console.warn(
          `[Token Manager] 429 Retry-After ${retryAfterMs}ms exceeds max ${MAX_RETRY_AFTER_MS}ms — deferring retry to caller.`,
        );
        return errorInfo;
      }

      // Wait at least our own exponential backoff, but honor a longer
      // server-supplied Retry-After so we don't immediately re-trip the limiter.
      const delay = retryAfterMs != null ? Math.max(retryAfterMs, backoffMs) : backoffMs;
      console.log(
        `[Token Manager] Retrying in ${delay}ms (attempt ${attempt}/${MAX_RETRIES})${
          retryAfterMs != null ? ` — honoring 429 Retry-After (${retryAfterMs}ms)` : ''
        }...`,
      );
      await sleep(delay);
      return refreshTokenWithRetry(refreshToken, connectionId, supabase, ctx, attempt + 1);
    }

    console.error(`[Token Manager] All ${MAX_RETRIES} retry attempts failed`);
    return errorInfo;

  } catch (error) {
    // Network error
    if (attempt < MAX_RETRIES) {
      const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
      console.log(`[Token Manager] Network error, retrying in ${delay}ms (attempt ${attempt}/${MAX_RETRIES})...`);
      await sleep(delay);
      return refreshTokenWithRetry(refreshToken, connectionId, supabase, ctx, attempt + 1);
    }

    console.error('[Token Manager] Network error after all retries:', error);
    return {
      success: false,
      error: 'network_error',
      message: 'Failed to reach Xero servers after multiple attempts'
    };
  }
}

/**
 * Categorize error response from Xero (53-03 policy).
 *
 * Per-error-code policy (53-RESEARCH.md §8):
 *   400 + invalid_grant       → shouldDeactivate=true (terminal — caller does race-check first)
 *   400 + access_denied       → shouldDeactivate=true (user revoked in Xero — terminal)
 *   400 + unauthorized_client → shouldDeactivate=(attempt >= MAX_RETRIES)
 *                               (transient on attempts 1..MAX_RETRIES-1; deactivate on the final attempt)
 *   401/400 + invalid_client  → shouldDeactivate=false (config/ops bug — never deactivate)
 *   400 + no `error` field    → shouldDeactivate=false (Xero brief stutter — retry, never deactivate)
 *   429                       → transient (no shouldDeactivate)
 *   5xx                       → transient (no shouldDeactivate)
 *   default                   → transient (no shouldDeactivate)
 *
 * Note (53-PLAN-CHECK F1): On HEAD, `invalid_client` had no explicit branch
 * — it actually fell to the catch-all (no deactivate by accident), but with
 * no rationale string and no clear policy. This rewrite makes it explicit.
 *
 * Exported for direct unit testing per 53-03 plan.
 */
export function categorizeError(
  status: number,
  errorText: string,
  attempt: number
): TokenRefreshResult {
  // Parse error if JSON
  let errorData: any = {};
  try {
    errorData = JSON.parse(errorText);
  } catch {
    // Not JSON, use raw text
  }

  const errorCode = errorData.error || '';

  // invalid_grant — terminal. Caller does post-failure refetch first to
  // catch the rotation race; if no race, the connection is deactivated.
  if (errorCode === 'invalid_grant') {
    return {
      success: false,
      error: 'token_expired_permanently',
      message: 'Refresh token has expired (60 days) or has been rotated. Please reconnect Xero.',
      shouldDeactivate: true,
    };
  }

  // access_denied — user explicitly revoked authorization in Xero. Terminal.
  if (errorCode === 'access_denied') {
    return {
      success: false,
      error: 'token_revoked',
      message: 'Access has been revoked in Xero. Please reconnect.',
      shouldDeactivate: true,
    };
  }

  // unauthorized_client — Xero's transient client-credentials error per Nango
  // (53-RESEARCH.md §8). Retry on attempts 1..MAX_RETRIES-1; deactivate only
  // if the FINAL attempt still returns this code (caller does race-check first).
  if (errorCode === 'unauthorized_client') {
    return {
      success: false,
      error: 'token_revoked',
      message:
        attempt < MAX_RETRIES
          ? 'Xero returned unauthorized_client (often transient); will retry.'
          : `Xero returned unauthorized_client on ${MAX_RETRIES} successive attempts.`,
      shouldDeactivate: attempt >= MAX_RETRIES,
    };
  }

  // invalid_client — wrong client_id/secret. NEVER deactivate (config/ops bug).
  // Treated as transient by the retry loop; since shouldDeactivate is false,
  // no deactivation log is emitted.
  if (errorCode === 'invalid_client') {
    return {
      success: false,
      error: 'unknown',
      message: 'Xero rejected app credentials (invalid_client). This is an ops/config issue.',
      shouldDeactivate: false,
    };
  }

  // Generic 400 with no error field — Xero brief stutter. Retry, never deactivate.
  if (status === 400 && !errorCode) {
    return {
      success: false,
      error: 'unknown',
      message: `Bad request to Xero: ${truncate(errorText, 200)}`,
      shouldDeactivate: false,
    };
  }

  // Rate limiting - retry later
  if (status === 429) {
    return {
      success: false,
      error: 'rate_limited',
      message: 'Too many requests to Xero. Please try again later.',
    };
  }

  // Server errors - transient
  if (status >= 500) {
    return {
      success: false,
      error: 'server_error',
      message: 'Xero API is temporarily unavailable.',
    };
  }

  // Unknown error - transient by default (no shouldDeactivate)
  return {
    success: false,
    error: 'unknown',
    message: `Unexpected error: ${status} - ${truncate(errorText, 200)}`,
  };
}

/**
 * Acquire a lock to prevent concurrent token refreshes
 * Uses database timestamp to coordinate between processes
 */
async function acquireRefreshLock(
  connectionId: string,
  supabase: SupabaseClient
): Promise<{ acquired: boolean }> {
  const now = new Date();
  const lockExpiry = new Date(now.getTime() - LOCK_TTL_MS); // Lock expires after LOCK_TTL_MS

  // Try to acquire lock by setting token_refreshing_at
  // Only succeed if no other process has the lock
  const { data, error } = await supabase
    .from('xero_connections')
    .update({ token_refreshing_at: now.toISOString() })
    .eq('id', connectionId)
    .or(`token_refreshing_at.is.null,token_refreshing_at.lt.${lockExpiry.toISOString()}`)
    .select('id')
    .single();

  if (error || !data) {
    return { acquired: false };
  }

  return { acquired: true };
}

/**
 * Release the refresh lock
 */
async function releaseRefreshLock(
  connectionId: string,
  supabase: SupabaseClient
): Promise<void> {
  await supabase
    .from('xero_connections')
    .update({ token_refreshing_at: null })
    .eq('id', connectionId);
}

/**
 * Check connection health and return status
 */
export async function checkConnectionHealth(
  connection: XeroConnection
): Promise<{
  isHealthy: boolean;
  expiresIn: number; // minutes until token expires
  refreshTokenAge?: number; // days since connection was created (proxy for refresh token age)
  warnings: string[];
}> {
  const now = new Date();
  const expiry = new Date(connection.expires_at);
  const expiresInMs = expiry.getTime() - now.getTime();
  const expiresInMinutes = Math.floor(expiresInMs / 60000);

  const warnings: string[] = [];

  // Check if token is expired or about to expire
  if (expiresInMinutes <= 0) {
    warnings.push('Access token has expired');
  } else if (expiresInMinutes <= 5) {
    warnings.push('Access token expires in less than 5 minutes');
  }

  // Note: We can't directly check refresh token age without storing creation date
  // Could add this field to xero_connections table in future

  return {
    isHealthy: expiresInMinutes > 0 && connection.is_active,
    expiresIn: expiresInMinutes,
    warnings
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
