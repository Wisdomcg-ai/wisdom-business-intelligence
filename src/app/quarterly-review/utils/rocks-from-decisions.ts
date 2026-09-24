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
 * How two titles are judged the same rock: ignoring case, surrounding space,
 * and how much space sits between the words. The same rock re-typed in a later
 * session is rarely re-typed identically.
 */
export function titleKey(title: string | null | undefined): string {
  return String(title ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

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
  const kept = (decisions ?? [])
    .filter(d => ACTIVE_DECISIONS.has(String(d?.decision ?? '').toLowerCase()))
    .filter(d => isForPlannedQuarter(d, plannedQuarter))

  // One rock per title. `initiative_decisions` repeats titles in production —
  // Digital Bond's completed Q1 FY2027 review holds three twice over, Efficient
  // Living's Q3 holds five FOUR times — and the id differs each time, so the
  // duplicates survive any id-based grouping. syncRocks keeps
  // strategic_initiatives clean on its own, but three screens read
  // quarterly_rocks directly (the close screen, the summary, the history list),
  // and they would each show eight rocks where the coach set five.
  //
  // The first copy is the rock; later copies only fill in what it is missing,
  // because the repeats do not carry the same fields (one of Efficient
  // Living's four copies has the owner; the others do not).
  const byTitle = new Map<string, Rock>()

  for (const d of kept) {
    const key = titleKey(d.title)
    if (!key) continue

    const existing = byTitle.get(key)
    if (!existing) {
      byTitle.set(key, {
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
        priority: 0, // numbered below, once the set is final
      })
      continue
    }

    if (!existing.owner && d.assignedTo) existing.owner = d.assignedTo
    if (!existing.successCriteria && d.outcome) existing.successCriteria = d.outcome
    if (!existing.description && (d.why || d.notes)) existing.description = d.why || d.notes
    if (!existing.startDate && d.startDate) existing.startDate = d.startDate
    if (!existing.targetDate && d.endDate) existing.targetDate = d.endDate
    if (!existing.notes && d.notes) existing.notes = d.notes
    // Every decision that fed this rock, so a reader can trace it back.
    if (!existing.linkedInitiatives?.includes(d.initiativeId)) {
      existing.linkedInitiatives = [...(existing.linkedInitiatives ?? []), d.initiativeId]
    }
  }

  return Array.from(byTitle.values()).map((rock, index) => ({ ...rock, priority: index + 1 }))
}
