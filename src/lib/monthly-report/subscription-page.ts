/**
 * The Subscription page's rows, decided apart from jsPDF.
 *
 * Two layouts, chosen per placement in `widget.config.layout`:
 *
 *   'accounts' (the default) — the page every client has had: an account band,
 *              each vendor, a Subtotal per account and a Grand Total. The
 *              renderer draws it as it always did; nothing here changes it.
 *
 *   'calxa'    — the IT Costs Software sheet Urban Road's pack has carried for
 *              years (Calxa p13): one table, "Name | Last Month | Budget |
 *              Aug-26 | Variance", the vendors alphabetically, and ONE total.
 *              Built here, so the arithmetic can be tested with the client's
 *              real figures rather than read back off a PDF.
 *
 * Two things the 'calxa' layout does that the sheet does not, both because the
 * TOTAL row is the P&L account and the approved budget, not a column sum:
 *
 *   - An "Unallocated" row, holding whatever the vendor rows do not account
 *     for, in every column. The sheet's own TOTAL budget ($13,596) is the vendor
 *     budgets, and the same pack's P&L page holds IT Costs Software to $13,697
 *     approved — the same account, the same month, $101 apart. Printing the
 *     approved figure with the $101 named beneath the vendors makes the page
 *     agree with the P&L page AND add up. On the actual side the row is ~0 once
 *     the vendors are stated net of GST in the organisation's currency; when it is not, that is the
 *     page telling the reader something (a journal, a line with no exchange
 *     rate), and it is said rather than absorbed into a vendor.
 *   - Vendors with nothing against them in either month — no budget, no charge
 *     last month or this — are left off. The route lists every active budget
 *     row, so Inhaabit (annual, renews September) and Loom (annual, March)
 *     printed as rows of zeros in August. `always_show` puts a vendor back.
 *
 * Which budget the TOTAL row prints is Matt's decision, and a switch
 * (`total_budget`): 'approved' (the recommendation, and the default under
 * 'calxa') is the account's budget as the route resolved it; 'vendor_sum' is
 * the sheet's own total, the vendor budgets added up, which leaves the page
 * $101 off the P&L page in August 2026.
 *
 * The standard layout honours `total_budget: 'approved'` too, and only when it
 * is set. Unset, a budget-store client's Subtotal and Grand Total are the budget
 * the page printed before the store (the route's `pre_budget_store_total`: the
 * forecast line, else the vendor budgets) — see subscriptionDetailOnTotalBudget.
 * The standard page has no Unallocated row to reconcile the vendor budgets to
 * an approved total, so moving it there unasked left a Budget column that did
 * not add up.
 *
 * Which money the vendor rows are in is a switch too (`basis`). 'gross' is the
 * document amount, GST included where it was charged — what every client's
 * page has always printed, and the basis Step 6 seeded the vendor budgets on.
 * 'net' is the route's `statement` figures, the P&L's money, which the 'calxa'
 * layout defaults to because its TOTAL is the P&L account. It is the one
 * option the standard layout also honours, and only when set explicitly:
 * against gross vendor budgets a net actual reads as a ~10% saving on every
 * Inclusive-billed vendor, so no page moves to it unasked.
 *
 * Every other option acts only under 'calxa'. Set without it, the config is
 * refused with the reason (the page prints the standard layout and says why),
 * so no other client's page moves and no coach believes an inert option is in
 * force.
 *
 * Names are the route's canonical vendor names, or the placement's `labels`
 * for a key. A document's contact never names a row: on bank and card lines it
 * is the bank, the card or the business itself.
 */
import { z } from 'zod'
import type { SubscriptionAccountGroup, SubscriptionDetailData, SubscriptionUnconvertedLine } from '@/app/finances/monthly-report/types'
import { vendorsExceedAccount } from './commentary-money'
import { createVendorKey } from '@/lib/utils/vendor-normalization'

const configSchema = z.object({
  layout: z.enum(['accounts', 'calxa']).default('accounts'),
  /** The Unallocated row. Defaults on under 'calxa'. */
  unallocated_row: z.boolean().optional(),
  /** 'active' = a budget or activity in either month; 'all' = every row the route returns. Defaults 'active' under 'calxa'. */
  vendors: z.enum(['all', 'active']).optional(),
  /** 'gross' = the document amounts; 'net' = the P&L's money (the route's `statement`). Defaults 'net' under 'calxa', 'gross' otherwise. */
  basis: z.enum(['gross', 'net']).optional(),
  /** 'approved' = the account's budget (approved or forecast); 'vendor_sum' = the vendor budgets added up (calxa only). Defaults 'approved' under 'calxa'; unset on the standard layout, the budget it printed before the budget store. */
  total_budget: z.enum(['approved', 'vendor_sum']).optional(),
  /** Vendors printed even with nothing against them — a vendor key or the printed name. */
  always_show: z.array(z.string().min(1)).default([]),
  /** vendor_key → the name the page prints ("anthropic" → "Claude"). Matching keeps the canonical key. */
  labels: z.record(z.string(), z.string().min(1)).default({}),
}).strict()

export interface SubscriptionPageConfig {
  layout: 'accounts' | 'calxa'
  unallocated_row: boolean
  vendors: 'all' | 'active'
  /** 'pre_budget_store' is the standard layout's default: see subscriptionDetailOnTotalBudget. */
  total_budget: 'approved' | 'vendor_sum' | 'pre_budget_store'
  basis: 'gross' | 'net'
  always_show: string[]
  labels: Record<string, string>
}

export type ParsedSubscriptionPageConfig =
  | { ok: true; config: SubscriptionPageConfig }
  /** The page still prints — in the default layout — and says why. */
  | { ok: false; config: SubscriptionPageConfig; reason: string }

const DEFAULT_CONFIG: SubscriptionPageConfig = { layout: 'accounts', unallocated_row: false, vendors: 'all', total_budget: 'pre_budget_store', basis: 'gross', always_show: [], labels: {} }

/**
 * Options only the 'calxa' layout acts on. `basis` is not one: the standard page
 * honours it too, as it does `total_budget: 'approved'` (only 'vendor_sum' is
 * the sheet's alone).
 */
const CALXA_ONLY_KEYS = ['unallocated_row', 'vendors', 'always_show', 'labels'] as const

export function parseSubscriptionPageConfig(raw: unknown): ParsedSubscriptionPageConfig {
  const result = configSchema.safeParse(raw ?? {})
  if (!result.success) {
    const reason = result.error.issues
      .slice(0, 3)
      .map((issue) => (issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message))
      .join('; ')
    return { ok: false, config: { ...DEFAULT_CONFIG }, reason }
  }
  const c = result.data
  const calxa = c.layout === 'calxa'
  // An option that does nothing is a setting a coach believes is in force. Said,
  // as any other config the page cannot act on is, rather than dropped.
  // (The schema accepted it, so a present `raw` is a plain object.)
  const inert: string[] = calxa || raw == null ? [] : CALXA_ONLY_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(raw, key))
  if (!calxa && c.total_budget === 'vendor_sum') inert.push('total_budget vendor_sum')
  const standardTotalBudget = c.total_budget === 'approved' ? 'approved' as const : 'pre_budget_store' as const
  if (inert.length > 0) {
    return {
      ok: false,
      config: { ...DEFAULT_CONFIG, basis: c.basis ?? 'gross', total_budget: standardTotalBudget },
      reason: `${inert.join(', ')} ${inert.length === 1 ? 'applies' : 'apply'} only to layout calxa`,
    }
  }
  return {
    ok: true,
    config: {
      layout: c.layout,
      unallocated_row: calxa ? (c.unallocated_row ?? true) : false,
      vendors: calxa ? (c.vendors ?? 'active') : 'all',
      total_budget: calxa ? (c.total_budget ?? 'approved') : standardTotalBudget,
      basis: c.basis ?? (calxa ? 'net' : 'gross'),
      always_show: calxa ? c.always_show : [],
      labels: calxa ? c.labels : {},
    },
  }
}

export type SubscriptionRowKind = 'vendor' | 'unallocated' | 'subtotal' | 'total'

export interface SubscriptionPageRow {
  kind: SubscriptionRowKind
  label: string
  prior_month: number
  budget: number
  actual: number
  /** Budget − actual, the sheet's F = D − E. */
  variance: number
  /**
   * A subtotal or TOTAL whose account has no budget at all (a budget-store
   * client with no version in force): budget and variance are not figures,
   * and print as a dash with no fill, rather than $0 and the whole actual as
   * an overrun.
   */
  no_budget?: true
}

export interface SubscriptionPageModel {
  /** The account's own name for a one-account page ("IT Costs Software"). */
  title: string
  rows: SubscriptionPageRow[]
  /** Sentences under the table, each a fact the rows cannot show. */
  notes: string[]
}

const cents = (n: number) => Math.round(n * 100) / 100
/** Whole dollars is what the page prints, so that is what "nothing" means. */
const printsAsZero = (n: number) => Math.abs(n) < 0.5

function hasActivity(v: SubscriptionAccountGroup['vendors'][number]): boolean {
  return !printsAsZero(v.budget) || !printsAsZero(v.actual) || !printsAsZero(v.prior_month_actual) || v.transaction_count > 0
}

function money(n: number): string {
  return Math.abs(n).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

/**
 * One sentence per account with no approved budget in force, for either layout.
 * The route leaves such an account's total budget at 0 (fail-closed, as the
 * statement pages are) with its reason; printed bare, that 0 reads as "we
 * budgeted nothing" and the variance as a full-month overrun.
 */
export function subscriptionNoBudgetNotes(detail: SubscriptionDetailData): string[] {
  return (detail.accounts ?? [])
    .filter((a) => a.total_budget_source === 'none')
    .map((a) =>
      `${a.account_name} has no approved budget this month because ${a.total_budget_absent ?? 'no approved budget is in force'}, ` +
      'so its total has no budget or variance. The vendor budgets are the vendors\' own.')
}

function unconvertedNote(lines: readonly SubscriptionUnconvertedLine[]): string | null {
  if (lines.length === 0) return null
  const parts = lines.map((l) =>
    `${l.vendor_name} ${l.source_currency ?? ''} ${l.amount.toFixed(2)} (${l.month ? sheetMonthLabel(l.month) : l.is_current ? 'this month' : 'last month'})`.replace(/\s+/g, ' '))
  return `Not in any vendor's figure, because the document carries no exchange rate to state it in the organisation's currency: ${parts.join('; ')}. It sits in the account total${lines.length === 1 ? '' : 's'} and so in Unallocated.`
}

function currencyList(currencies: readonly (string | null)[]): string {
  const named = currencies.map((c) => c ?? 'one with no currency recorded')
  return named.length <= 1 ? named.join('') : `${named.slice(0, -1).join(', ')} and ${named[named.length - 1]}`
}

function mixedCurrencyNote(currencies: readonly (string | null)[], basis: 'gross' | 'net'): string {
  const orgs = `This business's Xero organisations keep their books in different currencies (${currencyList(currencies)})`
  return basis === 'net'
    ? `${orgs}, and a vendor's figure would add them together as though they were one, so the vendor figures are not shown. The account totals are the organisations' ledgers added together.`
    : `${orgs}. Each vendor figure adds its documents in every organisation together, in each organisation's own currency, so a vendor billed in more than one is not in any one currency.`
}

/**
 * The report with the account and grand total budgets the standard layout
 * prints.
 *
 * 'approved' is the report as the route built it (the approved budget for a
 * budget-store client, with the sentence for an account that has none).
 * 'pre_budget_store', the standard layout's default, puts back the budget the
 * page printed before the client joined the store — the route carries it as
 * `pre_budget_store_total` — so a page nobody asked to change does not: Urban
 * Road's August 2026 Subtotal went from 14,253 to 13,697 over vendor rows that
 * still added to 14,253. A report without it (every forecast-basis client,
 * whose total already is that figure) comes back the very same report.
 */
export function subscriptionDetailOnTotalBudget(
  detail: SubscriptionDetailData,
  totalBudget: 'approved' | 'pre_budget_store',
): { detail: SubscriptionDetailData; notes: string[] } {
  const accounts = detail.accounts ?? []
  if (totalBudget === 'approved' || !accounts.some((a) => a.pre_budget_store_total)) {
    return { detail, notes: subscriptionNoBudgetNotes(detail) }
  }
  const restated: SubscriptionDetailData = {
    ...detail,
    accounts: accounts.map((account) => {
      const before = account.pre_budget_store_total
      if (!before) return account
      // Before the store an account always had a figure, so no reason for lacking one.
      const { total_budget_absent: _absent, ...a } = account
      return { ...a, total_budget: before.budget, total_variance: before.variance, total_budget_source: before.source }
    }),
  }
  if (typeof detail.pre_budget_store_grand_budget === 'number') {
    const budget = detail.pre_budget_store_grand_budget
    restated.grand_total = { ...detail.grand_total, budget, variance: cents(budget - detail.grand_total.actual) }
  }
  return { detail: restated, notes: subscriptionNoBudgetNotes(restated) }
}

export interface SubscriptionDetailOnBasis {
  detail: SubscriptionDetailData
  /**
   * The basis the vendor rows are actually in — 'gross' when 'net' was asked
   * for and the data has no net figures; 'withheld' when net was asked for and
   * the business's orgs are in different currencies, so there are no vendor
   * rows at all (each account keeps its totals).
   */
  basis: 'gross' | 'net' | 'withheld'
  /** Sentences under the table: the fallback, and lines no net figure could include. */
  notes: string[]
}

/**
 * The report with its vendor rows in the money the placement asked for.
 *
 * 'gross' returns `detail` itself, untouched, so the default page is the page
 * it always was. 'net' swaps each vendor's figures for its `statement` ones —
 * but only when every vendor has them: a report without them (the stored
 * history, an older response) prints gross, and says so, rather than mix two
 * bases in one column or print gross under a TOTAL it cannot foot to.
 */
export function subscriptionDetailOnBasis(detail: SubscriptionDetailData, basis: 'gross' | 'net'): SubscriptionDetailOnBasis {
  const currencies = detail.statement_unavailable?.reason === 'mixed_currencies' ? detail.statement_unavailable.currencies : null
  if (basis === 'gross') {
    // Still the very same report. The gross rows have always added the orgs'
    // own currencies together; that is now said, not fixed, on this basis.
    return { detail, basis: 'gross', notes: currencies ? [mixedCurrencyNote(currencies, 'gross')] : [] }
  }
  const accounts = detail.accounts ?? []
  if (currencies) {
    return {
      detail: { ...detail, accounts: accounts.map(({ unconverted: _unconverted, ...a }) => ({ ...a, vendors: [] })) },
      basis: 'withheld',
      notes: [mixedCurrencyNote(currencies, 'net')],
    }
  }
  const vendors = accounts.flatMap((a) => a.vendors ?? [])
  if (vendors.some((v) => !v.statement)) {
    return {
      detail,
      basis: 'gross',
      notes: [
        'The vendor figures are the documents\' gross amounts, GST included where it was charged, because this report carries no ' +
        'net-of-GST figures for them; they run above the account total, which is net.',
      ],
    }
  }
  const notes = accounts.map((a) => unconvertedNote(a.unconverted ?? [])).filter((n): n is string => !!n)
  return {
    detail: {
      ...detail,
      accounts: accounts.map((a) => ({
        ...a,
        vendors: a.vendors.map((v) => ({
          ...v,
          prior_month_actual: v.statement!.prior_month_actual,
          actual: v.statement!.actual,
          variance: v.statement!.variance,
        })),
      })),
    },
    basis: 'net',
    notes,
  }
}

/**
 * The 'calxa' layout's rows for one report.
 *
 * With one account the page is that account: its vendors, Unallocated, TOTAL.
 * With more than one — a client with two software accounts — each account gets
 * its own Unallocated and a subtotal, and TOTAL is the grand total, so the rows
 * still foot account by account.
 */
export function buildSubscriptionPageModel(report: SubscriptionDetailData, config: SubscriptionPageConfig): SubscriptionPageModel {
  const onBasis = subscriptionDetailOnBasis(report, config.basis)
  const detail = onBasis.detail
  const accounts = detail.accounts
  const single = accounts.length === 1
  const rows: SubscriptionPageRow[] = []
  const notes: string[] = [...onBasis.notes]
  const label = (key: string, name: string) => config.labels[key] ?? name
  // The canonical name, or the placement's own for that key. A name the
  // sheet uses that WisdomBI does not (Urban Road's "Edi Cloud" for the bill
  // keyed harveynorman) is a label, never inferred from a document's contact.
  const nameOf = (v: SubscriptionAccountGroup['vendors'][number]) => label(v.vendor_key, v.vendor_name)
  const withheld = onBasis.basis === 'withheld'

  const pinned = new Set(config.always_show.map((s) => createVendorKey(s)))
  /** Each account's budget as the TOTAL prints it, and whether it has one. */
  const budgetOf = (account: SubscriptionAccountGroup): { budget: number; none: boolean } => {
    if (config.total_budget === 'vendor_sum') {
      return { budget: cents(account.vendors.reduce((t, v) => t + v.budget, 0)), none: false }
    }
    return { budget: account.total_budget, none: account.total_budget_source === 'none' }
  }
  const budgets = accounts.map(budgetOf)
  if (config.total_budget === 'approved') {
    notes.push(...subscriptionNoBudgetNotes({ ...detail, accounts }))
  }

  accounts.forEach((account, index) => {
    let vendors = account.vendors
      .filter((v) => config.vendors === 'all' || hasActivity(v) || pinned.has(v.vendor_key) || pinned.has(createVendorKey(nameOf(v))))
      .map((v): SubscriptionPageRow & { key: string } => ({
        key: v.vendor_key,
        kind: 'vendor',
        label: nameOf(v),
        prior_month: v.prior_month_actual,
        budget: v.budget,
        actual: v.actual,
        variance: cents(v.budget - v.actual),
      }))

    // A pinned vendor the route did not return at all (an archived budget
    // row, nothing billed) is still a line on the client's sheet. It goes on
    // the first account: it has no figures to put anywhere else.
    if (index === 0 && !withheld) {
      const present = new Set(accounts.flatMap((a) => a.vendors.flatMap((v) => [v.vendor_key, createVendorKey(nameOf(v))])))
      for (const name of config.always_show) {
        const key = createVendorKey(name)
        if (present.has(key)) continue
        present.add(key)
        vendors.push({ key, kind: 'vendor', label: config.labels[key] ?? name, prior_month: 0, budget: 0, actual: 0, variance: 0 })
      }
    }

    // Case-insensitive, as the sheet sorts: "fireflies" between Edi Cloud and
    // Google, not after Zoho.
    vendors = vendors.sort((a, b) => a.label.localeCompare(b.label, 'en', { sensitivity: 'base', numeric: true }))
    rows.push(...vendors.map(({ key: _key, ...row }) => row))

    const sum = (pick: (r: SubscriptionPageRow) => number) => vendors.reduce((t, r) => t + pick(r), 0)
    const vendorActual = sum((r) => r.actual)
    const { budget: accountBudget, none: noBudget } = budgets[index]
    // With the vendor figures withheld there is nothing to allocate against:
    // an Unallocated row would be the whole account under another name.
    if (config.unallocated_row && !withheld) {
      const unallocated: SubscriptionPageRow = {
        kind: 'unallocated',
        label: 'Unallocated',
        prior_month: cents(account.total_prior_month - sum((r) => r.prior_month)),
        // With no budget in force there is nothing to allocate the vendor
        // budgets against, and a negative $13,596 here would be invented.
        budget: noBudget ? 0 : cents(accountBudget - sum((r) => r.budget)),
        actual: cents(account.total_actual - vendorActual),
        variance: 0,
      }
      unallocated.variance = cents(unallocated.budget - unallocated.actual)
      if (![unallocated.prior_month, unallocated.budget, unallocated.actual].every(printsAsZero)) rows.push(unallocated)

      // Only net rows can be held to the account. Gross rows run past it by
      // the GST, which the gross note already says; blamed on "money this
      // account did not post", the two notes would contradict each other.
      if (onBasis.basis === 'net' && vendorsExceedAccount(vendorActual, account.total_actual)) {
        notes.push(
          `The vendor rows add to ${money(vendorActual - account.total_actual)} more than ${account.account_name} in Xero this month, ` +
          'so Unallocated is negative: at least one vendor figure includes money this account did not post.',
        )
      }
      if (config.total_budget === 'approved' && account.total_budget_source === 'vendor_sum' && vendors.some((v) => !printsAsZero(v.budget))) {
        notes.push(`${account.account_name} has no budget line of its own this month, so its total budget is the sum of the vendor budgets.`)
      }
    }

    if (!single) {
      rows.push({
        kind: 'subtotal',
        label: `Total ${account.account_name}`,
        prior_month: account.total_prior_month,
        budget: accountBudget,
        actual: account.total_actual,
        variance: cents(accountBudget - account.total_actual),
        ...(noBudget ? { no_budget: true as const } : {}),
      })
    }
  })

  // No accounts is the route's empty answer — no codes configured, no Xero
  // connection, or nothing billed or budgeted. It cannot tell those apart, so
  // the page does not guess; it says the rows are missing rather than print a
  // bare row of zeros as though that were the month.
  if (accounts.length === 0) notes.push('No subscription vendors were returned for this month, from Xero or from the vendor budgets.')

  // Every column of the TOTAL is the accounts printed above, added up, so the
  // page foots. Not the route's grand_total: the assembler adds an account in
  // before dropping it for having no vendors, and a TOTAL carrying an account
  // the page does not show cannot be reconciled from the page.
  const totalBudget = cents(budgets.reduce((t, b) => t + b.budget, 0))
  const allNone = budgets.length > 0 && budgets.every((b) => b.none)
  const totalActual = cents(accounts.reduce((t, a) => t + a.total_actual, 0))
  const totalPrior = cents(accounts.reduce((t, a) => t + a.total_prior_month, 0))
  const total = { prior_month: totalPrior, budget: totalBudget, actual: totalActual, variance: cents(totalBudget - totalActual) }
  rows.push({ kind: 'total', label: 'TOTAL', ...total, ...(allNone ? { no_budget: true as const } : {}) })

  return { title: single ? accounts[0].account_name : 'Subscriptions', rows, notes }
}

/** 'YYYY-MM' → 'Aug-26', the sheet's column heading. Unparseable passes through. */
export function sheetMonthLabel(monthKey: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey ?? '')
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const idx = m ? Number(m[2]) - 1 : -1
  return m && idx >= 0 && idx < 12 ? `${names[idx]}-${m[1].slice(2)}` : monthKey
}

/**
 * The sheet's variance fill: red below −$0.50, green otherwise, a $0 included.
 * Rounded to the cent first, so a −0.004 left by float arithmetic is not red.
 */
export function varianceFill(variance: number): 'favourable' | 'unfavourable' {
  return Math.round(variance * 100) / 100 < -0.5 ? 'unfavourable' : 'favourable'
}
