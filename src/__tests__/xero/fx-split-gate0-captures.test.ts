/**
 * FX account split — gate 0, on Urban Road's LIVE captures.
 *
 * Every Urban Road Trial Balance and catalog elsewhere in these tests is
 * constructed. Two things only a live capture can prove:
 *   1. the Trial Balance carries Bank Revaluations (497) and the three FX
 *      accounts tie to the merged P&L row (238.61 Jul-26, 919.25 Aug-26) —
 *      neither IICT nor JDS has a BANKCURRENCYGAIN account to prove it on;
 *   2. the /Accounts response carries SystemAccount on 497/498/499. No
 *      committed capture contains SystemAccount at all; if Xero left it out,
 *      every month would keep its merged row as 'no_system_accounts' — safe,
 *      but no split, and a TB-only gate would not notice.
 *
 * These run once Matt commits the captures (they refresh the Xero token, so
 * they are never run through Claude):
 *   npx tsx scripts/capture-trialbalance-fixture.ts --business-id=28d41193-38ae-4071-a2b1-0dbea90a38fd \
 *     --tenant-id=8519c134-ed81-4d9b-8f07-ce499d12b7ee --balance-date=2026-07-31 \
 *     --label=urban-road-trialbalance-2026-07-31 --accounts-label=urban-road-accounts
 *   ... --balance-date=2026-08-31 --label=urban-road-trialbalance-2026-08-31
 * Until then they are skipped, visibly. Keep sections.fx_account_split OFF for
 * Urban Road until they pass.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import { parsePLSinglePeriod } from '@/lib/xero/pl-single-period-parser'
import { parseTrialBalanceMovements } from '@/lib/xero/trialbalance-parser'
import { fxSystemAccountIds, splitFxGroupMonth } from '@/lib/xero/fx-group-split'
import { UR_TENANT, UR_FX_MERGED, plReport, urbanRoadBook } from './helpers/fx-split-harness'

vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}))

const FIXTURES = path.join(__dirname, 'fixtures')
const ACCOUNTS = path.join(FIXTURES, 'urban-road-accounts.json')
const TB = (d: string) => path.join(FIXTURES, `urban-road-trialbalance-${d}.json`)
const read = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8')) as { _meta: any; response: any }

afterEach(() => {
  vi.restoreAllMocks()
})

async function liveCatalog() {
  const capture = read(ACCOUNTS)
  expect(capture._meta.tenant_id).toBe(UR_TENANT)
  vi.spyOn(global, 'fetch').mockResolvedValueOnce(
    new Response(JSON.stringify(capture.response), { status: 200, headers: { 'Content-Type': 'application/json' } }),
  )
  const stub: any = { from: () => ({ upsert: async (rows: unknown) => ({ data: rows, error: null }) }) }
  const { refreshXeroAccountsCatalog } = await import('@/lib/xero/accounts-catalog')
  return refreshXeroAccountsCatalog(stub, { id: 'conn-ur', tenant_id: UR_TENANT, business_id: 'biz' } as any, 'tok')
}

describe.runIf(fs.existsSync(ACCOUNTS))('gate 0 — Urban Road /Accounts capture', () => {
  it('the catalog, built by the sync from the live response, names all three FX system accounts', async () => {
    const catalog = await liveCatalog()
    const ids = fxSystemAccountIds(catalog)
    expect(ids.map((id) => catalog.get(id)!.system_account)).toEqual([
      'BANKCURRENCYGAIN',
      'UNREALISEDCURRENCYGAIN',
      'REALISEDCURRENCYGAIN',
    ])
    expect(ids.map((id) => catalog.get(id)!.account_code)).toEqual(['497', '498', '499'])
  })
})

describe.runIf(fs.existsSync(ACCOUNTS) && fs.existsSync(TB('2026-07-31')) && fs.existsSync(TB('2026-08-31')))(
  'gate 0 — Urban Road Trial Balance captures',
  () => {
    for (const [date, month] of [['2026-07-31', '2026-07-01'], ['2026-08-31', '2026-08-01']] as const) {
      it(`${month}: 497 is in the Trial Balance and the three accounts tie to the merged ${UR_FX_MERGED[month]}`, async () => {
        const catalog = await liveCatalog()
        const tb = read(TB(date))
        expect(tb._meta.tenant_id).toBe(UR_TENANT)
        const movements = parseTrialBalanceMovements(tb.response)
        const [bankReval] = fxSystemAccountIds(catalog)
        expect(movements.some((m) => m.account_id === bankReval)).toBe(true)
        const plRows = parsePLSinglePeriod(plReport(month, urbanRoadBook().monthRows(month)), month, 'accruals', UR_TENANT)
        const out = splitFxGroupMonth({ plRows, tbMovements: movements, catalog, tenantId: UR_TENANT })
        expect(out).toMatchObject({ kind: 'split' })
        if (out.kind !== 'split') return
        expect(out.rows.map((r) => r.account_code)).toEqual(['497', '498', '499'])
        expect(Math.abs(out.residual)).toBeLessThanOrEqual(0.05)
      })
    }
  },
)
