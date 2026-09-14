/**
 * FX account split — flag OFF is byte-identical to origin/main.
 *
 * The split rewrites what the critical sync persists for the one business that
 * opts in. Every other client must see NOTHING change: not a row, not a key
 * order, not an extra request, not an extra select. This suite drives the
 * orchestrator end to end (mocked Xero + Supabase, Date frozen so updated_at is
 * deterministic) and serialises the complete ordered I/O log — every Xero URL
 * with its tenant header, every Supabase call with its payload and filters,
 * and the SyncResult — then compares the JSON string with a golden captured
 * from origin/main (6daabd48) BEFORE any FX split code existed.
 *
 * The Urban Road-shaped book carries a real FXGROUPID row in every month and a
 * catalog that already names the three FX system accounts, so the flag-off
 * path is exercised against exactly the data the split would act on.
 *
 * Regenerate ONLY from a checkout of main: UPDATE_FX_GOLDEN=1 npx vitest run <this file>
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  installSupabaseStub,
  routeXero,
  urbanRoadBook,
  UR_BIZ,
  UR_TENANT,
  UR_CONNECTION,
  SECOND_CONNECTION,
  SECOND_TENANT,
  ACC_SALES,
  type FetchRecord,
  type StubConfig,
  type TenantBook,
} from './helpers/fx-split-harness'

vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}))

const supabaseMock: any = {}
vi.mock('@/lib/supabase/admin', () => ({
  createServiceRoleClient: () => supabaseMock,
}))

vi.mock('@/lib/xero/token-manager', () => ({
  getValidAccessToken: vi.fn(async () => ({ success: true, accessToken: 'access-token-mock' })),
}))

const GOLDEN_PATH = path.join(__dirname, 'fixtures', 'sync-orchestrator-fx-flag-off-golden.json')

type Scenario = {
  name: string
  cfg: Omit<StubConfig, 'connections'> & { connections?: StubConfig['connections'] }
  books?: Record<string, TenantBook>
  env?: Record<string, string>
  /** Keys the flag-ON-but-refused path legitimately adds to sync_jobs. */
  stripFxSplitRecord?: boolean
}

const secondBook: TenantBook = {
  catalog: [{ id: ACC_SALES, code: '200', name: 'Sales', type: 'REVENUE' }],
  monthRows: () => [{ name: 'Sales', id: ACC_SALES, amount: 250, section: 'Income' }],
}

const SCENARIOS: Scenario[] = [
  { name: 'A: no settings row', cfg: { settings: null } },
  { name: 'B: cash_basis on, split flag absent', cfg: { settings: { sections: { cash_basis: true, cashflow: true } } } },
  { name: 'C: fx_account_split false', cfg: { settings: { sections: { fx_account_split: false } } } },
  { name: 'D: fx_account_split "true" (a string is not opt-in)', cfg: { settings: { sections: { fx_account_split: 'true' } } } },
  {
    name: 'E: flag on but XERO_FX_SPLIT_DISABLE=true',
    cfg: { settings: { sections: { fx_account_split: true } } },
    env: { XERO_FX_SPLIT_DISABLE: 'true' },
  },
  {
    name: 'F: flag on, two active connections (multi-org refused)',
    cfg: {
      settings: { sections: { fx_account_split: true } },
      connections: [UR_CONNECTION, SECOND_CONNECTION],
    },
    books: { [UR_TENANT]: urbanRoadBook(), [SECOND_TENANT]: secondBook },
    stripFxSplitRecord: true,
  },
]

async function capture(s: Scenario) {
  const stub = installSupabaseStub(supabaseMock, {
    connections: s.cfg.connections ?? [UR_CONNECTION],
    ...s.cfg,
  })
  const fetches: FetchRecord[] = []
  vi.spyOn(global, 'fetch').mockImplementation(
    routeXero(s.books ?? { [UR_TENANT]: urbanRoadBook() }, fetches) as any,
  )
  const { syncBusinessXeroPL } = await import('@/lib/xero/sync-orchestrator')
  const result = await syncBusinessXeroPL(UR_BIZ)
  const events = stub.events.map((e) => {
    if (!s.stripFxSplitRecord || e.table !== 'sync_jobs' || e.op !== 'update') return e
    const payload = JSON.parse(JSON.stringify(e.payload))
    if (payload?.reconciliation?.pl) delete payload.reconciliation.pl.fx_split
    return { ...e, payload }
  })
  return { result, fetches, events }
}

beforeEach(() => {
  // Date only: no timer is needed on these happy paths, and a frozen clock
  // makes every updated_at / started_at comparable byte for byte.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-14T02:00:00Z'))
  vi.resetModules()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('FX account split — flag off is byte-identical to origin/main', () => {
  const golden: Record<string, string> = fs.existsSync(GOLDEN_PATH)
    ? JSON.parse(fs.readFileSync(GOLDEN_PATH, 'utf8'))
    : {}
  const updating = process.env.UPDATE_FX_GOLDEN === '1'
  const captured: Record<string, string> = {}

  for (const s of SCENARIOS) {
    it(s.name, async () => {
      for (const [k, v] of Object.entries(s.env ?? {})) vi.stubEnv(k, v)
      const out = await capture(s)
      // Sanity: the scenario really did run the Urban Road book.
      expect(out.result.status).toBe('success')
      expect(out.fetches.some((f) => f.url.includes('ProfitAndLoss'))).toBe(true)
      expect(out.fetches.some((f) => f.url.includes('TrialBalance'))).toBe(false)
      const serialised = JSON.stringify(out)
      captured[s.name] = serialised
      if (updating) {
        fs.writeFileSync(GOLDEN_PATH, JSON.stringify({ ...golden, ...captured }, null, 1) + '\n')
        return
      }
      expect(golden[s.name], `golden missing for ${s.name}`).toBeDefined()
      expect(serialised).toBe(golden[s.name])
    })
  }
})
