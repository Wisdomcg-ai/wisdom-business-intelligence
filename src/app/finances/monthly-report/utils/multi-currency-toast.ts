/**
 * Phase 71 Plan 09 — S6 multi-tenant non-AUD redirect toast.
 *
 * Pure helpers that decide whether to show the one-time-per-session toast
 * when Phase 67's silent multi-currency tab-redirect fires (page.tsx:116-163).
 *
 * Why a separate module:
 *   - The decision logic is pure (3 inputs, boolean output) and the toast
 *     text builder is pure (1 input, string output). Extracting them lets
 *     us regression-test the contract without rendering the full
 *     monthly-report page (30+ heavy imports, jsdom memory issues).
 *
 * Storage key shape: `monthly-report:s6-toast-shown:{businessId}`
 *   - Per-business so switching clients re-fires (different tenants get
 *     their own first-load toast).
 *   - Lives in localStorage (NOT sessionStorage) so the gate persists
 *     across reloads — the user only needs to see the explanation once
 *     per tenant per device.
 */

const STORAGE_PREFIX = 'monthly-report:s6-toast-shown:';

/**
 * Minimal Storage subset we need. Avoids coupling to the full
 * `Storage` DOM interface so we can pass a plain object in tests.
 */
export interface ToastStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Returns true exactly once per businessId per device when
 * `isMultiCurrency=true`. On the true-returning call, the storage entry
 * is written as a side effect so the very next call returns false.
 *
 * Returns false when:
 *   - isMultiCurrency is false (Phase 67 redirect didn't fire)
 *   - businessId is empty/falsy (defensive — should never happen but
 *     keeps the toast from firing during bootstrap before the URL is read)
 *   - the storage already has an entry for this businessId
 */
export function shouldShowMultiCurrencyToast(
  businessId: string,
  isMultiCurrency: boolean,
  storage: ToastStorage,
): boolean {
  if (!isMultiCurrency || !businessId) return false;
  const key = STORAGE_PREFIX + businessId;
  if (storage.getItem(key)) return false;
  storage.setItem(key, '1');
  return true;
}

/**
 * Builds the toast message for the multi-currency redirect.
 *
 * Spec (per Phase 71 CONTEXT D-S6):
 *   "Switched to consolidated view — this client has multiple currencies (HKD + AUD)"
 *
 * Implementation choices:
 *   - Currencies are uppercased, deduped, sorted alphabetically so output
 *     is deterministic regardless of tenant-fetch order.
 *   - Joined with " + " separator (matches Calxa parity convention).
 *   - Em-dash (—) NOT hyphen — matches existing toast strings elsewhere
 *     and the spec literal.
 *
 * Note: the spec example "(HKD + AUD)" was not alphabetically sorted in
 * the source PRD, but "Always sorted alphabetically" is the explicit
 * rule. Tests lock alphabetical (AUD + HKD).
 */
export function buildMultiCurrencyToastMessage(currencies: string[]): string {
  const unique = Array.from(new Set(currencies.map((c) => c.toUpperCase()))).sort();
  return `Switched to consolidated view — this client has multiple currencies (${unique.join(' + ')})`;
}
