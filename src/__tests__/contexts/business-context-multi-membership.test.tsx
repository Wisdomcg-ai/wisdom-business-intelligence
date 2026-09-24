/**
 * A client with two active business_users rows (Chris Field: GMS Digital +
 * Scan2Archive, 24 Sep 2026) got "No business linked to your account":
 * .maybeSingle() errored on 2 rows, the owner_id fallback found nothing.
 * The loader must pick the newest membership instead of loading none.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

const USER_ID = '514bdfb3-72ac-41ef-a238-2e69269e3f71'
const NEWEST = 'fd563fa5-e37a-4e4f-aa17-6f9018ad7d03'
const OLDER = 'c0152aa7-326a-4a75-b17e-05d99322650f'

let memberships: Array<{ business_id: string; role: string; created_at: string }>
const captureMessage = vi.fn()

vi.mock('@sentry/nextjs', () => ({ captureMessage: (...a: unknown[]) => captureMessage(...a) }))
vi.mock('@/lib/auth/roles', () => ({ getUserSystemRole: async () => 'client' }))

function query(table: string) {
  const filters: Record<string, unknown> = {}
  let ordered = false
  const q: any = {
    select: () => q,
    eq: (col: string, val: unknown) => { filters[col] = val; return q },
    order: (col: string, opts: { ascending: boolean }) => {
      expect(col).toBe('created_at'); expect(opts.ascending).toBe(false); ordered = true; return q
    },
    maybeSingle: async () => {
      if (table === 'business_users') {
        return memberships.length > 1
          ? { data: null, error: { code: 'PGRST116', message: 'multiple rows' } }
          : { data: memberships[0] ?? null, error: null }
      }
      if (table === 'businesses') {
        if (filters.owner_id) return { data: null, error: null }
        return { data: { id: filters.id, name: `biz-${filters.id}`, owner_id: 'someone-else', industry: null, status: 'active' }, error: null }
      }
      return { data: { id: 'profile-1' }, error: null }
    },
    then: (resolve: (v: unknown) => void) => {
      const rows = [...memberships].sort((a, b) => b.created_at.localeCompare(a.created_at))
      resolve({ data: ordered ? rows : memberships, error: null })
    },
  }
  return q
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: USER_ID, email: 'c@x' } }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    from: query,
  }),
}))

import { BusinessContextProvider, useBusinessContext } from '@/contexts/BusinessContext'

function Probe() {
  const { activeBusiness, isLoading } = useBusinessContext()
  if (isLoading) return <p>loading</p>
  return <p>{activeBusiness ? `active:${activeBusiness.id}` : 'none'}</p>
}

describe('BusinessContext — client with more than one active membership', () => {
  beforeEach(() => { captureMessage.mockReset() })

  it('loads the newest membership instead of no business', async () => {
    memberships = [
      { business_id: OLDER, role: 'owner', created_at: '2025-12-19T20:15:10Z' },
      { business_id: NEWEST, role: 'owner', created_at: '2026-09-24T22:02:45Z' },
    ]
    render(<BusinessContextProvider><Probe /></BusinessContextProvider>)
    await waitFor(() => expect(screen.getByText(`active:${NEWEST}`)).toBeTruthy())
    expect(captureMessage).toHaveBeenCalledWith(
      'Client has multiple active business memberships',
      expect.objectContaining({ tags: { invariant: 'client_single_active_membership' } }),
    )
  })

  it('a single membership still loads, with no warning', async () => {
    memberships = [{ business_id: NEWEST, role: 'owner', created_at: '2026-09-24T22:02:45Z' }]
    render(<BusinessContextProvider><Probe /></BusinessContextProvider>)
    await waitFor(() => expect(screen.getByText(`active:${NEWEST}`)).toBeTruthy())
    expect(captureMessage).not.toHaveBeenCalled()
  })
})
