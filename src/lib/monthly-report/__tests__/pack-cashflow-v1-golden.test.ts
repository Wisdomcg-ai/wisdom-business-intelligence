/**
 * Every client without a cash_model prints exactly the v1 cashflow pages it
 * printed before cash model v2: the engine run, the table rows, the chart
 * series and the basis sentence, deep equal to pack-cashflow-v1-golden.json
 * (captured at 80e8a5b3).
 */
import { describe, it, expect } from 'vitest'
import { packV1GoldenCases } from './pack-cashflow-v1-golden-cases'
import golden from './pack-cashflow-v1-golden.json'

describe('pack cashflow v1 — unchanged for every client without a cash model', () => {
  for (const c of packV1GoldenCases()) {
    it(c.name, () => {
      expect(JSON.parse(JSON.stringify(c.run()))).toEqual((golden as Record<string, unknown>)[c.name])
    })
  }
})
