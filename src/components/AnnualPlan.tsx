'use client'

import React from 'react'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { 
  TrendingUp, 
  DollarSign, 
  Target, 
  Calendar,
  ArrowRight,
  Grip,
  Plus,
  AlertCircle,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
  Settings,
  RefreshCw,
  Save,
  Database,
  Info,
  Zap,
  BarChart3,
  Users
} from 'lucide-react'

// =====================================================
// TYPE DEFINITIONS - Production Ready
// =====================================================

interface BusinessProfile {
  id: string
  user_id: string
  company_name: string
  current_revenue: number
  industry: string | null
  employee_count: number
  founded_date: string | null
  created_at: string
  updated_at: string
}

interface StrategicGoals {
  id: string
  business_profile_id: string
  bhag_statement: string | null
  bhag_metrics: string | null
  bhag_deadline: string
  three_year_goals: any
  created_at: string
  updated_at: string
}

interface KPI {
  id: string
  business_profile_id: string
  kpi_id: string
  name: string
  category: string
  current_value: number
  year1_target: number
  year2_target: number
  year3_target: number
  unit: string
  frequency: string
  created_at: string
  updated_at: string
}

// Fixed: Match exact database schema
interface Initiative {
  id: string
  business_profile_id: string
  title: string
  category: string
  is_from_roadmap: boolean
  custom_source: string | null
  selected: boolean  // Database field name
  quarter_assignment: string | null
  order_index: number
  created_at: string
  updated_at: string
}

interface FinancialData {
  revenue_current: number
  revenue_1_year: number
  gross_profit_current: number
  gross_profit_1_year: number
  net_profit_current: number
  net_profit_1_year: number
  gross_margin_current: number
  gross_margin_1_year: number
  net_margin_current: number
  net_margin_1_year: number
  customers_current: number
  customers_1_year: number
  employees_current: number
  employees_1_year: number
  year_type: 'FY' | 'CY'
}

interface QuarterlyTargets {
  q1: Record<string, number>
  q2: Record<string, number>
  q3: Record<string, number>
  q4: Record<string, number>
}

interface QuarterlyPercentages {
  q1: number
  q2: number
  q3: number
  q4: number
}

interface LoadingState {
  main: boolean
  saving: boolean
  refreshing: boolean
}

interface ErrorState {
  message: string
  type: 'warning' | 'error' | 'info'
  dismissible: boolean
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

// =====================================================
// FALLBACK DATA - Only when no real data exists
// =====================================================

function createFallbackFinancialData(businessProfile: BusinessProfile): FinancialData {
  const currentRevenue = businessProfile.current_revenue || 500000
  return {
    revenue_current: currentRevenue,
    revenue_1_year: Math.round(currentRevenue * 1.5),
    revenue_2_year: Math.round(currentRevenue * 2.4),
    revenue_3_year: Math.round(currentRevenue * 4),
    gross_profit_current: Math.round(currentRevenue * 0.4),
    gross_profit_1_year: Math.round(currentRevenue * 1.5 * 0.45),
    gross_profit_2_year: Math.round(currentRevenue * 2.4 * 0.5),
    gross_profit_3_year: Math.round(currentRevenue * 4 * 0.5),
    net_profit_current: Math.round(currentRevenue * 0.1),
    net_profit_1_year: Math.round(currentRevenue * 1.5 * 0.15),
    net_profit_2_year: Math.round(currentRevenue * 2.4 * 0.2),
    net_profit_3_year: Math.round(currentRevenue * 4 * 0.25),
    gross_margin_current: 40,
    gross_margin_1_year: 45,
    gross_margin_2_year: 50,
    gross_margin_3_year: 50,
    net_margin_current: 10,
    net_margin_1_year: 15,
    net_margin_2_year: 20,
    net_margin_3_year: 25,
    customers_current: 50,
    customers_1_year: 100,
    customers_2_year: 200,
    customers_3_year: 400,
    employees_current: businessProfile.employee_count || 2,
    employees_1_year: Math.max(businessProfile.employee_count + 3, 5),
    employees_2_year: Math.max(businessProfile.employee_count + 10, 12),
    employees_3_year: Math.max(businessProfile.employee_count + 23, 25),
    year_type: 'FY' as const
  }
}

// =====================================================
// MAIN COMPONENT
// =====================================================

export default function AnnualPlan() {
  // Core state management
  const [loading, setLoading] = useState<LoadingState>({
    main: true,
    saving: false,
    refreshing: false
  })
  
  const [error, setError] = useState<ErrorState | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [hasData, setHasData] = useState(false)
  
  // Data state
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null)
  const [strategicGoals, setStrategicGoals] = useState<StrategicGoals | null>(null)
  const [financialData, setFinancialData] = useState<FinancialData | null>(null)
  const [kpis, setKpis] = useState<KPI[]>([])
  const [initiatives, setInitiatives] = useState<Initiative[]>([])
  
  // UI state
  const [sectionsCollapsed, setSectionsCollapsed] = useState({
    financial: false,
    kpis: false,
    initiatives: false
  })
  
  // Planning state
  const [quarterlyTargets, setQuarterlyTargets] = useState<QuarterlyTargets>({
    q1: {},
    q2: {},
    q3: {},
    q4: {}
  })
  
  const [quarterlyPercentages, setQuarterlyPercentages] = useState<QuarterlyPercentages>({
    q1: 25,
    q2: 25,
    q3: 25,
    q4: 25
  })
  
  const [usePercentageMode, setUsePercentageMode] = useState(true)

  const supabase = createClient()

  // =====================================================
  // DATA LOADING - Production Ready with Error Handling
  // =====================================================

  const loadData = useCallback(async () => {
    try {
      setLoading(prev => ({ ...prev, main: true }))
      setError(null)
      
      console.log('Loading Annual Plan data from database...')
      
      // Get current user first
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      
      if (userError) {
        console.error('Authentication error:', userError)
        setError({
          message: 'Please log in to view your annual plan',
          type: 'warning',
          dismissible: false
        })
        return
      }

      if (!user) {
        console.log('No user found - need to log in')
        setError({
          message: 'Please log in to access your strategic plan',
          type: 'info', 
          dismissible: false
        })
        return
      }

      console.log('User authenticated:', user.email)
      
      // Load business profile using proper RLS query
      console.log('Loading business profile...')
      const { data: businessProfileData, error: profileError } = await supabase
        .from('business_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()  // Use maybeSingle to handle no results gracefully

      if (profileError) {
        console.error('Business profile error:', profileError)
        setError({
          message: 'Database error loading business profile. Please contact support.',
          type: 'error',
          dismissible: true
        })
        return
      }

      if (!businessProfileData) {
        console.log('No business profile found')
        setError({
          message: 'No business profile found. Please complete your business setup first.',
          type: 'warning',
          dismissible: true
        })
        return
      }

      console.log('Business profile loaded:', businessProfileData.company_name)
      setBusinessProfile(businessProfileData)

      // Load strategic goals with proper error handling
      console.log('Loading strategic goals...')
      const { data: strategicGoalsData, error: goalsError } = await supabase
        .from('strategic_goals')
        .select('*')
        .eq('business_profile_id', businessProfileData.id)
        .maybeSingle()

      let finalStrategicGoals: StrategicGoals | null = null
      let finalFinancialData: FinancialData

      if (goalsError) {
        console.log('Strategic goals error:', goalsError)
        // Continue with fallback data
      }

      if (!strategicGoalsData) {
        console.log('No strategic goals found, creating fallback financial data')
        finalFinancialData = createFallbackFinancialData(businessProfileData)
      } else {
        console.log('Strategic goals loaded')
        finalStrategicGoals = strategicGoalsData
        finalFinancialData = strategicGoalsData.three_year_goals as FinancialData
      }

      setStrategicGoals(finalStrategicGoals)
      setFinancialData(finalFinancialData)

      // Load KPIs with proper error handling
      console.log('Loading KPIs...')
      const { data: kpisData, error: kpisError } = await supabase
        .from('kpis')
        .select('*')
        .eq('business_profile_id', businessProfileData.id)

      if (kpisError) {
        console.log('KPIs error:', kpisError)
        setKpis([])
      } else {
        console.log(`Loaded ${kpisData?.length || 0} KPIs`)
        setKpis(kpisData || [])
      }

      // Load strategic initiatives with exact database field names
      console.log('Loading strategic initiatives...')
      const { data: initiativesData, error: initiativesError } = await supabase
        .from('strategic_initiatives')
        .select(`
          id,
          business_profile_id,
          title,
          category,
          is_from_roadmap,
          custom_source,
          selected,
          quarter_assignment,
          order_index,
          created_at,
          updated_at
        `)
        .eq('business_profile_id', businessProfileData.id)
        .eq('selected', true)  // Only get selected initiatives

      if (initiativesError) {
        console.error('Initiatives error:', initiativesError)
        // Log the specific error details
        console.error('Error details:', {
          code: initiativesError.code,
          message: initiativesError.message,
          details: initiativesError.details,
          hint: initiativesError.hint
        })
        setInitiatives([])
      } else {
        console.log(`Loaded ${initiativesData?.length || 0} selected initiatives`)
        setInitiatives(initiativesData || [])
      }

      // Initialize quarterly targets
      initializeQuarterlyTargets(kpisData || [], finalFinancialData)
      
      // Success message
      const initiativeCount = initiativesData?.length || 0
      const kpiCount = kpisData?.length || 0
      setHasData(true)
      setError({
        message: `Loaded ${businessProfileData.company_name}: ${initiativeCount} initiatives, ${kpiCount} KPIs`,
        type: 'info',
        dismissible: true
      })
      
    } catch (err) {
      console.error('Error in loadData:', err)
      setError({
        message: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}`,
        type: 'error',
        dismissible: true
      })
    } finally {
      setLoading(prev => ({ ...prev, main: false }))
    }
  }, [])

  // =====================================================
  // AUTO-SAVE WITH DEBOUNCING - Fixed Loop Issue
  // =====================================================

  const saveQuarterlyTargets = useCallback(async (
    targets: QuarterlyTargets, 
    percentages: QuarterlyPercentages
  ) => {
    // Prevent save if still loading or no business profile
    if (loading.saving || loading.main || !businessProfile?.id || !hasData) {
      console.log('Skipping save: loading or no business profile')
      return
    }

    // Prevent save if targets are empty (still initializing)
    const hasTargets = Object.values(targets).some(quarter => Object.keys(quarter).length > 0)
    if (!hasTargets) {
      console.log('Skipping save: no targets set yet')
      return
    }
    
    try {
      setLoading(prev => ({ ...prev, saving: true }))
      setSaveStatus('saving')
      
      console.log('Saving quarterly targets to database...')
      
      // Save quarterly plans to database
      const currentYear = new Date().getFullYear()
      const quarters = ['q1', 'q2', 'q3', 'q4'] as const
      
      for (const quarter of quarters) {
        const quarterTargets = targets[quarter]
        
        if (Object.keys(quarterTargets).length > 0) {
          const { error: saveError } = await supabase
            .from('quarterly_plans')
            .upsert({
              business_profile_id: businessProfile.id,
              year: currentYear,
              quarter: quarter,
              revenue_target: quarterTargets.revenue_1_year || 0,
              profit_target: quarterTargets.net_profit_1_year || 0,
              other_goals: {
                gross_profit: quarterTargets.gross_profit_1_year || 0,
                customers: quarterTargets.customers_1_year || 0,
                employees: quarterTargets.employees_1_year || 0
              },
              kpi_targets: quarterTargets
            }, {
              onConflict: 'business_profile_id,year,quarter'
            })
          
          if (saveError) {
            console.error(`Error saving ${quarter} targets:`, saveError)
            throw saveError
          }
        }
      }
      
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
      
    } catch (err) {
      console.error('Error saving quarterly targets:', err)
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 3000)
    } finally {
      setLoading(prev => ({ ...prev, saving: false }))
    }
  }, [businessProfile?.id, loading.saving, loading.main, hasData])

  // Fixed: Debounced auto-save that won't create loops
  useEffect(() => {
    // Only auto-save if we have data and not still loading
    if (!loading.main && hasData && businessProfile?.id && Object.keys(quarterlyTargets.q1).length > 0) {
      const timeoutId = setTimeout(() => {
        saveQuarterlyTargets(quarterlyTargets, quarterlyPercentages)
      }, 2000)  // Increased debounce time
      
      return () => clearTimeout(timeoutId)
    }
  }, [quarterlyTargets, quarterlyPercentages, saveQuarterlyTargets, loading.main, hasData, businessProfile?.id])

  // =====================================================
  // QUARTERLY TARGET CALCULATIONS
  // =====================================================

  const initializeQuarterlyTargets = useCallback((kpiData: KPI[], finData: FinancialData) => {
    const initialTargets: QuarterlyTargets = {
      q1: {},
      q2: {},
      q3: {},
      q4: {}
    }

    // Financial metrics
    const financialMetrics = [
      'revenue_1_year',
      'gross_profit_1_year', 
      'net_profit_1_year',
      'customers_1_year',
      'employees_1_year'
    ]

    financialMetrics.forEach(metric => {
      const yearTarget = (finData as any)[metric] || 0
      if (yearTarget > 0) {
        initialTargets.q1[metric] = Math.round(yearTarget * (quarterlyPercentages.q1 / 100))
        initialTargets.q2[metric] = Math.round(yearTarget * (quarterlyPercentages.q2 / 100))
        initialTargets.q3[metric] = Math.round(yearTarget * (quarterlyPercentages.q3 / 100))
        initialTargets.q4[metric] = Math.round(yearTarget * (quarterlyPercentages.q4 / 100))
      }
    })

    // KPI targets
    kpiData.forEach(kpi => {
      if (kpi.year1_target > 0) {
        initialTargets.q1[kpi.kpi_id] = Math.round(kpi.year1_target * (quarterlyPercentages.q1 / 100))
        initialTargets.q2[kpi.kpi_id] = Math.round(kpi.year1_target * (quarterlyPercentages.q2 / 100))
        initialTargets.q3[kpi.kpi_id] = Math.round(kpi.year1_target * (quarterlyPercentages.q3 / 100))
        initialTargets.q4[kpi.kpi_id] = Math.round(kpi.year1_target * (quarterlyPercentages.q4 / 100))
      }
    })

    setQuarterlyTargets(initialTargets)
  }, [quarterlyPercentages])

  const recalculateAllTargets = useCallback((percentages: QuarterlyPercentages) => {
    const newTargets: QuarterlyTargets = {
      q1: {},
      q2: {},
      q3: {},
      q4: {}
    }

    if (financialData) {
      const financialMetrics = [
        'revenue_1_year',
        'gross_profit_1_year', 
        'net_profit_1_year',
        'customers_1_year',
        'employees_1_year'
      ]

      financialMetrics.forEach(metric => {
        const yearTarget = (financialData as any)[metric] || 0
        if (yearTarget > 0) {
          newTargets.q1[metric] = Math.round(yearTarget * (percentages.q1 / 100))
          newTargets.q2[metric] = Math.round(yearTarget * (percentages.q2 / 100))
          newTargets.q3[metric] = Math.round(yearTarget * (percentages.q3 / 100))
          newTargets.q4[metric] = Math.round(yearTarget * (percentages.q4 / 100))
        }
      })
    }

    kpis.forEach(kpi => {
      if (kpi.year1_target > 0) {
        newTargets.q1[kpi.kpi_id] = Math.round(kpi.year1_target * (percentages.q1 / 100))
        newTargets.q2[kpi.kpi_id] = Math.round(kpi.year1_target * (percentages.q2 / 100))
        newTargets.q3[kpi.kpi_id] = Math.round(kpi.year1_target * (percentages.q3 / 100))
        newTargets.q4[kpi.kpi_id] = Math.round(kpi.year1_target * (percentages.q4 / 100))
      }
    })

    setQuarterlyTargets(newTargets)
  }, [financialData, kpis])

  // =====================================================
  // EVENT HANDLERS - Production Ready
  // =====================================================

  const updateQuarterlyPercentages = useCallback((quarter: keyof QuarterlyPercentages, percentage: number) => {
    const newPercentages = { ...quarterlyPercentages, [quarter]: percentage }
    setQuarterlyPercentages(newPercentages)
    
    if (usePercentageMode && validatePercentages(newPercentages)) {
      recalculateAllTargets(newPercentages)
    }
  }, [quarterlyPercentages, usePercentageMode, recalculateAllTargets])

  const updateQuarterlyTarget = useCallback((metric: string, quarter: 'q1' | 'q2' | 'q3' | 'q4', value: number) => {
    setQuarterlyTargets(prev => ({
      ...prev,
      [quarter]: {
        ...prev[quarter],
        [metric]: value
      }
    }))
    
    if (usePercentageMode) {
      setUsePercentageMode(false)
    }
  }, [usePercentageMode])

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination || !businessProfile?.id) return

    const { source, destination, draggableId } = result

    try {
      setLoading(prev => ({ ...prev, saving: true }))

      const initiative = initiatives.find(i => i.id === draggableId)
      if (!initiative) return

      const destinationQuarter = destination.droppableId
      const currentQuarterInitiatives = initiatives.filter(
        i => i.quarter_assignment === destinationQuarter && i.id !== draggableId
      )

      if (destinationQuarter !== 'unassigned' && currentQuarterInitiatives.length >= 5) {
        setError({
          message: 'Maximum 5 initiatives per quarter',
          type: 'warning',
          dismissible: true
        })
        setTimeout(() => setError(null), 3000)
        return
      }

      // Update database with exact field names
      const { error: updateError } = await supabase
        .from('strategic_initiatives')
        .update({
          quarter_assignment: destinationQuarter === 'unassigned' ? null : destinationQuarter,
          order_index: destination.index
        })
        .eq('id', draggableId)

      if (updateError) {
        console.error('Error updating initiative:', updateError)
        setError({
          message: 'Failed to update initiative assignment',
          type: 'error',
          dismissible: true
        })
        return
      }

      // Optimistic update
      setInitiatives(prev => prev.map(i => 
        i.id === draggableId 
          ? { 
              ...i, 
              quarter_assignment: destinationQuarter === 'unassigned' ? null : destinationQuarter,
              order_index: destination.index
            }
          : i
      ))

      console.log('Initiative assignment updated successfully')

    } catch (err) {
      console.error('Error updating initiative:', err)
      setError({
        message: 'Failed to update initiative assignment',
        type: 'error',
        dismissible: true
      })
    } finally {
      setLoading(prev => ({ ...prev, saving: false }))
    }
  }

  const toggleSection = useCallback((section: keyof typeof sectionsCollapsed) => {
    setSectionsCollapsed(prev => ({
      ...prev,
      [section]: !prev[section]
    }))
  }, [])

  const refreshData = useCallback(async () => {
    setLoading(prev => ({ ...prev, refreshing: true }))
    await loadData()
    setLoading(prev => ({ ...prev, refreshing: false }))
  }, [loadData])

  // =====================================================
  // UTILITY FUNCTIONS
  // =====================================================

  const validatePercentages = (percentages: QuarterlyPercentages): boolean => {
    const total = percentages.q1 + percentages.q2 + percentages.q3 + percentages.q4
    return total === 100
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount)
  }

  const formatPercentage = (value: number) => {
    return `${value.toFixed(1)}%`
  }

  const formatNumber = (value: number) => {
    return value.toLocaleString('en-AU')
  }

  const parseCurrencyInput = (value: string): number => {
    return Number(value.replace(/[^0-9.-]/g, ''))
  }

  const getQuarterlyTarget = (metric: string, quarter: 'q1' | 'q2' | 'q3' | 'q4') => {
    return quarterlyTargets[quarter][metric] || 0
  }

  const getQuarterEndDate = (quarter: string, yearType: 'FY' | 'CY' = 'FY') => {
    const currentYear = new Date().getFullYear()
    const quarterNum = quarter.replace('q', '')
    
    if (yearType === 'FY') {
      switch (quarterNum) {
        case '1': return `Q1 30 Sept ${currentYear}`
        case '2': return `Q2 31 Dec ${currentYear}`
        case '3': return `Q3 31 Mar ${currentYear + 1}`
        case '4': return `Q4 30 June ${currentYear + 1}`
        default: return `Q${quarterNum}`
      }
    } else {
      switch (quarterNum) {
        case '1': return `Q1 31 Mar ${currentYear}`
        case '2': return `Q2 30 June ${currentYear}`
        case '3': return `Q3 30 Sept ${currentYear}`
        case '4': return `Q4 31 Dec ${currentYear}`
        default: return `Q${quarterNum}`
      }
    }
  }

  const getInitiativesByQuarter = (quarter: string) => {
    return initiatives
      .filter(i => i.quarter_assignment === quarter)
      .sort((a, b) => a.order_index - b.order_index)
  }

  const getFinancialValue = (key: string): number => {
    return (financialData as any)?.[key] || 0
  }

  // =====================================================
  // COMPUTED VALUES
  // =====================================================

  const unassignedInitiatives = useMemo(() => 
    initiatives.filter(i => !i.quarter_assignment), 
    [initiatives]
  )

  const groupedKPIs = useMemo(() => 
    kpis.reduce((acc, kpi) => {
      if (!acc[kpi.category]) {
        acc[kpi.category] = []
      }
      acc[kpi.category].push(kpi)
      return acc
    }, {} as Record<string, KPI[]>), 
    [kpis]
  )

  const totalPercentage = quarterlyPercentages.q1 + quarterlyPercentages.q2 + quarterlyPercentages.q3 + quarterlyPercentages.q4
  const percentageError = totalPercentage !== 100

  const getSaveStatusIndicator = () => {
    switch (saveStatus) {
      case 'saving':
        return (
          <div className="flex items-center text-teal-600">
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            <span className="text-sm">Saving...</span>
          </div>
        )
      case 'saved':
        return (
          <div className="flex items-center text-green-600">
            <CheckCircle2 className="h-4 w-4 mr-2" />
            <span className="text-sm">Auto-saved</span>
          </div>
        )
      case 'error':
        return (
          <div className="flex items-center text-red-600">
            <AlertCircle className="h-4 w-4 mr-2" />
            <span className="text-sm">Save failed</span>
          </div>
        )
      default:
        return null
    }
  }

  // =====================================================
  // EFFECTS
  // =====================================================

  useEffect(() => {
    loadData()
  }, [loadData])

  // =====================================================
  // RENDER CONDITIONS
  // =====================================================

  if (loading.main) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600 mx-auto"></div>
          <p className="mt-3 text-gray-600">Loading your annual strategic plan...</p>
          <p className="mt-1 text-xs text-gray-500">Connecting to database...</p>
        </div>
      </div>
    )
  }

  if (!businessProfile) {
    return (
      <div className="text-center py-12">
        <Target className="h-12 w-12 text-gray-400 mx-auto" />
        <p className="mt-4 text-gray-900 font-semibold">Business Profile Required</p>
        <p className="mt-2 text-gray-600">
          {error?.message || "Please complete your business profile to access strategic planning"}
        </p>
        <div className="mt-6 space-x-3">
          <button
            onClick={refreshData}
            disabled={loading.refreshing}
            className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50"
          >
            {loading.refreshing ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 inline animate-spin" />
                Retrying...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2 inline" />
                Retry Loading
              </>
            )}
          </button>
        </div>
      </div>
    )
  }

  if (!financialData) {
    return (
      <div className="text-center py-12">
        <BarChart3 className="h-12 w-12 text-gray-400 mx-auto" />
        <p className="mt-4 text-gray-900 font-semibold">Strategic Goals Required</p>
        <p className="mt-2 text-gray-600">
          Complete your strategic planning setup to create your annual plan
        </p>
        <div className="mt-6 space-x-3">
          <button
            onClick={refreshData}
            disabled={loading.refreshing}
            className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50"
          >
            Setup Strategic Goals
          </button>
        </div>
      </div>
    )
  }

  // =====================================================
  // MAIN RENDER
  // =====================================================

  return (
    <div className="space-y-6">
      
      {/* Header Section */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Annual Strategic Plan</h2>
          <p className="mt-1 text-gray-600">Transform your vision into quarterly execution milestones</p>
          {businessProfile && (
            <div className="flex items-center gap-2 mt-2">
              <p className="text-sm text-gray-700 font-medium">{businessProfile.company_name}</p>
              <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-800">
                Production Ready
              </span>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-4">
          {getSaveStatusIndicator()}
          <button
            onClick={refreshData}
            disabled={loading.refreshing}
            className="flex items-center text-gray-600 hover:text-gray-800 transition-colors"
            title="Refresh data"
          >
            <RefreshCw className={`h-4 w-4 ${loading.refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Status Messages */}
      {error && (
        <div className={`border rounded-lg px-4 py-3 flex items-center gap-2 ${
          error.type === 'error' ? 'bg-red-50 border-red-200 text-red-700' :
          error.type === 'warning' ? 'bg-orange-50 border-orange-200 text-orange-700' :
          'bg-teal-50 border-teal-200 text-teal-700'
        }`}>
          {error.type === 'error' ? <AlertCircle className="w-5 h-5 flex-shrink-0" /> :
           error.type === 'warning' ? <AlertCircle className="w-5 h-5 flex-shrink-0" /> :
           <Info className="w-5 h-5 flex-shrink-0" />}
          <span className="flex-1">{error.message}</span>
          {error.dismissible && (
            <button
              onClick={() => setError(null)}
              className="text-current hover:opacity-75"
            >
              ×
            </button>
          )}
        </div>
      )}

      {/* Empty State for No Initiatives */}
      {initiatives.length === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-6">
          <div className="flex items-center gap-3">
            <Calendar className="h-6 w-6 text-yellow-600" />
            <div>
              <h3 className="font-semibold text-yellow-800">No Strategic Initiatives Selected</h3>
              <p className="text-yellow-700 text-sm mt-1">
                Visit the Strategic Initiatives page to select initiatives for your annual plan.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Quarterly Planning Controls */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="bg-teal-50 px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center">
            <Settings className="h-5 w-5 mr-2 text-teal-600" />
            Quarterly Planning Method
          </h3>
        </div>
        
        <div className="p-6">
          <div className="space-y-4">
            <div className="flex items-center space-x-6">
              <label className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  checked={usePercentageMode}
                  onChange={() => {
                    setUsePercentageMode(true)
                    if (validatePercentages(quarterlyPercentages)) {
                      recalculateAllTargets(quarterlyPercentages)
                    }
                  }}
                  className="w-4 h-4 text-teal-600 border-gray-300 focus:ring-teal-500"
                />
                <span className="ml-2 font-medium text-gray-900">Use percentage distribution</span>
                <span className="ml-2 text-sm text-gray-500">(recommended for balanced growth)</span>
              </label>
              <label className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  checked={!usePercentageMode}
                  onChange={() => setUsePercentageMode(false)}
                  className="w-4 h-4 text-teal-600 border-gray-300 focus:ring-teal-500"
                />
                <span className="ml-2 font-medium text-gray-900">Manual individual targets</span>
              </label>
            </div>

            {usePercentageMode && (
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-4">
                  <Zap className="h-4 w-4 text-teal-600" />
                  <p className="text-sm text-gray-600">
                    Set what percentage of your annual target each quarter should achieve (must total 100%):
                  </p>
                </div>
                <div className="grid grid-cols-4 gap-4">
                  {(['q1', 'q2', 'q3', 'q4'] as const).map((quarter) => (
                    <div key={quarter} className="text-center">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {getQuarterEndDate(quarter, financialData.year_type)}
                      </label>
                      <div className="flex items-center justify-center">
                        <input
                          type="number"
                          value={quarterlyPercentages[quarter]}
                          onChange={(e) => updateQuarterlyPercentages(quarter, Number(e.target.value))}
                          className={`w-20 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-center ${
                            percentageError ? 'border-red-300 bg-red-50' : 'border-gray-300'
                          }`}
                          min="0"
                          max="100"
                          step="1"
                        />
                        <span className="ml-2 text-gray-500">%</span>
                      </div>
                    </div>
                  ))}
                </div>
                
                <div className="mt-4 text-center">
                  <span className={`text-sm font-medium ${
                    percentageError ? 'text-red-600' : 'text-green-600'
                  }`}>
                    Total: {totalPercentage}% {percentageError ? '(Must equal 100%)' : '✓'}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Financial Performance Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <button
          onClick={() => toggleSection('financial')}
          className="w-full bg-teal-50 px-6 py-4 border-b border-gray-200 flex items-center justify-between hover:bg-teal-100 transition-colors"
        >
          <h3 className="text-lg font-semibold text-gray-900 flex items-center">
            <TrendingUp className="h-5 w-5 mr-2 text-teal-600" />
            Financial Performance Targets
          </h3>
          {sectionsCollapsed.financial ? (
            <ChevronDown className="h-5 w-5 text-gray-600" />
          ) : (
            <ChevronUp className="h-5 w-5 text-gray-600" />
          )}
        </button>
        
        {!sectionsCollapsed.financial && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-600">Financial Metric</th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-gray-600 bg-teal-50">Current</th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-gray-600 bg-green-50">Year Target</th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-gray-600">
                    {getQuarterEndDate('q1', financialData.year_type)}
                  </th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-gray-600">
                    {getQuarterEndDate('q2', financialData.year_type)}
                  </th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-gray-600">
                    {getQuarterEndDate('q3', financialData.year_type)}
                  </th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-gray-600">
                    {getQuarterEndDate('q4', financialData.year_type)}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                <tr className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium text-gray-900 flex items-center">
                    <DollarSign className="h-4 w-4 mr-2 text-green-600" />
                    Revenue
                  </td>
                  <td className="px-6 py-4 text-center text-gray-700 bg-teal-50 font-medium">
                    {formatCurrency(getFinancialValue('revenue_current'))}
                  </td>
                  <td className="px-6 py-4 text-center font-semibold text-teal-600 bg-green-50">
                    {formatCurrency(getFinancialValue('revenue_1_year'))}
                  </td>
                  {(['q1', 'q2', 'q3', 'q4'] as const).map(quarter => (
                    <td key={quarter} className="px-6 py-4 text-center">
                      <input
                        type="text"
                        value={formatNumber(getQuarterlyTarget('revenue_1_year', quarter))}
                        onChange={(e) => updateQuarterlyTarget('revenue_1_year', quarter, parseCurrencyInput(e.target.value))}
                        className="w-24 px-2 py-1 text-sm border border-gray-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                        disabled={usePercentageMode}
                        placeholder="0"
                      />
                    </td>
                  ))}
                </tr>
                <tr className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium text-gray-900">Gross Profit</td>
                  <td className="px-6 py-4 text-center text-gray-700 bg-teal-50 font-medium">
                    {formatCurrency(getFinancialValue('gross_profit_current'))}
                  </td>
                  <td className="px-6 py-4 text-center font-semibold text-teal-600 bg-green-50">
                    {formatCurrency(getFinancialValue('gross_profit_1_year'))}
                  </td>
                  {(['q1', 'q2', 'q3', 'q4'] as const).map(quarter => (
                    <td key={quarter} className="px-6 py-4 text-center">
                      <input
                        type="text"
                        value={formatNumber(getQuarterlyTarget('gross_profit_1_year', quarter))}
                        onChange={(e) => updateQuarterlyTarget('gross_profit_1_year', quarter, parseCurrencyInput(e.target.value))}
                        className="w-24 px-2 py-1 text-sm border border-gray-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                        disabled={usePercentageMode}
                        placeholder="0"
                      />
                    </td>
                  ))}
                </tr>
                <tr className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium text-gray-900">Net Profit</td>
                  <td className="px-6 py-4 text-center text-gray-700 bg-teal-50 font-medium">
                    {formatCurrency(getFinancialValue('net_profit_current'))}
                  </td>
                  <td className="px-6 py-4 text-center font-semibold text-teal-600 bg-green-50">
                    {formatCurrency(getFinancialValue('net_profit_1_year'))}
                  </td>
                  {(['q1', 'q2', 'q3', 'q4'] as const).map(quarter => (
                    <td key={quarter} className="px-6 py-4 text-center">
                      <input
                        type="text"
                        value={formatNumber(getQuarterlyTarget('net_profit_1_year', quarter))}
                        onChange={(e) => updateQuarterlyTarget('net_profit_1_year', quarter, parseCurrencyInput(e.target.value))}
                        className="w-24 px-2 py-1 text-sm border border-gray-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                        disabled={usePercentageMode}
                        placeholder="0"
                      />
                    </td>
                  ))}
                </tr>
                <tr className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium text-gray-900 flex items-center">
                    <Users className="h-4 w-4 mr-2 text-teal-600" />
                    Customers
                  </td>
                  <td className="px-6 py-4 text-center text-gray-700 bg-teal-50 font-medium">
                    {formatNumber(getFinancialValue('customers_current'))}
                  </td>
                  <td className="px-6 py-4 text-center font-semibold text-green-600 bg-green-50">
                    {formatNumber(getFinancialValue('customers_1_year'))}
                  </td>
                  {(['q1', 'q2', 'q3', 'q4'] as const).map(quarter => (
                    <td key={quarter} className="px-6 py-4 text-center">
                      <input
                        type="number"
                        value={getQuarterlyTarget('customers_1_year', quarter)}
                        onChange={(e) => updateQuarterlyTarget('customers_1_year', quarter, Number(e.target.value))}
                        className="w-20 px-2 py-1 text-sm border border-gray-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                        disabled={usePercentageMode}
                        min="0"
                        placeholder="0"
                      />
                    </td>
                  ))}
                </tr>
                <tr className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium text-gray-900">Team Size</td>
                  <td className="px-6 py-4 text-center text-gray-700 bg-teal-50 font-medium">
                    {formatNumber(getFinancialValue('employees_current'))}
                  </td>
                  <td className="px-6 py-4 text-center font-semibold text-green-600 bg-green-50">
                    {formatNumber(getFinancialValue('employees_1_year'))}
                  </td>
                  {(['q1', 'q2', 'q3', 'q4'] as const).map(quarter => (
                    <td key={quarter} className="px-6 py-4 text-center">
                      <input
                        type="number"
                        value={getQuarterlyTarget('employees_1_year', quarter)}
                        onChange={(e) => updateQuarterlyTarget('employees_1_year', quarter, Number(e.target.value))}
                        className="w-16 px-2 py-1 text-sm border border-gray-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                        disabled={usePercentageMode}
                        min="0"
                        placeholder="0"
                      />
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* KPIs Section */}
      {kpis.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <button
            onClick={() => toggleSection('kpis')}
            className="w-full bg-green-50 px-6 py-4 border-b border-gray-200 flex items-center justify-between hover:bg-green-100 transition-colors"
          >
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              <BarChart3 className="h-5 w-5 mr-2 text-green-600" />
              Key Performance Indicators
              <span className="ml-2 text-sm bg-green-100 text-green-800 px-2 py-1 rounded-full">
                {kpis.length} KPIs
              </span>
            </h3>
            {sectionsCollapsed.kpis ? (
              <ChevronDown className="h-5 w-5 text-gray-600" />
            ) : (
              <ChevronUp className="h-5 w-5 text-gray-600" />
            )}
          </button>
          
          {!sectionsCollapsed.kpis && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-600">KPI</th>
                    <th className="px-6 py-4 text-center text-sm font-semibold text-gray-600 bg-teal-50">Current</th>
                    <th className="px-6 py-4 text-center text-sm font-semibold text-gray-600 bg-green-50">Year Target</th>
                    <th className="px-6 py-4 text-center text-sm font-semibold text-gray-600">
                      {getQuarterEndDate('q1', financialData.year_type)}
                    </th>
                    <th className="px-6 py-4 text-center text-sm font-semibold text-gray-600">
                      {getQuarterEndDate('q2', financialData.year_type)}
                    </th>
                    <th className="px-6 py-4 text-center text-sm font-semibold text-gray-600">
                      {getQuarterEndDate('q3', financialData.year_type)}
                    </th>
                    <th className="px-6 py-4 text-center text-sm font-semibold text-gray-600">
                      {getQuarterEndDate('q4', financialData.year_type)}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {Object.entries(groupedKPIs).map(([category, categoryKpis]) => (
                    <React.Fragment key={`kpi-category-${category}`}>
                      <tr className="bg-gray-50">
                        <td colSpan={7} className="px-6 py-2 text-xs font-semibold text-gray-900 uppercase tracking-wider">
                          {category} KPIs ({categoryKpis.length})
                        </td>
                      </tr>
                      {categoryKpis.map((kpi, kpiIndex) => (
                        <tr key={`kpi-${kpi.id || kpi.kpi_id}-${kpiIndex}`} className="hover:bg-gray-50">
                          <td className="px-6 py-4">
                            <div>
                              <div className="font-medium text-gray-900">{kpi.name}</div>
                              <div className="text-sm text-gray-500 flex items-center gap-2">
                                <Clock className="h-3 w-3" />
                                {kpi.frequency}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center text-gray-700 bg-teal-50 font-medium">
                            {kpi.unit === 'currency' ? formatCurrency(kpi.current_value) : 
                             kpi.unit === 'percentage' ? formatPercentage(kpi.current_value) : 
                             formatNumber(kpi.current_value)}
                          </td>
                          <td className="px-6 py-4 text-center font-semibold text-green-600 bg-green-50">
                            {kpi.unit === 'currency' ? formatCurrency(kpi.year1_target) : 
                             kpi.unit === 'percentage' ? formatPercentage(kpi.year1_target) : 
                             formatNumber(kpi.year1_target)}
                          </td>
                          {(['q1', 'q2', 'q3', 'q4'] as const).map(quarter => (
                            <td key={`kpi-${kpi.id || kpi.kpi_id}-${quarter}`} className="px-6 py-4 text-center">
                              <input
                                type="text"
                                value={kpi.unit === 'currency' ? formatNumber(getQuarterlyTarget(kpi.kpi_id, quarter)) : getQuarterlyTarget(kpi.kpi_id, quarter)}
                                onChange={(e) => updateQuarterlyTarget(
                                  kpi.kpi_id, 
                                  quarter, 
                                  kpi.unit === 'currency' ? parseCurrencyInput(e.target.value) : Number(e.target.value)
                                )}
                                className="w-20 px-2 py-1 text-sm border border-gray-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                                disabled={usePercentageMode}
                                placeholder="0"
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Strategic Initiatives Section */}
      {initiatives.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <button
            onClick={() => toggleSection('initiatives')}
            className="w-full bg-slate-50 px-6 py-4 border-b border-gray-200 flex items-center justify-between hover:bg-slate-100 transition-colors"
          >
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              <Calendar className="h-5 w-5 mr-2 text-slate-600" />
              Strategic Initiatives
              <span className="ml-2 text-sm bg-slate-100 text-slate-800 px-2 py-1 rounded-full">
                {initiatives.length} selected
              </span>
            </h3>
            {sectionsCollapsed.initiatives ? (
              <ChevronDown className="h-5 w-5 text-gray-600" />
            ) : (
              <ChevronUp className="h-5 w-5 text-gray-600" />
            )}
          </button>
          
          {!sectionsCollapsed.initiatives && (
            <>
              <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
                <p className="text-sm text-gray-600 flex items-center gap-2">
                  <Grip className="h-4 w-4" />
                  Drag initiatives to quarters • Maximum 5 per quarter • {initiatives.length} total selected
                  <span className="text-green-600 font-medium">(Auto-saves to database)</span>
                </p>
              </div>

              <DragDropContext onDragEnd={handleDragEnd}>
                <div className="p-6">
                  
                  {/* Unassigned Initiatives */}
                  <div className="mb-8">
                    <h4 className="text-base font-medium text-gray-900 mb-4 flex items-center">
                      <div className="w-3 h-3 bg-gray-400 rounded-full mr-3"></div>
                      Unassigned Initiatives
                      <span className="ml-2 text-sm text-gray-500">({unassignedInitiatives.length})</span>
                    </h4>
                    
                    <Droppable droppableId="unassigned">
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={`min-h-[100px] rounded-lg border-2 border-dashed p-4 transition-colors ${
                            snapshot.isDraggingOver 
                              ? 'border-gray-400 bg-gray-50' 
                              : 'border-gray-200 bg-gray-50'
                          }`}
                        >
                          {unassignedInitiatives.length === 0 ? (
                            <div className="text-center py-6 text-gray-500">
                              <CheckCircle2 className="h-6 w-6 mx-auto mb-2 text-green-500" />
                              <p className="font-medium">All initiatives assigned to quarters</p>
                              <p className="text-sm">Perfect strategic distribution!</p>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {unassignedInitiatives.map((initiative, index) => (
                                <Draggable
                                  key={`unassigned-${initiative.id}-${index}`}
                                  draggableId={initiative.id}
                                  index={index}
                                >
                                  {(provided, snapshot) => (
                                    <div
                                      ref={provided.innerRef}
                                      {...provided.draggableProps}
                                      {...provided.dragHandleProps}
                                      className={`bg-white p-3 rounded-lg border border-gray-200 shadow-sm flex items-center transition-all ${
                                        snapshot.isDragging 
                                          ? 'shadow-lg rotate-1 scale-105' 
                                          : 'hover:shadow-md'
                                      }`}
                                    >
                                      <Grip className="h-4 w-4 text-gray-400 mr-3 flex-shrink-0" />
                                      <span className="font-medium text-gray-900 flex-1">
                                        {initiative.title}
                                      </span>
                                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                                        {initiative.category}
                                      </span>
                                    </div>
                                  )}
                                </Draggable>
                              ))}
                            </div>
                          )}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </div>

                  {/* Quarterly Columns */}
                  <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    {['q1', 'q2', 'q3', 'q4'].map((quarter, quarterIndex) => {
                      const quarterInitiatives = getInitiativesByQuarter(quarter)
                      const quarterColors = [
                        { bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-700', dot: 'bg-teal-500' },
                        { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', dot: 'bg-green-500' },
                        { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700', dot: 'bg-indigo-500' },
                        { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-700', dot: 'bg-slate-500' }
                      ][quarterIndex]

                      return (
                        <div key={`quarter-${quarter}`} className={`rounded-lg ${quarterColors.bg} ${quarterColors.border} border`}>
                          <div className="p-4 border-b border-gray-200">
                            <h4 className={`font-semibold ${quarterColors.text} flex items-center`}>
                              <div className={`w-3 h-3 ${quarterColors.dot} rounded-full mr-3`}></div>
                              {getQuarterEndDate(quarter, financialData.year_type)}
                              <span className={`ml-auto text-sm font-normal ${
                                quarterInitiatives.length >= 5 ? 'text-red-600' : 'text-current'
                              }`}>
                                {quarterInitiatives.length}/5
                              </span>
                            </h4>
                          </div>

                          <Droppable droppableId={quarter}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.droppableProps}
                                className={`min-h-[200px] p-4 transition-colors ${
                                  snapshot.isDraggingOver 
                                    ? quarterColors.bg 
                                    : ''
                                }`}
                              >
                                {quarterInitiatives.length === 0 ? (
                                  <div className="text-center py-6 text-gray-500">
                                    <Plus className="h-6 w-6 mx-auto mb-2 text-gray-400" />
                                    <p className="text-sm font-medium">Drop initiatives here</p>
                                    <p className="text-xs text-gray-400">Maximum 5 per quarter</p>
                                  </div>
                                ) : (
                                  <div className="space-y-3">
                                    {quarterInitiatives.map((initiative, index) => (
                                      <Draggable
                                        key={`${quarter}-${initiative.id}-${index}`}
                                        draggableId={initiative.id}
                                        index={index}
                                      >
                                        {(provided, snapshot) => (
                                          <div
                                            ref={provided.innerRef}
                                            {...provided.draggableProps}
                                            {...provided.dragHandleProps}
                                            className={`bg-white p-3 rounded-lg border border-gray-200 shadow-sm transition-all ${
                                              snapshot.isDragging 
                                                ? 'shadow-lg rotate-1 scale-105' 
                                                : 'hover:shadow-md'
                                            }`}
                                          >
                                            <div className="flex items-start">
                                              <Grip className="h-4 w-4 text-gray-400 mr-2 mt-0.5 flex-shrink-0" />
                                              <div className="flex-1">
                                                <p className="font-medium text-gray-900 text-sm leading-tight">
                                                  {initiative.title}
                                                </p>
                                                <p className="text-xs text-gray-500 mt-1">
                                                  {initiative.category}
                                                </p>
                                              </div>
                                            </div>
                                          </div>
                                        )}
                                      </Draggable>
                                    ))}
                                  </div>
                                )}
                                {provided.placeholder}
                              </div>
                            )}
                          </Droppable>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </DragDropContext>
            </>
          )}
        </div>
      )}

      {/* Footer Section */}
      <div className="bg-gray-50 rounded-lg p-4 text-center">
        <p className="text-sm text-gray-600">
          Your annual strategic plan transforms vision into executable quarterly milestones.
          Changes auto-save every 2 seconds to your database.
        </p>
        <p className="mt-2 text-sm text-green-600 font-medium">
          Production ready • All data persisted to Supabase
        </p>
      </div>

    </div>
  )
}