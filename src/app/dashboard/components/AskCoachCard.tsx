'use client'

import { MessageCircle, Lightbulb } from 'lucide-react'

interface AskCoachCardProps {
  onOpenModal: () => void
  lastQuestionDate?: string
}

const coachingTips = [
  "Focus on leading indicators, not just lagging results.",
  "The constraint isn't usually what you think it is.",
  "Delegation doesn't mean abdication - stay engaged.",
  "What got you here won't get you there.",
  "Systems create freedom. Build them relentlessly.",
  "Your calendar reflects your real priorities."
]

function getRandomTip(): string {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 0)
  const diff = now.getTime() - start.getTime()
  const oneDay = 1000 * 60 * 60 * 24
  const dayOfYear = Math.floor(diff / oneDay)
  return coachingTips[dayOfYear % coachingTips.length]
}

export default function AskCoachCard({ onOpenModal, lastQuestionDate }: AskCoachCardProps) {
  const tip = getRandomTip()

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-brand-orange-100 rounded-lg flex items-center justify-center">
            <MessageCircle className="h-4 w-4 text-brand-orange" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Your Coach</h3>
            <p className="text-xs text-gray-500">
              {lastQuestionDate ? `Last chat: ${lastQuestionDate}` : 'Here to help you grow'}
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-5">
        {/* Coaching Insight */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
          <div className="flex items-start gap-3">
            <Lightbulb className="h-5 w-5 text-brand-orange flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                Today's Insight
              </p>
              <p className="text-sm text-gray-700 italic">
                "{tip}"
              </p>
            </div>
          </div>
        </div>

        {/* Ask Button */}
        <button
          type="button"
          onClick={onOpenModal}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-brand-orange text-white rounded-lg hover:bg-brand-orange-600 transition-colors font-medium shadow-sm"
        >
          <MessageCircle className="h-5 w-5" />
          Ask Your Coach
        </button>

        <p className="text-xs text-gray-400 text-center mt-3">
          Strategy, challenges, growth plans - ask anything
        </p>
      </div>
    </div>
  )
}
