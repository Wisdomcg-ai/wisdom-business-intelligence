/** DB loaders for the Xero budget seed — mapping, merging, and error surfacing. */
import { describe, it, expect, vi } from 'vitest'
import { loadAccountsCatalog, loadAccountActuals } from '@/lib/services/xero-budget-seed-data'

function supabaseReturning(rows: unknown, error: { message: string } | null = null) {
  const eq = vi.fn(() => Promise.resolve({ data: rows, error }))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select }))
  return { client: { from }, from, select, eq }
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
