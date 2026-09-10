import { describe, it, expect } from 'vitest'
import { buildDraftNote, draftNoteToText } from '../commentary-draft'
import { buildRatioClause } from '../commentary-clause'

describe('buildDraftNote — the July pack lines', () => {
  it('reproduces the Antons Canvas line end to end', () => {
    const clause = buildRatioClause({
      accountActual: 201177, accountBudget: 162900,
      denominatorActual: 497243, denominatorBudget: 450000,
      priorAccountActual: null, priorDenominatorActual: null,
      denominatorLabel: 'income', priorMonthLabel: null,
    })
    const note = buildDraftNote({
      accountName: 'Antons Canvas',
      vendors: [
        { vendor: 'Antons Mouldings Pty Ltd', amount: 201026 },
        { vendor: 'POD order journals', amount: 151 },
      ],
      accountActual: 201177,
      clause,
    })
    expect(draftNoteToText(note)).toBe(
      'Antons Canvas | Antons Mouldings Pty Ltd ($201,026), POD order journals ($151) - 40.5% of income against a 36.2% driver',
    )
    expect(note.warnings).toEqual([])
  })

  it('renders a credit as "less X credit", not as a charge', () => {
    // Telephone & Internet, July: Aircall $4,536, On the Net $299, less a
    // Hardware Concepts credit of $1,571.
    const note = buildDraftNote({
      accountName: 'Telephone & Internet',
      vendors: [
        { vendor: 'Aircall', amount: 4536 },
        { vendor: 'On the Net', amount: 299 },
        { vendor: 'Hardware Concepts', amount: -1571 },
      ],
      accountActual: 3264,
      clause: null,
    })
    expect(note.body).toBe('Aircall ($4,536), On the Net ($299), less Hardware Concepts credit ($1,571)')
    expect(note.warnings).toEqual([])
  })
})

describe('buildDraftNote — the cap', () => {
  const many = Array.from({ length: 16 }, (_, i) => ({
    vendor: `Contractor ${i + 1}`,
    amount: 2000 - i * 100,
  }))

  it('names three and rolls the rest up', () => {
    const note = buildDraftNote({
      accountName: 'Contractors excl. Artists',
      vendors: many,
      accountActual: many.reduce((s, v) => s + v.amount, 0),
      clause: null,
    })
    expect(note.body).toContain('Contractor 1 ($2,000), Contractor 2 ($1,900), Contractor 3 ($1,800)')
    expect(note.body).toContain('+13 others ($14,300)')
    expect(note.body).not.toContain('Contractor 4 (')
  })

  it('says "other" not "others" for a single remainder', () => {
    const note = buildDraftNote({
      accountName: 'X',
      vendors: [{ vendor: 'A', amount: 4 }, { vendor: 'B', amount: 3 },
                { vendor: 'C', amount: 2 }, { vendor: 'D', amount: 1 }],
      accountActual: 10,
      clause: null,
    })
    expect(note.body).toContain('+1 other ($1)')
  })

  it('never rolls a credit into the remainder', () => {
    // A credit hidden inside "+N others" explains nothing — and its sign would
    // silently reduce a total the reader thinks is all charges.
    const note = buildDraftNote({
      accountName: 'X',
      vendors: [
        { vendor: 'A', amount: 5000 }, { vendor: 'B', amount: 4000 },
        { vendor: 'C', amount: 3000 }, { vendor: 'D', amount: 2000 },
        { vendor: 'Refund Co', amount: -900 },
      ],
      accountActual: 13100,
      clause: null,
    })
    expect(note.body).toContain('+1 other ($2,000)')
    expect(note.body).toContain('less Refund Co credit ($900)')
  })
})

describe('buildDraftNote — what it refuses to send', () => {
  it('flags a vendor list that sums past its own account', () => {
    // The July Contractors case: sixteen vendors totalling $120,045 under an
    // account that moved $31,029.30.
    const note = buildDraftNote({
      accountName: 'Contractors excl. Artists',
      vendors: [{ vendor: 'Ailene Alfonso', amount: 91000 }, { vendor: 'Akshay', amount: 29045 }],
      accountActual: 31029.3,
      clause: null,
    })
    expect(note.warnings.some(w => w.includes('do not send this line'))).toBe(true)
  })

  it('is silent when the list is short of the account, which is normal', () => {
    const note = buildDraftNote({
      accountName: 'Contractors excl. Artists',
      vendors: [{ vendor: 'Ailene Alfonso', amount: 531 }, { vendor: 'Akshay', amount: 4721 }],
      accountActual: 31029.3,
      clause: null,
    })
    expect(note.warnings).toEqual([])
  })

  it('names an unconvertible document instead of quoting a foreign number', () => {
    const note = buildDraftNote({
      accountName: 'Contractors excl. Artists',
      vendors: [
        { vendor: 'Ailene Alfonso', amount: 22750, converted: false, sourceCurrency: 'PHP' },
        { vendor: 'Akshay', amount: 4721 },
      ],
      accountActual: 31029.3,
      clause: null,
    })
    expect(note.warnings[0]).toContain('PHP')
    expect(note.warnings[0]).toContain('not included')
    // And it is excluded from the total that the exceeds-account check uses,
    // so an unconvertible line cannot itself trigger the "list is wrong" alarm.
    expect(note.warnings.some(w => w.includes('do not send this line'))).toBe(false)
  })

  it('produces just the account name when there is nothing to say', () => {
    const note = buildDraftNote({ accountName: 'Bank Fees', vendors: [], accountActual: 11, clause: null })
    expect(note.body).toBe('')
    expect(draftNoteToText(note)).toBe('Bank Fees')
  })

  it('renders the clause alone when there are no vendors', () => {
    const clause = buildRatioClause({
      accountActual: 50304, accountBudget: null,
      denominatorActual: 497243, denominatorBudget: null,
      priorAccountActual: 50308, priorDenominatorActual: 567254,
      denominatorLabel: 'income', priorMonthLabel: 'June',
    })
    const note = buildDraftNote({
      accountName: 'Freight to Customer', vendors: [], accountActual: 50304, clause,
    })
    expect(note.body).toBe('10.1% of income against 8.9% in June')
  })
})
