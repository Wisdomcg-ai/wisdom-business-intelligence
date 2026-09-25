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
 * from, step_type included, so a rock whose row lived outside the quarter was
 * MOVED into it. Digital Bond's 25 Sep 2026 completion took "Determine how to
 * get money off the table and invest" out of the One-Page Plan's 12-Month
 * Initiatives that way (it reached the sync from 4.2's Available pool, which
 * #604 has since excluded). A 12-month initiative the coach genuinely picks, or
 * an earlier quarter's rock carried forward, took the same path. Every writer
 * asks here instead.
 */
import type { InitiativeDecision } from '../types'
import { titleKey } from './rocks-from-decisions'

/** A strategic_initiatives row of the quarter being planned, as the sync reads it. */
export interface QuarterRow {
  id: string
  title?: string | null
  status?: string | null
  /** 'quarterly_review' only on a row a review's syncRocks inserted. */
  source?: string | null
  created_at?: string | null
}

/**
 * A quarter's rows that are still its rocks. A rock the coach dropped is saved
 * as cancelled, never deleted, so every reader that lists a quarter's rocks has
 * to leave those rows out itself.
 */
export function liveQuarterRows<T extends { status?: string | null }>(rows: T[]): T[] {
  return rows.filter(row => row.status !== 'cancelled')
}

/** A database timestamp as epoch ms, whichever of Postgres's spellings it arrives in. */
const instant = (value: string): number =>
  Date.parse(
    value
      .trim()
      .replace(' ', 'T')
      .replace(/(\.\d{3})\d+/, '$1')
      .replace(/([+-]\d{2})$/, '$1:00'),
  )

/**
 * Whether this review's own sync created the row — the only kind of row a rock
 * the review later drops may take out of the quarter with it.
 *
 * syncRocks is the only writer of source 'quarterly_review', and it sets it only
 * on a row it inserts. A row it inserted for this review is no older than the
 * review, and both timestamps are the database's, so no browser clock is
 * involved. Production, 26 Sep 2026: every q2 row a review inserted passes
 * (Efficient Living's five, filed by the 4.3 background sync mid-session;
 * Scan2Archive's; Test ABC's three), and none of the twelve rows syncRocks
 * relabelled 'quarterly_review' when it moved them does — Digital Bond's eight
 * were created in June, Efficient Living's four in December.
 */
export function createdByReview(row: QuarterRow, reviewCreatedAt: string | null | undefined): boolean {
  if (row.source !== 'quarterly_review' || !row.created_at || !reviewCreatedAt) return false
  const created = instant(row.created_at)
  const review = instant(reviewCreatedAt)
  return Number.isFinite(created) && Number.isFinite(review) && created >= review
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
 *
 * A listing that does not own the row, and does not keep the rock, writes to
 * it only when this review created the row (createdByReview) — the copy its
 * own sync filed. The Goals wizard files a quarter row under the same title as
 * the initiative it came from, and a review lists every row its quarter held
 * when step 4.2 loaded — except in a first session, whose 4.2 lists none. A
 * rock the coach added and then removed must not cancel a row of that name the
 * plan already held: the coach never saw it, let alone chose to drop it.
 */
export function quarterDecisionWrites(
  listings: InitiativeDecision[],
  rows: QuarterRow[],
  /** When the review was created: which of the quarter's rows its own sync filed. */
  reviewCreatedAt?: string | null,
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

  const byId = new Map(rows.map(r => [r.id, r]))
  for (const [row, listing] of shared) {
    if (KEPT.has(listing.decision) || createdByReview(byId.get(row)!, reviewCreatedAt)) writes.set(row, listing)
  }
  return writes
}
