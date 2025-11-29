'use client'

import { Sparkles, ArrowRight } from 'lucide-react'
import Link from 'next/link'

interface WelcomeBannerProps {
  userName: string
  businessName: string
  greeting?: string
}

export function WelcomeBanner({ userName, businessName, greeting }: WelcomeBannerProps) {
  const getTimeGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 17) return 'Good afternoon'
    return 'Good evening'
  }

  const displayGreeting = greeting || getTimeGreeting()

  return (
    <div className="bg-gradient-to-br from-teal-500 via-teal-600 to-cyan-600 rounded-2xl p-8 text-white relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />

      <div className="relative z-10">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-5 h-5 text-teal-200" />
              <span className="text-teal-100 text-sm font-medium">{businessName}</span>
            </div>
            <h1 className="text-3xl font-bold mb-2">
              {displayGreeting}, {userName.split(' ')[0]}!
            </h1>
            <p className="text-teal-100 max-w-md">
              Welcome to your business intelligence dashboard. Track your progress, manage actions, and stay connected with your coach.
            </p>
          </div>

          <div className="hidden lg:block">
            <Link
              href="/goals"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-teal-700 rounded-lg font-medium hover:bg-teal-50 transition-colors"
            >
              View Goals
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default WelcomeBanner
