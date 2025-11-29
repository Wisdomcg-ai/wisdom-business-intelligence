import { createClient } from '@/lib/supabase/client'

export type StageId = 'foundation' | 'traction' | 'growth' | 'scale' | 'mastery'

export interface StageInfo {
  id: StageId
  name: string
  range: string
  minRevenue: number
  maxRevenue: number | null
}

export interface StageTransition {
  id: string
  business_id: string
  from_stage: string | null
  to_stage: string
  revenue_at_transition: number | null
  triggered_by: 'revenue_update' | 'manual' | 'initial'
  transitioned_at: string
}

// Stage definitions matching the roadmap
export const STAGE_DEFINITIONS: StageInfo[] = [
  { id: 'foundation', name: 'Foundation', range: '$0-$500K', minRevenue: 0, maxRevenue: 500000 },
  { id: 'traction', name: 'Traction', range: '$500K-$1M', minRevenue: 500000, maxRevenue: 1000000 },
  { id: 'growth', name: 'Growth', range: '$1M-$5M', minRevenue: 1000000, maxRevenue: 5000000 },
  { id: 'scale', name: 'Scale', range: '$5M-$10M', minRevenue: 5000000, maxRevenue: 10000000 },
  { id: 'mastery', name: 'Mastery', range: '$10M+', minRevenue: 10000000, maxRevenue: null },
]

export class StageService {
  private static supabase = createClient()

  /**
   * Calculate stage from annual revenue
   */
  static calculateStageFromRevenue(revenue: number | null | undefined): StageId {
    if (!revenue || revenue < 500000) return 'foundation'
    if (revenue < 1000000) return 'traction'
    if (revenue < 5000000) return 'growth'
    if (revenue < 10000000) return 'scale'
    return 'mastery'
  }

  /**
   * Get stage info by ID
   */
  static getStageInfo(stageId: StageId): StageInfo | undefined {
    return STAGE_DEFINITIONS.find(s => s.id === stageId)
  }

  /**
   * Get stage index (0-4) for comparison
   */
  static getStageIndex(stageId: StageId): number {
    return STAGE_DEFINITIONS.findIndex(s => s.id === stageId)
  }

  /**
   * Check if a stage is at or below the current stage
   */
  static isStageAtOrBelow(stageId: StageId, currentStageId: StageId): boolean {
    return this.getStageIndex(stageId) <= this.getStageIndex(currentStageId)
  }

  /**
   * Get the user's current stage from their business profile
   */
  static async getCurrentStage(businessId: string): Promise<{
    stageId: StageId
    stageInfo: StageInfo
    revenue: number | null
  }> {
    const { data: profile } = await this.supabase
      .from('business_profiles')
      .select('annual_revenue')
      .eq('id', businessId)
      .single()

    const revenue = profile?.annual_revenue ?? null
    const stageId = this.calculateStageFromRevenue(revenue)
    const stageInfo = this.getStageInfo(stageId)!

    return { stageId, stageInfo, revenue }
  }

  /**
   * Get the latest stage transition for a business
   */
  static async getLatestTransition(businessId: string): Promise<StageTransition | null> {
    const { data } = await this.supabase
      .from('stage_transitions')
      .select('*')
      .eq('business_id', businessId)
      .order('transitioned_at', { ascending: false })
      .limit(1)
      .single()

    return data
  }

  /**
   * Get all stage transitions for a business (history)
   */
  static async getTransitionHistory(businessId: string): Promise<StageTransition[]> {
    const { data } = await this.supabase
      .from('stage_transitions')
      .select('*')
      .eq('business_id', businessId)
      .order('transitioned_at', { ascending: true })

    return data || []
  }

  /**
   * Record a stage transition
   */
  static async recordTransition(
    businessId: string,
    fromStage: StageId | null,
    toStage: StageId,
    revenue: number | null,
    triggeredBy: 'revenue_update' | 'manual' | 'initial' = 'revenue_update'
  ): Promise<StageTransition | null> {
    const { data, error } = await this.supabase
      .from('stage_transitions')
      .insert({
        business_id: businessId,
        from_stage: fromStage,
        to_stage: toStage,
        revenue_at_transition: revenue,
        triggered_by: triggeredBy,
      })
      .select()
      .single()

    if (error) {
      console.error('Error recording stage transition:', error)
      return null
    }

    return data
  }

  /**
   * Check for stage change and record if needed
   * Returns the new stage if changed, null if no change
   */
  static async checkAndRecordStageChange(businessId: string): Promise<{
    changed: boolean
    previousStage: StageId | null
    currentStage: StageId
    isNewUser: boolean
  }> {
    // Get current stage from revenue
    const { stageId: currentStage, revenue } = await this.getCurrentStage(businessId)

    // Get latest recorded transition
    const latestTransition = await this.getLatestTransition(businessId)

    // If no previous transition, this is a new user - record initial stage
    if (!latestTransition) {
      await this.recordTransition(businessId, null, currentStage, revenue, 'initial')
      return {
        changed: false,
        previousStage: null,
        currentStage,
        isNewUser: true,
      }
    }

    // Check if stage has changed
    const previousStage = latestTransition.to_stage as StageId
    if (previousStage !== currentStage) {
      await this.recordTransition(businessId, previousStage, currentStage, revenue, 'revenue_update')
      return {
        changed: true,
        previousStage,
        currentStage,
        isNewUser: false,
      }
    }

    // No change
    return {
      changed: false,
      previousStage,
      currentStage,
      isNewUser: false,
    }
  }
}

export default StageService
