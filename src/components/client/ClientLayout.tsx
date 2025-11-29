'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import RoleSwitcher from '@/components/shared/RoleSwitcher'
import {
  Home,
  TrendingUp,
  Target,
  Calendar,
  FileText,
  ListChecks,
  Building,
  BarChart3
} from 'lucide-react'

interface Business {
  id: string
  business_name: string
  enabled_modules: {
    forecast: boolean
    goals: boolean
    chat: boolean
    documents: boolean
  }
}

interface ClientLayoutProps {
  children: React.ReactNode
}

export default function ClientLayout({ children }: ClientLayoutProps) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  const [business, setBusiness] = useState<Business | null>(null)
  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState<string>('')

  useEffect(() => {
    loadBusinessData()
  }, [])

  async function loadBusinessData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    // Set user name from metadata or email
    const name = user.user_metadata?.first_name
      ? `${user.user_metadata.first_name} ${user.user_metadata.last_name || ''}`
      : user.email?.split('@')[0] || 'User'
    setUserName(name)

    // First try via business_users join table
    const { data: businessUser } = await supabase
      .from('business_users')
      .select('business_id')
      .eq('user_id', user.id)
      .maybeSingle()

    let businessData = null

    if (businessUser) {
      const { data } = await supabase
        .from('businesses')
        .select('*')
        .eq('id', businessUser.business_id)
        .maybeSingle()
      businessData = data
    } else {
      // Fallback: try direct owner_id lookup
      const { data } = await supabase
        .from('businesses')
        .select('*')
        .eq('owner_id', user.id)
        .maybeSingle()
      businessData = data
    }

    // Set business data even if null (user might not have a business yet)
    setBusiness(businessData)
    setLoading(false)
  }

  const tabs = [
    {
      name: 'Dashboard',
      href: '/dashboard',
      icon: Home,
      enabled: true
    },
    {
      name: 'Forecast',
      href: '/finances/forecast',
      icon: TrendingUp,
      enabled: business?.enabled_modules?.forecast ?? true
    },
    {
      name: 'Goals',
      href: '/goals',
      icon: Target,
      enabled: business?.enabled_modules?.goals ?? true
    },
    {
      name: 'Sessions',
      href: '/client/sessions',
      icon: Calendar,
      enabled: true
    },
    {
      name: 'Documents',
      href: '/client/documents',
      icon: FileText,
      enabled: business?.enabled_modules?.documents ?? true
    },
    {
      name: 'Actions',
      href: '/client/actions',
      icon: ListChecks,
      enabled: true
    },
    {
      name: 'Analytics',
      href: '/client/analytics',
      icon: BarChart3,
      enabled: true
    }
  ]

  const enabledTabs = tabs.filter(tab => tab.enabled)

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Building className="w-8 h-8 animate-pulse text-teal-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-teal-600 rounded-lg flex items-center justify-center">
                <Building className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">
                  {business?.business_name || 'Your Business'}
                </h1>
                <p className="text-sm text-gray-600">Wisdom Business Intelligence</p>
              </div>
            </div>
            <RoleSwitcher currentRole="client" userName={userName} />
          </div>

          {/* Navigation Tabs */}
          <div className="flex space-x-1 overflow-x-auto pb-px">
            {enabledTabs.map((tab) => {
              const isActive = pathname === tab.href || pathname.startsWith(tab.href + '/')
              const badgeCount = 'badge' in tab ? (tab as { badge?: number }).badge : undefined
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`relative flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    isActive
                      ? 'border-teal-600 text-teal-600'
                      : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.name}
                  {badgeCount !== undefined && badgeCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-xs font-bold text-white bg-red-500 rounded-full">
                      {badgeCount > 99 ? '99+' : badgeCount}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </div>
      </div>
    </div>
  )
}
