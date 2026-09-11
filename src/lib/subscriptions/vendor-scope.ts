/**
 * Which rows in `subscription_budgets` are actually subscriptions.
 *
 * The table's name promises more than its contents deliver. It is the only
 * per-vendor budget store the platform has, so the Contractor Analysis page
 * put Urban Road's fifteen contractors in it — each one carrying
 * `account_codes: ['61400']`, the contractor expense account — and the
 * forecast wizard's Step 6, which reads every row for the business, promptly
 * listed all fifteen as software subscriptions.
 *
 * The client already states which accounts are its subscriptions:
 * `monthly_report_settings.subscription_account_codes`. That is the definition,
 * and reading it here fixes every consumer at once rather than asking each to
 * remember.
 *
 * Deliberately conservative in two directions. A client who has configured no
 * subscription accounts gets no filtering — the old behaviour, and the only
 * safe answer when nobody has said what a subscription is here. And a row with
 * NO account codes is kept: it cannot be shown to be out of scope, and
 * silently dropping a vendor whose budget somebody typed would be worse than
 * showing one too many.
 */

export interface ScopedVendorRow {
  account_codes?: string[] | null
}

/**
 * @param configured the client's `subscription_account_codes`, or null/empty
 *                   when they have not said
 */
export function isSubscriptionVendor(
  row: ScopedVendorRow,
  configured: readonly string[] | null | undefined,
): boolean {
  const scope = (configured ?? []).map((c) => String(c).trim()).filter(Boolean)
  if (scope.length === 0) return true

  const codes = (row.account_codes ?? []).map((c) => String(c).trim()).filter(Boolean)
  // No codes on the row: unprovable either way, so it stays.
  if (codes.length === 0) return true

  return codes.some((c) => scope.includes(c))
}

export function onlySubscriptionVendors<T extends ScopedVendorRow>(
  rows: readonly T[],
  configured: readonly string[] | null | undefined,
): T[] {
  return rows.filter((r) => isSubscriptionVendor(r, configured))
}
