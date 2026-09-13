/**
 * The commentary line, drafted.
 *
 * House format, from the packs: a bolded account name, a pipe, the suppliers
 * largest-first with amounts in brackets, then the ratio clause.
 *
 *   Antons Canvas | Antons Mouldings Pty Ltd ($201,026), POD order journals
 *   ($151) - 40.5% of canvas revenue against a 36.2% driver
 *
 * WHAT THIS IS NOT. It is a draft, never the finished line. Matt's best
 * commentary says WHY a cost moved — "Darren Palmer", "quarterly billing",
 * "no PMI invoice has been received yet" — and a generated sentence that is
 * confidently wrong about why is worse than no sentence at all. So the draft
 * carries the facts (who, how much, what share of income) and stops. The
 * judgement stays his.
 *
 * That split is also what makes the draft safe to regenerate. The facts go in
 * `draft_note` and are rebuilt from scratch every run; `coach_note` is his and
 * is never written here. Urban Road's August pack would otherwise have printed
 * an over-budget flag on Wages against a budget it is within 35 cents of,
 * because the stored commentary predated a budget-source switch — stale facts
 * under current numbers. Facts that recompute cannot go stale; prose that is
 * never overwritten cannot be lost.
 */
import type { RatioClause } from './commentary-clause'
import { vendorsExceedAccount } from './commentary-money'

export interface DraftVendor {
  vendor: string
  /** Signed, in the organisation's currency. Negative = a credit note. */
  amount: number
  /** False when the source document was foreign and carried no rate. */
  converted?: boolean
  /** The document's currency when it could not be converted. */
  sourceCurrency?: string
}

export interface DraftNote {
  /** The account name, rendered bold by both the web tab and the PDF. */
  account: string
  /** Everything after the pipe. Empty string when there is nothing to say. */
  body: string
  /**
   * Things the coach must see and the client must not: an unconvertible
   * document, or a vendor list that sums past its own account. Rendered beside
   * the draft in the editor, never inside the pack.
   */
  warnings: string[]
}

/** "$201,026" — whole dollars, the way the packs quote a supplier. */
function money(n: number): string {
  return `$${Math.round(Math.abs(n)).toLocaleString('en-AU')}`
}

/**
 * How many suppliers to name before rolling the rest up.
 *
 * Matt quotes two or three. The unbounded list is what turns an amber row into
 * a wall of 6.5pt text: Contractors excl. Artists has sixteen vendors and IT
 * Costs Software nineteen.
 */
export const DEFAULT_TOP_N = 3

/**
 * Build the draft for one account.
 *
 * `accountActual` is the statement line the commentary sits under — passed in
 * so the draft can check its own arithmetic against it rather than asserting a
 * total nobody verified.
 */
export function buildDraftNote(input: {
  accountName: string
  vendors: readonly DraftVendor[]
  accountActual: number
  clause: RatioClause | null
  topN?: number
}): DraftNote {
  const { accountName, vendors, accountActual, clause } = input
  const topN = input.topN ?? DEFAULT_TOP_N
  const warnings: string[] = []

  // Credits read differently and are quoted differently: "less X credit ($Y)".
  // They are also few and always explanatory, so they are never rolled up into
  // "others" — a credit hidden inside a remainder explains nothing.
  const charges = vendors.filter(v => v.amount > 0).sort((a, b) => b.amount - a.amount)
  const credits = vendors.filter(v => v.amount < 0).sort((a, b) => a.amount - b.amount)

  const named = charges.slice(0, topN)
  const rest = charges.slice(topN)
  const parts: string[] = named.map(v => `${v.vendor} (${money(v.amount)})`)

  if (rest.length > 0) {
    const restTotal = rest.reduce((s, v) => s + v.amount, 0)
    parts.push(`+${rest.length} ${rest.length === 1 ? 'other' : 'others'} (${money(restTotal)})`)
  }

  for (const c of credits) {
    // The supplier grouping rolls sub-materiality suppliers into a remainder
    // named "Others", and now that refunds are signed that remainder can net
    // negative. "less Others credit ($50)" names a supplier that does not
    // exist; the remainder is several small credits, and says so.
    parts.push(c.vendor === 'Others'
      ? `less other credits (${money(c.amount)})`
      : `less ${c.vendor} credit (${money(c.amount)})`)
  }

  // A document we could not convert is named rather than quietly included at a
  // foreign face value — the failure the money module exists to prevent.
  for (const v of vendors) {
    if (v.converted === false) {
      warnings.push(
        `${v.vendor} is billed in ${v.sourceCurrency ?? 'a foreign currency'} and the document carries no exchange rate, so its amount is not included.`,
      )
    }
  }

  const quotedTotal = vendors
    .filter(v => v.converted !== false)
    .reduce((s, v) => s + v.amount, 0)

  if (vendorsExceedAccount(quotedTotal, accountActual)) {
    warnings.push(
      `The suppliers quoted total ${money(quotedTotal)} against an account that moved ${money(accountActual)} this month. The list is wrong — do not send this line.`,
    )
  }

  // A ratio with no suppliers under it is not commentary.
  //
  // "Accounting Fees | 0.0% of income against a 0.2% driver" is a true
  // sentence that tells a reader nothing, and Urban Road's August pack printed
  // four of them. The value of this page is the supplier list; the clause
  // qualifies that list, it does not stand in for one. Where the spend was a
  // journal rather than a bill there are no suppliers to name, and the honest
  // output is nothing at all — leaving the coach a blank line to write on,
  // which is what the reference pack's author does by hand.
  const body = parts.length > 0
    ? (clause ? `${parts.join(', ')} - ${clause.text}` : parts.join(', '))
    : ''

  return { account: accountName, body, warnings }
}

/** The whole line, for a surface that wants one string. Bolding is the caller's. */
export function draftNoteToText(note: DraftNote): string {
  return note.body ? `${note.account} | ${note.body}` : note.account
}
