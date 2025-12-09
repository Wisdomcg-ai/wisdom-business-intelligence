'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface UseSessionTimeoutOptions {
  timeoutMinutes?: number
  warningMinutes?: number
  onWarning?: () => void
  onTimeout?: () => void
}

/**
 * Hook to handle session timeout due to inactivity
 * Default: 30 minutes of inactivity triggers logout
 */
export function useSessionTimeout(options: UseSessionTimeoutOptions = {}) {
  const {
    timeoutMinutes = 30,
    warningMinutes = 5,
    onWarning,
    onTimeout
  } = options

  const router = useRouter()
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const warningRef = useRef<NodeJS.Timeout | null>(null)
  const lastActivityRef = useRef<number>(Date.now())

  const timeoutMs = timeoutMinutes * 60 * 1000
  const warningMs = (timeoutMinutes - warningMinutes) * 60 * 1000

  const handleLogout = useCallback(async () => {
    try {
      // Call server-side logout
      await fetch('/api/auth/logout', { method: 'POST' })

      // Also sign out client-side
      const supabase = createClient()
      await supabase.auth.signOut()

      if (onTimeout) {
        onTimeout()
      }

      router.push('/auth/login?reason=session_expired')
    } catch (error) {
      console.error('[Session Timeout] Logout error:', error)
      router.push('/auth/login?reason=session_expired')
    }
  }, [router, onTimeout])

  const resetTimers = useCallback(() => {
    lastActivityRef.current = Date.now()

    // Clear existing timers
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    if (warningRef.current) {
      clearTimeout(warningRef.current)
    }

    // Set warning timer
    if (onWarning && warningMs > 0) {
      warningRef.current = setTimeout(() => {
        onWarning()
      }, warningMs)
    }

    // Set logout timer
    timeoutRef.current = setTimeout(() => {
      handleLogout()
    }, timeoutMs)
  }, [timeoutMs, warningMs, onWarning, handleLogout])

  useEffect(() => {
    // Activity events to track
    const activityEvents = [
      'mousedown',
      'mousemove',
      'keydown',
      'scroll',
      'touchstart',
      'click'
    ]

    // Throttle activity tracking to avoid excessive timer resets
    let lastReset = 0
    const throttleMs = 30000 // Only reset every 30 seconds max

    const handleActivity = () => {
      const now = Date.now()
      if (now - lastReset > throttleMs) {
        lastReset = now
        resetTimers()
      }
    }

    // Add event listeners
    activityEvents.forEach(event => {
      document.addEventListener(event, handleActivity, { passive: true })
    })

    // Initial timer setup
    resetTimers()

    // Cleanup
    return () => {
      activityEvents.forEach(event => {
        document.removeEventListener(event, handleActivity)
      })
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      if (warningRef.current) {
        clearTimeout(warningRef.current)
      }
    }
  }, [resetTimers])

  return {
    resetTimers,
    getLastActivity: () => lastActivityRef.current,
    getTimeRemaining: () => {
      const elapsed = Date.now() - lastActivityRef.current
      return Math.max(0, timeoutMs - elapsed)
    }
  }
}
