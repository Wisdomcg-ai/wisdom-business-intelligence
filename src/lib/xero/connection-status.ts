/**
 * THE ONE DEFINITION of "is this business's Xero connection alive".
 *
 * Every surface that renders a connection state imports `classifyXeroConnection`
 * and nothing re-derives it inline. Two independently-written definitions of
 * "connected" that can disagree is the bug class this module exists to prevent.
 *
 * ── Why this was rewritten (2026-07-29) ─────────────────────────────────────
 * The previous version asked ONE question — "was this row touched recently?" —
 * and answered it from `max(last_synced_at, updated_at)` against a 12h window.
 * Both halves were broken:
 *
 *   • `updated_at` is written by an UNCONDITIONAL database trigger
 *     (`update_xero_connections_updated_at`, no WHEN clause) on every UPDATE of
 *     any column. The token refresh writes the row TWICE before it knows whether
 *     Xero said yes — `acquireRefreshLock` sets `token_refreshing_at`, and the
 *     `finally` block clears it whatever happened. So a connection failing its
 *     refresh every single tick still looked one minute old. For any row the 6h
 *     cron reached, the predicate collapsed to `is_active === true` and `stale`
 *     became unreachable: dead UI.
 *
 *   • `last_synced_at` was never written by the sync orchestrator at all, so the
 *     other half of the max() was noise in both directions.
 *
 * The fix is not a wider window. It is to ask two questions off two clocks that
 * only move on a real success.
 *
 * ── The two axes ────────────────────────────────────────────────────────────
 *   AUTH — can we still talk to Xero?      clock: last successful token grant
 *   DATA — are the numbers on screen current?  clock: last successful data sync
 *
 * The auth clock is derived, not stored: `expires_at` is written ONLY inside the
 * `if (response.ok)` branch of the token refresh (plus connect/reconnect), and
 * Xero access tokens live 30 minutes. So `expires_at - ACCESS_TOKEN_TTL_MS` is an
 * exact record of when Xero last handed us a token — untouched by the lock
 * writes that corrupted `updated_at`. A purpose-built `last_token_refresh_at`
 * column is the eventual home for this; the derivation is truthful today and
 * needs no migration.
 *
 * ── The governing rule ──────────────────────────────────────────────────────
 * Worst truth wins, and "we could not check" is a state, never a green tick.
 * That is what `unknown` is for. A classifier that degrades to `connected` when
 * its inputs fail is worse than no classifier, because it is confidently wrong.
 */

/**
 * Connection state. Wire format — renaming requires updating both API routes and
 * the pill components that switch on it.
 *
 * Precedence, worst first: dead > unknown > auth_stale > data_stale /
 * pending_first_sync > connected. Never round up.
 */
export type XeroConnectionStatus =
  /** No row under either id form. Never connected — distinct from disconnected. */
  | 'none'
  /** is_active=false. Xero terminally refused; needs a human to reconnect. */
  | 'dead'
  /** We could not evaluate. Never render this green. */
  | 'unknown'
  /** Active, but the token pipe has not produced a token in 12h. */
  | 'auth_stale'
  /** Connected, never synced, and the first nightly run is not yet overdue. */
  | 'pending_first_sync'
  /** Token fine, numbers old. */
  | 'data_stale'
  /** Both clocks fresh. */
  | 'connected';

/** Xero access-token lifetime. The auth clock is derived by subtracting this. */
export const ACCESS_TOKEN_TTL_MS = 30 * 60 * 1000;

/** 12h = 2× the 6h refresh cron, so one missed run is tolerated and two are not. */
export const TOKEN_VERIFIED_WINDOW_MS = 12 * 60 * 60 * 1000;

/**
 * How old the DATA may be before we say so. 48h tolerates a full day of missed 6-hourly sync runs before alarming.
 *
 * The old value was 8 days, chosen when the clock was a manual-click column that
 * had to tolerate a weekly sync. Now that the clock is the sync cron, 8 days
 * would let a client serve week-old numbers into a coaching call under a green
 * tick. Callers may pass a laxer threshold — the owner-facing surface uses 72h
 * so an owner is not alarmed by something their coach has not seen yet.
 */
export const DATA_STALE_MS = 48 * 60 * 60 * 1000;

/**
 * Grace for a brand-new connection that has never synced: slightly more than one
 * nightly cycle, so "connected this afternoon, first sync on the next 6-hourly run" is not
 * an alarm, but "connected three days ago and never synced" is.
 *
 * This closes a real hole. The old freshness check exempted never-synced
 * connections entirely, which meant a connection that never worked was invisible
 * forever. Every newly onboarded client starts in exactly that state.
 */
export const FIRST_SYNC_GRACE_MS = 26 * 60 * 60 * 1000;

/** The columns any caller must select for the classification to be meaningful. */
export interface XeroConnectionStatusRow {
  id: string;
  business_id: string;
  tenant_id: string | null;
  is_active: boolean | null;
  last_synced_at: string | null;
  updated_at: string | null;
  expires_at: string | null;
  created_at: string | null;
}

/**
 * The data clock, supplied by the caller because it needs a `sync_jobs` lookup
 * this pure module must not perform.
 *
 * `lookupOk` is not optional and not defaulted on purpose: a caller that cannot
 * establish data freshness must say so, and gets `unknown` rather than a green
 * tick. Making it default to true would reintroduce fail-open by omission.
 */
export interface XeroDataClock {
  /** Epoch ms of the last successful sync, or null if there has never been one. */
  lastSyncMs: number | null;
  /** False when the sync_jobs lookup itself failed. */
  lookupOk: boolean;
}

export interface XeroConnectionClassification {
  status: XeroConnectionStatus;
  /** Epoch-ISO of the last successful token grant, derived from expires_at. */
  lastTokenRefreshAt: string | null;
  /** Epoch-ISO of the last successful data sync, from the caller's clock. */
  lastSyncAt: string | null;
  expiresAt: string | null;
  connectionId: string | null;
}

function parseMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

/** Milliseconds since a timestamp, or null when it is absent/unparseable. */
function ageMsOf(iso: string | null | undefined, nowMs: number): number | null {
  const t = parseMs(iso);
  return t === null ? null : nowMs - t;
}

/**
 * Classify ONE connection row (or its absence).
 *
 * `nowMs` is injectable so tests pin behaviour at a threshold boundary instead
 * of racing the clock.
 */
export function classifyXeroConnection(
  conn: XeroConnectionStatusRow | null | undefined,
  clock: XeroDataClock,
  nowMs: number = Date.now(),
  dataStaleMs: number = DATA_STALE_MS,
): XeroConnectionClassification {
  const base = {
    lastTokenRefreshAt: null,
    lastSyncAt: clock.lastSyncMs !== null ? new Date(clock.lastSyncMs).toISOString() : null,
    expiresAt: conn?.expires_at ?? null,
    connectionId: conn?.id ?? null,
  };

  if (!conn) return { ...base, status: 'none', lastSyncAt: null, expiresAt: null, connectionId: null };

  // Terminal refusal outranks everything — no clock can rescue a row Xero has
  // stopped accepting.
  if (!conn.is_active) return { ...base, status: 'dead' };

  const expiresMs = parseMs(conn.expires_at);
  const tokenGrantedMs = expiresMs === null ? null : expiresMs - ACCESS_TOKEN_TTL_MS;
  const lastTokenRefreshAt = tokenGrantedMs === null ? null : new Date(tokenGrantedMs).toISOString();

  // We could not evaluate. An unparseable expires_at leaves the auth axis
  // unknowable; a blank tenant_id means the data lookup could not have been
  // keyed correctly even if it returned rows; a failed lookup speaks for itself.
  if (tokenGrantedMs === null || !conn.tenant_id?.trim() || !clock.lookupOk) {
    return { ...base, status: 'unknown', lastTokenRefreshAt };
  }

  // AUTH axis. This is the one that catches a connection dying quietly: it moves
  // only when Xero actually hands over a token, so a refresh failing every tick
  // ages this out within 12h no matter how often the row is written.
  if (nowMs - tokenGrantedMs >= TOKEN_VERIFIED_WINDOW_MS) {
    return { ...base, status: 'auth_stale', lastTokenRefreshAt };
  }

  // DATA axis. Never synced is not automatically an alarm — but it stops being
  // excusable once the first nightly run should have happened.
  if (clock.lastSyncMs === null) {
    const connectedAgeMs = ageMsOf(conn.created_at, nowMs);
    const withinGrace = connectedAgeMs !== null && connectedAgeMs < FIRST_SYNC_GRACE_MS;
    return { ...base, status: withinGrace ? 'pending_first_sync' : 'data_stale', lastTokenRefreshAt };
  }

  if (nowMs - clock.lastSyncMs >= dataStaleMs) {
    return { ...base, status: 'data_stale', lastTokenRefreshAt };
  }

  return { ...base, status: 'connected', lastTokenRefreshAt };
}

/** True for the states a human needs to do something about. */
export function needsAttention(status: XeroConnectionStatus): boolean {
  return status === 'dead' || status === 'auth_stale' || status === 'data_stale' || status === 'unknown';
}

/**
 * Which of two rows for the SAME business wins.
 *
 * Callers fetch ordered by `updated_at DESC`, so the first row seen for a
 * business is already the most recently touched. The one override: an ACTIVE row
 * beats a dead row even when the dead row was touched more recently — a business
 * that reconnected must not keep reading as disconnected because the old row got
 * stamped on its way out.
 */
export function preferConnection<T extends { is_active: boolean | null }>(
  existing: T | null | undefined,
  candidate: T,
): T {
  if (!existing) return candidate;
  if (!existing.is_active && candidate.is_active) return candidate;
  return existing;
}
