import { describe, it, expect } from 'vitest'
import { sweepWindow, groupAccountTransactions, sumBuckets } from '../sweep'

describe('sweepWindow', () => {
  it('spans from the first of the month 11 months back through today', () => {
    expect(sweepWindow(new Date(Date.UTC(2026, 8, 16)))).toEqual({
      fromDate: '2025-10-01',
      toDate: '2026-09-16',
    })
  })

  it('handles year boundaries', () => {
    expect(sweepWindow(new Date(Date.UTC(2026, 0, 5)))).toEqual({
      fromDate: '2025-02-01',
      toDate: '2026-01-05',
    })
  })
})

describe('groupAccountTransactions', () => {
  it('groups by bank account with absolute totals and prefers DateString', () => {
    const { byAccount, dropped } = groupAccountTransactions([
      {
        BankAccount: { AccountID: 'acc-1', Name: 'ANZ Cheque' },
        DateString: '2026-08-14T00:00:00',
        Date: '/Date(1755129600000+0000)/',
        Total: -150.25,
      },
      { BankAccount: { AccountID: 'acc-1', Name: 'ANZ Cheque' }, DateString: '2026-07-02T00:00:00', Total: 40 },
      { BankAccount: { AccountID: 'acc-2', Name: 'Visa' }, DateString: '2026-08-20T00:00:00', Total: 99 },
    ])
    expect(dropped).toBe(0)
    expect(byAccount.get('acc-1')).toEqual({
      name: 'ANZ Cheque',
      items: [
        { date: '2026-08-14T00:00:00', amount: 150.25 },
        { date: '2026-07-02T00:00:00', amount: 40 },
      ],
    })
    expect(byAccount.get('acc-2')?.items).toHaveLength(1)
  })

  it('drops transactions with no bank account id and counts them', () => {
    const { byAccount, dropped } = groupAccountTransactions([
      { DateString: '2026-08-01', Total: 10 },
      { BankAccount: {}, DateString: '2026-08-01', Total: 10 },
    ])
    expect(byAccount.size).toBe(0)
    expect(dropped).toBe(2)
  })
})

describe('sumBuckets', () => {
  it('totals counts and values across accounts with cent rounding', () => {
    expect(
      sumBuckets([
        {
          bankAccountId: 'a',
          bankAccountName: null,
          currency: 'AUD',
          buckets: [
            { month: '2026-07', count: 2, value: 0.1 },
            { month: '2026-08', count: 1, value: 0.2 },
          ],
        },
        { bankAccountId: 'b', bankAccountName: null, currency: 'AUD', buckets: [{ month: '2026-08', count: 3, value: 10 }] },
      ])
    ).toEqual({ totalCount: 6, totalValue: 10.3 })
  })

  it('returns zeros for a fully reconciled tenant', () => {
    expect(sumBuckets([])).toEqual({ totalCount: 0, totalValue: 0 })
  })
})
