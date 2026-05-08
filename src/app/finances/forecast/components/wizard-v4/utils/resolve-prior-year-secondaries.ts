/**
 * Resolve `otherIncome` / `otherExpenses` for a Step 2 "Refresh from Xero"
 * (fix/refresh-button-preserve-other-income).
 *
 * Background. `historical-pl-summary` always returns `other_income` /
 * `other_expenses` as a number (0 when no rows match the account_type enum) —
 * the field is never `undefined` post-Phase 44 refactor. The original
 * `!== undefined && !== null` guard in the Refresh handler therefore never
 * fired the cached fallback: a refresh that hit a tenant where the live API
 * computed 0 (Xero account-type classification miss, mid-deploy matcher
 * change, etc.) silently wiped the user's visible Other Income — the
 * regression Matt hit on JDS after PR #139 shipped the manual Refresh
 * button.
 *
 * Rule applied here:
 *   - API returns a non-zero number → trust it (Xero is authoritative).
 *   - API returns 0 / undefined / null AND cache holds non-zero → preserve cache.
 *   - Otherwise (both zero / both absent) → take whatever we have, preferring
 *     the API zero so a tenant who genuinely has no Other Income lands on a
 *     concrete `{ total: 0, byMonth: {} }` rather than `undefined`.
 *
 * `byMonth` is carried alongside `total` in every branch so the per-month
 * columns stay in sync with the totals row.
 *
 * The always-on refresh path (ForecastWizardV4.tsx) deliberately keeps its
 * simpler cache-on-undefined guard — it runs at mount when the cache may be
 * empty, and trusting fresh Xero is the right default. This helper is for
 * the operator-triggered refresh, which always runs against an already-
 * populated `state.priorYear`.
 */

export interface SecondaryBucket {
  total: number;
  byMonth: Record<string, number>;
}

export interface ResolveSecondaryInput {
  apiTotal: number | null | undefined;
  apiByMonth: Record<string, number> | null | undefined;
  cached: SecondaryBucket | undefined;
}

export function resolvePriorYearSecondary(
  input: ResolveSecondaryInput,
): SecondaryBucket | undefined {
  const { apiTotal, apiByMonth, cached } = input;
  const apiByMonthSafe = apiByMonth ?? {};

  const apiIsMeaningful = apiTotal !== undefined && apiTotal !== null && apiTotal !== 0;
  const cachedIsMeaningful = !!cached && cached.total !== 0;

  if (apiIsMeaningful) {
    return { total: apiTotal as number, byMonth: apiByMonthSafe };
  }
  if (cachedIsMeaningful) {
    return { total: cached!.total, byMonth: cached!.byMonth ?? {} };
  }
  if (apiTotal !== undefined && apiTotal !== null) {
    return { total: apiTotal, byMonth: apiByMonthSafe };
  }
  return cached;
}
