'use client'

import Link from 'next/link'
import { CheckCircle2, Circle, Calendar, ArrowRight } from 'lucide-react'

interface WeeklyPrioritiesCardProps {
  weeklyGoals: string[]
}

export default function WeeklyPrioritiesCard({ weeklyGoals }: WeeklyPrioritiesCardProps) {
  const completedCount = 0
  const totalCount = weeklyGoals.length

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-teal-100 rounded-lg flex items-center justify-center">
              <Calendar className="h-4 w-4 text-teal-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">This Week's Focus</h3>
              <p className="text-xs text-gray-500">Your top priorities</p>
            </div>
          </div>
          {totalCount > 0 && (
            <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded">
              {completedCount}/{totalCount} done
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-5">
        {weeklyGoals.length > 0 ? (
          <div className="space-y-1">
            {weeklyGoals.map((goal, index) => (
              <div
                key={index}
                className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors group cursor-pointer"
              >
                <div className="mt-0.5 flex-shrink-0">
                  <Circle className="h-5 w-5 text-gray-300 group-hover:hidden" />
                  <CheckCircle2 className="h-5 w-5 text-teal-500 hidden group-hover:block" />
                </div>
                <span className="text-sm text-gray-700 group-hover:text-gray-900 transition-colors flex-1">
                  {goal}
                </span>
              </div>
            ))}

            <Link
              href="/reviews/weekly"
              className="flex items-center justify-center gap-1 text-sm font-medium text-teal-600 hover:text-teal-700 pt-3 mt-2 border-t border-gray-100"
            >
              Weekly review <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <div className="text-center py-6">
            <div className="w-12 h-12 mx-auto mb-3 bg-gray-100 rounded-lg flex items-center justify-center">
              <Calendar className="h-6 w-6 text-gray-400" />
            </div>
            <p className="text-gray-600 font-medium mb-1">No weekly priorities set</p>
            <p className="text-sm text-gray-400 mb-4">Complete a weekly review to set your focus</p>
            <Link
              href="/reviews/weekly"
              className="inline-flex items-center px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors"
            >
              Start Weekly Review
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
