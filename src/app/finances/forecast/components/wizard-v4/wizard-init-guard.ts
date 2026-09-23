/**
 * Phase A (CFO-only clients) — decides whether a restored localStorage draft
 * is complete enough to SKIP the wizard's full API initialization.
 *
 * The old guard treated `priorYear !== null` (or a non-empty team) as "already
 * initialized" and skipped the full init — but the display-only refresh that
 * runs instead never rebuilds revenueLines/cogsLines/opexLines. A draft cached
 * by a session whose Xero seed failed therefore had priorYear set with EMPTY
 * line arrays, and every later session restored those empty arrays, skipped
 * re-seeding, and generated a forecast with zero forecast_pl_lines (Dragon
 * Roofing 2026-04/2026-08, Efficient Living 2026-07).
 *
 * New rule: only a draft that actually carries P&L line data may skip the full
 * init. priorYear/team/goals alone are NOT sufficient — the full init path
 * re-seeds those anyway and (per initializeFromXero's `...prev` spread +
 * the savedAssumptions restore chain) preserves the operator's saved work.
 */
export function hasUsablePLLineData(state: {
  revenueLines?: ReadonlyArray<unknown> | null
  cogsLines?: ReadonlyArray<unknown> | null
  opexLines?: ReadonlyArray<unknown> | null
}): boolean {
  return (
    (state.revenueLines?.length ?? 0) > 0 ||
    (state.cogsLines?.length ?? 0) > 0 ||
    (state.opexLines?.length ?? 0) > 0
  )
}
