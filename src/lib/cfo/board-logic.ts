/**
 * CFO production board — pure derivations.
 *
 * The board answers "where is every client in this month's report cycle, and
 * what's blocking me". These functions turn raw rows (cfo_report_status,
 * reconciliation_checks/_snapshots, connection classification) into the
 * board's stage / section / reconciliation summaries. Pure and unit-tested;
 * the API route only assembles inputs.
 */

export type PipelineStage = 'none' | 'generated' | 'ready' | 'approved' | 'sent' | 'discussed'

export interface CycleRow {
  status?: string | null
  generated_at?: string | null
  approved_at?: string | null
  sent_at?: string | null
  discussed_at?: string | null
}

/**
 * Worst-first would be wrong here — the pipeline reports the FURTHEST stage
 * reached. discussed_at wins over everything (a discussed report is done even
 * if someone later reverted the status machine to draft: the meeting
 * happened).
 */
export function deriveStage(row: CycleRow | null | undefined): PipelineStage {
  if (!row) return 'none'
  if (row.discussed_at) return 'discussed'
  if (row.status === 'sent') return 'sent'
  if (row.status === 'approved') return 'approved'
  if (row.status === 'ready_for_review') return 'ready'
  if (row.generated_at) return 'generated'
  return 'none'
}

/**
 * A report for month M is due on day `dueDay` of month M+1. dueDay is
 * DB-constrained to 1–28 so this can never land on an invalid date.
 * Returns null (never due) when no due day is configured.
 */
export function dueDateForMonth(
  reportMonth: string,
  dueDay: number | null | undefined,
): string | null {
  if (!dueDay || dueDay < 1 || dueDay > 28) return null
  const match = /^(\d{4})-(\d{2})$/.exec(reportMonth)
  if (!match) return null
  let year = Number(match[1])
  let month = Number(match[2])
  if (month < 1 || month > 12) return null
  month += 1
  if (month > 12) {
    month = 1
    year += 1
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`
}

/** Whole days past the due date as at `todayIso` (YYYY-MM-DD). null = no due date; 0 = due today or not yet due. */
export function daysOverdue(dueDate: string | null, todayIso: string): number | null {
  if (!dueDate) return null
  const due = Date.parse(`${dueDate}T00:00:00Z`)
  const today = Date.parse(`${todayIso.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(due) || Number.isNaN(today)) return null
  const diff = Math.floor((today - due) / 86_400_000)
  return diff > 0 ? diff : 0
}

export type ReconState = 'clear' | 'outstanding' | 'partial' | 'unknown'

export interface ReconCheckRow {
  tenant_id: string
  status: string
  checked_at: string | null
  source: string
  /** NULL on errored checks — never render as zero. */
  total_unreconciled_count: number | null
  total_unreconciled_value: number | null
  error_message?: string | null
}

export interface ReconBucketRow {
  tenant_id: string
  month: string
  unreconciled_count: number
  unreconciled_value: number
  /** ISO code of the bank account's currency; null on legacy rows. */
  currency?: string | null
  bank_account_name?: string | null
}

export interface ReconSummary {
  /**
   * clear      — every tenant checked OK, zero outstanding
   * outstanding— every tenant checked OK, items outstanding
   * partial    — some tenants checked OK, some errored (counts are a floor)
   * unknown    — no tenant could be checked (or never checked). NEVER render
   *              as zero outstanding — the fail-closed house rule.
   */
  state: ReconState
  totalCount: number
  /** Null when the business's items span multiple currencies — counts stay
   *  exact, but summing HKD into AUD is forbidden (house FX rule). */
  totalValue: number | null
  /** Single shared currency of all items, when one exists (null = legacy rows
   *  with no recorded currency — rendered as plain AUD-style, or mixed). */
  currency: string | null
  mixedCurrencies: boolean
  /** 'statement_lines' = the banner population (bank-feed lines);
   *  'account_transactions' = the coded-side count; 'mixed' across orgs. */
  source: 'statement_lines' | 'account_transactions' | 'mixed' | null
  /** Aggregated across tenants and bank accounts, ascending by month ('YYYY-MM'). */
  months: { month: string; count: number; value: number | null }[]
  /** Per-bank-account attribution, count-descending. Xero's reconcile badge
   *  is PER ACCOUNT — naming the account explains a count that looks wrong
   *  from the org-wide view (routinely a secondary account nobody checks). */
  byAccount: { name: string; count: number }[]
  /** Oldest successful check — the honest "as at" for the whole business. */
  checkedAt: string | null
  checkedTenants: number
  erroredTenants: number
  tenantCount: number
}

export function summariseRecon(
  checks: ReconCheckRow[],
  buckets: ReconBucketRow[],
  tenantCount: number,
): ReconSummary {
  const ok = checks.filter(c => c.status === 'ok')
  const errored = checks.filter(c => c.status !== 'ok')
  // Tenants with no check row at all count as errored coverage: not checked.
  const unchecked = Math.max(0, tenantCount - checks.length)
  const failedCoverage = errored.length + unchecked

  const currencies = new Set(buckets.map(b => b.currency ?? null))
  const mixedCurrencies = currencies.size > 1
  const currency = mixedCurrencies ? null : (currencies.values().next().value ?? null)

  // Which population the counts came from — drives the UI's honesty caveat.
  const sources = new Set(ok.map(c => c.source))
  const source: ReconSummary['source'] =
    sources.size === 1
      ? (sources.values().next().value as 'statement_lines' | 'account_transactions')
      : sources.size > 1
        ? 'mixed'
        : null

  const monthMap = new Map<string, { count: number; value: number }>()
  const accountMap = new Map<string, number>()
  for (const bucket of buckets) {
    const key = bucket.month.slice(0, 7)
    const entry = monthMap.get(key) ?? { count: 0, value: 0 }
    entry.count += bucket.unreconciled_count
    entry.value += Number(bucket.unreconciled_value ?? 0)
    monthMap.set(key, entry)
    const accountName = bucket.bank_account_name ?? '(unknown account)'
    accountMap.set(accountName, (accountMap.get(accountName) ?? 0) + bucket.unreconciled_count)
  }
  const byAccount = Array.from(accountMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
  const months = Array.from(monthMap.entries())
    .map(([month, m]) => ({
      month,
      count: m.count,
      value: mixedCurrencies ? null : Math.round(m.value * 100) / 100,
    }))
    .sort((a, b) => a.month.localeCompare(b.month))

  const totalCount = ok.reduce((s, c) => s + (c.total_unreconciled_count ?? 0), 0)
  const totalValue = mixedCurrencies
    ? null
    : Math.round(ok.reduce((s, c) => s + Number(c.total_unreconciled_value ?? 0), 0) * 100) / 100

  let state: ReconState
  if (ok.length === 0) state = 'unknown'
  else if (failedCoverage > 0) state = 'partial'
  else if (totalCount > 0) state = 'outstanding'
  else state = 'clear'

  const checkedAt = ok.length
    ? ok.map(c => c.checked_at ?? '').filter(Boolean).sort()[0] ?? null
    : null

  return {
    state,
    totalCount,
    totalValue,
    currency,
    mixedCurrencies,
    source,
    months,
    byAccount,
    checkedAt,
    checkedTenants: ok.length,
    erroredTenants: failedCoverage,
    tenantCount,
  }
}

export type BoardSection = 'overdue' | 'blocked' | 'in_progress' | 'sent'

/**
 * Section = urgency grouping, ordered Overdue → Blocked → In progress → Sent.
 * - Sent/discussed reports are done regardless of anything else.
 * - Overdue trumps blocked: a disconnected AND overdue client is an overdue
 *   problem first (mockup: Efficient Living).
 * - "Blocked" means the report cannot even be STARTED with trustworthy data:
 *   connection needs attention, or reconciliation state is unknown, or items
 *   are outstanding while nothing has been generated yet. Once generation has
 *   happened, outstanding items WARN on the row but the client is in progress
 *   (Matt's warn-not-block decision).
 */
export function deriveSection(args: {
  stage: PipelineStage
  daysOverdue: number | null
  connectionNeedsAttention: boolean
  /** The badge-based report-readiness verdict (demote decision, 5 Sep 2026):
   *  the API count no longer drives sections — the captured badge does. */
  readiness: 'ready' | 'blocked' | 'stale' | 'never' | 'partial'
}): BoardSection {
  const { stage, daysOverdue: overdue, connectionNeedsAttention, readiness } = args
  if (stage === 'sent' || stage === 'discussed') return 'sent'
  if (overdue !== null && overdue > 0) return 'overdue'
  // Unknown freshness/coverage fails closed regardless of stage ('partial' =
  // some orgs never captured, their backlog invisible); KNOWN blocking items
  // hard-block only before generation (warn-not-block once work has started).
  if (connectionNeedsAttention || readiness === 'stale' || readiness === 'never' || readiness === 'partial') return 'blocked'
  if (stage === 'none' && readiness === 'blocked') return 'blocked'
  return 'in_progress'
}
