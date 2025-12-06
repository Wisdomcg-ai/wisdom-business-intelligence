'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Building2, ArrowLeft } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface CoachNavbarProps {
  businessId?: string
}

export default function CoachNavbar({ businessId }: CoachNavbarProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [businessName, setBusinessName] = useState<string>('')
  const [loading, setLoading] = useState(true)

  // Get business_id from props or URL
  const activeBusinessId = businessId || searchParams?.get('business_id')

  useEffect(() => {
    if (activeBusinessId) {
      loadBusinessName()
    } else {
      setLoading(false)
    }
  }, [activeBusinessId])

  const loadBusinessName = async () => {
    if (!activeBusinessId) return

    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('businesses')
        .select('name, business_name')
        .eq('id', activeBusinessId)
        .single()

      if (!error && data) {
        setBusinessName(data.name || data.business_name)
      }
    } catch (err) {
      console.error('Error loading business name:', err)
    } finally {
      setLoading(false)
    }
  }

  // Don't show navbar on coach dashboard or login
  if (pathname?.startsWith('/coach/login') || pathname === '/coach/clients') {
    return null
  }

  return (
    <div className="bg-brand-orange text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-12">
          <div className="flex items-center gap-3">
            <Link
              href={activeBusinessId ? `/coach/clients/${activeBusinessId}` : '/coach/clients'}
              className="flex items-center gap-2 text-white/90 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm font-medium">Back to Client</span>
            </Link>

            {activeBusinessId && !loading && businessName && (
              <>
                <span className="text-white/40">|</span>
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-white/70" />
                  <span className="text-sm font-medium text-white/90">{businessName}</span>
                </div>
              </>
            )}
          </div>

          <div className="text-xs text-white/70">
            Coach View
          </div>
        </div>
      </div>
    </div>
  )
}
