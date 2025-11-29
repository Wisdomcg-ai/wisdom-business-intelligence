'use client'

import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface HealthScoreGaugeProps {
  score: number
  previousScore?: number
}

export default function HealthScoreGauge({ score, previousScore }: HealthScoreGaugeProps) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600'
    if (score >= 60) return 'text-teal-600'
    if (score >= 40) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getScoreBgColor = (score: number) => {
    if (score >= 80) return 'bg-green-100'
    if (score >= 60) return 'bg-teal-100'
    if (score >= 40) return 'bg-yellow-100'
    return 'bg-red-100'
  }

  const getScoreLabel = (score: number) => {
    if (score >= 80) return 'Excellent'
    if (score >= 60) return 'Good'
    if (score >= 40) return 'Fair'
    return 'Needs Attention'
  }

  const getTrend = () => {
    if (!previousScore) return null
    const diff = score - previousScore
    if (diff > 5) return 'up'
    if (diff < -5) return 'down'
    return 'stable'
  }

  const trend = getTrend()

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-6">Business Health Score</h3>

      <div className="flex items-center justify-center mb-6">
        {/* Circular gauge */}
        <div className="relative w-48 h-48">
          {/* Background circle */}
          <svg className="w-full h-full transform -rotate-90">
            <circle
              cx="96"
              cy="96"
              r="88"
              stroke="#E5E7EB"
              strokeWidth="12"
              fill="none"
            />
            {/* Progress circle */}
            <circle
              cx="96"
              cy="96"
              r="88"
              stroke={score >= 80 ? '#10B981' : score >= 60 ? '#3B82F6' : score >= 40 ? '#F59E0B' : '#EF4444'}
              strokeWidth="12"
              fill="none"
              strokeDasharray={`${(score / 100) * 553} 553`}
              strokeLinecap="round"
              className="transition-all duration-1000 ease-out"
            />
          </svg>

          {/* Score text */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className={`text-5xl font-bold ${getScoreColor(score)}`}>
                {score}
              </div>
              <div className="text-sm text-gray-600 mt-1">out of 100</div>
            </div>
          </div>
        </div>
      </div>

      {/* Score label */}
      <div className="text-center mb-4">
        <span className={`inline-block px-4 py-2 rounded-full text-sm font-semibold ${getScoreBgColor(score)} ${getScoreColor(score)}`}>
          {getScoreLabel(score)}
        </span>
      </div>

      {/* Trend indicator */}
      {trend && (
        <div className="flex items-center justify-center gap-2 text-sm">
          {trend === 'up' && (
            <>
              <TrendingUp className="w-4 h-4 text-green-600" />
              <span className="text-green-600 font-medium">
                Up {score - (previousScore || 0)} points
              </span>
            </>
          )}
          {trend === 'down' && (
            <>
              <TrendingDown className="w-4 h-4 text-red-600" />
              <span className="text-red-600 font-medium">
                Down {(previousScore || 0) - score} points
              </span>
            </>
          )}
          {trend === 'stable' && (
            <>
              <Minus className="w-4 h-4 text-gray-600" />
              <span className="text-gray-600 font-medium">Stable</span>
            </>
          )}
        </div>
      )}

      {/* Score breakdown */}
      <div className="mt-6 pt-6 border-t border-gray-200">
        <h4 className="text-xs font-semibold text-gray-700 uppercase mb-3">Score Components</h4>
        <div className="space-y-2 text-sm text-gray-600">
          <div className="flex justify-between">
            <span>Session Frequency</span>
            <span className="font-medium">40%</span>
          </div>
          <div className="flex justify-between">
            <span>Action Completion</span>
            <span className="font-medium">40%</span>
          </div>
          <div className="flex justify-between">
            <span>Recent Activity</span>
            <span className="font-medium">20%</span>
          </div>
        </div>
      </div>
    </div>
  )
}
