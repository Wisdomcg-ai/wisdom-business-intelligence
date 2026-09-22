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
 * Which money a line is quoted in is where they part again:
 *
 * - Step 6 keeps the document's gross `LineAmount`, as it has always quoted it
 *   and as the active subscription budgets were seeded. Moving it re-bases
 *   those budgets, which is a separate change.
 * - The report route reads `subscriptionStatementLinesOf`, which carries both:
 *   the gross amount every client's page still prints (against those same
 *   gross budgets), and the P&L's basis — net of GST, in the organisation's
 *   currency (the commentary's `toStatementAmount`) — for a placement that
 *   opts in to a TOTAL row that is the P&L account. Vendor rows in any other
 *   money cannot add up to that: Urban Road's August 2026 IT Costs Software
 *   rows summed $15,397 under a $14,726 total, Edi Cloud's bill quoted at
 *   $1,125 where the ledger posted $1,022.73 and Cloudflare in US dollars.
 */

import { toStatementAmount } from '@/lib/monthly-report/commentary-money'
import {
  postedLineSign,
  type XeroCommentaryDocument,
  type XeroCommentaryLine,
} from '@/lib/monthly-report/commentary-documents'

export interface SubscriptionLine {
  accountCode: string
  contactName: string
  description: string
  /**
   * Signed: + spend, − refund or credit line. The document's own currency,
   * gross — except from subscriptionStatementLinesOf, where it is the P&L's
   * money (see `grossAmount` and `converted` there).
   */
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

/** A report-page line: the statement amount, and what it was before. */
export interface StatementSubscriptionLine extends SubscriptionLine {
  /** Signed, the document's own currency, tax included when it was — Step 6's figure. */
  grossAmount: number
  /**
   * False when the document is foreign and carries no usable CurrencyRate.
   * `amount` is then 0: a foreign figure printed as dollars is the failure
   * toStatementAmount exists to prevent, so the caller must say the line was
   * left out rather than add it.
   */
  converted: boolean
  /** The document's currency, when it is not the organisation's. */
  sourceCurrency?: string
  /** Present when `converted` is false. */
  reason?: string
}

/**
 * subscriptionLinesOf's lines, each restated in the money the P&L is stated in:
 * GST off an Inclusive line, then divided by the document's own CurrencyRate.
 * The same arithmetic, in the same order, as the commentary's supplier lists —
 * so the report page and the commentary quote a vendor identically.
 *
 * `baseCurrency` is xero_connections.functional_currency; unknown is tolerated
 * the way toBaseAmount tolerates it.
 */
export function subscriptionStatementLinesOf(
  doc: SubscriptionDocument,
  kind: 'invoice' | 'bank',
  accountCodes: ReadonlySet<string>,
  baseCurrency: string | null | undefined,
): StatementSubscriptionLine[] {
  const sign = postedLineSign(doc, kind, 'expense')
  const lines = linesOf(doc, kind, accountCodes, sign)
  if (lines.length === 0) return []
  // linesOf keeps LineItems order and skips only other accounts, so walk the
  // same filter to pair each line with the item it came from.
  const items = (doc.LineItems || []).filter((li) => !!li.AccountCode && accountCodes.has(li.AccountCode))
  return lines.map((line, i) => {
    const stated = toStatementAmount(items[i], doc, baseCurrency)
    return {
      ...line,
      grossAmount: line.amount,
      amount: stated.converted ? sign * stated.amount || 0 : 0,
      converted: stated.converted,
      ...(stated.sourceCurrency ? { sourceCurrency: stated.sourceCurrency } : {}),
      ...(stated.reason ? { reason: stated.reason } : {}),
    }
  })
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
