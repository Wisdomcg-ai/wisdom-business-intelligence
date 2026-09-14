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
   * The body's two halves: the supplier list, and the ratio clause that follows
   * it (null when the body carries none). A pack can print the list without the
   * clause — Calxa's Urban Road pack keeps it on two accounts of fifteen.
   */
  facts: string
  clause: string | null
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
  /** A positive whole number of suppliers, or Infinity for every one. */
  topN?: number
}): DraftNote {
  const { accountName, vendors, accountActual, clause } = input
  const topN = input.topN ?? DEFAULT_TOP_N
  const warnings: string[] = []

  // Credits read differently and are quoted differently: "less X credit ($Y)".
  // They are never rolled into the charges' "+N others" — a credit hidden
  // inside that remainder explains nothing, and its sign would silently shrink
  // a total the reader takes for charges.
  const charges = vendors.filter(v => v.amount > 0).sort((a, b) => b.amount - a.amount)
  const credits = vendors.filter(v => v.amount < 0).sort((a, b) => a.amount - b.amount)

  const named = charges.slice(0, topN)
  const rest = charges.slice(topN)
  const parts: string[] = named.map(v => `${v.vendor} (${money(v.amount)})`)

  // A remainder of one is named. "+1 other ($263)" takes the room "Couriers
  // Please ($263)" would and tells the reader less; the cap exists to stop a
  // wall of names, and one more name is not a wall.
  if (rest.length === 1) {
    parts.push(`${rest[0].vendor} (${money(rest[0].amount)})`)
  } else if (rest.length > 1) {
    const restTotal = rest.reduce((s, v) => s + v.amount, 0)
    parts.push(`+${rest.length} others (${money(restTotal)})`)
  }

  // But credits are capped at the same N, in their own remainder. This loop
  // used to name every credit on the assumption that credits are few. Once
  // customer credit notes were fetched that stopped being true: Urban Road's
  // Zoho integration raises about thirty ACCRECCREDITs a month, many to
  // individual retail customers, and an uncapped revenue line would print a
  // "less <customer> credit" clause for each of them straight into the client
  // pack — the wall of 6.5pt text DEFAULT_TOP_N exists to prevent, made of
  // private individuals' names.
  //
  // The supplier grouping rolls sub-materiality suppliers into a remainder
  // named "Others", and now that refunds are signed that remainder can net
  // negative. "less Others credit ($50)" names a supplier that does not
  // exist, so it is never one of the named credits; it joins the credit
  // remainder, which then says "other credits" without a count, because
  // "Others" is itself an unknown number of suppliers.
  const namedCredits = credits.filter(c => c.vendor !== 'Others').slice(0, topN)
  const restCredits = credits.filter(c => !namedCredits.includes(c))
  for (const c of namedCredits) {
    parts.push(`less ${c.vendor} credit (${money(c.amount)})`)
  }
  // The same for credits, except the "Others" remainder, which is never a name.
  if (restCredits.length === 1 && restCredits[0].vendor !== 'Others') {
    parts.push(`less ${restCredits[0].vendor} credit (${money(restCredits[0].amount)})`)
  } else if (restCredits.length > 0) {
    const restTotal = restCredits.reduce((s, v) => s + v.amount, 0)
    const label = restCredits.some(c => c.vendor === 'Others')
      ? 'other credits'
      : `${restCredits.length} other credits`
    parts.push(`less ${label} (${money(restTotal)})`)
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
  const facts = parts.join(', ')
  const printedClause = parts.length > 0 && clause ? clause.text : null
  const body = printedClause ? `${facts} - ${printedClause}` : facts

  return { account: accountName, body, facts, clause: printedClause, warnings }
}

/** The whole line, for a surface that wants one string. Bolding is the caller's. */
export function draftNoteToText(note: DraftNote): string {
  return note.body ? `${note.account} | ${note.body}` : note.account
}
