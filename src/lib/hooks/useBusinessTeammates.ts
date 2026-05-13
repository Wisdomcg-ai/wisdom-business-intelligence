/**
 * Phase 61-05 — useBusinessTeammates hook
 *
 * Fetches active members of a business (business_users where status='active'),
 * joined to public.users for email/display name. Caller passes the businessId;
 * the current user is included in the returned list (TeammatePicker filters
 * them out for the share UI). No SWR/react-query dependency — simple
 * component-state cache per mount, matching the rest of this codebase.
 */

'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export type Teammate = {
  user_id: string
  email: string
  display_name?: string
  role: string
}

export type UseBusinessTeammatesResult = {
  teammates: Teammate[]
  isLoading: boolean
  error: string | null
}

type BusinessUserRow = {
  user_id: string
  role: string
  status: string
  user?: {
    email?: string | null
    first_name?: string | null
    last_name?: string | null
  } | null
}

function resolveDisplayName(row: BusinessUserRow): string | undefined {
  const u = row.user
  if (!u) return undefined
  const first = (u.first_name || '').trim()
  const last = (u.last_name || '').trim()
  if (first && last) return `${first} ${last}`
  if (first) return first
  if (last) return last
  return undefined
}

export function useBusinessTeammates(
  businessId: string | null | undefined
): UseBusinessTeammatesResult {
  const [teammates, setTeammates] = useState<Teammate[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!businessId) {
      setTeammates([])
      setIsLoading(false)
      setError(null)
      return
    }

    let cancelled = false
    setIsLoading(true)
    setError(null)

    const supabase = createClient()

    supabase
      .from('business_users')
      .select('user_id, role, status, user:users(email, first_name, last_name)')
      .eq('business_id', businessId)
      .eq('status', 'active')
      .then(({ data, error: queryError }) => {
        if (cancelled) return
        if (queryError) {
          setError(queryError.message || 'Failed to load teammates')
          setTeammates([])
        } else {
          const rows = (data || []) as unknown as BusinessUserRow[]
          const mapped: Teammate[] = rows.map((row) => ({
            user_id: row.user_id,
            email: row.user?.email || '',
            display_name: resolveDisplayName(row),
            role: row.role,
          }))
          setTeammates(mapped)
        }
        setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [businessId])

  return { teammates, isLoading, error }
}
