'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Trophy,
  AlertTriangle,
  Lightbulb,
  Target,
  CheckSquare,
  TrendingDown,
  TrendingUp,
  MessageCircle,
  Loader2,
  X,
  Check,
  Star,
  History,
  Zap,
  Compass,
  ArrowRight,
  Mountain,
  DollarSign,
  CalendarDays,
  Users,
  Eye,
  ChevronDown,
  ChevronUp,
  User,
  RotateCcw,
  CalendarCheck
} from 'lucide-react'
import WeeklyReviewService, {
  WeeklyReview,
  RockProgress,
  WeeklyPriority,
  TeamMemberReviewStatus
} from '../services/weekly-review-service'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useBusinessContext } from '@/hooks/useBusinessContext'
import { StrategicPlanningService } from '@/app/goals/services/strategic-planning-service'
import { FinancialService } from '@/app/goals/services/financial-service'
import PageHeader from '@/components/ui/PageHeader'

const DEFAULT_DISCIPLINES = [
  'Dashboard updated',
  '90 day plan reviewed',
  'Reviewed Financials',
  'Team check-in'
]

// Helper to format currency
const formatCurrency = (amount: number | null | undefined) => {
  if (amount === null || amount === undefined) return '--'
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount)
}

// Rating button component
function RatingButtons({
  value,
  onChange,
  color = 'teal'
}: {
  value: number | null
  onChange: (val: number) => void
  color?: 'teal' | 'orange' | 'navy'
}) {
  const colorClasses = {
    teal: 'bg-brand-orange text-white',
    orange: 'bg-brand-orange text-white',
    navy: 'bg-brand-navy text-white'
  }

  return (
    <div className="flex items-center gap-1 sm:gap-2">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((rating) => (
        <button
          key={rating}
          onClick={() => onChange(rating)}
          className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg font-semibold text-sm transition-all ${
            value === rating
              ? colorClasses[color]
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {rating}
        </button>
      ))}
    </div>
  )
}

// List input component with Add button and edit capability
function ListInput({
  items,
  onAdd,
  onRemove,
  onUpdate,
  placeholder,
  icon: Icon,
  iconColor,
  addButtonColor = 'teal'
}: {
  items: string[]
  onAdd: (item: string) => void
  onRemove: (index: number) => void
  onUpdate?: (index: number, value: string) => void
  placeholder: string
  icon: typeof Trophy
  iconColor: string
  addButtonColor?: 'teal' | 'orange' | 'navy' | 'red'
}) {
  const [newItem, setNewItem] = useState('')
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editingValue, setEditingValue] = useState('')

  const handleAdd = () => {
    if (newItem.trim()) {
      onAdd(newItem.trim())
      setNewItem('')
    }
  }

  const startEditing = (index: number, value: string) => {
    setEditingIndex(index)
    setEditingValue(value)
  }

  const saveEdit = () => {
    if (editingIndex !== null && editingValue.trim() && onUpdate) {
      onUpdate(editingIndex, editingValue.trim())
    }
    setEditingIndex(null)
    setEditingValue('')
  }

  const cancelEdit = () => {
    setEditingIndex(null)
    setEditingValue('')
  }

  const buttonColors = {
    teal: 'bg-brand-orange hover:bg-brand-orange-600',
    orange: 'bg-brand-orange hover:bg-brand-orange-600',
    navy: 'bg-brand-navy hover:bg-brand-navy-700',
    red: 'bg-red-600 hover:bg-red-700'
  }

  return (
    <div className="space-y-2">
      {items.map((item, idx) => (
        <div key={idx} className="flex items-start gap-2 p-3 bg-gray-50 rounded-lg group">
          <Icon className={`w-4 h-4 ${iconColor} flex-shrink-0 mt-0.5`} />
          {editingIndex === idx ? (
            <div className="flex-1 flex items-center gap-2">
              <input
                type="text"
                value={editingValue}
                onChange={(e) => setEditingValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveEdit()
                  if (e.key === 'Escape') cancelEdit()
                }}
                autoFocus
                className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-brand-orange focus:border-transparent"
              />
              <button onClick={saveEdit} className="text-green-600 hover:text-green-700">
                <Check className="w-4 h-4" />
              </button>
              <button onClick={cancelEdit} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              <span
                className="flex-1 text-gray-800 text-sm cursor-pointer hover:text-brand-orange"
                onClick={() => onUpdate && startEditing(idx, item)}
                title={onUpdate ? "Click to edit" : undefined}
              >
                {item}
              </span>
              <button
                onClick={() => onRemove(idx)}
                className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Icon className={`w-4 h-4 text-gray-300 flex-shrink-0`} />
        <input
          type="text"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleAdd()
            }
          }}
          placeholder={placeholder}
          className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
        />
        <button
          onClick={handleAdd}
          disabled={!newItem.trim()}
          className={`px-3 py-2 ${buttonColors[addButtonColor]} text-white text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          Add
        </button>
      </div>
    </div>
  )
}

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

  // Quarterly targets and rocks from strategic plan
  const [quarterlyTargets, setQuarterlyTargets] = useState<{
    revenue: number | null
    grossProfit: number | null
    netProfit: number | null
  }>({ revenue: null, grossProfit: null, netProfit: null })
  const [rocks, setRocks] = useState<{ id: string; title: string; owner?: string }[]>([])

  // Form state for new items
  const [newQuestion, setNewQuestion] = useState('')
  const [newQuestionPriority, setNewQuestionPriority] = useState<'low' | 'medium' | 'high'>('medium')
  const [newDiscipline, setNewDiscipline] = useState('')
  const [newDate, setNewDate] = useState('')
  const [newDateDesc, setNewDateDesc] = useState('')
  const [newPriorityText, setNewPriorityText] = useState('')
  const [newPriorityRockId, setNewPriorityRockId] = useState('')
  const [editingDateIdx, setEditingDateIdx] = useState<number | null>(null)
  const [editingDateValue, setEditingDateValue] = useState('')
  const [editingDateDescValue, setEditingDateDescValue] = useState('')
  const [editingPriorityId, setEditingPriorityId] = useState<string | null>(null)
  const [editingPriorityText, setEditingPriorityText] = useState('')
  const [editingPriorityRockId, setEditingPriorityRockId] = useState<string | undefined>(undefined)

  // Team reviews state
  const [teamReviewStatus, setTeamReviewStatus] = useState<TeamMemberReviewStatus[]>([])
  const [teamReviews, setTeamReviews] = useState<WeeklyReview[]>([])
  const [showTeamPanel, setShowTeamPanel] = useState(false)
  const [viewingTeamMemberId, setViewingTeamMemberId] = useState<string | null>(null)
  const [isOwnerOrAdmin, setIsOwnerOrAdmin] = useState(false)
  const [currentUserName, setCurrentUserName] = useState('')
  
  useEffect(() => {
    setMounted(true)
    if (!contextLoading) {
      loadInitialData()
    }
  }, [contextLoading, activeBusiness?.id])

  const loadInitialData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        console.log('[Weekly Review] ⚠️ No user logged in')
        setIsLoading(false)
        return
      }

      const uid = activeBusiness?.ownerId || user.id
      setUserId(uid)

      // Determine the correct business_profiles.id
      let bizId: string
      if (activeBusiness?.id) {
        const { data: profile } = await supabase
          .from('business_profiles')
          .select('id')
          .eq('business_id', activeBusiness.id)
          .single()

        if (profile?.id) {
          bizId = profile.id
        } else {
          console.warn('[Weekly Review] No business_profiles found for businesses.id:', activeBusiness.id)
          bizId = activeBusiness.id
        }
      } else {
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

      // Load review
      const { review: loadedReview, error } = await WeeklyReviewService.getOrCreateReview(
        bizId,
        uid,
        weekStart
      )

      if (error) {
        console.error('Error loading review:', error)
      } else {
        // Ensure disciplines are in correct order
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
          finalReview = {
            ...loadedReview,
            disciplines_completed: [...defaultDisciplinesOrdered, ...customDisciplines]
          }
        }
        setReview(finalReview)
      }

      // Load all reviews for history
      const reviews = await WeeklyReviewService.getAllReviews(bizId)
      setAllReviews(reviews)

      // Load quarterly targets and rocks from strategic plan
      await loadStrategicData(bizId)

      // Check if user is owner/admin and load team data
      const { data: userRole } = await supabase
        .from('business_users')
        .select('role')
        .eq('business_id', bizId)
        .eq('user_id', user.id)
        .single()

      const isOwnerAdmin = userRole?.role === 'owner' || userRole?.role === 'admin'
      setIsOwnerOrAdmin(isOwnerAdmin)

      // Get current user's name
      const { data: userData } = await supabase
        .from('users')
        .select('first_name, last_name')
        .eq('id', user.id)
        .single()

      if (userData?.first_name) {
        setCurrentUserName(`${userData.first_name} ${userData.last_name || ''}`.trim())
      }

      // Load team review status if owner/admin
      if (isOwnerAdmin) {
        const teamStatus = await WeeklyReviewService.getTeamReviewStatus(bizId, weekStart)
        setTeamReviewStatus(teamStatus)

        // Load all team reviews for this week
        const allTeamReviews = await WeeklyReviewService.getTeamReviewsForWeek(bizId, weekStart)
        setTeamReviews(allTeamReviews)
      }

      setIsLoading(false)
    } catch (err) {
      console.error('Error in loadInitialData:', err)
      setIsLoading(false)
    }
  }

  const loadStrategicData = async (bizId: string) => {
    try {
      // Load financial goals to get quarterly targets
      const { quarterlyTargets: loadedTargets } = await FinancialService.loadFinancialGoals(bizId)

      if (loadedTargets) {
        // Get current quarter
        const now = new Date()
        const currentQuarter = `q${Math.ceil((now.getMonth() + 1) / 3)}` as 'q1' | 'q2' | 'q3' | 'q4'

        // Parse quarterly targets
        const parseQuarterlyValue = (key: string): number | null => {
          const value = loadedTargets[key]?.[currentQuarter]
          if (value === undefined || value === '') return null
          const parsed = parseFloat(value)
          return isNaN(parsed) ? null : parsed
        }

        setQuarterlyTargets({
          revenue: parseQuarterlyValue('revenue'),
          grossProfit: parseQuarterlyValue('grossProfit'),
          netProfit: parseQuarterlyValue('netProfit')
        })
      }

      // Load rocks (initiatives assigned to current quarter)
      const currentQuarter = `q${Math.ceil((new Date().getMonth() + 1) / 3)}` as 'q1' | 'q2' | 'q3' | 'q4'
      const loadedInitiatives = await StrategicPlanningService.loadInitiatives(bizId, currentQuarter)

      if (loadedInitiatives && loadedInitiatives.length > 0) {
        setRocks(loadedInitiatives.map(i => ({
          id: i.id,
          title: i.title,
          owner: i.assignedTo
        })))
      }
    } catch (err) {
      console.error('[Weekly Review] Error loading strategic data:', err)
    }
  }

  // Auto-save effect
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

    if (loadedReview) {
      const existingDisciplines = loadedReview.disciplines_completed || []
      const defaultDisciplinesOrdered = DEFAULT_DISCIPLINES.map(defaultName => {
        const existing = existingDisciplines.find(d => d.discipline === defaultName)
        return existing || { discipline: defaultName, completed: false }
      })
      const customDisciplines = existingDisciplines.filter(
        d => !DEFAULT_DISCIPLINES.includes(d.discipline)
      )
      setReview({
        ...loadedReview,
        disciplines_completed: [...defaultDisciplinesOrdered, ...customDisciplines]
      })
    }

    // Also reload team data if owner/admin
    if (isOwnerOrAdmin) {
      const teamStatus = await WeeklyReviewService.getTeamReviewStatus(businessId, newWeekStart)
      setTeamReviewStatus(teamStatus)

      const allTeamReviews = await WeeklyReviewService.getTeamReviewsForWeek(businessId, newWeekStart)
      setTeamReviews(allTeamReviews)
    }

    // Reset viewing state
    setViewingTeamMemberId(null)

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

    if (loadedReview) {
      const existingDisciplines = loadedReview.disciplines_completed || []
      const defaultDisciplinesOrdered = DEFAULT_DISCIPLINES.map(defaultName => {
        const existing = existingDisciplines.find(d => d.discipline === defaultName)
        return existing || { discipline: defaultName, completed: false }
      })
      const customDisciplines = existingDisciplines.filter(
        d => !DEFAULT_DISCIPLINES.includes(d.discipline)
      )
      setReview({
        ...loadedReview,
        disciplines_completed: [...defaultDisciplinesOrdered, ...customDisciplines]
      })
    }

    // Also reload team data if owner/admin
    if (isOwnerOrAdmin) {
      const teamStatus = await WeeklyReviewService.getTeamReviewStatus(businessId, weekStart)
      setTeamReviewStatus(teamStatus)

      const allTeamReviews = await WeeklyReviewService.getTeamReviewsForWeek(businessId, weekStart)
      setTeamReviews(allTeamReviews)
    }

    // Reset viewing state
    setViewingTeamMemberId(null)

    setIsLoading(false)
  }

  // View a specific team member's review
  const viewTeamMemberReview = (memberId: string) => {
    if (memberId === userId) {
      setViewingTeamMemberId(null) // View own review
    } else {
      setViewingTeamMemberId(memberId)
    }
  }

  // Get the review to display (either own or team member's)
  const getDisplayedReview = (): WeeklyReview | null => {
    if (viewingTeamMemberId) {
      return teamReviews.find(r => r.user_id === viewingTeamMemberId) || null
    }
    return review
  }

  const displayedReview = getDisplayedReview()
  const isViewingOther = viewingTeamMemberId !== null
  const viewingMemberName = viewingTeamMemberId
    ? teamReviewStatus.find(m => m.userId === viewingTeamMemberId)?.userName || 'Team Member'
    : null

  const formatDateRange = (startDate: string, endDate: string) => {
    const start = new Date(startDate)
    const end = new Date(endDate)
    const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
    return `${start.toLocaleDateString('en-US', options)} - ${end.toLocaleDateString('en-US', options)}`
  }

  const updateReview = useCallback((updates: Partial<WeeklyReview>) => {
    if (review) {
      setReview({ ...review, ...updates })
    }
  }, [review])

  // Rock progress handlers
  const updateRockProgress = (rockId: string, updates: Partial<RockProgress>) => {
    if (!review) return
    const existingProgress = review.rock_progress || []
    const rock = rocks.find(r => r.id === rockId)
    const existingIndex = existingProgress.findIndex(rp => rp.rockId === rockId)

    if (existingIndex >= 0) {
      const updated = [...existingProgress]
      updated[existingIndex] = { ...updated[existingIndex], ...updates }
      updateReview({ rock_progress: updated })
    } else {
      updateReview({
        rock_progress: [...existingProgress, {
          rockId,
          rockTitle: rock?.title || '',
          status: 'on_track',
          ...updates
        }]
      })
    }
  }

  // Priority handlers
  const addTopPriority = (priority: string, linkedRockId?: string) => {
    if (!review || !priority.trim()) return
    const newPriority: WeeklyPriority = {
      id: `priority-${Date.now()}`,
      priority: priority.trim(),
      linkedRockId,
      completed: false
    }
    updateReview({ top_priorities: [...(review.top_priorities || []), newPriority] })
  }

  const handleAddPriority = () => {
    if (!newPriorityText.trim()) return
    addTopPriority(newPriorityText, newPriorityRockId || undefined)
    setNewPriorityText('')
    setNewPriorityRockId('')
  }

  const removeTopPriority = (id: string) => {
    if (!review) return
    updateReview({ top_priorities: (review.top_priorities || []).filter(p => p.id !== id) })
  }

  const toggleTopPriorityComplete = (id: string) => {
    if (!review) return
    const updated = (review.top_priorities || []).map(p =>
      p.id === id ? { ...p, completed: !p.completed } : p
    )
    updateReview({ top_priorities: updated })
  }

  const startEditingPriority = (priority: WeeklyPriority) => {
    setEditingPriorityId(priority.id)
    setEditingPriorityText(priority.priority)
    setEditingPriorityRockId(priority.linkedRockId)
  }

  const saveEditingPriority = () => {
    if (!editingPriorityId || !review || !editingPriorityText.trim()) return
    const updated = (review.top_priorities || []).map(p =>
      p.id === editingPriorityId
        ? { ...p, priority: editingPriorityText.trim(), linkedRockId: editingPriorityRockId }
        : p
    )
    updateReview({ top_priorities: updated })
    setEditingPriorityId(null)
    setEditingPriorityText('')
    setEditingPriorityRockId(undefined)
  }

  const cancelEditingPriority = () => {
    setEditingPriorityId(null)
    setEditingPriorityText('')
    setEditingPriorityRockId(undefined)
  }

  // Discipline handlers
  const toggleDiscipline = (index: number) => {
    if (!review) return
    const updated = [...review.disciplines_completed]
    updated[index].completed = !updated[index].completed
    updateReview({ disciplines_completed: updated })
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

  // Question handlers
  const addCoachQuestion = () => {
    if (!newQuestion.trim() || !review) return
    updateReview({
      coach_questions: [...(review.coach_questions || []), {
        question: newQuestion.trim(),
        priority: newQuestionPriority
      }]
    })
    setNewQuestion('')
    setNewQuestionPriority('medium')
  }

  const removeCoachQuestion = (index: number) => {
    if (!review) return
    updateReview({ coach_questions: (review.coach_questions || []).filter((_, i) => i !== index) })
  }

  // Date handlers
  const addImportantDate = () => {
    if (!newDate || !newDateDesc.trim() || !review) return
    updateReview({
      important_dates: [...(review.important_dates || []), { date: newDate, description: newDateDesc.trim() }]
    })
    setNewDate('')
    setNewDateDesc('')
  }

  const removeImportantDate = (index: number) => {
    if (!review) return
    updateReview({ important_dates: (review.important_dates || []).filter((_, i) => i !== index) })
  }

  const startEditingDate = (index: number) => {
    const dateItem = review?.important_dates?.[index]
    if (dateItem) {
      setEditingDateIdx(index)
      setEditingDateValue(dateItem.date)
      setEditingDateDescValue(dateItem.description)
    }
  }

  const saveEditingDate = () => {
    if (editingDateIdx === null || !review || !editingDateValue || !editingDateDescValue.trim()) return
    const updatedDates = [...(review.important_dates || [])]
    updatedDates[editingDateIdx] = { date: editingDateValue, description: editingDateDescValue.trim() }
    updateReview({ important_dates: updatedDates })
    setEditingDateIdx(null)
    setEditingDateValue('')
    setEditingDateDescValue('')
  }

  const cancelEditingDate = () => {
    setEditingDateIdx(null)
    setEditingDateValue('')
    setEditingDateDescValue('')
  }

  if (!mounted) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6">
            <div className="h-8 bg-gray-200 rounded w-1/3 mb-4 animate-pulse"></div>
            <div className="h-4 bg-gray-100 rounded w-2/3 animate-pulse"></div>
          </div>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-brand-orange mx-auto mb-4" />
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
    <div className="min-h-screen bg-gray-50">
      {/* Page Header */}
      <PageHeader
        variant="banner"
        title="Weekly Reset"
        subtitle="Reflect, align, and plan for the week ahead"
        icon={CalendarCheck}
        actions={
          <>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors text-sm"
            >
              <History className="w-4 h-4" />
              <span className="hidden sm:inline font-medium">History</span>
            </button>
            {isSaving ? (
              <div className="flex items-center text-gray-500">
                <Loader2 className="animate-spin h-4 w-4 sm:mr-2" />
                <span className="text-sm hidden sm:inline">Saving...</span>
              </div>
            ) : (
              <div className="text-sm text-green-600 font-medium hidden sm:block">✓ Saved</div>
            )}
          </>
        }
      />

      <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Week Navigation */}
        <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 mb-6">
          <div className="flex items-center justify-between bg-brand-orange-50 border border-brand-orange-200 rounded-xl p-3 sm:p-4">
            <button
              onClick={() => navigateWeek('prev')}
              className="p-2 hover:bg-brand-orange-100 rounded-lg transition-colors"
              aria-label="Previous week"
            >
              <ChevronLeft className="w-5 h-5 text-brand-orange-700" />
            </button>

            <div className="text-center">
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-brand-orange-700" />
                <span className="text-sm sm:text-lg font-semibold text-brand-navy">
                  {formatDateRange(review.week_start_date, review.week_end_date)}
                </span>
                {isCurrentWeek && (
                  <span className="px-2 py-1 bg-brand-orange text-white text-xs rounded-full font-medium">
                    Current Week
                  </span>
                )}
              </div>
            </div>

            <button
              onClick={() => navigateWeek('next')}
              className="p-2 hover:bg-brand-orange-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isCurrentWeek}
              aria-label="Next week"
            >
              <ChevronRight className={`w-5 h-5 ${isCurrentWeek ? 'text-gray-400' : 'text-brand-orange-700'}`} />
            </button>
          </div>
        </div>

        {/* History View */}
        {showHistory && (
          <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 mb-6">
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-4">Review History</h2>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {allReviews.map((r) => (
                <button
                  key={r.id}
                  onClick={() => loadWeek(r.week_start_date)}
                  className={`w-full flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 sm:p-4 rounded-lg border transition-colors ${
                    r.week_start_date === currentWeekStart
                      ? 'bg-brand-orange-50 border-brand-orange-300'
                      : 'bg-white border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-3 mb-2 sm:mb-0">
                    <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600 flex-shrink-0" />
                    <span className="font-medium text-sm sm:text-base text-gray-900">
                      {formatDateRange(r.week_start_date, r.week_end_date)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 ml-7 sm:ml-0">
                    {r.week_rating && (
                      <div className="flex items-center gap-1">
                        <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                        <span className="text-sm font-medium text-gray-700">{r.week_rating}/10</span>
                      </div>
                    )}
                    {r.is_completed && (
                      <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full font-medium">
                        Complete
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Team Reviews Panel - For owners/admins */}
        {isOwnerOrAdmin && teamReviewStatus.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 mb-6">
            <button
              onClick={() => setShowTeamPanel(!showTeamPanel)}
              className="w-full flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-brand-orange-100 rounded-lg">
                  <Users className="w-4 h-4 sm:w-5 sm:h-5 text-brand-orange" />
                </div>
                <div className="text-left">
                  <h2 className="text-lg sm:text-xl font-bold text-gray-900">Team Reviews</h2>
                  <p className="text-xs sm:text-sm text-gray-500">
                    {teamReviewStatus.filter(m => m.isComplete).length} of {teamReviewStatus.length} complete
                  </p>
                </div>
              </div>
              {showTeamPanel ? (
                <ChevronUp className="w-5 h-5 text-gray-500" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-500" />
              )}
            </button>

            {showTeamPanel && (
              <div className="mt-4 space-y-2">
                {teamReviewStatus.map((member) => (
                  <div
                    key={member.userId}
                    className={`flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 sm:p-4 rounded-lg border transition-colors gap-3 ${
                      viewingTeamMemberId === member.userId
                        ? 'bg-brand-orange-50 border-brand-orange-300'
                        : member.userId === userId
                        ? 'bg-brand-orange-50 border-brand-orange-200'
                        : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm flex-shrink-0 ${
                        member.isComplete ? 'bg-green-500' : member.hasReview ? 'bg-amber-500' : 'bg-gray-400'
                      }`}>
                        {member.userName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-sm sm:text-base text-gray-900">
                          {member.userName}
                          {member.userId === userId && (
                            <span className="ml-2 text-xs text-brand-orange">(You)</span>
                          )}
                        </p>
                        <p className="text-xs text-gray-500 capitalize">{member.role}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3 flex-wrap ml-12 sm:ml-0">
                      {member.weekRating && (
                        <div className="flex items-center gap-1">
                          <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                          <span className="text-sm font-medium text-gray-700">{member.weekRating}/10</span>
                        </div>
                      )}
                      {member.isComplete ? (
                        <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full font-medium">
                          Complete
                        </span>
                      ) : member.hasReview ? (
                        <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs rounded-full font-medium">
                          In Progress
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full font-medium">
                          Not Started
                        </span>
                      )}
                      {member.hasReview && member.userId !== userId && (
                        <button
                          onClick={() => viewTeamMemberReview(member.userId)}
                          className={`p-2 rounded-lg transition-colors ${
                            viewingTeamMemberId === member.userId
                              ? 'bg-brand-orange text-white'
                              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                          }`}
                          title="View review"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      )}
                      {member.userId === userId && viewingTeamMemberId !== null && (
                        <button
                          onClick={() => setViewingTeamMemberId(null)}
                          className="px-3 py-1 bg-brand-orange text-white text-xs sm:text-sm rounded-lg hover:bg-brand-orange-600"
                        >
                          Back to My Review
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Viewing Other Team Member Banner */}
        {isViewingOther && (
          <div className="bg-brand-orange-50 border border-brand-orange-200 rounded-xl p-4 mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <User className="w-5 h-5 text-brand-orange" />
              <span className="font-medium text-sm sm:text-base text-brand-navy">
                Viewing {viewingMemberName}&apos;s review (read-only)
              </span>
            </div>
            <button
              onClick={() => setViewingTeamMemberId(null)}
              className="px-4 py-2 bg-brand-orange text-white text-sm font-medium rounded-lg hover:bg-brand-orange-600 w-full sm:w-auto"
            >
              Back to My Review
            </button>
          </div>
        )}

        {/* SECTION 1: LOOK BACK */}
        <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-amber-100 rounded-lg">
              <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600 rotate-180" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">Look Back</h2>
              <p className="text-xs sm:text-sm text-gray-500">Reflect on the past week</p>
            </div>
          </div>

          {/* Energy & Week Rating */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6">
            <div className="bg-brand-navy/5 rounded-xl p-4 sm:p-5">
              <label className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-brand-navy mb-3">
                <Zap className="w-4 h-4" />
                Energy Level (1-10)
              </label>
              <RatingButtons
                value={displayedReview?.energy_rating ?? null}
                onChange={(val) => !isViewingOther && updateReview({ energy_rating: val })}
                color="navy"
              />
            </div>

            <div className="bg-brand-orange/10 rounded-xl p-4 sm:p-5">
              <label className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-brand-orange-700 mb-3">
                <Star className="w-4 h-4" />
                Week Rating (1-10)
              </label>
              <RatingButtons
                value={displayedReview?.week_rating ?? null}
                onChange={(val) => !isViewingOther && updateReview({ week_rating: val })}
                color="orange"
              />
              <textarea
                value={displayedReview?.rating_reason || ''}
                onChange={(e) => !isViewingOther && updateReview({ rating_reason: e.target.value })}
                placeholder="Why did you give this rating?"
                disabled={isViewingOther}
                className="w-full mt-3 px-3 py-2 text-sm border border-brand-orange/30 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                rows={2}
              />
            </div>
          </div>

          {/* Wins & Challenges */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6">
            <div>
              <label className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-gray-700 mb-3">
                <Trophy className="w-4 h-4 text-green-600" />
                Wins & Highlights
              </label>
              <ListInput
                items={review.wins}
                onAdd={(item) => updateReview({ wins: [...review.wins, item] })}
                onRemove={(idx) => updateReview({ wins: review.wins.filter((_, i) => i !== idx) })}
                onUpdate={(idx, value) => updateReview({ wins: review.wins.map((w, i) => i === idx ? value : w) })}
                placeholder="What went well this week?"
                icon={Check}
                iconColor="text-green-600"
              />
            </div>

            <div>
              <label className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-gray-700 mb-3">
                <AlertTriangle className="w-4 h-4 text-brand-orange-600" />
                Challenges & Frustrations
              </label>
              <ListInput
                items={review.challenges}
                onAdd={(item) => updateReview({ challenges: [...review.challenges, item] })}
                onRemove={(idx) => updateReview({ challenges: review.challenges.filter((_, i) => i !== idx) })}
                onUpdate={(idx, value) => updateReview({ challenges: review.challenges.map((c, i) => i === idx ? value : c) })}
                placeholder="What was difficult?"
                icon={AlertTriangle}
                iconColor="text-brand-orange"
                addButtonColor="orange"
              />
            </div>
          </div>

          {/* Key Learning */}
          <div className="mb-6">
            <label className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-gray-700 mb-3">
              <Lightbulb className="w-4 h-4 text-yellow-600" />
              Key Learning
            </label>
            <textarea
              value={review.key_learning}
              onChange={(e) => updateReview({ key_learning: e.target.value })}
              placeholder="What was the most important thing you learned this week?"
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
              rows={2}
            />
          </div>

          {/* Weekly Checklist */}
          <div>
            <label className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-gray-700 mb-3">
              <CheckSquare className="w-4 h-4 text-brand-orange" />
              Weekly Checklist
            </label>
            <div className="space-y-2">
              {review.disciplines_completed.map((discipline, idx) => {
                const isDefault = DEFAULT_DISCIPLINES.includes(discipline.discipline)
                const is90DayPlan = discipline.discipline === '90 day plan reviewed'
                const isDashboard = discipline.discipline === 'Dashboard updated'

                return (
                  <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg group">
                    <input
                      type="checkbox"
                      checked={discipline.completed}
                      onChange={() => toggleDiscipline(idx)}
                      className="w-5 h-5 text-brand-orange rounded focus:ring-2 focus:ring-brand-orange"
                    />
                    {is90DayPlan ? (
                      <Link
                        href="/goals?step=5"
                        className={`flex-1 text-sm ${discipline.completed ? 'text-gray-500 line-through' : 'text-brand-orange hover:text-brand-orange-800'} underline`}
                      >
                        {discipline.discipline}
                      </Link>
                    ) : isDashboard ? (
                      <Link
                        href="/business-dashboard"
                        className={`flex-1 text-sm ${discipline.completed ? 'text-gray-500 line-through' : 'text-brand-orange hover:text-brand-orange-800'} underline`}
                      >
                        {discipline.discipline}
                      </Link>
                    ) : (
                      <span className={`flex-1 text-sm ${discipline.completed ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                        {discipline.discipline}
                      </span>
                    )}
                    {!isDefault && (
                      <button
                        onClick={() => removeDiscipline(idx)}
                        className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )
              })}
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="text"
                  value={newDiscipline}
                  onChange={(e) => setNewDiscipline(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addDiscipline()}
                  placeholder="+ Add custom item..."
                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                />
                <button
                  onClick={addDiscipline}
                  disabled={!newDiscipline.trim()}
                  className="px-3 py-2 bg-brand-orange text-white text-sm font-medium rounded-lg hover:bg-brand-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 2: ALIGN */}
        <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-brand-orange-100 rounded-lg">
              <Compass className="w-4 h-4 sm:w-5 sm:h-5 text-brand-orange" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">Align</h2>
              <p className="text-xs sm:text-sm text-gray-500">Check in with your 90-day plan</p>
            </div>
          </div>

          {/* 90-Day Financial Targets */}
          <div className="mb-6">
            <label className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-gray-700 mb-3">
              <DollarSign className="w-4 h-4 text-green-600" />
              90-Day Financial Targets
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <div className="bg-brand-teal-50 rounded-xl p-3 sm:p-4 text-center">
                <p className="text-xs text-brand-teal-700 font-medium mb-1">Revenue</p>
                <p className="text-base sm:text-lg font-bold text-brand-teal-800">{formatCurrency(quarterlyTargets.revenue)}</p>
              </div>
              <div className="bg-brand-orange-50 rounded-xl p-3 sm:p-4 text-center">
                <p className="text-xs text-brand-orange font-medium mb-1">Gross Profit</p>
                <p className="text-base sm:text-lg font-bold text-brand-orange-700">{formatCurrency(quarterlyTargets.grossProfit)}</p>
              </div>
              <div className="bg-brand-orange-50 rounded-xl p-3 sm:p-4 text-center">
                <p className="text-xs text-brand-orange font-medium mb-1">Net Profit</p>
                <p className="text-base sm:text-lg font-bold text-brand-orange-700">{formatCurrency(quarterlyTargets.netProfit)}</p>
              </div>
            </div>
            {!quarterlyTargets.revenue && (
              <p className="text-xs text-gray-500 mt-2">
                <Link href="/goals?step=5" className="text-brand-orange hover:underline">Set your 90-day targets</Link> to see them here.
              </p>
            )}
          </div>

          {/* Rocks Progress */}
          <div className="mb-6">
            <label className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-gray-700 mb-3">
              <Mountain className="w-4 h-4 text-brand-orange" />
              Rock Progress Check
            </label>
            {rocks.length === 0 ? (
              <div className="bg-gray-50 rounded-xl p-4 text-center">
                <p className="text-sm text-gray-500">
                  No rocks found for this quarter.{' '}
                  <Link href="/goals?step=5" className="text-brand-orange hover:underline">Add rocks</Link> in your 90-day plan.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {rocks.map((rock) => {
                  const progress = (review.rock_progress || []).find(rp => rp.rockId === rock.id)
                  return (
                    <div key={rock.id} className="border border-gray-200 rounded-xl p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="font-medium text-gray-900">{rock.title}</p>
                          {rock.owner && <p className="text-xs text-gray-500">Owner: {rock.owner}</p>}
                        </div>
                        <select
                          value={progress?.status || 'on_track'}
                          onChange={(e) => updateRockProgress(rock.id, { status: e.target.value as RockProgress['status'] })}
                          className={`text-sm px-3 py-1.5 rounded-lg border-0 font-medium ${
                            progress?.status === 'completed' ? 'bg-green-100 text-green-700' :
                            progress?.status === 'on_track' ? 'bg-brand-orange-100 text-brand-orange-700' :
                            progress?.status === 'at_risk' ? 'bg-amber-100 text-amber-700' :
                            'bg-red-100 text-red-700'
                          }`}
                        >
                          <option value="on_track">On Track</option>
                          <option value="at_risk">At Risk</option>
                          <option value="behind">Behind</option>
                          <option value="completed">Completed</option>
                        </select>
                      </div>
                      <textarea
                        value={progress?.progressNotes || ''}
                        onChange={(e) => updateRockProgress(rock.id, { progressNotes: e.target.value })}
                        placeholder="Progress notes..."
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent mb-2"
                        rows={2}
                      />
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={progress?.pivotNeeded || false}
                          onChange={(e) => updateRockProgress(rock.id, { pivotNeeded: e.target.checked })}
                          className="w-4 h-4 text-amber-600 rounded focus:ring-2 focus:ring-amber-500"
                        />
                        <label className="text-sm text-gray-600">Pivot needed?</label>
                      </div>
                      {progress?.pivotNeeded && (
                        <textarea
                          value={progress?.pivotNotes || ''}
                          onChange={(e) => updateRockProgress(rock.id, { pivotNotes: e.target.value })}
                          placeholder="Describe the pivot..."
                          className="w-full mt-2 px-3 py-2 text-sm border border-amber-200 bg-amber-50 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                          rows={2}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Alignment Notes */}
          <div>
            <label className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-gray-700 mb-3">
              <Target className="w-4 h-4 text-brand-orange" />
              Overall Alignment Notes
            </label>
            <textarea
              value={review.alignment_notes}
              onChange={(e) => updateReview({ alignment_notes: e.target.value })}
              placeholder="How aligned are you with your 90-day plan? Any strategic adjustments needed?"
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
              rows={2}
            />
          </div>
        </div>

        {/* SECTION 3: PLAN FORWARD */}
        <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-brand-orange-100 rounded-lg">
              <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 text-brand-orange" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">Plan Forward</h2>
              <p className="text-xs sm:text-sm text-gray-500">Set up for a successful week</p>
            </div>
          </div>

          {/* Last Week's Goals Review - only show if there are goals from last week */}
          {review.last_week_goals && review.last_week_goals.length > 0 && (
            <div className="mb-6 p-3 sm:p-4 bg-brand-navy/5 border border-brand-navy/20 rounded-xl">
              <label className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-brand-navy mb-3">
                <History className="w-4 h-4 text-brand-navy" />
                Last Week&apos;s Goals - Did you achieve them?
              </label>
              <div className="space-y-2">
                {review.last_week_goals.map((goal, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-3 bg-white rounded-lg">
                    <input
                      type="checkbox"
                      checked={goal.achieved}
                      onChange={() => {
                        const updatedGoals = [...review.last_week_goals]
                        updatedGoals[idx] = { ...goal, achieved: !goal.achieved }
                        updateReview({ last_week_goals: updatedGoals })
                      }}
                      className="w-5 h-5 text-brand-orange rounded focus:ring-2 focus:ring-brand-orange"
                    />
                    <span className={`flex-1 text-sm ${goal.achieved ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                      {goal.goal}
                    </span>
                    {goal.achieved ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <span className="text-xs text-brand-orange bg-brand-orange/10 px-2 py-0.5 rounded-full">Pending</span>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-xs text-brand-navy/70 mt-2">
                Incomplete goals will automatically carry forward to this week&apos;s priorities
              </p>
            </div>
          )}

          {/* Top 3 Priorities */}
          <div className="mb-6">
            <label className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-gray-700 mb-3">
              <Target className="w-4 h-4 text-brand-orange" />
              Top Priorities (connected to rocks)
            </label>
            <div className="space-y-2 mb-3">
              {(review.top_priorities || []).map((priority, idx) => {
                const linkedRock = rocks.find(r => r.id === priority.linkedRockId)
                const isEditing = editingPriorityId === priority.id
                return (
                  <div key={priority.id} className={`flex items-center gap-3 p-3 rounded-lg group ${priority.carriedForward ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50'}`}>
                    <input
                      type="checkbox"
                      checked={priority.completed}
                      onChange={() => toggleTopPriorityComplete(priority.id)}
                      className="w-5 h-5 text-brand-orange rounded focus:ring-2 focus:ring-brand-orange"
                      disabled={isEditing}
                    />
                    {isEditing ? (
                      <div className="flex-1 flex items-center gap-2">
                        <span className="font-semibold text-brand-orange">#{idx + 1}</span>
                        <input
                          type="text"
                          value={editingPriorityText}
                          onChange={(e) => setEditingPriorityText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEditingPriority()
                            if (e.key === 'Escape') cancelEditingPriority()
                          }}
                          autoFocus
                          className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-brand-orange"
                        />
                        {rocks.length > 0 && (
                          <select
                            value={editingPriorityRockId || ''}
                            onChange={(e) => setEditingPriorityRockId(e.target.value || undefined)}
                            className="px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-brand-orange"
                          >
                            <option value="">No rock</option>
                            {rocks.map(rock => (
                              <option key={rock.id} value={rock.id}>{rock.title}</option>
                            ))}
                          </select>
                        )}
                        <button onClick={saveEditingPriority} className="text-green-600 hover:text-green-700">
                          <Check className="w-4 h-4" />
                        </button>
                        <button onClick={cancelEditingPriority} className="text-gray-400 hover:text-gray-600">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <span
                          className={`flex-1 text-sm cursor-pointer hover:text-brand-orange ${priority.completed ? 'text-gray-500 line-through' : 'text-gray-900'}`}
                          onClick={() => startEditingPriority(priority)}
                          title="Click to edit"
                        >
                          <span className="font-semibold text-brand-orange mr-2">#{idx + 1}</span>
                          {priority.priority}
                          {priority.carriedForward && (
                            <span className="ml-2 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full inline-flex items-center gap-1">
                              <RotateCcw className="w-3 h-3" />
                              From last week
                            </span>
                          )}
                          {linkedRock && (
                            <span className="ml-2 px-2 py-0.5 bg-brand-orange-100 text-brand-orange-700 text-xs rounded-full">
                              {linkedRock.title}
                            </span>
                          )}
                        </span>
                        <button
                          onClick={() => removeTopPriority(priority.id)}
                          className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-brand-orange w-6">
                #{(review.top_priorities || []).length + 1}
              </span>
              <input
                type="text"
                value={newPriorityText}
                onChange={(e) => setNewPriorityText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddPriority()}
                placeholder="Add priority..."
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
              />
              {rocks.length > 0 && (
                <select
                  value={newPriorityRockId}
                  onChange={(e) => setNewPriorityRockId(e.target.value)}
                  className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                >
                  <option value="">Link to rock...</option>
                  {rocks.map(rock => (
                    <option key={rock.id} value={rock.id}>{rock.title}</option>
                  ))}
                </select>
              )}
              <button
                onClick={handleAddPriority}
                disabled={!newPriorityText.trim()}
                className="px-3 py-2 bg-brand-orange text-white text-sm font-medium rounded-lg hover:bg-brand-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add
              </button>
            </div>
          </div>

          {/* Other Priorities */}
          <div className="mb-6">
            <label className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-gray-700 mb-3">
              <CheckSquare className="w-4 h-4 text-gray-600" />
              Other Weekly Goals
            </label>
            <ListInput
              items={review.other_priorities || []}
              onAdd={(item) => updateReview({ other_priorities: [...(review.other_priorities || []), item] })}
              onRemove={(idx) => updateReview({ other_priorities: (review.other_priorities || []).filter((_, i) => i !== idx) })}
              onUpdate={(idx, value) => updateReview({ other_priorities: (review.other_priorities || []).map((p, i) => i === idx ? value : p) })}
              placeholder="Add other goals for this week..."
              icon={Check}
              iconColor="text-gray-500"
            />
          </div>

          {/* Important Dates */}
          <div className="mb-6">
            <label className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-gray-700 mb-3">
              <CalendarDays className="w-4 h-4 text-brand-navy" />
              Important Dates & Deadlines
            </label>
            <div className="space-y-2 mb-3">
              {(review.important_dates || []).map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 p-3 bg-brand-navy/5 rounded-lg group">
                  <Calendar className="w-4 h-4 text-brand-navy flex-shrink-0" />
                  {editingDateIdx === idx ? (
                    <>
                      <input
                        type="date"
                        value={editingDateValue}
                        onChange={(e) => setEditingDateValue(e.target.value)}
                        className="px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-brand-orange"
                      />
                      <input
                        type="text"
                        value={editingDateDescValue}
                        onChange={(e) => setEditingDateDescValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEditingDate()
                          if (e.key === 'Escape') cancelEditingDate()
                        }}
                        autoFocus
                        className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-brand-orange"
                      />
                      <button onClick={saveEditingDate} className="text-green-600 hover:text-green-700">
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={cancelEditingDate} className="text-gray-400 hover:text-gray-600">
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <span
                        className="font-medium text-sm text-gray-900 cursor-pointer hover:text-brand-orange"
                        onClick={() => startEditingDate(idx)}
                        title="Click to edit"
                      >
                        {item.date}
                      </span>
                      <span
                        className="text-sm text-gray-600 cursor-pointer hover:text-brand-orange"
                        onClick={() => startEditingDate(idx)}
                        title="Click to edit"
                      >
                        - {item.description}
                      </span>
                      <button
                        onClick={() => removeImportantDate(idx)}
                        className="ml-auto text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
              />
              <input
                type="text"
                value={newDateDesc}
                onChange={(e) => setNewDateDesc(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addImportantDate()}
                placeholder="Description..."
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
              />
              <button
                onClick={addImportantDate}
                disabled={!newDate || !newDateDesc.trim()}
                className="px-4 py-2 bg-brand-navy text-white text-sm font-medium rounded-lg hover:bg-brand-navy-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add
              </button>
            </div>
          </div>

          {/* Start/Stop Doing */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6">
            <div>
              <label className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-gray-700 mb-3">
                <TrendingUp className="w-4 h-4 text-green-600" />
                Start Doing
              </label>
              <ListInput
                items={review.start_doing}
                onAdd={(item) => updateReview({ start_doing: [...review.start_doing, item] })}
                onRemove={(idx) => updateReview({ start_doing: review.start_doing.filter((_, i) => i !== idx) })}
                onUpdate={(idx, value) => updateReview({ start_doing: review.start_doing.map((s, i) => i === idx ? value : s) })}
                placeholder="What should you start doing?"
                icon={TrendingUp}
                iconColor="text-green-600"
              />
            </div>

            <div>
              <label className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-gray-700 mb-3">
                <TrendingDown className="w-4 h-4 text-red-600" />
                Stop Doing
              </label>
              <ListInput
                items={review.stop_doing}
                onAdd={(item) => updateReview({ stop_doing: [...review.stop_doing, item] })}
                onRemove={(idx) => updateReview({ stop_doing: review.stop_doing.filter((_, i) => i !== idx) })}
                onUpdate={(idx, value) => updateReview({ stop_doing: review.stop_doing.map((s, i) => i === idx ? value : s) })}
                placeholder="What should you stop doing?"
                icon={TrendingDown}
                iconColor="text-red-600"
                addButtonColor="red"
              />
            </div>
          </div>

          {/* Questions for Coach */}
          <div>
            <label className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-gray-700 mb-3">
              <MessageCircle className="w-4 h-4 text-brand-orange" />
              Questions for Coach
            </label>
            <div className="space-y-2 mb-3">
              {(review.coach_questions || []).map((q, idx) => (
                <div key={idx} className="p-3 bg-brand-orange-50 rounded-lg group">
                  <div className="flex items-start justify-between">
                    <p className="text-sm text-gray-900">{q.question}</p>
                    <button
                      onClick={() => removeCoachQuestion(idx)}
                      className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity ml-2"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <span className={`inline-block mt-2 px-2 py-0.5 text-xs rounded-full font-medium ${
                    q.priority === 'high' ? 'bg-red-100 text-red-700' :
                    q.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-brand-orange-100 text-brand-orange-700'
                  }`}>
                    {q.priority.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <textarea
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                placeholder="What question do you have for your coach?"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                rows={2}
              />
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  {(['low', 'medium', 'high'] as const).map((priority) => (
                    <button
                      key={priority}
                      onClick={() => setNewQuestionPriority(priority)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        newQuestionPriority === priority
                          ? priority === 'high' ? 'bg-red-600 text-white' :
                            priority === 'medium' ? 'bg-yellow-500 text-white' :
                            'bg-brand-orange text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {priority.charAt(0).toUpperCase() + priority.slice(1)}
                    </button>
                  ))}
                </div>
                <button
                  onClick={addCoachQuestion}
                  disabled={!newQuestion.trim()}
                  className="px-4 py-1.5 bg-brand-orange text-white text-sm font-medium rounded-lg hover:bg-brand-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add Question
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Mark as Complete Button */}
        {!isViewingOther && (
          <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6">
            <button
              onClick={() => {
                const isCompleting = !review.is_completed
                updateReview({
                  is_completed: isCompleting,
                  completed_at: isCompleting ? new Date().toISOString() : undefined,
                  submitter_name: isCompleting ? currentUserName : review.submitter_name
                })
              }}
              className={`w-full py-3 sm:py-4 rounded-xl font-bold text-base sm:text-lg transition-colors ${
                review.is_completed
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-brand-orange text-white hover:bg-brand-orange-600'
              }`}
            >
              {review.is_completed ? '✓ Review Completed' : 'Mark as Complete'}
            </button>
          </div>
        )}

        {/* Read-only indicator when viewing other's review */}
        {isViewingOther && displayedReview && (
          <div className="bg-brand-orange-50 border border-brand-orange-200 rounded-xl p-4 sm:p-6 text-center">
            <p className="text-sm sm:text-base text-brand-navy font-medium">
              {displayedReview.is_completed
                ? `✓ ${viewingMemberName} completed this review`
                : `${viewingMemberName}'s review is in progress`
              }
            </p>
            <button
              onClick={() => setViewingTeamMemberId(null)}
              className="mt-4 px-6 py-2 bg-brand-orange text-white text-sm sm:text-base font-medium rounded-lg hover:bg-brand-orange-600"
            >
              Back to My Review
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
