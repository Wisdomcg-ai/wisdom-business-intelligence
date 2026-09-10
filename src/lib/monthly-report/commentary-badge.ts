/**
 * The little red pill beside an account name in the commentary panel.
 *
 * It used to be a constant: `Math.abs(variance)` followed by the words "over
 * budget", on every row, whatever the row was. That produced two lies and one
 * absurdity on Urban Road's August pack —
 *
 *   - "$3,041 over budget" on revenue accounts, which cannot be over budget
 *   - "over budget" in red on FAVOURABLE variances, which are the good news
 *   - "$0 over budget" on twenty-one rows whose variance was exactly nothing
 *
 * — and the last of those is what a coach reads as the report being broken,
 * because a row that announces a variance of zero is announcing nothing.
 *
 * The badge now says what the trigger actually was, and a variance that rounds
 * to nothing gets no badge at all: the row can still carry a coach's note, but
 * it will not claim a number it does not have.
 */

import type { CommentaryTriggerReason } from '@/app/finances/monthly-report/types'

export interface CommentaryBadge {
  text: string
  /** bad = unfavourable (red), good = favourable (green), neutral = movement */
  tone: 'bad' | 'good' | 'neutral'
}

function money(n: number): string {
  return `$${Math.round(Math.abs(n)).toLocaleString('en-AU')}`
}

/**
 * @param variance the line's `variance_amount` as the statement prints it
 * @param reason   why the row surfaced. Absent on pre-71-04 snapshots, in which
 *                 case the sign is read with the EXPENSE convention
 *                 (`budget - actual`, so negative is over) — safe because the
 *                 panel renders expense sections only.
 */
export function commentaryBadge(
  variance: number,
  reason?: CommentaryTriggerReason,
): CommentaryBadge | null {
  // Rounded before the test: a residue of 0.004 is not a variance, and "$0
  // over budget" is the single loudest sign that a row has gone stale.
  if (Math.round(variance) === 0) return null

  switch (reason) {
    case 'expense_over_budget_dollar':
      return { text: `${money(variance)} over budget`, tone: 'bad' }
    case 'expense_favourable_significant':
      return { text: `${money(variance)} under budget`, tone: 'good' }
    case 'revenue_under_budget_dollar':
    case 'revenue_under_budget_percent':
      return { text: `${money(variance)} under budget`, tone: 'bad' }
    case 'bs_movement_dollar':
    case 'bs_movement_percent':
      return { text: `${money(variance)} movement`, tone: 'neutral' }
    default:
      return variance < 0
        ? { text: `${money(variance)} over budget`, tone: 'bad' }
        : { text: `${money(variance)} under budget`, tone: 'good' }
  }
}
