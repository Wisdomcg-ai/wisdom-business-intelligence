/**
 * P9 — turning several Xero organisations into the one virtual ledger a
 * single-organisation builder already knows how to read.
 *
 * deriveMoneyFlow and buildPackCashModel are written for one Xero
 * organisation and are well tested as one. Rather than teach each of them a
 * second, multi-tenant code path — doubling what has to stay correct — this
 * module translates every foreign organisation's rows into the presentation
 * currency and relabels every row onto one synthetic tenant id
 * (CONSOLIDATED_TENANT_ID), so the existing single-tenant logic runs over the
 * whole business without ever knowing it had more than one Xero connection.
 * Xero AccountIDs and account codes are left exactly as Xero wrote them, so a
 * chosen bank, debtors or GST account still matches only the row it names —
 * a shared account code is never treated as a shared account.
 *
 * The rate convention matches P8's consolidated balance sheet exactly:
 *   balance-sheet-shaped figures (an opening or closing balance at a named
 *     date) translate at that date's CLOSING rate;
 *   P&L-shaped figures (a month's movement) translate at that MONTH's
 *     AVERAGE rate.
 * A rate this business needs and does not have refuses, naming the
 * organisation and the date or month it was needed for — never a wrong
 * number, never a silent zero, never HKD added to AUD one-for-one.
 *
 * Same-currency multi-org (Dragon Roofing + Easy Hail) touches none of the
 * rate machinery at all: every organisation's rate is 1, so translation is
 * the identity and only the relabelling (and, for readability, the label
 * prefix) does anything.
 */

export interface ConsolidationOrg {
  tenant_id: string
  name: string
  /** xero_connections.functional_currency; null when it was never recorded. */
  functional_currency: string | null
}

/** A stored fx_rates row — the same shape consolidated-balance-sheet.ts reads. */
export interface FxRateLike {
  currency_pair: string
  rate_type: string
  /** 'YYYY-MM-01' for a monthly average; the month-end for a closing rate. */
  period: string
  rate: number | string
}

/**
 * Every row this module emits carries this tenant_id — never a real Xero
 * tenant's, so a caller cannot mistake a consolidated row for one organisation's.
 */
export const CONSOLIDATED_TENANT_ID = '__consolidated__'

const PRESENTATION = 'AUD'

const num = (v: number | string | null | undefined): number => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

/** "A", "A and B", "A, B and C". */
export function listOf(items: readonly string[]): string {
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

export function currencyOf(o: ConsolidationOrg): string {
  return (o.functional_currency ?? PRESENTATION).trim().toUpperCase()
}

export function pairOf(o: ConsolidationOrg): string {
  return `${currencyOf(o)}/${PRESENTATION}`
}

/** The organisations with no recorded currency — a caller refuses, naming them. */
export function unknownCurrencyOrgs(orgs: readonly ConsolidationOrg[]): ConsolidationOrg[] {
  return orgs.filter((o) => !(o.functional_currency ?? '').trim())
}

interface RateMaps {
  closing: Map<string, number>
  average: Map<string, number>
}

/** `${pair}@${date}` for a closing rate, `${pair}@${YYYY-MM}` for a monthly average. */
export function buildRateMaps(rates: readonly FxRateLike[]): RateMaps {
  const closing = new Map<string, number>()
  const average = new Map<string, number>()
  for (const r of rates) {
    const rate = num(r.rate)
    if (!(rate > 0)) continue
    if (r.rate_type === 'closing_spot') closing.set(`${r.currency_pair}@${r.period.slice(0, 10)}`, rate)
    else if (r.rate_type === 'monthly_average') average.set(`${r.currency_pair}@${r.period.slice(0, 7)}`, rate)
  }
  return { closing, average }
}

export type ConsolidateResult<T> = { ok: true; rows: T[] } | { ok: false; reason: string }

function missingRateReason(missing: readonly string[], kind: 'closing' | 'average'): string {
  const byPair = new Map<string, string[]>()
  for (const k of [...new Set(missing)]) {
    const [pair, date] = k.split('@')
    byPair.set(pair, [...(byPair.get(pair) ?? []), date])
  }
  const clauses = [...byPair.entries()].map(
    ([pair, ds]) => `${pair} ${kind === 'closing' ? 'closing' : 'monthly average'} rate is stored for ${listOf(ds.sort())}`,
  )
  return `no ${clauses.join('; no ')}`
}

/**
 * Balance-sheet-shaped rows (a business_id/tenant_id/account_name row keyed
 * by date, as BsRowInput and CashModelInputs.bsRows both are): each date in
 * `dateKeys` translated at that date's closing rate, every row relabelled
 * onto CONSOLIDATED_TENANT_ID.
 *
 * `dateKeys` should be every date the caller's OWN rows actually carry, not a
 * theoretical range: a foreign organisation is never asked for a rate on a
 * date nothing has been synced to yet.
 */
export function consolidateBalanceRows<
  T extends { tenant_id: string; account_name: string; balances_by_date: Record<string, number | string | null> },
>(
  rows: readonly T[],
  orgs: readonly ConsolidationOrg[],
  rates: readonly FxRateLike[],
  dateKeys: readonly string[],
  opts: { prefixLabel?: boolean } = {},
): ConsolidateResult<T> {
  const unknown = unknownCurrencyOrgs(orgs)
  if (unknown.length > 0) {
    return {
      ok: false,
      reason: `the reporting currency of ${listOf(unknown.map((o) => o.name))} is not recorded, so its balances cannot be added to the others — reconnect it in Xero`,
    }
  }
  const { closing } = buildRateMaps(rates)
  const foreign = orgs.filter((o) => currencyOf(o) !== PRESENTATION)
  const missing: string[] = []
  for (const o of foreign) {
    for (const d of dateKeys) {
      if (!closing.has(`${pairOf(o)}@${d}`)) missing.push(`${pairOf(o)}@${d}`)
    }
  }
  if (missing.length > 0) return { ok: false, reason: missingRateReason(missing, 'closing') }

  const byTenant = new Map(orgs.map((o) => [o.tenant_id, o]))
  const multi = orgs.length > 1 && opts.prefixLabel
  const out: T[] = []
  for (const r of rows) {
    const org = byTenant.get(r.tenant_id)
    if (!org) continue
    const foreignRate = currencyOf(org) === PRESENTATION ? null : closing
    const balances_by_date: Record<string, number | string | null> = {}
    for (const d of dateKeys) {
      const raw = r.balances_by_date[d]
      if (raw === undefined) continue
      if (raw === null) { balances_by_date[d] = null; continue }
      const rate = foreignRate ? foreignRate.get(`${pairOf(org)}@${d}`)! : 1
      balances_by_date[d] = num(raw) * rate
    }
    out.push({
      ...r,
      tenant_id: CONSOLIDATED_TENANT_ID,
      account_name: multi ? `${org.name} — ${r.account_name}` : r.account_name,
      balances_by_date,
    })
  }
  return { ok: true, rows: out }
}

/**
 * P&L-shaped rows (monthly_values keyed by 'YYYY-MM', as PlRowInput and
 * CashPlRow both are): every month a row actually carries a value for,
 * translated at THAT month's average rate. A month present with no stored
 * average rate refuses, naming the organisation and the month — a P&L mirror
 * only ever carries months already synced, so this never reaches for a month
 * that has not happened.
 */
export function consolidateFlowRows<T extends { tenant_id: string; monthly_values: Record<string, number | string | null> }>(
  rows: readonly T[],
  orgs: readonly ConsolidationOrg[],
  rates: readonly FxRateLike[],
): ConsolidateResult<T> {
  const unknown = unknownCurrencyOrgs(orgs)
  if (unknown.length > 0) {
    return {
      ok: false,
      reason: `the reporting currency of ${listOf(unknown.map((o) => o.name))} is not recorded, so its balances cannot be added to the others — reconnect it in Xero`,
    }
  }
  const { average } = buildRateMaps(rates)
  const byTenant = new Map(orgs.map((o) => [o.tenant_id, o]))
  const missing: string[] = []
  for (const r of rows) {
    const org = byTenant.get(r.tenant_id)
    if (!org || currencyOf(org) === PRESENTATION) continue
    for (const [month, v] of Object.entries(r.monthly_values)) {
      if (v === undefined || v === null) continue
      const key = `${pairOf(org)}@${month.slice(0, 7)}`
      if (!average.has(key)) missing.push(key)
    }
  }
  if (missing.length > 0) return { ok: false, reason: missingRateReason(missing, 'average') }

  const out: T[] = []
  for (const r of rows) {
    const org = byTenant.get(r.tenant_id)
    if (!org) continue
    const monthly_values: Record<string, number | string | null> = {}
    for (const [month, v] of Object.entries(r.monthly_values)) {
      if (v === undefined) continue
      if (v === null) { monthly_values[month] = null; continue }
      const rate = currencyOf(org) === PRESENTATION ? 1 : average.get(`${pairOf(org)}@${month.slice(0, 7)}`)!
      monthly_values[month] = num(v) * rate
    }
    out.push({ ...r, tenant_id: CONSOLIDATED_TENANT_ID, monthly_values })
  }
  return { ok: true, rows: out }
}

/** Every date key at least one row actually carries — the safe, non-speculative `dateKeys` for consolidateBalanceRows. */
export function datesPresentIn(rows: readonly { balances_by_date: Record<string, unknown> }[]): string[] {
  const dates = new Set<string>()
  for (const r of rows) for (const d of Object.keys(r.balances_by_date)) dates.add(d)
  return [...dates]
}
