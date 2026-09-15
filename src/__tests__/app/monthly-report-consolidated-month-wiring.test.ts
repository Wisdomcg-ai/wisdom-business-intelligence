/**
 * DRG-16 / DRG-52 — the page's side of the consolidated fixes.
 *
 * The hooks carry the behaviour (useConsolidatedReport.month,
 * useMonthlyReport.consolidation-detection). What only the 2,300-line page can
 * get wrong is whether it USES them, so these read the page source, the same
 * approach proceed-as-draft-persistence takes for its client wiring — no
 * React-tree mount of the whole monthly report page.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve(__dirname, '../../app/finances/monthly-report/page.tsx'), 'utf-8')

/** The body of `const <name> = async (…) => { … }`, up to the next top-level const. */
function handlerBody(name: string): string {
  const start = source.indexOf(`const ${name} = async`)
  expect(start).toBeGreaterThan(-1)
  const next = source.indexOf('\n  const ', start + 1)
  return source.slice(start, next === -1 ? undefined : next)
}

describe('changing month', () => {
  it('clears the consolidated P&L and balance-sheet caches', () => {
    const body = handlerBody('handleMonthChange')
    expect(body).toMatch(/clearConsolidated\(\)/)
    expect(body).toMatch(/clearConsolidatedBS\(\)/)
  })
})

describe('the export', () => {
  it("reuses the tab's consolidated report only when it is the selected month's", () => {
    const body = handlerBody('loadPdfSections')
    expect(body).toMatch(/consolidatedReportFor\(selectedMonth, fiscalYear\)/)
    // The bare cache, which can hold a month viewed earlier in the visit.
    expect(body).not.toMatch(/\(consolidatedReport as any\)\s*\|\|/)
  })
})

describe('the Generate Report button', () => {
  it('is disabled until consolidation detection has answered', () => {
    const at = source.indexOf('onClick={() => handleGenerateReport()}')
    expect(at).toBeGreaterThan(-1)
    const button = source.slice(at, source.indexOf('</button>', at))
    expect(button).toMatch(/disabled=\{[^}]*isConsolidationGroup === null[^}]*\}/)
  })
})
