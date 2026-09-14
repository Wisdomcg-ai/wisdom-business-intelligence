/**
 * Writes the golden outputs the cashflow identity tests pin:
 *   src/lib/cashflow/__fixtures__/engine-golden.json       (engine, every caller's options)
 *   src/lib/monthly-report/__tests__/pack-cashflow-v1-golden.json (the pack's v1 pages)
 *
 * Run it ONLY on a commit before an intended engine change, so the goldens are
 * what the engine did, not what it now does:
 *   git stash-free: git worktree add /tmp/before <sha> && cd /tmp/before && npx tsx scripts/gen-cashflow-goldens.ts
 */
import fs from 'fs'
import path from 'path'
import { generateCashflowForecast } from '@/lib/cashflow/engine'
import { goldenCases } from '@/lib/cashflow/__fixtures__/engine-golden-cases'
import { packV1GoldenCases } from '@/lib/monthly-report/__tests__/pack-cashflow-v1-golden-cases'

const engine = Object.fromEntries(goldenCases().map((c) => [
  c.name,
  generateCashflowForecast(c.lines, c.payroll, c.assumptions, c.forecast, c.plannedSpends, c.options),
]))
fs.writeFileSync(path.resolve('src/lib/cashflow/__fixtures__/engine-golden.json'), JSON.stringify(engine, null, 1) + '\n')

const pack = Object.fromEntries(packV1GoldenCases().map((c) => [c.name, c.run()]))
fs.writeFileSync(path.resolve('src/lib/monthly-report/__tests__/pack-cashflow-v1-golden.json'), JSON.stringify(pack, null, 1) + '\n')
console.log(`wrote ${Object.keys(engine).length} engine goldens, ${Object.keys(pack).length} pack goldens`)
