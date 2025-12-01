'use client'

import { useState, ReactNode } from 'react'
import { HelpCircle } from 'lucide-react'

interface TooltipProps {
  content: string
  children?: ReactNode
  showIcon?: boolean
  className?: string
}

export default function Tooltip({ content, children, showIcon = false, className = '' }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false)

  return (
    <span
      className={`relative inline-flex items-center gap-1 cursor-help ${className}`}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      {showIcon && (
        <HelpCircle className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600" />
      )}
      {isVisible && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 text-xs text-white bg-gray-900 rounded-lg shadow-lg max-w-xs whitespace-normal animate-in fade-in duration-150">
          {content}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
        </div>
      )}
    </span>
  )
}

// Jargon definitions used across the platform
export const JARGON_DEFINITIONS = {
  rocks: "Quarterly Rocks are your 3-5 most important priorities for the quarter. They're the big things that must get done to move your business forward. Named after the 'Big Rocks' metaphor - if you don't put the big rocks in first, you'll never fit them.",

  openLoops: "Open Loops are unresolved tasks, commitments, or ideas that occupy mental space. They need to be captured, clarified, and either completed, delegated, or dropped. Borrowed from David Allen's 'Getting Things Done' methodology.",

  bhag: "BHAG (Big Hairy Audacious Goal) is a 10-25 year strategic vision that seems almost impossible today. Coined by Jim Collins in 'Built to Last', it's meant to be compelling and inspiring, pushing the organization beyond incremental thinking.",

  swot: "SWOT Analysis is a strategic planning framework examining Strengths, Weaknesses, Opportunities, and Threats. Internal factors (strengths/weaknesses) are things you control; external factors (opportunities/threats) are market conditions.",

  kpi: "KPI (Key Performance Indicator) is a measurable value demonstrating how effectively you're achieving key business objectives. Good KPIs are specific, measurable, and directly tied to your strategic goals.",

  quarterlyReview: "A Quarterly Review is a structured session to assess the past 90 days, celebrate wins, analyze what didn't work, and plan the next quarter. It maintains strategic alignment and accountability.",

  weeklyReview: "A Weekly Review is a regular check-in to review your week's accomplishments, plan the upcoming week, and ensure your daily actions align with your quarterly rocks and annual goals.",

  onePagePlan: "The One Page Strategic Plan consolidates your vision, mission, values, goals, and initiatives into a single page. It serves as a quick reference for strategic decision-making and team alignment.",

  strategicInitiatives: "Strategic Initiatives are the major projects or programs you'll execute over 12 months to achieve your annual goals. They're bigger than tasks but smaller than your 3-year vision.",

  ninetyDayGoals: "90-Day Goals break your annual targets into quarterly sprints. This time horizon is long enough for meaningful progress but short enough to maintain urgency and adapt to changes.",

  annualGoals: "Annual Goals define what success looks like 12 months from now. They should be ambitious yet achievable, typically covering financial targets, operational metrics, and personal development.",

  threeYearVision: "Your 3-Year Vision describes where you want your business to be in three years. It's detailed enough to guide strategy but far enough away to think beyond current constraints.",

  coreValues: "Core Values are the fundamental beliefs that guide how you run your business. They help with hiring, decision-making, and building culture. Typically 3-5 values that everyone in the organization embodies.",

  stopDoing: "The Stop Doing List identifies activities, habits, or commitments you should eliminate to free up time and focus for higher-impact work. What got you here won't get you there."
} as const

// Helper component for inline jargon tooltips
interface JargonTooltipProps {
  term: keyof typeof JARGON_DEFINITIONS
  children?: ReactNode
  showIcon?: boolean
  className?: string
}

export function JargonTooltip({ term, children, showIcon = true, className = '' }: JargonTooltipProps) {
  return (
    <Tooltip content={JARGON_DEFINITIONS[term]} showIcon={showIcon} className={className}>
      {children}
    </Tooltip>
  )
}
