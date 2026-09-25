/**
 * Which of the planned quarter's own rows a listing's work is filed under.
 *
 * The Goals wizard gives a quarter a row of its own for every initiative put in
 * it — a copy with the same title — and leaves the 12-month row where it is. No
 * column links the two; the title does (Step4AnnualPlan and step 4.2 both dedupe
 * their Available pool by title for exactly this reason). Production holds such
 * a quarter copy for 95 of its 141 12-month titles (26 Sep 2026).
 *
 * The review's sync used to write a rock onto whichever row its decision came
 * from, step_type included. A 12-month initiative the coach picked as a rock was
 * MOVED into the quarter and dropped out of the One-Page Plan's 12-Month
 * Initiatives — Digital Bond's "Determine how to get money off the table and
 * invest", completed 25 Sep 2026 — and an earlier quarter's rock carried
 * forward was moved out of that quarter's record. Every writer asks here instead.
 */
import type { InitiativeDecision } from '../types'
import { titleKey } from './rocks-from-decisions'

/** A strategic_initiatives row of the quarter being planned, as the sync reads it. */
export interface QuarterRow {
  id: string
  title?: string | null
  status?: string | null
}

export interface QuarterRowIndex {
  /** Whether this id is one of the quarter's own rows. */
  holds(id: string | null | undefined): boolean
  /**
   * The row a listing is filed under: its own, when its own row is in the
   * quarter; otherwise the quarter's live row of the same title — the copy an
   * initiative picked from the 12-month list or an earlier quarter was given,
   * or the row a rock the review added was saved as. Undefined when the quarter
   * holds none yet.
   */
  rowFor(listing: { id?: string | null; title?: string | null }): string | undefined
}

export function quarterRowIndex(rows: QuarterRow[]): QuarterRowIndex {
  const ids = new Set(rows.map(r => r.id))
  const liveByTitle = new Map<string, string>()
  for (const row of rows) {
    // A rock the coach dropped (saved as cancelled) is not the rock planned now.
    if (row.status === 'cancelled') continue
    const key = titleKey(row.title)
    if (key && !liveByTitle.has(key)) liveByTitle.set(key, row.id)
  }
  return {
    holds: id => !!id && ids.has(id),
    rowFor: listing =>
      listing.id && ids.has(listing.id) ? listing.id : liveByTitle.get(titleKey(listing.title)),
  }
}

const KEPT = new Set(['keep', 'accelerate'])

/**
 * The row each of the planned quarter's listings writes its decision to, and
 * the listing that decides it — the status and notes syncInitiativeChanges saves.
 *
 * A listing of one of the quarter's own rows decides for that row, as it always
 * has: Drop cancels it. Any other listing — an initiative picked from the
 * 12-month list or an earlier quarter, or a rock the review added — decides for
 * the quarter's row of its title, never for the row it came from. The 12-month
 * initiative is not the quarter's rock, and taking the rock out of the quarter
 * must not cancel it. When the quarter holds no row for it yet there is nothing
 * to write: the original stays as it is, and syncRocks files the rock.
 *
 * A row dropped through its own listing is not the row for a rock picked under
 * the same name, although it still reads as live: this sync cancels it, and
 * the pick is given a row of its own, as a rock re-added under a dropped rock's
 * name is (#604). A row two listings share is kept if either keeps it:
 * dropping one listing of a rock listed twice drops the listing, not the rock.
 */
export function quarterDecisionWrites(
  listings: InitiativeDecision[],
  rows: QuarterRow[],
): Map<string, InitiativeDecision> {
  const quarter = quarterRowIndex(rows)
  const writes = new Map<string, InitiativeDecision>()
  for (const listing of listings) {
    if (quarter.holds(listing.initiativeId) && !writes.has(listing.initiativeId)) {
      writes.set(listing.initiativeId, listing)
    }
  }

  const droppedHere = new Set(
    [...writes].filter(([, listing]) => listing.decision === 'kill').map(([id]) => id),
  )
  const live = quarterRowIndex(rows.filter(r => !droppedHere.has(r.id)))
  const shared = new Map<string, InitiativeDecision>()
  for (const listing of listings) {
    if (quarter.holds(listing.initiativeId)) continue
    const row = live.rowFor({ title: listing.title })
    if (!row || writes.has(row)) continue
    const held = shared.get(row)
    if (!held || (!KEPT.has(held.decision) && KEPT.has(listing.decision))) shared.set(row, listing)
  }

  for (const [row, listing] of shared) writes.set(row, listing)
  return writes
}
