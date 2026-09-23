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
 * 3. CREDIT NOTES THE ROUTE NEVER ASKED FOR. With both of those fixed, the same
 *    pack still refused Rolled Prints (41200): its 47 posted sales-invoice lines
 *    come to $4,178.56 and Xero's accrual P&L says $3,221.53. The $957.03
 *    between them is credit, not error — Urban Road's Zoho integration raises
 *    about thirty ACCRECCREDITs a month (replacement orders, Freedom Furniture
 *    marketplace reversals) and they post to the same revenue accounts the
 *    invoices do. The route fetched Invoices and BankTransactions and never
 *    CreditNotes, so every list stood gross of its credits: Rolled Prints and
 *    Framed Prints (41600, at least $2,476 over) were refused, and Shipping
 *    (44000) printed $186 over its account, just inside the tolerance. The
 *    supplier side has them too — Hardware Concepts' $2,200 credit against a
 *    Marketing Digital Ad Spend bill. A credit note is fetched now, and signed
 *    against its own side: it takes back what the matching invoice type put in.
 *
 * The `LineAmount` arithmetic itself — tax off in the document's currency, then
 * divide by its own `CurrencyRate` — is `toStatementAmount`'s, untouched. The
 * sign is applied to its result, which is the same number because that
 * arithmetic is linear.
 */

import { extractVendorInfo, createVendorKey, vendorCompanyName } from '@/lib/utils/vendor-normalization'
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

/** A supplier credit note (against bills) or a customer one (against sales). */
export type CreditNoteType = 'ACCPAYCREDIT' | 'ACCRECCREDIT'

/** Which kind of Xero document a line came from. */
export type CommentaryDocumentKind = 'invoice' | 'bank' | 'credit_note'

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

/**
 * A credit note follows the invoice lifecycle: DRAFT and SUBMITTED are not yet
 * in the ledger, VOIDED and DELETED have been taken back out. PAID is a credit
 * note that has been fully allocated or refunded — still posted, and still
 * reducing the account on the date it carries.
 */
export const POSTED_CREDIT_NOTE_STATUSES = ['AUTHORISED', 'PAID'] as const

/** The fields we read off a Xero invoice, credit note or bank transaction. */
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
  type: CommentaryDocumentKind
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
 * Posted, and therefore in the P&L. The same test as `isPostedInvoice`, kept
 * under its own name so a change to one document's lifecycle cannot quietly
 * move the other. This is the ONLY status guard: the CreditNotes request does
 * not filter on Status (see `commentaryCreditNotesUrl`), so drafts and voids
 * arrive on the page and stop here.
 */
export function isPostedCreditNote(cn: XeroCommentaryDocument): boolean {
  return (POSTED_CREDIT_NOTE_STATUSES as readonly string[]).includes(upper(cn.Status))
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
  return postedInvoicesUrl(`Type=="${type}" AND ${range}`)
}

/** The BankTransactions request for one month, posted only. */
export function commentaryBankTransactionsUrl(month: string): string | null {
  const range = monthRangeWhere(month)
  if (!range) return null
  return postedBankTransactionsUrl(range)
}

/**
 * An Invoices request for any where-clause, posted documents only.
 *
 * Shared with the subscription page and the forecast wizard's Step 6 crawl,
 * which asked for bills by Type and Date alone on the belief that "Xero
 * excludes DELETED and VOIDED by default". It does not: the two Team Global
 * Express lines above — a DRAFT and a VOIDED bill — came back from exactly
 * that request.
 */
export function postedInvoicesUrl(where: string): string {
  return `https://api.xero.com/api.xro/2.0/Invoices?where=${encodeURIComponent(where)}&Statuses=${POSTED_INVOICE_STATUSES.join(',')}`
}

/**
 * A BankTransactions request for any where-clause, posted only.
 *
 * No Type filter. Money received against an expense account is a refund, and
 * the monthly report's subscription page asked for `Type=="SPEND"` only.
 * Urban Road's Issuu charged $3,279.14 in January 2026 (by bank, it has no
 * bills) and Calxa shows −$3,258 against it in February; the page quoted the
 * charge and never the refund.
 *
 * Not used by the forecast wizard's Step 6 crawl, which reads charges only
 * until a refund can be matched to the charge it reverses — see the bank fetch
 * in `api/Xero/subscription-transactions`.
 */
export function postedBankTransactionsUrl(where: string): string {
  const posted = `Status=="${POSTED_BANK_TRANSACTION_STATUS}" AND ${where}`
  return `https://api.xero.com/api.xro/2.0/BankTransactions?where=${encodeURIComponent(posted)}`
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
 * The CreditNotes request for one month. Every status comes back, and with
 * both types wanted both types do too; the posted, same-side ones are picked
 * out per document.
 *
 * One request for both types rather than one per type, unlike Invoices. Credit
 * notes are few — Urban Road, the heaviest user in the fleet, raises about
 * thirty a month — so both types fit on one page, and a fourth concurrent call
 * rather than a fifth keeps the route under Xero's five-concurrent-per-tenant
 * limit.
 *
 * The `where` clause uses only the shape the Invoices request already proves
 * against live Xero — `Type=="X" AND <date range>` — or the date range alone
 * when both types are wanted. No code in this repo had sent Xero an OR or a
 * parenthesis, and a clause Xero rejects fails as an empty list, which would
 * quietly put every commentary list back to gross of credits. Status and type
 * are enforced per document instead: `isPostedCreditNote` drops drafts and
 * voids, and `lineSign` gives a credit note of the other side a 0. Unposted
 * credit notes cost a few extra rows on a page, nothing more.
 */
export function commentaryCreditNotesUrl(month: string, types: readonly CreditNoteType[]): string | null {
  const range = monthRangeWhere(month)
  if (!range || types.length === 0) return null
  const where = types.length === 1 ? `Type=="${types[0]}" AND ${range}` : range
  return `https://api.xero.com/api.xro/2.0/CreditNotes?where=${encodeURIComponent(where)}`
}

/**
 * Which credit-note types a set of commented accounts needs — the mirror of
 * `invoiceTypesFor`. A supplier credit takes back a bill, so it is wanted
 * wherever bills are; a customer credit takes back a sales invoice.
 */
export function creditNoteTypesFor(sides: Iterable<AccountSide>): CreditNoteType[] {
  const s = new Set(sides)
  const types: CreditNoteType[] = []
  if (s.has('expense') || s.has('balance_sheet')) types.push('ACCPAYCREDIT')
  if (s.has('revenue')) types.push('ACCRECCREDIT')
  return types
}

/**
 * +1, -1, or 0 — how one document's line moves an account on this side of the
 * statement. 0 means the document does not belong in this account's list.
 *
 * Expense side: a bill and money spent are spend (+); money received is a
 * refund and reduces it (−), and so does a supplier credit note (ACCPAYCREDIT).
 * Revenue side: a sales invoice and money received are income (+); money paid
 * out is a refund and reduces it (−), and so does a customer credit note
 * (ACCRECCREDIT).
 *
 * A credit note's `LineAmount` is positive, exactly like the invoice it takes
 * back — Xero carries the direction in the document's Type, as it does for bank
 * lines — so the minus comes from here and nowhere else. Signed from
 * `LineAmount` alone, Urban Road's August customer credits would have ADDED
 * $957.03 to Rolled Prints instead of taking it off.
 *
 * Invoices are matched to a side by type rather than signed across sides. Only
 * bills are fetched for an expense account and only sales invoices for a
 * revenue one, so a sales invoice coded to an expense account would be counted
 * or not depending on whether some unrelated revenue line happened to trigger
 * the sales fetch. A list that changes with the rest of the page is worse than
 * one that consistently leaves the rare cross-coded document out — and leaving
 * a document out only ever under-quotes, which is the side the vendors-exceed
 * guard tolerates. Credit notes follow the same rule: an ACCRECCREDIT coded to
 * an expense account, or an ACCPAYCREDIT to a revenue one, is left out.
 *
 * A bank type we do not recognise is left out for the same reason: we cannot
 * tell which way it points, and guessing is how the Contractors list doubled
 * Reena Rosales's refund.
 *
 * Balance sheet: out of scope. A balance-sheet account's polarity depends on
 * whether it is an asset or a liability, which this route is not told, so its
 * lines keep the sign `LineAmount` gives them, exactly as before this change.
 * Only the posted-status filter and the bills-only invoice scope apply. The one
 * exception is a supplier credit note, which is signed against the bill it
 * takes back (−1 where the bill is +1): whatever a bill does to the account, its
 * credit undoes, whether the account is an asset or a liability. Leaving it at
 * +1 would count a credit as a second bill.
 */
export function lineSign(
  side: AccountSide,
  kind: CommentaryDocumentKind,
  type: string | null | undefined,
): 1 | -1 | 0 {
  const t = upper(type)

  if (kind === 'credit_note') {
    if (side === 'revenue') return t === 'ACCRECCREDIT' ? -1 : 0
    return t === 'ACCPAYCREDIT' ? -1 : 0
  }

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

/**
 * The whole rule in one call: 0 for a document the ledger never posted,
 * otherwise `lineSign`. The commentary, the subscription page and the wizard's
 * Step 6 crawl all go through this, so a draft cannot be left out in one place
 * and quoted in another.
 */
export function postedLineSign(
  doc: XeroCommentaryDocument,
  kind: CommentaryDocumentKind,
  side: AccountSide,
): 1 | -1 | 0 {
  const posted =
    kind === 'invoice' ? isPostedInvoice(doc)
    : kind === 'bank' ? isPostedBankTransaction(doc)
    : isPostedCreditNote(doc)
  if (!posted) return 0
  return lineSign(side, kind, doc.Type)
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
 *
 * `creditNotes` is optional so a caller that has none to give is unchanged. A
 * credit note is keyed to its supplier exactly the way the bill was (contact,
 * then line description), so a credit against a supplier's own bill nets inside
 * that supplier's total, and one with nothing to net against becomes its own
 * negative row — "less Hardware Concepts credit ($1,571)" in the draft.
 *
 * `vendorNames` decides what a mapped vendor is called. 'product' (the default,
 * and what a subscription account wants) keeps the subscription wizard's name —
 * "Google Workspace", the same row the subscription page prints. 'company'
 * names the business that billed it — "Google" — for every other account, where
 * the product name is simply wrong: Urban Road's Google Ads bill on Marketing
 * Digital Ad Spend was quoted as Workspace. Every line of one account gets the
 * same choice, so a supplier's bills and bank lines still group into one row.
 * Nothing here is a stored key: summariseVendors groups in memory, and Step 6
 * and the subscription page keep calling extractVendorName for theirs.
 */
export function collectAccountTransactions(input: {
  accountCode: string
  side: AccountSide
  invoices: readonly XeroCommentaryDocument[]
  bankTransactions: readonly XeroCommentaryDocument[]
  creditNotes?: readonly XeroCommentaryDocument[]
  baseCurrency: string | null
  vendorNames?: 'product' | 'company'
}): VendorTransaction[] {
  const { accountCode, side, invoices, bankTransactions, creditNotes = [], baseCurrency, vendorNames = 'product' } = input
  const out: VendorTransaction[] = []

  const take = (doc: XeroCommentaryDocument, kind: CommentaryDocumentKind) => {
    const sign = postedLineSign(doc, kind, side)
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
        vendor: vendorNames === 'company' && info.source === 'mapping' ? vendorCompanyName(info.vendor) : info.vendor,
        context: info.context,
        // `|| 0` keeps a zero line from becoming -0.
        amount: sign * converted.amount || 0,
        type: kind,
        converted: converted.converted,
        sourceCurrency: converted.sourceCurrency,
      })
    }
  }

  for (const inv of invoices) take(inv, 'invoice')
  for (const bt of bankTransactions) take(bt, 'bank')
  for (const cn of creditNotes) take(cn, 'credit_note')

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
  //
  // A remainder of ONE supplier keeps its name. "Others" stands for suppliers
  // too small to name one by one; when there is only one of them, the name
  // costs no more room than the word. Urban Road's August International Orders
  // ended "Others ($81)" where Calxa says "Prodigi ($81)". The same applies to a
  // remainder that nets negative: a single small refund is a named credit
  // ("less Prodigi credit ($40)"), not "less other credits".
  //
  // A supplier that rounds to $0 is not counted: a $0.30 bank fee, or a charge
  // and its refund, adds nothing to the remainder, so it must not turn "Prodigi
  // ($81)" back into "Others ($81)". expandOthers drops the same $0 rows when a
  // placement names the remainder, and the two have to agree.
  if (othersTotal !== 0) {
    const remainderVendors = sorted.filter(e => Math.abs(e.amount) < OTHERS_THRESHOLD && e.converted !== false && e.amount !== 0)
    if (remainderVendors.length === 1) {
      significant.push(remainderVendors[0])
    } else {
      significant.push({ vendor: 'Others', amount: othersTotal, transactions: othersTransactions })
    }
  }

  return significant
}
