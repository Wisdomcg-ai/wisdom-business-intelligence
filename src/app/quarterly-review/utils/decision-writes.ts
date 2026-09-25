/**
 * What a step-4.2 decision saves on its strategic_initiatives row: only what
 * the coach decided.
 *
 * Every card in 4.2 starts as Continue ('keep') — past quarters' cards
 * included, where the decision is read-only — and with the owner tag in its
 * notes (assignment-tag.ts). The completion sync used to write a status and the
 * notes for every one of them:
 *
 * - Continue on a not-started initiative wrote 'planned' and Carry Forward
 *   wrote 'deferred'. strategic_initiatives_status_check allows neither, so
 *   those writes failed — silently, and the notes bundled with them failed too.
 *   Most of the plan is not started, which is the only reason 52 rows of real
 *   notes (26 Sep 2026) survived.
 * - The writes that landed put the owner tag over the row's notes, or null
 *   where the initiative had no owner.
 * - Continue on anything else wrote 'in_progress': a rock dropped in one review
 *   would come back in the next, from a past-quarter card nobody can change,
 *   and a completed one would reopen.
 *
 * So Continue and Accelerate change nothing. Drop cancels, Carry Forward puts
 * the initiative on hold. One exception keeps the plan honest: a rock kept in
 * the quarter being planned is live — step 4.3 plans it and syncRocks files its
 * detail on that row — so a cancelled or on-hold row there comes back as not
 * started.
 * Notes are written only when a coach wrote some; nothing is ever cleared,
 * because 4.2 never loads a row's notes, so an empty decision note means
 * "none written here", never "cleared".
 */
import type { InitiativeDecision } from '../types'
import { withoutAssignment } from './assignment-tag'

/** strategic_initiatives_status_check, as production holds it (26 Sep 2026). */
export const INITIATIVE_STATUSES = ['not_started', 'in_progress', 'completed', 'cancelled', 'on_hold'] as const
export type InitiativeRowStatus = (typeof INITIATIVE_STATUSES)[number]

/** The notes a coach wrote on a decision, or undefined — never the owner tag. */
export function coachNotes(notes: string | null | undefined): string | undefined {
  return withoutAssignment(notes) || undefined
}

/** The row a decision is saved on, as the sync knows it. */
export interface DecisionRow {
  /** Whether the row is one of the quarter the review plans. */
  inPlannedQuarter: boolean
  /** Its status when the sync read it — known for the planned quarter's rows only. */
  status?: string | null
}

/** Statuses a rock being planned cannot keep: it is neither dropped nor put off. */
const NOT_LIVE = new Set(['cancelled', 'on_hold'])

/**
 * The status a decision saves, or undefined to leave the row's status as it is.
 *
 * Carry Forward → on_hold is the valid status nearest the 'deferred' this used
 * to write: step 4.1 already counts on_hold with deferred, and the annual reset
 * carries on_hold into the next year as unfinished. A completed row is never
 * reopened.
 */
export function decisionStatus(
  decision: Pick<InitiativeDecision, 'decision'>,
  row: DecisionRow,
): InitiativeRowStatus | undefined {
  switch (decision.decision) {
    case 'kill':
      return 'cancelled'
    case 'defer':
      return 'on_hold'
    case 'keep':
    case 'accelerate':
      return row.inPlannedQuarter && NOT_LIVE.has(String(row.status)) ? 'not_started' : undefined
    default:
      return undefined
  }
}

/** The columns a decision writes to its row, or null when it writes nothing. */
export function decisionUpdate(
  decision: Pick<InitiativeDecision, 'decision' | 'notes'>,
  row: DecisionRow,
): { status?: InitiativeRowStatus; notes?: string } | null {
  const status = decisionStatus(decision, row)
  const notes = coachNotes(decision.notes)
  if (!status && !notes) return null
  return { ...(status ? { status } : {}), ...(notes ? { notes } : {}) }
}
