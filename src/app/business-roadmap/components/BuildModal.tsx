import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { X, CheckCircle, HelpCircle, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
import { RoadmapBuild } from '../data/types'
import { getCompletionChecks, calculateCompletionPercentage } from '../data/completion-checks'

interface BuildModalProps {
  build: RoadmapBuild | null
  isOpen: boolean
  onClose: () => void
  stageName: string
  engineName: string
  isComplete: boolean
  onToggleComplete: () => void
  // New: completion check answers
  checkAnswers?: Record<string, boolean>
  onCheckAnswersChange?: (answers: Record<string, boolean>) => void
  // Link to platform feature for this build
  linkedFeature?: { href: string; label: string }
}

export function BuildModal({
  build,
  isOpen,
  onClose,
  stageName,
  engineName,
  isComplete,
  onToggleComplete,
  checkAnswers = {},
  onCheckAnswersChange,
  linkedFeature
}: BuildModalProps) {
  const [showToDo, setShowToDo] = useState(false)
  const [localAnswers, setLocalAnswers] = useState<Record<string, boolean>>(checkAnswers)

  // Get completion checks for this build
  const checks = build ? getCompletionChecks(build.name) : []
  const completionPercentage = checks ? calculateCompletionPercentage(localAnswers, checks) : 0

  // Sync local answers with props
  useEffect(() => {
    setLocalAnswers(checkAnswers)
  }, [checkAnswers, build?.name])

  // Handle answer change
  const handleAnswerChange = (checkId: string, value: boolean) => {
    const newAnswers = { ...localAnswers, [checkId]: value }
    setLocalAnswers(newAnswers)
    onCheckAnswersChange?.(newAnswers)
  }

  if (!isOpen || !build) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-2 sm:p-4">
        <div className="relative bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-200 px-4 sm:px-6 py-3 sm:py-4 flex items-start justify-between z-10">
            <div className="flex-1 pr-6 sm:pr-8">
              <h2 className="text-lg sm:text-2xl font-bold text-gray-900">{build.name}</h2>
              <div className="mt-1 flex items-center gap-2 text-xs sm:text-sm text-gray-600">
                <span className="font-medium">{stageName}</span>
                <span>•</span>
                <span>{engineName}</span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors p-1"
            >
              <X className="h-5 w-5 sm:h-6 sm:w-6" />
            </button>
          </div>

          {/* Content */}
          <div className="px-4 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">
            {/* Outcome */}
            <div className="bg-teal-50 border-l-4 border-teal-500 rounded-r-lg p-3 sm:p-4">
              <div className="text-xs sm:text-sm font-semibold text-teal-900 mb-1 sm:mb-2">Outcome</div>
              <div className="text-sm sm:text-base text-teal-800">{build.outcome}</div>
            </div>

            {/* Completion Check Section - PROMINENT */}
            {checks && checks.length > 0 && (
              <div className="bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-200 rounded-xl p-3 sm:p-5">
                {/* Header with instructions */}
                <div className="flex items-start gap-2 sm:gap-3 mb-3 sm:mb-4">
                  <div className="p-1.5 sm:p-2 bg-amber-100 rounded-lg flex-shrink-0">
                    <HelpCircle className="h-4 w-4 sm:h-5 sm:w-5 text-amber-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-base sm:text-lg font-bold text-gray-900">How Complete Is This Build?</h3>
                    <p className="text-xs sm:text-sm text-gray-600 mt-1">
                      Answer honestly to track your real progress.
                    </p>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mb-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">Completion</span>
                    <span className={`text-sm font-bold ${
                      completionPercentage === 100 ? 'text-green-600' :
                      completionPercentage >= 66 ? 'text-amber-600' :
                      completionPercentage >= 33 ? 'text-orange-600' :
                      'text-red-600'
                    }`}>
                      {completionPercentage}%
                    </span>
                  </div>
                  <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        completionPercentage === 100 ? 'bg-green-500' :
                        completionPercentage >= 66 ? 'bg-amber-500' :
                        completionPercentage >= 33 ? 'bg-orange-500' :
                        'bg-red-500'
                      }`}
                      style={{ width: `${completionPercentage}%` }}
                    />
                  </div>
                </div>

                {/* Questions */}
                <div className="space-y-3">
                  {checks.map((check, index) => (
                    <div
                      key={check.id}
                      className={`p-4 rounded-lg border-2 transition-all ${
                        localAnswers[check.id] === true
                          ? 'bg-green-50 border-green-300'
                          : localAnswers[check.id] === false
                          ? 'bg-white border-gray-200'
                          : 'bg-white border-amber-300 border-dashed'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center mt-0.5">
                          {index + 1}
                        </span>
                        <div className="flex-1">
                          <p className="text-gray-800 font-medium mb-3">{check.question}</p>
                          <div className="flex gap-3">
                            <button
                              onClick={() => handleAnswerChange(check.id, true)}
                              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                                localAnswers[check.id] === true
                                  ? 'bg-green-600 text-white shadow-md'
                                  : 'bg-gray-100 text-gray-700 hover:bg-green-100 hover:text-green-700'
                              }`}
                            >
                              Yes
                            </button>
                            <button
                              onClick={() => handleAnswerChange(check.id, false)}
                              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                                localAnswers[check.id] === false
                                  ? 'bg-gray-600 text-white shadow-md'
                                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                              }`}
                            >
                              Not Yet
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Helpful tip */}
                {completionPercentage < 100 && (
                  <div className="mt-4 p-3 bg-amber-100 rounded-lg">
                    <p className="text-sm text-amber-800">
                      <strong>Tip:</strong> Focus on the items you answered "Not Yet" to.
                      The To-Do list below has specific steps to help you complete this build.
                    </p>
                  </div>
                )}

                {completionPercentage === 100 && (
                  <div className="mt-4 p-3 bg-green-100 rounded-lg">
                    <p className="text-sm text-green-800">
                      <strong>Great work!</strong> You've completed all the key elements of this build.
                      Mark it as complete below when you're ready to move on.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* To-Do List - Collapsible */}
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <button
                onClick={() => setShowToDo(!showToDo)}
                className="w-full px-5 py-4 bg-gray-50 hover:bg-gray-100 flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold text-gray-900">How To Complete This Build</span>
                  <span className="px-2 py-0.5 bg-gray-200 text-gray-600 text-xs font-medium rounded-full">
                    {build.toDo.length} steps
                  </span>
                </div>
                {showToDo ? (
                  <ChevronUp className="h-5 w-5 text-gray-500" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-gray-500" />
                )}
              </button>

              {showToDo && (
                <div className="px-5 py-4 border-t border-gray-200">
                  <ul className="space-y-3">
                    {build.toDo.map((item, index) => (
                      <li key={index} className="flex items-start gap-3">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-teal-100 text-teal-600 text-xs font-semibold flex-shrink-0 mt-0.5">
                          {index + 1}
                        </span>
                        <span className="text-gray-700 flex-1">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-4 sm:px-6 py-3 sm:py-4">
            {/* Linked Feature - Show if available */}
            {linkedFeature && (
              <div className="mb-3 sm:mb-4 p-2.5 sm:p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
                  <div>
                    <p className="text-xs sm:text-sm text-blue-800 font-medium">Work on this build in the platform</p>
                    <p className="text-xs text-blue-600 mt-0.5 hidden sm:block">Use the {linkedFeature.label} tool to complete this build</p>
                  </div>
                  <Link
                    href={linkedFeature.href}
                    className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs sm:text-sm font-medium transition-colors"
                  >
                    Go to {linkedFeature.label}
                    <ExternalLink className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  </Link>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 sm:gap-4">
              <button
                onClick={onToggleComplete}
                className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-6 py-2 sm:py-3 rounded-lg font-medium transition-all text-sm sm:text-base ${
                  isComplete
                    ? 'bg-amber-500 hover:bg-amber-600 text-white'
                    : 'bg-teal-600 hover:bg-teal-700 text-white'
                }`}
              >
                <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5" />
                <span className="hidden sm:inline">{isComplete ? 'Completed' : 'Mark as Complete'}</span>
                <span className="sm:hidden">{isComplete ? 'Done' : 'Complete'}</span>
              </button>
              <button
                onClick={onClose}
                className="px-4 sm:px-6 py-2 sm:py-3 text-gray-700 hover:bg-gray-200 rounded-lg font-medium transition-colors text-sm sm:text-base"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
