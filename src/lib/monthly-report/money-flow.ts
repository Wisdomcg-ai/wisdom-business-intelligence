/**
 * WD.4 — Where Did Our Money Go?
 *
 * The funds-flow derivation: every non-bank balance-sheet movement between two
 * month-ends is a source or a use of cash, and by the accounting equation
 * their net IS the bank movement — to the cent, with no plug figure. That
 * identity is the page's own proof: when it doesn't hold (the stored BS fails
 * A = L + E at either date, a month is missing, or the business is
 * multi-entity with mixed currencies) the page says "couldn't check" instead
 * of rendering a story that doesn't add up.
 *
 * Sign conventions (verified against prod 2026-09-01): liabilities and equity
 * are stored POSITIVE; A − L − E = 0 on clean tenants.
 *
 * Classification:
 *   bank            = isBankRow — section 'Bank' asset accounts, or the
 *                     business's chosen bank accounts (opening-bank)
 *   earnings        = Current Year Earnings + Retained Earnings — the profit,
 *                     printed once as the Surplus / Deficit, never as a source
 *   asset   Δ up    → USE   ("more money tied up")     Δ down → SOURCE
 *   liability Δ up  → SOURCE ("owed more")             Δ down → USE
 *   equity  Δ up    → SOURCE (capital in)              Δ down → USE
 *
 * The page is Calxa's (Urban Road's August 2026 pack, p26): a Summary Income
 * and Expenditure block, Where Our Money Came From, Where We've Spent Our
 * Money, How this Affected Our Bank, each account with its opening and closing
 * balance. Our first version listed Current Year Earnings as the biggest
 * "source" ($132,701 of Urban Road's August) — the profit arriving through the
 * back door of the balance sheet — and folded every bank account into one
 * sentence. Profit is its own block now, and each bank account its own line.
 *
 * WHY EARNINGS ARE CURRENT YEAR + RETAINED TOGETHER. In the first month of a
 * fiscal year Xero closes last year's Current Year Earnings into Retained
 * Earnings: Urban Road's CYE went from (16,961.64) at 30 Jun 2026 to 14,067.26
 * at 31 Jul while Retained Earnings fell by 16,961.63. CYE's movement alone
 * would call July's profit $31,029 and list a $16,962 retained-earnings "use"
 * that no money left for. The pair moves by July's profit, 14,067.27 — the
 * same articulation Gate 2 of the reconciliation verifier checks.
 *
 * Pure — the route is a thin IO wrapper.
 */

import { isBankRow, parseBankAccountIds } from './opening-bank'
import { compareStatementLines } from './statement-order'
import { consolidateBalanceRows, consolidateFlowRows, type ConsolidationOrg, type FxRateLike } from './multi-org-consolidate'

export interface BsRowInput {
  /** The Xero AccountID — what a chosen bank account and a credit card are matched on. */
  account_id?: string | null
  account_code?: string | null
  account_name: string
  /** 'asset' | 'liability' | 'equity' (canonical, from the BS mirror). */
  account_type: string
  section: string | null
  tenant_id: string
  balances_by_date: Record<string, number | string | null>
}

/** One account's row from the P&L mirror (xero_pl_lines_wide_compat). */
export interface PlRowInput {
  tenant_id: string
  /** 'revenue' | 'cogs' | 'opex' | 'other_income' | 'other_expense' */
  account_type: string
  monthly_values: Record<string, number | string | null>
}

export interface FlowItem {
  label: string
  section: string | null
  /** The movement, as a positive amount; which list the item is in says which way. */
  amount: number
  /** 'asset' | 'liability' | 'equity' — for grouping/wording in the renderer. */
  kind: string
  account_id?: string | null
  account_code?: string | null
  /**
   * The balances at the two month-ends, signed the way the page prints them:
   * as the mirror stores them (an asset or a liability each positive in its own
   * column), except a Xero credit card, which prints as a negative asset.
   */
  opening: number
  closing: number
}

export interface BankAccountFlow {
  label: string
  account_id: string | null
  opening: number
  closing: number
  movement: number
}

/** The month's P&L, as the Summary Income and Expenditure block prints it. */
export interface IncomeSummary {
  income: number
  cost_of_sales: number
  expense: number
  other_income: number
  other_expense: number
  surplus: number
}

export interface MoneyFlow {
  comparable: boolean
  /** Set when not comparable — shown to the reader verbatim. */
  reason?: string
  period_month: string
  prior_month: string
  bank: { start: number; end: number; delta: number }
  /** Every bank account that held money at either month-end, in balance-sheet order. */
  bank_accounts: BankAccountFlow[]
  /** 'chosen' when the business named its bank accounts; 'section' for the Bank section. */
  bank_basis: 'section' | 'chosen'
  /** Chosen bank accounts this balance sheet does not hold at all — the page says so. */
  unmatched_bank_account_ids: string[]
  /** Chosen bank accounts it holds as a liability or equity — the page names them. */
  non_asset_bank_accounts: { account_id: string; label: string; kind: string }[]
  /** The month's P&L from the stored sync; null when the sync holds none for the month. */
  summary: IncomeSummary | null
  /** Δ(Current Year Earnings + Retained Earnings) — the profit the balance sheet saw. */
  earnings_movement: number
  sources: FlowItem[]
  uses: FlowItem[]
  /** The net of movements under 50c, which are not listed (source-positive). */
  unlisted_movement: number
  /** earnings + sources − uses + unlisted − Δbank. 0 by construction when the equation holds. */
  continuity_residual: number
  /**
   * Set only by deriveConsolidatedMoneyFlow (more than one Xero organisation):
   * every organisation added together, so the page can say so — nothing else
   * on it names them, and a group that loses a connection would otherwise
   * print every total short, balanced, with no mark of it. Absent for a
   * single-organisation business, which prints exactly as before.
   */
  organisations?: { name: string; currency: string }[]
}

/** Last calendar day of 'YYYY-MM' as 'YYYY-MM-DD'. */
export function endOfMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
}

/** Prior 'YYYY-MM'. */
export function priorMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

/**
 * The surplus the page prints: the P&L's, or — when the sync holds no P&L for
 * the month — the movement in earnings, which is the same figure by the
 * accounting equation.
 */
export function flowSurplus(flow: Pick<MoneyFlow, 'summary' | 'earnings_movement'>): number {
  return flow.summary ? flow.summary.surplus : flow.earnings_movement
}

// `|| 0` folds -0 into 0: a residual of -0 is not a direction.
const round2 = (v: number) => Math.round(v * 100) / 100 || 0
const num = (v: number | string | null | undefined) => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

/** Xero's fixed id for the Current Year Earnings row, which has no real account. */
const CURRENT_YEAR_EARNINGS_ID = 'abababab-abab-abab-abab-abababababab'

/**
 * The equity rows that carry the profit. By name, as Gate 2 matches them:
 * both are Xero system accounts with stable wording, and Urban Road has two
 * ("Retained Earnings" and "Retained Earnings b/f").
 */
export function isEarningsRow(r: BsRowInput): boolean {
  if (r.account_type !== 'equity') return false
  if (r.account_id === CURRENT_YEAR_EARNINGS_ID) return true
  const n = r.account_name.toLowerCase()
  return n.includes('current year earnings')
    || n.includes('retained earnings')
    || n.includes('profit ~ loss earned this year')
    || n.includes('profit / loss earned this year')
}

/**
 * Balance-sheet order: assets, liabilities, equity; within each, Xero's
 * sections in the order its balance sheet prints them; within a section, the
 * statement pages' code order (codes as text, codeless accounts after, A-Z).
 *
 * Not Calxa's order. Its Urban Road page lists Amex, Shopify loan 2, Latitude
 * Gem Visa, Trade Debtors, Wise, Trade Creditors… — neither code nor name nor
 * amount order, and no rule we could find reproduces it. Balance-sheet order at
 * least puts each account where the balance sheet two pages earlier put it.
 */
const KIND_ORDER = ['asset', 'liability', 'equity']
const SECTION_ORDER = ['bank', 'current assets', 'fixed assets', 'non-current assets', 'current liabilities', 'non-current liabilities']

function sectionRank(section: string | null): [number, string] {
  if (section === null) return [SECTION_ORDER.length + 1, '']
  const s = section.trim().toLowerCase()
  const i = SECTION_ORDER.indexOf(s)
  return i >= 0 ? [i, ''] : [SECTION_ORDER.length, s]
}

function compareBalanceSheetOrder(
  a: { kind: string; section: string | null; label: string; account_code?: string | null },
  b: { kind: string; section: string | null; label: string; account_code?: string | null },
): number {
  const ka = KIND_ORDER.indexOf(a.kind), kb = KIND_ORDER.indexOf(b.kind)
  if (ka !== kb) return (ka < 0 ? 99 : ka) - (kb < 0 ? 99 : kb)
  const [sa, na] = sectionRank(a.section)
  const [sb, nb] = sectionRank(b.section)
  if (sa !== sb) return sa - sb
  if (na !== nb) return na < nb ? -1 : 1
  return compareStatementLines(
    { account_name: a.label, account_code: a.account_code },
    { account_name: b.label, account_code: b.account_code },
  )
}

/** Sum the month's P&L by type, or null when the sync holds no row for the month. */
export function summariseMonthPl(rows: PlRowInput[], period: string): IncomeSummary | null {
  const inMonth = rows.filter((r) => r.monthly_values?.[period] !== undefined && r.monthly_values?.[period] !== null)
  if (inMonth.length === 0) return null
  const s = { income: 0, cost_of_sales: 0, expense: 0, other_income: 0, other_expense: 0 }
  for (const r of inMonth) {
    const v = num(r.monthly_values[period])
    switch (r.account_type) {
      case 'revenue': s.income += v; break
      case 'cogs': s.cost_of_sales += v; break
      case 'opex': s.expense += v; break
      case 'other_income': s.other_income += v; break
      case 'other_expense': s.other_expense += v; break
      default: break
    }
  }
  return {
    income: round2(s.income),
    cost_of_sales: round2(s.cost_of_sales),
    expense: round2(s.expense),
    other_income: round2(s.other_income),
    other_expense: round2(s.other_expense),
    surplus: round2(s.income - s.cost_of_sales - s.expense + s.other_income - s.other_expense),
  }
}

const notComparable = (period: string, prior: string, reason: string): MoneyFlow => ({
  comparable: false,
  reason,
  period_month: period,
  prior_month: prior,
  bank: { start: 0, end: 0, delta: 0 },
  bank_accounts: [],
  bank_basis: 'section',
  unmatched_bank_account_ids: [],
  non_asset_bank_accounts: [],
  summary: null,
  earnings_movement: 0,
  sources: [],
  uses: [],
  unlisted_movement: 0,
  continuity_residual: 0,
})

export function deriveMoneyFlow(
  rows: BsRowInput[],
  period: string,
  opts: {
    equationTolerance?: number
    minItem?: number
    /** The business's chosen bank accounts (parseBankAccountIds); null/absent = the Bank section. */
    bankAccountIds?: readonly string[] | null
    /** The P&L mirror's rows, for the Summary Income and Expenditure block. */
    plRows?: PlRowInput[]
    /** AccountIDs Xero calls a credit card — printed as negative assets, as Calxa prints them. */
    creditCardAccountIds?: readonly string[]
  } = {},
): MoneyFlow {
  const prior = priorMonth(period)
  const endKey = endOfMonth(period)
  const startKey = endOfMonth(prior)
  // The stored equation holds to ~the cent on clean tenants; $1 absorbs
  // accumulated rounding without letting a real imbalance through.
  const equationTolerance = opts.equationTolerance ?? 1
  // A movement under 50c prints as "0" — a row that says nothing. Urban Road's
  // Rounding account moved 7c in August and printed as a source of 0. Not
  // listed, but still counted (unlisted_movement), so the proof stays exact.
  const minItem = opts.minItem ?? 0.5
  // Normalised once (trimmed, lower-cased, de-duplicated; empty = no choice), so
  // the matched/unmatched checks and the bank sum read the same list.
  const bankAccountIds = parseBankAccountIds(opts.bankAccountIds)
  const cards = new Set(opts.creditCardAccountIds ?? [])

  if (rows.length === 0) {
    return notComparable(period, prior, 'No stored balance sheet for this business yet.')
  }

  // WD.6 ships per-entity columns; until then a multi-entity flow would sum
  // mixed currencies (IICT holds HKD) — refuse honestly.
  const tenants = new Set(rows.map((r) => r.tenant_id))
  if (tenants.size > 1) {
    return notComparable(period, prior, 'This business has multiple Xero organisations — per-entity money flow arrives with the entity columns work.')
  }

  // Both month-ends must exist on at least one row; a business synced mid-year
  // has no prior month to move from.
  const hasEnd = rows.some((r) => r.balances_by_date[endKey] !== undefined)
  const hasStart = rows.some((r) => r.balances_by_date[startKey] !== undefined)
  if (!hasEnd || !hasStart) {
    return notComparable(
      period, prior,
      !hasEnd
        ? `No stored balance sheet for ${period} yet — sync may not have reached it.`
        : `No stored balance sheet for ${prior} — the month before this one hasn't been synced.`,
    )
  }

  // The page's licence to render: A − L − E within tolerance at BOTH dates.
  for (const [label, key] of [[prior, startKey], [period, endKey]] as const) {
    let a = 0, l = 0, e = 0
    for (const r of rows) {
      const v = num(r.balances_by_date[key])
      if (r.account_type === 'asset') a += v
      else if (r.account_type === 'liability') l += v
      else if (r.account_type === 'equity') e += v
    }
    if (Math.abs(a - l - e) > equationTolerance) {
      return notComparable(
        period, prior,
        `The stored balance sheet for ${label} doesn't balance (off by ${round2(a - l - e)}) — the flow can't be trusted until the sync is repaired.`,
      )
    }
  }

  // A chosen bank set that matches nothing would read as a business with no
  // bank and a flow that "explains" a $0 movement. Say what is wrong instead.
  // Matched case-insensitively: a Xero AccountID is a GUID, the mirror serves
  // it lower-case, and a list pasted from elsewhere may not be.
  const byId = (id: string) => rows.find((r) => (r.account_id ?? '').trim().toLowerCase() === id)
  const unmatched = bankAccountIds ? bankAccountIds.filter((id) => !byId(id)) : []
  const nonAsset = bankAccountIds
    ? bankAccountIds.flatMap((id) => {
        const r = byId(id)
        return r && r.account_type !== 'asset' ? [{ account_id: id, label: r.account_name, kind: r.account_type }] : []
      })
    : []
  if (bankAccountIds && unmatched.length + nonAsset.length === bankAccountIds.length) {
    return notComparable(period, prior, 'None of the bank accounts chosen for this report is in the stored balance sheet — check the report settings.')
  }

  let bankStart = 0
  let bankEnd = 0
  let earnings = 0
  let unlisted = 0
  const bankAccounts: (BankAccountFlow & { kind: string; section: string | null; account_code?: string | null })[] = []
  const sources: FlowItem[] = []
  const uses: FlowItem[] = []
  const sortAs = new Map<FlowItem, { kind: string; section: string | null }>()

  for (const r of rows) {
    const start = num(r.balances_by_date[startKey])
    const end = num(r.balances_by_date[endKey])
    const d = end - start
    // One definition of bank, shared with the cashflow page's opening balance.
    if (isBankRow(r, bankAccountIds)) {
      bankStart += start
      bankEnd += end
      // An account with nothing in it at either date — Wise AUD, eWay — is
      // not part of "how this affected our bank".
      if (Math.abs(start) >= 0.5 || Math.abs(end) >= 0.5) {
        bankAccounts.push({
          label: r.account_name, account_id: r.account_id ?? null, account_code: r.account_code ?? null,
          kind: r.account_type, section: r.section,
          opening: round2(start), closing: round2(end), movement: round2(d),
        })
      }
      continue
    }
    if (isEarningsRow(r)) {
      earnings += d
      continue
    }

    // Source-positive: what this movement did for the bank.
    const forBank = r.account_type === 'asset' ? -d : d
    if (Math.abs(d) < minItem) {
      unlisted += forBank
      continue
    }

    // A Xero credit card is a bank-type account the mirror files as a
    // liability; Calxa prints its balance as the negative asset Xero's chart
    // says it is — (65,919), not 65,919. Only the printed balances turn over;
    // the movement, and so which list it is in, is the liability's.
    const flip = r.account_type === 'liability' && !!r.account_id && cards.has(r.account_id) ? -1 : 1
    const item: FlowItem = {
      label: r.account_name,
      section: r.section,
      amount: round2(Math.abs(forBank)),
      kind: r.account_type,
      account_id: r.account_id ?? null,
      account_code: r.account_code ?? null,
      opening: round2(start * flip),
      closing: round2(end * flip),
    }
    // …and it sorts where that negative asset belongs, among the bank-type
    // accounts, which is also where Calxa lists Amex: first.
    if (flip === -1) sortAs.set(item, { kind: 'asset', section: 'Bank' })
    if (forBank > 0) sources.push(item)
    else uses.push(item)
  }

  const sortKey = (i: FlowItem) => ({ ...i, ...sortAs.get(i) })
  const byBalanceSheet = (a: FlowItem, b: FlowItem) => compareBalanceSheetOrder(sortKey(a), sortKey(b))
  sources.sort(byBalanceSheet)
  uses.sort(byBalanceSheet)
  bankAccounts.sort(compareBalanceSheetOrder)

  const bankDelta = round2(bankEnd - bankStart)
  const totalSources = sources.reduce((s, i) => s + i.amount, 0)
  const totalUses = uses.reduce((s, i) => s + i.amount, 0)
  const residual = round2(earnings + totalSources - totalUses + unlisted - bankDelta)

  // Only this organisation's P&L. The multi-entity refusal above is on the
  // balance sheet's rows; a P&L row from another org must not slip into the
  // surplus of this one.
  const tenant = rows[0].tenant_id
  const summary = summariseMonthPl((opts.plRows ?? []).filter((p) => p.tenant_id === tenant), period)

  return {
    comparable: true,
    period_month: period,
    prior_month: prior,
    bank: { start: round2(bankStart), end: round2(bankEnd), delta: bankDelta },
    bank_accounts: bankAccounts.map(({ label, account_id, opening, closing, movement }) => ({ label, account_id, opening, closing, movement })),
    bank_basis: bankAccountIds ? 'chosen' : 'section',
    unmatched_bank_account_ids: unmatched,
    non_asset_bank_accounts: nonAsset,
    summary,
    earnings_movement: round2(earnings),
    sources,
    uses,
    unlisted_movement: round2(unlisted),
    continuity_residual: residual,
  }
}

// ─── P9 — more than one Xero organisation ──────────────────────────────────

export interface MoneyFlowOrganisation {
  tenant_id: string
  name: string
  /** xero_connections.functional_currency; null when it was never recorded. */
  functional_currency: string | null
}

/**
 * Where Did Our Money Go for a business Xero holds as several organisations
 * (Dragon Roofing's two, IICT Group's two, one of them in Hong Kong dollars).
 *
 * Same-currency first (DRG-49): every organisation's balance-sheet rows are
 * summed as though they were one ledger — no translation, so a two-AUD-org
 * business like Dragon touches no rate at all. A foreign organisation's rows
 * are translated first (the account_id/account_code stay real and distinct,
 * so a chosen bank or debtors account still matches only the row it names)
 * and relabelled onto one synthetic tenant, and the WHOLE single-organisation
 * engine (deriveMoneyFlow) then runs over the combined ledger unchanged: the
 * accounting-equation proof, the bank matching, the sorting, all of it.
 *
 * IAS 21 (decision 7): balance-sheet rows — the bank and every source/use —
 * translate at the closing rate of their own date, exactly as P8's
 * consolidated balance sheet translates assets and liabilities. The month's
 * P&L (the Summary Income and Expenditure block, and the Surplus/Deficit this
 * page opens on) translates at the month's average rate instead, because a
 * month's income and expense are a MOVEMENT, not a balance. Those two
 * translations of the same underlying profit will not agree to the cent for a
 * foreign organisation — the residue is a currency translation difference,
 * not a missing dollar — and it prints on its own line via the page's
 * existing "the month's profit on the income statement and on the balance
 * sheet differ by that much" note (moneyFlowProof, money-flow-rows.ts):
 * nothing is folded into the Surplus figure to make the page balance.
 *
 * A rate this business needs and does not have refuses, naming the
 * organisation and the date or month — never HKD added to AUD one-for-one,
 * never a blank page. A currency that was never recorded refuses too.
 */
export function deriveConsolidatedMoneyFlow(
  rows: BsRowInput[],
  period: string,
  organisations: readonly MoneyFlowOrganisation[],
  opts: {
    equationTolerance?: number
    minItem?: number
    bankAccountIds?: readonly string[] | null
    plRows?: PlRowInput[]
    creditCardAccountIds?: readonly string[]
    /** fx_rates rows for every currency pair a foreign organisation needs. */
    rates?: readonly FxRateLike[]
  } = {},
): MoneyFlow {
  const prior = priorMonth(period)
  const orgs = [...new Map(organisations.map((o) => [o.tenant_id, o])).values()]
  if (orgs.length === 0) {
    return notComparable(period, prior, 'No Xero organisation is connected to this business.')
  }
  // One organisation is the ordinary page — no translation, no relabelling,
  // and byte-identical to a business that was never multi-org at all.
  if (orgs.length === 1) return deriveMoneyFlow(rows, period, opts)

  // Every organisation needs its own balance sheet at BOTH month-ends before
  // any figure is merged: a connection with nothing synced yet would
  // otherwise vanish into the combined ledger, contributing a silent $0 and
  // understating every total with no sign that anything was missing — the
  // same trap totalBankAt (opening-bank.ts) and the consolidated balance
  // sheet already guard against.
  const endKey = endOfMonth(period)
  const startKey = endOfMonth(prior)
  for (const o of orgs) {
    const hasEnd = rows.some((r) => r.tenant_id === o.tenant_id && r.balances_by_date[endKey] !== undefined)
    const hasStart = rows.some((r) => r.tenant_id === o.tenant_id && r.balances_by_date[startKey] !== undefined)
    if (!hasEnd) return notComparable(period, prior, `No stored balance sheet for ${o.name} at ${period} yet — sync may not have reached it.`)
    if (!hasStart) return notComparable(period, prior, `No stored balance sheet for ${o.name} at ${prior} — the month before this one hasn't been synced.`)
  }

  const consolidationOrgs: ConsolidationOrg[] = orgs.map((o) => ({
    tenant_id: o.tenant_id,
    name: o.name,
    functional_currency: o.functional_currency,
  }))
  const rates = opts.rates ?? []

  // The two month-ends this page prints — never every date the mirror has
  // ever carried: a business's oldest-synced organisation can carry years of
  // history a sibling predates, and that history is not this report's
  // concern (IICT-55/56). Both dates are already proven present for every
  // organisation by the hasEnd/hasStart check above.
  const bs = consolidateBalanceRows(rows, consolidationOrgs, rates, [startKey, endKey], { prefixLabel: true })
  if (!bs.ok) return notComparable(period, prior, bs.reason)

  let plRows: PlRowInput[] | undefined
  if (opts.plRows && opts.plRows.length > 0) {
    const pl = consolidateFlowRows(opts.plRows, consolidationOrgs, rates)
    if (!pl.ok) return notComparable(period, prior, pl.reason)
    plRows = pl.rows
  }

  const flow = deriveMoneyFlow(bs.rows, period, { ...opts, plRows })
  if (!flow.comparable) return flow

  return {
    ...flow,
    organisations: orgs.map((o) => ({ name: o.name, currency: (o.functional_currency ?? 'AUD').trim().toUpperCase() })),
  }
}
