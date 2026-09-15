/**
 * The export's fetch of the month's uploaded pages: nothing asked for a layout
 * with none, and every failure a reason on the page — never `missing`, which
 * would tell the coach to upload a file that is already there.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const sentry = vi.hoisted(() => ({ captureException: vi.fn(), captureMessage: vi.fn() }))
vi.mock('@sentry/nextjs', () => sentry)

import { fetchPackInsertSources } from '../pack-inserts-fetch'
import type { PDFLayout } from '../../types/pdf-layout'

const BIZ = '28d41193-38ae-4071-a2b1-0dbea90a38fd'
const layout = (...ids: string[]): PDFLayout => ({
  version: 1,
  pages: [
    { id: 'p1', orientation: 'portrait', widgets: [{ id: 'es', type: 'executive_summary', col: 0, row: 0, colSpan: 2, rowSpan: 3 }] },
    ...ids.map((id) => ({ id: `p-${id}`, orientation: 'portrait' as const, widgets: [{ id, type: 'uploaded_insert' as const, col: 0, row: 0, colSpan: 2, rowSpan: 3 }] })),
  ],
})
const record = (widget_id: string, id: string, filename: string) => ({ id, widget_id, filename, report_month: '2026-08', created_at: '2026-09-01T00:00:00Z' })

let routes: Record<string, () => Response>
const calls: string[] = []
beforeEach(() => {
  calls.length = 0
  sentry.captureException.mockClear()
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    calls.push(url)
    const key = Object.keys(routes).find((k) => url.includes(k))
    if (!key) throw new Error(`unexpected ${url}`)
    return routes[key]()
  }))
})
afterEach(() => vi.unstubAllGlobals())

describe('fetchPackInsertSources', () => {
  it('a layout with no uploaded page asks nothing', async () => {
    routes = {}
    expect(await fetchPackInsertSources(BIZ, '2026-08', layout())).toBeUndefined()
    expect(calls).toEqual([])
  })

  it('the newest file for each placement, and missing for one with none', async () => {
    routes = {
      'report_month=2026-08': () => Response.json({ success: true, status: 'ok', inserts: [record('lumary', 'u1', 'lumary.pdf')] }),
      'id=u1': () => new Response(new Uint8Array([37, 80, 68, 70]), { status: 200 }),
    }
    const sources = await fetchPackInsertSources(BIZ, '2026-08', layout('lumary', 'hubstaff'))
    expect(sources).toEqual({
      lumary: { status: 'file', bytes: new Uint8Array([37, 80, 68, 70]), filename: 'lumary.pdf' },
      hubstaff: { status: 'missing' },
    })
    expect(calls[0]).toBe(`/api/monthly-report/inserts?business_id=${BIZ}&report_month=2026-08`)
  })

  it('before the migration: the route\'s reason on every placement', async () => {
    routes = { 'report_month=': () => Response.json({ success: true, status: 'unavailable', reason: "uploaded pages aren't set up" }) }
    expect(await fetchPackInsertSources(BIZ, '2026-08', layout('lumary'))).toEqual({
      lumary: { status: 'unavailable', reason: "uploaded pages aren't set up" },
    })
  })

  it('a list that fails, or a file that will not download: could-not-check, captured', async () => {
    routes = { 'report_month=': () => new Response('nope', { status: 500 }) }
    expect(await fetchPackInsertSources(BIZ, '2026-08', layout('lumary'))).toEqual({
      lumary: { status: 'unavailable', reason: 'the uploaded pages could not be loaded' },
    })
    routes = {
      'report_month=': () => Response.json({ success: true, status: 'ok', inserts: [record('lumary', 'u1', 'lumary.pdf')] }),
      'id=u1': () => new Response('gone', { status: 502 }),
    }
    expect(await fetchPackInsertSources(BIZ, '2026-08', layout('lumary'))).toEqual({
      lumary: { status: 'unavailable', reason: 'the uploaded file lumary.pdf could not be downloaded' },
    })
    const tags = sentry.captureException.mock.calls.map((c: any[]) => c[1]?.tags?.invariant)
    expect(tags).toEqual(['pdf-inserts-load', 'pack-insert-download'])
  })
})
