'use client'

import Link from 'next/link'
import { Rocket, AlertTriangle, CheckCircle2, ArrowRight } from 'lucide-react'
import type { Rock } from '../types'
import { getQuarterDisplayName } from '../utils/formatters'
import { JargonTooltip } from '@/components/ui/Tooltip'

interface RocksCardProps {
  rocks: Rock[]
  currentQuarter: string
  rocksNeedingAttention?: Rock[]
  rocksOnTrack?: Rock[]
  quarterDaysRemaining?: number
}

function getStatusStyle(status: string, progress: number) {
  if (status === 'completed' || progress === 100) {
    return { dot: 'bg-teal-500', text: 'text-teal-600', label: 'Done' }
  }
  if (status === 'at_risk') {
    return { dot: 'bg-amber-500', text: 'text-amber-600', label: 'At Risk' }
  }
  if (status === 'on_track' || progress >= 30) {
    return { dot: 'bg-teal-500', text: 'text-teal-600', label: 'On Track' }
  }
  return { dot: 'bg-gray-300', text: 'text-gray-500', label: 'Not Started' }
}

export default function RocksCard({
  rocks,
  currentQuarter,
  rocksNeedingAttention = [],
  rocksOnTrack = [],
  quarterDaysRemaining
}: RocksCardProps) {
  const hasAttention = rocksNeedingAttention.length > 0
  const attentionRock = rocksNeedingAttention[0]

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center">
              <Rocket className="h-4 w-4 text-gray-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">
                <JargonTooltip term="rocks">Quarterly Rocks</JargonTooltip>
              </h3>
              <p className="text-xs text-gray-500">{getQuarterDisplayName(currentQuarter)}</p>
            </div>
          </div>
          {quarterDaysRemaining !== undefined && (
            <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded">
              {quarterDaysRemaining}d left
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-5">
        {rocks.length > 0 ? (
          <div className="space-y-4">
            {/* Attention Alert */}
            {hasAttention && attentionRock && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-amber-800">Needs Attention</p>
                    <p className="text-sm text-amber-700 truncate">{attentionRock.title}</p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-amber-600">{attentionRock.progressPercentage}% complete</span>
                      <Link
                        href="/one-page-plan"
                        className="text-xs font-medium text-amber-700 hover:text-amber-800 flex items-center gap-1"
                      >
                        Update <ArrowRight className="h-3 w-3" />
                      </Link>
                    </div>
                    <div className="w-full bg-amber-200 rounded-full h-1.5 mt-2">
                      <div
                        className="h-1.5 rounded-full bg-amber-500 transition-all"
                        style={{ width: `${Math.max(attentionRock.progressPercentage, 2)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* On Track Summary */}
            {rocksOnTrack.length > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-teal-500" />
                <span className="text-gray-600">
                  {rocksOnTrack.length} rock{rocksOnTrack.length > 1 ? 's' : ''} on track
                </span>
              </div>
            )}

            {/* Rock List (condensed) */}
            <div className="space-y-2">
              {rocks.slice(0, hasAttention ? 3 : 4).map((rock) => {
                if (hasAttention && rock.id === attentionRock?.id) return null

                const status = getStatusStyle(rock.status, rock.progressPercentage)
                return (
                  <div key={rock.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className={`w-2 h-2 rounded-full ${status.dot} flex-shrink-0`} />
                      <span className="text-sm text-gray-700 truncate">{rock.title}</span>
                    </div>
                    <span className="text-sm font-medium text-gray-600 ml-2">
                      {rock.progressPercentage}%
                    </span>
                  </div>
                )
              })}
            </div>

            {/* View All Link */}
            <Link
              href="/one-page-plan"
              className="flex items-center justify-center gap-1 text-sm font-medium text-teal-600 hover:text-teal-700 pt-2"
            >
              View all rocks <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <div className="text-center py-6">
            <div className="w-12 h-12 mx-auto mb-3 bg-gray-100 rounded-lg flex items-center justify-center">
              <Rocket className="h-6 w-6 text-gray-400" />
            </div>
            <p className="text-gray-600 font-medium mb-1">No rocks for {getQuarterDisplayName(currentQuarter)}</p>
            <p className="text-sm text-gray-400 mb-4">Define your key priorities</p>
            <Link
              href="/one-page-plan"
              className="inline-flex items-center px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors"
            >
              Set Your Rocks
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
