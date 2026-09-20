/**
 * /api/Xero/sync-all is retired — the whole route, not just its POST.
 *
 * History: AUTHZ-A (app-authz audit, 24 Aug 2026) deleted the session-only
 * POST, which checked only that a session existed — any signed-in user could
 * sync a business they have no link to, or start the fleet loop with
 * { all: true }. That left a CRON_SECRET-gated GET behind as "Vercel-Cron
 * compatibility". It was never registered in vercel.json, so Vercel never
 * called it, and nothing in the codebase ever had: across the full git
 * history the only files that named the path were the route, its own tests,
 * and comments citing its fail-closed gate.
 *
 * Why it had to go rather than stay as a harmless spare: it ran
 * runSyncForAllBusinesses — a loop budgeted at RUN_ALL_BUDGET_MS = 700s —
 * under `export const maxDuration = 300`. Vercel would kill it mid-fleet,
 * and unlike /api/cron/sync-all-xero it stamped no start-marker heartbeat,
 * could not self-chain, and sent no aggregated Sentry event, so the kill was
 * invisible. Worse, the business being synced at the moment of the kill kept
 * its 'running' sync_jobs row, which blocks that business's syncs for the
 * 15-minute single-flight staleness window (begin_xero_sync_job,
 * supabase/migrations/20260428000005_sync_jobs_state_guard_rpcs.sql). One
 * curl of a route nobody called could therefore freeze a client's sync.
 *
 * The fleet lever is the Vercel cron "Run" button on /api/cron/sync-all-xero,
 * whose 800s ceiling, heartbeats and chaining that loop is sized for. Per
 * business: POST /api/Xero/refresh-pl or POST /api/monthly-report/sync-xero.
 *
 * App Router maps files to endpoints, so a filesystem assertion IS the
 * dispatcher contract here: with no route file there is no endpoint and no
 * module to import, and Next serves 404 without running any code. Same shape
 * as the deletion pins in src/__tests__/security/dead-code-deleted.test.ts.
 * (An `await expect(import(...)).rejects` check can't live here: Vite resolves
 * a literal specifier at transform time and fails the whole file, while a
 * computed specifier throws on the unresolved `@/` alias whether or not the
 * route is back — it would pass for the wrong reason.)
 */

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const REPO_ROOT = path.resolve(__dirname, '../../..')
const RETIRED_DIR = path.join(REPO_ROOT, 'src/app/api/Xero/sync-all')
const ORCHESTRATOR = path.join(REPO_ROOT, 'src/lib/xero/sync-orchestrator.ts')
const FLEET_CRON = path.join(REPO_ROOT, 'src/app/api/cron/sync-all-xero/route.ts')

describe('/api/Xero/sync-all stays retired', () => {
  it('has no route file in any extension App Router would pick up', () => {
    const candidates = ['route.ts', 'route.tsx', 'route.js', 'route.mjs'].map((f) =>
      path.join(RETIRED_DIR, f),
    )
    const present = candidates.filter((p) => fs.existsSync(p)).map((p) => path.relative(REPO_ROOT, p))

    expect(
      present,
      [
        'A route file is back under src/app/api/Xero/sync-all/.',
        'That endpoint ran the 700s fleet loop under maxDuration = 300, so Vercel',
        'killed it mid-fleet and left a business stuck in a "running" sync_jobs row.',
        'Use /api/cron/sync-all-xero (800s, heartbeats, self-chaining) instead.',
      ].join('\n'),
    ).toEqual([])
  })

  it('has no directory left under the Xero route tree', () => {
    expect(fs.existsSync(RETIRED_DIR)).toBe(false)
  })

  // PRESERVE: retiring the shim must not take the real fleet cron with it.
  it('leaves the scheduled fleet cron in place and registered', () => {
    expect(fs.existsSync(FLEET_CRON)).toBe(true)

    const vercelConfig = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, 'vercel.json'), 'utf8'),
    ) as { crons?: Array<{ path: string; schedule: string }> }
    const paths = (vercelConfig.crons ?? []).map((c) => c.path)

    expect(paths).toContain('/api/cron/sync-all-xero')
  })
})

/**
 * The generalised rule, so the next shim can't reintroduce the same defect:
 * any route that runs the fleet loop must give it at least as long as the
 * loop budgets for itself. RUN_ALL_BUDGET_MS is module-private, so it is read
 * from source rather than imported — a rename fails this test loudly, which
 * is the correct outcome.
 */
describe('a route that runs the fleet loop allows at least its wall-clock budget', () => {
  function readBudgetSeconds(): number {
    const src = fs.readFileSync(ORCHESTRATOR, 'utf8')
    const match = src.match(/const\s+RUN_ALL_BUDGET_MS\s*=\s*([\d_]+)/)
    expect(
      match,
      'RUN_ALL_BUDGET_MS not found in sync-orchestrator.ts — if it was renamed, update this test.',
    ).not.toBeNull()
    return Number(match![1].replace(/_/g, '')) / 1000
  }

  function routeFilesCalling(symbol: string): string[] {
    const apiRoot = path.join(REPO_ROOT, 'src/app/api')
    const found: string[] = []
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (/^route\.(ts|tsx|js|mjs)$/.test(entry.name)) {
          if (new RegExp(`\\b${symbol}\\s*\\(`).test(fs.readFileSync(full, 'utf8'))) found.push(full)
        }
      }
    }
    walk(apiRoot)
    return found
  }

  it('every caller of runSyncForAllBusinesses declares maxDuration >= the budget', () => {
    const budgetSeconds = readBudgetSeconds()
    const callers = routeFilesCalling('runSyncForAllBusinesses')

    // If this is ever empty the fleet cron has stopped calling the orchestrator.
    expect(callers.length).toBeGreaterThan(0)

    const tooShort = callers
      .map((file) => {
        const src = fs.readFileSync(file, 'utf8')
        const match = src.match(/export\s+const\s+maxDuration\s*=\s*(\d+)/)
        return { file: path.relative(REPO_ROOT, file), maxDuration: match ? Number(match[1]) : null }
      })
      .filter((r) => r.maxDuration === null || r.maxDuration < budgetSeconds)

    expect(
      tooShort,
      [
        `runSyncForAllBusinesses budgets ${budgetSeconds}s of wall clock, but these routes`,
        'cap the function below that (or declare no maxDuration at all). Vercel kills the',
        'run mid-fleet: no completion heartbeat, no chain handoff, and the business being',
        'synced keeps a "running" sync_jobs row that blocks it for 15 minutes.',
        ...tooShort.map((r) => `  ${r.file} — maxDuration = ${r.maxDuration ?? 'undeclared'}`),
      ].join('\n'),
    ).toEqual([])
  })
})
