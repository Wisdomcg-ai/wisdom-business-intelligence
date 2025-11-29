// /app/goals/services/financial-service.ts
'use client'

import { createClient } from '@/lib/supabase/client'
import { FinancialData, CoreMetricsData } from '../types'

/**
 * Financial Goals Service - Supabase Integration
 *
 * Handles saving and loading financial goals data to/from Supabase
 */
export class FinancialService {
  private static supabase = createClient()

  /**
   * Save financial goals to Supabase
   */
  static async saveFinancialGoals(
    businessId: string,
    userId: string,
    financialData: FinancialData,
    yearType: 'FY' | 'CY',
    coreMetrics?: CoreMetricsData,
    quarterlyTargets?: Record<string, { q1: string; q2: string; q3: string; q4: string }>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!businessId || !userId) {
        return { success: false, error: 'Business ID and User ID required' }
      }

      console.log(`[Financial Service] 💾 Saving financial goals for business ${businessId}`)

      const dataToSave = {
        business_id: businessId,
        user_id: userId,

        // Revenue
        revenue_current: financialData.revenue?.current || 0,
        revenue_year1: financialData.revenue?.year1 || 0,
        revenue_year2: financialData.revenue?.year2 || 0,
        revenue_year3: financialData.revenue?.year3 || 0,

        // Gross Profit
        gross_profit_current: financialData.grossProfit?.current || 0,
        gross_profit_year1: financialData.grossProfit?.year1 || 0,
        gross_profit_year2: financialData.grossProfit?.year2 || 0,
        gross_profit_year3: financialData.grossProfit?.year3 || 0,

        // Gross Margin
        gross_margin_current: financialData.grossMargin?.current || 0,
        gross_margin_year1: financialData.grossMargin?.year1 || 0,
        gross_margin_year2: financialData.grossMargin?.year2 || 0,
        gross_margin_year3: financialData.grossMargin?.year3 || 0,

        // Net Profit
        net_profit_current: financialData.netProfit?.current || 0,
        net_profit_year1: financialData.netProfit?.year1 || 0,
        net_profit_year2: financialData.netProfit?.year2 || 0,
        net_profit_year3: financialData.netProfit?.year3 || 0,

        // Net Margin
        net_margin_current: financialData.netMargin?.current || 0,
        net_margin_year1: financialData.netMargin?.year1 || 0,
        net_margin_year2: financialData.netMargin?.year2 || 0,
        net_margin_year3: financialData.netMargin?.year3 || 0,

        // Other metrics
        customers_current: financialData.customers?.current || 0,
        customers_year1: financialData.customers?.year1 || 0,
        customers_year2: financialData.customers?.year2 || 0,
        customers_year3: financialData.customers?.year3 || 0,

        employees_current: financialData.employees?.current || 0,
        employees_year1: financialData.employees?.year1 || 0,
        employees_year2: financialData.employees?.year2 || 0,
        employees_year3: financialData.employees?.year3 || 0,

        // Core Business Metrics
        leads_per_month_current: coreMetrics?.leadsPerMonth?.current || 0,
        leads_per_month_year1: coreMetrics?.leadsPerMonth?.year1 || 0,
        leads_per_month_year2: coreMetrics?.leadsPerMonth?.year2 || 0,
        leads_per_month_year3: coreMetrics?.leadsPerMonth?.year3 || 0,

        conversion_rate_current: coreMetrics?.conversionRate?.current || 0,
        conversion_rate_year1: coreMetrics?.conversionRate?.year1 || 0,
        conversion_rate_year2: coreMetrics?.conversionRate?.year2 || 0,
        conversion_rate_year3: coreMetrics?.conversionRate?.year3 || 0,

        avg_transaction_value_current: coreMetrics?.avgTransactionValue?.current || 0,
        avg_transaction_value_year1: coreMetrics?.avgTransactionValue?.year1 || 0,
        avg_transaction_value_year2: coreMetrics?.avgTransactionValue?.year2 || 0,
        avg_transaction_value_year3: coreMetrics?.avgTransactionValue?.year3 || 0,

        team_headcount_current: coreMetrics?.teamHeadcount?.current || 0,
        team_headcount_year1: coreMetrics?.teamHeadcount?.year1 || 0,
        team_headcount_year2: coreMetrics?.teamHeadcount?.year2 || 0,
        team_headcount_year3: coreMetrics?.teamHeadcount?.year3 || 0,

        owner_hours_per_week_current: coreMetrics?.ownerHoursPerWeek?.current || 0,
        owner_hours_per_week_year1: coreMetrics?.ownerHoursPerWeek?.year1 || 0,
        owner_hours_per_week_year2: coreMetrics?.ownerHoursPerWeek?.year2 || 0,
        owner_hours_per_week_year3: coreMetrics?.ownerHoursPerWeek?.year3 || 0,

        // Quarterly Targets (stored as JSONB)
        quarterly_targets: quarterlyTargets || {},

        year_type: yearType,
        updated_at: new Date().toISOString()
      }

      // Upsert (insert or update)
      const { error } = await this.supabase
        .from('business_financial_goals')
        .upsert(dataToSave, {
          onConflict: 'business_id'
        })

      if (error) {
        console.error('[Financial Service] ❌ Error saving financial goals:', error)
        return { success: false, error: error.message }
      }

      console.log('[Financial Service] ✅ Successfully saved financial goals')
      return { success: true }
    } catch (err) {
      console.error('[Financial Service] ❌ Error saving financial goals:', err)
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
    }
  }

  /**
   * Load financial goals from Supabase
   */
  static async loadFinancialGoals(businessId: string): Promise<{
    financialData: FinancialData | null
    coreMetrics: CoreMetricsData | null
    yearType: 'FY' | 'CY'
    quarterlyTargets: Record<string, { q1: string; q2: string; q3: string; q4: string }>
    error?: string
  }> {
    try {
      if (!businessId) {
        return { financialData: null, coreMetrics: null, yearType: 'FY', quarterlyTargets: {}, error: 'Business ID required' }
      }

      console.log(`[Financial Service] 📥 Loading financial goals for business ${businessId}`)

      const { data, error } = await this.supabase
        .from('business_financial_goals')
        .select('*')
        .eq('business_id', businessId)
        .single()

      if (error) {
        // If no data found, return null (not an error)
        if (error.code === 'PGRST116') {
          console.log('[Financial Service] ℹ️ No financial goals found (first time user)')
          return { financialData: null, coreMetrics: null, yearType: 'FY', quarterlyTargets: {} }
        }

        console.error('[Financial Service] ❌ Error loading financial goals:', error)
        return { financialData: null, coreMetrics: null, yearType: 'FY', quarterlyTargets: {}, error: error.message }
      }

      if (!data) {
        return { financialData: null, coreMetrics: null, yearType: 'FY', quarterlyTargets: {} }
      }

      const financialData: FinancialData = {
        revenue: {
          current: data.revenue_current || 0,
          year1: data.revenue_year1 || 0,
          year2: data.revenue_year2 || 0,
          year3: data.revenue_year3 || 0
        },
        grossProfit: {
          current: data.gross_profit_current || 0,
          year1: data.gross_profit_year1 || 0,
          year2: data.gross_profit_year2 || 0,
          year3: data.gross_profit_year3 || 0
        },
        grossMargin: {
          current: data.gross_margin_current || 0,
          year1: data.gross_margin_year1 || 0,
          year2: data.gross_margin_year2 || 0,
          year3: data.gross_margin_year3 || 0
        },
        netProfit: {
          current: data.net_profit_current || 0,
          year1: data.net_profit_year1 || 0,
          year2: data.net_profit_year2 || 0,
          year3: data.net_profit_year3 || 0
        },
        netMargin: {
          current: data.net_margin_current || 0,
          year1: data.net_margin_year1 || 0,
          year2: data.net_margin_year2 || 0,
          year3: data.net_margin_year3 || 0
        },
        customers: {
          current: data.customers_current || 0,
          year1: data.customers_year1 || 0,
          year2: data.customers_year2 || 0,
          year3: data.customers_year3 || 0
        },
        employees: {
          current: data.employees_current || 0,
          year1: data.employees_year1 || 0,
          year2: data.employees_year2 || 0,
          year3: data.employees_year3 || 0
        }
      }

      const coreMetrics: CoreMetricsData = {
        leadsPerMonth: {
          current: data.leads_per_month_current || 0,
          year1: data.leads_per_month_year1 || 0,
          year2: data.leads_per_month_year2 || 0,
          year3: data.leads_per_month_year3 || 0
        },
        conversionRate: {
          current: data.conversion_rate_current || 0,
          year1: data.conversion_rate_year1 || 0,
          year2: data.conversion_rate_year2 || 0,
          year3: data.conversion_rate_year3 || 0
        },
        avgTransactionValue: {
          current: data.avg_transaction_value_current || 0,
          year1: data.avg_transaction_value_year1 || 0,
          year2: data.avg_transaction_value_year2 || 0,
          year3: data.avg_transaction_value_year3 || 0
        },
        teamHeadcount: {
          current: data.team_headcount_current || 0,
          year1: data.team_headcount_year1 || 0,
          year2: data.team_headcount_year2 || 0,
          year3: data.team_headcount_year3 || 0
        },
        ownerHoursPerWeek: {
          current: data.owner_hours_per_week_current || 0,
          year1: data.owner_hours_per_week_year1 || 0,
          year2: data.owner_hours_per_week_year2 || 0,
          year3: data.owner_hours_per_week_year3 || 0
        }
      }

      console.log('[Financial Service] ✅ Successfully loaded financial goals')

      return {
        financialData,
        coreMetrics,
        yearType: (data.year_type as 'FY' | 'CY') || 'FY',
        quarterlyTargets: (data.quarterly_targets as Record<string, { q1: string; q2: string; q3: string; q4: string }>) || {}
      }
    } catch (err) {
      console.error('[Financial Service] ❌ Error loading financial goals:', err)
      return {
        financialData: null,
        coreMetrics: null,
        yearType: 'FY',
        quarterlyTargets: {},
        error: err instanceof Error ? err.message : 'Unknown error'
      }
    }
  }
}

export default FinancialService
