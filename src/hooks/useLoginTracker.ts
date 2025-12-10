'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useBusinessContext } from '@/hooks/useBusinessContext'

/**
 * Hook to track user login for activity monitoring
 * Call this from the main dashboard or layout to track when users log in
 */
export function useLoginTracker() {
  const { activeBusiness } = useBusinessContext()
  const hasTracked = useRef(false)
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
    })
  }, [])

  useEffect(() => {
    // Only track once per session
    if (hasTracked.current) return
    if (!user || !activeBusiness?.id) return

    async function trackLogin() {
      try {
        const response = await fetch('/api/activity-log/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ business_id: activeBusiness!.id })
        })

        if (response.ok) {
          hasTracked.current = true
        }
      } catch (error) {
        // Silent fail - login tracking is not critical
        console.warn('[LoginTracker] Failed to track login:', error)
      }
    }

    trackLogin()
  }, [user, activeBusiness])
}

export default useLoginTracker
