/**
 * loadLedgerAccounts — the account list for the ratio settings panel — reads
 * the ledger exactly as loadAccountActuals does: both id-spaces, the same
 * refusal. Urban Road's ledger lives under its business_profiles.id and its
 * mappings under its businesses.id; a list read from one space would be empty
 * or ungrouped.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const BUSINESS = '28d41193-38ae-4071-a2b1-0dbea90a38fd'
const PROFILE = 'aabd3c49-4dc8-4aa6-a9a6-75f62ab89ff5'
const TENANT = '8519c134'

const { resolveIdsMock, resolveConnectionsMock } = vi.hoisted(() => ({
  resolveIdsMock: vi.fn(),
  resolveConnectionsMock: vi.fn(),
}))
vi.mock('@/lib/business/resolveBusinessProfileIds', () => ({ resolveBusinessProfileIds: resolveIdsMock }))
vi.mock('@/lib/business/resolveXeroBusinessId', () => ({ resolveXeroConnections: resolveConnectionsMock }))

import { loadAccountActuals, loadLedgerAccounts } from '../account-actuals-load'

type Tables = Record<string, Record<string, unknown>[]>

function fakeSupabase(tables: Tables) {
  const calls: { table: string; column: string; values: string[] }[] = []
  return {
    calls,
    from(table: string) {
      return {
        select() {
          return {
            in(column: string, values: string[]) {
              calls.push({ table, column, values })
              const data = (tables[table] ?? []).filter((r) => values.includes(String(r[column])))
              return Promise.resolve({ data, error: null })
            },
          }
        },
      }
    },
  }
}

const ledgerRow = (code: string | null, name: string, type: string) => ({
  business_id: PROFILE, tenant_id: TENANT, account_code: code, account_name: name, account_type: type,
  monthly_values: { '2026-08': 1 }, updated_at: '2026-09-13T22:00:00Z',
})

function urbanRoadTables(): Tables {
  return {
    xero_pl_lines_wide_compat: [
      ledgerRow('55000', 'Freight to Customer', 'cogs'),
      ledgerRow('41700', 'Posters (41700)', 'revenue'),
      ledgerRow(null, 'Foreign Currency Gains and Losses', 'opex'),
    ],
    xero_connections: [{ tenant_id: TENANT, functional_currency: 'AUD' }],
    account_mappings: [
      // The profile-space row says Revenue; the businesses.id row — the one the
      // statement reads — says Other Income, and must win.
      { business_id: PROFILE, xero_account_name: 'Posters (41700)', report_category: 'Revenue' },
      { business_id: BUSINESS, xero_account_name: 'Posters (41700)', report_category: 'Other Income' },
    ],
  }
}

beforeEach(() => {
  resolveIdsMock.mockReset()
  resolveConnectionsMock.mockReset()
  resolveIdsMock.mockResolvedValue({ businessId: BUSINESS, profileId: PROFILE, all: [PROFILE, BUSINESS] })
  resolveConnectionsMock.mockResolvedValue({ connectionBusinessId: BUSINESS, connections: [{ tenant_id: TENANT, functional_currency: 'AUD' }] })
})

describe('loadLedgerAccounts', () => {
  it('reads the ledger and mappings in BOTH id-spaces, and the statement’s mapping wins', async () => {
    const sb = fakeSupabase(urbanRoadTables())
    const result = await loadLedgerAccounts(sb, BUSINESS)
    expect(sb.calls.find((c) => c.table === 'xero_pl_lines_wide_compat')?.values).toEqual([PROFILE, BUSINESS])
    expect(sb.calls.find((c) => c.table === 'account_mappings')?.values).toEqual([PROFILE, BUSINESS])
    expect(result).toEqual({
      data: {
        accounts: [
          { code: '41700', name: 'Posters (41700)', bucket: null },
          { code: '55000', name: 'Freight to Customer', bucket: 'cost_of_sales' },
        ],
        codeless_count: 1,
      },
    })
  })

  it('refuses a multi-org business with the same sentence the page prints', async () => {
    resolveConnectionsMock.mockResolvedValue({
      connectionBusinessId: BUSINESS,
      connections: [{ tenant_id: TENANT, functional_currency: 'AUD' }, { tenant_id: 't2', functional_currency: 'AUD' }],
    })
    const listed = await loadLedgerAccounts(fakeSupabase(urbanRoadTables()), BUSINESS)
    const figures = await loadAccountActuals(fakeSupabase(urbanRoadTables()), BUSINESS, '2026-08', 3, ['55000'])
    expect(listed).toHaveProperty('unavailable_reason')
    expect(listed).toEqual(figures)
  })
})
