/**
 * Which Xero lines a subscription or contractor figure is built from.
 *
 * Fixtures are shaped on Urban Road's real documents: the Edi Cloud bill that
 * is in the August 2026 subscription rows, Reena Rosales's August 2026
 * contractor payments (Calxa: $1,600), and Issuu's January charge and February
 * refund (Calxa March 2026 pack: −$3,258 in February).
 */

import { describe, it, expect } from 'vitest'
import { subscriptionChargeLinesOf, subscriptionLinesOf, type SubscriptionDocument } from '../posted-subscription-lines'

const IT_SOFTWARE = new Set(['63700'])
const CONTRACTORS = new Set(['61400'])

/** Xero's wire date for a YYYY-MM-DD. */
const xeroDate = (d: string) => `/Date(${Date.parse(`${d}T00:00:00Z`)}+0000)/`

function ediCloud(status: string): SubscriptionDocument {
  return {
    InvoiceID: 'fa73d1a9-9752-4dcc-b7a8-04d451b77b45',
    InvoiceNumber: 'CL007500',
    Type: 'ACCPAY',
    Status: status,
    LineAmountTypes: 'Inclusive',
    CurrencyCode: 'AUD',
    Date: xeroDate('2026-08-12'),
    Contact: { Name: 'Harvey Norman' },
    LineItems: [{
      LineItemID: 'li-edi-1',
      AccountCode: '63700',
      LineAmount: 1125,
      TaxAmount: 102.27,
      Description: 'Yearly EDi Cloud Access\nVendor Number 300405 trading with Harvey Norman (0) = $960.00',
    }],
  }
}

function reenaBill(n: number, description: string, day: string): SubscriptionDocument {
  return {
    InvoiceID: `reena-bill-${n}`,
    InvoiceNumber: `UR-RR008${n}`,
    Type: 'ACCPAY',
    Status: 'PAID',
    Date: xeroDate(day),
    Contact: { Name: 'Reena Rosales' },
    LineItems: [{ AccountCode: '61400', LineAmount: 400, Description: description }],
  }
}

function reenaBank(type: string, status: string, description: string, day: string, id: string): SubscriptionDocument {
  return {
    BankTransactionID: id,
    Type: type,
    Status: status,
    Date: xeroDate(day),
    Reference: '',
    Contact: { Name: 'Reena Rosales' },
    LineItems: [{ AccountCode: '61400', LineAmount: 400, Description: description }],
  }
}

describe('subscriptionLinesOf — posted documents only', () => {
  it('an AUTHORISED bill counts at its gross line amount', () => {
    const lines = subscriptionLinesOf(ediCloud('AUTHORISED'), 'invoice', IT_SOFTWARE)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({
      accountCode: '63700',
      amount: 1125,
      kind: 'invoice',
      documentId: 'fa73d1a9-9752-4dcc-b7a8-04d451b77b45',
      lineItemId: 'li-edi-1',
      reference: 'CL007500',
      contactName: 'Harvey Norman',
      date: '2026-08-12',
    })
  })

  it.each(['DRAFT', 'SUBMITTED', 'VOIDED', 'DELETED'])('the same bill %s is not in the ledger and yields nothing', (status) => {
    expect(subscriptionLinesOf(ediCloud(status), 'invoice', IT_SOFTWARE)).toEqual([])
  })

  it('Reena Rosales, August 2026: four PAID bills and a cancelling bank pair make $1,600, as Calxa prints', () => {
    const docs: [SubscriptionDocument, 'invoice' | 'bank'][] = [
      [reenaBill(2, '3-7 Aug 26', '2026-08-08'), 'invoice'],
      [reenaBill(3, '10-14 August 26', '2026-08-15'), 'invoice'],
      [reenaBill(4, '17-20th August 26', '2026-08-21'), 'invoice'],
      [reenaBill(5, '24-28 August 26', '2026-08-29'), 'invoice'],
      [reenaBank('RECEIVE', 'AUTHORISED', 'Renna returned funds from wise, repaid 19/8/26', '2026-08-18', 'bt-in'), 'bank'],
      [reenaBank('SPEND', 'AUTHORISED', 'repayment of returned funds', '2026-08-19', 'bt-out'), 'bank'],
      [reenaBank('SPEND', 'DELETED', 'repayment of returned funds', '2026-08-19', 'bt-deleted'), 'bank'],
    ]
    const lines = docs.flatMap(([d, kind]) => subscriptionLinesOf(d, kind, CONTRACTORS))

    expect(lines.filter(l => l.kind === 'invoice').map(l => l.amount)).toEqual([400, 400, 400, 400])
    const received = lines.find(l => l.documentId === 'bt-in')!
    expect(received.amount).toBe(-400)
    expect(lines.find(l => l.documentId === 'bt-out')!.amount).toBe(400)
    expect(lines.find(l => l.documentId === 'bt-deleted')).toBeUndefined()

    expect(lines).toHaveLength(6)
    expect(lines.reduce((s, l) => s + l.amount, 0)).toBe(1600)
  })

  it('Issuu: the January charge counts up and the February refund received counts down', () => {
    const charge: SubscriptionDocument = {
      BankTransactionID: 'issuu-jan', Type: 'SPEND', Status: 'AUTHORISED', Date: xeroDate('2026-01-15'),
      Reference: 'ISSUU', Contact: { Name: 'Issuu' },
      LineItems: [{ AccountCode: '63700', LineAmount: 3279.14, Description: '' }],
    }
    const refund: SubscriptionDocument = {
      ...charge, BankTransactionID: 'issuu-feb', Type: 'RECEIVE', Date: xeroDate('2026-02-10'),
      LineItems: [{ AccountCode: '63700', LineAmount: 3258, Description: '' }],
    }
    const [c] = subscriptionLinesOf(charge, 'bank', IT_SOFTWARE)
    const [r] = subscriptionLinesOf(refund, 'bank', IT_SOFTWARE)
    expect(c.amount).toBe(3279.14)
    expect(r.amount).toBe(-3258)
    // A bank line with no description is named from its reference, as before.
    expect(c.description).toBe('ISSUU')
  })

  it('a sales invoice coded to an expense account, and a bank type we cannot read, are left out', () => {
    const sales: SubscriptionDocument = { ...ediCloud('AUTHORISED'), Type: 'ACCREC' }
    const odd: SubscriptionDocument = {
      BankTransactionID: 'odd', Type: 'TRANSFER', Status: 'AUTHORISED',
      LineItems: [{ AccountCode: '63700', LineAmount: 50 }],
    }
    expect(subscriptionLinesOf(sales, 'invoice', IT_SOFTWARE)).toEqual([])
    expect(subscriptionLinesOf(odd, 'bank', IT_SOFTWARE)).toEqual([])
  })

  it('a line on an account outside the selection is excluded', () => {
    const doc: SubscriptionDocument = {
      ...ediCloud('AUTHORISED'),
      LineItems: [
        { AccountCode: '55000', LineAmount: 786.67, Description: 'freight' },
        { AccountCode: '63700', LineAmount: 1125, Description: 'software' },
      ],
    }
    const lines = subscriptionLinesOf(doc, 'invoice', IT_SOFTWARE)
    expect(lines.map(l => l.accountCode)).toEqual(['63700'])
  })
})

/**
 * Step 6's reader. Posted charges only — the refund is left out, not netted,
 * because Step 6 reads a price and a cadence from these lines and nothing yet
 * matches a refund to the charge it reverses.
 */
describe('subscriptionChargeLinesOf — posted charges only, for the forecast wizard', () => {
  const bank = (Type: string, Status: string, LineAmount: number): SubscriptionDocument => ({
    BankTransactionID: `bt-${Type}-${Status}`, Type, Status, Date: xeroDate('2026-01-15'),
    Reference: 'ISSUU', Contact: { Name: 'Issuu' },
    LineItems: [{ AccountCode: '63700', LineAmount, Description: '' }],
  })

  it('a posted SPEND counts at its line amount, named from its reference when it has no description', () => {
    const [line] = subscriptionChargeLinesOf(bank('SPEND', 'AUTHORISED', 3279.14), 'bank', IT_SOFTWARE)
    expect(line.amount).toBe(3279.14)
    expect(line.description).toBe('ISSUU')
  })

  it.each(['RECEIVE', 'RECEIVE-OVERPAYMENT', 'SPEND-PREPAYMENT', 'SPEND-OVERPAYMENT', 'TRANSFER'])(
    'a posted %s is not a charge and yields nothing',
    (type) => {
      expect(subscriptionChargeLinesOf(bank(type, 'AUTHORISED', 3258), 'bank', IT_SOFTWARE)).toEqual([])
    },
  )

  it('a DELETED spend yields nothing', () => {
    expect(subscriptionChargeLinesOf(bank('SPEND', 'DELETED', 1464.53), 'bank', IT_SOFTWARE)).toEqual([])
  })

  it.each(['DRAFT', 'SUBMITTED', 'VOIDED', 'DELETED'])('a %s bill yields nothing', (status) => {
    expect(subscriptionChargeLinesOf(ediCloud(status), 'invoice', IT_SOFTWARE)).toEqual([])
  })

  it('a posted bill counts, and a negative line on it keeps its sign', () => {
    const doc: SubscriptionDocument = {
      ...ediCloud('PAID'),
      LineItems: [
        { LineItemID: 'l1', AccountCode: '63700', LineAmount: 1125, Description: 'software' },
        { LineItemID: 'l2', AccountCode: '63700', LineAmount: -125, Description: 'loyalty credit' },
        { LineItemID: 'l3', AccountCode: '55000', LineAmount: 786.67, Description: 'freight' },
      ],
    }
    expect(subscriptionChargeLinesOf(doc, 'invoice', IT_SOFTWARE).map(l => l.amount)).toEqual([1125, -125])
  })

  it('Reena Rosales, August 2026: the charges alone — the bills and the repayment, not the returned funds', () => {
    const lines = [
      ...subscriptionChargeLinesOf(reenaBill(2, '3-7 Aug 26', '2026-08-08'), 'invoice', CONTRACTORS),
      ...subscriptionChargeLinesOf(reenaBank('RECEIVE', 'AUTHORISED', 'Renna returned funds from wise, repaid 19/8/26', '2026-08-18', 'bt-in'), 'bank', CONTRACTORS),
      ...subscriptionChargeLinesOf(reenaBank('SPEND', 'AUTHORISED', 'repayment of returned funds', '2026-08-19', 'bt-out'), 'bank', CONTRACTORS),
    ]
    expect(lines.map(l => l.amount)).toEqual([400, 400])
    expect(lines.find(l => l.documentId === 'bt-in')).toBeUndefined()
  })
})
