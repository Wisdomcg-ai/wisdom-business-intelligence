/**
 * Phase 61-05 — ShareDialog tests.
 *
 * Coverage:
 *  - Three radio modes render; default selected = currentMode.
 *  - "Specific people…" reveals TeammatePicker; other modes hide it.
 *  - Save with mode='specific' and zero selected → button disabled and no fetch.
 *  - Save fires PATCH /api/todos/[id]/share (or /api/ideas/[id]/share) with
 *    correct body shape per mode; calls onSaved with response.task/idea; toast.success.
 *  - On non-2xx response → toast.error with server message; dialog stays open;
 *    onSaved NOT called.
 *  - Network throw → toast.error; onSaved NOT called.
 *  - Closing the dialog calls onClose without firing the fetch.
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { ShareDialog, deriveShareMode } from '../ShareDialog'

// Mock sonner toast so jsdom doesn't choke and we can assert.
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))
import { toast } from 'sonner'

// Mock the useBusinessTeammates hook used by the embedded TeammatePicker.
vi.mock('@/lib/hooks/useBusinessTeammates', () => ({
  useBusinessTeammates: vi.fn().mockReturnValue({
    teammates: [
      { user_id: 'u-self', email: 'me@x.com', display_name: 'Me', role: 'owner' },
      { user_id: 'u-team1', email: 'alex@x.com', display_name: 'Alex Lee', role: 'team_member' },
      { user_id: 'u-team2', email: 'jamie@x.com', display_name: 'Jamie K', role: 'team_member' },
    ],
    isLoading: false,
    error: null,
  }),
}))

// fetch stub
const fetchMock = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  global.fetch = fetchMock as unknown as typeof fetch
})

afterEach(() => {
  fetchMock.mockReset()
})

function makeOkResponse(body: Record<string, unknown>) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response
}

function makeErrResponse(status: number, body: Record<string, unknown>) {
  return {
    ok: false,
    status,
    json: async () => body,
  } as unknown as Response
}

describe('deriveShareMode', () => {
  it('returns "team" when shared_with_all is true', () => {
    expect(deriveShareMode({ shared_with_all: true, shared_with: [] })).toBe('team')
  })
  it('returns "specific" when shared_with has entries', () => {
    expect(
      deriveShareMode({ shared_with_all: false, shared_with: ['u-1'] })
    ).toBe('specific')
  })
  it('returns "private" when neither set', () => {
    expect(
      deriveShareMode({ shared_with_all: false, shared_with: [] })
    ).toBe('private')
  })
  it('treats undefined as private', () => {
    expect(deriveShareMode({})).toBe('private')
  })
})

describe('ShareDialog — rendering', () => {
  it('renders three radio options with currentMode selected', () => {
    render(
      <ShareDialog
        open
        itemId="t-1"
        itemType="todo"
        businessId="biz-1"
        currentMode="team"
        currentSharedWith={[]}
        currentUserId="u-self"
        onSaved={() => {}}
        onClose={() => {}}
      />
    )

    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(3)
    const team = radios.find((r) => (r as HTMLInputElement).value === 'team') as HTMLInputElement
    expect(team.checked).toBe(true)
    const priv = radios.find((r) => (r as HTMLInputElement).value === 'private') as HTMLInputElement
    expect(priv.checked).toBe(false)
  })

  it('does not render when open=false', () => {
    const { container } = render(
      <ShareDialog
        open={false}
        itemId="t-1"
        itemType="todo"
        businessId="biz-1"
        currentMode="private"
        currentSharedWith={[]}
        currentUserId="u-self"
        onSaved={() => {}}
        onClose={() => {}}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('shows TeammatePicker only when "Specific people…" is selected', () => {
    render(
      <ShareDialog
        open
        itemId="t-1"
        itemType="todo"
        businessId="biz-1"
        currentMode="private"
        currentSharedWith={[]}
        currentUserId="u-self"
        onSaved={() => {}}
        onClose={() => {}}
      />
    )
    // Initially hidden
    expect(screen.queryByTestId('teammate-picker')).toBeNull()

    // Switch to specific
    fireEvent.click(screen.getByRole('radio', { name: /Specific people/i }))
    expect(screen.getByTestId('teammate-picker')).toBeInTheDocument()

    // Back to team — hidden again
    fireEvent.click(screen.getByRole('radio', { name: /Everyone on team/i }))
    expect(screen.queryByTestId('teammate-picker')).toBeNull()
  })
})

describe('ShareDialog — save behaviour', () => {
  it('PATCHes /api/todos/[id]/share with { mode: "private" } when mode=private', async () => {
    const onSaved = vi.fn()
    const onClose = vi.fn()
    fetchMock.mockResolvedValueOnce(
      makeOkResponse({ task: { id: 't-1', is_owner: true } })
    )

    render(
      <ShareDialog
        open
        itemId="t-1"
        itemType="todo"
        businessId="biz-1"
        currentMode="private"
        currentSharedWith={[]}
        currentUserId="u-self"
        onSaved={onSaved}
        onClose={onClose}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Save sharing/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/todos/t-1/share')
    expect((init as RequestInit).method).toBe('PATCH')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      mode: 'private',
    })
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ id: 't-1', is_owner: true }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalled()
  })

  it('PATCHes /api/ideas/[id]/share with { mode: "team" } when mode=team and itemType=idea', async () => {
    const onSaved = vi.fn()
    fetchMock.mockResolvedValueOnce(
      makeOkResponse({ idea: { id: 'i-1', is_owner: true } })
    )

    render(
      <ShareDialog
        open
        itemId="i-1"
        itemType="idea"
        businessId="biz-1"
        currentMode="team"
        currentSharedWith={[]}
        currentUserId="u-self"
        onSaved={onSaved}
        onClose={() => {}}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Save sharing/i }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/ideas/i-1/share')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ mode: 'team' })
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ id: 'i-1', is_owner: true }))
  })

  it('PATCHes with { mode: "specific", userIds: [...] } when teammates are selected', async () => {
    const onSaved = vi.fn()
    fetchMock.mockResolvedValueOnce(
      makeOkResponse({ task: { id: 't-1', is_owner: true, shared_with: ['u-team1'] } })
    )

    render(
      <ShareDialog
        open
        itemId="t-1"
        itemType="todo"
        businessId="biz-1"
        currentMode="specific"
        currentSharedWith={['u-team1']}
        currentUserId="u-self"
        onSaved={onSaved}
        onClose={() => {}}
      />
    )

    // Picker is visible because currentMode=specific. Selection pre-filled.
    expect(screen.getByTestId('teammate-picker')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Save sharing/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      mode: 'specific',
      userIds: ['u-team1'],
    })
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
  })

  it('disables Save when mode=specific and zero teammates selected', () => {
    render(
      <ShareDialog
        open
        itemId="t-1"
        itemType="todo"
        businessId="biz-1"
        currentMode="specific"
        currentSharedWith={[]}
        currentUserId="u-self"
        onSaved={() => {}}
        onClose={() => {}}
      />
    )
    const save = screen.getByRole('button', { name: /Save sharing/i }) as HTMLButtonElement
    expect(save.disabled).toBe(true)
    // Click should not fire fetch
    fireEvent.click(save)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('on non-2xx response: shows toast.error with server message, dialog stays open, onSaved not called', async () => {
    const onSaved = vi.fn()
    const onClose = vi.fn()
    fetchMock.mockResolvedValueOnce(
      makeErrResponse(403, { error: 'Only the owner can share this item' })
    )

    render(
      <ShareDialog
        open
        itemId="t-1"
        itemType="todo"
        businessId="biz-1"
        currentMode="team"
        currentSharedWith={[]}
        currentUserId="u-self"
        onSaved={onSaved}
        onClose={onClose}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Save sharing/i }))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Only the owner can share this item')
    )
    expect(onSaved).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    // Dialog is still mounted
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('on network throw: shows toast.error, onSaved not called', async () => {
    const onSaved = vi.fn()
    fetchMock.mockRejectedValueOnce(new Error('network down'))

    render(
      <ShareDialog
        open
        itemId="t-1"
        itemType="todo"
        businessId="biz-1"
        currentMode="team"
        currentSharedWith={[]}
        currentUserId="u-self"
        onSaved={onSaved}
        onClose={() => {}}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Save sharing/i }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('network down'))
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('Cancel button calls onClose and does not fire fetch', () => {
    const onClose = vi.fn()
    render(
      <ShareDialog
        open
        itemId="t-1"
        itemType="todo"
        businessId="biz-1"
        currentMode="private"
        currentSharedWith={[]}
        currentUserId="u-self"
        onSaved={() => {}}
        onClose={onClose}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('ShareDialog — boundary documentation', () => {
  it('source file contains the SCOPE BOUNDARY comment block', async () => {
    // Read the source file at runtime to assert the boundary comment is present.
    // This guards against accidental removal during refactors.
    const fs = await import('node:fs')
    const path = await import('node:path')
    const filePath = path.resolve(__dirname, '..', 'ShareDialog.tsx')
    const source = fs.readFileSync(filePath, 'utf8')
    expect(source).toMatch(/SCOPE BOUNDARY/)
    expect(source).toMatch(/action_items/)
    expect(source).toMatch(/issues_list/)
    expect(source).toMatch(/shared board/i)
  })
})
