// /app/goals/services/snapshot-service.ts
'use client'

import { createClient } from '@/lib/supabase/client'
import { QuarterlySnapshot, AnnualSnapshot, KPIActual, QuarterType, StrategicInitiative } from '../types'

const supabase = createClient()

/**
 * Snapshot Service - Quarterly and Annual Review Management
 *
 * Handles:
 * - Creating quarterly snapshots
 * - Creating annual snapshots
 * - Tracking KPI actuals
 * - Retrieving historical data
 * - Progress tracking
 */
export class SnapshotService {

  /**
   * Create a quarterly snapshot
   */
  static async createQuarterlySnapshot(
    businessId: string,
    userId: string,
    year: number,
    quarter: QuarterType,
    data: {
      initiatives: StrategicInitiative[]
      kpis: any[]
      financials: any
      reflections: {
        wins?: string
        challenges?: string
        learnings?: string
        adjustments?: string
        overallReflection?: string
      }
    }
  ): Promise<{ success: boolean; snapshot?: QuarterlySnapshot; error?: string }> {
    try {
      // Calculate performance metrics
      const totalInitiatives = data.initiatives.length
      const completedInitiatives = data.initiatives.filter(i => i.status === 'completed').length
      const inProgressInitiatives = data.initiatives.filter(i => i.status === 'in_progress').length
      const cancelledInitiatives = data.initiatives.filter(i => i.status === 'cancelled').length
      const completionRate = totalInitiatives > 0 ? (completedInitiatives / totalInitiatives) * 100 : 0

      const snapshotData = {
        business_id: businessId,
        user_id: userId,
        snapshot_year: year,
        snapshot_quarter: quarter,
        snapshot_date: new Date().toISOString(),
        total_initiatives: totalInitiatives,
        completed_initiatives: completedInitiatives,
        in_progress_initiatives: inProgressInitiatives,
        cancelled_initiatives: cancelledInitiatives,
        completion_rate: completionRate,
        initiatives_snapshot: data.initiatives,
        kpis_snapshot: data.kpis,
        financial_snapshot: data.financials,
        wins: data.reflections.wins,
        challenges: data.reflections.challenges,
        learnings: data.reflections.learnings,
        adjustments: data.reflections.adjustments,
        overall_reflection: data.reflections.overallReflection
      }

      const { data: snapshot, error } = await supabase
        .from('quarterly_snapshots')
        .upsert(snapshotData, {
          onConflict: 'business_id,snapshot_year,snapshot_quarter'
        })
        .select()
        .single()

      if (error) {
        console.error('[Snapshot Service] Error creating quarterly snapshot:', error)
        return { success: false, error: error.message }
      }

      console.log(`[Snapshot Service] ✅ Created quarterly snapshot for ${year} ${quarter}`)

      return {
        success: true,
        snapshot: this.transformQuarterlySnapshot(snapshot)
      }
    } catch (err) {
      console.error('[Snapshot Service] Unexpected error:', err)
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error'
      }
    }
  }

  /**
   * Get quarterly snapshots for a business
   */
  static async getQuarterlySnapshots(
    businessId: string,
    options?: {
      year?: number
      quarter?: QuarterType
      limit?: number
    }
  ): Promise<QuarterlySnapshot[]> {
    try {
      let query = supabase
        .from('quarterly_snapshots')
        .select('*')
        .eq('business_id', businessId)
        .order('snapshot_year', { ascending: false })
        .order('snapshot_quarter', { ascending: false })

      if (options?.year) {
        query = query.eq('snapshot_year', options.year)
      }

      if (options?.quarter) {
        query = query.eq('snapshot_quarter', options.quarter)
      }

      if (options?.limit) {
        query = query.limit(options.limit)
      }

      const { data, error } = await query

      if (error) {
        console.error('[Snapshot Service] Error fetching snapshots:', error)
        return []
      }

      return data?.map(this.transformQuarterlySnapshot) || []
    } catch (err) {
      console.error('[Snapshot Service] Error:', err)
      return []
    }
  }

  /**
   * Save KPI actual value
   */
  static async saveKPIActual(
    businessId: string,
    userId: string,
    kpiId: string,
    data: {
      year: number
      quarter?: QuarterType
      month?: number
      type: 'monthly' | 'quarterly' | 'annual'
      actualValue: number
      targetValue?: number
      notes?: string
    }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const variance = data.targetValue ? data.actualValue - data.targetValue : null
      const variancePercentage = data.targetValue && data.targetValue !== 0
        ? ((data.actualValue - data.targetValue) / data.targetValue) * 100
        : null

      const actualData = {
        business_id: businessId,
        user_id: userId,
        kpi_id: kpiId,
        period_year: data.year,
        period_quarter: data.quarter,
        period_month: data.month,
        period_type: data.type,
        actual_value: data.actualValue,
        target_value: data.targetValue,
        variance: variance,
        variance_percentage: variancePercentage,
        notes: data.notes,
        recorded_at: new Date().toISOString()
      }

      const { error } = await supabase
        .from('kpi_actuals')
        .upsert(actualData, {
          onConflict: 'business_id,kpi_id,period_year,period_quarter,period_month,period_type'
        })

      if (error) {
        console.error('[Snapshot Service] Error saving KPI actual:', error)
        return { success: false, error: error.message }
      }

      return { success: true }
    } catch (err) {
      console.error('[Snapshot Service] Error:', err)
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error'
      }
    }
  }

  /**
   * Get KPI actuals for a business
   */
  static async getKPIActuals(
    businessId: string,
    options?: {
      kpiId?: string
      year?: number
      quarter?: QuarterType
    }
  ): Promise<KPIActual[]> {
    try {
      let query = supabase
        .from('kpi_actuals')
        .select('*')
        .eq('business_id', businessId)
        .order('period_year', { ascending: false })
        .order('period_quarter', { ascending: false })

      if (options?.kpiId) {
        query = query.eq('kpi_id', options.kpiId)
      }

      if (options?.year) {
        query = query.eq('period_year', options.year)
      }

      if (options?.quarter) {
        query = query.eq('period_quarter', options.quarter)
      }

      const { data, error } = await query

      if (error) {
        console.error('[Snapshot Service] Error fetching KPI actuals:', error)
        return []
      }

      return data?.map(this.transformKPIActual) || []
    } catch (err) {
      console.error('[Snapshot Service] Error:', err)
      return []
    }
  }

  /**
   * Get current quarter based on today's date
   */
  static getCurrentQuarter(): { year: number; quarter: QuarterType } {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1 // 1-12

    let quarter: QuarterType
    if (month >= 1 && month <= 3) quarter = 'Q1'
    else if (month >= 4 && month <= 6) quarter = 'Q2'
    else if (month >= 7 && month <= 9) quarter = 'Q3'
    else quarter = 'Q4'

    return { year, quarter }
  }

  /**
   * Get next quarter
   */
  static getNextQuarter(year: number, quarter: QuarterType): { year: number; quarter: QuarterType } {
    const quarterMap: Record<QuarterType, QuarterType | null> = {
      'Q1': 'Q2',
      'Q2': 'Q3',
      'Q3': 'Q4',
      'Q4': null
    }

    const nextQuarter = quarterMap[quarter]
    if (nextQuarter) {
      return { year, quarter: nextQuarter }
    } else {
      return { year: year + 1, quarter: 'Q1' }
    }
  }

  /**
   * Transform database snapshot to app format
   */
  private static transformQuarterlySnapshot(data: any): QuarterlySnapshot {
    return {
      id: data.id,
      businessId: data.business_id,
      userId: data.user_id,
      strategicPlanId: data.strategic_plan_id,
      snapshotYear: data.snapshot_year,
      snapshotQuarter: data.snapshot_quarter,
      snapshotDate: data.snapshot_date,
      totalInitiatives: data.total_initiatives,
      completedInitiatives: data.completed_initiatives,
      inProgressInitiatives: data.in_progress_initiatives,
      cancelledInitiatives: data.cancelled_initiatives,
      completionRate: data.completion_rate,
      initiativesSnapshot: data.initiatives_snapshot || [],
      kpisSnapshot: data.kpis_snapshot || {},
      financialSnapshot: data.financial_snapshot || {},
      wins: data.wins,
      challenges: data.challenges,
      learnings: data.learnings,
      adjustments: data.adjustments,
      overallReflection: data.overall_reflection,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    }
  }

  /**
   * Transform database KPI actual to app format
   */
  private static transformKPIActual(data: any): KPIActual {
    return {
      id: data.id,
      businessId: data.business_id,
      userId: data.user_id,
      kpiId: data.kpi_id,
      periodYear: data.period_year,
      periodQuarter: data.period_quarter,
      periodMonth: data.period_month,
      periodType: data.period_type,
      actualValue: data.actual_value,
      targetValue: data.target_value,
      variance: data.variance,
      variancePercentage: data.variance_percentage,
      notes: data.notes,
      recordedAt: data.recorded_at,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    }
  }
}

export default SnapshotService
