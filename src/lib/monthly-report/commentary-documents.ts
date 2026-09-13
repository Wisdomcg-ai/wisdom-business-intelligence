/**
 * Which Xero documents a commentary supplier list is built from, and which way
 * each one points.
 *
 * The commentary quotes suppliers underneath a statement line, so the list has
 * to be made of exactly the documents the ledger posted to that account, signed
 * the way the ledger signed them. Urban Road's August 2026 pack was wrong on
 * both counts, and the two errors were each worth about $800:
 *
 * 1. DOCUMENTS THE LEDGER NEVER POSTED. Freight to Customer (55000) quoted
 *    $51,733 against a P&L of $50,924.95. The extra $807.14 was two Team Global
 *    Express lines with empty descriptions — net 20.47 (2 Aug) and 786.67
 *    (4 Aug) — which are not among TGE's seven AUTHORISED/PAID August bills
 *    ($11,628.61). The route fetched Invoices and BankTransactions filtered on
 *    Date alone, so every DRAFT, SUBMITTED, VOIDED and DELETED document in the
 *    month was quoted as spend. Take the two out and Freight ties to the cent.
 *
 * 2. MONEY RECEIVED SIGNED AS SPEND. Contractors excl. Artists (61400) quoted
 *    $31,830 against $31,029.30. Reena Rosales has two $400 bank lines —
 *    "returned funds from wise" (18 Aug, money IN) and "repayment of returned
 *    funds" (19 Aug, money OUT). `LineAmount` is positive on both, because Xero
 *    states a bank line's amount unsigned and carries the direction in the
 *    transaction's `Type`. Signed from `LineAmount` alone they added to $800;
 *    in the ledger they cancel, and her four PAID bills are the $1,600 she was
 *    actually paid.
 *
 * So: posted documents only, and a sign that comes from the document's type AND
 * the side of the statement the account sits on. A refund received against an
 * expense reduces spend; a refund paid out against revenue reduces income.
 *
 * The `LineAmount` arithmetic itself — tax off in the document's currency, then
 * divide by its own `CurrencyRate` — is `toStatementAmount`'s, untouched. The
 * sign is applied to its result, which is the same number because that
 * arithmetic is linear.
 */

import { extractVendorInfo, createVendorKey } from '@/lib/utils/vendor-normalization'
import { monthRangeWhere } from '@/lib/reconciliation/where-clauses'
import { toStatementAmount, type XeroDocumentMoney, type XeroLineMoney } from './commentary-money'

/**
 * The side of the statement an account is commented on from.
 *
 * `expense` covers both the over-budget and the favourable-expense buckets —
 * the trigger differs, the ledger direction does not.
 */
export type AccountSide = 'expense' | 'revenue' | 'balance_sheet'

export type InvoiceType = 'ACCPAY' | 'ACCREC'

/**
 * An invoice is in the ledger once it is approved. DRAFT and SUBMITTED have
 * not been posted yet; VOIDED and DELETED have been taken back out. Urban
 * Road's two phantom freight lines were a DRAFT and a VOIDED bill.
 */
export const POSTED_INVOICE_STATUSES = ['AUTHORISED', 'PAID'] as const

/**
 * A bank transaction has only two states: AUTHORISED, or DELETED. A deleted one
 * is gone from every report Xero produces, but the API keeps serving it — the
 * same ghost the reconciliation counters met (see `where-clauses.ts`, "THE
 * DELETED TRAP").
 */
export const POSTED_BANK_TRANSACTION_STATUS = 'AUTHORISED'

/** The fields we read off a Xero invoice or bank transaction. */
export interface XeroCommentaryDocument extends XeroDocumentMoney {
  Type?: string | null
  Status?: string | null
  Date?: string | null
  Reference?: string | null
  Contact?: { Name?: string | null } | null
  LineItems?: XeroCommentaryLine[] | null
}

export interface XeroCommentaryLine extends XeroLineMoney {
  AccountCode?: string | null
  Description?: string | null
}

export interface VendorTransaction {
  date: string
  vendor: string
  context: string | null
  /** Signed, in the ORGANISATION's currency, the way the ledger moved the account. */
  amount: number
  type: 'invoice' | 'bank'
  /** False when the source document was foreign and carried no exchange rate. */
  converted?: boolean
  /** The document's currency, when it is not the organisation's. */
  sourceCurrency?: string
}

export interface VendorSummary {
  vendor: string
  amount: number
  transactions: VendorTransaction[]
  converted?: boolean
  sourceCurrency?: string
}

function upper(v: string | null | undefined): string {
  return (v ?? '').trim().toUpperCase()
}

/**
 * Posted, and therefore in the P&L. Checked on every document even though the
 * request already asks Xero for these statuses: a filter the API ignores or
 * mis-parses must not be the only thing between a draft and the client's pack.
 */
export function isPostedInvoice(inv: XeroCommentaryDocument): boolean {
  return (POSTED_INVOICE_STATUSES as readonly string[]).includes(upper(inv.Status))
}

export function isPostedBankTransaction(bt: XeroCommentaryDocument): boolean {
  return upper(bt.Status) === POSTED_BANK_TRANSACTION_STATUS
}

/**
 * The Invoices request for one month of one document type, posted only.
 *
 * Scoped by Type because the unscoped fetch was pulling SALES invoices to
 * explain expense accounts, and the pager stops at 1,000 documents. Urban Road
 * raised 620 sales invoices against 131 bills in August 2026, and 1,142 sales
 * invoices in November 2025 alone — every bill past the cap was dropped
 * without a word.
 *
 * `monthRangeWhere` is the shared whole-month clause. Its neighbour
 * `UNRECONCILED_AUTHORISED` is not reusable here: it also requires
 * `IsReconciled==false`, which would throw away almost every real payment.
 */
export function commentaryInvoicesUrl(month: string, type: InvoiceType): string | null {
  const range = monthRangeWhere(month)
  if (!range) return null
  const where = `Type=="${type}" AND ${range}`
  return `https://api.xero.com/api.xro/2.0/Invoices?where=${encodeURIComponent(where)}&Statuses=${POSTED_INVOICE_STATUSES.join(',')}`
}

/** The BankTransactions request for one month, posted only. */
export function commentaryBankTransactionsUrl(month: string): string | null {
  const range = monthRangeWhere(month)
  if (!range) return null
  const where = `Status=="${POSTED_BANK_TRANSACTION_STATUS}" AND ${range}`
  return `https://api.xero.com/api.xro/2.0/BankTransactions?where=${encodeURIComponent(where)}`
}

/**
 * Which invoice types a set of commented accounts needs.
 *
 * Bills explain expense accounts (and balance-sheet ones, as before); sales
 * invoices are fetched only when a revenue line is being commented on, because
 * they outnumber bills several times over and explain nothing else.
 */
export function invoiceTypesFor(sides: Iterable<AccountSide>): InvoiceType[] {
  const s = new Set(sides)
  const types: InvoiceType[] = []
  if (s.has('expense') || s.has('balance_sheet')) types.push('ACCPAY')
  if (s.has('revenue')) types.push('ACCREC')
  return types
}

/**
 * +1, -1, or 0 — how one document's line moves an account on this side of the
 * statement. 0 means the document does not belong in this account's list.
 *
 * Expense side: a bill and money spent are spend (+); money received is a
 * refund and reduces it (−).
 * Revenue side: a sales invoice and money received are income (+); money paid
 * out is a refund and reduces it (−).
 *
 * Invoices are matched to a side by type rather than signed across sides. Only
 * bills are fetched for an expense account and only sales invoices for a
 * revenue one, so a sales invoice coded to an expense account would be counted
 * or not depending on whether some unrelated revenue line happened to trigger
 * the sales fetch. A list that changes with the rest of the page is worse than
 * one that consistently leaves the rare cross-coded document out — and leaving
 * a document out only ever under-quotes, which is the side the vendors-exceed
 * guard tolerates.
 *
 * A bank type we do not recognise is left out for the same reason: we cannot
 * tell which way it points, and guessing is how the Contractors list doubled
 * Reena Rosales's refund.
 *
 * Balance sheet: out of scope. A balance-sheet account's polarity depends on
 * whether it is an asset or a liability, which this route is not told, so its
 * lines keep the sign `LineAmount` gives them, exactly as before this change.
 * Only the posted-status filter and the bills-only invoice scope apply.
 */
export function lineSign(
  side: AccountSide,
  kind: 'invoice' | 'bank',
  type: string | null | undefined,
): 1 | -1 | 0 {
  const t = upper(type)

  if (kind === 'invoice') {
    if (side === 'revenue') return t === 'ACCREC' ? 1 : 0
    return t === 'ACCPAY' ? 1 : 0
  }

  const isSpend = t.startsWith('SPEND')
  const isReceive = t.startsWith('RECEIVE')

  if (side === 'balance_sheet') return 1
  if (!isSpend && !isReceive) return 0
  if (side === 'expense') return isSpend ? 1 : -1
  return isReceive ? 1 : -1
}

/** Xero's `/Date(1754092800000+0000)/` as `YYYY-MM-DD`, or '' when absent. */
function xeroDate(raw: string | null | undefined): string {
  if (!raw) return ''
  const ms = parseInt(raw.replace('/Date(', '').replace(')/', '').split('+')[0])
  return Number.isFinite(ms) ? new Date(ms).toISOString().split('T')[0] : ''
}

/**
 * Every posted line coded to one account, signed for its side, in the
 * organisation's currency.
 */
export function collectAccountTransactions(input: {
  accountCode: string
  side: AccountSide
  invoices: readonly XeroCommentaryDocument[]
  bankTransactions: readonly XeroCommentaryDocument[]
  baseCurrency: string | null
}): VendorTransaction[] {
  const { accountCode, side, invoices, bankTransactions, baseCurrency } = input
  const out: VendorTransaction[] = []

  const take = (doc: XeroCommentaryDocument, kind: 'invoice' | 'bank') => {
    const sign = lineSign(side, kind, doc.Type)
    if (sign === 0) return
    const contactName = doc.Contact?.Name || ''
    const date = xeroDate(doc.Date)
    for (const li of doc.LineItems || []) {
      if (li.AccountCode !== accountCode) continue
      const description = kind === 'bank'
        ? li.Description || doc.Reference || ''
        : li.Description || ''
      const info = extractVendorInfo(contactName, description)
      const converted = toStatementAmount(li, doc, baseCurrency)
      out.push({
        date,
        vendor: info.vendor,
        context: info.context,
        // `|| 0` keeps a zero line from becoming -0.
        amount: sign * converted.amount || 0,
        type: kind,
        converted: converted.converted,
        sourceCurrency: converted.sourceCurrency,
      })
    }
  }

  for (const inv of invoices) {
    if (isPostedInvoice(inv)) take(inv, 'invoice')
  }
  for (const bt of bankTransactions) {
    if (isPostedBankTransaction(bt)) take(bt, 'bank')
  }

  return out
}

/** Below this, a supplier is rolled into "Others". */
export const OTHERS_THRESHOLD = 100

/**
 * Group an account's transactions by supplier, largest first, with the small
 * ones rolled into "Others".
 *
 * Keyed by `createVendorKey` (B2, Phase 71-01) so a budgeted vendor ("Stripe
 * Au") matches an extracted Xero vendor ("STRIPE AU"); the first display name
 * seen is the one printed.
 */
export function summariseVendors(transactions: readonly VendorTransaction[]): VendorSummary[] {
  const vendorData = new Map<string, { display_name: string; total: number; transactions: VendorTransaction[]; converted?: boolean; sourceCurrency?: string }>()

  // A vendor's total EXCLUDES any line we could not convert: a foreign amount
  // added to a dollar total is not a total, it is a wrong number that looks
  // right. The unconvertible line still rides along on `transactions` so the
  // coach can see it and chase the rate.
  for (const txn of transactions) {
    const key = createVendorKey(txn.vendor)
    const contribution = txn.converted === false ? 0 : txn.amount
    const existing = vendorData.get(key)
    if (existing) {
      existing.total += contribution
      existing.transactions.push(txn)
      if (txn.converted === false) {
        existing.converted = false
        existing.sourceCurrency = existing.sourceCurrency ?? txn.sourceCurrency
      }
    } else {
      vendorData.set(key, {
        display_name: txn.vendor,
        total: contribution,
        transactions: [txn],
        ...(txn.converted === false
          ? { converted: false, sourceCurrency: txn.sourceCurrency }
          : {}),
      })
    }
  }

  const sorted = Array.from(vendorData.values())
    .map(data => ({
      vendor: data.display_name,
      amount: Math.round(data.total),
      transactions: data.transactions.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)),
      ...(data.converted === false
        ? { converted: false, sourceCurrency: data.sourceCurrency }
        : {}),
    }))
    // Largest FIRST by magnitude — a $1,571 credit is a bigger part of the
    // story than a $200 charge, and sorting on the signed value would bury
    // every credit at the bottom under the rollup.
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))

  const significant: VendorSummary[] = []
  let othersTotal = 0
  const othersTransactions: VendorTransaction[] = []

  for (const entry of sorted) {
    // Magnitude, not signed value. On the signed test every credit is below
    // the floor, so it would be swallowed into "Others" — where it silently
    // reduces a total the reader takes for charges, and the explanatory
    // "less X credit" is lost.
    if (Math.abs(entry.amount) >= OTHERS_THRESHOLD || entry.converted === false) {
      significant.push(entry)
    } else {
      othersTotal += entry.amount
      othersTransactions.push(...entry.transactions)
    }
  }

  // Non-zero, not positive. This used to read `othersTotal > 0`, which was
  // harmless while every line was signed as spend and became a silent drop the
  // moment refunds were signed as refunds: a remainder of small credits would
  // vanish, and the list would stop summing to what it quotes. A remainder
  // that nets to nothing says nothing and stays out.
  if (othersTotal !== 0) {
    significant.push({ vendor: 'Others', amount: othersTotal, transactions: othersTransactions })
  }

  return significant
}
