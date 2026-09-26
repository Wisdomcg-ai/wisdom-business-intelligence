/**
 * A plan initiative the coach dropped.
 *
 * The quarterly review never deletes a strategic_initiatives row. Drop in step
 * 4.2 — and a rock removed in Sprint Planning after the background sync filed
 * it — is saved as status 'cancelled' (syncInitiativeChanges,
 * cancelRemovedRocks), and the row stays as the record of that decision. Nothing
 * else marks a row cancelled, and almost no reader looked at the status, so a
 * dropped initiative stayed on every list of the plan.
 *
 * What a dropped row is depends on the reader:
 *
 * - a list of the plan — the Goals wizard, the One-Page Plan, the dashboard's
 *   rocks, a picker — leaves it out (livePlanRows);
 * - step 4.2, where the coach decides, lists it as Drop, so the decision can be
 *   seen and reversed (listQuarterRow, listPoolRow);
 * - a progress figure counts it as neither done nor still to do;
 * - an engagement check (client completion, the onboarding checklist) still
 *   counts it: the work was done, and then a decision was taken about it.
 *
 * And a list save must never read a dropped row's absence from its list as a
 * removal (removedFromList).
 *
 * Kept here, outside any one screen, because the Goals wizard, the quarterly
 * review and the One-Page Plan all answer this about the same rows and must not
 * answer it differently.
 */

/** The status a Drop is saved as (strategic_initiatives_status_check allows it). */
const DROPPED = 'cancelled'

/** Whether a strategic_initiatives row is one the coach dropped. */
export function isDroppedInitiative(row: { status?: string | null }): boolean {
  return row.status === DROPPED
}

/**
 * The rows still on the plan: every row but the ones the coach dropped. A row
 * with no status is a live one — the column defaults to 'not_started'.
 */
export function livePlanRows<T extends { status?: string | null }>(rows: readonly T[]): T[] {
  return rows.filter(row => !isDroppedInitiative(row))
}

/**
 * What a picker offers: the live rows, and the row already picked even if it
 * has since been dropped — so the picker still shows what is linked, and
 * nothing new is linked to an initiative the coach dropped.
 */
export function pickableRows<T extends { id: string; status?: string | null }>(
  rows: readonly T[],
  pickedId?: string | null,
): T[] {
  return rows.filter(row => !isDroppedInitiative(row) || (!!pickedId && row.id === pickedId))
}

/**
 * The rows a list save deletes: those it held that the saved list no longer
 * lists — never a row the coach dropped.
 *
 * The Goals wizard saves each step as a whole list and hard-deletes every row
 * of that step the list leaves out (StrategicPlanningService.saveInitiatives,
 * and /api/goals/save for a coach). Its lists leave dropped rows out — they are
 * not on the plan — so without this the first autosave after a review would
 * delete every decision to drop that the review saved.
 */
export function removedFromList(
  existing: ReadonlyArray<{ id: string; status?: string | null }>,
  listedIds: Iterable<string>,
): string[] {
  const listed = new Set(listedIds)
  return existing.filter(row => !isDroppedInitiative(row) && !listed.has(row.id)).map(row => row.id)
}
