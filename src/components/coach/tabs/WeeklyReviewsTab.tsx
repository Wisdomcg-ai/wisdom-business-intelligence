'use client'

import { useState, useEffect } from 'react'
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Star,
  Zap,
  Users,
  CheckCircle,
  Clock,
  Loader2,
  Trophy,
  AlertTriangle,
  Lightbulb,
  Target,
  ChevronDown,
  ChevronUp,
  MessageCircle
} from 'lucide-react'
import WeeklyReviewService, {
  WeeklyReview,
  TeamMemberReviewStatus
} from '@/app/reviews/services/weekly-review-service'

interface WeeklyReviewsTabProps {
  businessId: string
  businessName: string
}

export function WeeklyReviewsTab({ businessId, businessName }: WeeklyReviewsTabProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [currentWeekStart, setCurrentWeekStart] = useState('')
  const [teamStatus, setTeamStatus] = useState<TeamMemberReviewStatus[]>([])
  const [teamReviews, setTeamReviews] = useState<WeeklyReview[]>([])
  const [expandedReviews, setExpandedReviews] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadWeeklyReviews()
  }, [businessId])

  const loadWeeklyReviews = async () => {
    setIsLoading(true)
    const weekStart = WeeklyReviewService.getWeekStart()
    setCurrentWeekStart(weekStart)

    const status = await WeeklyReviewService.getTeamReviewStatus(businessId, weekStart)
    setTeamStatus(status)

    const reviews = await WeeklyReviewService.getTeamReviewsForWeek(businessId, weekStart)
    setTeamReviews(reviews)

    setIsLoading(false)
  }

  const navigateWeek = async (direction: 'prev' | 'next') => {
    setIsLoading(true)
    const currentDate = new Date(currentWeekStart)
    const newDate = new Date(currentDate)
    newDate.setDate(currentDate.getDate() + (direction === 'next' ? 7 : -7))

    const newWeekStart = WeeklyReviewService.getWeekStart(newDate)
    setCurrentWeekStart(newWeekStart)

    const status = await WeeklyReviewService.getTeamReviewStatus(businessId, newWeekStart)
    setTeamStatus(status)

    const reviews = await WeeklyReviewService.getTeamReviewsForWeek(businessId, newWeekStart)
    setTeamReviews(reviews)

    setIsLoading(false)
  }

  const toggleReviewExpanded = (reviewId: string) => {
    setExpandedReviews(prev => {
      const next = new Set(prev)
      if (next.has(reviewId)) {
        next.delete(reviewId)
      } else {
        next.add(reviewId)
      }
      return next
    })
  }

  const formatDateRange = (startDate: string) => {
    const start = new Date(startDate)
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
    return `${start.toLocaleDateString('en-US', options)} - ${end.toLocaleDateString('en-US', options)}`
  }

  const isCurrentWeek = currentWeekStart === WeeklyReviewService.getWeekStart()
  const completedCount = teamStatus.filter(m => m.isComplete).length
  const totalCount = teamStatus.length

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Weekly Reviews</h2>
          <p className="text-sm text-gray-500">Team review submissions for {businessName}</p>
        </div>
      </div>

      {/* Week Navigation */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigateWeek('prev')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>

          <div className="text-center">
            <div className="flex items-center justify-center gap-2">
              <Calendar className="w-5 h-5 text-indigo-600" />
              <span className="text-lg font-semibold text-gray-900">
                {formatDateRange(currentWeekStart)}
              </span>
              {isCurrentWeek && (
                <span className="px-2 py-1 bg-indigo-600 text-white text-xs rounded-full font-medium">
                  Current Week
                </span>
              )}
            </div>
          </div>

          <button
            onClick={() => navigateWeek('next')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            disabled={isCurrentWeek}
          >
            <ChevronRight className={`w-5 h-5 ${isCurrentWeek ? 'text-gray-300' : 'text-gray-600'}`} />
          </button>
        </div>
      </div>

      {/* Completion Summary */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="p-3 bg-indigo-100 rounded-xl">
            <Users className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Team Completion</h3>
            <p className="text-sm text-gray-500">
              {completedCount} of {totalCount} team members have completed their weekly review
            </p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-gray-200 rounded-full h-3 mb-4">
          <div
            className="bg-indigo-600 h-3 rounded-full transition-all"
            style={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
          />
        </div>

        {/* Team Member Status */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {teamStatus.map(member => (
            <div
              key={member.userId}
              className={`flex items-center gap-2 p-3 rounded-lg border ${
                member.isComplete
                  ? 'bg-green-50 border-green-200'
                  : member.hasReview
                  ? 'bg-amber-50 border-amber-200'
                  : 'bg-gray-50 border-gray-200'
              }`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-semibold ${
                member.isComplete ? 'bg-green-500' : member.hasReview ? 'bg-amber-500' : 'bg-gray-400'
              }`}>
                {member.userName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{member.userName}</p>
                <div className="flex items-center gap-1">
                  {member.isComplete ? (
                    <CheckCircle className="w-3 h-3 text-green-600" />
                  ) : member.hasReview ? (
                    <Clock className="w-3 h-3 text-amber-600" />
                  ) : (
                    <Clock className="w-3 h-3 text-gray-400" />
                  )}
                  <span className={`text-xs ${
                    member.isComplete ? 'text-green-600' : member.hasReview ? 'text-amber-600' : 'text-gray-500'
                  }`}>
                    {member.isComplete ? 'Complete' : member.hasReview ? 'In Progress' : 'Not Started'}
                  </span>
                </div>
              </div>
              {member.weekRating && (
                <div className="flex items-center gap-1">
                  <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                  <span className="text-sm font-medium text-gray-700">{member.weekRating}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Team Reviews */}
      {teamReviews.length > 0 ? (
        <div className="space-y-4">
          <h3 className="font-semibold text-gray-900">Submitted Reviews</h3>
          {teamReviews.map(review => {
            const isExpanded = expandedReviews.has(review.id || '')
            const member = teamStatus.find(m => m.userId === review.user_id)

            return (
              <div key={review.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {/* Review Header */}
                <button
                  onClick={() => toggleReviewExpanded(review.id || '')}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold ${
                      review.is_completed ? 'bg-green-500' : 'bg-amber-500'
                    }`}>
                      {(review.submitter_name || member?.userName || 'U').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="text-left">
                      <p className="font-medium text-gray-900">{review.submitter_name || member?.userName || 'Team Member'}</p>
                      <p className="text-sm text-gray-500 capitalize">{member?.role || 'Member'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {review.energy_rating && (
                      <div className="flex items-center gap-1">
                        <Zap className="w-4 h-4 text-purple-500" />
                        <span className="text-sm font-medium text-gray-700">{review.energy_rating}/10</span>
                      </div>
                    )}
                    {review.week_rating && (
                      <div className="flex items-center gap-1">
                        <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                        <span className="text-sm font-medium text-gray-700">{review.week_rating}/10</span>
                      </div>
                    )}
                    {review.is_completed ? (
                      <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full font-medium">
                        Complete
                      </span>
                    ) : (
                      <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs rounded-full font-medium">
                        In Progress
                      </span>
                    )}
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </button>

                {/* Expanded Review Content */}
                {isExpanded && (
                  <div className="border-t border-gray-200 p-4 space-y-4">
                    {/* Rating Reason */}
                    {review.rating_reason && (
                      <div className="bg-amber-50 rounded-lg p-3">
                        <p className="text-sm text-gray-700">{review.rating_reason}</p>
                      </div>
                    )}

                    {/* Wins */}
                    {review.wins.length > 0 && (
                      <div>
                        <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                          <Trophy className="w-4 h-4 text-green-600" />
                          Wins & Highlights
                        </h4>
                        <ul className="space-y-1">
                          {review.wins.map((win, idx) => (
                            <li key={idx} className="flex items-start gap-2 text-sm text-gray-600">
                              <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                              {win}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Challenges */}
                    {review.challenges.length > 0 && (
                      <div>
                        <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                          <AlertTriangle className="w-4 h-4 text-orange-600" />
                          Challenges
                        </h4>
                        <ul className="space-y-1">
                          {review.challenges.map((challenge, idx) => (
                            <li key={idx} className="flex items-start gap-2 text-sm text-gray-600">
                              <AlertTriangle className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
                              {challenge}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Key Learning */}
                    {review.key_learning && (
                      <div>
                        <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                          <Lightbulb className="w-4 h-4 text-yellow-600" />
                          Key Learning
                        </h4>
                        <p className="text-sm text-gray-600 bg-yellow-50 rounded-lg p-3">{review.key_learning}</p>
                      </div>
                    )}

                    {/* Top Priorities */}
                    {review.top_priorities.length > 0 && (
                      <div>
                        <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                          <Target className="w-4 h-4 text-teal-600" />
                          Top Priorities
                        </h4>
                        <ul className="space-y-1">
                          {review.top_priorities.map((priority, idx) => (
                            <li key={priority.id} className="flex items-center gap-2 text-sm text-gray-600">
                              <span className="w-5 h-5 bg-teal-100 text-teal-700 rounded flex items-center justify-center text-xs font-semibold">
                                {idx + 1}
                              </span>
                              <span className={priority.completed ? 'line-through text-gray-400' : ''}>
                                {priority.priority}
                              </span>
                              {priority.completed && <CheckCircle className="w-4 h-4 text-green-500" />}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Questions for Coach */}
                    {review.coach_questions.length > 0 && (
                      <div>
                        <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                          <MessageCircle className="w-4 h-4 text-blue-600" />
                          Questions for Coach
                        </h4>
                        <div className="space-y-2">
                          {review.coach_questions.map((q, idx) => (
                            <div key={idx} className="bg-blue-50 rounded-lg p-3">
                              <p className="text-sm text-gray-700">{q.question}</p>
                              <span className={`inline-block mt-2 px-2 py-0.5 text-xs rounded-full font-medium ${
                                q.priority === 'high' ? 'bg-red-100 text-red-700' :
                                q.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                                'bg-teal-100 text-teal-700'
                              }`}>
                                {q.priority.toUpperCase()}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-900 mb-1">No Reviews Yet</h3>
          <p className="text-sm text-gray-500">
            No team members have submitted their weekly review for this week.
          </p>
        </div>
      )}
    </div>
  )
}
