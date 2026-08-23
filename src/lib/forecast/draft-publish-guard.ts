/**
 * A draft save records WORK. Only a final Generate publishes NUMBERS.
 *
 * The wizard autosaves every few seconds while the operator edits. When the
 * forecast being edited already exists, that autosave takes the UPDATE path in
 * `api/forecast-wizard-v4/generate` — and materialisation is deliberately
 * skipped for drafts, so `forecast_pl_lines` stays at the last Generate.
 *
 * That makes these columns unsafe to write on a draft:
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
 * `assumptions` is the fifth published column, but it cannot simply be stripped:
 * a draft save's whole purpose is to persist the operator's work. It is
 * REDIRECTED to `draft_assumptions` instead (23 Aug 2026).
 *
 * Why this mattered: writes need no operator edit. Every step-bar click calls
 * saveDraft unconditionally (ForecastWizardV4.tsx:2206) and the autosave effect
 * fires 3s after any tracked state settles (:1552-1590). So merely opening a
 * published forecast in the builder and clicking through replaced its approved
 * assumptions. Drafts never materialise, so nothing broke on the spot — but
 * three paths rebuild the stored P&L from that column afterwards
 * (POST /api/forecast/[id]/recompute, /api/forecast/seed-from-prior, and the
 * next Generate), so the approved plan could be quietly replaced by
 * half-finished state.
 *
 * Inverting ownership — `assumptions` = what produced the stored lines,
 * `draft_assumptions` = work in progress — makes every existing reader of
 * `assumptions` correct by construction, rather than requiring each one to
 * learn about a new column.
 */
export const DRAFT_REDIRECTED_FIELD = 'assumptions' as const
export const DRAFT_ASSUMPTIONS_FIELD = 'draft_assumptions' as const

/**
 * Strip published columns from an update payload when saving a draft, and
 * redirect `assumptions` to `draft_assumptions` so the work is kept without
 * touching the published record.
 * Returns the payload unchanged for a final Generate.
 */
export function applyDraftPublishGuard<T extends Record<string, unknown>>(
  payload: T,
  isDraft: boolean,
): Record<string, unknown> {
  if (!isDraft) return { ...payload }
  const next: Record<string, unknown> = { ...payload }
  for (const field of PUBLISHED_FORECAST_FIELDS) delete next[field]
  if (DRAFT_REDIRECTED_FIELD in next) {
    next[DRAFT_ASSUMPTIONS_FIELD] = next[DRAFT_REDIRECTED_FIELD]
    delete next[DRAFT_REDIRECTED_FIELD]
  }
  return next
}
