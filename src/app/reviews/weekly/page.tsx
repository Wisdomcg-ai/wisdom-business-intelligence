'use client'

import { useState, useEffect } from 'react'
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Trophy,
  AlertTriangle,
  Lightbulb,
  Target,
  CheckSquare,
  CalendarDays,
  TrendingDown,
  TrendingUp,
  MessageCircle,
  Loader2,
  Plus,
  X,
  Check,
  Star,
  History
} from 'lucide-react'
import WeeklyReviewService, {
  WeeklyReview,
  LastWeekGoal,
  DisciplineCompleted,
  ImportantDate,
  CoachQuestion
} from '../services/weekly-review-service'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useBusinessContext } from '@/hooks/useBusinessContext'

const DEFAULT_DISCIPLINES = [
  'Dashboard updated',
  '90 day plan reviewed',
  'Reviewed Financials',
  'Team check-in'
]

export default function WeeklyReviewPage() {
  const supabase = createClient()
  const { activeBusiness, isLoading: contextLoading } = useBusinessContext()
  const [mounted, setMounted] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [currentWeekStart, setCurrentWeekStart] = useState('')
  const [review, setReview] = useState<WeeklyReview | null>(null)
  const [businessId, setBusinessId] = useState('')
  const [userId, setUserId] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const [allReviews, setAllReviews] = useState<WeeklyReview[]>([])

  // Form state for adding new items
  const [newWin, setNewWin] = useState('')
  const [newChallenge, setNewChallenge] = useState('')
  const [newGoal, setNewGoal] = useState('')
  const [newDate, setNewDate] = useState('')
  const [newDateDesc, setNewDateDesc] = useState('')
  const [newStopDoing, setNewStopDoing] = useState('')
  const [newStartDoing, setNewStartDoing] = useState('')
  const [newQuestion, setNewQuestion] = useState('')
  const [newQuestionPriority, setNewQuestionPriority] = useState<'low' | 'medium' | 'high'>('medium')
  const [newDiscipline, setNewDiscipline] = useState('')

  useEffect(() => {
    setMounted(true)
    if (!contextLoading) {
      loadInitialData()
    }
  }, [contextLoading, activeBusiness?.id])

  const loadInitialData = async () => {
    try {
      // Get current user from Supabase
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        console.log('[Weekly Review] ⚠️ No user logged in')
        setIsLoading(false)
        return
      }

      // Use activeBusiness if viewing as coach, otherwise current user
      const uid = activeBusiness?.ownerId || user.id
      setUserId(uid)

      // Determine the correct business_profiles.id for data queries
      // Weekly reviews are stored with business_profiles.id as the business_id
      let bizId: string
      if (activeBusiness?.id) {
        // Coach view: activeBusiness.id is businesses.id
        // Need to look up the corresponding business_profiles.id
        const { data: profile } = await supabase
          .from('business_profiles')
          .select('id')
          .eq('business_id', activeBusiness.id)
          .single()

        if (profile?.id) {
          bizId = profile.id
        } else {
          console.warn('[Weekly Review] No business_profiles found for businesses.id:', activeBusiness.id)
          bizId = activeBusiness.id // Fallback
        }
      } else {
        // Get business profile to get business_id
        const { data: profile } = await supabase
          .from('business_profiles')
          .select('id')
          .eq('user_id', user.id)
          .single()
        bizId = profile?.id || user.id
      }
      setBusinessId(bizId)

      console.log(`[Weekly Review] 📥 Loading data for business: ${bizId}`)

      const weekStart = WeeklyReviewService.getWeekStart()
      setCurrentWeekStart(weekStart)

      const { review: loadedReview, error } = await WeeklyReviewService.getOrCreateReview(
        bizId,
        uid,
        weekStart
      )

      if (error) {
        console.error('Error loading review:', error)
      } else {
        // Add default disciplines if they're missing
        let finalReview = loadedReview
        if (loadedReview) {
          const existingDisciplines = loadedReview.disciplines_completed || []

          // Build properly ordered array: defaults first (in order), then customs
          const defaultDisciplinesOrdered = DEFAULT_DISCIPLINES.map(defaultName => {
            const existing = existingDisciplines.find(d => d.discipline === defaultName)
            return existing || { discipline: defaultName, completed: false }
          })

          const customDisciplines = existingDisciplines.filter(
            d => !DEFAULT_DISCIPLINES.includes(d.discipline)
          )

          const needsUpdate = existingDisciplines.length !== (defaultDisciplinesOrdered.length + customDisciplines.length) ||
            existingDisciplines.some((d, idx) => d.discipline !== [...defaultDisciplinesOrdered, ...customDisciplines][idx]?.discipline)

          if (needsUpdate) {
            console.log('[Weekly Review] Reordering disciplines to match default order')
            finalReview = {
              ...loadedReview,
              disciplines_completed: [...defaultDisciplinesOrdered, ...customDisciplines]
            }
          }
        }
        console.log('[Weekly Review] Loaded review with disciplines:', finalReview?.disciplines_completed)
        setReview(finalReview)
      }

      // Load all reviews for history
      const reviews = await WeeklyReviewService.getAllReviews(bizId)
      setAllReviews(reviews)

      setIsLoading(false)
    } catch (err) {
      console.error('Error in loadInitialData:', err)
      setIsLoading(false)
    }
  }

  // Auto-save whenever review changes
  useEffect(() => {
    if (!review || !mounted || isLoading) return

    const saveTimer = setTimeout(async () => {
      setIsSaving(true)
      await WeeklyReviewService.saveReview(review)
      setIsSaving(false)
    }, 1000)

    return () => clearTimeout(saveTimer)
  }, [review, mounted, isLoading])

  const navigateWeek = async (direction: 'prev' | 'next') => {
    const currentDate = new Date(currentWeekStart)
    const newDate = new Date(currentDate)
    newDate.setDate(currentDate.getDate() + (direction === 'next' ? 7 : -7))

    const newWeekStart = WeeklyReviewService.getWeekStart(newDate)
    setCurrentWeekStart(newWeekStart)
    setIsLoading(true)

    const { review: loadedReview } = await WeeklyReviewService.getOrCreateReview(
      businessId,
      userId,
      newWeekStart
    )

    // Add default disciplines if they're missing
    let finalReview = loadedReview
    if (loadedReview) {
      const existingDisciplines = loadedReview.disciplines_completed || []

      const defaultDisciplinesOrdered = DEFAULT_DISCIPLINES.map(defaultName => {
        const existing = existingDisciplines.find(d => d.discipline === defaultName)
        return existing || { discipline: defaultName, completed: false }
      })

      const customDisciplines = existingDisciplines.filter(
        d => !DEFAULT_DISCIPLINES.includes(d.discipline)
      )

      const needsUpdate = existingDisciplines.length !== (defaultDisciplinesOrdered.length + customDisciplines.length) ||
        existingDisciplines.some((d, idx) => d.discipline !== [...defaultDisciplinesOrdered, ...customDisciplines][idx]?.discipline)

      if (needsUpdate) {
        finalReview = {
          ...loadedReview,
          disciplines_completed: [...defaultDisciplinesOrdered, ...customDisciplines]
        }
      }
    }

    setReview(finalReview)
    setIsLoading(false)
  }

  const loadWeek = async (weekStart: string) => {
    setCurrentWeekStart(weekStart)
    setIsLoading(true)
    setShowHistory(false)

    const { review: loadedReview } = await WeeklyReviewService.getOrCreateReview(
      businessId,
      userId,
      weekStart
    )

    // Add default disciplines if they're missing
    let finalReview = loadedReview
    if (loadedReview) {
      const existingDisciplines = loadedReview.disciplines_completed || []

      const defaultDisciplinesOrdered = DEFAULT_DISCIPLINES.map(defaultName => {
        const existing = existingDisciplines.find(d => d.discipline === defaultName)
        return existing || { discipline: defaultName, completed: false }
      })

      const customDisciplines = existingDisciplines.filter(
        d => !DEFAULT_DISCIPLINES.includes(d.discipline)
      )

      const needsUpdate = existingDisciplines.length !== (defaultDisciplinesOrdered.length + customDisciplines.length) ||
        existingDisciplines.some((d, idx) => d.discipline !== [...defaultDisciplinesOrdered, ...customDisciplines][idx]?.discipline)

      if (needsUpdate) {
        finalReview = {
          ...loadedReview,
          disciplines_completed: [...defaultDisciplinesOrdered, ...customDisciplines]
        }
      }
    }

    setReview(finalReview)
    setIsLoading(false)
  }

  const formatDateRange = (startDate: string, endDate: string) => {
    const start = new Date(startDate)
    const end = new Date(endDate)
    const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
    return `${start.toLocaleDateString('en-US', options)} - ${end.toLocaleDateString('en-US', options)}`
  }

  const updateReview = (updates: Partial<WeeklyReview>) => {
    if (review) {
      setReview({ ...review, ...updates })
    }
  }

  const addWin = () => {
    if (!newWin.trim() || !review) return
    updateReview({ wins: [...review.wins, newWin.trim()] })
    setNewWin('')
  }

  const removeWin = (index: number) => {
    if (!review) return
    updateReview({ wins: review.wins.filter((_, i) => i !== index) })
  }

  const addChallenge = () => {
    if (!newChallenge.trim() || !review) return
    updateReview({ challenges: [...review.challenges, newChallenge.trim()] })
    setNewChallenge('')
  }

  const removeChallenge = (index: number) => {
    if (!review) return
    updateReview({ challenges: review.challenges.filter((_, i) => i !== index) })
  }

  const addNextWeekGoal = () => {
    if (!newGoal.trim() || !review) return
    updateReview({ next_week_goals: [...review.next_week_goals, newGoal.trim()] })
    setNewGoal('')
  }

  const removeNextWeekGoal = (index: number) => {
    if (!review) return
    updateReview({ next_week_goals: review.next_week_goals.filter((_, i) => i !== index) })
  }

  const addImportantDate = () => {
    if (!newDate || !newDateDesc.trim() || !review) return
    updateReview({
      important_dates: [...review.important_dates, { date: newDate, description: newDateDesc.trim() }]
    })
    setNewDate('')
    setNewDateDesc('')
  }

  const removeImportantDate = (index: number) => {
    if (!review) return
    updateReview({ important_dates: review.important_dates.filter((_, i) => i !== index) })
  }

  const addStopDoing = () => {
    if (!newStopDoing.trim() || !review) return
    updateReview({ stop_doing: [...review.stop_doing, newStopDoing.trim()] })
    setNewStopDoing('')
  }

  const removeStopDoing = (index: number) => {
    if (!review) return
    updateReview({ stop_doing: review.stop_doing.filter((_, i) => i !== index) })
  }

  const addStartDoing = () => {
    if (!newStartDoing.trim() || !review) return
    updateReview({ start_doing: [...review.start_doing, newStartDoing.trim()] })
    setNewStartDoing('')
  }

  const removeStartDoing = (index: number) => {
    if (!review) return
    updateReview({ start_doing: review.start_doing.filter((_, i) => i !== index) })
  }

  const addDiscipline = () => {
    if (!newDiscipline.trim() || !review) return
    updateReview({
      disciplines_completed: [...review.disciplines_completed, { discipline: newDiscipline.trim(), completed: false }]
    })
    setNewDiscipline('')
  }

  const removeDiscipline = (index: number) => {
    if (!review) return
    updateReview({ disciplines_completed: review.disciplines_completed.filter((_, i) => i !== index) })
  }

  const addCoachQuestion = () => {
    if (!newQuestion.trim() || !review) return
    updateReview({
      coach_questions: [...review.coach_questions, {
        question: newQuestion.trim(),
        priority: newQuestionPriority
      }]
    })
    setNewQuestion('')
    setNewQuestionPriority('medium')
  }

  const removeCoachQuestion = (index: number) => {
    if (!review) return
    updateReview({ coach_questions: review.coach_questions.filter((_, i) => i !== index) })
  }

  if (!mounted) {
    return (
      <div className="p-8">
        <div className="max-w-6xl mx-auto">
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
            <div className="h-4 bg-gray-100 rounded w-2/3"></div>
          </div>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-teal-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading your weekly review...</p>
        </div>
      </div>
    )
  }

  if (!review) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-red-600 font-medium">Error loading review</p>
        </div>
      </div>
    )
  }

  const isCurrentWeek = currentWeekStart === WeeklyReviewService.getWeekStart()

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header with Week Navigation */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Weekly Review</h1>
              <p className="text-gray-600">Reflect, plan, and prepare for the week ahead</p>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="flex items-center space-x-2 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <History className="w-4 h-4" />
                <span className="text-sm font-medium">History</span>
              </button>
              {isSaving && (
                <div className="flex items-center text-gray-600">
                  <Loader2 className="animate-spin h-4 w-4 mr-2" />
                  <span className="text-sm">Saving...</span>
                </div>
              )}
              {!isSaving && (
                <div className="text-sm text-green-600 font-medium">✓ Saved</div>
              )}
            </div>
          </div>

          {/* Week Selector */}
          <div className="flex items-center justify-between bg-teal-50 border border-teal-200 rounded-lg p-4">
            <button
              onClick={() => navigateWeek('prev')}
              className="p-2 hover:bg-teal-100 rounded-lg transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-teal-700" />
            </button>

            <div className="text-center">
              <div className="flex items-center space-x-2">
                <Calendar className="w-5 h-5 text-teal-700" />
                <span className="text-lg font-semibold text-teal-900">
                  {formatDateRange(review.week_start_date, review.week_end_date)}
                </span>
                {isCurrentWeek && (
                  <span className="px-2 py-1 bg-teal-600 text-white text-xs rounded-full font-medium">
                    Current Week
                  </span>
                )}
              </div>
            </div>

            <button
              onClick={() => navigateWeek('next')}
              className="p-2 hover:bg-teal-100 rounded-lg transition-colors"
              disabled={isCurrentWeek}
            >
              <ChevronRight className={`w-5 h-5 ${isCurrentWeek ? 'text-gray-400' : 'text-teal-700'}`} />
            </button>
          </div>
        </div>

        {/* History View */}
        {showHistory && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Review History</h2>
            <div className="space-y-2">
              {allReviews.map((r) => (
                <button
                  key={r.id}
                  onClick={() => loadWeek(r.week_start_date)}
                  className={`w-full flex items-center justify-between p-4 rounded-lg border transition-colors ${
                    r.week_start_date === currentWeekStart
                      ? 'bg-teal-50 border-teal-300'
                      : 'bg-white border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <Calendar className="w-5 h-5 text-gray-600" />
                    <span className="font-medium text-gray-900">
                      {formatDateRange(r.week_start_date, r.week_end_date)}
                    </span>
                  </div>
                  <div className="flex items-center space-x-3">
                    {r.week_rating && (
                      <div className="flex items-center space-x-1">
                        <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                        <span className="text-sm font-medium text-gray-700">{r.week_rating}/10</span>
                      </div>
                    )}
                    {r.is_completed && (
                      <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full font-medium">
                        Completed
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Section 1: Reflection */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
            <Trophy className="w-6 h-6 text-teal-600 mr-3" />
            Reflection
          </h2>

          {/* Wins & Highlights */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-3 flex items-center">
              <Trophy className="w-4 h-4 text-green-600 mr-2" />
              Wins & Highlights
            </label>
            <div className="space-y-2 mb-3">
              {review.wins.map((win, idx) => (
                <div key={idx} className="flex items-start space-x-2 bg-green-50 p-3 rounded-lg">
                  <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span className="flex-1 text-gray-800">{win}</span>
                  <button
                    onClick={() => removeWin(idx)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex space-x-2">
              <input
                type="text"
                value={newWin}
                onChange={(e) => setNewWin(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addWin()}
                placeholder="Add a win or highlight..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
              <button
                onClick={addWin}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Challenges & Frustrations */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-3 flex items-center">
              <AlertTriangle className="w-4 h-4 text-orange-600 mr-2" />
              Challenges & Frustrations
            </label>
            <div className="space-y-2 mb-3">
              {review.challenges.map((challenge, idx) => (
                <div key={idx} className="flex items-start space-x-2 bg-orange-50 p-3 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                  <span className="flex-1 text-gray-800">{challenge}</span>
                  <button
                    onClick={() => removeChallenge(idx)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex space-x-2">
              <input
                type="text"
                value={newChallenge}
                onChange={(e) => setNewChallenge(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addChallenge()}
                placeholder="Add a challenge or frustration..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
              <button
                onClick={addChallenge}
                className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Key Learning */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3 flex items-center">
              <Lightbulb className="w-4 h-4 text-yellow-600 mr-2" />
              Key Learning
            </label>
            <textarea
              value={review.key_learning}
              onChange={(e) => updateReview({ key_learning: e.target.value })}
              placeholder="What was the most important thing you learned this week?"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              rows={3}
            />
          </div>
        </div>

        {/* Section 2: Accountability - Goals from Last Week */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
            <Target className="w-6 h-6 text-teal-600 mr-3" />
            Accountability - Last Week's Goals
          </h2>

          {review.last_week_goals.length === 0 ? (
            <p className="text-gray-500 italic">No goals from last week. Add goals in "This Week Planning" section.</p>
          ) : (
            <div className="space-y-3">
              {review.last_week_goals.map((goal, idx) => (
                <div key={idx} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start space-x-3 mb-2">
                    <input
                      type="checkbox"
                      checked={goal.achieved}
                      onChange={(e) => {
                        const updated = [...review.last_week_goals]
                        updated[idx].achieved = e.target.checked
                        const completionRate = Math.round(
                          (updated.filter(g => g.achieved).length / updated.length) * 100
                        )
                        updateReview({ last_week_goals: updated, completion_rate: completionRate })
                      }}
                      className="mt-1 w-5 h-5 text-teal-600 rounded focus:ring-2 focus:ring-teal-500"
                    />
                    <div className="flex-1">
                      <p className={`font-medium ${goal.achieved ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                        {goal.goal}
                      </p>
                      <input
                        type="text"
                        value={goal.comment}
                        onChange={(e) => {
                          const updated = [...review.last_week_goals]
                          updated[idx].comment = e.target.value
                          updateReview({ last_week_goals: updated })
                        }}
                        placeholder="Add a comment..."
                        className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>
              ))}
              <div className="mt-4 p-4 bg-teal-50 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-teal-900">Completion Rate</span>
                  <span className="text-2xl font-bold text-teal-600">{review.completion_rate}%</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Section 3: Weekly Checklist */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
            <CheckSquare className="w-6 h-6 text-teal-600 mr-3" />
            Weekly Checklist
          </h2>

          <div className="space-y-3">
            {review.disciplines_completed.map((discipline, idx) => {
              const isDefault = DEFAULT_DISCIPLINES.includes(discipline.discipline)
              const is90DayPlan = discipline.discipline === '90 day plan reviewed'
              const isDashboard = discipline.discipline === 'Dashboard updated'

              return (
                <div key={idx} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                  <input
                    type="checkbox"
                    checked={discipline.completed}
                    onChange={(e) => {
                      const updated = [...review.disciplines_completed]
                      updated[idx].completed = e.target.checked
                      updateReview({ disciplines_completed: updated })
                    }}
                    className="w-5 h-5 text-teal-600 rounded focus:ring-2 focus:ring-teal-500"
                  />
                  {is90DayPlan ? (
                    <Link
                      href="/goals?step=5"
                      className={`flex-1 ${discipline.completed ? 'text-gray-500 line-through' : 'text-teal-600 hover:text-teal-800'} underline`}
                    >
                      {discipline.discipline}
                    </Link>
                  ) : isDashboard ? (
                    <Link
                      href="/business-dashboard"
                      className={`flex-1 ${discipline.completed ? 'text-gray-500 line-through' : 'text-teal-600 hover:text-teal-800'} underline`}
                    >
                      {discipline.discipline}
                    </Link>
                  ) : (
                    <span className={`flex-1 ${discipline.completed ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                      {discipline.discipline}
                    </span>
                  )}
                  {!isDefault && (
                    <button
                      onClick={() => removeDiscipline(idx)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )
            })}

            {/* Add Additional Discipline */}
            <div className="flex space-x-2 mt-3">
              <input
                type="text"
                value={newDiscipline}
                onChange={(e) => setNewDiscipline(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addDiscipline()}
                placeholder="+ Additional discipline..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
              <button
                onClick={addDiscipline}
                className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Section 4: Goals for Next Week */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
            <Target className="w-6 h-6 text-teal-600 mr-3" />
            Goals for Next Week
          </h2>

          <div className="mb-6">
            <div className="space-y-3">
              {/* Always show at least 3 goal input fields */}
              {Array.from({ length: Math.max(3, review.next_week_goals.length) }).map((_, idx) => (
                <div key={idx} className="flex items-center space-x-2">
                  <div className="flex items-center space-x-2 flex-1">
                    <span className="text-sm font-semibold text-gray-600 w-6">{idx + 1}.</span>
                    <input
                      type="text"
                      value={review.next_week_goals[idx] || ''}
                      onChange={(e) => {
                        const updated = [...review.next_week_goals]
                        if (e.target.value.trim()) {
                          updated[idx] = e.target.value
                        } else {
                          // Remove the goal if it's cleared
                          updated.splice(idx, 1)
                        }
                        updateReview({ next_week_goals: updated })
                      }}
                      placeholder={`Goal ${idx + 1}${idx < 3 ? ' (required)' : ''}`}
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    />
                  </div>
                  {idx >= 3 && review.next_week_goals[idx] && (
                    <button
                      onClick={() => removeNextWeekGoal(idx)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  )}
                </div>
              ))}

              {/* Add More Goal Button (only show if 3+ goals exist) */}
              {review.next_week_goals.length >= 3 && (
                <button
                  onClick={() => {
                    updateReview({ next_week_goals: [...review.next_week_goals, ''] })
                  }}
                  className="flex items-center space-x-2 px-4 py-2 text-teal-600 hover:text-teal-700 font-medium"
                >
                  <Plus className="w-5 h-5" />
                  <span>Add Another Goal</span>
                </button>
              )}
            </div>
          </div>

          {/* Important Dates & Actions */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              Important Dates & Actions
            </label>
            <div className="space-y-2 mb-3">
              {review.important_dates.map((item, idx) => (
                <div key={idx} className="flex items-center space-x-2 bg-purple-50 p-3 rounded-lg">
                  <Calendar className="w-5 h-5 text-purple-600 flex-shrink-0" />
                  <div className="flex-1">
                    <span className="font-medium text-gray-900">{item.date}</span>
                    <span className="text-gray-600 ml-2">- {item.description}</span>
                  </div>
                  <button
                    onClick={() => removeImportantDate(idx)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex space-x-2">
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
              <input
                type="text"
                value={newDateDesc}
                onChange={(e) => setNewDateDesc(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addImportantDate()}
                placeholder="Description..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
              <button
                onClick={addImportantDate}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Section 5: Summary */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Summary</h2>

          {/* Stop Doing */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-3 flex items-center">
              <TrendingDown className="w-4 h-4 text-red-600 mr-2" />
              Stop Doing
            </label>
            <div className="space-y-2 mb-3">
              {review.stop_doing.map((item, idx) => (
                <div key={idx} className="flex items-start space-x-2 bg-red-50 p-3 rounded-lg">
                  <X className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <span className="flex-1 text-gray-800">{item}</span>
                  <button
                    onClick={() => removeStopDoing(idx)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex space-x-2">
              <input
                type="text"
                value={newStopDoing}
                onChange={(e) => setNewStopDoing(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addStopDoing()}
                placeholder="What should you stop doing?"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
              <button
                onClick={addStopDoing}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Start Doing */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-3 flex items-center">
              <TrendingUp className="w-4 h-4 text-green-600 mr-2" />
              Start Doing
            </label>
            <div className="space-y-2 mb-3">
              {review.start_doing.map((item, idx) => (
                <div key={idx} className="flex items-start space-x-2 bg-green-50 p-3 rounded-lg">
                  <Plus className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span className="flex-1 text-gray-800">{item}</span>
                  <button
                    onClick={() => removeStartDoing(idx)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex space-x-2">
              <input
                type="text"
                value={newStartDoing}
                onChange={(e) => setNewStartDoing(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addStartDoing()}
                placeholder="What should you start doing?"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
              <button
                onClick={addStartDoing}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Rate Your Week */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3 flex items-center">
              <Star className="w-4 h-4 text-yellow-600 mr-2" />
              Rate Your Week (1-10)
            </label>
            <div className="flex items-center space-x-4 mb-3">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((rating) => (
                <button
                  key={rating}
                  onClick={() => updateReview({ week_rating: rating })}
                  className={`w-12 h-12 rounded-lg font-bold transition-colors ${
                    review.week_rating === rating
                      ? 'bg-teal-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {rating}
                </button>
              ))}
            </div>
            <textarea
              value={review.rating_reason}
              onChange={(e) => updateReview({ rating_reason: e.target.value })}
              placeholder="Why did you give this rating?"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              rows={3}
            />
          </div>
        </div>

        {/* Section 6: Questions for Coach */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
            <MessageCircle className="w-6 h-6 text-teal-600 mr-3" />
            Questions for Coach
          </h2>

          <div className="space-y-3 mb-4">
            {review.coach_questions.map((q, idx) => (
              <div key={idx} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between mb-2">
                  <p className="flex-1 text-gray-900 font-medium">{q.question}</p>
                  <button
                    onClick={() => removeCoachQuestion(idx)}
                    className="text-red-500 hover:text-red-700 ml-2"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                    q.priority === 'high' ? 'bg-red-100 text-red-700' :
                    q.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-teal-100 text-teal-700'
                  }`}>
                    {q.priority.toUpperCase()} PRIORITY
                  </span>
                  {q.category && (
                    <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full">
                      {q.category}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <textarea
              value={newQuestion}
              onChange={(e) => setNewQuestion(e.target.value)}
              placeholder="What question do you have for your coach?"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              rows={3}
            />
            <div className="flex items-center space-x-3">
              <div className="flex space-x-2">
                {(['low', 'medium', 'high'] as const).map((priority) => (
                  <button
                    key={priority}
                    onClick={() => setNewQuestionPriority(priority)}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      newQuestionPriority === priority
                        ? priority === 'high' ? 'bg-red-600 text-white' :
                          priority === 'medium' ? 'bg-yellow-600 text-white' :
                          'bg-teal-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {priority.charAt(0).toUpperCase() + priority.slice(1)}
                  </button>
                ))}
              </div>
              <button
                onClick={addCoachQuestion}
                className="px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium"
              >
                Add Question
              </button>
            </div>
          </div>
        </div>

        {/* Mark as Complete Button */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <button
            onClick={() => updateReview({ is_completed: !review.is_completed })}
            className={`w-full py-4 rounded-lg font-bold text-lg transition-colors ${
              review.is_completed
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'bg-teal-600 text-white hover:bg-teal-700'
            }`}
          >
            {review.is_completed ? '✓ Review Completed' : 'Mark as Complete'}
          </button>
        </div>
      </div>
    </div>
  )
}
