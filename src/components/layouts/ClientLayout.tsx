'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ClientSidebar } from './ClientSidebar'
import NotificationBell from '@/components/notifications/NotificationBell'
import { Loader2, Menu, X } from 'lucide-react'

const SIDEBAR_STORAGE_KEY = 'sidebar-expanded'

interface ClientLayoutProps {
  children: React.ReactNode
}

export function ClientLayout({ children }: ClientLayoutProps) {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [coach, setCoach] = useState<{ name: string; email?: string } | undefined>()
  const [sidebarExpanded, setSidebarExpanded] = useState(true)
  const [sidebarInitialized, setSidebarInitialized] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Initialize sidebar based on screen size and stored preference
  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY)
    const isDesktop = window.innerWidth >= 1024

    if (stored !== null) {
      setSidebarExpanded(stored === 'true')
    } else {
      setSidebarExpanded(isDesktop)
    }
    setSidebarInitialized(true)
  }, [])

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY)
      if (stored === null) {
        setSidebarExpanded(window.innerWidth >= 1024)
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const toggleSidebar = useCallback(() => {
    setSidebarExpanded(prev => {
      const newValue = !prev
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(newValue))
      return newValue
    })
  }, [])

  useEffect(() => {
    checkAuthAndLoadData()
  }, [])

  async function checkAuthAndLoadData() {
    try {
      // Check authentication
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      // Set user name
      const name = user.user_metadata?.first_name
        ? `${user.user_metadata.first_name} ${user.user_metadata.last_name || ''}`
        : user.email?.split('@')[0] || 'User'
      setUserName(name)

      // Load business info
      await loadBusinessInfo(user.id)

      setLoading(false)
    } catch (error) {
      console.error('Error in ClientLayout:', error)
      router.push('/login')
    }
  }

  async function loadBusinessInfo(userId: string) {
    // First get the user's business
    const { data: businessUser } = await supabase
      .from('business_users')
      .select('business_id')
      .eq('user_id', userId)
      .single()

    if (!businessUser) return

    // Get business details with coach info
    const { data: business } = await supabase
      .from('businesses')
      .select(`
        business_name,
        assigned_coach_id
      `)
      .eq('id', businessUser.business_id)
      .single()

    if (business) {
      setBusinessName(business.business_name || 'My Business')

      // Load coach info if assigned
      if (business.assigned_coach_id) {
        const { data: coachUser } = await supabase
          .from('auth.users')
          .select('email, raw_user_meta_data')
          .eq('id', business.assigned_coach_id)
          .single()

        if (coachUser) {
          const metadata = coachUser.raw_user_meta_data as any
          setCoach({
            name: metadata?.first_name
              ? `${metadata.first_name} ${metadata.last_name || ''}`
              : coachUser.email?.split('@')[0] || 'Your Coach',
            email: coachUser.email
          })
        }
      }
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading || !sidebarInitialized) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-brand-orange mx-auto mb-4" />
          <p className="text-gray-500">Loading your portal...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile Top Bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-white border-b border-gray-200 z-50 flex items-center justify-between px-4">
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
        <span className="font-semibold text-gray-900 truncate">{businessName}</span>
        <NotificationBell />
      </div>

      {/* Desktop Top Bar */}
      <div className={`hidden lg:flex fixed top-0 right-0 h-14 bg-white border-b border-gray-200 z-30 items-center justify-end px-6 ${sidebarExpanded ? 'left-64' : 'left-[72px]'} transition-all duration-300`}>
        <NotificationBell />
      </div>

      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/40 z-40"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`lg:block ${mobileMenuOpen ? 'block' : 'hidden'}`}>
        <ClientSidebar
          businessName={businessName}
          userName={userName}
          coach={coach}
          onLogout={handleLogout}
          isExpanded={sidebarExpanded}
          onToggle={toggleSidebar}
        />
      </div>

      {/* Main Content */}
      <div className={`pt-14 lg:pt-14 ${sidebarExpanded ? 'lg:pl-64' : 'lg:pl-[72px]'} transition-all duration-300`}>
        <main className="min-h-screen">
          {children}
        </main>
      </div>
    </div>
  )
}

export default ClientLayout
