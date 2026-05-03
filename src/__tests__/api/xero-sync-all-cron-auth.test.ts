/**
 * Phase 46 Plan 46-02 — SEC-02 fail-closed regression tests.
 *
 * RED state: tests 1 and 4 currently fail because the GET handler
 * carve-outs (cronSecret AND NODE_ENV === 'production') let unauthenticated
 * requests through. After applying the !cronSecret || auth !== ... fix
 * from cron/daily-health-report:13-15, all 4 should pass.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/xero/sync-orchestrator', () => ({
  runSyncForAllBusinesses: vi.fn().mockResolvedValue({ businesses: [] }),
  syncBusinessXeroPL: vi.fn(),
}))

// Re-import the module under each test so env mutations take effect.
async function importRoute() {
  vi.resetModules()
  return await import('@/app/api/Xero/sync-all/route')
}

describe('SEC-02: GET /api/Xero/sync-all fails closed', () => {
  const ORIGINAL_ENV = process.env

  beforeEach(() => {
    vi.clearAllMocks()
    process.env = { ...ORIGINAL_ENV, CRON_SECRET: 'test-secret-123', NODE_ENV: 'production' as any }
  })

  afterEach(() => {
    process.env = ORIGINAL_ENV
  })

  it('returns 401 when no Authorization header is sent', async () => {
    const { GET } = await importRoute()
    const req = new NextRequest('http://localhost/api/Xero/sync-all', { method: 'GET' })
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('returns 401 when Authorization header is the wrong bearer', async () => {
    const { GET } = await importRoute()
    const req = new NextRequest('http://localhost/api/Xero/sync-all', {
      method: 'GET',
      headers: { authorization: 'Bearer wrong-secret' },
    })
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('returns 200 when Authorization header matches CRON_SECRET', async () => {
    const { GET } = await importRoute()
    const { runSyncForAllBusinesses } = await import('@/lib/xero/sync-orchestrator')
    const req = new NextRequest('http://localhost/api/Xero/sync-all', {
      method: 'GET',
      headers: { authorization: 'Bearer test-secret-123' },
    })
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(runSyncForAllBusinesses).toHaveBeenCalledTimes(1)
  })

  it('returns 401 when CRON_SECRET is UNSET (fail closed)', async () => {
    process.env = { ...ORIGINAL_ENV, NODE_ENV: 'production' as any }
    delete (process.env as any).CRON_SECRET
    const { GET } = await importRoute()
    const req = new NextRequest('http://localhost/api/Xero/sync-all', { method: 'GET' })
    const res = await GET(req)
    expect(res.status).toBe(401)
  })
})
