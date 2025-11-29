'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { CoachSidebar } from './CoachSidebar'
import { CoachHeader } from './CoachHeader'

interface Client {
  id: string
  business_name: string
  status: string
}

interface CoachLayoutProps {
  children: React.ReactNode
  title?: string
  subtitle?: string
  showHeader?: boolean
}

export function CoachLayout({
  children,
  title,
  subtitle,
  showHeader = true
}: CoachLayoutProps) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  const [userName, setUserName] = useState('Coach')
  const [clients, setClients] = useState<Client[]>([])
  const [notifications] = useState<any[]>([])

  // Check if we're on a public page (login)
  const isPublicPage = pathname === '/coach/login'

  useEffect(() => {
    if (isPublicPage) return

    // Load user info and clients in background - don't block render
    loadUserData()
    loadClients()
  }, [isPublicPage])

  async function loadUserData() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        const name = session.user.user_metadata?.first_name
          ? `${session.user.user_metadata.first_name} ${session.user.user_metadata.last_name || ''}`
          : session.user.email?.split('@')[0] || 'Coach'
        setUserName(name)
      }
    } catch (error) {
      console.error('[CoachLayout] Error loading user:', error)
    }
  }

  async function loadClients() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return

      const { data, error } = await supabase
        .from('businesses')
        .select('id, business_name, status')
        .eq('assigned_coach_id', session.user.id)
        .order('business_name', { ascending: true })

      if (!error && data) {
        setClients(data.map(b => ({
          id: b.id,
          business_name: b.business_name || 'Unnamed Business',
          status: b.status || 'active'
        })))
      }
    } catch (error) {
      console.error('[CoachLayout] Error loading clients:', error)
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/coach/login')
  }

  function handleSearch(query: string) {
    router.push(`/coach/clients?search=${encodeURIComponent(query)}`)
  }

  // For public pages (login), just render children without layout chrome
  if (isPublicPage) {
    return <>{children}</>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <CoachSidebar
        clients={clients}
        userName={userName}
        onLogout={handleLogout}
      />

      {/* Main Content */}
      <div className="pl-64">
        {showHeader && (
          <CoachHeader
            title={title}
            subtitle={subtitle}
            notifications={notifications}
            onSearch={handleSearch}
          />
        )}

        <main className="min-h-[calc(100vh-73px)]">
          {children}
        </main>
      </div>
    </div>
  )
}

export default CoachLayout
