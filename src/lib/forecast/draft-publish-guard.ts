/**
 * A draft save records WORK. Only a final Generate publishes NUMBERS.
 *
 * The wizard autosaves every few seconds while the operator edits. When the
 * forecast being edited already exists, that autosave takes the UPDATE path in
 * `api/forecast-wizard-v4/generate` — and materialisation is deliberately
 * skipped for drafts, so `forecast_pl_lines` stays at the last Generate.
 *
 * That makes four columns unsafe to write on a draft:
 *
 *   - `revenue_goal`, `gross_profit_goal`, `net_profit_goal` — read by the
 *     coach's client forecast page and the completeness checker, i.e. published,
 *     client-facing numbers;
 *   - `wizard_state` — the approved summary.
 *
 * Writing them on an autosave advanced the headline every few seconds while the
 * stored P&L stood still, so the live row described a forecast that had never
 * been published. Stripping them keeps the headline and the stored P&L moving
 * together, which is the invariant the whole forecast rests on.
 */

/** Columns that describe a PUBLISHED forecast and may only move on a Generate. */
export const PUBLISHED_FORECAST_FIELDS = [
  'revenue_goal',
  'gross_profit_goal',
  'net_profit_goal',
  'wizard_state',
  // Written unconditionally as 'wizard_v4'. A draft that relabels coach-set
  // ('manual') goals while the guard holds their numbers frozen would leave the
  // row claiming the wizard produced figures it did not.
  'goal_source',
] as const

/**
 * Strip published columns from an update payload when saving a draft.
 * Returns the payload unchanged for a final Generate.
 */
export function applyDraftPublishGuard<T extends Record<string, unknown>>(
  payload: T,
  isDraft: boolean,
): Record<string, unknown> {
  if (!isDraft) return { ...payload }
  const next: Record<string, unknown> = { ...payload }
  for (const field of PUBLISHED_FORECAST_FIELDS) delete next[field]
  return next
}
