/**
 * What the commentary panel should hold after a fresh check.
 *
 * The commentary map used to be additive in practice: `fetchCommentary`
 * replaced it only when the route came back with at least one row, and nothing
 * ever removed an account. So an account that triggered once stayed in the map
 * for as long as the snapshot lived, and kept printing a badge, whatever the
 * numbers did afterwards.
 *
 * Urban Road's August snapshot is what that looks like after two weeks:
 * twenty-three commentary rows, of which twenty-one had a variance of EXACTLY
 * zero by the time anyone read them — six of those on accounts with no actual,
 * no budget and no suppliers at all — and six were revenue accounts sitting
 * under a heading that said "over budget". The current trigger rules cannot
 * produce any of those rows. They were left behind by an earlier generation and
 * nothing pruned them.
 *
 * So: the machine-generated half of a commentary entry is REBUILT, never
 * merged. If the account did not trigger this time, its row goes.
 *
 * The one thing that survives is the half a human typed. A coach note is not
 * derived from the numbers and cannot be recomputed, so an account that has one
 * keeps its place even after it stops triggering — with its vendor list dropped,
 * because that part WAS derived and is now stale. Deleting a coach's sentence
 * because a budget moved would be a worse bug than the one this fixes.
 */

import type { VarianceCommentary, VarianceCommentaryEntry } from '@/app/finances/monthly-report/types'

function hasNote(entry: VarianceCommentaryEntry | undefined): boolean {
  return typeof entry?.coach_note === 'string' && entry.coach_note.trim().length > 0
}

/**
 * @param fresh    what the commentary route returned for THIS check
 * @param existing what was on screen / in the snapshot beforehand
 */
export function reconcileCommentary(
  fresh: VarianceCommentary,
  existing: VarianceCommentary | undefined,
): VarianceCommentary {
  const out: VarianceCommentary = {}

  // Every account that triggered this time, with the coach's own words put back.
  for (const [account, entry] of Object.entries(fresh)) {
    const note = existing?.[account]?.coach_note
    out[account] = hasNote(existing?.[account])
      ? { ...entry, coach_note: note as string, is_edited: true }
      : entry
  }

  // Accounts that no longer trigger but carry a note: keep the note, drop the
  // facts. `vendor_summary` and `draft_note` describe a variance that is no
  // longer there; printing them beside a $0 line is how this started.
  for (const [account, entry] of Object.entries(existing ?? {})) {
    if (account in out) continue
    if (!hasNote(entry)) continue
    out[account] = {
      vendor_summary: [],
      coach_note: entry.coach_note,
      is_edited: true,
      detail_tab_ref: entry.detail_tab_ref ?? null,
    }
  }

  return out
}

/**
 * The commentary map after the coach types in one account's note.
 *
 * Everything the generator wrote stays on the entry — the draft, its halves,
 * its warnings, the trigger and the tab link. The page used to rebuild the
 * entry from the vendor list and the note alone, so the first keystroke in a
 * note deleted the draft from that account, and auto-save then persisted a
 * pack whose supplier line was gone until the next Regenerate. That was
 * harmless only while nothing printed the draft; a pack that lets the note
 * REPLACE the draft needs the draft still there when the note is cleared.
 */
export function applyCoachNote(
  prev: VarianceCommentary | undefined,
  accountName: string,
  note: string,
): VarianceCommentary {
  const existing = prev?.[accountName]
  return {
    ...(prev ?? {}),
    [accountName]: {
      ...(existing ?? {}),
      vendor_summary: existing?.vendor_summary ?? [],
      coach_note: note,
      is_edited: true,
    },
  }
}
