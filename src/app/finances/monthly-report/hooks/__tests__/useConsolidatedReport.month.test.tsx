/**
 * DRG-16 — a consolidated report belongs to the month it was generated for.
 *
 * The page cached the consolidated report across month changes (only a
 * fiscal-year change cleared it) and the export reused whatever the cache
 * held, under `this.report.report_month`'s heading. A July per-entity table
 * could print in the August pack. Clearing on month change is half of it: a
 * July response still in flight when the coach picks August landed after the
 * clear and filled the cache again. So the hook records the month each report
 * is for, drops responses a clear or a newer request has superseded, and hands
 * the export a report only for the month it asks about.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import React from 'react'
import { useConsolidatedReport } from '../useConsolidatedReport'
import { useConsolidatedBalanceSheet } from '../useConsolidatedBalanceSheet'

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => Promise.resolve({ count: 2 }),
          }),
        }),
      }),
    }),
  }),
}))

const BUSINESS_ID = 'c7df2983-5711-4959-8ec8-a48030d62666'

/** One deferred response per requested month. */
const pending = new Map<string, (body: unknown) => void>()

beforeEach(() => {
  pending.clear()
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, init: { body: string }) => {
      const month = JSON.parse(init.body).report_month as string
      return new Promise((resolve) => {
        pending.set(month, (body) => resolve({ ok: true, json: async () => body } as unknown as Response))
      })
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function harness<T>(useHook: (id: string) => T) {
  const api: { current: T | null } = { current: null }
  function Harness() {
    api.current = useHook(BUSINESS_ID)
    return null
  }
  return { api, Harness }
}

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })

describe('useConsolidatedReport keys its report by month', () => {
  it('a response that lands after clear() is not cached', async () => {
    const { api, Harness } = harness(useConsolidatedReport)
    render(<Harness />)
    await flush()
    expect(api.current!.isConsolidationGroup).toBe(true)

    let july: Promise<unknown> | undefined
    await act(async () => { july = api.current!.generateConsolidated('2026-07', 2027) })
    // The coach picks August; the page clears the cache.
    await act(async () => { api.current!.clear() })
    await act(async () => {
      pending.get('2026-07')!({ report: { month: 'July' } })
      await july
    })
    expect(api.current!.report).toBeNull()
    expect(api.current!.isLoading).toBe(false)
  })

  it('the older of two in-flight requests never overwrites the newer', async () => {
    const { api, Harness } = harness(useConsolidatedReport)
    render(<Harness />)
    await flush()
    let july: Promise<unknown> | undefined
    let august: Promise<unknown> | undefined
    await act(async () => {
      july = api.current!.generateConsolidated('2026-07', 2027)
      august = api.current!.generateConsolidated('2026-08', 2027)
    })
    await act(async () => {
      pending.get('2026-08')!({ report: { month: 'August' } })
      await august
    })
    await act(async () => {
      pending.get('2026-07')!({ report: { month: 'July' } })
      // The caller that asked for July still gets July — it is only not cached.
      expect(await july).toEqual({ month: 'July' })
    })
    expect(api.current!.report).toEqual({ month: 'August' })
    expect(api.current!.reportFor('2026-08', 2027)).toEqual({ month: 'August' })
  })

  it('reportFor hands back the cached report only for the month and year it was generated for', async () => {
    const { api, Harness } = harness(useConsolidatedReport)
    render(<Harness />)
    await flush()
    let july: Promise<unknown> | undefined
    await act(async () => { july = api.current!.generateConsolidated('2026-07', 2027) })
    await act(async () => {
      pending.get('2026-07')!({ report: { month: 'July' } })
      await july
    })
    expect(api.current!.reportFor('2026-07', 2027)).toEqual({ month: 'July' })
    expect(api.current!.reportFor('2026-08', 2027)).toBeNull()
    expect(api.current!.reportFor('2026-07', 2026)).toBeNull()
  })
})

describe('useConsolidatedBalanceSheet drops a superseded response the same way', () => {
  it('a response that lands after clear() is not cached', async () => {
    const { api, Harness } = harness(useConsolidatedBalanceSheet)
    render(<Harness />)
    await flush()
    let july: Promise<unknown> | undefined
    await act(async () => { july = api.current!.generateBalanceSheet('2026-07', 2027) })
    await act(async () => { api.current!.clear() })
    await act(async () => {
      pending.get('2026-07')!({ report: { month: 'July' } })
      await july
    })
    expect(api.current!.report).toBeNull()
  })
})
