/**
 * The numbers here are Urban Road's, July and August 2026, because the defect
 * this file pins was found in a real pack: a PHP 22,750 contractor bill quoted
 * as "$91,000" underneath an account that spent $31,029.30 for the month.
 */
import { describe, it, expect } from 'vitest'
import { toBaseAmount, toStatementAmount, vendorsExceedAccount } from '../commentary-money'

describe('toBaseAmount', () => {
  it('converts a foreign bill at the rate the document itself carries', () => {
    // Ailene Alfonso, August 2026: PHP 22,750 posted at A$530.56.
    // Urban Road bill 2026UR-0801: PHP 22,750 at CurrencyRate 42.879, which
    // Xero itself posted at AUD 530.56. The rate is foreign-per-base, so the
    // conversion DIVIDES. The previous version of this test passed 0.023321 —
    // its reciprocal, a number invented to make a multiplication work.
    const r = toBaseAmount(22750, { CurrencyCode: 'PHP', CurrencyRate: 42.879 }, 'AUD')
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
    // USD 1,000 at 1.5 USD per AUD is A$666.67 out, not A$1,500.
    const r = toBaseAmount(-1000, { CurrencyCode: 'USD', CurrencyRate: 1.5 }, 'AUD')
    expect(r.amount).toBeCloseTo(-666.67, 2)
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
    const r = toBaseAmount(150, { CurrencyCode: 'USD', CurrencyRate: 1.5 }, null)
    expect(r.amount).toBe(100)
    expect(r.converted).toBe(true)
  })
})

describe('toStatementAmount', () => {
  it('nets the GST off an Inclusive line', () => {
    // Allied Express bill 2026/32: gross 3,766.31, tax 342.39, and the P&L
    // carries 3,423.92. The client's own commentary quotes the net.
    const r = toStatementAmount(
      { LineAmount: 3766.31, TaxAmount: 342.39 },
      { CurrencyCode: 'AUD', CurrencyRate: 1, LineAmountTypes: 'Inclusive' },
      'AUD',
    )
    expect(r.amount).toBeCloseTo(3423.92, 2)
    expect(r.converted).toBe(true)
  })

  it("Allied Express's whole August foots to the client's own figure", () => {
    const bills: [number, number][] = [
      [3766.31, 342.39], [6336.97, 576.09], [5487.06, 498.82], [10363.2, 942.11],
    ]
    const total = bills.reduce((t, [gross, tax]) => t + toStatementAmount(
      { LineAmount: gross, TaxAmount: tax },
      { CurrencyCode: 'AUD', CurrencyRate: 1, LineAmountTypes: 'Inclusive' },
      'AUD',
    ).amount, 0)
    // $23,594 — the figure in the client's hand-written pack. The gross,
    // $25,954, is what the pack quoted before this change.
    expect(total).toBeCloseTo(23594.13, 2)
  })

  it('leaves an Exclusive line alone — it is already net', () => {
    const r = toStatementAmount(
      { LineAmount: 1000, TaxAmount: 100 },
      { CurrencyCode: 'AUD', LineAmountTypes: 'Exclusive' },
      'AUD',
    )
    expect(r.amount).toBe(1000)
  })

  it('treats an unstated treatment as already net, never as inclusive', () => {
    // Guessing "inclusive" would shave 10% off every line on such a document.
    const r = toStatementAmount({ LineAmount: 1000, TaxAmount: 100 }, { CurrencyCode: 'AUD' }, 'AUD')
    expect(r.amount).toBe(1000)
  })

  it('takes tax off in the DOCUMENT currency, then converts', () => {
    // PHP 22,750 with no tax at 42.879 — Urban Road's contractor bills are
    // Inclusive but GST-free, so the whole correction is the FX one.
    const r = toStatementAmount(
      { LineAmount: 22750, TaxAmount: 0 },
      { CurrencyCode: 'PHP', CurrencyRate: 42.879, LineAmountTypes: 'Inclusive' },
      'AUD',
    )
    expect(r.amount).toBeCloseTo(530.56, 1)
  })

  it('nets and converts together when a foreign bill does carry tax', () => {
    // 110 USD inclusive of 10 USD tax, at 1.5 USD per AUD → A$66.67.
    const r = toStatementAmount(
      { LineAmount: 110, TaxAmount: 10 },
      { CurrencyCode: 'USD', CurrencyRate: 1.5, LineAmountTypes: 'Inclusive' },
      'AUD',
    )
    expect(r.amount).toBeCloseTo(66.67, 2)
  })

  it('moves a credit note the right way', () => {
    const r = toStatementAmount(
      { LineAmount: -1728.1, TaxAmount: -157.1 },
      { CurrencyCode: 'AUD', LineAmountTypes: 'Inclusive' },
      'AUD',
    )
    expect(r.amount).toBeCloseTo(-1571, 1)
  })

  it('still refuses a foreign line with no rate', () => {
    const r = toStatementAmount(
      { LineAmount: 22750, TaxAmount: 0 },
      { CurrencyCode: 'PHP', CurrencyRate: null, LineAmountTypes: 'Inclusive' },
      'AUD',
    )
    expect(r.converted).toBe(false)
    expect(r.reason).toContain('PHP')
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
