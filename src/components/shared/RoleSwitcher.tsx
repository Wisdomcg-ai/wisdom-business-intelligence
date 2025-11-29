'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getUserSystemRole, type SystemRole } from '@/lib/auth/roles'
import {
  Shield,
  Briefcase,
  Building,
  ChevronDown,
  LogOut,
  User
} from 'lucide-react'

interface RoleSwitcherProps {
  currentRole: 'admin' | 'coach' | 'client'
  userName?: string
}

interface RoleOption {
  role: SystemRole
  label: string
  icon: React.ComponentType<{ className?: string }>
  href: string
  color: string
  bgColor: string
}

export default function RoleSwitcher({ currentRole, userName }: RoleSwitcherProps) {
  const router = useRouter()
  const supabase = createClient()
  const [isOpen, setIsOpen] = useState(false)
  const [userRole, setUserRole] = useState<SystemRole | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadUserRole()
  }, [])

  async function loadUserRole() {
    const role = await getUserSystemRole()
    setUserRole(role)
    setLoading(false)
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  // Define all possible roles
  const allRoles: RoleOption[] = [
    {
      role: 'super_admin',
      label: 'Admin Portal',
      icon: Shield,
      href: '/admin',
      color: 'text-teal-600',
      bgColor: 'bg-teal-100'
    },
    {
      role: 'coach',
      label: 'Coach Portal',
      icon: Briefcase,
      href: '/coach/clients',
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-100'
    },
    {
      role: 'client',
      label: 'My Business',
      icon: Building,
      href: '/dashboard',
      color: 'text-teal-600',
      bgColor: 'bg-teal-100'
    }
  ]

  // Get current role info
  const currentRoleInfo = allRoles.find(r => {
    if (currentRole === 'admin') return r.role === 'super_admin'
    if (currentRole === 'coach') return r.role === 'coach'
    return r.role === 'client'
  })

  // Determine available roles based on user's system role
  const getAvailableRoles = (): RoleOption[] => {
    if (!userRole) return []

    if (userRole === 'super_admin') {
      // Super admin can access all portals
      return allRoles
    } else if (userRole === 'coach') {
      // Coach can access coach and client portals
      return allRoles.filter(r => r.role === 'coach' || r.role === 'client')
    } else {
      // Regular client can only access client portal
      return allRoles.filter(r => r.role === 'client')
    }
  }

  const availableRoles = getAvailableRoles()

  // Filter out current role from the switcher options
  const switcherOptions = availableRoles.filter(r => {
    if (currentRole === 'admin') return r.role !== 'super_admin'
    if (currentRole === 'coach') return r.role !== 'coach'
    return r.role !== 'client'
  })

  if (loading || !currentRoleInfo) {
    return null
  }

  const CurrentIcon = currentRoleInfo.icon

  return (
    <div className="relative">
      {/* Current Role Display + Dropdown Trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors"
      >
        <div className={`w-8 h-8 ${currentRoleInfo.bgColor} rounded-lg flex items-center justify-center`}>
          <CurrentIcon className={`w-4 h-4 ${currentRoleInfo.color}`} />
        </div>
        <div className="text-left hidden sm:block">
          <div className="text-xs text-gray-500">{currentRoleInfo.label}</div>
          {userName && (
            <div className="text-sm font-medium text-gray-900">{userName}</div>
          )}
        </div>
        {switcherOptions.length > 0 && (
          <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />

          {/* Menu */}
          <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-20">
            {/* User Info Section */}
            <div className="px-4 py-3 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                  <User className="w-5 h-5 text-gray-600" />
                </div>
                <div className="flex-1 min-w-0">
                  {userName && (
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {userName}
                    </div>
                  )}
                  <div className="text-xs text-gray-500 capitalize">
                    {userRole === 'super_admin' ? 'Super Admin' : userRole}
                  </div>
                </div>
              </div>
            </div>

            {/* Role Switcher Options */}
            {switcherOptions.length > 0 && (
              <div className="py-2">
                <div className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Switch Portal
                </div>
                {switcherOptions.map((roleOption) => {
                  const RoleIcon = roleOption.icon
                  return (
                    <button
                      key={roleOption.role}
                      onClick={() => {
                        setIsOpen(false)
                        router.push(roleOption.href)
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-50 transition-colors"
                    >
                      <div className={`w-8 h-8 ${roleOption.bgColor} rounded-lg flex items-center justify-center`}>
                        <RoleIcon className={`w-4 h-4 ${roleOption.color}`} />
                      </div>
                      <div className="text-left flex-1">
                        <div className="text-sm font-medium text-gray-900">
                          {roleOption.label}
                        </div>
                        <div className="text-xs text-gray-500 capitalize">
                          {roleOption.role === 'super_admin' ? 'Administration' : roleOption.role}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            {/* Sign Out */}
            <div className="border-t border-gray-200 pt-2 mt-2">
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-3 px-4 py-2 text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span className="text-sm font-medium">Sign Out</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
