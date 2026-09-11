import type { LayoutPage, WidgetType } from '../types/pdf-layout'

/**
 * Pages that have something on them.
 *
 * A layout is a standing list of what a client's pack CAN contain, not what
 * this month's pack does. Urban Road's carries an external-metric page and a
 * memo page because the layout was built from the Calxa page order; the client
 * has never entered an external metric and wrote no memo in August. Both
 * printed as a grey rounded box in the middle of an otherwise empty A4 sheet,
 * reading "Data not available" — twice, in a pack sent to a client.
 *
 * `hasDataForWidget` already knows the answer. It returns false for exactly the
 * widgets that have nothing to say, and TRUE for the two that have something to
 * say about having nothing — the balance sheet and the money-flow page both
 * print their own reason on the page, which is the honest version of this and
 * must not be swallowed. So the rule needs no new knowledge: drop a page when
 * every widget on it reports no data.
 *
 * The empty-result guard is deliberate. If nothing at all has data the layout
 * would collapse to a zero-page PDF, and a pack full of placeholders is a
 * better failure than a pack with no pages — the coach can see what went wrong.
 */
export function pagesWithContent(
  pages: readonly LayoutPage[],
  hasData: (type: WidgetType) => boolean,
): LayoutPage[] {
  const kept = pages.filter((page) => (page.widgets ?? []).some((w) => hasData(w.type)))
  return kept.length > 0 ? [...kept] : [...pages]
}
