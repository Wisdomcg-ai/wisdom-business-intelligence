/**
 * B2 (22 Sep 2026): calendar dates must round-trip in every timezone.
 * See src/lib/utils/date-only.ts.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { toDateOnly, parseDateOnly } from '@/lib/utils/date-only'
import { simulateSydneyToISOString } from '../helpers/simulate-sydney-iso'

afterEach(() => { vi.restoreAllMocks() })

describe('toDateOnly', () => {
  it('formats the local calendar date, zero-padded', () => {
    expect(toDateOnly(new Date(2026, 6, 1))).toBe('2026-07-01')
    expect(toDateOnly(new Date(2027, 5, 30))).toBe('2027-06-30')
    expect(toDateOnly(new Date(2026, 0, 9))).toBe('2026-01-09')
  })

  it('never goes through toISOString — it gives the right day even where the UTC day is the day before', () => {
    simulateSydneyToISOString()
    expect(new Date(2026, 6, 1).toISOString().slice(0, 10)).toBe('2026-06-30') // the bug, reproduced
    expect(toDateOnly(new Date(2026, 6, 1))).toBe('2026-07-01')
  })
})

describe('parseDateOnly', () => {
  it('parses to LOCAL midnight', () => {
    const d = parseDateOnly('2026-07-01')!
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 6, 1, 0])
  })

  it('takes the date part of a full timestamp', () => {
    expect(toDateOnly(parseDateOnly('2026-06-30T14:00:00.000Z')!)).toBe('2026-06-30')
  })

  it('round-trips with toDateOnly', () => {
    for (const s of ['2026-07-01', '2027-06-30', '2028-02-29', '2029-12-31']) {
      expect(toDateOnly(parseDateOnly(s)!)).toBe(s)
    }
  })

  it.each(['', 'not a date', '2026-02-31', '2026-13-01', '07/01/2026'])('rejects %j', (s) => {
    expect(parseDateOnly(s)).toBeNull()
  })
})
