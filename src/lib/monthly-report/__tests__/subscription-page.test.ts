/**
 * The Subscription page's 'calxa' layout, with Urban Road's August 2026 figures
 * (see urban-road-subscriptions-fixture for where each one comes from).
 */
import { describe, it, expect } from 'vitest'
import {
  buildSubscriptionPageModel,
  parseSubscriptionPageConfig,
  sheetMonthLabel,
  subscriptionDetailOnBasis,
  subscriptionDetailOnTotalBudget,
  subscriptionNoBudgetNotes,
  varianceFill,
  type SubscriptionPageConfig,
} from '../subscription-page'
import { SHEET, LABELS, detail, vendor, type V } from './urban-road-subscriptions-fixture'
import type { SubscriptionDetailData } from '@/app/finances/monthly-report/types'

function calxa(extra: Record<string, unknown> = {}): SubscriptionPageConfig {
  const parsed = parseSubscriptionPageConfig({ layout: 'calxa', labels: LABELS, ...extra })
  if (!parsed.ok) throw new Error(parsed.reason)
  return parsed.config
}

describe('parseSubscriptionPageConfig', () => {
  it('no config is today\'s page, and every option is off with it', () => {
    expect(parseSubscriptionPageConfig(undefined)).toEqual({
      ok: true,
      config: { layout: 'accounts', unallocated_row: false, vendors: 'all', total_budget: 'pre_budget_store', basis: 'gross', always_show: [], labels: {}, entity_columns: 'none' },
    })
  })

  it('the standard layout takes total_budget: approved when it is asked for, and only that — vendor_sum is still the calxa sheet\'s', () => {
    expect(parseSubscriptionPageConfig({ total_budget: 'approved' })).toEqual({
      ok: true,
      config: { layout: 'accounts', unallocated_row: false, vendors: 'all', total_budget: 'approved', basis: 'gross', always_show: [], labels: {}, entity_columns: 'none' },
    })
    const sum = parseSubscriptionPageConfig({ total_budget: 'vendor_sum' })
    expect(!sum.ok && sum.reason).toBe('total_budget vendor_sum applies only to layout calxa')
    expect(sum.config.total_budget).toBe('pre_budget_store')
    // Refused for another option, the approved budget asked for still stands.
    expect(parseSubscriptionPageConfig({ total_budget: 'approved', labels: { a: 'b' } }).config.total_budget).toBe('approved')
    // The calxa sheet's default is unchanged.
    expect(calxa()).toMatchObject({ total_budget: 'approved' })
  })

  it('options that act only under the calxa layout are refused without it, with the reason — the standard page, not a silent no-op', () => {
    const parsed = parseSubscriptionPageConfig({ layout: 'accounts', total_budget: 'vendor_sum', unallocated_row: true, labels: { a: 'b' } })
    expect(parsed.ok).toBe(false)
    expect(parsed.config).toMatchObject({ layout: 'accounts', unallocated_row: false, vendors: 'all', total_budget: 'pre_budget_store', basis: 'gross', labels: {} })
    if (!parsed.ok) expect(parsed.reason).toBe('unallocated_row, labels, total_budget vendor_sum apply only to layout calxa')
    const one = parseSubscriptionPageConfig({ always_show: ['Thrive Themes'] })
    expect(!one.ok && one.reason).toBe('always_show applies only to layout calxa')
    // basis is honoured by both layouts, and survives the refusal.
    expect(parseSubscriptionPageConfig({ basis: 'net' }).ok).toBe(true)
    expect(parseSubscriptionPageConfig({ basis: 'net', vendors: 'all' }).config.basis).toBe('net')
  })

  it('the calxa layout turns on Unallocated and the active roster, each of which can be turned back', () => {
    expect(calxa()).toMatchObject({ unallocated_row: true, vendors: 'active' })
    expect(calxa({ unallocated_row: false, vendors: 'all' })).toMatchObject({ unallocated_row: false, vendors: 'all' })
  })

  it('a config it cannot read comes back as the standard page, with the reason', () => {
    const parsed = parseSubscriptionPageConfig({ layout: 'sheet', colour: 'peach' })
    expect(parsed.ok).toBe(false)
    expect(parsed.config.layout).toBe('accounts')
    if (!parsed.ok) expect(parsed.reason).toMatch(/layout/)
  })
})

describe('buildSubscriptionPageModel — Urban Road, August 2026', () => {
  it('titles the page after its one account and ends on ONE total: the P&L actual and the approved budget', () => {
    const model = buildSubscriptionPageModel(detail(), calxa())
    expect(model.title).toBe('IT Costs Software')
    expect(model.rows.filter((r) => r.kind === 'total')).toHaveLength(1)
    expect(model.rows.filter((r) => r.kind === 'subtotal')).toHaveLength(0)
    expect(model.rows.at(-1)).toEqual({ kind: 'total', label: 'TOTAL', prior_month: 13764.27, budget: 13697, actual: 14725.73, variance: -1028.73 })
  })

  it('names the approved budget\'s $101 over the vendor budgets as Unallocated, so the rows add to the TOTAL', () => {
    const model = buildSubscriptionPageModel(detail(), calxa())
    const unallocated = model.rows.find((r) => r.kind === 'unallocated')!
    expect(unallocated.budget).toBe(101)
    // Vendors sum to the P&L to the cent; the sheet's whole-dollar last month is 73c past it.
    expect(unallocated.actual).toBe(0)
    expect(unallocated.prior_month).toBe(-0.73)
    expect(unallocated.variance).toBe(101)
    const body = model.rows.filter((r) => r.kind !== 'total')
    for (const col of ['prior_month', 'budget', 'actual'] as const) {
      const total = model.rows.at(-1)![col]
      expect(body.reduce((t, r) => t + r[col], 0)).toBeCloseTo(total, 2)
    }
  })

  it('with today\'s gross Step 6 budgets ($14,252.91 for August) the vendor budgets run $555.91 past the approved budget, and Unallocated shows it negative', () => {
    const gross: V[] = SHEET.map((v) => [...v])
    const prod: Record<string, number> = {
      adobe: 443, anthropic: 395.83, canva: 20, chatgpt: 161, clickup: 475, cloudflare: 37, datafeedwatch: 155.08,
      dropbox: 250, firefliesai: 50, googleworkspace: 348, instantlyai: 70, klaviyoinc: 1470, kreaai: 55, machship: 701,
      microsoft365: 611, midjourney: 99, neto: 219, orderdesk: 30, paddle: 270, profitpeak: 1197, recraft: 18,
      reviewsio: 1381, shopify: 4500, visily: 21, xero: 180, zohocorp: 1096,
    }
    for (const v of gross) v[3] = prod[v[0]] ?? 0
    const unallocated = buildSubscriptionPageModel(detail(gross), calxa()).rows.find((r) => r.kind === 'unallocated')!
    expect(unallocated.budget).toBe(-555.91)
  })

  it('lists the 28 vendors with a budget or a charge in either month, in the sheet\'s case-insensitive order', () => {
    const model = buildSubscriptionPageModel(detail(), calxa())
    const names = model.rows.filter((r) => r.kind === 'vendor').map((r) => r.label)
    expect(names).toHaveLength(28)
    expect(names).not.toContain('Inhaabit Ar Pty Ltd')
    expect(names).not.toContain('Loom')
    expect(names.slice(0, 5)).toEqual(['Adobe', 'Canva', 'ChatGPT', 'Claude', 'Clickup'])
    expect(names.indexOf('fireflies')).toBe(names.indexOf('Google') - 1)
    expect(names.slice(-3)).toEqual(['Xero', 'Zapier Inc', 'Zoho Corp'])
  })

  it('vendors: all keeps the zero rows; always_show brings back a roster vendor the route did not return (Thrive Themes)', () => {
    const all = buildSubscriptionPageModel(detail(), calxa({ vendors: 'all' })).rows.map((r) => r.label)
    expect(all).toContain('Loom')
    const pinned = buildSubscriptionPageModel(detail(), calxa({ always_show: ['Thrive Themes', 'loom'] }))
    const thrive = pinned.rows.find((r) => r.label === 'Thrive Themes')!
    expect(thrive).toEqual({ kind: 'vendor', label: 'Thrive Themes', prior_month: 0, budget: 0, actual: 0, variance: 0 })
    const labels = pinned.rows.map((r) => r.label)
    expect(labels.indexOf('Thrive Themes')).toBe(labels.indexOf('VISILY') - 1)
    expect(labels).toContain('Loom')
  })

  it('does not print an Unallocated row that is nothing in every column', () => {
    const exact = detail()
    exact.accounts[0].total_prior_month = 13765
    exact.accounts[0].total_budget = 13596
    const model = buildSubscriptionPageModel(exact, calxa())
    expect(model.rows.some((r) => r.kind === 'unallocated')).toBe(false)
  })

  it('says so when the vendor rows run past the account, rather than hiding it in the Unallocated figure', () => {
    const over = detail()
    const edi = over.accounts[0].vendors.find((v) => v.vendor_key === 'harveynorman')!.statement!
    // $27 past a $14,726 account is inside the tolerance (half a percent,
    // $73.63): rounding, and the negative Unallocated says enough.
    edi.actual = 1050
    let model = buildSubscriptionPageModel(over, calxa())
    expect(model.rows.find((r) => r.kind === 'unallocated')!.actual).toBe(-27.27)
    expect(model.notes.join(' ')).not.toContain('more than IT Costs Software')
    // The Edi Cloud bill at its gross $1,125 is $102 past it.
    edi.actual = 1125
    model = buildSubscriptionPageModel(over, calxa())
    expect(model.rows.find((r) => r.kind === 'unallocated')!.actual).toBe(-102.27)
    expect(model.notes.join(' ')).toContain('102 more than IT Costs Software in Xero')
  })

  it('names a line left out for want of an exchange rate', () => {
    const d = detail()
    d.accounts[0].unconverted = [{ vendor_name: 'Cloudflare', amount: 25, source_currency: 'USD', is_current: true, reason: 'billed in USD and the document carries no exchange rate' }]
    expect(buildSubscriptionPageModel(d, calxa()).notes.join(' ')).toContain('Cloudflare USD 25.00 (this month)')
  })

  it('a budget that is only the vendor sum is stated as such', () => {
    const d = detail(SHEET, 'vendor_sum')
    d.accounts[0].total_budget = 13596
    expect(buildSubscriptionPageModel(d, calxa()).notes.join(' ')).toContain('no budget line of its own')
  })

  it('two accounts foot one by one: each gets Unallocated and a subtotal, TOTAL is the grand total', () => {
    const d = detail()
    d.accounts.push({
      account_code: '63706', account_name: 'IT Costs Software Migration',
      vendors: [vendor(['acme', 'Acme Migrations', 0, 0, 500])],
      total_prior_month: 0, total_actual: 550, total_budget: 0, total_variance: -550, total_budget_source: 'approved_budget',
    })
    d.grand_total = { prior_month: 13764.27, actual: 15275.73, budget: 13697, variance: -1578.73 }
    const model = buildSubscriptionPageModel(d, calxa())
    expect(model.title).toBe('Subscriptions')
    expect(model.rows.filter((r) => r.kind === 'subtotal').map((r) => r.label)).toEqual(['Total IT Costs Software', 'Total IT Costs Software Migration'])
    expect(model.rows.filter((r) => r.kind === 'unallocated').map((r) => r.actual)).toEqual([0, 50])
    expect(model.rows.at(-1)).toMatchObject({ label: 'TOTAL', actual: 15275.73 })
  })
})

describe('buildSubscriptionPageModel — the TOTAL foots to what is printed', () => {
  it('an account the route counted in grand_total but dropped for having no vendors is not in the TOTAL', () => {
    // The assembler adds 63706's $1,411 ledger figure into grand_total before
    // filtering the account out for having no vendor rows.
    const d = detail()
    d.accounts.push({
      account_code: '63701', account_name: 'Hosting',
      vendors: [vendor(['aws', 'AWS', 0, 400, 412])],
      total_prior_month: 0, total_actual: 412, total_budget: 400, total_variance: -12, total_budget_source: 'approved_budget',
    })
    d.grand_total = { prior_month: 13764.27, actual: 16136.73, budget: 14097, variance: -2039.73 }
    const model = buildSubscriptionPageModel(d, calxa())
    const subtotals = model.rows.filter((r) => r.kind === 'subtotal')
    const total = model.rows.at(-1)!
    for (const col of ['prior_month', 'budget', 'actual'] as const) {
      expect(total[col]).toBeCloseTo(subtotals.reduce((t, r) => t + r[col], 0), 2)
    }
    expect(total).toMatchObject({ actual: 15137.73, prior_month: 13764.27, budget: 14097, variance: -1040.73 })
  })
})

describe('buildSubscriptionPageModel — which TOTAL budget (Matt\'s decision, a switch)', () => {
  it('total_budget: vendor_sum prints the vendor budgets\' $13,596 as the TOTAL, as the client\'s sheet does, with nothing unallocated in the budget column', () => {
    expect(calxa()).toMatchObject({ total_budget: 'approved' })
    const model = buildSubscriptionPageModel(detail(), calxa({ total_budget: 'vendor_sum' }))
    expect(model.rows.at(-1)).toEqual({ kind: 'total', label: 'TOTAL', prior_month: 13764.27, budget: 13596, actual: 14725.73, variance: -1129.73 })
    const unallocated = model.rows.find((r) => r.kind === 'unallocated')!
    expect(unallocated.budget).toBe(0)
    const body = model.rows.filter((r) => r.kind !== 'total')
    expect(body.reduce((t, r) => t + r.budget, 0)).toBeCloseTo(13596, 2)
    // A choice, not a fallback: no "no budget line of its own" note.
    expect(model.notes.join(' ')).not.toContain('no budget line of its own')
  })

  it('two accounts under vendor_sum: each subtotal is its own vendor budgets, TOTAL their sum', () => {
    const d = detail()
    d.accounts.push({
      account_code: '63706', account_name: 'IT Costs Software Migration',
      vendors: [vendor(['acme', 'Acme Migrations', 0, 40, 500])],
      total_prior_month: 0, total_actual: 550, total_budget: 0, total_variance: -550, total_budget_source: 'approved_budget',
    })
    d.grand_total = { prior_month: 13764.27, actual: 15275.73, budget: 13697, variance: -1578.73 }
    const model = buildSubscriptionPageModel(d, calxa({ total_budget: 'vendor_sum' }))
    expect(model.rows.filter((r) => r.kind === 'subtotal').map((r) => [r.budget, r.variance])).toEqual([[13596, -1129.73], [40, -510]])
    expect(model.rows.at(-1)).toMatchObject({ budget: 13636, variance: -1639.73 })
  })

  it('an unknown total_budget is a config it cannot read', () => {
    expect(parseSubscriptionPageConfig({ layout: 'calxa', total_budget: 'forecast' }).ok).toBe(false)
  })
})

describe('buildSubscriptionPageModel — a budget-store client with no budget in force', () => {
  const none = () => {
    const d = detail()
    Object.assign(d.accounts[0], { total_budget: 0, total_variance: -14725.73, total_budget_source: 'none', total_budget_absent: 'no approved budget version is locked for FY2027' })
    d.grand_total = { prior_month: 13764.27, actual: 14725.73, budget: 0, variance: -14725.73 }
    return d
  }

  it('the TOTAL has no budget and no variance — not $0 and a $14,726 overrun — and the page says why', () => {
    const model = buildSubscriptionPageModel(none(), calxa())
    expect(model.rows.at(-1)).toMatchObject({ kind: 'total', budget: 0, no_budget: true })
    // Nothing to allocate: the vendor budgets are not "unallocated" against a budget that is not there.
    expect(model.rows.find((r) => r.kind === 'unallocated')?.budget ?? 0).toBe(0)
    expect(model.notes.join(' ')).toContain('IT Costs Software has no approved budget this month because no approved budget version is locked for FY2027')
  })

  it('subscriptionNoBudgetNotes gives the standard layout the same sentence', () => {
    expect(subscriptionNoBudgetNotes(none())).toEqual([
      'IT Costs Software has no approved budget this month because no approved budget version is locked for FY2027, so its total has no budget or variance. The vendor budgets are the vendors\' own.',
    ])
    expect(subscriptionNoBudgetNotes(detail())).toEqual([])
  })

  it('under vendor_sum the approved budget is not what the TOTAL prints, so there is nothing to explain', () => {
    const model = buildSubscriptionPageModel(none(), calxa({ total_budget: 'vendor_sum' }))
    expect(model.rows.at(-1)).toMatchObject({ budget: 13596 })
    expect(model.rows.at(-1)!.no_budget).toBeUndefined()
    expect(model.notes.join(' ')).not.toContain('no approved budget')
  })
})

describe('which money the vendor rows are in (basis)', () => {
  const rowOf = (model: ReturnType<typeof buildSubscriptionPageModel>, label: string) => model.rows.find((r) => r.label === label)!

  it('the calxa layout defaults to net; the standard layout stays gross unless basis is set, and honours it when it is', () => {
    expect(calxa()).toMatchObject({ basis: 'net' })
    expect(calxa({ basis: 'gross' })).toMatchObject({ basis: 'gross' })
    const standard = parseSubscriptionPageConfig({ basis: 'net' })
    expect(standard.ok && standard.config).toMatchObject({ layout: 'accounts', basis: 'net' })
    expect(parseSubscriptionPageConfig({ basis: 'inclusive' }).ok).toBe(false)
  })

  it('net: each vendor prints its statement figures — Adobe 603 | 389 | 412 | (23), Edi Cloud (the placement\'s label) at 1,022.73', () => {
    const model = buildSubscriptionPageModel(detail(), calxa())
    expect(rowOf(model, 'Adobe')).toEqual({ kind: 'vendor', label: 'Adobe', prior_month: 603, budget: 389, actual: 412, variance: -23 })
    expect(rowOf(model, 'Edi Cloud')).toMatchObject({ actual: 1022.73, variance: -1022.73 })
    expect(model.rows.some((r) => r.label === 'Harvey Norman')).toBe(false)
    expect(model.notes.join(' ')).not.toContain('gross amounts')
  })

  it('gross on the calxa layout: the document amounts, with the TOTAL still the P&L account — and Unallocated shows the GST', () => {
    const model = buildSubscriptionPageModel(detail(), calxa({ basis: 'gross' }))
    expect(rowOf(model, 'Adobe')).toEqual({ kind: 'vendor', label: 'Adobe', prior_month: 663.3, budget: 389, actual: 453.2, variance: -64.2 })
    expect(rowOf(model, 'Edi Cloud')).toMatchObject({ actual: 1125 })
    expect(model.rows.at(-1)).toMatchObject({ label: 'TOTAL', actual: 14725.73 })
    expect(model.rows.find((r) => r.kind === 'unallocated')!.actual).toBeLessThan(-1000)
  })

  it('net asked for, but the report carries no statement figures (the stored history): gross, and the page says so', () => {
    const d = detail()
    for (const v of d.accounts[0].vendors) delete v.statement
    const model = buildSubscriptionPageModel(d, calxa())
    expect(rowOf(model, 'Adobe')).toMatchObject({ actual: 453.2 })
    expect(model.notes.join(' ')).toContain('The vendor figures are the documents\' gross amounts, GST included where it was charged')
    // Its Unallocated is the GST, which that note explains — not "money this account did not post".
    expect(model.rows.find((r) => r.kind === 'unallocated')!.actual).toBeLessThan(-1000)
    expect(model.notes.join(' ')).not.toContain('did not post')
  })

  it('a row is never named for a document\'s contact — only the canonical name or the placement\'s label', () => {
    const d = detail()
    // A field an older cached response may still carry.
    Object.assign(d.accounts[0].vendors.find((v) => v.vendor_key === 'adobe')!, { contact_name: 'Commonwealth Bank' })
    const noLabels = parseSubscriptionPageConfig({ layout: 'calxa' }).config
    const labels = buildSubscriptionPageModel(d, noLabels).rows.map((r) => r.label)
    expect(labels).toContain('Adobe')
    expect(labels).toContain('Harvey Norman')
    expect(labels).not.toContain('Commonwealth Bank')
  })

  it('orgs in different currencies: net withholds the vendor figures and says why; gross keeps them and says what they add', () => {
    const d = detail()
    d.statement_unavailable = { reason: 'mixed_currencies', currencies: ['AUD', 'HKD'] }
    for (const v of d.accounts[0].vendors) delete v.statement
    d.accounts[0].unconverted = [{ vendor_name: 'Cloudflare', amount: 25, source_currency: 'USD', is_current: true, reason: 'no rate' }]
    const withheld = buildSubscriptionPageModel(d, calxa({ always_show: ['Thrive Themes'] }))
    expect(withheld.rows.map((r) => r.kind)).toEqual(['total'])
    expect(withheld.rows[0]).toMatchObject({ actual: 14725.73, budget: 13697 })
    expect(withheld.notes).toEqual([
      'This business\'s Xero organisations keep their books in different currencies (AUD and HKD), and a vendor\'s figure would add them together as though they were one, so the vendor figures are not shown. The account totals are the organisations\' ledgers added together.',
    ])
    const onBasis = subscriptionDetailOnBasis(d, 'net')
    expect(onBasis.basis).toBe('withheld')
    expect(onBasis.detail.accounts[0].vendors).toEqual([])
    // Gross: the same report object, and a sentence about what its figures add.
    const gross = subscriptionDetailOnBasis(d, 'gross')
    expect(gross.detail).toBe(d)
    expect(gross.notes[0]).toContain('in each organisation\'s own currency')
    const unknown = { ...d, statement_unavailable: { reason: 'mixed_currencies' as const, currencies: ['AUD', null] } }
    expect(subscriptionDetailOnBasis(unknown, 'net').notes[0]).toContain('(AUD and one with no currency recorded)')
  })

  it('a line with no exchange rate is only named under net — under gross it is in the vendor\'s figure', () => {
    const d = detail()
    d.accounts[0].unconverted = [{ vendor_name: 'Cloudflare', amount: 25, source_currency: 'USD', is_current: true, reason: 'billed in USD and the document carries no exchange rate' }]
    expect(buildSubscriptionPageModel(d, calxa({ basis: 'gross' })).notes.join(' ')).not.toContain('Cloudflare USD')
  })

  it('subscriptionDetailOnBasis(gross) hands back the very same report, so the standard page cannot move', () => {
    const d = detail()
    const onBasis = subscriptionDetailOnBasis(d, 'gross')
    expect(onBasis.detail).toBe(d)
    expect(onBasis.notes).toEqual([])
  })
})

describe('subscriptionDetailOnTotalBudget — the standard page does not move when a client joins the budget store', () => {
  // Urban Road, August 2026: the Subtotal read 14,253 (the vendor budgets)
  // before the store and 13,697 (approved) after it, over vendor rows that
  // still added to 14,253 — on a page nobody had asked to change.
  it('by default a budget-store report prints the total budget it printed before the store, account and grand total', () => {
    const { detail: d, notes } = subscriptionDetailOnTotalBudget(detail(), 'pre_budget_store')
    expect(d.accounts[0]).toMatchObject({ total_budget: 13596, total_variance: -1129.73, total_budget_source: 'vendor_sum' })
    // The rows above it add to it.
    expect(d.accounts[0].vendors.reduce((t, v) => t + v.budget, 0)).toBe(13596)
    expect(d.grand_total).toEqual({ prior_month: 13764.27, actual: 14725.73, budget: 13596, variance: -1129.73 })
    expect(notes).toEqual([])
  })

  it('a pinned forecast line (Precision Electrical) prints that line, as it did', () => {
    const r = detail()
    r.accounts[0].pre_budget_store_total = { budget: 3811.52, variance: -10914.21, source: 'forecast' }
    r.pre_budget_store_grand_budget = 3811.52
    const { detail: d } = subscriptionDetailOnTotalBudget(r, 'pre_budget_store')
    expect(d.accounts[0]).toMatchObject({ total_budget: 3811.52, total_variance: -10914.21, total_budget_source: 'forecast' })
    expect(d.grand_total.budget).toBe(3811.52)
  })

  it('no version in force: before the store there was a figure, so there is no dash and no reason', () => {
    const r = detail()
    Object.assign(r.accounts[0], { total_budget: 0, total_variance: -14725.73, total_budget_source: 'none', total_budget_absent: 'no approved budget version is locked for FY2027' })
    r.grand_total = { prior_month: 13764.27, actual: 14725.73, budget: 0, variance: -14725.73 }
    const { detail: d, notes } = subscriptionDetailOnTotalBudget(r, 'pre_budget_store')
    expect(d.accounts[0].total_budget_source).toBe('vendor_sum')
    expect(d.accounts[0]).not.toHaveProperty('total_budget_absent')
    expect(d.grand_total.budget).toBe(13596)
    expect(notes).toEqual([])
    // Asked for, the approved budget is what it is: a dash, and why.
    const approved = subscriptionDetailOnTotalBudget(r, 'approved')
    expect(approved.detail).toBe(r)
    expect(approved.notes.join(' ')).toContain('no approved budget version is locked for FY2027')
  })

  it('a forecast-basis report carries no such figure, and comes back the very same report', () => {
    const r = detail(SHEET, 'vendor_sum')
    const onTotal = subscriptionDetailOnTotalBudget(r, 'pre_budget_store')
    expect(onTotal.detail).toBe(r)
    expect(onTotal.notes).toEqual([])
  })
})

describe('buildSubscriptionPageModel — the route\'s empty answer', () => {
  it('prints a zero TOTAL and says the rows are missing, rather than throwing', () => {
    const empty: SubscriptionDetailData = { accounts: [], grand_total: { prior_month: 0, actual: 0, budget: 0, variance: 0 }, report_month: '2026-08' }
    const model = buildSubscriptionPageModel(empty, calxa())
    expect(model.title).toBe('Subscriptions')
    expect(model.rows).toEqual([{ kind: 'total', label: 'TOTAL', prior_month: 0, actual: 0, budget: 0, variance: 0 }])
    expect(model.notes[0]).toContain('No subscription vendors were returned')
  })
})

describe('the sheet\'s conventions', () => {
  it('heads the month Aug-26', () => {
    expect(sheetMonthLabel('2026-08')).toBe('Aug-26')
    expect(sheetMonthLabel('2027-01')).toBe('Jan-27')
  })

  it('fills a variance red below −$0.50 and green otherwise, $0 included', () => {
    expect(varianceFill(-23)).toBe('unfavourable')
    expect(varianceFill(-0.51)).toBe('unfavourable')
    expect(varianceFill(-0.5)).toBe('favourable')
    expect(varianceFill(0)).toBe('favourable')
    expect(varianceFill(239)).toBe('favourable')
  })
})
