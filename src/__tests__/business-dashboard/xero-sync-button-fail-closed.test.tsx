/**
 * The KPI dashboard's Sync Xero button — a green tick only for a real "synced".
 *
 * The button used to treat any 2xx as success, and the route it called answered
 * 200 { success: true } after syncing one org of a multi-org business, writing
 * zeros on a failed fetch and stamping the clock regardless. Now the route says
 * what happened per org (xero-sync-route.test.ts) and the button has to say it
 * too: synced / synced some orgs / couldn't sync are three different messages,
 * and anything the button cannot read is a failure, never a success.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

const toast = vi.hoisted(() => ({
  loading: vi.fn(() => 'sync-toast'),
  success: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}))
vi.mock('sonner', () => ({ toast }))

import { XeroSyncButton } from '@/app/business-dashboard/components/XeroSyncButton'

const PROFILE_ID = 'aabd3c49-4dc8-4aa6-a9a6-75f62ab89ff5'
const SYNCED_ONE = { outcome: 'synced', orgs: [{ name: 'Urban Road Pty Ltd', status: 'success' }] }
const PARTIAL = {
  outcome: 'partial',
  orgs: [
    { name: 'IICT Group Limited', status: 'success' },
    { name: 'IICT Group Pty Ltd', status: 'error' },
    { name: 'IICT (Aust) Pty Ltd', status: 'success' },
  ],
}
const FAILED = { outcome: 'failed', orgs: [{ name: 'Urban Road Pty Ltd', status: 'error' }] }

function answer(status: number, body: unknown) {
  const fetchMock = vi.fn(async (..._args: unknown[]) =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function pressAgain() {
  fireEvent.click(screen.getByRole('button'))
  await waitFor(() => expect(screen.getByRole('button')).not.toBeDisabled())
}

async function press(onSyncComplete = vi.fn()) {
  render(<XeroSyncButton businessId={PROFILE_ID} onSyncComplete={onSyncComplete} />)
  await pressAgain()
  return onSyncComplete
}

function onlyToast(kind: keyof typeof toast) {
  for (const k of ['success', 'warning', 'info', 'error'] as const) {
    if (k === kind) expect(toast[k], `${k} toast`).toHaveBeenCalledTimes(1)
    else expect(toast[k], `${k} toast`).not.toHaveBeenCalled()
  }
  return String((toast[kind].mock.calls[0] as unknown[])[0])
}

beforeEach(() => {
  for (const fn of Object.values(toast)) fn.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('XeroSyncButton — what each answer says', () => {
  it('posts the business to /api/Xero/sync', async () => {
    const fetchMock = answer(200, SYNCED_ONE)
    await press()
    expect(fetchMock).toHaveBeenCalledWith('/api/Xero/sync', expect.objectContaining({ method: 'POST' }))
    expect(JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body))).toEqual({ business_id: PROFILE_ID })
    expect(toast.loading).toHaveBeenCalledTimes(1)
  })

  it('synced: a success toast, and the charts re-read', async () => {
    answer(200, SYNCED_ONE)
    const onSyncComplete = await press()
    expect(onlyToast('success')).toBe('Xero synced')
    // The result replaces the "Syncing…" toast rather than stacking under it.
    expect(toast.success).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ id: 'sync-toast' }))
    expect(onSyncComplete).toHaveBeenCalledTimes(1)
  })

  it('synced across several orgs says all of them', async () => {
    answer(200, { outcome: 'synced', orgs: [{ name: 'Dragon Roofing Pty Ltd', status: 'success' }, { name: 'Easy Hail Claim', status: 'success' }] })
    await press()
    expect(onlyToast('success')).toBe('Xero synced — all 2 organisations')
  })

  it('one org of several refused: a warning naming it — no green tick — and the charts still re-read', async () => {
    answer(200, PARTIAL)
    const onSyncComplete = await press()
    const message = onlyToast('warning')
    expect(message).toMatch(/Synced 2 of 3 Xero organisations/)
    expect(message).toMatch(/IICT Group Pty Ltd couldn't be synced/)
    expect(screen.getByTestId('xero-sync-warning')).toBeInTheDocument()
    expect(onSyncComplete).toHaveBeenCalledTimes(1)
  })

  it('a disconnected org is named among the orgs that could not sync', async () => {
    answer(200, {
      outcome: 'partial',
      orgs: [
        { name: 'Dragon Roofing Pty Ltd', status: 'success' },
        { name: 'Easy Hail Claim', status: 'disconnected' },
      ],
    })
    await press()
    expect(onlyToast('warning')).toMatch(/Synced 1 of 2 Xero organisations\. Easy Hail Claim couldn't be synced/)
  })

  it('every org landed but with gaps: a warning, not a success', async () => {
    answer(200, { outcome: 'partial', orgs: [{ name: 'Urban Road Pty Ltd', status: 'partial' }] })
    await press()
    expect(onlyToast('warning')).toMatch(/may be incomplete/)
  })

  it('a bare 200 without an outcome (the old contract) is not a success', async () => {
    answer(200, { success: true, metrics: { revenue_month: 0 } })
    const onSyncComplete = await press()
    expect(onlyToast('error')).toMatch(/Couldn't sync Xero/)
    expect(onSyncComplete).not.toHaveBeenCalled()
  })

  it('a 200 whose body is not JSON is not a success', async () => {
    answer(200, '<html>gateway</html>')
    const onSyncComplete = await press()
    onlyToast('error')
    expect(onSyncComplete).not.toHaveBeenCalled()
  })

  it('"synced" is believed only with a 200', async () => {
    answer(500, SYNCED_ONE)
    const onSyncComplete = await press()
    onlyToast('error')
    expect(onSyncComplete).not.toHaveBeenCalled()
  })

  it('failed: an error, and nothing re-reads', async () => {
    answer(502, FAILED)
    const onSyncComplete = await press()
    expect(onlyToast('error')).toMatch(/Couldn't sync Xero/)
    expect(screen.getByTestId('xero-sync-error')).toBeInTheDocument()
    expect(onSyncComplete).not.toHaveBeenCalled()
  })

  it("stopped by Xero's daily limit: says so", async () => {
    answer(502, { outcome: 'failed', orgs: [{ name: 'Urban Road Pty Ltd', status: 'paused' }] })
    await press()
    expect(onlyToast('error')).toMatch(/daily request limit/)
  })

  it('the daily-limit message needs every org to have hit the limit', async () => {
    answer(502, {
      outcome: 'failed',
      orgs: [
        { name: 'Dragon Roofing Pty Ltd', status: 'paused' },
        { name: 'Easy Hail Claim', status: 'error' },
      ],
    })
    await press()
    expect(onlyToast('error')).not.toMatch(/daily request limit/)
  })

  it('a network failure is a failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    const onSyncComplete = await press()
    onlyToast('error')
    expect(onSyncComplete).not.toHaveBeenCalled()
  })

  it('another sync already running: information, neither success nor failure', async () => {
    answer(409, { outcome: 'in_progress', orgs: [] })
    const onSyncComplete = await press()
    expect(onlyToast('info')).toMatch(/already running/)
    expect(onSyncComplete).not.toHaveBeenCalled()
  })

  it('never connected: says so rather than "try again later"', async () => {
    answer(404, { outcome: 'not_connected', orgs: [] })
    await press()
    expect(onlyToast('info')).toMatch(/isn't connected to Xero/)
  })

  it('not connected because Xero was disconnected: says it needs reconnecting', async () => {
    answer(404, { outcome: 'not_connected', orgs: [{ name: 'Urban Road Pty Ltd', status: 'disconnected' }] })
    await press()
    const message = onlyToast('error')
    expect(message).toMatch(/disconnected/)
    expect(message).not.toMatch(/isn't connected to Xero/)
  })

  it('no access: says so rather than "try again later"', async () => {
    answer(403, { error: 'Access denied to this business' })
    await press()
    expect(onlyToast('error')).toMatch(/don't have access/)
  })
})

describe('XeroSyncButton — what stays on the button', () => {
  it('the green tick fades after a few seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    answer(200, SYNCED_ONE)
    await press()
    expect(screen.getByTestId('xero-sync-success')).toBeInTheDocument()
    await act(async () => { vi.advanceTimersByTime(3_500) })
    expect(screen.queryByTestId('xero-sync-success')).toBeNull()
  })

  it('a warning and a failure stay put until the next sync', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    answer(200, PARTIAL)
    await press()
    await act(async () => { vi.advanceTimersByTime(60_000) })
    expect(screen.getByTestId('xero-sync-warning')).toBeInTheDocument()

    answer(502, FAILED)
    await pressAgain()
    await act(async () => { vi.advanceTimersByTime(60_000) })
    expect(screen.getByTestId('xero-sync-error')).toBeInTheDocument()
    expect(screen.queryByTestId('xero-sync-warning')).toBeNull()
  })

  it('a fading green tick never clears a failure that came after it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    answer(200, SYNCED_ONE)
    await press()
    answer(502, FAILED)
    await pressAgain()
    await act(async () => { vi.advanceTimersByTime(3_500) })
    expect(screen.getByTestId('xero-sync-error')).toBeInTheDocument()
  })
})
