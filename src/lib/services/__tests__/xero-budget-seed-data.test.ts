/**
 * DB loaders for the Xero budget seed — mapping, merging, and reading every row.
 *
 * Runs against a PostgREST fake that cuts each response to Max rows and answers
 * in storage order, so "every account" is checked the way hosted Supabase
 * actually answers rather than against an array that always comes back whole.
 */
import { describe, it, expect } from 'vitest'
import { loadAccountsCatalog, loadAccountActuals } from '@/lib/services/xero-budget-seed-data'
import { FakePostgrest, uuidAt, type FakeRow } from '@/__tests__/helpers/postgrest-fake'

const TENANT = 'tenant-1'

const account = (i: number, extra: FakeRow = {}): FakeRow => ({
  id: uuidAt(i),
  business_id: 'biz-1',
  tenant_id: TENANT,
  xero_account_id: `acc-${i}`,
  account_code: String(1000 + i),
  account_name: `Account ${i}`,
  xero_type: 'EXPENSE',
  xero_status: 'ACTIVE',
  ...extra,
})

const plRow = (i: number, extra: FakeRow = {}): FakeRow => ({
  id: uuidAt(i),
  business_id: 'profile-1',
  tenant_id: TENANT,
  account_id: 'acc-guid',
  account_code: '400',
  account_name: 'Advertising',
  account_type: 'opex',
  section: 'Operating Expenses',
  period_month: '2025-07-01',
  amount: 100,
  basis: 'accruals',
  deleted_at: null,
  ...extra,
})

/** Months from Jan 2025, `count` of them, as period_month dates. */
const monthsFrom2025 = (count: number) =>
  Array.from({ length: count }, (_, i) => `${2025 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-01`)

describe('loadAccountsCatalog', () => {
  it("maps the tenant's xero_accounts rows", async () => {
    const db = new FakePostgrest()
    db.table('xero_accounts', [
      account(1, { xero_account_id: 'id-1', account_code: 200, account_name: 'Sales', xero_type: 'REVENUE' }),
      account(2, { xero_account_id: 'id-2', account_code: null, account_name: 'No code', xero_type: null, xero_status: null }),
      account(3, { tenant_id: 'another-org' }),
    ])
    const out = await loadAccountsCatalog(db, TENANT)
    expect(out).toEqual([
      { accountId: 'id-1', accountCode: '200', accountName: 'Sales', xeroType: 'REVENUE', status: 'ACTIVE' },
      { accountId: 'id-2', accountCode: null, accountName: 'No code', xeroType: null, status: null },
    ])
    expect(db.requestsTo('xero_accounts')[0].filters).toEqual([`tenant_id=eq.${TENANT}`])
  })

  it('throws on a read error instead of returning an empty catalog', async () => {
    const db = new FakePostgrest()
    db.table('xero_accounts', [account(1)], { failOnRequest: [0] })
    await expect(loadAccountsCatalog(db, TENANT)).rejects.toThrow(/xero_accounts read did not finish \(query_error\)/)
  })

  it('pages by id, so accounts tied on a code are neither repeated nor skipped', async () => {
    // 2,345 rows sharing 3 codes: pages ordered on the code would split each tie
    // arbitrarily across page boundaries.
    const db = new FakePostgrest()
    db.table('xero_accounts', Array.from({ length: 2345 }, (_, i) => account(i, { account_code: String(i % 3) })))
    const out = await loadAccountsCatalog(db, TENANT)
    expect(new Set(out.map((a) => a.accountId)).size).toBe(2345)
    expect(db.requestsTo('xero_accounts').map((p) => p.order)).toEqual(
      Array(4).fill([{ column: 'id', ascending: true }]),
    )
  })

  it('a Max rows cap below the page size: a short page is not the end of the chart', async () => {
    // Urban Road's chart is 298 accounts. Stopping on the first short page
    // would keep 100 of them.
    const db = new FakePostgrest()
    db.table('xero_accounts', Array.from({ length: 298 }, (_, i) => account(i)), { maxRows: 100 })
    const out = await loadAccountsCatalog(db, TENANT)
    expect(out).toHaveLength(298)
    expect(db.requestsTo('xero_accounts').map((p) => p.rowsReturned)).toEqual([100, 100, 98, 0])
  })

  it('exactly 1,000 accounts: the full page is followed by the empty page that ends the read', async () => {
    const db = new FakePostgrest()
    db.table('xero_accounts', Array.from({ length: 1000 }, (_, i) => account(i)))
    expect(await loadAccountsCatalog(db, TENANT)).toHaveLength(1000)
    expect(db.requestsTo('xero_accounts').map((p) => p.rowsReturned)).toEqual([1000, 0])
  })

  it('a failed later page throws — a catalog missing accounts would seed them unclassified', async () => {
    const db = new FakePostgrest()
    db.table('xero_accounts', Array.from({ length: 1200 }, (_, i) => account(i)), { failOnRequest: [1] })
    await expect(loadAccountsCatalog(db, TENANT)).rejects.toThrow(/xero_accounts read did not finish/)
  })
})

describe('loadAccountActuals', () => {
  it('sums every accruals row for a code per month — not the cash twin, not a soft-deleted row', async () => {
    const db = new FakePostgrest()
    db.table('xero_pl_lines', [
      plRow(1, { amount: 100 }),
      // Same code, second Xero account (another section): the view emitted it as
      // a separate row and the loader summed the two.
      plRow(2, { account_id: 'acc-guid-2', section: 'Other', amount: 25 }),
      plRow(3, { period_month: '2025-08-01', amount: '50' }),
      plRow(4, { period_month: '2025-09-01', amount: 'x' }),
      plRow(5, { basis: 'cash', amount: 100 }),
      plRow(6, { deleted_at: '2026-09-01T00:00:00Z', amount: 100 }),
      plRow(7, { account_code: null, account_name: 'Total' }),
      plRow(8, { tenant_id: 'another-org', amount: 100 }),
    ])
    const out = await loadAccountActuals(db, TENANT)
    expect(out).toEqual([
      { accountCode: '400', accountName: 'Advertising', accountType: 'opex', monthly: { '2025-07': 125, '2025-08': 50 } },
    ])
    expect(db.requestsTo('xero_pl_lines')[0].filters).toEqual([
      `tenant_id=eq.${TENANT}`,
      'basis=eq.accruals',
      'deleted_at=is.null',
    ])
  })

  it("names an account renamed in Xero by its latest month, whatever order its rows arrive in", async () => {
    const db = new FakePostgrest()
    db.table('xero_pl_lines', [
      plRow(1, { period_month: '2026-08-01', account_name: 'Marketing' }),
      plRow(2, { period_month: '2025-07-01', account_name: 'Advertising' }),
    ])
    const [only] = await loadAccountActuals(db, TENANT)
    expect(only.accountName).toBe('Marketing')
    expect(only.monthly).toEqual({ '2025-07': 100, '2026-08': 100 })
  })

  it('JDS-sized (1,764 rows): the newest months live past the first 1,000 rows and still count', async () => {
    // 84 accounts × 21 months, stored oldest month first. The first 1,000 rows
    // stop part-way through Dec 2025 — everything from Jan 2026 is past the cap.
    const months = monthsFrom2025(21)
    const rows: FakeRow[] = []
    months.forEach((month, m) => {
      for (let a = 0; a < 84; a++) {
        rows.push(plRow(rows.length, { account_code: String(40000 + a), account_id: `acc-${a}`, period_month: month, amount: m + 1 }))
      }
    })
    expect(rows).toHaveLength(1764)
    const db = new FakePostgrest()
    db.table('xero_pl_lines', rows)

    const out = await loadAccountActuals(db, TENANT)
    expect(out).toHaveLength(84)
    for (const acct of out) {
      expect(Object.keys(acct.monthly)).toHaveLength(21)
      expect(acct.monthly['2026-09']).toBe(21)
    }
    expect(db.requestsTo('xero_pl_lines').map((p) => p.rowsReturned)).toEqual([1000, 764, 0])
  })

  it('a Max rows cap below the page size: a short page is not the end of the actuals', async () => {
    const db = new FakePostgrest()
    db.table('xero_pl_lines', monthsFrom2025(15).map((month, i) => plRow(i, { period_month: month })), { maxRows: 4 })
    const [only] = await loadAccountActuals(db, TENANT)
    expect(Object.keys(only.monthly)).toHaveLength(15)
    expect(db.requestsTo('xero_pl_lines').map((p) => p.rowsReturned)).toEqual([4, 4, 4, 3, 0])
  })

  it('exactly 1,000 rows: the full page is followed by the empty page that ends the read', async () => {
    const months = monthsFrom2025(10)
    const rows = Array.from({ length: 1000 }, (_, i) =>
      plRow(i, { account_code: String(40000 + Math.floor(i / 10)), account_id: `acc-${Math.floor(i / 10)}`, period_month: months[i % 10] }))
    const db = new FakePostgrest()
    db.table('xero_pl_lines', rows)
    expect(await loadAccountActuals(db, TENANT)).toHaveLength(100)
    expect(db.requestsTo('xero_pl_lines').map((p) => p.rowsReturned)).toEqual([1000, 0])
  })

  it('a failed later page throws instead of seeding from part of the P&L', async () => {
    const db = new FakePostgrest()
    db.table('xero_pl_lines', Array.from({ length: 1500 }, (_, i) => plRow(i, { account_id: `acc-${i}` })), { failOnRequest: [1] })
    await expect(loadAccountActuals(db, TENANT)).rejects.toThrow(/xero_pl_lines read did not finish \(query_error\)/)
  })
})
