/**
 * The engine's output for every caller that does not ask for cash model v2 —
 * the forecast wizard, the consolidated cashflow, the pack's v1 pages — deep
 * equal to what it was before v2's options existed (engine-golden.json,
 * captured at 80e8a5b3). A v2 option that leaked into the default path would
 * move a wizard or consolidated cashflow without a sound; this is the sound.
 *
 * Compared through JSON, which is how the golden was written: it keeps every
 * key and figure and drops only `undefined`.
 */
import { describe, it, expect } from 'vitest'
import { generateCashflowForecast } from './engine'
import { goldenCases } from './__fixtures__/engine-golden-cases'
import golden from './__fixtures__/engine-golden.json'

describe('generateCashflowForecast — byte-identical without the v2 options', () => {
  for (const c of goldenCases()) {
    it(c.name, () => {
      const out = generateCashflowForecast(c.lines, c.payroll, c.assumptions, c.forecast, c.plannedSpends, c.options)
      expect(JSON.parse(JSON.stringify(out))).toEqual((golden as Record<string, unknown>)[c.name])
    })
  }

  it('has a golden for every case, and a case for every golden', () => {
    expect(Object.keys(golden).sort()).toEqual(goldenCases().map((c) => c.name).sort())
  })
})
