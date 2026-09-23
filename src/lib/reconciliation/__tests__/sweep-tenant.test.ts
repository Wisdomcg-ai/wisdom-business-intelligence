/**
 * sweepTenant integration seam — the honesty rules, pinned where they live:
 *
 *  - The sweep has ONE source: unreconciled account transactions. It never
 *    calls Reports/BankStatement — that scope is closed to this app (Xero
 *    support, 2 Sep 2026) and every attempt 401'd on every tenant.
 *  - An unrecognised Accounts listing is an ERROR, never "no bank accounts →
 *    all clear".
 *  - Truncation at the page cap is a recorded caveat; a Xero failure is an
 *    errored check, never a zero.
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
const tokenMock = vi.fn<(...args: any[]) => Promise<any>>()
vi.mock('@/lib/xero/token-manager', () => ({
  getValidAccessToken: (...args: any[]) => tokenMock(...args),
}))

import { RateLimitDailyExceededError } from '@/lib/xero/xero-api-client'
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

const txns = (rows: Array<{ account: string; name: string; date: string; total: number }>) => ({
  ok: true, status: 200, headers: {},
  json: {
    BankTransactions: rows.map(r => ({
      BankAccount: { AccountID: r.account, Name: r.name },
      DateString: r.date,
      Total: r.total,
    })),
  },
})

const fullPage = (n: number) =>
  txns(Array.from({ length: n }, () => ({ account: 'acc-1', name: 'ANZ Cheque', date: '2026-08-01T00:00:00', total: 5 })))

beforeEach(() => {
  // Braces matter: mockReset() returns the mock, and vitest calls a function
  // returned from a hook as a CLEANUP callback — invoking the mock argless.
  mockFetch.mockReset()
  tokenMock.mockReset()
  tokenMock.mockImplementation(async () => ({ success: true, accessToken: 'tok' }))
})

describe('sweepTenant honesty at the seam', () => {
  it('counts unreconciled account transactions per account, with the account currency, and never touches Reports/BankStatement', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('/Accounts')) return accountsPayload
      if (url.includes('/BankTransactions')) {
        return txns([
          { account: 'acc-1', name: 'ANZ Cheque', date: '2026-08-03T00:00:00', total: -10 },
          { account: 'acc-2', name: 'Airwallex', date: '2026-08-05T00:00:00', total: -42.1 },
        ])
      }
      throw new Error(`unexpected fetch ${url}`)
    })
    const result = await sweepTenant({} as any, CONN, 'biz-1', NOW)
    expect(result.status).toBe('ok')
    expect(result.source).toBe('account_transactions')
    expect(result.totalCount).toBe(2)
    expect(result.totalValue).toBe(52.1)
    expect(result.accounts.find(a => a.bankAccountId === 'acc-2')?.currency).toBe('HKD')
    expect(result.caveats).toBeUndefined()
    // THE PIN: the closed-scope report is never requested.
    const urls = mockFetch.mock.calls.map(([u]) => String(u))
    expect(urls.some(u => u.includes('BankStatement'))).toBe(false)
    expect(urls.filter(u => u.includes('/BankTransactions'))).toHaveLength(1)
  })

  it('a tenant with no active bank accounts is an OK zero — nothing to reconcile', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('/Accounts')) return { ok: true, status: 200, headers: {}, json: { Accounts: [] } }
      throw new Error(`unexpected fetch ${url}`)
    })
    const result = await sweepTenant({} as any, CONN, 'biz-1', NOW)
    expect(result).toMatchObject({ status: 'ok', source: 'account_transactions', totalCount: 0, accounts: [] })
  })

  it('an unrecognised Accounts listing is an ERROR — never "no accounts, all clear"', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('/Accounts')) return { ok: true, status: 200, headers: {}, json: { weird: true } }
      throw new Error(`unexpected fetch ${url}`)
    })
    const result = await sweepTenant({} as any, CONN, 'biz-1', NOW)
    expect(result.status).toBe('error')
    expect(result.source).toBe('account_transactions')
    expect(result.error).toContain('Accounts response shape not recognised')
  })

  it('truncation at the page cap is a recorded caveat, not a silent floor', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('/Accounts')) return accountsPayload
      if (url.includes('/BankTransactions')) return fullPage(100)
      throw new Error(`unexpected fetch ${url}`)
    })
    const result = await sweepTenant({} as any, CONN, 'biz-1', NOW)
    expect(result.status).toBe('ok')
    expect(result.totalCount).toBe(1000)
    expect(result.caveats?.some(c => c.includes('truncated'))).toBe(true)
    expect(mockFetch.mock.calls.filter(([u]) => String(u).includes('/BankTransactions'))).toHaveLength(10)
  })

  it('a Xero failure on the transactions call is an errored check carrying the reason — never a zero', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('/Accounts')) return accountsPayload
      if (url.includes('/BankTransactions')) throw new Error('xero 503 after 5 attempts for tenant t1: down')
      throw new Error(`unexpected fetch ${url}`)
    })
    const result = await sweepTenant({} as any, CONN, 'biz-1', NOW)
    expect(result.status).toBe('error')
    expect(result.source).toBe('account_transactions')
    expect(result.error).toContain('503')
    expect(result.totalCount).toBe(0)
  })

  it('a daily rate-limit pause is an errored check naming the retry, not a zero', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('/Accounts')) return accountsPayload
      if (url.includes('/BankTransactions')) throw new RateLimitDailyExceededError('t1')
      throw new Error(`unexpected fetch ${url}`)
    })
    const result = await sweepTenant({} as any, CONN, 'biz-1', NOW)
    expect(result.status).toBe('error')
    expect(result.error).toContain('daily rate limit')
  })

  it('a token failure is an errored check that says so (and whether a reconnect is needed)', async () => {
    tokenMock.mockImplementation(async () => ({ success: false, error: 'refresh refused', shouldDeactivate: true }))
    const result = await sweepTenant({} as any, CONN, 'biz-1', NOW)
    expect(result.status).toBe('error')
    expect(result.source).toBe('account_transactions')
    expect(result.error).toContain('token: refresh refused')
    expect(result.error).toContain('needs reconnect')
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
