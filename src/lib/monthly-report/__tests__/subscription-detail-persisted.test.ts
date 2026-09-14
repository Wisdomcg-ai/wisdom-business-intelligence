/**
 * The Subscription page, split at the Xero crawl: the assembler the route and
 * the preview harness share, and the crawl the harness rebuilds from what the
 * route persisted. Figures are Urban Road's August 2026 rows as stored in
 * subscription_vendor_actuals (report batch written 11 Sep 20:14), including
 * the stale Avocado Blvd row an earlier crawl left behind at 07:22.
 */
import { describe, it, expect, vi } from 'vitest'
import { fakeSupabase } from './fake-supabase'

const BUSINESS = '28d41193-38ae-4071-a2b1-0dbea90a38fd'
const PROFILE = 'aabd3c49-4dc8-4aa6-a9a6-75f62ab89ff5'
const TENANT = '8519c134-ed81-4d9b-8f07-ce499d12b7ee'

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))
vi.mock('@/lib/business/resolveBusinessProfileIds', () => ({
  resolveBusinessProfileIds: vi.fn(async () => ({ businessId: BUSINESS, profileId: PROFILE, all: [BUSINESS, PROFILE] })),
}))
vi.mock('@/lib/business/resolveXeroBusinessId', () => ({
  resolveXeroConnections: vi.fn(async () => ({ connectionBusinessId: BUSINESS, connections: [{ tenant_id: TENANT }] })),
}))

import {
  addSubscriptionLine,
  assembleSubscriptionDetail,
  emptySubscriptionDetail,
  newSubscriptionCrawl,
  priorMonthKeyOf,
} from '../subscription-detail-build'
import { crawlFromPersistedVendorActuals, loadPersistedSubscriptionCrawl, type PersistedVendorActualRow } from '../subscription-detail-persisted'

const row = (vendor_key: string, vendor_name: string, amount: number, month = '2026-08', source = 'report', updated_at = '2026-09-11T20:14:57.167Z'): PersistedVendorActualRow => ({
  tenant_id: TENANT, vendor_key, vendor_name, month, amount, source, updated_at,
})

describe('the crawl accumulators', () => {
  it('sums a vendor per account, counts current lines, and keeps the per-tenant totals for the write-through', () => {
    const crawl = newSubscriptionCrawl(['63700'])
    addSubscriptionLine(crawl, { accountCode: '63700', vendorName: 'Shopify', amount: 4000, isCurrent: true, tenantId: TENANT })
    addSubscriptionLine(crawl, { accountCode: '63700', vendorName: 'Shopify', amount: 260.66, isCurrent: true, tenantId: TENANT })
    addSubscriptionLine(crawl, { accountCode: '63700', vendorName: 'Shopify', amount: 4212, isCurrent: false, tenantId: TENANT })
    addSubscriptionLine(crawl, { accountCode: '99999', vendorName: 'Not requested', amount: 1, isCurrent: true, tenantId: TENANT })
    const shopify = crawl.vendorData.get('63700')!.get('shopify')!
    // No statement amount given (the stored history): the gross figure stands in, and the crawl does not claim one.
    expect(shopify).toEqual({ vendor_name: 'Shopify', actual: 4260.66, prior_actual: 4212, transaction_count: 2, statement_actual: 4260.66, statement_prior_actual: 4212 })
    expect(crawl.statementAmounts).toBe(false)
    expect(crawl.vendorData.has('99999')).toBe(false)
    expect(crawl.tenantMonthActuals.get(TENANT)!.get('shopify')).toEqual({ name: 'Shopify', amount: 4260.66 })
  })

  it('keeps the gross amount as the vendor\'s figure and the history\'s, with the statement amount beside it', () => {
    const crawl = newSubscriptionCrawl(['63700'])
    addSubscriptionLine(crawl, { accountCode: '63700', vendorName: 'Harvey Norman', amount: 1125, statementAmount: 1022.73, isCurrent: true, tenantId: TENANT })
    addSubscriptionLine(crawl, { accountCode: '63700', vendorName: 'Harvey Norman', amount: 110, statementAmount: 100, isCurrent: false, tenantId: TENANT })
    expect(crawl.vendorData.get('63700')!.get('harveynorman')).toEqual({
      vendor_name: 'Harvey Norman', actual: 1125, prior_actual: 110, transaction_count: 1, statement_actual: 1022.73, statement_prior_actual: 100,
    })
    expect(crawl.tenantMonthActuals.get(TENANT)!.get('harveynorman')).toEqual({ name: 'Harvey Norman', amount: 1125 })
  })

  it('keeps a window month older than last month in its months only — not last month, not the history row', () => {
    const crawl = newSubscriptionCrawl(['61400'])
    addSubscriptionLine(crawl, { accountCode: '61400', vendorName: 'Kim Andrea Ambrocio', amount: 1200, isCurrent: true, tenantId: TENANT, month: '2026-08' })
    addSubscriptionLine(crawl, { accountCode: '61400', vendorName: 'Kim Andrea Ambrocio', amount: 1500, isCurrent: false, tenantId: TENANT, month: '2026-07' })
    addSubscriptionLine(crawl, { accountCode: '61400', vendorName: 'Kim Andrea Ambrocio', amount: 900, isCurrent: false, tenantId: TENANT, month: '2026-06', windowOnly: true })
    // Paid in June only: still a contractor on a page that prints June.
    addSubscriptionLine(crawl, { accountCode: '61400', vendorName: 'Hardware Concepts', amount: 101, isCurrent: false, tenantId: TENANT, month: '2026-06', windowOnly: true })
    expect(crawl.vendorData.get('61400')!.get('kimandreaambrocio')).toEqual({
      vendor_name: 'Kim Andrea Ambrocio', actual: 1200, prior_actual: 1500, transaction_count: 1, statement_actual: 1200, statement_prior_actual: 1500,
      months: { '2026-08': 1200, '2026-07': 1500, '2026-06': 900 },
      statement_months: { '2026-08': 1200, '2026-07': 1500, '2026-06': 900 },
    })
    expect(crawl.vendorData.get('61400')!.get('hardwareconcepts')).toMatchObject({ actual: 0, prior_actual: 0, transaction_count: 0, months: { '2026-06': 101 } })
    expect([...crawl.tenantMonthActuals.get(TENANT)!.keys()]).toEqual(['kimandreaambrocio'])
    expect(crawl.tenantMonthActuals.get(TENANT)!.get('kimandreaambrocio')!.amount).toBe(1200)
  })

  it('knows the prior month across a year end', () => {
    expect(priorMonthKeyOf('2026-08')).toBe('2026-07')
    expect(priorMonthKeyOf('2027-01')).toBe('2026-12')
  })
})

describe('assembleSubscriptionDetail', () => {
  it('backfills budget-only vendors, takes the account total from the P&L, and classifies leakage', async () => {
    const crawl = newSubscriptionCrawl(['63700'])
    crawl.accountNames.set('63700', 'IT Costs Software')
    addSubscriptionLine(crawl, { accountCode: '63700', vendorName: 'Shopify', amount: 4260.66, isCurrent: true, tenantId: TENANT })
    const db = fakeSupabase({
      subscription_budgets: [
        { business_id: BUSINESS, is_active: true, vendor_name: 'Shopify', vendor_key: 'shopify', monthly_budget: 4500, account_codes: ['63700'], frequency: 'monthly', renewal_month: null, category: null },
        { business_id: BUSINESS, is_active: true, vendor_name: 'Loom', vendor_key: 'loom', monthly_budget: 20, account_codes: ['63700'], frequency: 'monthly', renewal_month: null, category: null },
      ],
      xero_pl_lines_wide_compat: [{ business_id: PROFILE, account_name: 'IT Costs Software', monthly_values: { '2026-08': 14726.4, '2026-07': 13764 } }],
      monthly_report_settings: [{ business_id: BUSINESS, budget_forecast_id: null, subscription_account_codes: ['63700', '63706'] }],
      financial_forecasts: [],
    })
    const { data, configuredSubscriptionCodes } = await assembleSubscriptionDetail(db, { business_id: BUSINESS, report_month: '2026-08', account_codes: ['63700'] }, crawl)
    expect(configuredSubscriptionCodes).toEqual(['63700', '63706'])
    const account = data.accounts[0]
    expect(account.vendors.map((v) => [v.vendor_name, v.actual, v.budget])).toEqual([['Loom', 0, 20], ['Shopify', 4260.66, 4500]])
    // A crawl without statement amounts offers none to a page that asks for net.
    expect(account.vendors.map((v) => v.statement)).toEqual([undefined, undefined])
    // The P&L is authoritative for the subtotal, not the vendor sum.
    expect(account.total_actual).toBe(14726.4)
    expect(account.total_prior_month).toBe(13764)
    expect(data.grand_total.actual).toBe(14726.4)
    expect(data.leakage).toBeDefined()
  })

  describe('over a window (the Contractors Payment Summary)', () => {
    const contractorDb = () => fakeSupabase({
      subscription_budgets: [
        { business_id: BUSINESS, is_active: true, vendor_name: 'Kim Andrea Ambrocio', vendor_key: 'kimandreaambrocio', monthly_budget: 1320, account_codes: ['61400'], frequency: 'monthly', renewal_month: null, category: null },
        { business_id: BUSINESS, is_active: true, vendor_name: 'Honeybee Dionio', vendor_key: 'honeybeedionio', monthly_budget: 2310, account_codes: ['61400'], frequency: 'monthly', renewal_month: null, category: 'Operations' },
      ],
      xero_pl_lines_wide_compat: [{ business_id: PROFILE, tenant_id: TENANT, account_name: 'Contractors excl. Artists', monthly_values: { '2026-06': 23173.42, '2026-07': 29910.6, '2026-08': 31029.3 } }],
      monthly_report_settings: [{ business_id: BUSINESS, budget_forecast_id: null, subscription_account_codes: ['63700', '63706'], budget_source: 'budget_version' }],
      business_profiles: [{ id: PROFILE, fiscal_year_start: 7 }],
      financial_forecasts: [],
      // Prod: one locked version, FY2027, effective July 2026. None for FY2026.
      budget_versions: [{ id: '72c658c0', business_id: BUSINESS, fiscal_year: 2027, label: 'Overall Budget (Xero, rev 12 Aug 2026)', effective_from: '2026-07', version_number: 1, tenant_id: TENANT, locked_at: '2026-09-10T00:00:00Z' }],
      budget_lines: [
        { id: 'b1', budget_version_id: '72c658c0', account_code: '61400', account_name: 'Contractors excl. Artists', category: 'Operating Expenses', month: '2026-07', amount: '28007' },
        { id: 'b2', budget_version_id: '72c658c0', account_code: '61400', account_name: 'Contractors excl. Artists', category: 'Operating Expenses', month: '2026-08', amount: '28375' },
      ],
    })
    const contractorCrawl = () => {
      const crawl = newSubscriptionCrawl(['61400'])
      crawl.accountNames.set('61400', 'Contractors excl. Artists')
      crawl.statementAmounts = true
      addSubscriptionLine(crawl, { accountCode: '61400', vendorName: 'Honeybee Dionio', amount: 2625, statementAmount: 2625, isCurrent: true, tenantId: TENANT, month: '2026-08' })
      addSubscriptionLine(crawl, { accountCode: '61400', vendorName: 'Honeybee Dionio', amount: 2048, statementAmount: 2048, isCurrent: false, tenantId: TENANT, month: '2026-07' })
      addSubscriptionLine(crawl, { accountCode: '61400', vendorName: 'Honeybee Dionio', amount: 2100, statementAmount: 2100, isCurrent: false, tenantId: TENANT, month: '2026-06', windowOnly: true })
      return crawl
    }

    it('gives each account the ledger and the approved budget month by month, and June no budget, with why', async () => {
      const { data } = await assembleSubscriptionDetail(
        contractorDb(),
        { business_id: BUSINESS, report_month: '2026-08', account_codes: ['61400'], window_months: ['2026-06', '2026-07', '2026-08'] },
        contractorCrawl(),
      )
      const account = data.accounts[0]
      expect(account.window).toEqual({
        months: ['2026-06', '2026-07', '2026-08'],
        actual: { '2026-06': 23173.42, '2026-07': 29910.6, '2026-08': 31029.3 },
        actual_source: 'ledger',
        budget: { '2026-06': null, '2026-07': 28007, '2026-08': 28375 },
        budget_absent: { '2026-06': 'no approved budget version is locked for FY2026' },
      })
      expect(account.total_budget).toBe(28375)
      const honeybee = account.vendors.find((v) => v.vendor_key === 'honeybeedionio')!
      expect(honeybee.months).toEqual({ '2026-06': 2100, '2026-07': 2048, '2026-08': 2625 })
      expect(honeybee.statement?.months).toEqual({ '2026-06': 2100, '2026-07': 2048, '2026-08': 2625 })
      // A budget-only contractor has every month, at nothing.
      expect(account.vendors.find((v) => v.vendor_key === 'kimandreaambrocio')!.months).toEqual({ '2026-06': 0, '2026-07': 0, '2026-08': 0 })
    })

    it('adds nothing to an answer nobody asked a window of', async () => {
      const { data } = await assembleSubscriptionDetail(contractorDb(), { business_id: BUSINESS, report_month: '2026-08', account_codes: ['61400'] }, contractorCrawl())
      const account = data.accounts[0]
      expect(account.window).toBeUndefined()
      expect(account.vendors.every((v) => !('months' in v) && !('months' in (v.statement ?? {})))).toBe(true)
    })
  })

  it('has one empty answer for no codes and no connection', () => {
    expect(emptySubscriptionDetail('2026-08')).toEqual({ accounts: [], grand_total: { prior_month: 0, actual: 0, budget: 0, variance: 0 }, report_month: '2026-08' })
  })
})

describe('crawlFromPersistedVendorActuals', () => {
  const accountNames = new Map([['63700', 'IT Costs Software'], ['63706', 'IT Costs Software Migration']])

  it('keeps only each tenant-month\'s newest write batch, and says what it dropped', () => {
    const { crawl, notes } = crawlFromPersistedVendorActuals({
      accountCodes: ['63700', '63706'],
      reportMonth: '2026-08',
      accountNames,
      rows: [row('shopify', 'Shopify', 4260.66), row('avocadoblvd', 'Avocado Blvd', 6500, '2026-08', 'report', '2026-09-11T07:22:48.979Z')],
      budgets: [{ vendor_key: 'shopify', account_codes: ['63700'] }],
    })
    expect([...crawl.vendorData.get('63700')!.keys()]).toEqual(['shopify'])
    expect(notes.excluded_stale).toEqual([{ month: '2026-08', vendor_name: 'Avocado Blvd', amount: 6500, updated_at: '2026-09-11T07:22:48.979Z' }])
    expect(notes.unassigned).toEqual([])
  })

  it('places a vendor on the account its budget names, and an unbudgeted one on the first code — flagged', () => {
    const { crawl, notes } = crawlFromPersistedVendorActuals({
      accountCodes: ['63700', '63706'],
      reportMonth: '2026-08',
      accountNames,
      rows: [row('migrationtool', 'Migration Tool', 300), row('newthing', 'New Thing', 45)],
      budgets: [{ vendor_key: 'migrationtool', account_codes: ['64000', '63706'] }],
    })
    expect(crawl.vendorData.get('63706')!.get('migrationtool')).toMatchObject({ actual: 300, transaction_count: 1 })
    expect(crawl.vendorData.get('63700')!.get('newthing')).toMatchObject({ actual: 45 })
    expect(notes.unassigned).toEqual([{ vendor_name: 'New Thing', amount: 45, placed_on: '63700' }])
  })

  it('prefers the report\'s own rows for a month, and falls back to the wizard\'s for the prior month', () => {
    const { crawl, notes } = crawlFromPersistedVendorActuals({
      accountCodes: ['63700'],
      reportMonth: '2026-08',
      accountNames,
      rows: [
        row('shopify', 'Shopify', 4260.66),
        row('shopify', 'Shopify', 9999, '2026-08', 'analyze'),
        row('shopify', 'Shopify', 4212.4, '2026-07', 'analyze', '2026-08-20T00:00:00Z'),
      ],
      budgets: [],
    })
    expect(notes.current_source).toBe('report')
    expect(notes.prior_source).toBe('analyze')
    expect(crawl.vendorData.get('63700')!.get('shopify')).toMatchObject({ actual: 4260.66, prior_actual: 4212.4 })
  })

  it('reads the persisted rows, budgets and account names for the active tenants only', async () => {
    const db = fakeSupabase({
      subscription_vendor_actuals: [
        { business_id: BUSINESS, ...row('shopify', 'Shopify', 4260.66) },
        { business_id: BUSINESS, ...row('shopify', 'Shopify', 1, '2026-08', 'report'), tenant_id: 'retired-tenant' },
      ],
      subscription_budgets: [{ business_id: BUSINESS, vendor_key: 'shopify', account_codes: ['63700'], is_active: true }],
      xero_accounts: [{ business_id: BUSINESS, tenant_id: TENANT, account_code: '63700', account_name: 'IT Costs Software' }],
    })
    const { crawl } = await loadPersistedSubscriptionCrawl(db, { business_id: BUSINESS, report_month: '2026-08', account_codes: ['63700'] })
    expect(crawl.accountNames.get('63700')).toBe('IT Costs Software')
    expect(crawl.vendorData.get('63700')!.get('shopify')!.actual).toBe(4260.66)
  })
})
