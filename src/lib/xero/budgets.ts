/**
 * Xero Budget Manager budgets — read-only client.
 *
 * Xero exposes budgets through two Accounting API calls under the
 * `accounting.budgets.read` scope (requested since PR #466; an org grants it
 * only when it re-consents):
 *   GET /Budgets                         → list (BudgetID, Type, Description, UpdatedDateUTC)
 *   GET /Budgets/{BudgetID}?DateFrom&DateTo → the lines: AccountID/AccountCode with
 *                                          BudgetBalances[{ Period "YYYY-MM", Amount, UnitAmount }]
 *
 * Contract caveats we defend against rather than trust (the OpenAPI spec's
 * DateFrom/DateTo descriptions are swapped and the default window is not
 * documented — see the spike in .planning/XERO-BUDGET-SEED-PLAN.md §G):
 *   - we pass the window we want AND filter the returned periods to it;
 *   - Xero caps DateFrom→DateTo at 24 months ("Date range maximum is 24
 *     months", QueryParseException 16 — seen live on Urban Road, 5 Sep 2026),
 *     so a three-year window is fetched in chunks and merged per account;
 *   - amounts may arrive as strings; Period may arrive as "YYYY-MM" or as a
 *     Microsoft "/Date(ms)/" stamp;
 *   - the budgeted money is `Amount`; `UnitAmount` is only used when Amount is
 *     absent (BUDGET_AMOUNT_FIELD records the decision).
 *
 * A 403 from either call means the org has not granted the scope — surfaced
 * as BudgetsScopeMissingError so callers can render "Reconnect Xero to
 * enable" instead of "no budget". Everything else propagates.
 */
import { fetchXeroWithRateLimit, XeroHttpError } from './xero-api-client'

const XERO_API_BASE = 'https://api.xero.com/api.xro/2.0'

/** Which BudgetBalance field carries the budgeted money. Pinned by the spike. */
export const BUDGET_AMOUNT_FIELD: 'Amount' | 'UnitAmount' = 'Amount'

export type XeroBudgetType = 'OVERALL' | 'TRACKING'

export interface XeroBudgetSummary {
  budgetId: string
  name: string
  type: XeroBudgetType
  updatedAt: string | null
  /** Tracking category/option pairs for TRACKING budgets; empty for OVERALL. */
  tracking: Array<{ category: string; option: string }>
}

export interface XeroBudgetLine {
  accountId: string | null
  accountCode: string | null
  /** "YYYY-MM" → budgeted amount, already filtered to the requested window. */
  months: Record<string, number>
}

export interface XeroBudgetDetail extends XeroBudgetSummary {
  lines: XeroBudgetLine[]
}

export class BudgetsScopeMissingError extends Error {
  readonly tenantId: string
  constructor(tenantId: string) {
    super(`Xero org ${tenantId} has not granted accounting.budgets.read`)
    this.name = 'BudgetsScopeMissingError'
    this.tenantId = tenantId
  }
}

// ─── Parsing (pure) ──────────────────────────────────────────────────────────

const MONTH_KEY = /^(\d{4})-(\d{2})$/
const MS_DATE = /\/Date\((-?\d+)(?:[+-]\d{4})?\)\//

/** "2019-08" | "2019-08-01" | "/Date(1564617600000+0000)/" → "2019-08"; else null. */
export function parseXeroBudgetPeriod(period: unknown): string | null {
  if (typeof period !== 'string') return null
  const trimmed = period.trim()
  if (MONTH_KEY.test(trimmed)) return trimmed
  const iso = /^(\d{4})-(\d{2})-\d{2}/.exec(trimmed)
  if (iso) return `${iso[1]}-${iso[2]}`
  const ms = MS_DATE.exec(trimmed)
  if (ms) {
    const d = new Date(Number(ms[1]))
    if (Number.isNaN(d.getTime())) return null
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  }
  return null
}

/** Xero sends "1000", 1000, "1,000.50" or null. Non-numbers → null. */
export function parseXeroAmount(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string') {
    const n = Number(v.replace(/,/g, '').trim())
    return v.trim() !== '' && Number.isFinite(n) ? n : null
  }
  return null
}

/** UpdatedDateUTC comes as "/Date(1622138002077+0000)/" or ISO. → ISO string or null. */
export function parseXeroTimestamp(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const ms = MS_DATE.exec(v)
  if (ms) {
    const d = new Date(Number(ms[1]))
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }
  // Xero's ISO form ("2017-08-14T01:18:26.74") is UTC but carries no zone
  // designator; without one, Date() would read it in the server's local zone.
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(v.trim()) ? `${v.trim()}Z` : v
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function parseBudgetType(v: unknown): XeroBudgetType {
  return typeof v === 'string' && v.toUpperCase() === 'TRACKING' ? 'TRACKING' : 'OVERALL'
}

function parseSummary(raw: any): XeroBudgetSummary | null {
  const budgetId = typeof raw?.BudgetID === 'string' ? raw.BudgetID : null
  if (!budgetId) return null
  const tracking: XeroBudgetSummary['tracking'] = Array.isArray(raw?.Tracking)
    ? raw.Tracking.map((t: any) => ({
        category: typeof t?.Name === 'string' ? t.Name : '',
        option: typeof t?.Option === 'string' ? t.Option : '',
      }))
    : []
  const type = parseBudgetType(raw?.Type)
  return {
    budgetId,
    name:
      typeof raw?.Description === 'string' && raw.Description.trim()
        ? raw.Description.trim()
        : type === 'OVERALL' ? 'Overall Budget' : 'Tracking Budget',
    type,
    updatedAt: parseXeroTimestamp(raw?.UpdatedDateUTC),
    tracking,
  }
}

/** The list endpoint: `{ Budgets: [...] }`. Tolerates a single object too. */
export function parseXeroBudgetsListResponse(json: unknown): XeroBudgetSummary[] {
  const raw = (json as any)?.Budgets
  const items = Array.isArray(raw) ? raw : raw ? [raw] : []
  return items.map(parseSummary).filter((b): b is XeroBudgetSummary => b !== null)
}

export interface PeriodWindow {
  /** Inclusive "YYYY-MM" bounds. Periods outside are dropped. */
  from: string
  to: string
}

/**
 * The detail endpoint: `{ Budgets: { ...budget, BudgetLines: [...] } }` (Xero
 * returns the single budget as an object, not an array; both handled).
 */
export function parseXeroBudgetDetail(json: unknown, window?: PeriodWindow): XeroBudgetDetail | null {
  const raw = (json as any)?.Budgets
  const budget = Array.isArray(raw) ? raw[0] : raw
  const summary = parseSummary(budget)
  if (!summary) return null
  const lines: XeroBudgetLine[] = []
  for (const bl of Array.isArray(budget?.BudgetLines) ? budget.BudgetLines : []) {
    const months: Record<string, number> = {}
    for (const bal of Array.isArray(bl?.BudgetBalances) ? bl.BudgetBalances : []) {
      const period = parseXeroBudgetPeriod(bal?.Period)
      if (!period) continue
      if (window && (period < window.from || period > window.to)) continue
      const primary = parseXeroAmount(bal?.[BUDGET_AMOUNT_FIELD])
      const fallback = parseXeroAmount(bal?.[BUDGET_AMOUNT_FIELD === 'Amount' ? 'UnitAmount' : 'Amount'])
      const amount = primary ?? fallback
      if (amount === null) continue
      months[period] = (months[period] ?? 0) + amount
    }
    lines.push({
      accountId: typeof bl?.AccountID === 'string' ? bl.AccountID : null,
      accountCode: typeof bl?.AccountCode === 'string' ? bl.AccountCode : bl?.AccountCode != null ? String(bl.AccountCode) : null,
      months,
    })
  }
  return { ...summary, lines }
}

/** First/last covered period and how many of the given FY keys the budget holds. */
export function budgetCoverage(
  lines: readonly XeroBudgetLine[],
  fyMonthKeys: readonly string[],
): { firstPeriod: string | null; lastPeriod: string | null; monthsInFY: number; coveredKeys: string[] } {
  const periods = new Set<string>()
  for (const l of lines) for (const k of Object.keys(l.months)) periods.add(k)
  const sorted = Array.from(periods).sort()
  const coveredKeys = fyMonthKeys.filter((k) => periods.has(k))
  return {
    firstPeriod: sorted[0] ?? null,
    lastPeriod: sorted[sorted.length - 1] ?? null,
    monthsInFY: coveredKeys.length,
    coveredKeys,
  }
}

/** Xero rejects a DateFrom→DateTo span longer than this (QueryParseException 16). */
export const XERO_BUDGET_MAX_WINDOW_MONTHS = 24

function monthIndex(key: string): number {
  const m = MONTH_KEY.exec(key)
  if (!m) throw new Error(`not a month key: ${key}`)
  return Number(m[1]) * 12 + (Number(m[2]) - 1)
}
function keyFromIndex(i: number): string {
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`
}

/**
 * Split an inclusive "YYYY-MM" window into consecutive chunks of at most
 * `maxMonths` months. A window that already fits comes back as one chunk;
 * an inverted window comes back empty.
 */
export function splitPeriodWindow(window: PeriodWindow, maxMonths: number = XERO_BUDGET_MAX_WINDOW_MONTHS): PeriodWindow[] {
  const from = monthIndex(window.from)
  const to = monthIndex(window.to)
  if (to < from || maxMonths < 1) return []
  const out: PeriodWindow[] = []
  for (let start = from; start <= to; start += maxMonths) {
    out.push({ from: keyFromIndex(start), to: keyFromIndex(Math.min(start + maxMonths - 1, to)) })
  }
  return out
}

/** "YYYY-MM" → the ISO date bounds Xero's DateFrom/DateTo want. */
export function monthKeyToDateBounds(fromKey: string, toKey: string): { dateFrom: string; dateTo: string } {
  const to = MONTH_KEY.exec(toKey)
  const lastDay = to ? new Date(Date.UTC(Number(to[1]), Number(to[2]), 0)).getUTCDate() : 28
  return { dateFrom: `${fromKey}-01`, dateTo: `${toKey}-${String(lastDay).padStart(2, '0')}` }
}

// ─── Network ─────────────────────────────────────────────────────────────────

export interface XeroBudgetsAuth {
  accessToken: string
  tenantId: string
}

/** Status of a Xero HTTP refusal, by class or by shape (module identity can differ under mocks). */
function xeroHttpStatus(err: unknown): number | null {
  if (err instanceof XeroHttpError) return err.status
  const e = err as { name?: unknown; status?: unknown } | null
  return e && e.name === 'XeroHttpError' && typeof e.status === 'number' ? e.status : null
}

function rethrowScope(err: unknown, tenantId: string): never {
  if (xeroHttpStatus(err) === 403) throw new BudgetsScopeMissingError(tenantId)
  throw err
}

export async function listXeroBudgets(auth: XeroBudgetsAuth): Promise<XeroBudgetSummary[]> {
  try {
    const res = await fetchXeroWithRateLimit(`${XERO_API_BASE}/Budgets`, auth)
    return parseXeroBudgetsListResponse(res.json)
  } catch (err) {
    return rethrowScope(err, auth.tenantId)
  }
}

async function fetchBudgetChunk(
  auth: XeroBudgetsAuth,
  budgetId: string,
  window: PeriodWindow,
): Promise<XeroBudgetDetail | null> {
  const { dateFrom, dateTo } = monthKeyToDateBounds(window.from, window.to)
  const url = `${XERO_API_BASE}/Budgets/${encodeURIComponent(budgetId)}?DateFrom=${dateFrom}&DateTo=${dateTo}`
  try {
    const res = await fetchXeroWithRateLimit(url, auth)
    return parseXeroBudgetDetail(res.json, window)
  } catch (err) {
    if (xeroHttpStatus(err) === 404) return null
    return rethrowScope(err, auth.tenantId)
  }
}

/**
 * Fetch a budget's lines for a window of any length. Xero caps each request at
 * 24 months, so longer windows are fetched chunk by chunk and merged per
 * account (chunks are disjoint, so months simply union). Null when the budget
 * does not exist.
 */
export async function getXeroBudget(
  auth: XeroBudgetsAuth,
  budgetId: string,
  window: PeriodWindow,
): Promise<XeroBudgetDetail | null> {
  const chunks = splitPeriodWindow(window)
  if (chunks.length === 0) return null
  let merged: XeroBudgetDetail | null = null
  const byAccount = new Map<string, XeroBudgetLine>()
  for (const chunk of chunks) {
    const detail = await fetchBudgetChunk(auth, budgetId, chunk)
    if (!detail) {
      if (!merged) return null // the budget itself is missing
      continue
    }
    if (!merged) merged = { ...detail, lines: [] }
    for (const line of detail.lines) {
      const key = line.accountId ?? line.accountCode ?? `#${byAccount.size}`
      const existing = byAccount.get(key)
      if (existing) {
        for (const [k, v] of Object.entries(line.months)) existing.months[k] = (existing.months[k] ?? 0) + v
      } else {
        byAccount.set(key, { ...line, months: { ...line.months } })
      }
    }
  }
  if (!merged) return null
  merged.lines = Array.from(byAccount.values())
  return merged
}
