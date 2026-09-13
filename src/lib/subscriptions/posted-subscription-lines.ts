/**
 * The Xero lines a subscription (or contractor) figure is built from, and which
 * way each one points.
 *
 * Two readers build vendor actuals from live Xero documents: the monthly
 * report's subscription page (also the Contractor Analysis page) and the
 * forecast wizard's Step 6 crawl, which writes `subscription_budgets` and the
 * vendor-month history. Both asked Xero for bills by Type and Date alone and
 * added every line's `LineAmount`, so both quoted documents the ledger never
 * posted:
 *
 * - A DRAFT or VOIDED bill is returned by a request with no `Statuses` — the
 *   route comment saying "Xero excludes DELETED and VOIDED by default" was
 *   wrong, and Urban Road's August 2026 commentary proved it with two Team
 *   Global Express bills that never posted.
 *
 * Posted documents only is the rule for both. Refunds are where they part:
 *
 * - The report page reports what the ledger posted, so it nets refunds in
 *   (`subscriptionLinesOf`). Reena Rosales (Contractors, 61400) was paid $1,600
 *   in August 2026 — four PAID $400 bills — and her $400 "returned funds" and
 *   $400 "repayment" bank lines cancel in the ledger; summed unsigned and
 *   unfiltered they made $2,000 or $2,400. Issuu charged Urban Road $3,279.14
 *   in January 2026 and Calxa shows it refunded (−$3,258) in February.
 * - Step 6 derives a price, a cadence and an opening budget from charges, and
 *   reads charges only (`subscriptionChargeLinesOf`), as it always has. A
 *   refund cannot be netted into those until it is matched to the charge it
 *   reverses; netted by month, a refunded $500 trial became a $500/month
 *   budget. See the bank fetch in `api/Xero/subscription-transactions`.
 *
 * The posted check and the signs are the commentary's (#516), not a second
 * copy of them.
 *
 * The amount stays the document's gross `LineAmount`, as both readers have
 * always quoted it (and as the active budgets were seeded). Moving to the
 * P&L's net-of-GST, organisation-currency basis (`toStatementAmount`) is a
 * separate change, because it re-bases those budgets.
 */

import {
  postedLineSign,
  type XeroCommentaryDocument,
  type XeroCommentaryLine,
} from '@/lib/monthly-report/commentary-documents'

export interface SubscriptionLine {
  accountCode: string
  contactName: string
  description: string
  /** Signed: + spend, − refund or credit line. The document's own currency, gross. */
  amount: number
  kind: 'invoice' | 'bank'
  documentId: string
  lineItemId: string | null
  /** YYYY-MM-DD, or '' when the document carries no date. */
  date: string
  reference: string
}

export type SubscriptionDocument = XeroCommentaryDocument & {
  InvoiceID?: string | null
  BankTransactionID?: string | null
  InvoiceNumber?: string | null
  LineItems?: (XeroCommentaryLine & { LineItemID?: string | null })[] | null
}

/** Xero's `/Date(1754092800000+0000)/` (or an ISO string) as `YYYY-MM-DD`. */
function xeroDay(raw: string | null | undefined): string {
  if (!raw) return ''
  const m = /\/Date\((-?\d+)/.exec(raw)
  const d = m ? new Date(Number(m[1])) : new Date(raw)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

/**
 * Every posted line of one document coded to one of `accountCodes`, signed.
 * An unposted document, or one whose type does not belong on the expense side,
 * yields nothing. The monthly report's reader: refunds come off.
 */
export function subscriptionLinesOf(
  doc: SubscriptionDocument,
  kind: 'invoice' | 'bank',
  accountCodes: ReadonlySet<string>,
): SubscriptionLine[] {
  return linesOf(doc, kind, accountCodes, postedLineSign(doc, kind, 'expense'))
}

/**
 * Every posted CHARGE line of one document coded to one of `accountCodes` —
 * the forecast wizard's Step 6 reader.
 *
 * Exactly the documents Step 6 has always counted, less the unposted ones: a
 * bill (`ACCPAY`) and a plain `SPEND`. Not a refund received, and not the
 * prepayment and overpayment types, which Step 6 never asked for. A line keeps
 * the sign Xero gives it, as it always has, so a negative line on a bill still
 * comes off that bill.
 */
export function subscriptionChargeLinesOf(
  doc: SubscriptionDocument,
  kind: 'invoice' | 'bank',
  accountCodes: ReadonlySet<string>,
): SubscriptionLine[] {
  const posted = postedLineSign(doc, kind, 'expense') === 1
  const type = (doc.Type ?? '').trim().toUpperCase()
  const charge = kind === 'invoice' ? type === 'ACCPAY' : type === 'SPEND'
  return linesOf(doc, kind, accountCodes, posted && charge ? 1 : 0)
}

function linesOf(
  doc: SubscriptionDocument,
  kind: 'invoice' | 'bank',
  accountCodes: ReadonlySet<string>,
  sign: 1 | -1 | 0,
): SubscriptionLine[] {
  if (sign === 0) return []

  const contactName = doc.Contact?.Name || ''
  const documentId = (kind === 'invoice' ? doc.InvoiceID : doc.BankTransactionID) || ''
  const reference = (kind === 'invoice' ? doc.InvoiceNumber : doc.Reference) || ''
  const date = xeroDay(doc.Date)

  const out: SubscriptionLine[] = []
  for (const li of doc.LineItems || []) {
    const code = li.AccountCode
    if (!code || !accountCodes.has(code)) continue
    out.push({
      accountCode: code,
      contactName,
      description: kind === 'bank'
        ? li.Description || doc.Reference || ''
        : li.Description || '',
      // `|| 0` keeps a zero line from becoming -0, and a non-numeric one from NaN.
      amount: sign * Number(li.LineAmount ?? 0) || 0,
      kind,
      documentId,
      lineItemId: li.LineItemID ?? null,
      date,
      reference,
    })
  }
  return out
}
