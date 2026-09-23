/**
 * Which listed forecast version a Xero budget may be seeded into.
 *
 * The seed is one-shot: it may only fill a version that carries no wizard data
 * yet (a freshly created one, or a "Save as New Version" copy). Everything
 * else would be overwritten.
 *
 * The first cut of this test asked `assumptions == null`, which reads right and
 * is never true. `financial_forecasts.assumptions` defaults to `{}`, so an
 * abandoned wizard session — or simply a row created by the app — leaves an
 * empty OBJECT, not a null. On 8 Sep 2026 not one of the fleet's 39 forecasts
 * had a null there, so the "Start from Xero budget" control in the selector
 * footer could not render for any client that already had a forecast: 24 empty
 * shells across 17 clients, every one of them a valid target. Distinct
 * Directions surfaced it — Urban Road had gone through the no-forecasts empty
 * state instead, where this predicate is not consulted.
 *
 * So the question is "does this version carry wizard data", and the answer has
 * to treat null and `{}` alike.
 */

export interface SeedTargetCandidate {
  id: string
  name: string
  is_active: boolean
  assumptions?: unknown | null
}

/** True when a version holds no wizard data — null, `{}`, or a non-object. */
export function hasNoWizardData(assumptions: unknown | null | undefined): boolean {
  if (assumptions == null) return true
  if (typeof assumptions !== 'object') return true
  if (Array.isArray(assumptions)) return assumptions.length === 0
  return Object.keys(assumptions as Record<string, unknown>).length === 0
}

/**
 * The version a budget should seed, or null when every version already carries
 * wizard data. Prefers the active one so the seed lands where the page is
 * already pointing.
 */
export function pickSeedTarget<T extends SeedTargetCandidate>(forecasts: readonly T[]): T | null {
  return (
    forecasts.find((f) => f.is_active && hasNoWizardData(f.assumptions)) ??
    forecasts.find((f) => hasNoWizardData(f.assumptions)) ??
    null
  )
}
