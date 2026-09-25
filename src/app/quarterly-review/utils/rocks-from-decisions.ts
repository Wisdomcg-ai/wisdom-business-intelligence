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
 * A decision belongs to the quarter being planned only when it says so.
 *
 * 'unassigned' — and an empty quarter, which step 4.2 groups the same way
 * (`quarterAssigned || 'unassigned'`) — is 4.2's "Available" pool: initiatives
 * nobody has put in any quarter, loaded from the plan's ideas and 12-month
 * lists and defaulted to 'keep'. Counting them as this quarter's rocks (found
 * 25 Sep 2026) saved Performance Management System as a JVJ rock that 4.3 never
 * showed, and 4 of Digital Bond's 8 and 4 of Efficient Living's 9 — and
 * syncRocks then filed those plan rows under Q2. The PDF's fallback for older
 * reviews printed their whole pool the same way (Sydney Pressed Metal's Q3
 * 2026 review holds 23 pool entries). No review in production holds an empty
 * quarter, so nothing relied on the old reading of it.
 */
export function isForPlannedQuarter(
  decision: Pick<InitiativeDecision, 'quarterAssigned'>,
  plannedQuarter: number,
): boolean {
  const assigned = (decision.quarterAssigned ?? '').trim().toLowerCase()
  return assigned === `q${plannedQuarter}`
}

/**
 * Every decision that makes a rock this quarter: Continue or Accelerate, in the
 * quarter being planned. Copies of the same rock are all included.
 */
export function plannedRockDecisions(
  decisions: InitiativeDecision[] | null | undefined,
  plannedQuarter: number,
): InitiativeDecision[] {
  return (decisions ?? [])
    .filter(d => ACTIVE_DECISIONS.has(String(d?.decision ?? '').toLowerCase()))
    .filter(d => isForPlannedQuarter(d, plannedQuarter))
}

/** The sprint fields step 4.3 collects on a rock. */
const SPRINT_FIELDS = [
  'assignedTo',
  'why',
  'outcome',
  'startDate',
  'endDate',
  'notes',
  'tasks',
  'milestones',
  'totalHours',
] as const

const isBlank = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  value === '' ||
  value === 0 ||
  (Array.isArray(value) && value.length === 0)

/**
 * `target` with every blank sprint field filled from `source`. Never overwrites
 * anything the target already holds.
 */
export function fillSprintBlanks(target: InitiativeDecision, source: InitiativeDecision): InitiativeDecision {
  const out = { ...target } as unknown as Record<string, unknown>
  const from = source as unknown as Record<string, unknown>
  for (const field of SPRINT_FIELDS) {
    if (isBlank(out[field]) && !isBlank(from[field])) out[field] = from[field]
  }
  return out as unknown as InitiativeDecision
}

/** A decision the plan holds a row for. Rocks the review added itself do not. */
export function isSavedInitiativeId(id: string | null | undefined): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id ?? ''))
}

/**
 * For each rock listed more than once this quarter, the 1-based positions of
 * its OTHER listings, keyed by id — so step 4.3 can say "also listed as #4".
 *
 * The step shows every copy and lets the coach choose which to remove (Matt,
 * 25 Sep 2026: alert, don't assume). Merging them silently would hide copies
 * whose details differ. Positions follow `rocks` as given — the cards' order.
 */
export function duplicateListings(rocks: InitiativeDecision[]): Map<string, number[]> {
  const positions = new Map<string, number[]>()
  rocks.forEach((r, index) => {
    const key = titleKey(r.title)
    if (!key) return
    positions.set(key, [...(positions.get(key) ?? []), index + 1])
  })
  const out = new Map<string, number[]>()
  rocks.forEach((r, index) => {
    const all = positions.get(titleKey(r.title)) ?? []
    if (all.length > 1) out.set(r.initiativeId, all.filter(p => p !== index + 1))
  })
  return out
}

/**
 * Write step 4.3's working copy back into the review's decisions: each rock's
 * sprint detail onto its own decision, and rocks added in the step appended.
 */
export function mergeSprintEdits(
  decisions: InitiativeDecision[] | null | undefined,
  sprint: InitiativeDecision[],
): InitiativeDecision[] {
  const all = decisions ?? []
  const byId = new Map(sprint.map(r => [r.initiativeId, r]))
  const merged = all.map(d => {
    const edited = byId.get(d.initiativeId)
    return edited ? { ...d, ...edited } : d
  })
  const held = new Set(all.map(d => d.initiativeId))
  return [...merged, ...sprint.filter(r => !held.has(r.initiativeId))]
}

/**
 * Take ONE listing of a rock out of the quarter — the one the coach chose.
 *
 * Taking the rock out of the quarter marks its listing Drop ('kill'): step 4.2
 * shows it as Drop, and the sync saves the quarter row it is filed under as
 * cancelled — never a delete.
 *
 * That holds for a rock the review added itself too. It has no row of its own,
 * but the 4.3 background sync files one for it a few seconds after an edit
 * (syncRocks inserts the quarter's row). Such a listing used to be simply
 * removed, taking no record with it, so nothing cancelled that row: it stayed
 * an active rock — on the One-Page Plan, in the next review's 1.3 — and 4.2's
 * next load listed it as a fresh 'keep', a rock again. The Drop is the record.
 * The sync cancels the row this review created for it, and only that row
 * (createdByReview): one the plan already held under the same title is left as
 * it is.
 *
 * A listing that is only a copy — another listing of the same title still
 * keeps the rock — is removed outright: the rock stays, and so does its row. An
 * untitled one never had a row, so it goes too.
 *
 * One case needs more: removing the SAVED listing of a rock whose other listing
 * the review added itself (JVJ's Training: the row its completion saved, and
 * the session's copy). Dropping the row would leave the kept listing to be
 * matched to that same row by title on completion — and saved as cancelled. So
 * the kept listing takes over the row instead: the rock the coach kept is the
 * one that is saved, with everything on its card.
 *
 * Removing only from the step's own working copy is what made "Remove" undo
 * itself: the decisions still held the rock, and the step's re-sync put it
 * straight back. Returns the same array when there is nothing to remove.
 */
export function removeRockFromQuarter(
  decisions: InitiativeDecision[] | null | undefined,
  rockId: string,
  plannedQuarter: number,
): InitiativeDecision[] {
  const all = decisions ?? []
  const target = all.find(d => d.initiativeId === rockId)
  if (!target) return all
  const drop = () => all.map(d => (d.initiativeId === rockId ? { ...d, decision: 'kill' as const } : d))

  const key = titleKey(target.title)
  if (!isSavedInitiativeId(rockId)) {
    const stillKept = plannedRockDecisions(all, plannedQuarter).some(
      d => d.initiativeId !== rockId && titleKey(d.title) === key,
    )
    return !key || stillKept ? all.filter(d => d.initiativeId !== rockId) : drop()
  }

  const kept = key
    ? plannedRockDecisions(all, plannedQuarter).find(
        d => d.initiativeId !== rockId && titleKey(d.title) === key && !isSavedInitiativeId(d.initiativeId),
      )
    : undefined

  if (kept) {
    // The kept listing stays where it is on screen; only the removed one goes.
    return all
      .filter(d => d.initiativeId !== rockId)
      .map(d =>
        d.initiativeId === kept.initiativeId
          ? {
              ...kept,
              initiativeId: target.initiativeId,
              currentStatus: target.currentStatus,
              progressPercentage: target.progressPercentage,
            }
          : d,
      )
  }

  return drop()
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
  const kept = plannedRockDecisions(decisions, plannedQuarter)

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
