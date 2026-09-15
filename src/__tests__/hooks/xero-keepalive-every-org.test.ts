/**
 * useXeroKeepalive — reads the business-level /api/Xero/status answer (15 Sep 2026).
 *
 * It used to toast only when `connected` flipped, and `connected` described one
 * org: one org of a multi-org business dying never toasted. A non-2xx was parsed
 * as a body with `connected` missing, i.e. "connection lost".
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { XeroStatusResponse } from '@/lib/xero/business-status-view'

const { toastError, toastWarning, toastSuccess } = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastWarning: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: { error: toastError, warning: toastWarning, success: toastSuccess },
}))

import { useXeroKeepalive } from '@/hooks/useXeroKeepalive'

const healthy = (): XeroStatusResponse => ({
  status: 'connected',
  status_scope: null,
  more_orgs_needing_attention: 0,
  last_sync_at: '2026-09-15T04:01:03.185Z',
  orgs: [
    { connection_id: 'a', tenant_id: 't-a', tenant_name: 'IICT Group Limited', status: 'connected', last_sync_at: null, last_refresh_at: null },
    { connection_id: 'b', tenant_id: 't-b', tenant_name: 'IICT (Aust) Pty Ltd', status: 'connected', last_sync_at: null, last_refresh_at: null },
  ],
  retired_orgs: [],
  can_manage: true,
  connected: true,
  expired: false,
  needsReconnect: false,
  connection: null,
  health: { isHealthy: true, expiresInMinutes: 25, warnings: [] },
})

const oneOrgDead = (): XeroStatusResponse => ({
  ...healthy(),
  status: 'dead',
  status_scope: 'IICT (Aust) Pty Ltd',
  expired: true,
  needsReconnect: true,
})

function stubResponses(...responses: { status: number; body: unknown }[]) {
  const queue = [...responses]
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      const next = queue.shift()!
      return new Response(JSON.stringify(next.body), { status: next.status })
    }),
  )
}

beforeEach(() => {
  toastError.mockReset()
  toastWarning.mockReset()
  toastSuccess.mockReset()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// enabled=false keeps the timers off; checkNow drives each check.
const renderKeepalive = () => renderHook(() => useXeroKeepalive('biz-iict', false))

describe('useXeroKeepalive — one org of several', () => {
  it('THE REGRESSION TEST: one org needing a reconnect toasts, naming it — while the business stays connected', async () => {
    stubResponses({ status: 200, body: healthy() }, { status: 200, body: oneOrgDead() })
    const { result } = renderKeepalive()

    await act(() => result.current.checkNow())
    await act(() => result.current.checkNow())

    expect(toastError).toHaveBeenCalledTimes(1)
    expect(toastError.mock.calls[0][0]).toBe('IICT (Aust) Pty Ltd: Xero connection expired. Please reconnect from Integrations.')
    expect(toastWarning).not.toHaveBeenCalled()
    expect(result.current.status).toMatchObject({ connected: true, needsReconnect: true, scope: 'IICT (Aust) Pty Ltd' })
  })

  it('hands the page the full answer, so a toast never sits above a panel still showing the load-time state', async () => {
    const onStatusChange = vi.fn()
    stubResponses({ status: 200, body: oneOrgDead() })
    const { result } = renderHook(() => useXeroKeepalive('biz-iict', false, { onStatusChange }))
    await act(() => result.current.checkNow())

    expect(onStatusChange).toHaveBeenCalledTimes(1)
    expect(onStatusChange.mock.calls[0][0].response).toMatchObject({ status: 'dead', status_scope: 'IICT (Aust) Pty Ltd' })
  })

  it('a failed check hands the page nothing — the last real answer stands', async () => {
    const onStatusChange = vi.fn()
    stubResponses({ status: 500, body: {} })
    const { result } = renderHook(() => useXeroKeepalive('biz-iict', false, { onStatusChange }))
    await act(() => result.current.checkNow())
    expect(onStatusChange).not.toHaveBeenCalled()
  })

  it('switching business starts afresh — the new business is not compared with the old one', async () => {
    stubResponses({ status: 200, body: oneOrgDead() }, { status: 200, body: healthy() })
    const { result, rerender } = renderHook(({ id }) => useXeroKeepalive(id, false), { initialProps: { id: 'biz-a' } })
    await act(() => result.current.checkNow())

    rerender({ id: 'biz-b' })
    await act(() => result.current.checkNow())
    // biz-a needed a reconnect; biz-b is healthy. That is not a "restored".
    expect(toastSuccess).not.toHaveBeenCalled()
  })

  it('a reconnect already needed on the first check does not toast — the page banner already says it', async () => {
    stubResponses({ status: 200, body: oneOrgDead() })
    const { result } = renderKeepalive()
    await act(() => result.current.checkNow())
    expect(toastError).not.toHaveBeenCalled()
  })

  it('reconnected: says so', async () => {
    stubResponses({ status: 200, body: oneOrgDead() }, { status: 200, body: healthy() })
    const { result } = renderKeepalive()
    await act(() => result.current.checkNow())
    await act(() => result.current.checkNow())
    expect(toastSuccess).toHaveBeenCalledWith('Xero connection restored', expect.anything())
  })

  it('a 500 is a failed check, not "connection lost" — the last known state stands', async () => {
    stubResponses({ status: 200, body: healthy() }, { status: 500, body: { error: 'Could not check the Xero connection' } })
    const { result } = renderKeepalive()
    await act(() => result.current.checkNow())
    await act(() => result.current.checkNow())

    expect(toastWarning).not.toHaveBeenCalled()
    expect(toastError).not.toHaveBeenCalled()
    expect(result.current.status).toMatchObject({ connected: true, error: 'Unable to check connection' })
  })

  it('three failed checks in a row surface one "unable to check" toast', async () => {
    stubResponses(
      { status: 500, body: {} },
      { status: 500, body: {} },
      { status: 500, body: {} },
    )
    const { result } = renderKeepalive()
    await act(() => result.current.checkNow())
    await act(() => result.current.checkNow())
    expect(toastError).not.toHaveBeenCalled()
    await act(() => result.current.checkNow())
    expect(toastError).toHaveBeenCalledWith('Unable to check Xero connection. Check your network.', expect.anything())
  })
})
