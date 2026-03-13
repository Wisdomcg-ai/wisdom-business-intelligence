// Quarterly Review Service
// Handles all database operations for quarterly reviews

import { createClient } from '@/lib/supabase/client';
import type {
  QuarterlyReview,
  QuarterNumber,
  WorkshopStep,
  WorkshopStatus,
  ActionReplay,
  FeedbackLoop,
  FeedbackLoopMode,
  DashboardSnapshot,
  AssessmentSnapshot,
  RoadmapSnapshot,
  QuarterlyTargets,
  InitiativesChanges,
  Rock,
  PersonalCommitments,
  OpenLoopDecisionRecord,
  IssueResolution,
  RockReviewItem,
  CustomerPulse,
  PeopleReview,
  AnnualPlanSnapshot,
  RealignmentData,
  InitiativeDecision,
  CoachNotes,
  ActionItem
} from '../types';

export class QuarterlyReviewService {
  private getSupabase() {
    return createClient();
  }

  // ═══════════════════════════════════════════════════════════════
  // CRUD Operations
  // ═══════════════════════════════════════════════════════════════

  async getReview(businessId: string, quarter: QuarterNumber, year: number): Promise<QuarterlyReview | null> {
    const { data, error } = await this.getSupabase()
      .from('quarterly_reviews')
      .select('*')
      .eq('business_id', businessId)
      .eq('quarter', quarter)
      .eq('year', year)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching quarterly review:', error);
      throw error;
    }

    return data;
  }

  async getReviewById(id: string): Promise<QuarterlyReview | null> {
    const { data, error } = await this.getSupabase()
      .from('quarterly_reviews')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('Error fetching quarterly review by ID:', error);
      throw error;
    }

    if (!data) return null;

    return data;
  }

  async getAllReviews(businessId: string): Promise<QuarterlyReview[]> {
    const { data, error } = await this.getSupabase()
      .from('quarterly_reviews')
      .select('*')
      .eq('business_id', businessId)
      .order('year', { ascending: false })
      .order('quarter', { ascending: false });

    if (error) {
      console.error('Error fetching all quarterly reviews:', error);
      throw error;
    }

    return data || [];
  }

  async createReview(
    businessId: string,
    userId: string,
    quarter: QuarterNumber,
    year: number,
    reviewType?: string
  ): Promise<QuarterlyReview> {
    const { data, error } = await this.getSupabase()
      .from('quarterly_reviews')
      .insert({
        business_id: businessId,
        user_id: userId,
        quarter,
        year,
        review_type: reviewType || 'quarterly',
        status: 'not_started',
        current_step: 'prework',
        steps_completed: []
      })
      .select()
      .maybeSingle();

    if (error) {
      console.error('Error creating quarterly review:', error);
      throw error;
    }

    if (!data) throw new Error('Failed to create review - access denied');
    return data;
  }

  async getOrCreateReview(
    businessId: string,
    userId: string,
    quarter: QuarterNumber,
    year: number,
    reviewType?: string
  ): Promise<QuarterlyReview> {
    const existing = await this.getReview(businessId, quarter, year);
    if (existing) return existing;
    return this.createReview(businessId, userId, quarter, year, reviewType);
  }

  async deleteReview(id: string): Promise<void> {
    const { error } = await this.getSupabase()
      .from('quarterly_reviews')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting quarterly review:', error);
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Pre-Work Updates
  // ═══════════════════════════════════════════════════════════════

  async updatePreWork(
    id: string,
    data: {
      last_quarter_rating?: number | null;
      biggest_win?: string | null;
      biggest_challenge?: string | null;
      key_learning?: string | null;
      hours_worked_avg?: number | null;
      days_off_taken?: number | null;
      energy_level?: number | null;
      purpose_alignment?: number | null;
      one_thing_for_success?: string | null;
      coach_support_needed?: string | null;
    }
  ): Promise<QuarterlyReview> {
    const { data: updated, error } = await this.getSupabase()
      .from('quarterly_reviews')
      .update(data)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      console.error('Error updating pre-work:', error);
      throw error;
    }

    if (!updated) throw new Error('Review not found or access denied');
    return updated;
  }

  async completePreWork(id: string): Promise<QuarterlyReview> {
    const { data, error } = await this.getSupabase()
      .from('quarterly_reviews')
      .update({
        prework_completed_at: new Date().toISOString(),
        status: 'prework_complete',
        current_step: '1.1',
        steps_completed: ['prework']
      })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      console.error('Error completing pre-work:', error);
      throw error;
    }

    if (!data) throw new Error('Review not found or access denied');
    return data;
  }

  // ═══════════════════════════════════════════════════════════════
  // Part 1: Reflection Updates
  // ═══════════════════════════════════════════════════════════════

  async updateDashboardSnapshot(id: string, snapshot: DashboardSnapshot): Promise<QuarterlyReview> {
    const { data, error } = await this.getSupabase()
      .from('quarterly_reviews')
      .update({ dashboard_snapshot: snapshot })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      console.error('Error updating dashboard snapshot:', error);
      throw error;
    }

    if (!data) throw new Error('Review not found or access denied');
    return data;
  }

  async updateActionReplay(id: string, actionReplay: ActionReplay): Promise<QuarterlyReview> {
    const { data, error } = await this.getSupabase()
      .from('quarterly_reviews')
      .update({ action_replay: actionReplay })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      console.error('Error updating action replay:', error);
      throw error;
    }

    if (!data) throw new Error('Review not found or access denied');
    return data;
  }

  // ═══════════════════════════════════════════════════════════════
  // Part 2: Analysis Updates
  // ═══════════════════════════════════════════════════════════════

  async updateFeedbackLoop(id: string, feedbackLoop: FeedbackLoop): Promise<QuarterlyReview> {
    const { data, error } = await this.getSupabase()
      .from('quarterly_reviews')
      .update({ feedback_loop: feedbackLoop })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      console.error('Error updating feedback loop:', error);
      throw error;
    }

    if (!data) throw new Error('Review not found or access denied');
    return data;
  }

  async updateOpenLoopsDecisions(id: string, decisions: OpenLoopDecisionRecord[]): Promise<QuarterlyReview> {
    const { data, error } = await this.getSupabase()
      .from('quarterly_reviews')
      .update({ open_loops_decisions: decisions })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      console.error('Error updating open loops decisions:', error);
      throw error;
    }

    if (!data) throw new Error('Review not found or access denied');
    return data;
  }

  async updateIssuesResolved(id: string, issues: IssueResolution[]): Promise<QuarterlyReview> {
    const { data, error } = await this.getSupabase()
      .from('quarterly_reviews')
      .update({ issues_resolved: issues })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      console.error('Error updating issues resolved:', error);
      throw error;
    }

    if (!data) throw new Error('Review not found or access denied');
    return data;
  }

  // ═══════════════════════════════════════════════════════════════
  // Part 3: Strategic Review Updates
  // ═══════════════════════════════════════════════════════════════

  async updateAssessmentSnapshot(id: string, snapshot: AssessmentSnapshot): Promise<QuarterlyReview> {
    const { data, error } = await this.getSupabase()
      .from('quarterly_reviews')
      .update({ assessment_snapshot: snapshot })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      console.error('Error updating assessment snapshot:', error);
      throw error;
    }

    if (!data) throw new Error('Review not found or access denied');
    return data;
  }

  async updateRoadmapSnapshot(id: string, snapshot: RoadmapSnapshot): Promise<QuarterlyReview> {
    const { data, error } = await this.getSupabase()
      .from('quarterly_reviews')
      .update({ roadmap_snapshot: snapshot })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      console.error('Error updating roadmap snapshot:', error);
      throw error;
    }

    if (!data) throw new Error('Review not found or access denied');
    return data;
  }

  async updateSwotAnalysisId(id: string, swotAnalysisId: string | null): Promise<QuarterlyReview> {
    const { data, error } = await this.getSupabase()
      .from('quarterly_reviews')
      .update({ swot_analysis_id: swotAnalysisId })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      console.error('Error updating SWOT analysis ID:', error);
      throw error;
    }

    if (!data) throw new Error('Review not found or access denied');
    return data;
  }

  async updateConfidence(
    id: string,
    confidence: number,
    notes: string,
    adjusted: boolean
  ): Promise<QuarterlyReview> {
    const { data, error } = await this.getSupabase()
      .from('quarterly_reviews')
      .update({
        annual_target_confidence: confidence,
        confidence_notes: notes,
        targets_adjusted: adjusted
      })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      console.error('Error updating confidence:', error);
      throw error;
    }

    if (!data) throw new Error('Review not found or access denied');
    return data;
  }

  // ═══════════════════════════════════════════════════════════════
  // Part 4: Planning Updates
  // ═══════════════════════════════════════════════════════════════

  async updateQuarterlyTargets(id: string, targets: QuarterlyTargets): Promise<QuarterlyReview> {
    const { data, error } = await this.getSupabase()
      .from('quarterly_reviews')
      .update({ quarterly_targets: targets })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      console.error('Error updating quarterly targets:', error);
      throw error;
    }

    if (!data) throw new Error('Review not found or access denied');
    return data;
  }

  async updateInitiativesChanges(id: string, changes: InitiativesChanges): Promise<QuarterlyReview> {
    const { data, error } = await this.getSupabase()
      .from('quarterly_reviews')
      .update({ initiatives_changes: changes })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      console.error('Error updating initiatives changes:', error);
      throw error;
    }

    if (!data) throw new Error('Review not found or access denied');
    return data;
  }

  async updateQuarterlyRocks(id: string, rocks: Rock[]): Promise<QuarterlyReview> {
    const { data, error } = await this.getSupabase()
      .from('quarterly_reviews')
      .update({ quarterly_rocks: rocks })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      console.error('Error updating quarterly rocks:', error);
      throw error;
    }

    if (!data) throw new Error('Review not found or access denied');
    return data;
  }

  async updatePersonalCommitments(id: string, commitments: PersonalCommitments): Promise<QuarterlyReview> {
    const { data, error } = await this.getSupabase()
      .from('quarterly_reviews')
      .update({ personal_commitments: commitments })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      console.error('Error updating personal commitments:', error);
      throw error;
    }

    if (!data) throw new Error('Review not found or access denied');
    return data;
  }

  // ═══════════════════════════════════════════════════════════════
  // New Step Data Updates (Restructured Workshop)
  // ═══════════════════════════════════════════════════════════════

  async updateRocksReview(id: string, rocks: RockReviewItem[]): Promise<QuarterlyReview> {
    const { data, error } = await this.getSupabase()
      .from('quarterly_reviews')
      .update({ rocks_review: rocks })
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) { console.error('Error updating rocks review:', error); throw error; }
    if (!data) throw new Error('Review not found or access denied');
    return data;
  }

  async updateCustomerPulse(id: string, pulse: CustomerPulse): Promise<QuarterlyReview> {
    const { data, error } = await this.getSupabase()
      .from('quarterly_reviews')
      .update({ customer_pulse: pulse })
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) { console.error('Error updating customer pulse:', error); throw error; }
    if (!data) throw new Error('Review not found or access denied');
    return data;
  }

  async updatePeopleReview(id: string, review: PeopleReview): Promise<QuarterlyReview> {
    const { data, error } = await this.getSupabase()
      .from('quarterly_reviews')
      .update({ people_review: review })
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) { console.error('Error updating people review:', error); throw error; }
    if (!data) throw new Error('Review not found or access denied');
    return data;
  }

  async updateAnnualPlanSnapshot(id: string, snapshot: AnnualPlanSnapshot): Promise<QuarterlyReview> {
    const { data, error } = await this.getSupabase()
      .from('quarterly_reviews')
      .update({ annual_plan_snapshot: snapshot })
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) { console.error('Error updating annual plan snapshot:', error); throw error; }
    if (!data) throw new Error('Review not found or access denied');
    return data;
  }

  async updateRealignmentDecision(id: string, decision: RealignmentData): Promise<QuarterlyReview> {
    const { data, error } = await this.getSupabase()
      .from('quarterly_reviews')
      .update({ realignment_decision: decision })
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) { console.error('Error updating realignment decision:', error); throw error; }
    if (!data) throw new Error('Review not found or access denied');
    return data;
  }

  async updateInitiativeDecisions(id: string, decisions: InitiativeDecision[]): Promise<QuarterlyReview> {
    const { data, error } = await this.getSupabase()
      .from('quarterly_reviews')
      .update({ initiative_decisions: decisions })
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) { console.error('Error updating initiative decisions:', error); throw error; }
    if (!data) throw new Error('Review not found or access denied');
    return data;
  }

  async updateCoachNotes(id: string, notes: CoachNotes): Promise<QuarterlyReview> {
    const { data, error } = await this.getSupabase()
      .from('quarterly_reviews')
      .update({ coach_notes: notes })
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) { console.error('Error updating coach notes:', error); throw error; }
    if (!data) throw new Error('Review not found or access denied');
    return data;
  }

  async updateActionItems(id: string, items: ActionItem[]): Promise<QuarterlyReview> {
    const { data, error } = await this.getSupabase()
      .from('quarterly_reviews')
      .update({ action_items: items })
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) { console.error('Error updating action items:', error); throw error; }
    if (!data) throw new Error('Review not found or access denied');
    return data;
  }

  async updateOneThing(id: string, answer: string): Promise<QuarterlyReview> {
    const { data, error } = await this.getSupabase()
      .from('quarterly_reviews')
      .update({ one_thing_answer: answer })
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) { console.error('Error updating one thing:', error); throw error; }
    if (!data) throw new Error('Review not found or access denied');
    return data;
  }

  async updateFeedbackLoopMode(id: string, mode: FeedbackLoopMode): Promise<QuarterlyReview> {
    const { data, error } = await this.getSupabase()
      .from('quarterly_reviews')
      .update({ feedback_loop_mode: mode })
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) { console.error('Error updating feedback loop mode:', error); throw error; }
    if (!data) throw new Error('Review not found or access denied');
    return data;
  }

  async getPreviousReview(businessId: string, quarter: QuarterNumber, year: number): Promise<QuarterlyReview | null> {
    const prevQuarter = quarter === 1 ? 4 : (quarter - 1) as QuarterNumber;
    const prevYear = quarter === 1 ? year - 1 : year;

    const { data, error } = await this.getSupabase()
      .from('quarterly_reviews')
      .select('*')
      .eq('business_id', businessId)
      .eq('quarter', prevQuarter)
      .eq('year', prevYear)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching previous review:', error);
      throw error;
    }
    return data;
  }

  async updateScorecardCommentary(id: string, commentary: string): Promise<QuarterlyReview> {
    const { data, error } = await this.getSupabase()
      .from('quarterly_reviews')
      .update({ scorecard_commentary: commentary })
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) { console.error('Error updating scorecard commentary:', error); throw error; }
    if (!data) throw new Error('Review not found or access denied');
    return data;
  }

  // ═══════════════════════════════════════════════════════════════
  // Progress Management
  // ═══════════════════════════════════════════════════════════════

  async updateProgress(
    id: string,
    currentStep: WorkshopStep,
    stepsCompleted: WorkshopStep[]
  ): Promise<QuarterlyReview> {
    const status: WorkshopStatus = currentStep === 'complete' ? 'completed' : 'in_progress';

    const updateData: Record<string, unknown> = {
      current_step: currentStep,
      steps_completed: stepsCompleted,
      status
    };

    if (status === 'in_progress' && stepsCompleted.length === 1) {
      updateData.started_at = new Date().toISOString();
    }

    if (status === 'completed') {
      updateData.completed_at = new Date().toISOString();
    }

    const { data, error } = await this.getSupabase()
      .from('quarterly_reviews')
      .update(updateData)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      console.error('Error updating progress:', error);
      throw error;
    }

    if (!data) throw new Error('Review not found or access denied');
    return data;
  }

  async completeStep(id: string, step: WorkshopStep, nextStep: WorkshopStep): Promise<QuarterlyReview> {
    // First get current state
    const current = await this.getReviewById(id);
    if (!current) throw new Error('Review not found');

    const stepsCompleted = [...(current.steps_completed || [])];
    if (!stepsCompleted.includes(step)) {
      stepsCompleted.push(step);
    }

    return this.updateProgress(id, nextStep, stepsCompleted);
  }

  async startWorkshop(id: string): Promise<QuarterlyReview> {
    const { data, error } = await this.getSupabase()
      .from('quarterly_reviews')
      .update({
        status: 'in_progress',
        started_at: new Date().toISOString(),
        current_step: '1.1'
      })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      console.error('Error starting workshop:', error);
      throw error;
    }

    if (!data) throw new Error('Review not found or access denied');
    return data;
  }

  async completeWorkshop(id: string): Promise<QuarterlyReview> {
    const { data, error } = await this.getSupabase()
      .from('quarterly_reviews')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        current_step: 'complete'
      })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      console.error('Error completing workshop:', error);
      throw error;
    }

    if (!data) throw new Error('Review not found or access denied');

    // Create quarterly snapshot on completion
    if (data) {
      await this.createQuarterlySnapshot(data);
      await this.saveKpiActuals(data);
    }

    return data;
  }

  // ═══════════════════════════════════════════════════════════════
  // KPI Actuals & Quarterly Snapshots
  // ═══════════════════════════════════════════════════════════════

  /**
   * Save KPI actuals to kpi_actuals table for historical tracking
   */
  async saveKpiActuals(review: QuarterlyReview): Promise<void> {
    const snapshot = review.dashboard_snapshot;
    if (!snapshot?.kpis || snapshot.kpis.length === 0) return;

    const quarterKey = `Q${review.quarter}`;
    const supabase = this.getSupabase();

    // Prepare KPI actuals for batch upsert
    // Using column names from existing migration schema
    const kpiActuals = snapshot.kpis
      .filter(kpi => kpi.actual > 0)
      .map(kpi => ({
        business_id: review.business_id,
        user_id: review.user_id,
        kpi_id: kpi.id,
        period_year: review.year,
        period_quarter: quarterKey,
        period_type: 'quarterly',
        actual_value: kpi.actual,
        target_value: kpi.target || null,
        notes: `Recorded during Q${review.quarter} ${review.year} Quarterly Review`
      }));

    if (kpiActuals.length === 0) return;

    // Upsert to kpi_actuals table
    const { error } = await supabase
      .from('kpi_actuals')
      .upsert(kpiActuals, {
        onConflict: 'business_id,kpi_id,period_year,period_quarter,period_month,period_type'
      });

    if (error) {
      console.error('Error saving KPI actuals:', error);
      // Don't throw - this is supplementary, shouldn't block completion
    }
  }

  /**
   * Create a quarterly snapshot capturing the state at end of quarter
   */
  async createQuarterlySnapshot(review: QuarterlyReview): Promise<void> {
    const supabase = this.getSupabase();

    // Build financial snapshot
    const financialSnapshot = {
      revenue: {
        target: review.dashboard_snapshot?.revenue?.target || 0,
        actual: review.dashboard_snapshot?.revenue?.actual || 0,
        variance: review.dashboard_snapshot?.revenue?.variance || 0
      },
      grossProfit: {
        target: review.dashboard_snapshot?.grossProfit?.target || 0,
        actual: review.dashboard_snapshot?.grossProfit?.actual || 0,
        variance: review.dashboard_snapshot?.grossProfit?.variance || 0
      },
      netProfit: {
        target: review.dashboard_snapshot?.netProfit?.target || 0,
        actual: review.dashboard_snapshot?.netProfit?.actual || 0,
        variance: review.dashboard_snapshot?.netProfit?.variance || 0
      },
      coreMetrics: review.dashboard_snapshot?.coreMetrics || {}
    };

    // Build KPIs snapshot
    const kpisSnapshot = review.dashboard_snapshot?.kpis || [];

    // Build initiatives snapshot from rocks
    const initiativesSnapshot = review.quarterly_rocks?.map(r => ({
      id: r.id,
      title: r.title,
      owner: r.owner,
      status: r.status,
      progressPercentage: r.progressPercentage || 0,
      successCriteria: r.successCriteria
    })) || [];

    // Calculate completion stats
    const completedCount = review.quarterly_rocks?.filter(r => r.status === 'completed').length || 0;
    const totalCount = review.quarterly_rocks?.length || 0;
    const completionRate = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

    // Build snapshot data matching existing schema
    const snapshotData = {
      business_id: review.business_id,
      user_id: review.user_id,
      snapshot_year: review.year,
      snapshot_quarter: `Q${review.quarter}`,

      // Initiative stats
      total_initiatives: totalCount,
      completed_initiatives: completedCount,
      in_progress_initiatives: review.quarterly_rocks?.filter(r => r.status === 'on_track' || r.status === 'at_risk').length || 0,
      cancelled_initiatives: 0,
      completion_rate: completionRate,

      // Snapshots as JSONB
      initiatives_snapshot: initiativesSnapshot,
      kpis_snapshot: kpisSnapshot,
      financial_snapshot: financialSnapshot,

      // Qualitative reflections from action replay
      wins: review.action_replay?.worked?.join('\n') || null,
      challenges: review.action_replay?.didntWork?.join('\n') || null,
      learnings: review.action_replay?.keyInsight || null,
      overall_reflection: review.confidence_notes || null
    };

    // Upsert to quarterly_snapshots table
    const { error } = await supabase
      .from('quarterly_snapshots')
      .upsert(snapshotData, {
        onConflict: 'business_id,snapshot_year,snapshot_quarter'
      });

    if (error) {
      console.error('Error creating quarterly snapshot:', error);
      // Don't throw - this is supplementary, shouldn't block completion
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Batch Update (for auto-save)
  // ═══════════════════════════════════════════════════════════════

  async updateReview(id: string, data: Partial<QuarterlyReview>): Promise<QuarterlyReview> {
    // Remove read-only fields
    const { id: _, created_at, updated_at, ...updateData } = data as QuarterlyReview;

    const { data: updated, error } = await this.getSupabase()
      .from('quarterly_reviews')
      .update(updateData)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      console.error('Error updating review:', error);
      throw error;
    }

    if (!updated) {
      throw new Error('Review not found or access denied');
    }

    return updated;
  }
}

// Export singleton instance
export const quarterlyReviewService = new QuarterlyReviewService();
