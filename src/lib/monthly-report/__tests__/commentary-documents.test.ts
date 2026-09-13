/**
 * Urban Road Pty Ltd, August 2026. Two supplier lists each ran about $800 over
 * the statement line they sat under, and both were verified to the cent:
 *
 *   Freight to Customer (55000)       quoted $51,733 against $50,924.95
 *   Contractors excl. Artists (61400) quoted $31,830 against $31,029.30
 *
 * Freight carried two Team Global Express lines the ledger never posted (a
 * draft and a void, $807.14 between them). Contractors counted Reena Rosales's
 * refund received as $400 of spend on top of the $400 she paid back.
 */
import { describe, it, expect } from 'vitest'
import {
  collectAccountTransactions,
  commentaryBankTransactionsUrl,
  commentaryCreditNotesUrl,
  commentaryInvoicesUrl,
  creditNoteTypesFor,
  invoiceTypesFor,
  isPostedBankTransaction,
  isPostedCreditNote,
  isPostedInvoice,
  lineSign,
  summariseVendors,
  type VendorTransaction,
  type XeroCommentaryDocument,
} from '../commentary-documents'
import { vendorsExceedAccount } from '../commentary-money'
import { buildDraftNote } from '../commentary-draft'

const AUG_2 = '/Date(1785628800000+0000)/'

function bill(contact: string, net: number, code: string, status: string, type = 'ACCPAY'): XeroCommentaryDocument {
  return {
    Type: type,
    Status: status,
    Date: AUG_2,
    CurrencyCode: 'AUD',
    CurrencyRate: 1,
    LineAmountTypes: 'Exclusive',
    Contact: { Name: contact },
    LineItems: [{ AccountCode: code, LineAmount: net, TaxAmount: 0, Description: '' }],
  }
}

function bank(contact: string, amount: number, code: string, type: string, status = 'AUTHORISED', description = ''): XeroCommentaryDocument {
  return {
    Type: type,
    Status: status,
    Date: AUG_2,
    CurrencyCode: 'AUD',
    LineAmountTypes: 'NoTax',
    Contact: { Name: contact },
    LineItems: [{ AccountCode: code, LineAmount: amount, Description: description }],
  }
}

const sum = (txns: VendorTransaction[]) => txns.reduce((t, x) => t + x.amount, 0)

describe('posted documents only', () => {
  it('Freight: TGE is its seven posted bills, not the draft and the void beside them', () => {
    const posted = [2360.24, 2842.85, 22.77, 3469.55, 2047.45, 862.47, 23.28]
      .map(n => bill('Team Global Express', n, '55000', 'PAID'))
    const invoices = [
      ...posted,
      bill('Team Global Express', 786.67, '55000', 'DRAFT'),
      bill('Team Global Express', 20.47, '55000', 'VOIDED'),
    ]

    const txns = collectAccountTransactions({
      accountCode: '55000', side: 'expense', invoices, bankTransactions: [], baseCurrency: 'AUD',
    })

    expect(txns).toHaveLength(7)
    expect(sum(txns)).toBeCloseTo(11628.61, 2)

    const summary = summariseVendors(txns)
    expect(summary).toEqual([
      expect.objectContaining({ vendor: 'Team Global Express', amount: 11629 }),
    ])
  })

  it('AUTHORISED and PAID are posted; DRAFT, SUBMITTED, VOIDED and DELETED are not', () => {
    for (const s of ['AUTHORISED', 'PAID']) expect(isPostedInvoice({ Status: s })).toBe(true)
    for (const s of ['DRAFT', 'SUBMITTED', 'VOIDED', 'DELETED', '', undefined]) {
      expect(isPostedInvoice({ Status: s })).toBe(false)
    }
  })

  it('a DELETED bank transaction is excluded', () => {
    expect(isPostedBankTransaction({ Status: 'DELETED' })).toBe(false)
    const txns = collectAccountTransactions({
      accountCode: '61400',
      side: 'expense',
      invoices: [],
      bankTransactions: [
        bank('Reena Rosales', 400, '61400', 'SPEND'),
        bank('Reena Rosales', 400, '61400', 'SPEND', 'DELETED'),
      ],
      baseCurrency: 'AUD',
    })
    expect(txns).toHaveLength(1)
    expect(sum(txns)).toBe(400)
  })
})

describe('signed by document type and account side', () => {
  it('Contractors: Reena Rosales is her four bills — the refund and its repayment cancel', () => {
    const invoices = [1, 2, 3, 4].map(() => bill('Reena Rosales', 400, '61400', 'PAID'))
    const bankTransactions = [
      bank('Reena Rosales', 400, '61400', 'RECEIVE', 'AUTHORISED', 'returned funds from wise'),
      bank('Reena Rosales', 400, '61400', 'SPEND', 'AUTHORISED', 'repayment of returned funds'),
    ]

    const txns = collectAccountTransactions({
      accountCode: '61400', side: 'expense', invoices, bankTransactions, baseCurrency: 'AUD',
    })

    expect(sum(txns)).toBe(1600)
    const reena = summariseVendors(txns).find(v => v.vendor === 'Reena Rosales')
    expect(reena?.amount).toBe(1600)
    // Both bank lines still travel with her, so the coach can see the pair.
    expect(reena?.transactions).toHaveLength(6)
  })

  it('expense side: bills and SPEND count up, every RECEIVE variant counts down', () => {
    expect(lineSign('expense', 'invoice', 'ACCPAY')).toBe(1)
    expect(lineSign('expense', 'bank', 'SPEND')).toBe(1)
    expect(lineSign('expense', 'bank', 'SPEND-PREPAYMENT')).toBe(1)
    expect(lineSign('expense', 'bank', 'RECEIVE')).toBe(-1)
    expect(lineSign('expense', 'bank', 'RECEIVE-OVERPAYMENT')).toBe(-1)
  })

  it('a revenue account: a sales invoice counts up, a SPEND line against it counts down', () => {
    const txns = collectAccountTransactions({
      accountCode: '40000',
      side: 'revenue',
      invoices: [bill('Harvey Norman', 5000, '40000', 'AUTHORISED', 'ACCREC')],
      bankTransactions: [
        bank('Harvey Norman', 300, '40000', 'SPEND', 'AUTHORISED', 'customer refund'),
        bank('Cash Sale', 250, '40000', 'RECEIVE'),
      ],
      baseCurrency: 'AUD',
    })
    const byVendor = Object.fromEntries(txns.map(t => [`${t.type}:${t.amount}`, t.vendor]))
    expect(byVendor['invoice:5000']).toBe('Harvey Norman')
    expect(byVendor['bank:-300']).toBe('Harvey Norman')
    expect(sum(txns)).toBe(4950)
  })

  it('an invoice belongs to one side only, so the list does not depend on what else was fetched', () => {
    expect(lineSign('expense', 'invoice', 'ACCREC')).toBe(0)
    expect(lineSign('revenue', 'invoice', 'ACCPAY')).toBe(0)
  })

  it('an unrecognised bank type is left out rather than guessed', () => {
    expect(lineSign('expense', 'bank', undefined)).toBe(0)
    expect(lineSign('revenue', 'bank', 'SOMETHING')).toBe(0)
  })

  it('balance-sheet lines keep the sign LineAmount gives them, as before', () => {
    expect(lineSign('balance_sheet', 'bank', 'RECEIVE')).toBe(1)
    expect(lineSign('balance_sheet', 'bank', 'SPEND')).toBe(1)
    expect(lineSign('balance_sheet', 'invoice', 'ACCPAY')).toBe(1)
  })

  it('a credit line on a bill stays a credit, and FX and GST arithmetic is unchanged', () => {
    const txns = collectAccountTransactions({
      accountCode: '61400',
      side: 'expense',
      invoices: [
        {
          Type: 'ACCPAY', Status: 'PAID', Date: AUG_2,
          CurrencyCode: 'PHP', CurrencyRate: 42.879, LineAmountTypes: 'Inclusive',
          Contact: { Name: 'Ailene Alfonso' },
          LineItems: [{ AccountCode: '61400', LineAmount: 22750, TaxAmount: 0 }],
        },
        {
          Type: 'ACCPAY', Status: 'AUTHORISED', Date: AUG_2,
          CurrencyCode: 'AUD', LineAmountTypes: 'Inclusive',
          Contact: { Name: 'Hardware Concepts' },
          LineItems: [{ AccountCode: '61400', LineAmount: -1728.1, TaxAmount: -157.1 }],
        },
      ],
      bankTransactions: [
        // A foreign refund received: converted first, then signed down.
        {
          Type: 'RECEIVE', Status: 'AUTHORISED', Date: AUG_2,
          CurrencyCode: 'USD', CurrencyRate: 1.5, LineAmountTypes: 'Inclusive',
          Contact: { Name: 'Upwork' },
          LineItems: [{ AccountCode: '61400', LineAmount: 110, TaxAmount: 10 }],
        },
      ],
      baseCurrency: 'AUD',
    })
    const by = Object.fromEntries(txns.map(t => [t.vendor, t]))
    expect(by['Ailene Alfonso'].amount).toBeCloseTo(530.56, 1)
    expect(by['Ailene Alfonso'].sourceCurrency).toBe('PHP')
    expect(by['Hardware Concepts'].amount).toBeCloseTo(-1571, 1)
    expect(by['Upwork'].amount).toBeCloseTo(-66.67, 2)
  })
})

describe('the "Others" remainder', () => {
  const txn = (vendor: string, amount: number): VendorTransaction =>
    ({ date: '2026-08-02', vendor, context: null, amount, type: 'bank', converted: true })

  it('keeps a remainder that nets negative — small refunds must not vanish', () => {
    const summary = summariseVendors([
      txn('Allied Express', 23594.13),
      txn('Parcel Refund A', -40),
      txn('Parcel Refund B', -25),
      txn('Courier Sundry', 15),
    ])
    const others = summary.find(v => v.vendor === 'Others')
    expect(others?.amount).toBe(-50)
    expect(others?.transactions).toHaveLength(3)
  })

  it('drops a remainder that nets to zero', () => {
    const summary = summariseVendors([
      txn('Allied Express', 23594.13),
      txn('Small Charge', 40),
      txn('Small Refund', -40),
    ])
    expect(summary.map(v => v.vendor)).toEqual(['Allied Express'])
  })

  it('still keeps a positive remainder', () => {
    const summary = summariseVendors([txn('Allied Express', 1000), txn('Sundry', 30)])
    expect(summary.find(v => v.vendor === 'Others')?.amount).toBe(30)
  })
})

describe('the vendors-exceed guard on the corrected lists', () => {
  it('Freight no longer trips it', () => {
    // $51,733 less the $807 of unposted TGE lines is the $50,926 the client's
    // own pack foots to.
    expect(vendorsExceedAccount(50924.95, 50924.95)).toBe(false)
    expect(vendorsExceedAccount(51733 - 807, 50924.95)).toBe(false)
  })

  it('Contractors no longer trips it', () => {
    expect(vendorsExceedAccount(31029.3, 31029.3)).toBe(false)
    expect(vendorsExceedAccount(31830 - 800, 31029.3)).toBe(false)
  })

  it('and the uncorrected lists still do — the guard is not what changed', () => {
    expect(vendorsExceedAccount(51733, 50924.95)).toBe(true)
    expect(vendorsExceedAccount(31830, 31029.3)).toBe(true)
  })
})

describe('the requests', () => {
  it('asks for posted bills of one month, scoped by type', () => {
    const url = commentaryInvoicesUrl('2026-08', 'ACCPAY')!
    expect(url).toContain('Statuses=AUTHORISED,PAID')
    const where = decodeURIComponent(new URL(url).searchParams.get('where')!)
    expect(where).toBe('Type=="ACCPAY" AND Date>=DateTime(2026,8,1) AND Date<=DateTime(2026,8,31)')
  })

  it('asks for authorised bank transactions only', () => {
    const url = commentaryBankTransactionsUrl('2026-08')!
    const where = decodeURIComponent(new URL(url).searchParams.get('where')!)
    expect(where).toBe('Status=="AUTHORISED" AND Date>=DateTime(2026,8,1) AND Date<=DateTime(2026,8,31)')
  })

  it('refuses a malformed month rather than sending Xero a NaN date', () => {
    expect(commentaryBankTransactionsUrl('aug')).toBeNull()
    expect(commentaryInvoicesUrl('2026-13', 'ACCPAY')).toBeNull()
  })

  it('fetches sales invoices only when a revenue line is being commented on', () => {
    expect(invoiceTypesFor(['expense'])).toEqual(['ACCPAY'])
    expect(invoiceTypesFor(['expense', 'balance_sheet'])).toEqual(['ACCPAY'])
    expect(invoiceTypesFor(['revenue'])).toEqual(['ACCREC'])
    expect(invoiceTypesFor(['expense', 'revenue'])).toEqual(['ACCPAY', 'ACCREC'])
    expect(invoiceTypesFor([])).toEqual([])
  })
})

/**
 * Credit notes. The route fetched Invoices and BankTransactions and never
 * CreditNotes, so every list stood gross of the credits the ledger had already
 * taken off. Urban Road, August 2026: Rolled Prints (41200) quoted $4,178.56 of
 * posted sales-invoice lines under an accrual P&L of $3,221.53, and was refused.
 */
function creditNote(
  contact: string,
  lineAmount: number,
  tax: number,
  code: string,
  type: string,
  status = 'AUTHORISED',
  opts: { currency?: string; rate?: number | null; lineAmountTypes?: string } = {},
): XeroCommentaryDocument {
  return {
    Type: type,
    Status: status,
    Date: AUG_2,
    CurrencyCode: opts.currency ?? 'AUD',
    CurrencyRate: opts.rate === undefined ? 1 : opts.rate,
    LineAmountTypes: opts.lineAmountTypes ?? 'Inclusive',
    Contact: { Name: contact },
    LineItems: [{ AccountCode: code, LineAmount: lineAmount, TaxAmount: tax, Description: '' }],
  }
}

describe('credit notes', () => {
  // The 47 posted ACCREC lines on 41200, net, as Xero's
  // line_amount_net_base_currency gives them: the named customers counted off
  // the inline pages, and the remainder of the $4,178.56 carried as one row.
  const rolledPrintsInvoices = ([
    ['Lloyd Young', 680.72], ['Lloyd Young', 130.18], ['Amber Wedlake', 203.57],
    ['Leah Goodsell', 129.82], ['Steve Duke', 99.27], ['Tamarin Whittaker', 43.64],
    ['Ebony Johnston', 53.45], ['Brittany Dragonetti', 83.73], ['Jeanette Matthews', 53.45],
    ['Remaining Rolled Prints customers', 2700.73],
  ] as const).map(([c, n]) => bill(c, n, '41200', 'PAID', 'ACCREC'))

  // Sized to the verified $957.03 gap between the posted invoice lines and the
  // P&L. Jeanette Matthews's INV-017450 is settled by a credit in Xero; the
  // second note stands for the rest of the month's Zoho credits on 41200 until
  // the individual CN numbers are pulled from Sales > Credit notes.
  const rolledPrintsCredits = [
    creditNote('Jeanette Matthews', 48.11, 4.37, '41200', 'ACCRECCREDIT'),
    creditNote('Zoho Replacement Credits', 1004.62, 91.33, '41200', 'ACCRECCREDIT'),
  ]

  it('Rolled Prints: the posted invoices less the month\'s customer credits tie to the P&L', () => {
    const txns = collectAccountTransactions({
      accountCode: '41200',
      side: 'revenue',
      invoices: rolledPrintsInvoices,
      bankTransactions: [],
      creditNotes: rolledPrintsCredits,
      baseCurrency: 'AUD',
    })

    expect(sum(txns)).toBeCloseTo(3221.53, 2)
    const credits = txns.filter(t => t.type === 'credit_note').map(t => t.amount)
    expect(credits).toHaveLength(2)
    expect(credits[0]).toBeCloseTo(-43.74, 2)
    expect(credits[1]).toBeCloseTo(-913.29, 2)

    const quoted = summariseVendors(txns).reduce((t, v) => t + v.amount, 0)
    expect(vendorsExceedAccount(quoted, 3221.53)).toBe(false)
  })

  it('and without them the list still over-states the account — the defect, pinned', () => {
    const txns = collectAccountTransactions({
      accountCode: '41200', side: 'revenue', invoices: rolledPrintsInvoices, bankTransactions: [], baseCurrency: 'AUD',
    })
    expect(sum(txns)).toBeCloseTo(4178.56, 2)
    const quoted = summariseVendors(txns).reduce((t, v) => t + v.amount, 0)
    expect(vendorsExceedAccount(quoted, 3221.53)).toBe(true)
  })

  it('a supplier credit nets against the supplier\'s own bill, Inclusive tax off both', () => {
    // Hardware Concepts INV-0507: $2,200 Inclusive on Marketing Digital Ad
    // Spend, settled in full by a $2,200 credit note rather than a payment.
    const txns = collectAccountTransactions({
      accountCode: '64600',
      side: 'expense',
      invoices: [{
        ...bill('Hardware Concepts', 2200, '64600', 'PAID'),
        LineAmountTypes: 'Inclusive',
        LineItems: [{ AccountCode: '64600', LineAmount: 2200, TaxAmount: 200, Description: '' }],
      }],
      bankTransactions: [],
      creditNotes: [creditNote('Hardware Concepts', 2200, 200, '64600', 'ACCPAYCREDIT', 'PAID')],
      baseCurrency: 'AUD',
    })

    expect(txns.map(t => t.amount).sort((a, b) => a - b)).toEqual([-2000, 2000])
    expect(summariseVendors(txns)).toEqual([])
  })

  it('a supplier credit with no bill beside it is quoted as "less X credit"', () => {
    const txns = collectAccountTransactions({
      accountCode: '64600',
      side: 'expense',
      invoices: [],
      bankTransactions: [],
      creditNotes: [creditNote('Hardware Concepts', 1728.1, 157.1, '64600', 'ACCPAYCREDIT')],
      baseCurrency: 'AUD',
    })
    const vendors = summariseVendors(txns)
    expect(vendors).toEqual([expect.objectContaining({ vendor: 'Hardware Concepts', amount: -1571 })])
    expect(vendors[0].transactions[0].type).toBe('credit_note')

    const draft = buildDraftNote({ accountName: 'Marketing Digital Ad Spend', vendors, accountActual: 23143.86, clause: null })
    expect(draft.body).toContain('less Hardware Concepts credit ($1,571)')
    expect(draft.warnings).toEqual([])
  })

  it('a foreign credit note is converted at its own rate, and one with no rate is named, not summed', () => {
    // Accor Refurbishments is billed in NZD; 1.19777 is INV-017363's own rate.
    const nzd = { currency: 'NZD', rate: 1.19777, lineAmountTypes: 'Exclusive' }
    const invoice: XeroCommentaryDocument = {
      ...bill('Accor Refurbishments', 1312, '41150', 'AUTHORISED', 'ACCREC'),
      CurrencyCode: 'NZD',
      CurrencyRate: 1.19777,
    }
    const credit = creditNote('Accor Refurbishments', 328, 0, '41150', 'ACCRECCREDIT', 'AUTHORISED', nzd)

    const txns = collectAccountTransactions({
      accountCode: '41150', side: 'revenue', invoices: [invoice], bankTransactions: [], creditNotes: [credit], baseCurrency: 'AUD',
    })
    const byType = Object.fromEntries(txns.map(t => [t.type, t]))
    expect(byType.invoice.amount).toBeCloseTo(1095.37, 2)
    expect(byType.credit_note.amount).toBeCloseTo(-273.84, 2)
    expect(byType.credit_note.sourceCurrency).toBe('NZD')
    expect(summariseVendors(txns)).toEqual([
      expect.objectContaining({ vendor: 'Accor Refurbishments', amount: 822 }),
    ])

    const unrated = creditNote('Accor Refurbishments', 150, 0, '41150', 'ACCRECCREDIT', 'AUTHORISED', { ...nzd, rate: null })
    const withUnrated = collectAccountTransactions({
      accountCode: '41150', side: 'revenue', invoices: [invoice], bankTransactions: [], creditNotes: [credit, unrated], baseCurrency: 'AUD',
    })
    expect(withUnrated.find(t => t.converted === false)?.sourceCurrency).toBe('NZD')
    const vendors = summariseVendors(withUnrated)
    // The unrated credit rides along but is not in the $822.
    expect(vendors).toEqual([
      expect.objectContaining({ vendor: 'Accor Refurbishments', amount: 822, converted: false, sourceCurrency: 'NZD' }),
    ])
    const draft = buildDraftNote({ accountName: 'NZ Sales', vendors, accountActual: 821.53, clause: null })
    expect(draft.warnings.join(' ')).toContain('billed in NZD')
  })

  it('AUTHORISED and PAID credit notes are posted; DRAFT, SUBMITTED, VOIDED and DELETED are not', () => {
    for (const s of ['AUTHORISED', 'PAID']) expect(isPostedCreditNote({ Status: s })).toBe(true)
    for (const s of ['DRAFT', 'SUBMITTED', 'VOIDED', 'DELETED', '', undefined]) {
      expect(isPostedCreditNote({ Status: s })).toBe(false)
    }

    for (const [type, side] of [['ACCPAYCREDIT', 'expense'], ['ACCRECCREDIT', 'revenue']] as const) {
      const txns = collectAccountTransactions({
        accountCode: '64600',
        side,
        invoices: [],
        bankTransactions: [],
        creditNotes: ['DRAFT', 'SUBMITTED', 'VOIDED', 'DELETED', 'AUTHORISED', 'PAID']
          .map(status => creditNote('Hardware Concepts', 110, 10, '64600', type, status)),
        baseCurrency: 'AUD',
      })
      expect(txns).toHaveLength(2)
      expect(sum(txns)).toBe(-200)
    }
  })

  it('a credit note takes back what its own invoice type put in, and nothing on the other side', () => {
    expect(lineSign('expense', 'credit_note', 'ACCPAYCREDIT')).toBe(-1)
    expect(lineSign('expense', 'credit_note', 'ACCRECCREDIT')).toBe(0)
    expect(lineSign('revenue', 'credit_note', 'ACCRECCREDIT')).toBe(-1)
    expect(lineSign('revenue', 'credit_note', 'ACCPAYCREDIT')).toBe(0)
    expect(lineSign('balance_sheet', 'credit_note', 'ACCPAYCREDIT')).toBe(-1)
    expect(lineSign('balance_sheet', 'credit_note', 'ACCRECCREDIT')).toBe(0)
    expect(lineSign('expense', 'credit_note', undefined)).toBe(0)
  })

  it('a cross-side credit note is left out of the list entirely', () => {
    const txns = collectAccountTransactions({
      accountCode: '41200',
      side: 'revenue',
      invoices: [],
      bankTransactions: [],
      creditNotes: [creditNote('Hardware Concepts', 110, 10, '41200', 'ACCPAYCREDIT')],
      baseCurrency: 'AUD',
    })
    expect(txns).toEqual([])
  })

  it('asks for posted credit notes of one month, both types in one request', () => {
    const where = (url: string) => decodeURIComponent(new URL(url).searchParams.get('where')!)

    const pay = commentaryCreditNotesUrl('2026-08', ['ACCPAYCREDIT'])!
    expect(pay).toContain('/api.xro/2.0/CreditNotes?')
    // The Invoices request's proven shape: no OR, no parentheses, no Status.
    expect(where(pay)).toBe('Type=="ACCPAYCREDIT" AND Date>=DateTime(2026,8,1) AND Date<=DateTime(2026,8,31)')

    // Both types: the date range alone; type and status are checked per document.
    const both = commentaryCreditNotesUrl('2026-08', ['ACCPAYCREDIT', 'ACCRECCREDIT'])!
    expect(where(both)).toBe('Date>=DateTime(2026,8,1) AND Date<=DateTime(2026,8,31)')
    for (const url of [pay, both]) {
      expect(where(url)).not.toMatch(/\bOR\b|Status/)
      expect(where(url).startsWith('(')).toBe(false)
    }

    expect(commentaryCreditNotesUrl('2026-13', ['ACCPAYCREDIT'])).toBeNull()
    expect(commentaryCreditNotesUrl('2026-08', [])).toBeNull()
  })

  it('wants supplier credits wherever bills are, customer credits only for revenue lines', () => {
    expect(creditNoteTypesFor(['expense'])).toEqual(['ACCPAYCREDIT'])
    expect(creditNoteTypesFor(['balance_sheet'])).toEqual(['ACCPAYCREDIT'])
    expect(creditNoteTypesFor(['revenue'])).toEqual(['ACCRECCREDIT'])
    expect(creditNoteTypesFor(['expense', 'revenue'])).toEqual(['ACCPAYCREDIT', 'ACCRECCREDIT'])
    expect(creditNoteTypesFor([])).toEqual([])
  })
})
