'use client'

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useBusinessContext } from '@/contexts/BusinessContext'

/**
 * Renders a persistent error toast whenever BusinessContext reports an error.
 *
 * Before this component existed, context errors (e.g. transient failure of the
 * system_roles query) set `error` state that nothing displayed — users saw a
 * silently broken page rather than any indication something was wrong.
 *
 * Behavior:
 *   - Fires once per distinct error message (dedup via ref).
 *   - Uses an action button that triggers a hard reload, which is the actual
 *     recovery path for transient context errors.
 */
export function ContextErrorToast() {
  const { error } = useBusinessContext()
  const lastShown = useRef<string | null>(null)

  useEffect(() => {
    if (!error || error === lastShown.current) return
    lastShown.current = error
    toast.error(error, {
      duration: Infinity, // persistent — user dismisses or reloads
      action: {
        label: 'Reload',
        onClick: () => {
          if (typeof window !== 'undefined') window.location.reload()
        },
      },
    })
  }, [error])

  return null
}
