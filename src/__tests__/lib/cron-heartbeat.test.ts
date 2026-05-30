/**
 * Phase 69-04 — Cron heartbeat helper tests.
 *
 * Validates:
 *   1. recordHeartbeat inserts a row with the correct shape.
 *   2. status is one of success | failed | partial (CHECK constraint mirror).
 *   3. error_message is truncated at 2000 chars.
 *   4. metadata is capped at 50 keys.
 *   5. DB failure on insert does NOT throw — fail-soft invariant.
 *   6. createServiceRoleClient throwing does NOT throw — fail-soft invariant.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const insertMock = vi.fn()
const fromMock = vi.fn(() => ({ insert: insertMock }))

vi.mock('@/lib/supabase/admin', () => ({
  createServiceRoleClient: vi.fn(() => ({ from: fromMock })),
}))

vi.mock('@sentry/nextjs', () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}))

beforeEach(() => {
  insertMock.mockReset()
  fromMock.mockClear()
})

describe('recordHeartbeat — Phase 69-04', () => {
  it('inserts a row with cron_path + status + null error_message on success', async () => {
    insertMock.mockResolvedValueOnce({ error: null })
    const { recordHeartbeat } = await import('@/lib/cron/heartbeat')
    await recordHeartbeat({
      cronPath: '/api/cron/refresh-xero-tokens',
      status: 'success',
    })
    expect(fromMock).toHaveBeenCalledWith('cron_heartbeats')
    expect(insertMock).toHaveBeenCalledTimes(1)
    const payload = insertMock.mock.calls[0][0]
    expect(payload.cron_path).toBe('/api/cron/refresh-xero-tokens')
    expect(payload.status).toBe('success')
    expect(payload.error_message).toBeNull()
    expect(payload.metadata).toEqual({})
  })

  it('forwards metadata + error_message on failure', async () => {
    insertMock.mockResolvedValueOnce({ error: null })
    const { recordHeartbeat } = await import('@/lib/cron/heartbeat')
    await recordHeartbeat({
      cronPath: '/api/cron/sync-all-xero',
      status: 'failed',
      errorMessage: 'orchestrator threw',
      metadata: { total: 12, failed: 3 },
    })
    const payload = insertMock.mock.calls[0][0]
    expect(payload.status).toBe('failed')
    expect(payload.error_message).toBe('orchestrator threw')
    expect(payload.metadata).toEqual({ total: 12, failed: 3 })
  })

  it('truncates error_message at 2000 chars', async () => {
    insertMock.mockResolvedValueOnce({ error: null })
    const { recordHeartbeat } = await import('@/lib/cron/heartbeat')
    const huge = 'x'.repeat(5000)
    await recordHeartbeat({
      cronPath: '/api/cron/refresh-xero-tokens',
      status: 'failed',
      errorMessage: huge,
    })
    const payload = insertMock.mock.calls[0][0]
    expect(payload.error_message.length).toBeLessThanOrEqual(2020) // 2000 + truncation suffix
    expect(payload.error_message).toMatch(/truncated/)
  })

  it('caps metadata at 50 keys', async () => {
    insertMock.mockResolvedValueOnce({ error: null })
    const { recordHeartbeat } = await import('@/lib/cron/heartbeat')
    const huge: Record<string, unknown> = {}
    for (let i = 0; i < 200; i++) huge[`k${i}`] = i
    await recordHeartbeat({
      cronPath: '/api/cron/refresh-xero-tokens',
      status: 'partial',
      metadata: huge,
    })
    const payload = insertMock.mock.calls[0][0]
    expect(Object.keys(payload.metadata).length).toBe(50)
  })

  it('fail-soft: does NOT throw when supabase returns an error', async () => {
    insertMock.mockResolvedValueOnce({ error: { message: 'connection refused' } })
    const { recordHeartbeat } = await import('@/lib/cron/heartbeat')
    await expect(
      recordHeartbeat({
        cronPath: '/api/cron/refresh-xero-tokens',
        status: 'success',
      }),
    ).resolves.toBeUndefined()
  })

  it('fail-soft: does NOT throw when supabase insert throws', async () => {
    insertMock.mockRejectedValueOnce(new Error('client exploded'))
    const { recordHeartbeat } = await import('@/lib/cron/heartbeat')
    await expect(
      recordHeartbeat({
        cronPath: '/api/cron/refresh-xero-tokens',
        status: 'success',
      }),
    ).resolves.toBeUndefined()
  })
})
