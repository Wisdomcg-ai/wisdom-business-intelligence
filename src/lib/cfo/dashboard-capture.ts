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
    accounts.push({ name: a.name.trim(), count: a.count })
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
   *  tenant, count-descending — names where the badge total actually lives. */
  accounts: CaptureAccount[]
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

  const accountMap = new Map<string, number>()
  for (const r of relevant) {
    for (const a of r.accounts ?? []) {
      accountMap.set(a.name, (accountMap.get(a.name) ?? 0) + a.count)
    }
  }
  const accounts = Array.from(accountMap.entries())
    .map(([name, count]) => ({ name, count }))
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
