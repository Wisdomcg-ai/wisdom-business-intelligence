/**
 * sweepTenant integration seam — the honesty rules, pinned where they live:
 *
 *  - ANY account's statement report failing (fetch OR shape) abandons the
 *    whole statement-line pass: the result is the labelled fallback with the
 *    named reason recorded — never a partial statement-line total.
 *  - An unrecognised Accounts listing is an ERROR, never "no bank accounts →
 *    all clear".
 *  - Fallback truncation and double failures carry their caveats/reasons.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFetch = vi.fn()
vi.mock('@/lib/xero/xero-api-client', () => {
  class RateLimitDailyExceededError extends Error {
    constructor(tenantId: string, message = 'daily') {
      super(message)
      this.name = 'RateLimitDailyExceededError'
    }
  }
  return {
    RateLimitDailyExceededError,
    fetchXeroWithRateLimit: (...args: any[]) => mockFetch(...args),
  }
})
vi.mock('@/lib/xero/token-manager', () => ({
  getValidAccessToken: vi.fn(async () => ({ success: true, accessToken: 'tok' })),
}))

import { sweepTenant } from '../sweep'

const CONN = { id: 'conn-1', tenant_id: 't1' }
const NOW = new Date(Date.UTC(2026, 8, 16))

const accountsPayload = {
  ok: true, status: 200, headers: {},
  json: {
    Accounts: [
      { AccountID: 'acc-1', Name: 'ANZ Cheque', Status: 'ACTIVE', CurrencyCode: 'AUD' },
      { AccountID: 'acc-2', Name: 'Airwallex', Status: 'ACTIVE', CurrencyCode: 'HKD' },
    ],
  },
}

const cleanStatement = {
  ok: true, status: 200, headers: {},
  json: {
    Reports: [{
      Rows: [
        { RowType: 'Header', Cells: [{ Value: 'Date' }, { Value: 'Description' }, { Value: 'Reconciled' }, { Value: 'Amount' }] },
        { RowType: 'Section', Rows: [
          { RowType: 'Row', Cells: [{ Value: '2026-08-03' }, { Value: 'X' }, { Value: 'Yes' }, { Value: '10.00' }] },
        ] },
      ],
    }],
  },
}

const oneUnreconciledStatement = JSON.parse(JSON.stringify(cleanStatement))
oneUnreconciledStatement.json.Reports[0].Rows[1].Rows.push(
  { RowType: 'Row', Cells: [{ Value: '2026-08-05' }, { Value: 'FEE' }, { Value: 'No' }, { Value: '-42.10' }] },
)

const fallbackTxns = (n: number) => ({
  ok: true, status: 200, headers: {},
  json: {
    BankTransactions: Array.from({ length: n }, (_, i) => ({
      BankAccount: { AccountID: 'acc-1', Name: 'ANZ Cheque' },
      DateString: '2026-08-01T00:00:00',
      Total: 5,
    })),
  },
})

beforeEach(() => {
  // Braces matter: mockReset() returns the mock, and vitest calls a function
  // returned from a hook as a CLEANUP callback — invoking the mock argless.
  mockFetch.mockReset()
})

describe('sweepTenant honesty at the seam', () => {
  it('happy path: statement lines from all accounts, chunked windows, correct source', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('/Accounts')) return accountsPayload
      if (url.includes('/Reports/BankStatement')) {
        return url.includes('acc-2') ? oneUnreconciledStatement : cleanStatement
      }
      throw new Error(`unexpected fetch ${url}`)
    })
    const result = await sweepTenant({} as any, CONN, 'biz-1', NOW)
    expect(result.status).toBe('ok')
    expect(result.source).toBe('statement_lines')
    // Two chunks per unreconciled account → the count is de-duplicated by
    // month bucketing only within each account's merged items; acc-2's 'No'
    // row appears in both chunks' fixtures, so 2 here proves both chunks ran.
    expect(result.totalCount).toBe(2)
    expect(result.accounts[0].currency).toBe('HKD')
    const statementCalls = mockFetch.mock.calls.filter(([u]) => String(u).includes('BankStatement'))
    expect(statementCalls).toHaveLength(4) // 2 accounts × 2 window chunks
  })

  it('ONE account failing (404) abandons statement lines entirely — labelled fallback with the named reason', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('/Accounts')) return accountsPayload
      if (url.includes('/Reports/BankStatement')) {
        if (url.includes('acc-2')) throw new Error('xero 404 for tenant t1: not found')
        return oneUnreconciledStatement
      }
      if (url.includes('/BankTransactions')) return fallbackTxns(1)
      throw new Error(`unexpected fetch ${url}`)
    })
    const result = await sweepTenant({} as any, CONN, 'biz-1', NOW)
    expect(result.status).toBe('ok')
    expect(result.source).toBe('account_transactions')
    expect(result.fallbackReason).toContain('statement report unavailable')
    expect(result.fallbackReason).toContain('404')
    // Nothing from the good account's statement pass survives.
    expect(result.accounts.every(a => a.bankAccountId === 'acc-1')).toBe(true)
    expect(result.totalCount).toBe(1)
  })

  it('an unrecognised report shape falls back with the parser reason named', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('/Accounts')) return accountsPayload
      if (url.includes('/Reports/BankStatement')) return { ok: true, status: 200, headers: {}, json: {} }
      if (url.includes('/BankTransactions')) return fallbackTxns(0)
      throw new Error(`unexpected fetch ${url}`)
    })
    const result = await sweepTenant({} as any, CONN, 'biz-1', NOW)
    expect(result.source).toBe('account_transactions')
    expect(result.fallbackReason).toContain('shape not recognised')
    expect(result.fallbackReason).toContain('no Reports[0].Rows envelope')
  })

  it('an unrecognised Accounts listing is an ERROR — never "no accounts, all clear"', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('/Accounts')) return { ok: true, status: 200, headers: {}, json: { weird: true } }
      throw new Error(`unexpected fetch ${url}`)
    })
    const result = await sweepTenant({} as any, CONN, 'biz-1', NOW)
    expect(result.status).toBe('error')
    expect(result.error).toContain('Accounts response shape not recognised')
  })

  it('fallback truncation at the page cap is a recorded caveat, not a silent floor', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('/Accounts')) return accountsPayload
      if (url.includes('/Reports/BankStatement')) throw new Error('xero 401 for tenant t1: AuthorizationUnsuccessful')
      if (url.includes('/BankTransactions')) return fallbackTxns(100)
      throw new Error(`unexpected fetch ${url}`)
    })
    const result = await sweepTenant({} as any, CONN, 'biz-1', NOW)
    expect(result.status).toBe('ok')
    expect(result.caveats?.some(c => c.includes('truncated'))).toBe(true)
    expect(result.totalCount).toBe(1000)
  })

  it('double failure keeps BOTH reasons: fallback error names the original statement refusal', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('/Accounts')) return accountsPayload
      if (url.includes('/Reports/BankStatement')) throw new Error('xero 401 for tenant t1: AuthorizationUnsuccessful')
      if (url.includes('/BankTransactions')) throw new Error('xero 503 after 5 attempts for tenant t1: down')
      throw new Error(`unexpected fetch ${url}`)
    })
    const result = await sweepTenant({} as any, CONN, 'biz-1', NOW)
    expect(result.status).toBe('error')
    expect(result.error).toContain('503')
    expect(result.error).toContain('statement report unavailable')
  })
})
