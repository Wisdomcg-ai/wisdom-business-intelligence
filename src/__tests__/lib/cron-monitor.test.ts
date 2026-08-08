/**
 * Tests for withCronMonitor — the Sentry Cron Monitors watchdog wrapper.
 *
 * The security property under test: a 401 run reports NOTHING (so Sentry's
 * missed-check-in alert fires instead — how a CRON_SECRET outage is caught),
 * a successful run reports `ok`, a failed run reports `error`, and a monitoring
 * failure can never break the cron.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { captureCheckIn } = vi.hoisted(() => ({
  captureCheckIn: vi.fn((_checkIn: Record<string, unknown>, _config?: unknown): string => 'checkin-id'),
}))
vi.mock('@sentry/nextjs', () => ({ captureCheckIn }))

import { withCronMonitor, monitorCron } from '@/lib/cron/monitor'
import type { MonitoredCron } from '@/lib/cron/watchdog'

const MONITOR: MonitoredCron = {
  path: '/api/cron/test-cron', label: 'Test cron', schedule: '0 * * * *',
  maxStaleHours: 5, checkinMarginMinutes: 10, maxRuntimeMinutes: 5,
}
const req = () => new Request('http://x/api/cron/test')

beforeEach(() => vi.clearAllMocks())

describe('withCronMonitor', () => {
  it('reports ok on a 2xx response and passes the response through', async () => {
    const handler = vi.fn(async () => new Response('done', { status: 200 }))
    const res = await withCronMonitor(MONITOR, handler)(req())

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('done')
    expect(captureCheckIn).toHaveBeenCalledTimes(1)
    const [checkIn, config] = captureCheckIn.mock.calls[0]
    expect(checkIn).toEqual({ monitorSlug: 'test-cron', status: 'ok' })
    expect(config).toMatchObject({ schedule: { type: 'crontab', value: '0 * * * *' } })
  })

  it('reports error on a 5xx response', async () => {
    const handler = vi.fn(async () => new Response('boom', { status: 500 }))
    await withCronMonitor(MONITOR, handler)(req())
    expect(captureCheckIn).toHaveBeenCalledWith(
      { monitorSlug: 'test-cron', status: 'error' },
      expect.anything(),
    )
  })

  it('does NOT check in on a 401 — a missed run is what should alert', async () => {
    const handler = vi.fn(async () => new Response('unauthorized', { status: 401 }))
    const res = await withCronMonitor(MONITOR, handler)(req())
    expect(res.status).toBe(401)
    expect(captureCheckIn).not.toHaveBeenCalled()
  })

  it('reports error and re-throws when the handler throws', async () => {
    const boom = new Error('handler exploded')
    const handler = vi.fn(async () => { throw boom })
    await expect(withCronMonitor(MONITOR, handler)(req())).rejects.toBe(boom)
    expect(captureCheckIn).toHaveBeenCalledWith(
      { monitorSlug: 'test-cron', status: 'error' },
      expect.anything(),
    )
  })

  it('skips the check-in when shouldMonitor returns false (e.g. a chain link)', async () => {
    const handler = vi.fn(async () => new Response('ok', { status: 200 }))
    await withCronMonitor(MONITOR, handler, () => false)(req())
    expect(captureCheckIn).not.toHaveBeenCalled()
  })

  it('never breaks the cron if the monitoring call itself throws', async () => {
    captureCheckIn.mockImplementationOnce(() => { throw new Error('sentry down') })
    const handler = vi.fn(async () => new Response('ok', { status: 200 }))
    const res = await withCronMonitor(MONITOR, handler)(req())
    expect(res.status).toBe(200)
  })
})

describe('monitorCron (registry lookup)', () => {
  it('checks in using the registered monitor for a known cron path', async () => {
    const handler = vi.fn(async () => new Response('ok', { status: 200 }))
    await monitorCron('/api/cron/refresh-xero-tokens', handler)(req())
    expect(captureCheckIn).toHaveBeenCalledWith(
      { monitorSlug: 'refresh-xero-tokens', status: 'ok' },
      expect.objectContaining({ schedule: { type: 'crontab', value: '0 */6 * * *' } }),
    )
  })

  it('runs unmonitored (no check-in) for an unregistered cron path', async () => {
    const handler = vi.fn(async () => new Response('ok', { status: 200 }))
    const res = await monitorCron('/api/cron/does-not-exist', handler)(req())
    expect(res.status).toBe(200)
    expect(captureCheckIn).not.toHaveBeenCalled()
  })
})
