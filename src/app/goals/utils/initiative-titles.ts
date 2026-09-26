/**
 * Initiative Title Matching
 * =========================
 *
 * The Goals save gives each step its own rows, so a quarter rock is a
 * same-title COPY of its 12-month initiative under another id. No column links
 * the two; the title does. Step 4's Available pool, its Remove and its moves
 * all match by the quarterly review's titleKey, so the wizard and the review
 * agree on which rows are one initiative.
 */
import { titleKey } from '@/app/quarterly-review/utils/rocks-from-decisions'

export { titleKey }

/**
 * Whether the 12-month list already holds an initiative of this title. A blank
 * title matches nothing, as in the review's helpers.
 */
export function hasTwelveMonthTwin(
  title: string | null | undefined,
  twelveMonthInitiatives: ReadonlyArray<{ title?: string | null }>,
): boolean {
  const key = titleKey(title)
  if (!key) return false
  return twelveMonthInitiatives.some(i => titleKey(i.title) === key)
}
