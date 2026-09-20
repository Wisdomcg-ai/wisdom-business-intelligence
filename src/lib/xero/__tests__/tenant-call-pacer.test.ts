/**
 * The pacer holds one organisation's calls inside Xero's limits, on a virtual
 * clock: no 60-second window starts more calls than the pacer allows, and no
 * more are ever open at once.
 */
import { describe, it, expect } from 'vitest'
import { createTenantCallPacer } from '../tenant-call-pacer'
import { virtualClock, busiestWindow } from './virtual-clock'

describe('createTenantCallPacer', () => {
  it('starts no more than its limit in any minute, and holds no more than its limit open', async () => {
    const clock = virtualClock()
    const pacer = createTenantCallPacer({ maxPerMinute: 50, maxConcurrent: 4, clock })
    const starts: number[] = []
    let open = 0
    let mostOpen = 0
    const call = async (i: number) => {
      starts.push(clock.now())
      open++
      mostOpen = Math.max(mostOpen, open)
      await clock.sleep(40 + (i % 3) * 100)
      open--
      return i
    }
    const results = await Promise.all(Array.from({ length: 180 }, (_, i) => pacer.run(() => call(i))))
    expect(results).toHaveLength(180)
    expect(busiestWindow(starts)).toBeLessThanOrEqual(50)
    expect(mostOpen).toBeLessThanOrEqual(4)
    // 180 calls at 50 a minute cannot finish inside three minutes.
    expect(clock.elapsed()).toBeGreaterThanOrEqual(3 * 60_000)
  })

  it('never lets a caller raise the limits past Xero\'s', async () => {
    const clock = virtualClock()
    const pacer = createTenantCallPacer({ maxPerMinute: 500, maxConcurrent: 50, clock })
    const starts: number[] = []
    let open = 0
    let mostOpen = 0
    await Promise.all(Array.from({ length: 130 }, () => pacer.run(async () => {
      starts.push(clock.now())
      open++
      mostOpen = Math.max(mostOpen, open)
      await clock.sleep(10)
      open--
    })))
    expect(busiestWindow(starts)).toBeLessThanOrEqual(60)
    expect(mostOpen).toBeLessThanOrEqual(5)
  })

  it('a call that throws gives its slot back', async () => {
    const pacer = createTenantCallPacer({ maxConcurrent: 1, clock: virtualClock() })
    await expect(pacer.run(async () => { throw new Error('boom') })).rejects.toThrow('boom')
    await expect(pacer.run(async () => 'next')).resolves.toBe('next')
  })
})
