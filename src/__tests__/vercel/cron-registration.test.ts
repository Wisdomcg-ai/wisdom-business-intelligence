/**
 * Phase 69-03 — Vercel cron registration parity test.
 *
 * Asserts vercel.json's `crons[]` list and the routes on disk under
 * src/app/api/cron/* stay in 1:1 lockstep. Catches BOTH directions of drift:
 *
 *  - Forward drift: a new route added under src/app/api/cron/ but not
 *    registered in vercel.json. Phase 69's secondary regression
 *    (daily-health-report route existed but had no vercel.json entry, so it
 *    never fired in production) was exactly this shape. Test 1 catches it on
 *    day 1.
 *
 *  - Backward drift: a stale vercel.json entry pointing at a route that no
 *    longer exists on disk. Test 2 catches it — produces 404s in Vercel
 *    invocation logs (better than silent failure, but still noise).
 *
 * Why the file-system test instead of a Vercel API check: this test runs in
 * CI (no Vercel auth available, no remote calls) and is deterministic. It
 * would have caught the daily-health-report miss at PR-review time instead
 * of after deploy.
 *
 * Per 69-DIAGNOSIS.md the actual root cause was Vercel's scheduler not
 * registering the refresh-xero-tokens cron despite vercel.json being correct.
 * This test does not catch that platform-level miss directly — but it does
 * lock the codebase invariant that "every cron route on disk must be
 * declared in vercel.json", so when Matt redeploys to force re-registration,
 * he has a CI gate confirming there are no stale or missing declarations to
 * compound the issue.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

interface VercelConfig {
  crons?: Array<{ path: string; schedule: string }>
}

const REPO_ROOT = path.resolve(__dirname, '../../..')
const VERCEL_JSON_PATH = path.join(REPO_ROOT, 'vercel.json')
const CRON_ROUTES_DIR = path.join(REPO_ROOT, 'src/app/api/cron')

function readVercelCronPaths(): string[] {
  const raw = fs.readFileSync(VERCEL_JSON_PATH, 'utf-8')
  const config = JSON.parse(raw) as VercelConfig
  return (config.crons ?? []).map((c) => c.path).sort()
}

function readCronRoutePathsOnDisk(): string[] {
  if (!fs.existsSync(CRON_ROUTES_DIR)) return []
  const entries = fs.readdirSync(CRON_ROUTES_DIR, { withFileTypes: true })
  const routes: string[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const routeFile = path.join(CRON_ROUTES_DIR, entry.name, 'route.ts')
    if (fs.existsSync(routeFile)) {
      routes.push(`/api/cron/${entry.name}`)
    }
  }
  return routes.sort()
}

describe('vercel.json cron registration parity — phase-69', () => {
  it('every cron route on disk has a matching vercel.json entry', () => {
    const onDisk = readCronRoutePathsOnDisk()
    const inVercelJson = readVercelCronPaths()
    const missingFromVercelJson = onDisk.filter((p) => !inVercelJson.includes(p))

    expect(missingFromVercelJson, [
      'Cron route(s) exist on disk but are NOT declared in vercel.json.',
      'Vercel will never invoke them — the route is dead code in production.',
      'Add an entry per missing path:',
      ...missingFromVercelJson.map((p) => `  { "path": "${p}", "schedule": "<cron-expr>" }`),
    ].join('\n')).toEqual([])
  })

  it('every vercel.json cron entry corresponds to a route file on disk', () => {
    const onDisk = readCronRoutePathsOnDisk()
    const inVercelJson = readVercelCronPaths()
    const stale = inVercelJson.filter((p) => !onDisk.includes(p))

    expect(stale, [
      'vercel.json declares cron(s) for which no route file exists on disk.',
      'These will 404 in production and pollute Vercel invocation logs.',
      'Either delete the vercel.json entry or restore the route file:',
      ...stale.map((p) => `  ${p}`),
    ].join('\n')).toEqual([])
  })

  it('every cron entry has a non-empty schedule string', () => {
    const raw = fs.readFileSync(VERCEL_JSON_PATH, 'utf-8')
    const config = JSON.parse(raw) as VercelConfig
    const crons = config.crons ?? []
    const missingSchedule = crons.filter(
      (c) => !c.schedule || typeof c.schedule !== 'string' || c.schedule.trim() === '',
    )
    expect(missingSchedule, 'Every cron entry must declare a non-empty schedule.').toEqual([])
  })

  it('phase-69 regression guard: daily-health-report is registered', () => {
    // Pin the exact regression that motivated Phase 69-03. If anyone removes
    // this entry from vercel.json again, this test will name the regression
    // by phase number at PR-review time.
    const inVercelJson = readVercelCronPaths()
    expect(inVercelJson).toContain('/api/cron/daily-health-report')
  })

  it('phase-69 regression guard: refresh-xero-tokens is registered', () => {
    // Pin the primary cron whose silent absence from Vercel's scheduler was
    // the root cause of Phase 69. The codebase has always had this entry;
    // this test ensures it cannot be silently removed by an unrelated
    // vercel.json edit.
    const inVercelJson = readVercelCronPaths()
    expect(inVercelJson).toContain('/api/cron/refresh-xero-tokens')
  })
})
