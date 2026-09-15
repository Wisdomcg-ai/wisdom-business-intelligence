/**
 * A finalised month's balance sheet, frozen at Finalise (decision 19) — the
 * rules for when the export may print the frozen copy, and the freeze itself.
 *
 * The sheets are Urban Road's own August 2026 comparisons, built by the real
 * builder from the fixture, so a "whole sheet" here is the page the pack
 * prints. What is locked:
 *   - only a FINAL snapshot with a complete freeze of THIS month is printed
 *     from the freeze; a draft, an old final month with no freeze, a freeze of
 *     another month, or half a freeze all fall back to live, silently;
 *   - the freeze writes both comparisons or neither, and every way it can fail
 *     is captured under invariant `balance-sheet-freeze` without throwing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const captureMessage = vi.fn()
const captureException = vi.fn()
vi.mock('@sentry/nextjs', () => ({
  captureMessage: (...a: unknown[]) => captureMessage(...a),
  captureException: (...a: unknown[]) => captureException(...a),
}))

import fixture from './fixtures/urban-road-bs-aug-2026.json'
import {
  buildBalanceSheetData,
  balanceSheetDates,
  type BsAccount,
  type XeroBalanceSheetReport,
} from '../balance-sheet-rows'
import {
  FROZEN_BALANCE_SHEETS_KEY,
  LIVE_BALANCE_SHEET_TIMEOUT_MS,
  PENDING_FREEZE_WAIT_MS,
  balanceSheetFreezeDue,
  balanceSheetsForExport,
  freezeBalanceSheetsAtFinalise,
  frozenBalanceSheetSources,
  loadLiveBalanceSheets,
  loadSentBalanceSheets,
  markBalanceSheetFreezeDue,
  pnlFigures,
  printedBalanceSheets,
  readFrozenBalanceSheets,
  reportMatchesSnapshot,
  sentBalanceSheetSources,
  waitForPendingFreeze,
  withoutFrozenBalanceSheets,
} from '../balance-sheet-freeze'

const BIZ = '28d41193-38ae-4071-a2b1-0dbea90a38fd'
const reports = fixture.reports as Record<string, { Reports: XeroBalanceSheetReport[] }>
const accounts = new Map<string, BsAccount>(
  Object.entries(fixture.codes as Record<string, string | null>).map(([id, code]) => [
    id,
    { code, xeroClass: (fixture.classes as Record<string, string | null>)[id] ?? null },
  ]),
)
const sheet = (compare: 'mom' | 'yoy') => {
  const d = balanceSheetDates('2026-08', compare)
  return buildBalanceSheetData({
    businessId: BIZ, compare, currentDate: d.current, priorDate: d.prior,
    current: reports[d.current].Reports[0], prior: reports[d.prior].Reports[0], accounts,
  })
}
const mom = sheet('mom')
const yoy = sheet('yoy')
const freeze = { frozen_at: '2026-09-14T03:00:00.000Z', report_month: '2026-08', mom, yoy }

describe('readFrozenBalanceSheets — a whole freeze of this month, or nothing', () => {
  it('accepts both comparisons of the month', () => {
    expect(readFrozenBalanceSheets(freeze, '2026-08')).toEqual(freeze)
  })

  it.each([
    ['another month', { ...freeze, report_month: '2026-07' }],
    ['only the prior-month page', { ...freeze, yoy: undefined }],
    ['the two comparisons swapped', { ...freeze, mom: yoy, yoy: mom }],
    ['a sheet for another month-end', { ...freeze, mom: { ...mom, report_date: '2026-07-31' } }],
    ['an error body where a sheet should be', { ...freeze, yoy: { error: 'Xero API error', status: 502 } }],
    ['a sheet with no rows', { ...freeze, mom: { ...mom, rows: [] } }],
    ['no freeze time', { ...freeze, frozen_at: undefined }],
    ['nothing', undefined],
  ])('refuses %s', (_why, value) => {
    expect(readFrozenBalanceSheets(value, '2026-08')).toBeNull()
  })
})

describe('frozenBalanceSheetSources — what an export of the month prints', () => {
  const reportData = { report_month: '2026-08', sections: {}, [FROZEN_BALANCE_SHEETS_KEY]: freeze }

  it('a FINAL month with a freeze prints the frozen sheets, figures as they were', () => {
    const sources = frozenBalanceSheetSources({ status: 'final', report_data: reportData }, '2026-08')
    expect(sources).toEqual({ mom: { data: mom }, yoy: { data: yoy } })
    // Urban Road at finalise: Net Assets 425,242.16 — not whatever Xero says at the next export.
    expect(sources!.mom!.data!.rows.find((r) => r.type === 'net_assets')!.current).toBe(425_242.16)
  })

  it('a DRAFT asks Xero, even when a freeze is sitting in its report_data', () => {
    expect(frozenBalanceSheetSources({ status: 'draft', report_data: reportData }, '2026-08')).toBeNull()
  })

  it('a final month finalised before the freeze existed asks Xero, and claims nothing', () => {
    expect(frozenBalanceSheetSources({ status: 'final', report_data: { report_month: '2026-08' } }, '2026-08')).toBeNull()
    expect(frozenBalanceSheetSources(null, '2026-08')).toBeNull()
  })

  it('a freeze of a different month is never printed under this one', () => {
    expect(frozenBalanceSheetSources({ status: 'final', report_data: reportData }, '2026-09')).toBeNull()
  })
})

describe('withoutFrozenBalanceSheets — a save never carries a freeze', () => {
  it('drops the key and nothing else', () => {
    const data = { report_month: '2026-08', summary: { x: 1 }, [FROZEN_BALANCE_SHEETS_KEY]: freeze }
    expect(withoutFrozenBalanceSheets(data)).toEqual({ report_month: '2026-08', summary: { x: 1 } })
  })

  it('returns anything without a freeze untouched', () => {
    const data = { report_month: '2026-08' }
    expect(withoutFrozenBalanceSheets(data)).toBe(data)
    expect(withoutFrozenBalanceSheets(null)).toBeNull()
  })
})

describe('freezeBalanceSheetsAtFinalise', () => {
  beforeEach(() => {
    captureMessage.mockReset()
    captureException.mockReset()
  })

  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

  /** A browser fetch: the two balance-sheet GETs, then the snapshot PATCH. */
  function fakeFetch(opts: { yoy?: () => Response; patch?: () => Response } = {}) {
    return vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith('/api/Xero/balance-sheet')) {
        const compare = new URLSearchParams(url.split('?')[1]).get('compare')
        if (compare === 'yoy' && opts.yoy) return opts.yoy()
        return json(compare === 'mom' ? mom : yoy)
      }
      if (url === '/api/monthly-report/snapshot' && init?.method === 'PATCH') {
        return opts.patch ? opts.patch() : json({ success: true, updated: true, frozen_at: 'now' })
      }
      throw new Error(`unexpected fetch ${url}`)
    })
  }

  it('fetches both comparisons for the month and writes them to the snapshot in one PATCH', async () => {
    const f = fakeFetch()
    await expect(freezeBalanceSheetsAtFinalise(BIZ, '2026-08', f as unknown as typeof fetch)).resolves.toBe(true)
    const gets = f.mock.calls.filter(([u]) => String(u).startsWith('/api/Xero/balance-sheet')).map(([u]) => String(u))
    expect(gets).toEqual([
      `/api/Xero/balance-sheet?business_id=${BIZ}&month=2026-08&compare=mom`,
      `/api/Xero/balance-sheet?business_id=${BIZ}&month=2026-08&compare=yoy`,
    ])
    const patch = f.mock.calls.find(([, init]) => init?.method === 'PATCH')!
    expect(JSON.parse(String(patch[1]!.body))).toEqual({
      business_id: BIZ,
      report_month: '2026-08',
      action: 'freeze_balance_sheets',
      balance_sheets: { mom, yoy },
    })
    expect(captureMessage).not.toHaveBeenCalled()
  })

  it('freezes neither when one comparison cannot be had — and says why under the invariant', async () => {
    const f = fakeFetch({ yoy: () => json({ error: 'Xero is rate-limiting — try again in a minute', status: 429 }, 429) })
    await expect(freezeBalanceSheetsAtFinalise(BIZ, '2026-08', f as unknown as typeof fetch)).resolves.toBe(false)
    expect(f.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false)
    expect(captureMessage).toHaveBeenCalledWith(
      '[BalanceSheet freeze] not frozen — no whole sheet to freeze; exports stay live',
      expect.objectContaining({
        tags: { invariant: 'balance-sheet-freeze' },
        extra: expect.objectContaining({ yoy: 'Xero is rate-limiting — try again in a minute', mom: null }),
      }),
    )
  })

  it('a write that does not land (unfinalised in between) is counted, not thrown', async () => {
    const f = fakeFetch({ patch: () => json({ success: true, updated: false }) })
    await expect(freezeBalanceSheetsAtFinalise(BIZ, '2026-08', f as unknown as typeof fetch)).resolves.toBe(false)
    expect(captureMessage).toHaveBeenCalledWith(
      '[BalanceSheet freeze] not frozen — the snapshot write did not land; exports stay live',
      expect.objectContaining({ level: 'warning', tags: { invariant: 'balance-sheet-freeze' } }),
    )
  })

  it('a failed write is an error under the invariant', async () => {
    const f = fakeFetch({ patch: () => json({ error: 'Failed to freeze the balance sheet' }, 500) })
    await expect(freezeBalanceSheetsAtFinalise(BIZ, '2026-08', f as unknown as typeof fetch)).resolves.toBe(false)
    expect(captureMessage).toHaveBeenCalledWith(
      expect.stringContaining('did not land'),
      expect.objectContaining({ level: 'error', tags: { invariant: 'balance-sheet-freeze' } }),
    )
  })

  it('never throws, even when the network does', async () => {
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') throw new TypeError('Failed to fetch')
      return json(new URLSearchParams(url.split('?')[1]).get('compare') === 'mom' ? mom : yoy)
    })
    await expect(freezeBalanceSheetsAtFinalise(BIZ, '2026-08', f as unknown as typeof fetch)).resolves.toBe(false)
    expect(captureException).toHaveBeenCalledWith(
      expect.any(TypeError),
      expect.objectContaining({ tags: { invariant: 'balance-sheet-freeze' } }),
    )
  })
})

// ─── The gaps a fire-and-forget freeze leaves (review defects 2-4) ──────────

const FINALISED_AT = '2026-09-14T02:59:58.000Z'
const due = { report_month: '2026-08', finalised_at: FINALISED_AT }
/** The P&L figures of Urban Road's stored August report, as the page holds them. */
const report = {
  report_month: '2026-08',
  budget_source: 'budget_version',
  summary: { revenue: { actual: 181_234.5, budget: 175_000 }, net_profit: { actual: 22_118.4, budget: 19_500 } },
  gross_profit_row: { account_name: 'Gross Profit', actual: 90_000, budget: 88_000 },
  net_profit_row: { account_name: 'Net Profit', actual: 22_118.4, budget: 19_500 },
  sections: [],
}

describe('markBalanceSheetFreezeDue — a Finalise says a freeze is owed', () => {
  it('a final save records the finalise the freeze will belong to', () => {
    expect(markBalanceSheetFreezeDue({ report_month: '2026-08' }, 'final', '2026-08', FINALISED_AT)).toEqual({
      report_month: '2026-08',
      [FROZEN_BALANCE_SHEETS_KEY]: due,
    })
  })

  it('a draft save owes nothing', () => {
    const data = { report_month: '2026-08' }
    expect(markBalanceSheetFreezeDue(data, 'draft', '2026-08', FINALISED_AT)).toBe(data)
  })
})

describe('balanceSheetFreezeDue — a finalise whose freeze never landed', () => {
  it('a FINAL month finalised with a freeze owed, and none stored, is due', () => {
    const snap = { status: 'final', report_data: { [FROZEN_BALANCE_SHEETS_KEY]: due } }
    expect(balanceSheetFreezeDue(snap, '2026-08')).toBe(FINALISED_AT)
  })

  it.each([
    ['a freeze that landed', { status: 'final', report_data: { [FROZEN_BALANCE_SHEETS_KEY]: { ...freeze, finalised_at: FINALISED_AT } } }],
    ['a draft', { status: 'draft', report_data: { [FROZEN_BALANCE_SHEETS_KEY]: due } }],
    ['a month finalised before freezing existed', { status: 'final', report_data: { report_month: '2026-08' } }],
    ['another month\'s marker', { status: 'final', report_data: { [FROZEN_BALANCE_SHEETS_KEY]: { ...due, report_month: '2026-07' } } }],
    ['no snapshot', null],
  ])('%s is not due', (_why, snap) => {
    expect(balanceSheetFreezeDue(snap, '2026-08')).toBeNull()
  })
})

describe('reportMatchesSnapshot — is the report on screen the one that was finalised?', () => {
  // jsonb hands keys back sorted, so the stored copy never has the page's key order.
  const stored = JSON.parse(JSON.stringify({
    sections: {},
    net_profit_row: { budget: 19_500, actual: 22_118.4, account_name: 'Net Profit' },
    gross_profit_row: { budget: 88_000, account_name: 'Gross Profit', actual: 90_000 },
    summary: { net_profit: { budget: 19_500, actual: 22_118.4 }, revenue: { budget: 175_000, actual: 181_234.5 } },
    report_month: '2026-08',
    budget_source: 'budget_version',
  }))

  it('the same figures in another key order are the same report', () => {
    expect(reportMatchesSnapshot(report, stored)).toBe(true)
  })

  it('a regenerate that moved net profit is not', () => {
    const regenerated = { ...report, net_profit_row: { ...report.net_profit_row, actual: 21_264.51 } }
    expect(reportMatchesSnapshot(regenerated, stored)).toBe(false)
  })

  it('nothing stored matches nothing', () => {
    expect(reportMatchesSnapshot(report, null)).toBe(false)
    expect(reportMatchesSnapshot(null, stored)).toBe(false)
  })
})

describe('balanceSheetsForExport — what the export prints, and the freeze it owes', () => {
  beforeEach(() => {
    captureMessage.mockReset()
    captureException.mockReset()
  })

  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
  function fakeFetch(opts: { yoy?: () => Response } = {}) {
    return vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith('/api/Xero/balance-sheet')) {
        const compare = new URLSearchParams(url.split('?')[1]).get('compare')
        if (compare === 'yoy' && opts.yoy) return opts.yoy()
        return json(compare === 'mom' ? mom : yoy)
      }
      if (url === '/api/monthly-report/snapshot' && init?.method === 'PATCH') {
        return json({ success: true, updated: true, frozen_at: 'now' })
      }
      throw new Error(`unexpected fetch ${url}`)
    })
  }
  const gets = (f: ReturnType<typeof fakeFetch>) => f.mock.calls.filter(([u]) => String(u).startsWith('/api/Xero/balance-sheet')).length
  const patches = (f: ReturnType<typeof fakeFetch>) => f.mock.calls.filter(([, init]) => init?.method === 'PATCH')
  const storedWith = (status: string, key: unknown) => ({
    status,
    report_data: { ...report, ...(key ? { [FROZEN_BALANCE_SHEETS_KEY]: key } : {}) },
  })

  it('a FINAL month with its freeze prints the freeze and asks Xero nothing', async () => {
    const f = fakeFetch()
    const sources = await balanceSheetsForExport({
      businessId: BIZ, reportMonth: '2026-08', report,
      stored: storedWith('final', { ...freeze, finalised_at: FINALISED_AT }), fetchImpl: f as unknown as typeof fetch,
    })
    expect(sources).toEqual({ mom: { data: mom }, yoy: { data: yoy } })
    expect(f).not.toHaveBeenCalled()
  })

  it('a final month REGENERATED on screen prints live, so the sheet agrees with the P&L beside it', async () => {
    // The frozen Current Earnings belongs to the finalised P&L, not the regenerated one.
    const f = fakeFetch()
    const regenerated = { ...report, net_profit_row: { ...report.net_profit_row, actual: 21_264.51 } }
    const sources = await balanceSheetsForExport({
      businessId: BIZ, reportMonth: '2026-08', report: regenerated,
      stored: storedWith('final', { ...freeze, finalised_at: FINALISED_AT }), fetchImpl: f as unknown as typeof fetch,
    })
    expect(gets(f)).toBe(2)
    expect(sources.mom!.data).toEqual(mom)
    expect(patches(f)).toHaveLength(0)
  })

  it('a finalise whose freeze never landed is frozen now, from the sheets this export prints — and the lateness is recorded', async () => {
    const f = fakeFetch()
    const sources = await balanceSheetsForExport({
      businessId: BIZ, reportMonth: '2026-08', report, stored: storedWith('final', due), fetchImpl: f as unknown as typeof fetch,
    })
    expect(sources).toEqual({ mom: { data: mom }, yoy: { data: yoy } })
    // Two GETs, not four: the freeze stores what is being printed.
    expect(gets(f)).toBe(2)
    expect(patches(f)).toHaveLength(1)
    expect(JSON.parse(String(patches(f)[0][1]!.body))).toEqual({
      business_id: BIZ, report_month: '2026-08', action: 'freeze_balance_sheets', balance_sheets: { mom, yoy },
    })
    expect(captureMessage).toHaveBeenCalledWith(
      '[BalanceSheet freeze] missing at export — frozen now, after the finalise',
      expect.objectContaining({
        level: 'warning',
        tags: { invariant: 'balance-sheet-freeze' },
        extra: expect.objectContaining({ finalisedAt: FINALISED_AT }),
      }),
    )
  })

  it('a late freeze with half a sheet writes nothing, and the export still prints what it has', async () => {
    const f = fakeFetch({ yoy: () => json({ error: 'Xero is rate-limiting — try again in a minute' }, 429) })
    const sources = await balanceSheetsForExport({
      businessId: BIZ, reportMonth: '2026-08', report, stored: storedWith('final', due), fetchImpl: f as unknown as typeof fetch,
    })
    expect(sources.yoy).toEqual({ data: null, reason: 'Xero is rate-limiting — try again in a minute' })
    expect(patches(f)).toHaveLength(0)
  })

  it.each([
    ['a draft', storedWith('draft', due)],
    ['a month finalised before freezing existed', storedWith('final', null)],
    ['a month with no snapshot', null],
  ])('%s prints live and owes no freeze', async (_why, stored) => {
    const f = fakeFetch()
    await balanceSheetsForExport({ businessId: BIZ, reportMonth: '2026-08', report, stored, fetchImpl: f as unknown as typeof fetch })
    expect(gets(f)).toBe(2)
    expect(patches(f)).toHaveLength(0)
    expect(captureMessage).not.toHaveBeenCalled()
  })
})

// ─── A freeze still running when the coach exports (wave-4 doubt 4) ─────────
//
// Finalise → Export straight away is the normal flow, so the export waits for
// the freeze this tab started. It used to wait with no limit: the freeze is two
// Xero GETs and a PATCH, and one hung request held Export and Approve & Send
// for that month for as long as the tab stayed open.

describe('waitForPendingFreeze — the export waits for the freeze, but not for ever', () => {
  it('waits the freeze out when it lands within the limit', async () => {
    await expect(waitForPendingFreeze(Promise.resolve(true), 50)).resolves.toBe('landed')
    await expect(waitForPendingFreeze(Promise.resolve(false), 50)).resolves.toBe('not_landed')
  })

  it('gives up at the limit on a freeze that never answers', async () => {
    vi.useFakeTimers()
    try {
      const hung = new Promise<boolean>(() => {})
      const outcome = waitForPendingFreeze(hung)
      let settled: string | null = null
      void outcome.then((o) => { settled = o })
      await vi.advanceTimersByTimeAsync(PENDING_FREEZE_WAIT_MS - 1)
      expect(settled).toBeNull()
      await vi.advanceTimersByTimeAsync(1)
      expect(settled).toBe('still_running')
    } finally {
      vi.useRealTimers()
    }
  })

  it('bounds the wait between 15 and 20 seconds', () => {
    expect(PENDING_FREEZE_WAIT_MS).toBeGreaterThanOrEqual(15_000)
    expect(PENDING_FREEZE_WAIT_MS).toBeLessThanOrEqual(20_000)
  })

  it('a freeze that rejects (it should not) counts as not landed, never as a thrown export', async () => {
    await expect(waitForPendingFreeze(Promise.reject(new Error('boom')), 50)).resolves.toBe('not_landed')
  })
})

describe('balanceSheetsForExport — while the Finalise\'s own freeze is still running', () => {
  beforeEach(() => {
    captureMessage.mockReset()
    captureException.mockReset()
  })

  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
  const fakeFetch = () =>
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith('/api/Xero/balance-sheet')) {
        return json(new URLSearchParams(url.split('?')[1]).get('compare') === 'mom' ? mom : yoy)
      }
      if (init?.method === 'PATCH') return json({ success: true, updated: true, frozen_at: 'now' })
      throw new Error(`unexpected fetch ${url}`)
    })
  const stored = { status: 'final', report_data: { ...report, [FROZEN_BALANCE_SHEETS_KEY]: due } }

  it('prints live, claims no freeze, and leaves the freezing to the freeze already running', async () => {
    const f = fakeFetch()
    const sources = await balanceSheetsForExport({
      businessId: BIZ, reportMonth: '2026-08', report, stored, freezeInFlight: true, fetchImpl: f as unknown as typeof fetch,
    })
    expect(sources).toEqual({ mom: { data: mom }, yoy: { data: yoy } })
    // No second, racing freeze from the export — and no "frozen now, late" event,
    // because nothing was frozen by this export.
    expect(f.mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(0)
    expect(captureMessage).not.toHaveBeenCalledWith(
      '[BalanceSheet freeze] missing at export — frozen now, after the finalise',
      expect.anything(),
    )
    // A finalised month exported live is what the invariant counts.
    expect(captureMessage).toHaveBeenCalledWith(
      '[BalanceSheet freeze] still running at export — this export printed the live sheet',
      expect.objectContaining({
        level: 'warning',
        tags: { invariant: 'balance-sheet-freeze' },
        extra: expect.objectContaining({ businessId: BIZ, reportMonth: '2026-08', finalisedAt: FINALISED_AT }),
      }),
    )
  })

  it('a freeze that landed in the meantime is still printed as the freeze', async () => {
    const f = fakeFetch()
    const landed = { status: 'final', report_data: { ...report, [FROZEN_BALANCE_SHEETS_KEY]: { ...freeze, finalised_at: FINALISED_AT } } }
    const sources = await balanceSheetsForExport({
      businessId: BIZ, reportMonth: '2026-08', report, stored: landed, freezeInFlight: true, fetchImpl: f as unknown as typeof fetch,
    })
    expect(sources).toEqual({ mom: { data: mom }, yoy: { data: yoy } })
    expect(f).not.toHaveBeenCalled()
    expect(captureMessage).not.toHaveBeenCalled()
  })
})

// A hung balance-sheet read used to hold the export anyway. The freeze wait is
// bounded, but past it the export goes on to read the same two Xero endpoints
// the stuck freeze is waiting on — with no limit of its own — so a Xero, or a
// route, that never answers held Export and Approve & Send until the platform
// cut the route off, once per comparison.

describe('loadLiveBalanceSheets — one deadline for both comparisons', () => {
  beforeEach(() => {
    captureMessage.mockReset()
    captureException.mockReset()
  })

  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
  const compareOf = (url: string) => new URLSearchParams(url.split('?')[1]).get('compare')

  it('a read that never answers — even one that ignores the abort — ends at the deadline with a reason, not a hang', async () => {
    vi.useFakeTimers()
    try {
      const f = vi.fn((_url: string, _init?: RequestInit) => new Promise<Response>(() => {}))
      let settled: unknown = null
      void loadLiveBalanceSheets(BIZ, '2026-08', f as unknown as typeof fetch).then((s) => { settled = s })
      await vi.advanceTimersByTimeAsync(LIVE_BALANCE_SHEET_TIMEOUT_MS - 1)
      expect(settled).toBeNull()
      await vi.advanceTimersByTimeAsync(1)
      expect(settled).toEqual({
        mom: { data: null, reason: expect.stringContaining('in time') },
        yoy: { data: null, reason: expect.stringContaining('in time') },
      })
      // The deadline is shared: once the first comparison has spent it, the
      // second is not asked for — no more Xero pressure from an export that
      // has already given up.
      expect(f).toHaveBeenCalledTimes(1)
      expect(captureMessage).toHaveBeenCalledWith(
        expect.stringContaining('did not answer in time'),
        expect.objectContaining({ tags: { invariant: 'pdf-balance-sheet-load' } }),
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('aborts the request it stops waiting for', async () => {
    vi.useFakeTimers()
    try {
      let signal: AbortSignal | undefined
      const f = vi.fn((_url: string, init?: RequestInit) => {
        signal = init?.signal ?? undefined
        return new Promise<Response>(() => {})
      })
      void loadLiveBalanceSheets(BIZ, '2026-08', f as unknown as typeof fetch)
      await vi.advanceTimersByTimeAsync(0)
      expect(signal?.aborted).toBe(false)
      await vi.advanceTimersByTimeAsync(LIVE_BALANCE_SHEET_TIMEOUT_MS)
      expect(signal?.aborted).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps the comparison that answered and states why the other did not', async () => {
    vi.useFakeTimers()
    try {
      const f = vi.fn((url: string) =>
        compareOf(url) === 'mom' ? Promise.resolve(json(mom)) : new Promise<Response>(() => {}),
      )
      let settled: any = null
      void loadLiveBalanceSheets(BIZ, '2026-08', f as unknown as typeof fetch).then((s) => { settled = s })
      await vi.advanceTimersByTimeAsync(LIVE_BALANCE_SHEET_TIMEOUT_MS)
      expect(settled?.mom).toEqual({ data: mom })
      expect(settled?.yoy).toEqual({ data: null, reason: expect.stringContaining('in time') })
    } finally {
      vi.useRealTimers()
    }
  })

  it('a body that stalls after the headers is bounded too', async () => {
    vi.useFakeTimers()
    try {
      const stalled = { ok: true, status: 200, json: () => new Promise(() => {}) } as unknown as Response
      const f = vi.fn(async () => stalled)
      let settled: any = null
      void loadLiveBalanceSheets(BIZ, '2026-08', f as unknown as typeof fetch).then((s) => { settled = s })
      await vi.advanceTimersByTimeAsync(LIVE_BALANCE_SHEET_TIMEOUT_MS)
      expect(settled?.mom).toEqual({ data: null, reason: expect.stringContaining('in time') })
    } finally {
      vi.useRealTimers()
    }
  })

  it('leaves room for the route to wait out one Xero Retry-After (60s), and stays inside the route limit (120s)', () => {
    expect(LIVE_BALANCE_SHEET_TIMEOUT_MS).toBeGreaterThan(60_000)
    expect(LIVE_BALANCE_SHEET_TIMEOUT_MS).toBeLessThan(120_000)
  })

  it('an export behind a stuck freeze ends at the deadline too, and freezes nothing', async () => {
    vi.useFakeTimers()
    try {
      const f = vi.fn((_url: string, _init?: RequestInit) => new Promise<Response>(() => {}))
      const stored = {
        status: 'final',
        report_data: { ...report, [FROZEN_BALANCE_SHEETS_KEY]: due },
      }
      let settled: any = null
      void balanceSheetsForExport({
        businessId: BIZ, reportMonth: '2026-08', report, stored, freezeInFlight: true, fetchImpl: f as unknown as typeof fetch,
      }).then((s) => { settled = s })
      await vi.advanceTimersByTimeAsync(LIVE_BALANCE_SHEET_TIMEOUT_MS)
      expect(settled?.mom?.data).toBeNull()
      expect(settled?.yoy?.data).toBeNull()
      expect(f.mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(0)
    } finally {
      vi.useRealTimers()
    }
  })
})

// ─── The sheets an Approve & Send printed (package B) ───────────────────────
//
// Approve & Send is offered straight from draft, so a coach can send without
// ever pressing Finalise. The PDF the client received then printed a LIVE
// sheet, and nothing kept it: a later resend or export asked Xero again. The
// sheets the sent PDF was built from are now kept in cfo_report_status's
// snapshot_data, and an export of that month prints them — for as long as the
// report on screen is the report that was sent, and until the coach
// deliberately reopens it with Revert to Draft.

/** The live sheet after the send: an $853.89 credit posted afterwards moved Trade Debtors. */
const movedMom = {
  ...mom,
  rows: mom.rows.map((r) =>
    r.label === 'Trade Debtors' && typeof r.current === 'number' ? { ...r, current: r.current - 853.89 } : r,
  ),
}
const sentFreeze = { frozen_at: '2026-09-15T01:00:00.000Z', report_month: '2026-08', mom, yoy }

describe('printedBalanceSheets — the sheets a PDF was built from, as the send stores them', () => {
  it('takes each comparison\'s sheet, exactly as printed', () => {
    expect(printedBalanceSheets({ mom: { data: mom }, yoy: { data: yoy } })).toEqual({ mom, yoy })
  })

  it('a comparison the PDF printed a reason for travels as null — the send says why nothing was frozen', () => {
    expect(printedBalanceSheets({ mom: { data: mom }, yoy: { data: null, reason: 'Xero returned 503' } })).toEqual({ mom, yoy: null })
  })

  it('a pack with no balance sheet page sends nothing', () => {
    expect(printedBalanceSheets(undefined)).toBeUndefined()
  })
})

describe('sentBalanceSheetSources — the sent copy, when it may be printed', () => {
  const sent = { frozen: sentFreeze, report: pnlFigures(report) }

  it('a whole sent copy of this month, beside the report that was sent, is printed', () => {
    expect(sentBalanceSheetSources(sent, report, '2026-08')).toEqual({ mom: { data: mom }, yoy: { data: yoy } })
  })

  it.each([
    ['nothing sent', null],
    ['a send that froze nothing', { frozen: null, report: pnlFigures(report) }],
    ['a send of another month', { frozen: { ...sentFreeze, report_month: '2026-07' }, report: pnlFigures(report) }],
    ['half a sent copy', { frozen: { ...sentFreeze, yoy: null }, report: pnlFigures(report) }],
    ['a send the coach reopened (Revert to Draft)', { frozen: { ...sentFreeze, reopened_at: '2026-09-16T00:00:00.000Z' }, report: pnlFigures(report) }],
  ])('%s is not', (_why, value) => {
    expect(sentBalanceSheetSources(value, report, '2026-08')).toBeNull()
  })

  it('a report regenerated since the send (net profit moved) is not printed beside the sent sheet', () => {
    const regenerated = { ...report, net_profit_row: { ...report.net_profit_row, actual: 21_264.51 } }
    expect(sentBalanceSheetSources(sent, regenerated, '2026-08')).toBeNull()
  })

  it('pnlFigures keeps only what the sheet can disagree with', () => {
    expect(pnlFigures({ ...report, sections: [{ big: true }], commentary: 'x' })).toEqual({
      report_month: '2026-08',
      budget_source: 'budget_version',
      summary: report.summary,
      gross_profit_row: report.gross_profit_row,
      net_profit_row: report.net_profit_row,
    })
    expect(pnlFigures(null)).toBeNull()
  })
})

describe('balanceSheetsForExport — a month that was sent prints what was sent', () => {
  beforeEach(() => {
    captureMessage.mockReset()
    captureException.mockReset()
  })

  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
  /** Xero as it stands AFTER the send: Trade Debtors has moved. */
  const liveNow = () =>
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith('/api/Xero/balance-sheet')) {
        return json(new URLSearchParams(url.split('?')[1]).get('compare') === 'mom' ? movedMom : yoy)
      }
      if (init?.method === 'PATCH') return json({ success: true, updated: true, frozen_at: 'now' })
      throw new Error(`unexpected fetch ${url}`)
    })
  const sent = { frozen: sentFreeze, report: pnlFigures(report) }

  it('a DRAFT month sent from draft prints the sent sheets, not the moved live one — and asks Xero nothing', async () => {
    const f = liveNow()
    const sources = await balanceSheetsForExport({
      businessId: BIZ, reportMonth: '2026-08', report, stored: null, sent, fetchImpl: f as unknown as typeof fetch,
    })
    expect(sources).toEqual({ mom: { data: mom }, yoy: { data: yoy } })
    expect(f).not.toHaveBeenCalled()
    expect(captureMessage).not.toHaveBeenCalled()
  })

  it('sent, then finalised with a freeze taken later from the moved sheet: the export prints what was sent, and writes nothing', async () => {
    const f = liveNow()
    const stored = {
      status: 'final',
      report_data: { ...report, [FROZEN_BALANCE_SHEETS_KEY]: { ...freeze, mom: movedMom, finalised_at: FINALISED_AT } },
    }
    const sources = await balanceSheetsForExport({
      businessId: BIZ, reportMonth: '2026-08', report, stored, sent, fetchImpl: f as unknown as typeof fetch,
    })
    expect(sources).toEqual({ mom: { data: mom }, yoy: { data: yoy } })
    expect(f).not.toHaveBeenCalled()
  })

  it('finalised and frozen, then sent: the sent copy IS the Finalise freeze, and the Finalise freeze is still what prints', async () => {
    const f = liveNow()
    const stored = { status: 'final', report_data: { ...report, [FROZEN_BALANCE_SHEETS_KEY]: { ...freeze, finalised_at: FINALISED_AT } } }
    const sources = await balanceSheetsForExport({
      businessId: BIZ, reportMonth: '2026-08', report, stored, sent, fetchImpl: f as unknown as typeof fetch,
    })
    expect(sources).toEqual(frozenBalanceSheetSources(stored, '2026-08'))
    expect(f).not.toHaveBeenCalled()
  })

  it('a send the coach reopened exports by the rules it always had: a draft asks Xero', async () => {
    const f = liveNow()
    const sources = await balanceSheetsForExport({
      businessId: BIZ, reportMonth: '2026-08', report, stored: null,
      sent: { ...sent, frozen: { ...sentFreeze, reopened_at: '2026-09-16T00:00:00.000Z' } },
      fetchImpl: f as unknown as typeof fetch,
    })
    expect(sources.mom).toEqual({ data: movedMom })
  })

  it('a regenerated report prints live, so the sheet agrees with the P&L beside it', async () => {
    const f = liveNow()
    const regenerated = { ...report, net_profit_row: { ...report.net_profit_row, actual: 21_264.51 } }
    const sources = await balanceSheetsForExport({
      businessId: BIZ, reportMonth: '2026-08', report: regenerated, stored: null, sent, fetchImpl: f as unknown as typeof fetch,
    })
    expect(sources.mom).toEqual({ data: movedMom })
  })
})

describe('loadSentBalanceSheets — reading the sent copy for an export', () => {
  beforeEach(() => {
    captureMessage.mockReset()
    captureException.mockReset()
  })

  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

  it('reads the month\'s sent copy from the snapshot route', async () => {
    const body = { sent_balance_sheets: { frozen: sentFreeze, report: pnlFigures(report) } }
    const f = vi.fn(async () => json(body))
    await expect(loadSentBalanceSheets(BIZ, '2026-08', f as unknown as typeof fetch)).resolves.toEqual(body.sent_balance_sheets)
    expect(f).toHaveBeenCalledWith(
      `/api/monthly-report/snapshot?business_id=${BIZ}&report_month=2026-08&view=sent_balance_sheets`,
    )
  })

  it('a month never sent is null, and nothing is said', async () => {
    const f = vi.fn(async () => json({ sent_balance_sheets: null }))
    await expect(loadSentBalanceSheets(BIZ, '2026-08', f as unknown as typeof fetch)).resolves.toBeNull()
    expect(captureMessage).not.toHaveBeenCalled()
  })

  it('a read that fails is null — the export goes on by the other rules — and is captured, not swallowed', async () => {
    const f = vi.fn(async () => json({ error: 'Failed to read the sent balance sheet' }, 500))
    await expect(loadSentBalanceSheets(BIZ, '2026-08', f as unknown as typeof fetch)).resolves.toBeNull()
    expect(captureMessage).toHaveBeenCalledWith(
      expect.stringContaining('could not read the sent balance sheet'),
      expect.objectContaining({ tags: { invariant: 'balance-sheet-freeze', stage: 'export_read_sent' } }),
    )
  })

  it('never throws, even when the network does', async () => {
    const f = vi.fn(async () => { throw new TypeError('Failed to fetch') })
    await expect(loadSentBalanceSheets(BIZ, '2026-08', f as unknown as typeof fetch)).resolves.toBeNull()
    expect(captureException).toHaveBeenCalledWith(
      expect.any(TypeError),
      expect.objectContaining({ tags: { invariant: 'balance-sheet-freeze', stage: 'export_read_sent' } }),
    )
  })
})
