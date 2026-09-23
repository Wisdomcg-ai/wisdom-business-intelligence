/**
 * The quarter's rocks, as the workshop actually captures them.
 *
 * Step 4.3 has no rock editor: it works in `InitiativeDecision[]`, and a rock
 * IS a kept initiative for the quarter being planned, with the sprint detail
 * the step collects (owner, why, outcome, dates). `quarterly_reviews.rocks`
 * had no writer at all — `updateQuarterlyRocks` existed and was handed to no
 * component — so the column stayed empty for every review ever completed while
 * six readers depended on it: the complete screen, the summary, the history
 * list, the client PDF, the background sync and `syncAll` (whose `syncRocks`
 * returns early on an empty list, so no quarter rows were written either).
 *
 * The rule here is deliberately the same one the PDF's reader-side fallback
 * uses for reviews completed before this existed — kept or accelerated, in the
 * quarter being planned — so a review shows the same rocks whether they were
 * stored or derived.
 */
import type { InitiativeDecision, Rock } from '../types'

/** Decisions that put an initiative on the plate for the coming quarter. */
const ACTIVE_DECISIONS = new Set(['keep', 'accelerate'])

/**
 * A decision belongs to the quarter being planned when it says so, or when it
 * says nothing — an unassigned decision in this step is about the quarter the
 * session is planning.
 */
export function isForPlannedQuarter(
  decision: Pick<InitiativeDecision, 'quarterAssigned'>,
  plannedQuarter: number,
): boolean {
  const assigned = (decision.quarterAssigned ?? '').trim().toLowerCase()
  if (!assigned || assigned === 'unassigned') return true
  return assigned === `q${plannedQuarter}`
}

/**
 * Build the review's rocks from its decisions.
 *
 * Returns [] when nothing is kept, which is a real answer: a session that
 * planned no rocks stored none. The caller decides whether that is worth
 * blocking on.
 */
export function rocksFromDecisions(
  decisions: InitiativeDecision[] | null | undefined,
  plannedQuarter: number,
): Rock[] {
  return (decisions ?? [])
    .filter(d => ACTIVE_DECISIONS.has(String(d?.decision ?? '').toLowerCase()))
    .filter(d => isForPlannedQuarter(d, plannedQuarter))
    .map((d, index) => ({
      id: d.initiativeId,
      title: d.title,
      description: d.why || d.notes || undefined,
      owner: d.assignedTo || '',
      status: 'not_started' as const,
      progressPercentage: 0,
      linkedInitiatives: [d.initiativeId],
      // The step calls this "the outcome" — what done looks like.
      successCriteria: d.outcome || '',
      startDate: d.startDate,
      targetDate: d.endDate,
      notes: d.notes || undefined,
      priority: index + 1,
    }))
}
