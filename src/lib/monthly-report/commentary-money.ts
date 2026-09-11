/**
 * What a supplier line is worth, in the currency the P&L is stated in.
 *
 * The commentary quotes suppliers underneath a statement line, so the two have
 * to be in the same money. Two things were stopping that:
 *
 * 1. `LineItem.LineAmount` is denominated in the DOCUMENT's currency. Urban Road
 *    pays contractors in PHP, USD and AUD, so a PHP 22,750 bill was quoted as
 *    "$91,000" beside an account that spent $31,029 for the whole month. The
 *    conversion uses the document's OWN `CurrencyRate` — never a live FX lookup
 *    — because that rate is what the ledger posted at, and it is therefore the
 *    only one that reconciles to the P&L figure above it. See
 *    [[project-full-platform-audit]] for the same lesson on IICT's 5.26x.
 *
 * 2. `Math.abs()`. A credit note is a negative line, and taking its modulus both
 *    inflated the total and threw away the word "less" — Urban Road's July
 *    commentary reads "less Hardware Concepts credit ($1,571)", which is a
 *    negative line item and nothing more.
 *
 * A document we cannot convert is NOT silently passed through at its face value
 * and NOT silently dropped: it comes back `converted: false` so the caller can
 * say so. A foreign number printed as though it were dollars is the failure
 * this module exists to prevent.
 */

/** The fields we need off a Xero invoice or bank transaction. */
export interface XeroDocumentMoney {
  CurrencyCode?: string | null
  CurrencyRate?: number | string | null
  /**
   * Xero's document-level tax treatment: 'Inclusive', 'Exclusive' or 'NoTax'.
   * On an Inclusive document `LineAmount` CONTAINS the GST, while the P&L the
   * commentary sits under is stated net of it.
   */
  LineAmountTypes?: string | null
}

/** The fields we need off one line of such a document. */
export interface XeroLineMoney {
  LineAmount?: number | string | null
  TaxAmount?: number | string | null
}

export interface ConvertedAmount {
  /** Signed, in the organisation's functional currency. Negative = a credit. */
  amount: number
  /** False when the line is foreign and the document carries no usable rate. */
  converted: boolean
  /** Present only when `converted` is false — why, in words a coach can read. */
  reason?: string
  /** The document's currency, when it differs from the organisation's. */
  sourceCurrency?: string
}

function parseRate(raw: number | string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const n = typeof raw === 'number' ? raw : Number(raw)
  // A rate of 0 is not "free", it is missing data wearing a number's clothes.
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

/**
 * Convert one line amount into the organisation's functional currency.
 *
 * `baseCurrency` comes from `xero_connections.functional_currency`. When it is
 * unknown we cannot tell a foreign document from a domestic one, so a document
 * that declares no currency is treated as domestic (the overwhelmingly common
 * case, and what the code did before) while one that declares a currency and
 * carries a rate is still converted.
 */
export function toBaseAmount(
  lineAmount: number | string | null | undefined,
  doc: XeroDocumentMoney | null | undefined,
  baseCurrency: string | null | undefined,
): ConvertedAmount {
  const raw = typeof lineAmount === 'number' ? lineAmount : Number(lineAmount ?? 0)
  if (!Number.isFinite(raw)) {
    return { amount: 0, converted: false, reason: 'the line had no amount' }
  }

  const docCurrency = (doc?.CurrencyCode ?? '').trim().toUpperCase()
  const base = (baseCurrency ?? '').trim().toUpperCase()

  // No currency on the document, or the same currency as the org: already base.
  if (!docCurrency || (base && docCurrency === base)) {
    return { amount: raw, converted: true }
  }

  // The document declares a currency we cannot compare against, because we do
  // not know the org's. Xero's own rate still converts to base if present.
  const rate = parseRate(doc?.CurrencyRate)
  if (rate === null) {
    return {
      amount: raw,
      converted: false,
      sourceCurrency: docCurrency,
      reason: `billed in ${docCurrency} and the document carries no exchange rate`,
    }
  }

  // DIVIDE. Xero states CurrencyRate as FOREIGN-per-base — how many units of
  // the document's currency one unit of the org's buys — so base = amount /
  // rate. Verified against Urban Road's own ledger: bill 2026UR-0801, PHP
  // 22,750 at CurrencyRate 42.879, posted by Xero at AUD 530.56.
  //
  // Multiplying instead was this module's original reading, and the unit test
  // that "proved" it passed a rate of 0.023321 — a number invented to make the
  // multiplication work, not one Xero ever sent. It put Ailene Alfonso at
  // $3,946,249 under an account that spent $31,029, which the vendors-exceed
  // guard then correctly refused to print. The guard was doing its job; the
  // arithmetic above it was not.
  return {
    amount: raw / rate,
    converted: true,
    sourceCurrency: docCurrency !== base ? docCurrency : undefined,
  }
}

/**
 * One line's contribution to the statement figure above it: net of tax, in the
 * organisation's currency.
 *
 * Both corrections in one place, in the order that matters — tax comes off in
 * the DOCUMENT's currency, because `TaxAmount` is denominated there too, and
 * only then is the remainder converted.
 *
 * The tax half is not a rounding difference. Urban Road's freight bills are
 * entered Inclusive, so Allied Express's August `LineAmount`s total $25,954
 * while the P&L carries $23,594 — and the client's own hand-written commentary
 * says $23,594. Quoting the gross under a net line is how a supplier list sums
 * past its own account by a tidy 10%.
 */
export function toStatementAmount(
  line: XeroLineMoney | null | undefined,
  doc: XeroDocumentMoney | null | undefined,
  baseCurrency: string | null | undefined,
): ConvertedAmount {
  const gross = typeof line?.LineAmount === 'number' ? line.LineAmount : Number(line?.LineAmount ?? 0)
  if (!Number.isFinite(gross)) {
    return { amount: 0, converted: false, reason: 'the line had no amount' }
  }

  // 'Inclusive' is the only treatment where LineAmount carries the tax.
  // 'Exclusive' and 'NoTax' are already net, and so is a document that does not
  // say — treating an unstated treatment as inclusive would quietly shave 10%
  // off every line on it.
  const inclusive = (doc?.LineAmountTypes ?? '').trim().toLowerCase() === 'inclusive'
  const taxRaw = typeof line?.TaxAmount === 'number' ? line.TaxAmount : Number(line?.TaxAmount ?? 0)
  const tax = Number.isFinite(taxRaw) ? taxRaw : 0
  // Signed subtraction, so a credit note's negative tax moves the right way.
  const net = inclusive ? gross - tax : gross

  return toBaseAmount(net, doc, baseCurrency)
}

/**
 * Does the supplier detail account for the statement line above it?
 *
 * The commentary's whole claim is "here is where that money went", so a vendor
 * list that sums past its own account is not a rounding difference — it is the
 * list being wrong, and it is the single most visible way this page can
 * embarrass a coach. Urban Road's July "Contractors excl. Artists" quoted
 * $120,045 of suppliers under a line that spent $31,029.
 *
 * Deliberately one-sided. Quoting LESS than the account is normal and expected:
 * sub-materiality vendors are rolled up, and journals are not bills. Quoting
 * MORE is not explicable and must be said out loud.
 */
export function vendorsExceedAccount(
  vendorTotal: number,
  accountActual: number,
  tolerance = defaultVendorTolerance(accountActual),
): boolean {
  if (!Number.isFinite(vendorTotal) || !Number.isFinite(accountActual)) return false
  // Compare magnitudes: an expense account is positive here, but a net-credit
  // month is legitimately negative and |vendors| > |account| is still the
  // condition that matters.
  return Math.abs(vendorTotal) - Math.abs(accountActual) > tolerance
}

/**
 * How far apart the two sides may be before the list is called wrong.
 *
 * A cent was the right answer when both sides came from the same figures. It
 * is the wrong answer now that the supplier side is built by subtracting each
 * line's own tax and converting each document at its own rate: every line
 * rounds, and the roundings do not cancel. Urban Road's August, AFTER the tax
 * and FX arithmetic was corrected:
 *
 *   Employ - Staff Amenities   $1,241 quoted against $1,241
 *   Marketing Digital Ad Spend $23,144 against $23,144
 *   Wallpaper                  $3,041 against $3,041
 *   T/E - Air Fares O'seas     $583 against $583
 *
 * Four accounts that agree to the dollar, all four suppressed with "the list is
 * wrong — do not send this line", because they disagree in the cents. Seven of
 * the eleven flagged accounts were within $30.
 *
 * So: a dollar, or half a percent of the account, whichever is larger. Half a
 * percent is small enough that the two cases worth catching still are — Urban
 * Road's Freight list runs $808 over a $50,925 account (1.6%) and its
 * Contractors list $801 over $31,029 (2.6%), both real extras and both still
 * refused — while a page is no longer silenced by arithmetic that rounds.
 *
 * The floor matters as much as the rate. Half a percent of a $200 account is a
 * dollar, and a list that is a dollar out on $200 is not wrong; it has rounded.
 */
export function defaultVendorTolerance(accountActual: number): number {
  if (!Number.isFinite(accountActual)) return 1
  return Math.max(1, Math.abs(accountActual) * 0.005)
}
