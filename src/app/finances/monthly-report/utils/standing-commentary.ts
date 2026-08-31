/**
 * WD.3 — standing "refer to …" commentary lines, declared per pack.
 *
 * The gate: a standing line pointing at a page that is NOT in this pack is a
 * WARNING, never silent — the line still renders, marked, so the coach sees
 * the dangling reference instead of the client chasing a page that isn't
 * there.
 *
 * Pure — the PDF service builds the pack's page-label set and calls annotate.
 */
import type { StandingCommentaryLine } from '../types'

export interface AnnotatedStandingLine extends StandingCommentaryLine {
  in_pack: boolean
}

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/**
 * A refer_to matches a pack page when either normalized string contains the
 * other ("Wages" ↔ "Wages Analysis", "Cashflow" ↔ "Cashflow Forecast").
 * Empty refer_to never matches.
 */
export function annotateStandingLines(
  lines: ReadonlyArray<StandingCommentaryLine>,
  packPageLabels: ReadonlyArray<string>,
): AnnotatedStandingLine[] {
  const labels = packPageLabels.map(normalize).filter(Boolean)
  return lines
    .filter((l) => l && typeof l.label === 'string' && l.label.trim() !== '')
    .map((l) => {
      const target = normalize(l.refer_to ?? '')
      const in_pack =
        target !== '' && labels.some((p) => p.includes(target) || target.includes(p))
      return { label: l.label.trim(), refer_to: (l.refer_to ?? '').trim(), in_pack }
    })
}
