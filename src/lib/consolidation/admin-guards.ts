/**
 * Shared guards + validators for the consolidation admin API routes.
 *
 * Plan 34-00f (adapted for the post-pivot tenant model).
 *
 * These helpers are pure + unit-testable; the route handlers wire them into
 * `createRouteHandlerClient` + `createServiceRoleClient` (dual-client pattern).
 */

/**
 * Slash-format currency pair (e.g. 'HKD/AUD'). Matches the convention documented
 * in src/lib/consolidation/types.ts and the fx_rates table's stored values.
 */
export const CURRENCY_PAIR_REGEX = /^[A-Z]{3}\/[A-Z]{3}$/

/**
 * Currencies a coach can set as `xero_connections.functional_currency`. Kept
 * small on purpose — the pivot scope is AUD/HKD (Dragon + IICT). Extending
 * later is a trivial array edit.
 */
export const ALLOWED_FUNCTIONAL_CURRENCIES = [
  'AUD',
  'HKD',
  'USD',
  'NZD',
  'GBP',
  'EUR',
] as const

export type FunctionalCurrency = (typeof ALLOWED_FUNCTIONAL_CURRENCIES)[number]

export const ALLOWED_RATE_TYPES = ['monthly_average', 'closing_spot'] as const
export type RateType = (typeof ALLOWED_RATE_TYPES)[number]

/**
 * Validate an incoming POST body for /api/consolidation/fx-rates.
 * Returns { ok: true, value } or { ok: false, error } — the route converts the
 * error into a 400 response.
 */
export function validateFxRatePayload(body: unknown): {
  ok: true
  value: {
    currency_pair: string
    rate_type: RateType
    period: string
    rate: number
  }
} | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Request body must be a JSON object' }
  }
  const b = body as Record<string, unknown>

  const currency_pair = typeof b.currency_pair === 'string' ? b.currency_pair : ''
  const rate_type = typeof b.rate_type === 'string' ? b.rate_type : ''
  const period = typeof b.period === 'string' ? b.period : ''
  const rate = typeof b.rate === 'number' ? b.rate : NaN

  if (!currency_pair || !rate_type || !period || Number.isNaN(rate)) {
    return {
      ok: false,
      error: 'currency_pair, rate_type, period, and rate are required',
    }
  }
  if (!CURRENCY_PAIR_REGEX.test(currency_pair)) {
    return {
      ok: false,
      error: "currency_pair must match format 'XXX/YYY' (e.g. 'HKD/AUD')",
    }
  }
  if (!ALLOWED_RATE_TYPES.includes(rate_type as RateType)) {
    return {
      ok: false,
      error: "rate_type must be 'monthly_average' or 'closing_spot'",
    }
  }
  if (!Number.isFinite(rate) || rate <= 0) {
    return { ok: false, error: 'rate must be a positive finite number' }
  }
  const parsed = new Date(period)
  if (Number.isNaN(parsed.getTime())) {
    return {
      ok: false,
      error: "period must be a parseable date (e.g. '2026-03-01')",
    }
  }

  return {
    ok: true,
    value: {
      currency_pair,
      rate_type: rate_type as RateType,
      period,
      rate,
    },
  }
}

/**
 * Validate a PATCH body for /api/consolidation/tenants/[connectionId].
 *
 * All fields are optional — the PATCH applies only the provided fields so the
 * UI can update a single column (e.g. just `display_order`) without disturbing
 * other state.
 *
 * Unknown fields are ignored; invalid values fail fast with a descriptive error.
 */
export function validateTenantPatchPayload(body: unknown): {
  ok: true
  value: {
    display_name?: string
    display_order?: number
    functional_currency?: FunctionalCurrency
    include_in_consolidation?: boolean
    is_active?: boolean
  }
} | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Request body must be a JSON object' }
  }
  const b = body as Record<string, unknown>
  const out: {
    display_name?: string
    display_order?: number
    functional_currency?: FunctionalCurrency
    include_in_consolidation?: boolean
    is_active?: boolean
  } = {}

  if (b.display_name !== undefined) {
    if (typeof b.display_name !== 'string' || b.display_name.trim().length === 0) {
      return { ok: false, error: 'display_name must be a non-empty string' }
    }
    if (b.display_name.length > 200) {
      return { ok: false, error: 'display_name must be 200 characters or fewer' }
    }
    out.display_name = b.display_name.trim()
  }
  if (b.display_order !== undefined) {
    if (typeof b.display_order !== 'number' || !Number.isInteger(b.display_order)) {
      return { ok: false, error: 'display_order must be an integer' }
    }
    if (b.display_order < 0 || b.display_order > 999) {
      return { ok: false, error: 'display_order must be between 0 and 999' }
    }
    out.display_order = b.display_order
  }
  if (b.functional_currency !== undefined) {
    if (
      typeof b.functional_currency !== 'string' ||
      !ALLOWED_FUNCTIONAL_CURRENCIES.includes(
        b.functional_currency as FunctionalCurrency,
      )
    ) {
      return {
        ok: false,
        error: `functional_currency must be one of: ${ALLOWED_FUNCTIONAL_CURRENCIES.join(', ')}`,
      }
    }
    out.functional_currency = b.functional_currency as FunctionalCurrency
  }
  if (b.include_in_consolidation !== undefined) {
    if (typeof b.include_in_consolidation !== 'boolean') {
      return { ok: false, error: 'include_in_consolidation must be a boolean' }
    }
    out.include_in_consolidation = b.include_in_consolidation
  }
  if (b.is_active !== undefined) {
    if (typeof b.is_active !== 'boolean') {
      return { ok: false, error: 'is_active must be a boolean' }
    }
    out.is_active = b.is_active
  }

  if (Object.keys(out).length === 0) {
    return {
      ok: false,
      error: 'At least one field must be provided (display_name, display_order, functional_currency, include_in_consolidation, is_active)',
    }
  }

  return { ok: true, value: out }
}
