/**
 * The page's Wages data is built from the layout's Payroll Report roster, so it
 * must not outlive that roster.
 *
 * The per-employee Budget reads the roster's weekly salaries. The page held the
 * wages data it loaded first and reused it for every export, while the Payroll
 * Report page in the same export read the layout as it stood. Open the Wages
 * tab, add the weekly salaries in the layout editor, save, export: the Payroll
 * Report printed the salaries and the Wages Analysis page printed "No
 * per-employee plan" over dashes — one pack, two rosters.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWagesDetail } from '../useWagesDetail'
import { urLayout, urRosterWithSalaries, urRosterWithoutSalaries } from '@/lib/monthly-report/__tests__/urban-road-wages-fixture'

const fetchMock = vi.fn()

const BUSINESS = '28d41193-38ae-4071-a2b1-0dbea90a38fd'
const stored = urLayout(urRosterWithoutSalaries())
const withSalaries = urLayout(urRosterWithSalaries())

const wages = (label: string) => ({ accounts: [], employees: [], label }) as any

function respond(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response
}

const postedBody = (call: number) => JSON.parse(fetchMock.mock.calls[call][1].body)

const load = (hook: { current: ReturnType<typeof useWagesDetail> }) =>
  act(async () => { await hook.current.loadWagesDetail('2026-08', 2027, ['Employ - Wages & Salaries']) })

beforeEach(() => {
  fetchMock.mockReset()
  global.fetch = fetchMock as unknown as typeof fetch
})

describe('useWagesDetail follows the layout the page prints', () => {
  it('sends the layout the page holds, so the route reads the roster the export prints', async () => {
    fetchMock.mockResolvedValue(respond({ data: wages('with salaries') }))
    const { result } = renderHook(() => useWagesDetail(BUSINESS, withSalaries))
    await load(result)
    expect(postedBody(0).pdf_layout).toEqual(withSalaries)
  })

  it('sends null for a page with no layout, rather than let the route read one the page is not printing', async () => {
    fetchMock.mockResolvedValue(respond({ data: wages('none') }))
    const { result } = renderHook(() => useWagesDetail(BUSINESS, null))
    await load(result)
    expect(postedBody(0)).toHaveProperty('pdf_layout', null)
  })

  it('stops serving wages loaded for the old roster once the layout’s roster changes', async () => {
    fetchMock.mockResolvedValueOnce(respond({ data: wages('stored roster') }))
    const { result, rerender } = renderHook(({ layout }) => useWagesDetail(BUSINESS, layout), { initialProps: { layout: stored as unknown } })
    await load(result)
    expect(result.current.wagesDetail).toEqual(wages('stored roster'))

    // The layout editor saves the weekly salaries.
    rerender({ layout: withSalaries })
    expect(result.current.wagesDetail).toBeNull()

    fetchMock.mockResolvedValueOnce(respond({ data: wages('saved roster') }))
    await load(result)
    expect(postedBody(1).pdf_layout).toEqual(withSalaries)
    expect(result.current.wagesDetail).toEqual(wages('saved roster'))
  })

  it('keeps them through a layout change that leaves the roster alone', async () => {
    fetchMock.mockResolvedValueOnce(respond({ data: wages('stored roster') }))
    const { result, rerender } = renderHook(({ layout }) => useWagesDetail(BUSINESS, layout), { initialProps: { layout: stored as unknown } })
    await load(result)
    // Same roster, pages in another order and a fresh object off the settings save.
    rerender({ layout: JSON.parse(JSON.stringify({ ...stored, pages: [...stored.pages].reverse() })) })
    expect(result.current.wagesDetail).toEqual(wages('stored roster'))
  })

  it('does not serve a response for the old roster that lands after the change', async () => {
    let finish!: (r: Response) => void
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => { finish = resolve }))
    const { result, rerender } = renderHook(({ layout }) => useWagesDetail(BUSINESS, layout), { initialProps: { layout: stored as unknown } })
    let pending!: Promise<unknown>
    act(() => { pending = result.current.loadWagesDetail('2026-08', 2027, ['Employ - Wages & Salaries']) })
    rerender({ layout: withSalaries })
    await act(async () => { finish(respond({ data: wages('stored roster') })); await pending })
    expect(result.current.wagesDetail).toBeNull()
    expect(result.current.isLoading).toBe(false)
  })

  it('does not hold an error from the old roster against the new one, so the tab loads again', async () => {
    fetchMock.mockResolvedValueOnce(respond({ error: 'Failed to load wages detail' }, false))
    const { result, rerender } = renderHook(({ layout }) => useWagesDetail(BUSINESS, layout), { initialProps: { layout: stored as unknown } })
    await load(result)
    expect(result.current.error).toBe('Failed to load wages detail')
    rerender({ layout: withSalaries })
    expect(result.current.error).toBeNull()
  })
})
