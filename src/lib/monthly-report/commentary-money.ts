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

  // Xero states CurrencyRate as base-per-foreign, so base = amount x rate.
  return {
    amount: raw * rate,
    converted: true,
    sourceCurrency: docCurrency !== base ? docCurrency : undefined,
  }
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
  tolerance = 0.01,
): boolean {
  if (!Number.isFinite(vendorTotal) || !Number.isFinite(accountActual)) return false
  // Compare magnitudes: an expense account is positive here, but a net-credit
  // month is legitimately negative and |vendors| > |account| is still the
  // condition that matters.
  return Math.abs(vendorTotal) - Math.abs(accountActual) > tolerance
}
