'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ClientSidebar } from './ClientSidebar'
import { Loader2 } from 'lucide-react'

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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-teal-600 mx-auto mb-4" />
          <p className="text-gray-500">Loading your portal...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <ClientSidebar
        businessName={businessName}
        userName={userName}
        coach={coach}
        onLogout={handleLogout}
      />

      {/* Main Content */}
      <div className="pl-64">
        <main className="min-h-screen">
          {children}
        </main>
      </div>
    </div>
  )
}

export default ClientLayout
