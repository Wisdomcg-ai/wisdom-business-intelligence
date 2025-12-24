/**
 * AI Advisor Service
 *
 * Provides AI-powered suggestions for the forecast wizard with:
 * - Transparent confidence levels
 * - Coach benchmark integration
 * - Interaction logging for learning
 * - Guardrails to prevent hallucination
 */

import { createClient } from '@/lib/supabase/client'

// Anthropic SDK is optional - if not installed, AI features will use lookup tables only
let Anthropic: any = null
try {
  // Dynamic import to make the SDK optional
  Anthropic = require('@anthropic-ai/sdk').default
} catch {
  // SDK not installed, will use lookup tables only
}

// Types
export interface AIContext {
  businessId?: string
  userId?: string
  coachId?: string
  industry?: string
  revenueRange?: string
  state?: string
}

export interface AIRequest {
  questionType: 'salary_estimate' | 'cost_estimate' | 'margin_advice' | 'forecast_validation' | 'general'
  question: string
  context: string  // e.g., 'forecast_wizard.step3.team'
  contextData?: Record<string, any>
  aiContext: AIContext
}

export interface AISuggestion {
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

// Salary ranges by role (Australian market 2025-2026)
const SALARY_GUIDES: Record<string, { min: number; max: number; typical: number }> = {
  // Admin & Office
  'admin': { min: 52000, max: 68000, typical: 58000 },
  'administrator': { min: 52000, max: 68000, typical: 58000 },
  'receptionist': { min: 50000, max: 62000, typical: 55000 },
  'office_manager': { min: 68000, max: 95000, typical: 78000 },
  'executive_assistant': { min: 65000, max: 95000, typical: 78000 },
  'personal_assistant': { min: 60000, max: 85000, typical: 70000 },
  'customer_service': { min: 50000, max: 70000, typical: 58000 },
  'customer_support': { min: 50000, max: 70000, typical: 58000 },

  // Finance & Accounting
  'bookkeeper': { min: 58000, max: 78000, typical: 68000 },
  'accountant': { min: 72000, max: 115000, typical: 88000 },
  'senior_accountant': { min: 90000, max: 130000, typical: 105000 },
  'financial_controller': { min: 120000, max: 180000, typical: 145000 },
  'cfo': { min: 150000, max: 280000, typical: 200000 },
  'finance_manager': { min: 100000, max: 150000, typical: 120000 },
  'payroll': { min: 55000, max: 80000, typical: 65000 },

  // Sales
  'sales': { min: 55000, max: 90000, typical: 70000 },
  'sales_rep': { min: 62000, max: 105000, typical: 78000 },
  'sales_representative': { min: 62000, max: 105000, typical: 78000 },
  'sales_manager': { min: 95000, max: 145000, typical: 115000 },
  'business_development': { min: 75000, max: 130000, typical: 95000 },
  'account_manager': { min: 70000, max: 120000, typical: 90000 },
  'sales_director': { min: 130000, max: 200000, typical: 160000 },

  // Marketing
  'marketing': { min: 55000, max: 85000, typical: 68000 },
  'marketing_coordinator': { min: 58000, max: 78000, typical: 68000 },
  'marketing_manager': { min: 85000, max: 135000, typical: 105000 },
  'digital_marketing': { min: 60000, max: 95000, typical: 75000 },
  'content_creator': { min: 55000, max: 85000, typical: 68000 },
  'social_media': { min: 52000, max: 80000, typical: 62000 },
  'marketing_director': { min: 130000, max: 200000, typical: 155000 },

  // Management
  'manager': { min: 80000, max: 130000, typical: 100000 },
  'senior_manager': { min: 110000, max: 160000, typical: 130000 },
  'project_manager': { min: 88000, max: 135000, typical: 108000 },
  'operations_manager': { min: 95000, max: 145000, typical: 115000 },
  'general_manager': { min: 125000, max: 210000, typical: 155000 },
  'ceo': { min: 150000, max: 350000, typical: 220000 },
  'director': { min: 130000, max: 220000, typical: 165000 },
  'team_leader': { min: 70000, max: 100000, typical: 82000 },
  'supervisor': { min: 65000, max: 95000, typical: 78000 },
  'coordinator': { min: 55000, max: 80000, typical: 65000 },

  // HR
  'hr': { min: 60000, max: 90000, typical: 72000 },
  'hr_manager': { min: 90000, max: 140000, typical: 110000 },
  'hr_coordinator': { min: 58000, max: 78000, typical: 66000 },
  'recruiter': { min: 60000, max: 100000, typical: 75000 },
  'people_culture': { min: 65000, max: 95000, typical: 78000 },

  // Trades & Construction
  'tradesperson': { min: 68000, max: 100000, typical: 82000 },
  'electrician': { min: 70000, max: 110000, typical: 85000 },
  'plumber': { min: 70000, max: 110000, typical: 85000 },
  'carpenter': { min: 65000, max: 100000, typical: 80000 },
  'builder': { min: 75000, max: 120000, typical: 90000 },
  'foreman': { min: 85000, max: 130000, typical: 100000 },
  'site_manager': { min: 95000, max: 145000, typical: 115000 },
  'apprentice': { min: 38000, max: 58000, typical: 48000 },
  'labourer': { min: 52000, max: 72000, typical: 62000 },
  'technician': { min: 62000, max: 95000, typical: 78000 },
  'mechanic': { min: 60000, max: 95000, typical: 75000 },

  // Warehouse & Logistics
  'warehouse': { min: 50000, max: 70000, typical: 58000 },
  'warehouse_manager': { min: 70000, max: 100000, typical: 82000 },
  'driver': { min: 55000, max: 80000, typical: 65000 },
  'delivery_driver': { min: 52000, max: 72000, typical: 60000 },
  'truck_driver': { min: 60000, max: 90000, typical: 72000 },
  'logistics': { min: 55000, max: 85000, typical: 68000 },
  'logistics_manager': { min: 80000, max: 120000, typical: 95000 },
  'supply_chain': { min: 70000, max: 110000, typical: 85000 },

  // Tech & IT
  'developer': { min: 85000, max: 160000, typical: 115000 },
  'software_developer': { min: 85000, max: 160000, typical: 115000 },
  'senior_developer': { min: 120000, max: 200000, typical: 150000 },
  'engineer': { min: 80000, max: 150000, typical: 110000 },
  'software_engineer': { min: 90000, max: 170000, typical: 125000 },
  'it_support': { min: 55000, max: 85000, typical: 68000 },
  'it_manager': { min: 100000, max: 160000, typical: 125000 },
  'data_analyst': { min: 70000, max: 110000, typical: 85000 },
  'analyst': { min: 65000, max: 100000, typical: 80000 },
  'designer': { min: 62000, max: 105000, typical: 78000 },
  'graphic_designer': { min: 58000, max: 90000, typical: 72000 },
  'ux_designer': { min: 80000, max: 140000, typical: 105000 },
  'web_developer': { min: 70000, max: 130000, typical: 95000 },

  // Professional Services
  'consultant': { min: 95000, max: 160000, typical: 120000 },
  'senior_consultant': { min: 120000, max: 200000, typical: 150000 },
  'lawyer': { min: 80000, max: 200000, typical: 120000 },
  'solicitor': { min: 75000, max: 180000, typical: 110000 },
  'paralegal': { min: 55000, max: 80000, typical: 65000 },

  // Healthcare
  'nurse': { min: 70000, max: 100000, typical: 82000 },
  'registered_nurse': { min: 72000, max: 105000, typical: 85000 },
  'practice_manager': { min: 75000, max: 110000, typical: 90000 },
  'dental_assistant': { min: 50000, max: 70000, typical: 58000 },
  'physiotherapist': { min: 70000, max: 110000, typical: 85000 },

  // Hospitality & Retail
  'chef': { min: 55000, max: 90000, typical: 68000 },
  'head_chef': { min: 70000, max: 110000, typical: 85000 },
  'kitchen_hand': { min: 48000, max: 60000, typical: 52000 },
  'barista': { min: 48000, max: 60000, typical: 52000 },
  'retail': { min: 48000, max: 62000, typical: 54000 },
  'retail_manager': { min: 60000, max: 85000, typical: 70000 },
  'store_manager': { min: 62000, max: 90000, typical: 72000 },

  // Other
  'cleaner': { min: 48000, max: 62000, typical: 54000 },
  'security': { min: 52000, max: 72000, typical: 60000 },
  'trainer': { min: 60000, max: 95000, typical: 75000 },
}

// Project cost ranges (Australian market)
const PROJECT_COST_GUIDES: Record<string, { min: number; max: number; typical: number }> = {
  'website_redesign': { min: 5000, max: 50000, typical: 15000 },
  'website_basic': { min: 2000, max: 10000, typical: 5000 },
  'ecommerce_site': { min: 10000, max: 80000, typical: 30000 },
  'crm_implementation': { min: 5000, max: 50000, typical: 20000 },
  'erp_system': { min: 20000, max: 200000, typical: 75000 },
  'marketing_campaign': { min: 5000, max: 50000, typical: 15000 },
  'brand_refresh': { min: 5000, max: 40000, typical: 15000 },
  'full_rebrand': { min: 15000, max: 100000, typical: 40000 },
  'staff_training': { min: 2000, max: 20000, typical: 8000 },
  'leadership_program': { min: 10000, max: 50000, typical: 25000 },
  'office_fitout': { min: 10000, max: 150000, typical: 50000 },
  'equipment_upgrade': { min: 5000, max: 100000, typical: 25000 },
  'vehicle': { min: 30000, max: 80000, typical: 50000 },
  'software_subscription': { min: 2000, max: 20000, typical: 8000 },
  'consulting': { min: 5000, max: 50000, typical: 20000 },
  'coaching': { min: 10000, max: 40000, typical: 24000 },
}

// Industry margin benchmarks
const MARGIN_GUIDES: Record<string, { grossMargin: number; netMargin: number }> = {
  'trades': { grossMargin: 45, netMargin: 12 },
  'professional_services': { grossMargin: 60, netMargin: 20 },
  'retail': { grossMargin: 40, netMargin: 8 },
  'hospitality': { grossMargin: 65, netMargin: 10 },
  'manufacturing': { grossMargin: 35, netMargin: 10 },
  'construction': { grossMargin: 25, netMargin: 8 },
  'healthcare': { grossMargin: 55, netMargin: 15 },
  'technology': { grossMargin: 70, netMargin: 20 },
  'other': { grossMargin: 45, netMargin: 12 },
}

export class AIAdvisor {
  private supabase = createClient()
  private anthropic: any = null

  constructor() {
    // Only initialize Anthropic on server-side if SDK is available
    if (typeof window === 'undefined' && process.env.ANTHROPIC_API_KEY && Anthropic) {
      this.anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      })
    }
  }

  /**
   * Get a salary estimate for a role
   */
  async getSalaryEstimate(
    position: string,
    context: AIContext,
    additionalContext?: { experience?: string; location?: string }
  ): Promise<AISuggestion> {
    // First, check for coach benchmark
    const benchmark = await this.getCoachBenchmark(
      context.coachId,
      'salary',
      this.normalizeRole(position)
    )

    if (benchmark) {
      return this.logInteraction({
        questionType: 'salary_estimate',
        question: `What salary for ${position}?`,
        context: 'forecast_wizard.step3.team',
        contextData: { position, ...additionalContext },
        aiContext: context,
      }, {
        suggestion: `$${benchmark.min_value?.toLocaleString()} - $${benchmark.max_value?.toLocaleString()}`,
        reasoning: benchmark.notes || 'Based on your coach\'s benchmark for this role.',
        confidence: 'high',
        source: 'coach_benchmark',
        minValue: benchmark.min_value || undefined,
        maxValue: benchmark.max_value || undefined,
        typicalValue: benchmark.typical_value || undefined,
      })
    }

    // Fall back to market data
    const normalizedRole = this.normalizeRole(position)
    const guide = SALARY_GUIDES[normalizedRole]

    if (guide) {
      // Apply location adjustment
      let adjustment = 1.0
      if (additionalContext?.location?.toLowerCase().includes('sydney')) {
        adjustment = 1.1
      } else if (additionalContext?.location?.toLowerCase().includes('melbourne')) {
        adjustment = 1.05
      } else if (additionalContext?.location?.toLowerCase().includes('regional')) {
        adjustment = 0.9
      }

      const min = Math.round(guide.min * adjustment)
      const max = Math.round(guide.max * adjustment)
      const typical = Math.round(guide.typical * adjustment)

      return this.logInteraction({
        questionType: 'salary_estimate',
        question: `What salary for ${position}?`,
        context: 'forecast_wizard.step3.team',
        contextData: { position, ...additionalContext },
        aiContext: context,
      }, {
        suggestion: `$${min.toLocaleString()} - $${max.toLocaleString()}`,
        reasoning: `Based on current Australian market data for ${position} roles.`,
        confidence: 'medium',
        source: 'market_data',
        minValue: min,
        maxValue: max,
        typicalValue: typical,
        caveats: [
          'Adjust based on experience level',
          'Industry-specific roles may vary',
        ],
      })
    }

    // No match - use AI with guardrails
    return this.getAIEstimate({
      questionType: 'salary_estimate',
      question: `What is a typical salary range for a ${position} in Australia?`,
      context: 'forecast_wizard.step3.team',
      contextData: { position, ...additionalContext },
      aiContext: context,
    })
  }

  /**
   * Get a project cost estimate
   */
  async getProjectCostEstimate(
    projectType: string,
    context: AIContext,
    additionalContext?: { scope?: string; complexity?: string }
  ): Promise<AISuggestion> {
    // Check for coach benchmark first
    const benchmark = await this.getCoachBenchmark(
      context.coachId,
      'project_cost',
      this.normalizeProjectType(projectType)
    )

    if (benchmark) {
      return this.logInteraction({
        questionType: 'cost_estimate',
        question: `What cost for ${projectType}?`,
        context: 'forecast_wizard.step5.projects',
        contextData: { projectType, ...additionalContext },
        aiContext: context,
      }, {
        suggestion: `$${benchmark.min_value?.toLocaleString()} - $${benchmark.max_value?.toLocaleString()}`,
        reasoning: benchmark.notes || 'Based on your coach\'s benchmark for this type of project.',
        confidence: 'high',
        source: 'coach_benchmark',
        minValue: benchmark.min_value || undefined,
        maxValue: benchmark.max_value || undefined,
        typicalValue: benchmark.typical_value || undefined,
      })
    }

    // Fall back to market data
    const normalizedType = this.normalizeProjectType(projectType)
    const guide = PROJECT_COST_GUIDES[normalizedType]

    if (guide) {
      return this.logInteraction({
        questionType: 'cost_estimate',
        question: `What cost for ${projectType}?`,
        context: 'forecast_wizard.step5.projects',
        contextData: { projectType, ...additionalContext },
        aiContext: context,
      }, {
        suggestion: `$${guide.min.toLocaleString()} - $${guide.max.toLocaleString()}`,
        reasoning: `Based on typical Australian market rates for ${projectType}.`,
        confidence: 'medium',
        source: 'market_data',
        minValue: guide.min,
        maxValue: guide.max,
        typicalValue: guide.typical,
        caveats: [
          'Costs vary by scope and provider',
          'Get quotes for accurate pricing',
        ],
      })
    }

    // No match - use AI with guardrails
    return this.getAIEstimate({
      questionType: 'cost_estimate',
      question: `What is a typical cost range for ${projectType} in Australia?`,
      context: 'forecast_wizard.step5.projects',
      contextData: { projectType, ...additionalContext },
      aiContext: context,
    })
  }

  /**
   * Validate a forecast for reasonableness
   */
  async validateForecast(
    forecastData: {
      revenue: number
      grossProfit: number
      netProfit: number
      teamCosts: number
      opexCosts: number
    },
    context: AIContext
  ): Promise<AISuggestion> {
    const grossMargin = forecastData.revenue > 0
      ? (forecastData.grossProfit / forecastData.revenue) * 100
      : 0
    const netMargin = forecastData.revenue > 0
      ? (forecastData.netProfit / forecastData.revenue) * 100
      : 0
    const teamAsPercentOfRevenue = forecastData.revenue > 0
      ? (forecastData.teamCosts / forecastData.revenue) * 100
      : 0

    const industryBenchmark = MARGIN_GUIDES[context.industry || 'other']
    const issues: string[] = []
    const positives: string[] = []

    // Check margins
    if (grossMargin < industryBenchmark.grossMargin - 10) {
      issues.push(`Gross margin (${grossMargin.toFixed(0)}%) is below typical for your industry (${industryBenchmark.grossMargin}%)`)
    } else if (grossMargin >= industryBenchmark.grossMargin) {
      positives.push(`Gross margin is healthy at ${grossMargin.toFixed(0)}%`)
    }

    if (netMargin < 5) {
      issues.push(`Net margin of ${netMargin.toFixed(0)}% leaves little room for error`)
    } else if (netMargin >= 15) {
      positives.push(`Strong net margin of ${netMargin.toFixed(0)}%`)
    }

    // Check team costs
    if (teamAsPercentOfRevenue > 45) {
      issues.push(`Team costs at ${teamAsPercentOfRevenue.toFixed(0)}% of revenue is high`)
    }

    const confidence = issues.length === 0 ? 'high' : issues.length <= 2 ? 'medium' : 'low'
    const overall = issues.length === 0
      ? 'Your forecast looks solid!'
      : issues.length <= 2
        ? 'Your forecast is reasonable with some areas to watch.'
        : 'Your forecast has some concerns that should be addressed.'

    return this.logInteraction({
      questionType: 'forecast_validation',
      question: 'Is this forecast realistic?',
      context: 'forecast_wizard.step6.review',
      contextData: forecastData,
      aiContext: context,
    }, {
      suggestion: overall,
      reasoning: [...positives, ...issues].join(' '),
      confidence,
      source: 'market_data',
      caveats: issues.length > 0 ? issues : undefined,
    })
  }

  /**
   * Get AI estimate with guardrails (used when no benchmark or market data exists)
   */
  private async getAIEstimate(request: AIRequest): Promise<AISuggestion> {
    // For salary estimates, provide a reasonable general range
    if (request.questionType === 'salary_estimate') {
      const position = request.contextData?.position || 'this role'

      // Determine likely salary band based on keywords
      let min = 55000
      let max = 85000
      let typical = 68000

      const posLower = position.toLowerCase()

      // Senior/Lead roles
      if (posLower.includes('senior') || posLower.includes('lead') || posLower.includes('head')) {
        min = 95000
        max = 150000
        typical = 115000
      }
      // Manager roles
      else if (posLower.includes('manager') || posLower.includes('director')) {
        min = 85000
        max = 140000
        typical = 105000
      }
      // Coordinator/Officer roles
      else if (posLower.includes('coordinator') || posLower.includes('officer')) {
        min = 55000
        max = 80000
        typical = 65000
      }
      // Assistant/Support roles
      else if (posLower.includes('assistant') || posLower.includes('support') || posLower.includes('junior')) {
        min = 50000
        max = 70000
        typical = 58000
      }
      // Executive roles
      else if (posLower.includes('executive') || posLower.includes('chief') || posLower.includes('vp')) {
        min = 130000
        max = 250000
        typical = 175000
      }

      return this.logInteraction(request, {
        suggestion: `$${min.toLocaleString()} - $${max.toLocaleString()}`,
        reasoning: `Estimated range for ${position} based on similar roles in the Australian market.`,
        confidence: 'low',
        source: 'ai_estimate',
        minValue: min,
        maxValue: max,
        typicalValue: typical,
        caveats: [
          'This is a general estimate - actual salary varies by industry and experience',
          'Your coach can provide more specific guidance for your industry',
        ],
      })
    }

    // For cost estimates, provide a general range
    if (request.questionType === 'cost_estimate') {
      return this.logInteraction(request, {
        suggestion: '$5,000 - $50,000',
        reasoning: 'General project cost range - varies significantly by scope and complexity.',
        confidence: 'low',
        source: 'ai_estimate',
        minValue: 5000,
        maxValue: 50000,
        typicalValue: 20000,
        caveats: [
          'Get specific quotes for accurate pricing',
          'Your coach can help scope this more precisely',
        ],
      })
    }

    // Default fallback
    return this.logInteraction(request, {
      suggestion: 'I need more context to provide a confident estimate',
      reasoning: 'This is outside my typical knowledge. I\'d recommend discussing with your coach.',
      confidence: 'low',
      source: 'ai_estimate',
      caveats: [
        'Consider getting specific quotes',
        'Your coach can provide industry-specific guidance',
      ],
    })
  }

  /**
   * Check for a coach benchmark
   */
  private async getCoachBenchmark(
    coachId: string | undefined,
    benchmarkType: string,
    category: string
  ): Promise<{
    min_value: number | null
    max_value: number | null
    typical_value: number | null
    notes: string | null
  } | null> {
    if (!coachId) return null

    try {
      const { data, error } = await this.supabase
        .from('coach_benchmarks')
        .select('min_value, max_value, typical_value, notes, times_used')
        .eq('coach_id', coachId)
        .eq('benchmark_type', benchmarkType)
        .eq('category', category)
        .single()

      if (error || !data) return null

      // Update usage tracking
      await this.supabase
        .from('coach_benchmarks')
        .update({
          times_used: (data.times_used || 0) + 1,
          last_used_at: new Date().toISOString(),
        })
        .eq('coach_id', coachId)
        .eq('benchmark_type', benchmarkType)
        .eq('category', category)

      return data
    } catch {
      return null
    }
  }

  /**
   * Log an interaction for learning
   */
  private async logInteraction(
    request: AIRequest,
    suggestion: Omit<AISuggestion, 'interactionId'>
  ): Promise<AISuggestion> {
    try {
      const { data, error } = await this.supabase
        .from('ai_interactions')
        .insert({
          business_id: request.aiContext.businessId,
          user_id: request.aiContext.userId,
          coach_id: request.aiContext.coachId,
          question: request.question,
          question_type: request.questionType,
          context: request.context,
          context_data: request.contextData,
          ai_response: suggestion,
          confidence: suggestion.confidence,
          business_industry: request.aiContext.industry,
          business_revenue_range: request.aiContext.revenueRange,
          business_state: request.aiContext.state,
        })
        .select('id')
        .single()

      return {
        ...suggestion,
        interactionId: data?.id,
      }
    } catch {
      // Don't fail the suggestion if logging fails
      return suggestion
    }
  }

  /**
   * Record what the user did with a suggestion
   */
  async recordAction(
    interactionId: string,
    action: 'used' | 'adjusted' | 'ignored' | 'asked_coach',
    userValue?: number
  ): Promise<void> {
    try {
      await this.supabase
        .from('ai_interactions')
        .update({
          action_taken: action,
          user_value: userValue,
        })
        .eq('id', interactionId)
    } catch (error) {
      console.error('Failed to record AI interaction action:', error)
    }
  }

  /**
   * Normalize role name for lookup
   */
  private normalizeRole(role: string): string {
    const normalized = role.toLowerCase()
      .replace(/[^a-z\s]/g, '')
      .trim()

    // Convert to underscore format for lookup
    const underscored = normalized.replace(/\s+/g, '_')

    // Check for exact match first
    if (SALARY_GUIDES[underscored]) {
      return underscored
    }

    // Map common variations
    const mappings: Record<string, string> = {
      'administrative_assistant': 'admin',
      'office_administrator': 'admin',
      'pa': 'personal_assistant',
      'book_keeper': 'bookkeeper',
      'bk': 'bookkeeper',
      'pm': 'project_manager',
      'ops_manager': 'operations_manager',
      'gm': 'general_manager',
      'tradie': 'tradesperson',
      'trade': 'tradesperson',
      'dev': 'developer',
      'programmer': 'developer',
      'coder': 'developer',
      'bdm': 'business_development',
      'biz_dev': 'business_development',
      'csr': 'customer_service',
      'cust_service': 'customer_service',
      'ea': 'executive_assistant',
      'it': 'it_support',
      'marketing_exec': 'marketing',
      'hr_officer': 'hr',
      'human_resources': 'hr',
      'finance': 'accountant',
      'accounts': 'accountant',
    }

    // Check for direct mapping
    if (mappings[underscored]) {
      return mappings[underscored]
    }

    // Score-based matching - find best match
    const keys = Object.keys(SALARY_GUIDES)
    let bestMatch = ''
    let bestScore = 0

    for (const key of keys) {
      const keyWords = key.split('_')
      const normalizedWords = normalized.split(' ')
      let score = 0

      // Check if all key words are in the normalized role
      const allKeyWordsMatch = keyWords.every(kw =>
        normalizedWords.some(nw => nw === kw || nw.startsWith(kw) || kw.startsWith(nw))
      )
      if (allKeyWordsMatch) {
        score += keyWords.length * 10
      }

      // Check for exact word matches
      for (const kw of keyWords) {
        if (normalizedWords.includes(kw)) {
          score += 5
        }
      }

      // Check if normalized contains the key (with spaces as underscores)
      if (normalized.replace(/\s+/g, '_').includes(key)) {
        score += key.length
      }

      // Prefer longer matches (more specific)
      if (score > 0) {
        score += key.length * 0.1
      }

      if (score > bestScore) {
        bestScore = score
        bestMatch = key
      }
    }

    // Return best match if we found one with reasonable confidence
    if (bestScore >= 5) {
      return bestMatch
    }

    // Fallback: try to match just the main role word
    const roleWords = normalized.split(' ')
    const mainWords = ['manager', 'director', 'coordinator', 'assistant', 'officer', 'lead', 'specialist']

    for (const word of roleWords) {
      if (SALARY_GUIDES[word]) {
        return word
      }
    }

    // Last resort: return underscored version (will likely go to AI estimate)
    return underscored
  }

  /**
   * Normalize project type for lookup
   */
  private normalizeProjectType(projectType: string): string {
    const normalized = projectType.toLowerCase()
      .replace(/[^a-z\s]/g, '')
      .trim()

    // Map common variations
    const mappings: Record<string, string> = {
      'website': 'website_redesign',
      'web design': 'website_redesign',
      'new website': 'website_redesign',
      'crm': 'crm_implementation',
      'customer relationship': 'crm_implementation',
      'marketing': 'marketing_campaign',
      'advertising': 'marketing_campaign',
      'brand': 'brand_refresh',
      'branding': 'brand_refresh',
      'logo': 'brand_refresh',
      'training': 'staff_training',
      'team training': 'staff_training',
      'office': 'office_fitout',
      'fit out': 'office_fitout',
      'renovation': 'office_fitout',
      'equipment': 'equipment_upgrade',
      'tools': 'equipment_upgrade',
      'machinery': 'equipment_upgrade',
      'car': 'vehicle',
      'truck': 'vehicle',
      'van': 'vehicle',
      'ute': 'vehicle',
      'software': 'software_subscription',
      'saas': 'software_subscription',
      'consultant': 'consulting',
      'advisor': 'consulting',
      'coach': 'coaching',
      'business coach': 'coaching',
    }

    // Check for direct mapping
    if (mappings[normalized]) {
      return mappings[normalized]
    }

    // Check for partial matches
    for (const [key] of Object.entries(PROJECT_COST_GUIDES)) {
      if (normalized.includes(key.replace(/_/g, ' ')) || key.includes(normalized.split(' ')[0])) {
        return key
      }
    }

    return normalized.replace(/\s+/g, '_')
  }
}

// Singleton instance
export const aiAdvisor = new AIAdvisor()
