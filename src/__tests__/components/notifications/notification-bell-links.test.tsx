/**
 * S3 (22 Sep 2026 system diagnostic): the bell rendered notification.link as a
 * clickable <Link> whatever it held — a planted `javascript:` or phishing URL
 * ran / opened inside the trusted UI. Only a same-site path may render.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => {
    const channel = { on: () => channel, subscribe: () => channel, unsubscribe: vi.fn() }
    return { channel: () => channel }
  },
}))

import NotificationBell from '@/components/notifications/NotificationBell'

const base = { user_id: 'u1', read: false, created_at: new Date().toISOString(), type: 'chat_message', message: 'm' }

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      success: true,
      notifications: [
        { ...base, id: 'n1', title: 'Safe', link: '/coach/messages?thread=abc' },
        { ...base, id: 'n2', title: 'Script', link: 'javascript:alert(document.cookie)' },
        { ...base, id: 'n3', title: 'Offsite', link: 'https://evil.example/login' },
        { ...base, id: 'n4', title: 'Protocol-relative', link: '//evil.example/login' },
      ],
    }),
  }))
})
afterEach(() => { vi.unstubAllGlobals() })

describe('NotificationBell only renders same-site links', () => {
  it('keeps the same-site link and drops javascript:, absolute and protocol-relative ones', async () => {
    render(<NotificationBell />)
    fireEvent.click(screen.getAllByRole('button')[0])
    await waitFor(() => expect(screen.getByText('Offsite')).toBeInTheDocument())

    // Every notification's "View" link — the footer's fixed "/notifications" link aside.
    const viewHrefs = screen
      .getAllByRole('link')
      .map((a) => a.getAttribute('href'))
      .filter((href) => href !== '/notifications')
    expect(viewHrefs).toEqual(['/coach/messages?thread=abc'])
  })
})
