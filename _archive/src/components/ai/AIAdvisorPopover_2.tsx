'use client'

import React, { useState } from 'react'
import {
  Sparkles,
  X,
  CheckCircle,
  AlertTriangle,
  Info,
  ThumbsUp,
  ThumbsDown,
  Loader2,
  MessageCircle,
  Lightbulb
} from 'lucide-react'

interface AISuggestion {
  suggestion: string
  reasoning: string
  confidence: 'high' | 'medium' | 'low'
  source: 'coach_benchmark' | 'market_data' | 'ai_estimate'
  minValue?: number
  maxValue?: number
  typicalValue?: number
  caveats?: string[]
  interactionId?: string
}

interface AIAdvisorPopoverProps {
  // What are we helping with?
  helpType: 'salary' | 'project_cost' | 'general'
  label: string  // e.g., "Salary for Project Manager"

  // Optional pre-fetched suggestion (or fetch on open)
  suggestion?: AISuggestion | null
  isLoading?: boolean
  onFetchSuggestion?: () => Promise<void>

  // Callbacks
  onUseSuggestion?: (value: number) => void
  onAskCoach?: () => void
  onFeedback?: (interactionId: string, action: 'used' | 'adjusted' | 'ignored' | 'asked_coach', value?: number) => void

  // Styling
  className?: string
  buttonVariant?: 'icon' | 'text' | 'full'
}

export default function AIAdvisorPopover({
  helpType,
  label,
  suggestion,
  isLoading = false,
  onFetchSuggestion,
  onUseSuggestion,
  onAskCoach,
  onFeedback,
  className = '',
  buttonVariant = 'icon'
}: AIAdvisorPopoverProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [hasUsed, setHasUsed] = useState(false)

  const handleOpen = async () => {
    setIsOpen(true)
    if (!suggestion && onFetchSuggestion) {
      await onFetchSuggestion()
    }
  }

  const handleUseSuggestion = (value: number) => {
    if (onUseSuggestion) {
      onUseSuggestion(value)
    }
    if (onFeedback && suggestion?.interactionId) {
      onFeedback(suggestion.interactionId, 'used', value)
    }
    setHasUsed(true)
    setIsOpen(false)
  }

  const handleAskCoach = () => {
    if (onFeedback && suggestion?.interactionId) {
      onFeedback(suggestion.interactionId, 'asked_coach')
    }
    if (onAskCoach) {
      onAskCoach()
    }
    setIsOpen(false)
  }

  const handleIgnore = () => {
    if (onFeedback && suggestion?.interactionId) {
      onFeedback(suggestion.interactionId, 'ignored')
    }
    setIsOpen(false)
  }

  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case 'high': return 'text-green-600 bg-green-50 border-green-200'
      case 'medium': return 'text-blue-600 bg-blue-50 border-blue-200'
      case 'low': return 'text-amber-600 bg-amber-50 border-amber-200'
      default: return 'text-gray-600 bg-gray-50 border-gray-200'
    }
  }

  const getConfidenceIcon = (confidence: string) => {
    switch (confidence) {
      case 'high': return <CheckCircle className="w-4 h-4" />
      case 'medium': return <Info className="w-4 h-4" />
      case 'low': return <AlertTriangle className="w-4 h-4" />
      default: return <Info className="w-4 h-4" />
    }
  }

  const getSourceLabel = (source: string) => {
    switch (source) {
      case 'coach_benchmark': return 'Your coach\'s benchmark'
      case 'market_data': return 'Australian market data'
      case 'ai_estimate': return 'AI estimate'
      default: return 'Estimate'
    }
  }

  return (
    <div className={`relative ${className}`}>
      {/* Trigger Button */}
      {buttonVariant === 'icon' && (
        <button
          type="button"
          onClick={handleOpen}
          className="p-1.5 text-brand-orange hover:bg-brand-orange-50 rounded-lg transition-colors"
          title="Get AI suggestion"
        >
          <Sparkles className="w-4 h-4" />
        </button>
      )}

      {buttonVariant === 'text' && (
        <button
          type="button"
          onClick={handleOpen}
          className="flex items-center gap-1.5 text-xs text-brand-orange hover:text-brand-orange-700 transition-colors"
        >
          <Sparkles className="w-3 h-3" />
          Help me estimate
        </button>
      )}

      {buttonVariant === 'full' && (
        <button
          type="button"
          onClick={handleOpen}
          className="flex items-center gap-2 px-3 py-2 text-sm text-brand-orange bg-brand-orange-50 hover:bg-brand-orange-100 rounded-lg transition-colors"
        >
          <Sparkles className="w-4 h-4" />
          Get suggestion
        </button>
      )}

      {/* Popover */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={handleIgnore}
          />

          {/* Popover Content */}
          <div className="absolute z-50 top-full left-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 bg-gradient-to-r from-brand-orange to-brand-orange-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                <span className="font-medium text-sm">AI Suggestion</span>
              </div>
              <button
                onClick={handleIgnore}
                className="p-1 hover:bg-white/20 rounded transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-6 h-6 text-brand-orange animate-spin" />
                  <span className="ml-2 text-sm text-gray-600">Thinking...</span>
                </div>
              ) : suggestion ? (
                <div className="space-y-4">
                  {/* Label */}
                  <div className="text-xs text-gray-500 uppercase tracking-wide">
                    {label}
                  </div>

                  {/* Main Suggestion */}
                  <div className="text-center py-3">
                    <div className="text-2xl font-bold text-gray-900 mb-1">
                      {suggestion.suggestion}
                    </div>
                    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getConfidenceColor(suggestion.confidence)}`}>
                      {getConfidenceIcon(suggestion.confidence)}
                      {suggestion.confidence === 'high' ? 'High confidence' :
                       suggestion.confidence === 'medium' ? 'Moderate confidence' :
                       'Low confidence'}
                    </div>
                  </div>

                  {/* Source */}
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Lightbulb className="w-3 h-3" />
                    {getSourceLabel(suggestion.source)}
                  </div>

                  {/* Reasoning */}
                  <p className="text-sm text-gray-600">
                    {suggestion.reasoning}
                  </p>

                  {/* Caveats */}
                  {suggestion.caveats && suggestion.caveats.length > 0 && (
                    <div className="text-xs text-gray-500 space-y-1">
                      {suggestion.caveats.map((caveat, i) => (
                        <div key={i} className="flex items-start gap-1">
                          <span className="text-gray-400">•</span>
                          <span>{caveat}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    {suggestion.typicalValue && onUseSuggestion && (
                      <button
                        onClick={() => handleUseSuggestion(suggestion.typicalValue!)}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-brand-orange text-white text-sm font-medium rounded-lg hover:bg-brand-orange-600 transition-colors"
                      >
                        <ThumbsUp className="w-4 h-4" />
                        Use ${suggestion.typicalValue.toLocaleString()}
                      </button>
                    )}
                    <button
                      onClick={handleAskCoach}
                      className="flex items-center justify-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      <MessageCircle className="w-4 h-4" />
                      Ask Coach
                    </button>
                  </div>

                  {/* Min/Max quick picks */}
                  {suggestion.minValue && suggestion.maxValue && onUseSuggestion && (
                    <div className="flex items-center justify-center gap-2 text-xs">
                      <span className="text-gray-400">Or use:</span>
                      <button
                        onClick={() => handleUseSuggestion(suggestion.minValue!)}
                        className="text-brand-orange hover:underline"
                      >
                        ${suggestion.minValue.toLocaleString()}
                      </button>
                      <span className="text-gray-400">|</span>
                      <button
                        onClick={() => handleUseSuggestion(suggestion.maxValue!)}
                        className="text-brand-orange hover:underline"
                      >
                        ${suggestion.maxValue.toLocaleString()}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-6 text-gray-500">
                  <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                  <p className="text-sm">Couldn't get a suggestion</p>
                  <button
                    onClick={handleAskCoach}
                    className="mt-2 text-sm text-brand-orange hover:underline"
                  >
                    Ask your coach instead
                  </button>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-2 bg-gray-50 border-t border-gray-100">
              <p className="text-xs text-gray-400 text-center">
                AI suggestions are guides only. Confirm with your coach.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
