'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { 
  Home, 
  Target, 
  BarChart3, 
  Users, 
  Settings, 
  LogOut,
  Menu,
  X,
  FileText,
  TrendingUp,
  Compass
} from 'lucide-react'

export default function Navigation() {
  const router = useRouter()
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  const navigationItems = [
    {
      name: 'Dashboard',
      href: '/dashboard',
      icon: Home
    },
    {
      name: 'Business Profile',
      href: '/business-profile',
      icon: FileText
    },
    {
      name: 'Assessment',
      href: '/assessment',
      icon: BarChart3
    },
    {
      name: 'Revenue Roadmap',
      href: '/roadmap',
      icon: TrendingUp
    },
    {
      name: 'SWOT Analysis',
      href: '/swot',
      icon: Compass
    },
    {
      name: 'Goals & Targets',
      href: '/goals/vision',
      icon: Target
    }
  ]

  const isActive = (href: string) => {
    if (href === '/goals/vision' && pathname?.startsWith('/goals')) {
      return true
    }
    return pathname === href
  }

  return (
    <nav className="bg-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            {/* Logo/Brand */}
            <Link href="/dashboard" className="flex items-center">
              <span className="text-xl font-bold text-brand-navy">
                Business Coaching Platform
              </span>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:ml-10 md:flex md:space-x-4">
              {navigationItems.map((item) => {
                const Icon = item.icon
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActive(item.href)
                        ? 'bg-brand-orange-100 text-brand-orange-700'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                  >
                    <Icon className="h-4 w-4 mr-2" />
                    {item.name}
                  </Link>
                )
              })}
            </div>
          </div>

          {/* Right side items */}
          <div className="flex items-center">
            <button
              onClick={handleLogout}
              className="hidden md:flex items-center px-3 py-2 rounded-md text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </button>

            {/* Mobile menu button */}
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="md:hidden p-2 rounded-md text-gray-600 hover:bg-gray-100"
            >
              {isOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation */}
      {isOpen && (
        <div className="md:hidden bg-white border-t">
          <div className="px-2 pt-2 pb-3 space-y-1">
            {navigationItems.map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className={`flex items-center px-3 py-2 rounded-md text-base font-medium transition-colors ${
                    isActive(item.href)
                      ? 'bg-brand-orange-100 text-brand-orange-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <Icon className="h-5 w-5 mr-3" />
                  {item.name}
                </Link>
              )
            })}
            <button
              onClick={handleLogout}
              className="w-full flex items-center px-3 py-2 rounded-md text-base font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors"
            >
              <LogOut className="h-5 w-5 mr-3" />
              Logout
            </button>
          </div>
        </div>
      )}
    </nav>
  )
}
