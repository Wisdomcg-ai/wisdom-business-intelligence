import { describe, it, expect } from 'vitest'
import { evaluateCronHealth, type MonitoredCron, type HeartbeatSnapshot } from '@/lib/cron/watchdog'

const HOUR = 3_600_000
const NOW = Date.parse('2026-08-08T12:00:00Z')

const cron = (over: Partial<MonitoredCron> = {}): MonitoredCron => ({
  path: '/api/cron/example',
  label: 'Example',
  schedule: '0 * * * *',
  maxStaleHours: 13,
  ...over,
})

const snap = (ageHours: number, status: string): HeartbeatSnapshot => ({
  ranAtMs: NOW - ageHours * HOUR,
  status,
})

describe('evaluateCronHealth', () => {
  it('healthy: fresh success heartbeat raises nothing', () => {
    expect(evaluateCronHealth([cron()], { '/api/cron/example': snap(2, 'success') }, NOW)).toEqual([])
  })

  it('missing: a cron with no heartbeat at all alerts', () => {
    const alerts = evaluateCronHealth([cron()], {}, NOW)
    expect(alerts).toHaveLength(1)
    expect(alerts[0].reason).toBe('missing')
    expect(alerts[0].ageHours).toBeNull()
  })

  it('missing is suppressed inside the activeFrom grace window', () => {
    const recent = new Date(NOW - 2 * HOUR).toISOString()
    expect(evaluateCronHealth([cron({ activeFrom: recent })], {}, NOW)).toEqual([])
  })

  it('missing fires once the activeFrom grace window has fully elapsed', () => {
    const old = new Date(NOW - 14 * HOUR).toISOString() // > maxStaleHours (13)
    const alerts = evaluateCronHealth([cron({ activeFrom: old })], {}, NOW)
    expect(alerts).toHaveLength(1)
    expect(alerts[0].reason).toBe('missing')
  })

  it('stale: past the window, and staleness outranks a failed status', () => {
    const alerts = evaluateCronHealth(
      [cron()],
      { '/api/cron/example': snap(14, 'failed') },
      NOW,
    )
    expect(alerts).toHaveLength(1)
    expect(alerts[0].reason).toBe('stale')
    expect(alerts[0].ageHours).toBeCloseTo(14)
  })

  it('failed: in-window failed heartbeat alerts as failed', () => {
    const alerts = evaluateCronHealth([cron()], { '/api/cron/example': snap(1, 'failed') }, NOW)
    expect(alerts).toHaveLength(1)
    expect(alerts[0].reason).toBe('failed')
  })

  it('degraded: in-window partial heartbeat alerts — a fleet-wide sync failure records partial, not failed', () => {
    const alerts = evaluateCronHealth([cron()], { '/api/cron/example': snap(1, 'partial') }, NOW)
    expect(alerts).toHaveLength(1)
    expect(alerts[0].reason).toBe('degraded')
  })

  it('evaluates each monitored cron independently', () => {
    const crons = [
      cron({ path: '/a', label: 'A' }),
      cron({ path: '/b', label: 'B' }),
      cron({ path: '/c', label: 'C' }),
    ]
    const alerts = evaluateCronHealth(
      crons,
      { '/a': snap(1, 'success'), '/b': snap(20, 'success') /* '/c' missing */ },
      NOW,
    )
    expect(alerts.map((a) => [a.path, a.reason])).toEqual([
      ['/b', 'stale'],
      ['/c', 'missing'],
    ])
  })
})
