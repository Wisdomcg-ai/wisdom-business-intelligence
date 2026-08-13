/**
 * Cross-org account identity — all cases below are real Dragon Roofing data.
 *
 * Dragon Roofing Pty Ltd and Easy Hail Claim share 74 account codes and disagree
 * on the name of 26 of them. Deciding which of those are the same account is what
 * keeps an unrelated account's spend out of the client's forecast.
 */
import { describe, it, expect } from 'vitest'
import { isSameAccount, normaliseAccountName } from '@/lib/xero/account-name-match'

describe('genuinely different accounts sharing a code', () => {
  // Dragon's chart is offset from Easy Hail's in places — same number, different account.
  it.each([
    ['401', 'Accounting', 'Advertising'],
    ['402', 'Bad Debts expense', 'Marketing'],
    ['403', 'Amortisation', 'Bad Debts'],
    ['430', 'HR Costs', 'Canvassing - Lead'],
    ['510', 'Stripe Fees', 'Consultants'],
  ])('code %s — "%s" is not "%s"', (_code, dragon, easyHail) => {
    expect(isSameAccount(dragon, easyHail)).toBe(false)
  })
})

describe('cosmetic differences are still the same account', () => {
  it('ignores a trailing (code) suffix', () => {
    expect(isSameAccount('Entertainment (420)', 'Entertainment')).toBe(true)
    expect(isSameAccount('Freight & Courier (425)', 'Freight & Courier')).toBe(true)
  })

  it('ignores case, punctuation and spacing', () => {
    expect(isSameAccount('Subscriptions', 'subscriptions')).toBe(true)
    expect(isSameAccount('Repairs & Maintenance', 'Repairs and Maintenance')).toBe(false) // "and" vs "&" is a real word difference
    expect(isSameAccount('General Expenses', 'General  Expenses ')).toBe(true)
  })

  it('matches the account this whole fix turns on', () => {
    // 485 is "Subscriptions" in BOTH Dragon orgs — it must keep merging.
    expect(isSameAccount('Subscriptions', 'Subscriptions')).toBe(true)
  })
})

describe('missing names carry no evidence', () => {
  it('treats a blank name as a mismatch rather than merging on it', () => {
    expect(isSameAccount('', '')).toBe(false)
    expect(isSameAccount(null, 'Subscriptions')).toBe(false)
    expect(isSameAccount('Subscriptions', undefined)).toBe(false)
  })
})

describe('normaliseAccountName', () => {
  it('strips the parenthesised code and punctuation', () => {
    expect(normaliseAccountName('Entertainment (420)')).toBe('entertainment')
    expect(normaliseAccountName('Bank Fees - Merchant')).toBe('bankfeesmerchant')
  })
})
