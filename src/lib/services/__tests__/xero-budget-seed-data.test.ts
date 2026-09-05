/** DB loaders for the Xero budget seed — mapping, merging, and error surfacing. */
import { describe, it, expect, vi } from 'vitest'
import { loadAccountsCatalog, loadAccountActuals } from '@/lib/services/xero-budget-seed-data'

/** Chainable mock: from().select().eq().order().range(from, to) → one page of `rows`. */
function supabaseReturning(rows: unknown, error: { message: string } | null = null) {
  const all = Array.isArray(rows) ? rows : rows
  const range = vi.fn((from: number, to: number) =>
    Promise.resolve({ data: Array.isArray(all) ? all.slice(from, to + 1) : all, error }))
  const order = vi.fn(() => ({ range }))
  const eq = vi.fn(() => ({ order }))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select }))
  return { client: { from }, from, select, eq, order, range }
}

describe('loadAccountsCatalog', () => {
  it('maps xero_accounts rows and filters by tenant_id', async () => {
    const sb = supabaseReturning([
      { xero_account_id: 'id-1', account_code: 200, account_name: 'Sales', xero_type: 'REVENUE', xero_status: 'ACTIVE' },
      { xero_account_id: 'id-2', account_code: null, account_name: 'No code', xero_type: null, xero_status: null },
    ])
    const out = await loadAccountsCatalog(sb.client, 'tenant-1')
    expect(sb.from).toHaveBeenCalledWith('xero_accounts')
    expect(sb.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1')
    expect(out).toEqual([
      { accountId: 'id-1', accountCode: '200', accountName: 'Sales', xeroType: 'REVENUE', status: 'ACTIVE' },
      { accountId: 'id-2', accountCode: null, accountName: 'No code', xeroType: null, status: null },
    ])
  })
  it('throws on a read error instead of returning an empty catalog', async () => {
    const sb = supabaseReturning(null, { message: 'boom' })
    await expect(loadAccountsCatalog(sb.client, 't')).rejects.toThrow(/xero_accounts read failed: boom/)
  })
  it('reads in ordered pages so a PostgREST row cap cannot silently drop accounts', async () => {
    const rows = Array.from({ length: 2345 }, (_, i) => ({
      xero_account_id: `id-${i}`, account_code: String(1000 + i), account_name: `A${i}`, xero_type: 'EXPENSE', xero_status: 'ACTIVE',
    }))
    const sb = supabaseReturning(rows)
    const out = await loadAccountsCatalog(sb.client, 'tenant-1')
    expect(out).toHaveLength(2345)
    expect(sb.order).toHaveBeenCalledWith('account_code', { ascending: true })
    expect(sb.range.mock.calls.map((c) => c.slice(0, 2))).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
  })
})

describe('loadAccountActuals', () => {
  it('merges rows sharing an account code and coerces monthly values to numbers', async () => {
    const sb = supabaseReturning([
      { account_code: '400', account_name: 'Advertising', account_type: 'opex', monthly_values: { '2025-07': 100, '2025-08': '50' } },
      { account_code: '400', account_name: 'Advertising (old section)', account_type: 'opex', monthly_values: { '2025-07': 25, '2025-09': 'x' } },
      { account_code: null, account_name: 'Total', account_type: null, monthly_values: {} },
    ])
    const out = await loadAccountActuals(sb.client, 'tenant-1')
    expect(sb.from).toHaveBeenCalledWith('xero_pl_lines_wide_compat')
    expect(out).toEqual([
      { accountCode: '400', accountName: 'Advertising', accountType: 'opex', monthly: { '2025-07': 125, '2025-08': 50 } },
    ])
  })
  it('throws on a read error', async () => {
    const sb = supabaseReturning(null, { message: 'nope' })
    await expect(loadAccountActuals(sb.client, 't')).rejects.toThrow(/xero_pl_lines_wide_compat read failed/)
  })
})
