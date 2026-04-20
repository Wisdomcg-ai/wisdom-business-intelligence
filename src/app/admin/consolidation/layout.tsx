'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getUserSystemRole } from '@/lib/auth/roles'
import { Loader2 } from 'lucide-react'

/**
 * Route guard — /admin/consolidation/* is coach + super_admin only.
 * Clients redirect to /dashboard. Unauthenticated users go to /login.
 *
 * Mirrors src/app/cfo/layout.tsx exactly (PATTERNS.md § Route guard).
 */
export default function ConsolidationAdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    getUserSystemRole().then(role => {
      if (role === 'coach' || role === 'super_admin') {
        setChecking(false)
      } else if (role === null) {
        router.replace('/login')
      } else {
        router.replace('/dashboard')
      }
    })
  }, [router])

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  return <>{children}</>
}
