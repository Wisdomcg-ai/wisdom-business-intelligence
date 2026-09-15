/**
 * The cover's reconciliation count, from the CFO board's captured badge (DD-14).
 *
 * Distinct Directions' capture is the recon round's of 14 Sep 2026 23:59 UTC,
 * as stored: 20 items across four accounts, every one dated September, and
 * seven accounts at 0 with no month split. For August that is the board's
 * READY — and Calxa's cover sentence, "no items remain unreconciled".
 */
import { describe, it, expect } from 'vitest'
import { summariseDashboardCaptures, deriveReadiness, type CaptureRow } from '@/lib/cfo/dashboard-capture'
import {
  expectedCaptureTenants,
  layoutWantsBadgeReconciliation,
  loadPackReconciliation,
  packReconciliationFromReadiness,
} from '../pack-reconciliation'
import { fakeSupabase, type FakeTables } from './fake-supabase'

const DD_BIZ = 'c6c741db-6c09-45be-974c-5e6ca2cadf84'
const DD_PROFILE = 'dd000000-0000-4000-8000-00000000c0de'
const DD_TENANT = '8f5eb73d-520f-4c05-9814-fde95f4792cd'

const DD_ACCOUNTS = [
  { name: 'ANZ General Transactions *7976', count: 16, months: { '2026-09': 16 } },
  { name: 'AWX_DISTINCT DIRECTIONS PT_AUD', count: 2, months: { '2026-09': 2 } },
  { name: 'ANZ GST Taxes *8397', count: 1, months: { '2026-09': 1 } },
  { name: 'ANZ Profit *3638', count: 1, months: { '2026-09': 1 } },
  { name: 'OFFSET SAVINGS', count: 0 },
  { name: 'General Business', count: 0 },
  { name: 'ANZ Hard Savings *8979', count: 0 },
  { name: 'ANZ Soft Savings*8034', count: 0 },
  { name: 'Petty Cash', count: 0 },
  { name: 'Cash Draw', count: 0 },
  { name: 'Shares Trading Account *6164', count: 0 },
]

const capture = (over: Partial<CaptureRow> = {}): CaptureRow => ({
  tenant_id: DD_TENANT,
  business_id: DD_BIZ,
  captured_at: '2026-09-14T23:59:55.688Z',
  total_count: 20,
  accounts: DD_ACCOUNTS,
  method: 'chrome_routine',
  ...over,
})

const NOW = '2026-09-16T01:00:00.000Z'

/** The board's own chain, then the cover's reading of it. */
const verdict = (rows: CaptureRow[], tenants: string[], ignored: string[] = [], month = '2026-08', now = NOW) =>
  packReconciliationFromReadiness(deriveReadiness(summariseDashboardCaptures(rows, tenants), ignored, month, now), month)

describe('packReconciliationFromReadiness — what the cover may count', () => {
  it("Distinct Directions, August: every item is September's, so none remain for the report", () => {
    expect(verdict([capture()], [DD_TENANT])).toEqual({ status: 'counted', count: 0, captured_at: '2026-09-14T23:59:55.688Z' })
  })

  it("the same capture judged for September counts September's 20 items", () => {
    const sept = verdict([capture({ captured_at: '2026-10-02T00:00:00.000Z' })], [DD_TENANT], [], '2026-09', '2026-10-03T00:00:00.000Z')
    expect(sept).toMatchObject({ status: 'counted', count: 20 })
  })

  it("counts the board's number: in or before the month, plus lines on an account with no month split", () => {
    const rows = [capture({
      total_count: 11,
      accounts: [
        { name: 'ANZ General Transactions *7976', count: 5, months: { '2026-07': 2, '2026-08': 1, '2026-09': 2 } },
        { name: 'AWX_DISTINCT DIRECTIONS PT_AUD', count: 4 },
        { name: 'Paypal Account - DO NOT USE', count: 2, months: { '2026-06': 2 } },
      ],
    })]
    // 2 July + 1 August + 4 unsplit (they could be August's); September's 2 are not the report's.
    expect(verdict(rows, [DD_TENANT])).toMatchObject({ status: 'counted', count: 9 })
    // An ignored dead feed is the board's to leave out, and the cover's.
    expect(verdict(rows, [DD_TENANT], ['Paypal Account - DO NOT USE'])).toMatchObject({ status: 'counted', count: 7 })
  })

  it('a badge total with no account breakdown counts in full — it could all be the month', () => {
    expect(verdict([capture({ total_count: 3, accounts: [] })], [DD_TENANT])).toMatchObject({ status: 'counted', count: 3 })
  })

  it('never captured is uncounted, never a zero', () => {
    expect(verdict([], [DD_TENANT])).toEqual({ status: 'uncounted', reason: "the recon round has not captured this business's Xero badges" })
  })

  it('a capture older than the board trusts is uncounted', () => {
    const old = verdict([capture()], [DD_TENANT], [], '2026-08', '2026-09-24T01:00:00.000Z')
    expect(old.status).toBe('uncounted')
    expect(old.status === 'uncounted' && old.reason).toBe('the latest Xero badge capture is 9 days old')
  })

  it('a multi-org business with an org never captured is uncounted — clean or not, its backlog is unknown', () => {
    const tenants = ['t-dragon', 't-easyhail']
    const clean = verdict([capture({ tenant_id: 't-dragon', total_count: 0, accounts: [] })], tenants)
    expect(clean).toEqual({ status: 'uncounted', reason: 'not every Xero organisation of this business has a badge capture' })
    const blocked = verdict([capture({ tenant_id: 't-dragon', total_count: 4, accounts: [{ name: 'Westpac', count: 4, months: { '2026-08': 4 } }] })], tenants)
    expect(blocked.status).toBe('uncounted')
    // Both captured: the counts add.
    const both = verdict([
      capture({ tenant_id: 't-dragon', total_count: 4, accounts: [{ name: 'Westpac', count: 4, months: { '2026-08': 4 } }] }),
      capture({ tenant_id: 't-easyhail', total_count: 1, accounts: [{ name: 'NAB', count: 1, months: { '2026-07': 1 } }] }),
    ], tenants)
    expect(both).toMatchObject({ status: 'counted', count: 5 })
  })

  it('a capture taken before the month ended in Sydney cannot vouch for it', () => {
    // 31 Aug 20:00 in Sydney: lines dated that evening had not reached the feed.
    const early = verdict([capture({ captured_at: '2026-08-31T10:00:00.000Z', total_count: 0, accounts: [] })], [DD_TENANT], [], '2026-08', '2026-09-02T00:00:00.000Z')
    expect(early).toEqual({ status: 'uncounted', reason: 'the latest Xero badge capture was taken before August 2026 ended' })
    // 1 Sep 00:30 in Sydney is 31 Aug 14:30 UTC — after the month, where it matters.
    const justAfter = verdict([capture({ captured_at: '2026-08-31T14:30:00.000Z', total_count: 0, accounts: [] })], [DD_TENANT], [], '2026-08', '2026-09-02T00:00:00.000Z')
    expect(justAfter).toMatchObject({ status: 'counted', count: 0 })
  })
})

describe('expectedCaptureTenants — the orgs the board expects a capture for', () => {
  it('the active connections, once each; a dead one expects nothing', () => {
    expect(expectedCaptureTenants([
      { tenant_id: 't1', is_active: true },
      { tenant_id: 't1', is_active: true },
      { tenant_id: 't2', is_active: false },
      { tenant_id: 't3', is_active: true },
    ], 'manual-key')).toEqual(['t1', 't3'])
  })

  it('a badge-only business (no connection rows at all) expects its manual key, or nothing', () => {
    expect(expectedCaptureTenants([], ' manual-149bf0a1 ')).toEqual(['manual-149bf0a1'])
    expect(expectedCaptureTenants([], null)).toEqual([])
    expect(expectedCaptureTenants([], '  ')).toEqual([])
  })
})

describe('layoutWantsBadgeReconciliation', () => {
  it('only a cover placement that asks for the badge', () => {
    expect(layoutWantsBadgeReconciliation([])).toBe(false)
    expect(layoutWantsBadgeReconciliation([{ type: 'cover_page' }, { type: 'cover_page', config: { reconciliation_line: 'standard' } }])).toBe(false)
    expect(layoutWantsBadgeReconciliation([{ type: 'memo', config: { reconciliation_line: 'xero_badge' } }])).toBe(false)
    expect(layoutWantsBadgeReconciliation([{ type: 'cover_page', config: { reconciliation_line: 'xero_badge' } }])).toBe(true)
  })
})

describe('loadPackReconciliation', () => {
  const tables = (over: Record<string, unknown> = {}): FakeTables => ({
    business_profiles: [{ id: DD_PROFILE, business_id: DD_BIZ }],
    xero_connections: [
      { business_id: DD_PROFILE, tenant_id: DD_TENANT, is_active: true },
    ],
    monthly_report_settings: [{ business_id: DD_BIZ, recon_ignored_accounts: [], manual_tenant_key: 'manual-149bf0a1' }],
    reconciliation_dashboard_captures: [
      // Pre-7-Sep history under the badge-only key, and an older capture under the tenant.
      capture({ tenant_id: 'manual-149bf0a1', captured_at: '2026-09-05T02:47:00.000Z', total_count: 5, accounts: [] }),
      capture({ captured_at: '2026-09-14T23:21:54.730Z', total_count: 36, accounts: [{ name: 'ANZ General Transactions *7976', count: 36, months: { '2026-08': 36 } }] }),
      capture(),
      // Another business's capture under the same tenant must never count.
      capture({ business_id: 'someone-else', captured_at: '2026-09-15T08:00:00.000Z', total_count: 9, accounts: [] }),
    ],
    ...over,
  }) as unknown as FakeTables

  it("reads DD's latest capture of its connected org, handed either id", async () => {
    for (const id of [DD_BIZ, DD_PROFILE]) {
      const sb = fakeSupabase(tables())
      expect(await loadPackReconciliation(sb, id, '2026-08', new Date(NOW)))
        .toEqual({ status: 'counted', count: 0, captured_at: '2026-09-14T23:59:55.688Z' })
      const read = sb.calls.find((c) => c.table === 'reconciliation_dashboard_captures')!
      expect(read.filters).toEqual(expect.arrayContaining([['eq', 'business_id', DD_BIZ], ['eq', 'tenant_id', DD_TENANT]]))
    }
  })

  it('the settings row decides what is ignored', async () => {
    const sb = fakeSupabase(tables({
      monthly_report_settings: [{ business_id: DD_BIZ, recon_ignored_accounts: ['ANZ General Transactions *7976'], manual_tenant_key: null }],
      reconciliation_dashboard_captures: [capture({ total_count: 3, accounts: [
        { name: 'ANZ General Transactions *7976', count: 2, months: { '2026-08': 2 } },
        { name: 'ANZ Profit *3638', count: 1, months: { '2026-08': 1 } },
      ] })],
    }))
    expect(await loadPackReconciliation(sb, DD_BIZ, '2026-08', new Date(NOW))).toMatchObject({ status: 'counted', count: 1 })
  })

  it('a badge-only business reads under its manual key', async () => {
    const sb = fakeSupabase(tables({
      xero_connections: [],
      reconciliation_dashboard_captures: [capture({ tenant_id: 'manual-149bf0a1', captured_at: '2026-09-10T00:00:00.000Z', total_count: 0, accounts: [] })],
    }))
    expect(await loadPackReconciliation(sb, DD_BIZ, '2026-08', new Date(NOW))).toMatchObject({ status: 'counted', count: 0 })
  })

  it('no organisation to match a capture to is uncounted', async () => {
    const sb = fakeSupabase(tables({ xero_connections: [{ business_id: DD_BIZ, tenant_id: DD_TENANT, is_active: false }] }))
    expect(await loadPackReconciliation(sb, DD_BIZ, '2026-08', new Date(NOW)))
      .toEqual({ status: 'uncounted', reason: 'this business has no active Xero organisation to match a badge capture to' })
  })

  it('a read that fails is uncounted and says the read failed', async () => {
    for (const table of ['xero_connections', 'monthly_report_settings', 'reconciliation_dashboard_captures']) {
      const sb = fakeSupabase(tables({ [table]: { error: { message: 'permission denied' } } }))
      const result = await loadPackReconciliation(sb, DD_BIZ, '2026-08', new Date(NOW))
      expect(result.status, table).toBe('uncounted')
      expect(result.status === 'uncounted' && result.readFailed, table).toBe(true)
    }
  })
})
