/**
 * The One-Page Plan prints the target the coach set, in the client's units.
 *
 * Three faults, all in one table, all the same shape — a 0 standing in for
 * "nobody set this":
 *
 *   1. `year1_target || 0` never looked at `target_value`. Precision
 *      Electrical Group — the DEMO account — holds all nine of its targets
 *      there with year1_target at its 0 default, so the page a prospect is
 *      shown read "Target 0" nine times.
 *   2. `kpi.quarter_target` is not a column on business_kpis at all. The
 *      quarter figure lives on the review (`quarterly_targets.kpis`), so that
 *      column was 0 for every KPI of every client.
 *   3. Targets printed bare, so Gross Margin read `30` and ATC Revenue read
 *      `300000` — 30 what, and dollars or jobs?
 *
 * The two spellings of the column read that look right and are not:
 *   `num(year1) ?? num(targetValue)` stops at the numeric 0;
 *   `year1 || targetValue` returns the STRING "0", which is truthy — and one
 *   production row holds exactly that.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { resolveKpiTarget } from '@/lib/kpi/target-source'
import { kpiTargetLabel } from '@/app/quarterly-review/utils/quarterly-plan-page'

describe('resolveKpiTarget — which column holds the target', () => {
  it('prefers year1_target when it holds a real number', () => {
    expect(resolveKpiTarget(250, '45')).toBe(250)
  })

  it('falls through the 0 default to the text column', () => {
    // Precision's shape, exactly: year1_target 0, target_value '716667'.
    expect(resolveKpiTarget(0, '716667')).toBe(716667)
    expect(resolveKpiTarget(0, '45')).toBe(45)
    expect(resolveKpiTarget(0, '2.5')).toBe(2.5)
  })

  it('treats the string "0" as unset — it is truthy, and production holds one', () => {
    expect(resolveKpiTarget(0, '0')).toBeNull()
    expect(resolveKpiTarget(null, '0')).toBeNull()
  })

  it('treats empty, whitespace and unparseable values as unset', () => {
    expect(resolveKpiTarget(null, '')).toBeNull()
    expect(resolveKpiTarget(undefined, '   ')).toBeNull()
    expect(resolveKpiTarget(0, 'TBC')).toBeNull()
    expect(resolveKpiTarget(0, null)).toBeNull()
  })

  it('answers null when nothing was set at all', () => {
    expect(resolveKpiTarget()).toBeNull()
    expect(resolveKpiTarget(0, undefined)).toBeNull()
  })

  it('keeps a negative target, which is a real figure', () => {
    // A reduction target — defect rate, debtor days — can be entered negative.
    expect(resolveKpiTarget(-5)).toBe(-5)
  })
})

describe('what the client reads', () => {
  const shown = (target: number | null, unit: string | null) =>
    kpiTargetLabel({ name: '', target, unit }) ?? '—'

  it("prints Precision's nine targets in their own units", () => {
    expect(shown(resolveKpiTarget(0, '716667'), '$')).toBe('$716,667')
    expect(shown(resolveKpiTarget(0, '30'), '%')).toBe('30%')
    expect(shown(resolveKpiTarget(0, '9.5'), '%')).toBe('9.5%')
    expect(shown(resolveKpiTarget(0, '45'), 'days')).toBe('45 days')
    expect(shown(resolveKpiTarget(0, '500000'), '$')).toBe('$500,000')
  })

  it('says nothing was set rather than printing a zero', () => {
    expect(shown(null, '$')).toBe('—')
    expect(shown(resolveKpiTarget(0, '0'), '%')).toBe('—')
  })

  it('keeps a unit that qualifies the figure, so it is not read as firm-wide', () => {
    // 'AUD per clinician' must not become a flat $250,000.
    expect(shown(250000, 'AUD per clinician')).toContain('per clinician')
    expect(shown(80, 'percent of allocated budget used')).toContain('of allocated budget used')
  })
})

describe('the page and the assembler use those rules', () => {
  const read = (rel: string) => readFileSync(path.resolve(__dirname, rel), 'utf-8')

  it('the assembler resolves each target instead of defaulting it to 0', () => {
    const assembler = read('../../app/one-page-plan/services/plan-data-assembler.ts')
    expect(assembler).toContain("from '@/lib/kpi/target-source'")
    expect(assembler).toMatch(/year1Target: resolveKpiTarget\(kpi\.year1_target, kpi\.target_value\)/)
    expect(assembler).toMatch(/year3Target: resolveKpiTarget\(kpi\.year3_target\)/)
    // The old spellings, both of which print a 0 nobody set.
    expect(assembler).not.toMatch(/year1Target: kpi\.year1_target \|\| 0/)
    expect(assembler).not.toMatch(/quarterTarget: kpi\.quarter_target/)
  })

  it('the quarter figure comes from the review, the only place it is stored', () => {
    const assembler = read('../../app/one-page-plan/services/plan-data-assembler.ts')
    expect(assembler).toMatch(/quarterTarget: resolveKpiTarget\(kpiQuarterTarget\(kpi\)\)/)
    expect(assembler).toMatch(/reviewKpiTargets/)
  })

  it('the page prints through the same formatter as the client PDF', () => {
    const page = read('../../app/one-page-plan/page.tsx')
    expect(page).toContain("from '@/app/quarterly-review/utils/quarterly-plan-page'")
    expect(page).toMatch(/kpiTargetLabel\(\{ name: '', target, unit \}\) \?\? '\\u2014'/)
    // Bare values, with no unit and no em dash, are what this replaced.
    expect(page).not.toMatch(/\{kpi\.year1Target\}/)
    expect(page).not.toMatch(/\{kpi\.quarterTarget\}/)
  })
})
