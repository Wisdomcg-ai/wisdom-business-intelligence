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

/** The period band — muted, so it frames the columns without competing with them. */
export const BAND: RGB = [169, 165, 176]
/** The column-label row beneath the band. */
export const BAND_SUB: RGB = [240, 240, 240]
export const BAND_SUB_TEXT: RGB = [55, 55, 55]
/** Section names ("Income", "Cost of Sales") — present, not loud. */
export const SECTION_TEXT: RGB = [130, 130, 130]
/** Hairline under a row. */
export const RULE: RGB = [223, 223, 223]
/** Heavier rule above a total. */
export const RULE_STRONG: RGB = [140, 140, 140]
/** The year-to-date column block. */
export const GROUP_SHADE: RGB = [247, 247, 247]
/** Unfavourable figures. Calxa's red, not a warning red. */
export const NEGATIVE: RGB = [192, 0, 0]
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
      cellPadding: { top: 1.8, right: 2, bottom: 1.8, left: 2 },
      textColor: rgb(TEXT),
      lineColor: rgb(RULE),
      lineWidth: { top: 0, right: 0, bottom: 0.1, left: 0 },
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
  if (text.startsWith('(') && text.endsWith(')')) {
    data.cell.styles.textColor = rgb(NEGATIVE)
  }
}
