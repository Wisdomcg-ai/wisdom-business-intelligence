/**
 * The numbers here are Urban Road's, July and August 2026, because the defect
 * this file pins was found in a real pack: a PHP 22,750 contractor bill quoted
 * as "$91,000" underneath an account that spent $31,029.30 for the month.
 */
import { describe, it, expect } from 'vitest'
import { toBaseAmount, vendorsExceedAccount } from '../commentary-money'

describe('toBaseAmount', () => {
  it('converts a foreign bill at the rate the document itself carries', () => {
    // Ailene Alfonso, August 2026: PHP 22,750 posted at A$530.56.
    const r = toBaseAmount(22750, { CurrencyCode: 'PHP', CurrencyRate: 0.023321 }, 'AUD')
    expect(r.converted).toBe(true)
    expect(r.amount).toBeCloseTo(530.55, 1)
    expect(r.sourceCurrency).toBe('PHP')
  })

  it('leaves a domestic line alone', () => {
    const r = toBaseAmount(4536, { CurrencyCode: 'AUD', CurrencyRate: 1 }, 'AUD')
    expect(r).toEqual({ amount: 4536, converted: true })
  })

  it('treats a document with no currency as domestic', () => {
    // The overwhelmingly common case, and what the code did before.
    const r = toBaseAmount(1503, {}, 'AUD')
    expect(r).toEqual({ amount: 1503, converted: true })
  })

  it('refuses to pass a foreign amount through when the rate is missing', () => {
    const r = toBaseAmount(22750, { CurrencyCode: 'PHP', CurrencyRate: null }, 'AUD')
    expect(r.converted).toBe(false)
    expect(r.reason).toContain('PHP')
    // The raw figure is still returned so the caller can show it AS PHP —
    // what it must never do is print it as though it were dollars.
    expect(r.amount).toBe(22750)
  })

  it('treats a zero rate as missing, not as free', () => {
    const r = toBaseAmount(1000, { CurrencyCode: 'USD', CurrencyRate: 0 }, 'AUD')
    expect(r.converted).toBe(false)
  })

  it('KEEPS THE SIGN — a credit is a credit', () => {
    // Hardware Concepts, July 2026: a $1,571 credit against Telephone &
    // Internet. Math.abs() both inflated the account and lost the word "less".
    const r = toBaseAmount(-1571, { CurrencyCode: 'AUD' }, 'AUD')
    expect(r.amount).toBe(-1571)
    expect(r.converted).toBe(true)
  })

  it('converts a foreign credit and keeps it negative', () => {
    const r = toBaseAmount(-1000, { CurrencyCode: 'USD', CurrencyRate: 1.5 }, 'AUD')
    expect(r.amount).toBe(-1500)
  })

  it('reads an absent amount as zero, not as a failure', () => {
    // Xero omitting LineAmount means the line is $0. That is a real number and
    // must not be reported as something we could not convert.
    expect(toBaseAmount(null, {}, 'AUD')).toEqual({ amount: 0, converted: true })
    expect(toBaseAmount(undefined, {}, 'AUD')).toEqual({ amount: 0, converted: true })
  })

  it('refuses an amount that is not a number at all', () => {
    const r = toBaseAmount('n/a', {}, 'AUD')
    expect(r.converted).toBe(false)
    expect(r.amount).toBe(0)
  })

  it('still converts when the org currency is unknown but the document has a rate', () => {
    const r = toBaseAmount(100, { CurrencyCode: 'USD', CurrencyRate: 1.5 }, null)
    expect(r.amount).toBe(150)
    expect(r.converted).toBe(true)
  })
})

describe('vendorsExceedAccount', () => {
  it('catches the July Contractors case', () => {
    expect(vendorsExceedAccount(120045, 31029.3)).toBe(true)
  })

  it('is silent when the list is short of the account, which is normal', () => {
    // Sub-materiality vendors are rolled up and journals are not bills, so
    // quoting less than the account is expected and must not warn.
    expect(vendorsExceedAccount(28000, 31029.3)).toBe(false)
  })

  it('tolerates a cent of rounding', () => {
    expect(vendorsExceedAccount(31029.305, 31029.3)).toBe(false)
    expect(vendorsExceedAccount(31129.3, 31029.3)).toBe(true)
  })

  it('compares magnitudes so a net-credit month still works', () => {
    expect(vendorsExceedAccount(-600, -500)).toBe(true)
    expect(vendorsExceedAccount(-400, -500)).toBe(false)
  })

  it('says nothing when either side is not a number', () => {
    expect(vendorsExceedAccount(NaN, 100)).toBe(false)
    expect(vendorsExceedAccount(100, NaN)).toBe(false)
  })
})
