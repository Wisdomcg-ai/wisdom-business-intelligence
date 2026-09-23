/**
 * Dashboard badge captures — the banner-exact reconciliation number.
 *
 * Xero confirmed (2 Sep 2026) that the Bank Statement report scope is
 * deprecated and never granted, so the dashboard "Reconcile N items" badge
 * — which counts uncoded bank-feed statement lines — is unreachable by API.
 * The sweep's account_transactions count is a floor; this is the badge,
 * captured by an operator and stored append-only per tenant.
 *
 * Pure: validation of an incoming capture and the latest-per-tenant rollup
 * the board shows beside the API count.
 */

export interface CaptureAccount {
  name: string
  count: number
  /**
   * Optional month histogram of the account's unreconciled lines
   * ({"2026-08": 15, "2026-09": 32}) from the recon round's date pass.
   * When present it MUST foot to `count`. This is what makes the
   * report-readiness verdict computable: lines dated in or before the
   * report month block it; later lines don't.
   */
  months?: Record<string, number>
}

export interface IncomingCapture {
  tenant_id: string
  total_count: number
  accounts?: CaptureAccount[]
  notes?: string | null
  method?: 'chrome_routine' | 'manual'
}

export interface CaptureValidation {
  ok: boolean
  error?: string
  value?: Required<Pick<IncomingCapture, 'tenant_id' | 'total_count' | 'accounts' | 'method'>> & { notes: string | null }
}

/** Validate one capture. Named reasons — a routine posting garbage must hear it. */
export function validateCapture(raw: unknown): CaptureValidation {
  const r = raw as Partial<IncomingCapture> | null
  if (!r || typeof r !== 'object') return { ok: false, error: 'capture must be an object' }
  if (typeof r.tenant_id !== 'string' || r.tenant_id.trim() === '') return { ok: false, error: 'tenant_id is required' }
  if (typeof r.total_count !== 'number' || !Number.isInteger(r.total_count) || r.total_count < 0) {
    return { ok: false, error: 'total_count must be a non-negative integer' }
  }
  const accounts: CaptureAccount[] = []
  for (const a of r.accounts ?? []) {
    if (!a || typeof a.name !== 'string' || a.name.trim() === '' || typeof a.count !== 'number' || !Number.isInteger(a.count) || a.count < 0) {
      return { ok: false, error: 'each account needs a name and a non-negative integer count' }
    }
    const entry: CaptureAccount = { name: a.name.trim(), count: a.count }
    if (a.months !== undefined) {
      if (!a.months || typeof a.months !== 'object' || Array.isArray(a.months)) {
        return { ok: false, error: `months for "${entry.name}" must be an object of YYYY-MM keys` }
      }
      let monthSum = 0
      const months: Record<string, number> = {}
      for (const [key, value] of Object.entries(a.months)) {
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(key)) {
          return { ok: false, error: `months for "${entry.name}" has a non-YYYY-MM key: "${String(key).slice(0, 20)}"` }
        }
        if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
          return { ok: false, error: `months for "${entry.name}" has a non-integer count for ${key}` }
        }
        months[key] = value
        monthSum += value
      }
      // The histogram must foot to the account count — a split that doesn't
      // add up is a mis-read, not data.
      if (monthSum !== entry.count) {
        return { ok: false, error: `months for "${entry.name}" sum to ${monthSum} but count is ${entry.count}` }
      }
      entry.months = months
    }
    accounts.push(entry)
  }
  // When per-account detail is given it must foot to the total — a badge
  // list that doesn't add up is a mis-read, not data.
  if (accounts.length > 0) {
    const sum = accounts.reduce((s, a) => s + a.count, 0)
    if (sum !== r.total_count) return { ok: false, error: `accounts sum to ${sum} but total_count is ${r.total_count}` }
  }
  const method = r.method === 'chrome_routine' ? 'chrome_routine' : 'manual'
  return {
    ok: true,
    value: { tenant_id: r.tenant_id.trim(), total_count: r.total_count, accounts, method, notes: r.notes ?? null },
  }
}

export interface CaptureRow {
  tenant_id: string
  business_id: string
  captured_at: string
  total_count: number
  accounts: CaptureAccount[] | null
  method: string
  notes?: string | null
}

export interface BusinessDashboardCapture {
  /** Sum of the LATEST capture per tenant. */
  total_count: number
  /** Oldest of the latest-per-tenant capture times — the honest "as of". */
  captured_at: string
  /** Tenants with at least one capture, of those expected. */
  captured_tenants: number
  tenant_count: number
  per_tenant: Array<{ tenant_id: string; total_count: number; captured_at: string; method: string }>
  /** Per-account badge breakdown, merged across the latest capture per
   *  tenant, count-descending — names where the badge total actually lives.
   *  `months` is the merged histogram, or null when ANY contributor lacked
   *  one (fail-closed: an unsplit account can't claim period relevance). */
  accounts: Array<{ name: string; count: number; months: Record<string, number> | null }>
  /** Non-empty notes from the latest captures (period relevance, feed
   *  warnings, legacy flags) — the routine's human-readable findings. */
  notes: string[]
}

/**
 * Latest capture per tenant → one figure per business. Tenants never
 * captured are reported, never assumed zero (the fail-open house rule).
 */
export function summariseDashboardCaptures(
  rows: CaptureRow[],
  expectedTenantIds: string[],
): BusinessDashboardCapture | null {
  const latest = new Map<string, CaptureRow>()
  for (const r of rows) {
    const prev = latest.get(r.tenant_id)
    if (!prev || r.captured_at > prev.captured_at) latest.set(r.tenant_id, r)
  }
  const relevant = expectedTenantIds.length > 0
    ? expectedTenantIds.map(t => latest.get(t)).filter((r): r is CaptureRow => !!r)
    : Array.from(latest.values())
  if (relevant.length === 0) return null
  const per_tenant = relevant
    .map(r => ({ tenant_id: r.tenant_id, total_count: r.total_count, captured_at: r.captured_at, method: r.method }))
    .sort((a, b) => a.tenant_id.localeCompare(b.tenant_id))

  const accountMap = new Map<string, { count: number; months: Record<string, number> | null; complete: boolean }>()
  for (const r of relevant) {
    for (const a of r.accounts ?? []) {
      const entry = accountMap.get(a.name) ?? { count: 0, months: {}, complete: true }
      entry.count += a.count
      if (a.months && entry.complete) {
        for (const [k, v] of Object.entries(a.months)) {
          entry.months![k] = (entry.months![k] ?? 0) + v
        }
      } else {
        entry.complete = false
        entry.months = null
      }
      accountMap.set(a.name, entry)
    }
  }
  const accounts = Array.from(accountMap.entries())
    .map(([name, e]) => ({ name, count: e.count, months: e.complete ? e.months : null }))
    .sort((a, b) => b.count - a.count)

  const notes = Array.from(
    new Set(relevant.map(r => r.notes?.trim()).filter((n): n is string => !!n)),
  )

  return {
    total_count: relevant.reduce((s, r) => s + r.total_count, 0),
    captured_at: relevant.map(r => r.captured_at).sort()[0]!,
    captured_tenants: relevant.length,
    tenant_count: expectedTenantIds.length > 0 ? expectedTenantIds.length : relevant.length,
    per_tenant,
    accounts,
    notes,
  }
}

// ─── Report readiness (the board's ONE reconciliation question) ─────────────

/** Capture older than this can't support a confident verdict — Matt's to tune. */
export const STALE_CAPTURE_DAYS = 7

export type ReadinessState = 'ready' | 'blocked' | 'stale' | 'never' | 'partial'

export interface ReportReadiness {
  /**
   * ready   — fresh capture of EVERY org; nothing dated in or before the report month
   * blocked — fresh capture; items block the report month (nudge territory)
   * partial — fresh capture but some orgs were never captured: zero visible
   *           blocking, yet the uncaptured orgs' backlog is unknown — never
   *           rendered as ready (the multi-org silent-fraction incident class)
   * stale   — last capture too old to trust; numbers shown are historical
   * never   — no capture yet; run the recon round
   */
  state: ReadinessState
  /** Badge lines dated in or before the report month, ignored accounts excluded. */
  blocking: number
  /** Of `blocking`: lines dated BEFORE the report month (prior periods).
   *  The board's "Previous months" column. */
  blocking_prior: number
  /** Of `blocking`: lines dated IN the report month. The board's month column. */
  blocking_current: number
  /** Lines on non-ignored accounts WITHOUT a month split — fail-closed: they
   *  COULD be blocking, so they prevent a READY verdict. */
  possibly_blocking: number
  /** Non-ignored accounts with blocking (or unsplit) items, worst first. */
  by_account: Array<{ name: string; blocking: number; unsplit: boolean }>
  /** Ignored accounts and what they carried (visibility, never counted). */
  ignored: Array<{ name: string; count: number }>
  /** Expected orgs with no capture at all — their backlog is invisible, so
   *  counts are a FLOOR and the verdict can never be ready while > 0. */
  uncaptured_tenants: number
  captured_at: string | null
  capture_age_days: number | null
}

export function deriveReadiness(
  capture: BusinessDashboardCapture | null,
  ignoredNames: string[],
  reportMonth: string,
  nowIso: string = new Date().toISOString(),
): ReportReadiness {
  const base: ReportReadiness = {
    state: 'never',
    blocking: 0,
    blocking_prior: 0,
    blocking_current: 0,
    possibly_blocking: 0,
    by_account: [],
    ignored: [],
    uncaptured_tenants: 0,
    captured_at: null,
    capture_age_days: null,
  }
  if (!capture) return base
  base.uncaptured_tenants = Math.max(0, capture.tenant_count - capture.captured_tenants)

  const ignore = new Set(ignoredNames.map(n => n.trim().toLowerCase()))
  for (const account of capture.accounts) {
    if (ignore.has(account.name.trim().toLowerCase())) {
      base.ignored.push({ name: account.name, count: account.count })
      continue
    }
    if (account.months) {
      // YYYY-MM keys compare correctly as strings.
      let prior = 0
      let current = 0
      for (const [month, n] of Object.entries(account.months)) {
        if (month < reportMonth) prior += n
        else if (month === reportMonth) current += n
      }
      const blocking = prior + current
      if (blocking > 0) base.by_account.push({ name: account.name, blocking, unsplit: false })
      base.blocking += blocking
      base.blocking_prior += prior
      base.blocking_current += current
    } else if (account.count > 0) {
      // No month split — could all be blocking. Never READY on a guess.
      base.by_account.push({ name: account.name, blocking: account.count, unsplit: true })
      base.possibly_blocking += account.count
    }
  }
  // A badge total with no (or an incomplete) account breakdown is legal —
  // e.g. a quick manual capture of just the badge number. Those items have
  // no month, no account, and could all be blocking: they must never vanish
  // into a green zero. The remainder is measured against ALL account rows
  // (ignored included — their counts are part of total_count too).
  const accountedSum = capture.accounts.reduce((s, a) => s + a.count, 0)
  const unaccounted = Math.max(0, capture.total_count - accountedSum)
  if (unaccounted > 0) {
    base.by_account.push({ name: '(no account breakdown)', blocking: unaccounted, unsplit: true })
    base.possibly_blocking += unaccounted
  }
  base.by_account.sort((a, b) => b.blocking - a.blocking)

  base.captured_at = capture.captured_at
  const age = Math.floor(
    (Date.parse(nowIso) - Date.parse(capture.captured_at)) / 86_400_000,
  )
  base.capture_age_days = Number.isFinite(age) ? Math.max(0, age) : null

  if (base.capture_age_days === null || base.capture_age_days > STALE_CAPTURE_DAYS) {
    base.state = 'stale'
  } else if (base.blocking + base.possibly_blocking > 0) {
    base.state = 'blocked'
  } else if (base.uncaptured_tenants > 0) {
    // Zero visible blocking, but not every org was captured — the missing
    // orgs' backlog is unknown, so this is not READY (fail-closed).
    base.state = 'partial'
  } else {
    base.state = 'ready'
  }
  return base
}
