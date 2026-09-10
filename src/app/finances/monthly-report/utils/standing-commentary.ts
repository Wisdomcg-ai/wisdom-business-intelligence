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

/**
 * WD.3 — which Budget-vs-Actual table in a pack carries the standing lines.
 *
 * They used to render only under an UNFILTERED statement. The Calxa page order
 * has no unfiltered page — only the three section-scoped tables — so a pack in
 * that order silently dropped every standing line, while the Calxa pack it
 * reproduces prints them under the expenses table.
 *
 * Exactly one table hosts them; three copies of "refer to the Payroll Summary
 * page" is its own defect. Preference order:
 *   1. an unfiltered statement, if the pack has one — the legacy behaviour;
 *   2. the LAST expenses-scoped table, which is where Calxa puts them;
 *   3. the last table of any scope, so a pack of only income and COGS tables
 *      still carries the lines rather than losing them again.
 *
 * Takes resolved filters rather than widget configs so it stays pure and knows
 * nothing about the layout schema. Null means "no table in this pack claims
 * them", which the caller reads as the legacy unfiltered-statement rule.
 */
export function pickStandingCommentaryHost(
  tables: ReadonlyArray<{ id?: string; filter: readonly string[] | null }>,
): string | null {
  if (tables.length === 0) return null
  const unfiltered = tables.find((t) => t.filter === null)
  if (unfiltered) return unfiltered.id ?? null
  const expenses = tables.filter((t) => (t.filter ?? []).includes('Operating Expenses')).at(-1)
  return (expenses ?? tables[tables.length - 1]).id ?? null
}
