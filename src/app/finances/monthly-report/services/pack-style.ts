/**
 * The pack's visual language, in one place.
 *
 * Every table in the PDF service had invented its own: `theme: 'grid'` with a
 * navy header, plus a bright green band for Revenue, red for Cost of Sales and
 * orange for Operating Expenses. Against the Calxa pack it reads as a database
 * dump — a full grid of borders, a dollar sign on every cell, and three
 * saturated bands competing with the numbers.
 *
 * What Calxa actually does, read off Urban Road's July 2026 pack:
 *   - a muted grey-lavender band carrying the PERIOD ("Jul 2026"), spanning the
 *     columns it covers, with a lighter row of column labels beneath it
 *   - section names as quiet grey text on white, not as coloured full-width bands
 *   - no vertical rules at all; a hairline under each row and a heavier one
 *     above a total
 *   - plain numbers — commas, no currency symbol, which is stated once in the
 *     header rather than 300 times in the body
 *   - negatives in red parentheses, the accounting convention, never "-$1,234"
 *   - the year-to-date columns on a faint grey ground so the eye can tell the
 *     two periods apart without a border between them
 *
 * The rule this module exists to enforce: a number's FORMATTING carries meaning
 * (red parentheses = unfavourable) and its DECORATION does not. Colour is spent
 * on the figures, not on the furniture.
 */

/** autoTable's colour shape: a fixed triple, not a number[]. */
export type RGB = [number, number, number]

// The colours below were SAMPLED off Urban Road's August 2026 Calxa pack
// (pages 2, 4 and 10 rasterised at 144dpi), not picked by eye. The earlier
// values were eyeballed from July and were each a shade off — a band a little
// too purple, a red a little too brown — which is the difference between a
// pack that looks like the one the client already receives and one that looks
// like an imitation of it.

/** The period band — muted, so it frames the columns without competing with them. */
export const BAND: RGB = [172, 170, 176]
/** The column-label row beneath the band. */
export const BAND_SUB: RGB = [241, 241, 241]
export const BAND_SUB_TEXT: RGB = [55, 55, 55]
/** Section names ("Income", "Cost of Sales") — present, not loud. */
export const SECTION_TEXT: RGB = [128, 128, 128]
/** Hairline under a row. */
export const RULE: RGB = [223, 223, 223]
/** Heavier rule above a total. */
export const RULE_STRONG: RGB = [140, 140, 140]
/** The rule under a statement total — Calxa's, which is the band's light tone, not grey. */
export const TOTAL_RULE: RGB = [211, 212, 217]
/** Group rows (and the year-to-date block on pages that shade one). */
export const GROUP_SHADE: RGB = [245, 245, 245]
/**
 * The budget columns. Calxa shades "Budgets" and "YTD Budget" down the whole
 * table so the eye can find the yardstick in a row of nine figures; where that
 * column crosses a group row, or the header, it goes one step darker.
 */
export const BUDGET_SHADE: RGB = [245, 245, 245]
export const BUDGET_SHADE_STRONG: RGB = [232, 232, 232]
/** Unfavourable figures. Calxa's red — pure red, sampled; the only colour it spends on a number. */
export const NEGATIVE: RGB = [255, 0, 0]
export const TEXT: RGB = [33, 33, 33]

/**
 * A figure the way the pack prints it.
 *
 * `1,234` / `(1,234)` / `—`. No currency symbol: the pack states its currency
 * once, and repeating it on every cell is what makes a wide table unreadable.
 *
 * The em dash is NOT zero. Zero is a fact ("we budgeted nothing"); the dash is
 * an absence ("there is no budget to compare against"), and collapsing the two
 * is how a missing number becomes a favourable variance. Callers pass
 * `null`/`undefined` for the second and a real 0 for the first.
 */
export function packMoney(n: number | null | undefined, opts: { decimals?: number } = {}): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  const d = opts.decimals ?? 0
  const abs = Math.abs(n).toLocaleString('en-AU', { minimumFractionDigits: d, maximumFractionDigits: d })
  // Rounded before the sign test, or a -0.004 prints as "(0)" — a parenthesised
  // nothing, which reads as an unfavourable result that did not happen.
  return Math.round(n * 10 ** d) < 0 ? `(${abs})` : abs
}

/** A percentage, same conventions. */
export function packPercent(n: number | null | undefined, decimals = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  const abs = Math.abs(n).toFixed(decimals)
  return Math.round(n * 10 ** decimals) < 0 ? `(${abs}%)` : `${abs}%`
}

/**
 * autoTable options shared by every statement table.
 *
 * `theme: 'plain'` plus an explicit bottom line is what removes the grid. The
 * alternative — 'grid' with white vertical borders — leaves visible seams where
 * the shaded year-to-date block meets the white columns either side.
 */
/** A fresh triple each call: autoTable mutates the style objects it is given. */
const rgb = (c: RGB): RGB => [c[0], c[1], c[2]]

export function packTableStyles(fontSize = 7) {
  return {
    theme: 'plain' as const,
    styles: {
      fontSize,
      // Tighter than it was, and no rule under each row.
      //
      // The reference pack puts NO line between body rows — the eye tracks a
      // row on its own, and a hairline under every one of forty accounts is
      // forty horizontal lines competing with the numbers. Dropping them, and
      // taking half a millimetre off the padding, is most of the difference
      // between a thirty-page pack and a twenty-six page one carrying the same
      // figures.
      cellPadding: { top: 1.3, right: 2, bottom: 1.3, left: 2 },
      textColor: rgb(TEXT),
      lineColor: rgb(RULE),
      lineWidth: { top: 0, right: 0, bottom: 0, left: 0 },
      overflow: 'linebreak' as const,
    },
    headStyles: {
      fillColor: rgb(BAND_SUB),
      textColor: rgb(BAND_SUB_TEXT),
      fontStyle: 'bold' as const,
      fontSize: fontSize - 0.5,
      lineWidth: { top: 0, right: 0, bottom: 0.2, left: 0 },
      lineColor: rgb(RULE_STRONG),
    },
    bodyStyles: { fillColor: [255, 255, 255] as RGB },
    // No zebra striping. Calxa uses none, and on a fourteen-column table it
    // fights the shaded period block for the reader's attention.
    alternateRowStyles: { fillColor: [255, 255, 255] as RGB },
  }
}

/**
 * Colour a parenthesised figure red, wherever it lands.
 *
 * Keyed on the rendered TEXT rather than on the underlying number, so one hook
 * covers every table without each one having to know which of its columns are
 * variances. `packMoney` and `packPercent` are the only things that emit
 * parentheses, so the test cannot fire on a stray label.
 */
export function paintNegatives(data: {
  cell: { text: string[]; styles: { textColor: RGB | number[] } }
  section: string
}): void {
  if (data.section !== 'body') return
  const text = (data.cell.text ?? []).join('')
  // A percentage is never coloured. The dollar variance beside it already
  // carries the signal, and colouring both doubles the red on the page for no
  // second fact — the reference pack reddens the figure and leaves the ratio
  // black. Urban Road's expense page had twice the red it needed.
  if (text.trim().endsWith('%')) return
  if (text.startsWith('(') && text.endsWith(')')) {
    data.cell.styles.textColor = rgb(NEGATIVE)
  }
}

/** One block of the period band: how many columns it spans, and what it says. */
export interface BandGroup {
  label: string
  colSpan: number
  /** Alternating tone is what separates one period from the next without a rule. */
  tone: 'dark' | 'light'
}

/**
 * The two-tier header Calxa puts over every statement.
 *
 * The top tier carries the PERIOD spanning the columns it covers — "Aug 2026"
 * over budget/actual/variance, "YTD FY2027" over the year-to-date block — in
 * alternating grey-lavender tones. The tier beneath carries the column names on
 * near-white. A reader can then tell at a glance which period a column belongs
 * to; with a single tier of fourteen labels they cannot, and that is most of
 * what made our version of this page unreadable.
 *
 * Returned as an autoTable head row, to be placed above the existing one.
 */
export function periodBandRow(
  groups: readonly BandGroup[],
  opts: { fontSize?: number; fontStyle?: 'bold' | 'normal'; minCellHeight?: number } = {},
) {
  return groups.map((g) => ({
    content: g.label,
    colSpan: g.colSpan,
    styles: {
      fillColor: g.tone === 'dark' ? rgb(BAND) : rgb(BAND_LIGHT),
      textColor: rgb(BAND_TEXT),
      fontStyle: opts.fontStyle ?? ('bold' as const),
      halign: 'center' as const,
      valign: 'middle' as const,
      fontSize: opts.fontSize ?? 7.5,
      ...(opts.minCellHeight ? { minCellHeight: opts.minCellHeight } : {}),
      lineWidth: { top: 0, right: 0, bottom: 0, left: 0 },
    },
  }))
}

/** The lighter half of the alternating period band. */
export const BAND_LIGHT: RGB = [211, 212, 217]
/** Text on either band tone — Calxa sets it black. */
export const BAND_TEXT: RGB = [0, 0, 0]

// =====================================================================
// The Actual vs Budget statements — Calxa pages 2, 4, 6 and 10-11
// =====================================================================
//
// Everything below is measured off the August 2026 pack with pdftotext -bbox
// (Calxa's pages are A4 at 1pt = 1pt of ours, and Arial and Helvetica share
// their metrics, so the sizes transfer exactly):
//
//   title 24pt, period line 12pt caps; band 12pt on a 9.2mm row; column names
//   10pt regular, centred, on a 9.5mm row; figures 10pt at a 14.3pt (5.04mm)
//   pitch; section heading 11pt grey bold; account names indented 5mm under a
//   section and 9.5mm under a group; label column 62.5mm and nine figure
//   columns of 22.7mm across a 267mm table.

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/**
 * 'YYYY-MM' → { year: '2026', idx: 7 }, or null if it is not a month key.
 *
 * Every month label the pack prints comes from here and the two tables above,
 * never from a Date. Two reasons, and the pack has been bitten by both:
 *
 *   1. Timezone. `new Date('2026-08-01')` is UTC midnight, so a local-time
 *      formatter prints the month BEFORE it anywhere west of Greenwich — the
 *      cover of an August pack rendered in Los Angeles read "July 2026", and
 *      in January it lost the year too ("2026-01" → "Dec 25"). Vercel runs UTC
 *      and every coach is in Australia (a positive offset, which does not
 *      shift a UTC midnight backwards), so no client ever saw it; a month
 *      label that depends on where the pack is rendered is still wrong.
 *   2. Wording. en-AU's short September is "Sept", which put "Sept 2026"
 *      beside Calxa's "Sep 2026" on the pages meant to be indistinguishable
 *      from it.
 *
 * A 'YYYY-MM' string already carries the month; deriving it needs no instant.
 * Anything unparseable comes back from these formatters as it went in.
 */
function monthParts(monthKey: string): { year: string; idx: number } | null {
  const m = /^(\d{4})-(\d{2})/.exec(monthKey ?? '')
  const idx = m ? Number(m[2]) - 1 : -1
  return m && idx >= 0 && idx < 12 ? { year: m[1], idx } : null
}

/** 'YYYY-MM' → 'Aug 2026'. */
export function packMonthYear(monthKey: string): string {
  const p = monthParts(monthKey)
  return p ? `${MONTHS_SHORT[p.idx]} ${p.year}` : monthKey
}

/** 'YYYY-MM' → 'August 2026' — the words a page title and the cover print. */
export function packMonthLong(monthKey: string): string {
  const p = monthParts(monthKey)
  return p ? `${MONTHS_LONG[p.idx]} ${p.year}` : monthKey
}

/** 'YYYY-MM' → 'Aug 26' — narrow enough for a figure column's heading. */
export function packMonthYY(monthKey: string): string {
  const p = monthParts(monthKey)
  return p ? `${MONTHS_SHORT[p.idx]} ${p.year.slice(2)}` : monthKey
}

/** 'YYYY-MM' → 'Aug' — a grid heading, where the year is already overhead. */
export function packMonthAbbr(monthKey: string): string {
  const p = monthParts(monthKey)
  return p ? MONTHS_SHORT[p.idx] : monthKey
}

/** '2026-08' → '2026-07', wrapping the year in January. Unparseable passes through. */
export function packPriorMonth(monthKey: string): string {
  const p = monthParts(monthKey)
  if (!p) return monthKey
  const y = Number(p.year)
  return p.idx === 0 ? `${y - 1}-12` : `${p.year}-${String(p.idx).padStart(2, '0')}`
}

/**
 * The period a page title prints: 'August 2026' → 'Aug 2026'.
 *
 * Callers hand drawPageTitle a long month ("Wages Analysis — August 2026"),
 * and Calxa's line reads "MONTH: AUG 2026". Folding it here fixes every
 * titled page at once. A fiscal year or a date range passes through untouched.
 */
export function shortPeriodMonth(period: string): string {
  const m = /^([A-Za-z]+) (\d{4})$/.exec(period)
  if (!m) return period
  const idx = MONTHS_LONG.findIndex((name) => name.toLowerCase() === m[1].toLowerCase())
  return idx >= 0 ? `${MONTHS_SHORT[idx]} ${m[2]}` : period
}

/**
 * The year-to-date band: 'Jul 2026 - Aug 2026'.
 *
 * Calxa names the months, not the fiscal year. "YTD FY2027" asks the reader to
 * know when FY2027 starts; the range tells them. July-start, as every other
 * date in the monthly report assumes (DEFAULT_YEAR_START_MONTH).
 */
export function ytdPeriodLabel(reportMonth: string, fiscalYear: number, yearStartMonth = 7): string {
  const start = `${fiscalYear - (yearStartMonth === 1 ? 0 : 1)}-${String(yearStartMonth).padStart(2, '0')}`
  return `${packMonthYear(start)} - ${packMonthYear(reportMonth)}`
}

/**
 * What the pack calls a section. The data keys are WisdomBI's ('Revenue',
 * 'Operating Expenses'); the page says what Calxa says ('Income', 'Expense'),
 * singular, the way the client has read it every month.
 */
const SECTION_LABELS: Record<string, string> = {
  Revenue: 'Income',
  'Cost of Sales': 'Cost of Sales',
  'Operating Expenses': 'Expense',
  'Other Income': 'Other Income',
  'Other Expenses': 'Other Expense',
}

export function sectionDisplayLabel(category: string): string {
  return SECTION_LABELS[category] ?? category
}

export function sectionTotalLabel(category: string): string {
  return `Total ${sectionDisplayLabel(category)}`
}

/** Which of a statement's optional columns are on. */
export interface StatementColumnOptions {
  reportMonth: string
  fiscalYear: number
  /** The word over the month budget column (the yardstick — see statementYardstick). */
  budgetLabel: string
  ytdBudgetLabel: string
  showYtd: boolean
  showUnspent: boolean
  showNextMonth: boolean
  showAnnual: boolean
  showPriorYear: boolean
  showVariancePercent: boolean
}

export interface StatementColumns {
  /** Column names, label column first (blank, as Calxa leaves it). */
  labels: string[]
  band: BandGroup[]
  /** Budget-figure columns — shaded down the table. */
  budgetCols: number[]
  /** Dollar-variance columns. */
  varianceCols: number[]
  figureCount: number
}

/**
 * The column set of an Actual vs Budget statement, in the order buildLineRow
 * emits cells: Budget | Actual | Variance [| Var %] then the YTD trio [| YTD
 * Var %], then Unspent Budget | Budget - Next Month | Budget - Annual Total
 * [| Prior Yr].
 *
 * Calxa's set is the nine without the percentages or the prior year. Those
 * stay optional because other clients' packs carry them; the defaults a caller
 * passes decide.
 */
export function statementColumns(o: StatementColumnOptions): StatementColumns {
  const labels: string[] = ['', o.budgetLabel, 'Actual', 'Variance']
  const budgetCols = [1]
  const varianceCols = [3]
  const band: BandGroup[] = [
    { label: '', colSpan: 1, tone: 'dark' },
    { label: packMonthYear(o.reportMonth), colSpan: 0, tone: 'light' },
  ]
  if (o.showVariancePercent) labels.push('Var (%)')
  band[1].colSpan = labels.length - 1

  if (o.showYtd) {
    const start = labels.length
    labels.push(o.ytdBudgetLabel, 'YTD Actuals', 'Variance')
    budgetCols.push(start)
    varianceCols.push(start + 2)
    if (o.showVariancePercent) labels.push('YTD Var (%)')
    band.push({ label: ytdPeriodLabel(o.reportMonth, o.fiscalYear), colSpan: labels.length - start, tone: 'dark' })
  }

  // Calxa leaves the band over the three budget-derived columns BLANK. It was
  // labelled "Budget", and then the prior-year actual landed under it too.
  const trailingStart = labels.length
  if (o.showUnspent) labels.push('Unspent\nBudget')
  if (o.showNextMonth) labels.push('Budget -\nNext Month')
  if (o.showAnnual) labels.push('Budget -\nAnnual Total')
  if (labels.length > trailingStart) {
    band.push({ label: '', colSpan: labels.length - trailingStart, tone: o.showYtd ? 'light' : 'dark' })
  }

  // The prior year is an ACTUAL, and gets its own band naming the month it is.
  if (o.showPriorYear) {
    const [y, m] = o.reportMonth.split('-')
    labels.push('Actual')
    band.push({
      label: packMonthYear(`${Number(y) - 1}-${m}`),
      colSpan: 1,
      tone: band[band.length - 1].tone === 'dark' ? 'light' : 'dark',
    })
  }

  return { labels, band, budgetCols, varianceCols, figureCount: labels.length - 1 }
}

/**
 * autoTable options for the Actual vs Budget statements.
 *
 * Not packTableStyles: those serve the insert pages (contractors, payroll,
 * ratios), which Calxa takes from spreadsheets and sets denser and bolder.
 * The statements are Calxa's own report pages, and this is their grain.
 */
export function statementTableStyles(fontSize = 10) {
  // Calxa's 14.3pt pitch at 10pt; the padding scales with the type so a
  // smaller portrait table keeps the same proportions.
  const pad = fontSize >= 10 ? 0.5 : 0.4
  return {
    theme: 'plain' as const,
    styles: {
      fontSize,
      cellPadding: { top: pad, right: 0.6, bottom: pad, left: 1.1 },
      textColor: [0, 0, 0] as RGB,
      lineColor: rgb(TOTAL_RULE),
      lineWidth: { top: 0, right: 0, bottom: 0, left: 0 },
      overflow: 'linebreak' as const,
      valign: 'middle' as const,
    },
    headStyles: {
      fillColor: rgb(BAND_SUB),
      textColor: [0, 0, 0] as RGB,
      fontStyle: 'normal' as const,
      fontSize,
      halign: 'center' as const,
      valign: 'middle' as const,
      lineWidth: { top: 0, right: 0, bottom: 0, left: 0 },
    },
    bodyStyles: { fillColor: [255, 255, 255] as RGB },
    alternateRowStyles: { fillColor: [255, 255, 255] as RGB },
  }
}

/** Indent, in mm, for an account under a section (1) or under a group (2). */
export const INDENT_MM = { 0: 0, 1: 4.9, 2: 9.5 } as const

/**
 * A margin the way Calxa's Additional Information prints it.
 *
 * Whole percent ("56%"); a variance in whole POINTS with no sign ("15");
 * negatives in brackets either way ("(1%)", "(6)"). Rounded half away from
 * zero, so a -5.5 is "(6)" and not the "(5)" Math.round would give.
 */
export function marginPercentText(profit: number, income: number): string {
  if (!Number.isFinite(profit) || !Number.isFinite(income) || income === 0) return '—'
  const n = roundAway((profit / income) * 100)
  return n < 0 ? `(${-n}%)` : `${n}%`
}

export function marginPointsText(points: number | null): string {
  if (points === null || !Number.isFinite(points)) return '—'
  const n = roundAway(points)
  return n < 0 ? `(${-n})` : `${n}`
}

/** profit / income × 100, or null when there is no income to divide by. */
export function marginOf(profit: number, income: number): number | null {
  return Number.isFinite(profit) && Number.isFinite(income) && income !== 0 ? (profit / income) * 100 : null
}

function roundAway(n: number): number {
  const r = Math.round(Math.abs(n))
  return r === 0 ? 0 : Math.sign(n) * r
}
