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
 *
 * ── A business is as healthy as its worst org (2026-09-15) ──────────────────
 * Dragon Roofing has two Xero orgs and IICT Group three. Both business-level
 * routes used to reduce a business's rows to ONE representative — the most
 * recently written active row — and classify only that. Every token refresh and
 * every sync bumps updated_at, so the representative was simply whichever org
 * was written last. From 10 Sep 2026 IICT Group Pty Ltd returned 403 on every
 * sync while its siblings synced fine, and IICT's pill read data_stale only
 * until a sibling's next write, then connected again: a dead org hidden by write
 * order. Business-level surfaces call `classifyBusinessConnections`, which
 * classifies every org against its own data clock and reports the worst.
 */

/**
 * Connection state. Wire format — renaming requires updating both API routes and
 * the pill components that switch on it.
 *
 * Precedence, worst first: dead > unknown > auth_stale > data_stale >
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
  /** Display only: names the org behind a business-level status. */
  tenant_name?: string | null;
  /**
   * Admin consolidation setting. Together with is_active=false it marks an org
   * retired on purpose; absent or null never does.
   */
  include_in_consolidation?: boolean | null;
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

/**
 * The sync_jobs lookup exactly as `getLastSyncByTenant` returns it: the last
 * successful sync per Xero tenant, and whether the lookup itself worked.
 */
export interface XeroSyncClock {
  ok: boolean;
  byTenant: ReadonlyMap<string, number>;
}

/**
 * One row's data clock: the fresher of the row's own `last_synced_at` and the
 * sync_jobs clock for ITS tenant. The join is on tenant_id rather than
 * business_id on purpose — xero_connections.business_id is in the businesses.id
 * space while sync_jobs.business_id is business_profiles.id, so a business_id
 * join silently returns zero rows for every connection.
 */
export function dataClockFor(
  row: Pick<XeroConnectionStatusRow, 'tenant_id' | 'last_synced_at'>,
  syncClock: XeroSyncClock,
): XeroDataClock {
  const fromColumn = parseMs(row.last_synced_at) ?? 0;
  // Exact key first (sync_jobs carries the row's own tenant_id), then trimmed —
  // the same normalisation the business grouping uses.
  const jobsMs = row.tenant_id
    ? syncClock.byTenant.get(row.tenant_id) ?? syncClock.byTenant.get(row.tenant_id.trim())
    : undefined;
  const fromJobs = jobsMs !== undefined && Number.isFinite(jobsMs) ? jobsMs : 0;
  const freshest = Math.max(fromColumn, fromJobs);
  return { lastSyncMs: freshest > 0 ? freshest : null, lookupOk: syncClock.ok };
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

/** One Xero org's classification, named so a business-level status can say which org it is about. */
export interface XeroOrgClassification extends XeroConnectionClassification {
  tenantId: string | null;
  tenantName: string | null;
}

/**
 * A business classified from all of its orgs. The headline fields are the worst
 * org's — for display, `statusScope` says whether naming that org is meaningful.
 */
export interface XeroBusinessConnectionClassification extends XeroOrgClassification {
  /** Every org that counted, worst first. A dead row superseded by a live row for the same org is not here. */
  orgs: XeroOrgClassification[];
  /** Orgs retired on purpose (switched off and excluded from consolidation), worst first. They set nothing. */
  retiredOrgs: XeroOrgClassification[];
  /** How many of `orgs` share the headline status. */
  worstOrgCount: number;
  /**
   * Which part of the business the headline status is about, for a UI prefix:
   * the org's name when one org of several set it ("IICT Group Pty Ltd"),
   * "2 of 3 orgs" when several but not all share it, and null when the status is
   * business-wide — naming one org then would suggest the others are fine.
   */
  statusScope: string | null;
  /**
   * Orgs that ALSO need attention, in a lesser state than the headline — the
   * "(+1 more)". Without it a disconnected org would hide a sibling whose token
   * stopped refreshing until the first was fixed.
   */
  moreOrgsNeedingAttention: number;
}

/**
 * Worst first. data_stale outranks pending_first_sync because only one of them
 * needs a human: one org's old numbers must not hide behind a sibling's "first
 * sync pending". `none` means no rows at all, so it never competes with an org.
 */
const STATUS_SEVERITY: Record<XeroConnectionStatus, number> = {
  dead: 0,
  unknown: 1,
  auth_stale: 2,
  data_stale: 3,
  pending_first_sync: 4,
  connected: 5,
  none: 6,
};

/** ISO instants in time order; null (never synced, never granted) is oldest. */
function compareInstants(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  return Date.parse(a) - Date.parse(b) || (a < b ? -1 : 1);
}

/** Code-unit order, not localeCompare, so the pick cannot vary with the server's locale. Null last. */
function compareText(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

/**
 * A total order, worst first, so a business's result can never depend on the
 * order its rows arrived in. Within one status the most out-of-date org leads —
 * its clock is the one that explains the status (the token clock for
 * auth_stale, the data clock otherwise) — and name, tenant and row id settle
 * whatever is left.
 */
function worstFirst(a: XeroOrgClassification, b: XeroOrgClassification): number {
  const bySeverity = STATUS_SEVERITY[a.status] - STATUS_SEVERITY[b.status];
  if (bySeverity !== 0) return bySeverity;
  const bySync = compareInstants(a.lastSyncAt, b.lastSyncAt);
  const byGrant = compareInstants(a.lastTokenRefreshAt, b.lastTokenRefreshAt);
  return (
    (a.status === 'auth_stale' ? byGrant || bySync : bySync || byGrant) ||
    compareText(a.tenantName, b.tenantName) ||
    compareText(a.tenantId, b.tenantId) ||
    compareText(a.connectionId, b.connectionId)
  );
}

function classifyOrgRow(
  row: XeroConnectionStatusRow,
  syncClock: XeroSyncClock,
  nowMs: number,
  dataStaleMs: number,
): XeroOrgClassification {
  return {
    ...classifyXeroConnection(row, dataClockFor(row, syncClock), nowMs, dataStaleMs),
    tenantId: row.tenant_id?.trim() || null,
    tenantName: row.tenant_name?.trim() || null,
  };
}

/**
 * Classify a BUSINESS from every one of its connection rows, both id forms,
 * dead rows included: each org against its own data clock, worst truth wins.
 *
 * Rows group by Xero org (tenant_id). A dead row speaks for its org only when no
 * live row does, so a reconnect that landed under the other business-id form
 * does not keep reading as disconnected. A dead org with NO live row counts, and
 * makes the business dead: that org has stopped syncing, so the business's
 * numbers are a fraction of it.
 *
 * The one exception is an org RETIRED on purpose: every row switched off AND
 * excluded from consolidation, which only a person can set (the admin
 * consolidation page's two per-org boxes). `is_active=false` alone records no
 * reason — the token manager writes it when Xero refuses — and nothing in the
 * app can delete one org of several, so without this a wound-up entity would
 * hold its business red for good. The token manager never touches
 * include_in_consolidation, so a refused org still reads dead; and if every org
 * is retired they count after all, rather than a business going quiet.
 * (Decided 15 Sep 2026 and raised with Matt.)
 *
 * The result does not depend on row order, which is the property the
 * single-representative reduction lacked.
 */
export function classifyBusinessConnections(
  rows: readonly XeroConnectionStatusRow[],
  syncClock: XeroSyncClock,
  nowMs: number = Date.now(),
  dataStaleMs: number = DATA_STALE_MS,
): XeroBusinessConnectionClassification {
  const rowsByOrg = new Map<string, XeroConnectionStatusRow[]>();
  for (const row of rows) {
    // A blank tenant_id matches nothing, so that row stands alone as its own org.
    const tenant = row.tenant_id?.trim();
    const key = tenant ? `tenant:${tenant}` : `row:${row.id}`;
    const group = rowsByOrg.get(key);
    if (group) group.push(row);
    else rowsByOrg.set(key, [row]);
  }

  const counted: XeroOrgClassification[] = [];
  const retired: XeroOrgClassification[] = [];
  for (const orgRows of rowsByOrg.values()) {
    const live = orgRows.filter((r) => r.is_active === true);
    const classified = (live.length > 0 ? live : orgRows).map((r) =>
      classifyOrgRow(r, syncClock, nowMs, dataStaleMs),
    );
    // Two live rows for one org (one per id form) are two live claims about it.
    classified.sort(worstFirst);
    const isRetired = live.length === 0 && orgRows.every((r) => r.include_in_consolidation === false);
    (isRetired ? retired : counted).push(classified[0]);
  }
  const orgs = counted.length > 0 ? counted : retired;
  const retiredOrgs = counted.length > 0 ? retired : [];
  orgs.sort(worstFirst);
  retiredOrgs.sort(worstFirst);

  const worst = orgs[0];
  if (!worst) {
    return {
      ...classifyXeroConnection(null, { lastSyncMs: null, lookupOk: syncClock.ok }, nowMs, dataStaleMs),
      tenantId: null,
      tenantName: null,
      orgs: [],
      retiredOrgs: [],
      worstOrgCount: 0,
      statusScope: null,
      moreOrgsNeedingAttention: 0,
    };
  }

  const worstOrgCount = orgs.filter((o) => o.status === worst.status).length;
  let statusScope: string | null = null;
  if (worstOrgCount < orgs.length) {
    statusScope =
      worstOrgCount === 1 && worst.tenantName ? worst.tenantName : `${worstOrgCount} of ${orgs.length} orgs`;
  }
  const moreOrgsNeedingAttention = orgs.filter((o) => o.status !== worst.status && needsAttention(o.status)).length;
  return { ...worst, orgs, retiredOrgs, worstOrgCount, statusScope, moreOrgsNeedingAttention };
}

/** One counted org's data clock, as a business-level "Last synced" shows it. */
export interface XeroOrgDataClock {
  tenantName: string | null;
  /** Last successful data sync on this org's own tenant clock; null = never synced. */
  lastSyncAt: string | null;
}

/**
 * How current a business's Xero NUMBERS are, for a surface that shows every
 * org's figures together — the KPI dashboard charts' "Last synced".
 *
 * It is the STALEST counted org's clock, never the headline org's. A total is
 * only as current as the org that synced longest ago, and the headline org is
 * picked by status: an auth_stale or dead org that synced an hour ago would
 * otherwise speak for a sibling three weeks behind. The orgs that count are
 * exactly `classifyBusinessConnections`' (a retired org sets nothing; a dead row
 * superseded by a live row for the same org is not an org), each on its own
 * tenant's clock (`dataClockFor`).
 *
 *   none          no org counts: no Xero connection, so no clock to show
 *   unknown       the clock could not be established — the sync_jobs lookup
 *                 failed, or an org has no tenant_id to look it up by, the two
 *                 reasons `classifyXeroConnection` answers unknown on the data
 *                 axis. Never a date, and never "never synced".
 *   never_synced  some org has never synced
 *   synced        every org has synced; `lastSyncAt` is the oldest of them
 *
 * `orgs` is every counted org's clock, stalest first, so a surface can say whose
 * clock it is when the orgs disagree.
 */
export type XeroBusinessDataClock =
  | { status: 'none' }
  | { status: 'unknown' }
  | { status: 'never_synced'; orgs: XeroOrgDataClock[] }
  | { status: 'synced'; lastSyncAt: string; orgs: XeroOrgDataClock[] };

export function businessDataClock(
  rows: readonly XeroConnectionStatusRow[],
  syncClock: XeroSyncClock,
): XeroBusinessDataClock {
  const { orgs } = classifyBusinessConnections(rows, syncClock);
  if (orgs.length === 0) return { status: 'none' };
  if (!syncClock.ok || orgs.some((o) => o.tenantId === null)) return { status: 'unknown' };

  const clocks = orgs
    .map((o) => ({ tenantName: o.tenantName, lastSyncAt: o.lastSyncAt }))
    .sort((a, b) => compareInstants(a.lastSyncAt, b.lastSyncAt) || compareText(a.tenantName, b.tenantName));
  const stalest = clocks[0].lastSyncAt;
  return stalest === null
    ? { status: 'never_synced', orgs: clocks }
    : { status: 'synced', lastSyncAt: stalest, orgs: clocks };
}
