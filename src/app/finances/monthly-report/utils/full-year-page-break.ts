/**
 * Where the Full Year table's last page should begin.
 *
 * autoTable breaks a table wherever the next row stops fitting, which on a
 * P&L puts the break wherever the account count happens to land. Dragon's July
 * page ended on a sheet carrying the repeated header and Net Profit alone;
 * Urban Road's third page opened on Operating Profit, the total it sums
 * already a page behind it. Calxa's third page opens on four expense accounts,
 * then Total Expense, Operating Profit, Other Income and Net Profit: the
 * closing rows travel together, with enough of the accounts above them that
 * the first total on the page has something to total.
 *
 * Pure, so the rule is testable without a PDF: heights come from autoTable's
 * own measurement (__createTable), and the flow mirrors drawTable with
 * rowPageBreak 'avoid' — a row that does not fit moves whole to the next page.
 */

export interface TablePageFlow {
  /** The cursor after the header on the page the table starts on. */
  firstY: number
  /** The cursor after the repeated header on a continuation page. */
  continuationY: number
  /** The lowest y a row may end at. */
  bottom: number
}

/** The index of every row that begins a new page, in the order autoTable lays them out. */
export function tablePageStarts(heights: readonly number[], flow: TablePageFlow): number[] {
  const starts: number[] = []
  let y = flow.firstY
  heights.forEach((h, i) => {
    if (y + h > flow.bottom && i > 0) {
      starts.push(i)
      y = flow.continuationY
    }
    y += h
  })
  return starts
}

/**
 * The row the table should break before so the closing rows stay together, or
 * null when autoTable's own breaks already keep them together (or no break
 * could: the carried rows would not fit one page).
 *
 * @param closingStart index of the first closing row — the expense total.
 * @param carry how many rows above the closing rows travel with them. Four is
 *   what Calxa's Urban Road page carries.
 */
export function closingRowsBreak(
  heights: readonly number[],
  closingStart: number,
  flow: TablePageFlow,
  carry = 4,
): number | null {
  const starts = tablePageStarts(heights, flow)
  const offending = starts.find((p) => p >= closingStart)
  if (offending === undefined) return null

  // Never empty the page before: at least one row stays behind.
  const previous = starts.filter((p) => p < offending).pop() ?? 0
  const at = Math.max(previous + 1, closingStart - carry)
  if (at >= offending) return null

  const rest = heights.slice(at).reduce((sum, h) => sum + h, 0)
  return rest <= flow.bottom - flow.continuationY ? at : null
}

/**
 * Where a table's pages should begin so no page ends on a row that only makes
 * sense beside the one after it — a section heading, a group row carrying its
 * accounts' subtotal.
 *
 * autoTable has no keep-with-next. The cashflow table ended its first page on
 * "Employment Expense" with every Employ account on the next, and once its row
 * pitch matched Calxa's the same break simply moved to "Travel &
 * Accommodation" and an "Other Income" heading alone at a page foot. The fix
 * has to be a rule, not a spacing that happens to land well for one client.
 *
 * The flow is tablePageStarts', with one change: when a break falls straight
 * after a keep-with-next row, it moves back to the first row of that run. It
 * never moves back more than `maxCarry` rows or onto the page's first row — a
 * table of nothing but headings breaks where autoTable would, rather than one
 * row a page.
 */
export function keepWithNextStarts(
  heights: readonly number[],
  keepWithNext: readonly boolean[],
  flow: TablePageFlow,
  maxCarry = 3,
): number[] {
  const starts: number[] = []
  let y = flow.firstY
  let pageFirst = 0
  heights.forEach((h, i) => {
    if (y + h > flow.bottom && i > pageFirst) {
      let at = i
      while (at - 1 > pageFirst && i - at < maxCarry && keepWithNext[at - 1]) at--
      // A run longer than the carry, or one reaching the page's first row, is
      // not a heading over its rows; break where autoTable would.
      if (keepWithNext[at - 1]) at = i
      starts.push(at)
      pageFirst = at
      y = flow.continuationY + heights.slice(at, i).reduce((sum, rh) => sum + rh, 0)
    }
    y += h
  })
  return starts
}

/**
 * The row a table should break before so its last page is not a near-empty
 * sheet carrying one or two rows under a repeated header, or null when it
 * already is not (or no earlier break would help).
 *
 * JDS's April Wages Analysis page ran its roster one name past the foot of
 * the page: the next page printed the employee header and "Katrina Liddell
 * 2,893" and nothing else. The break moves back so the last page carries
 * `minRows` rows, never taking the page before below `minRows` of its own.
 */
export function lastPageWidowBreak(
  heights: readonly number[],
  flow: TablePageFlow,
  minRows = 3,
): number | null {
  const starts = tablePageStarts(heights, flow)
  const last = starts[starts.length - 1]
  if (last === undefined || heights.length - last >= minRows) return null

  const previous = starts[starts.length - 2] ?? 0
  const at = Math.max(previous + minRows, heights.length - minRows)
  if (at >= last) return null

  const rest = heights.slice(at).reduce((sum, h) => sum + h, 0)
  return rest <= flow.bottom - flow.continuationY ? at : null
}
