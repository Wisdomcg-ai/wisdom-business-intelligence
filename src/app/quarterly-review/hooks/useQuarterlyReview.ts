'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useBusinessContext } from '@/contexts/BusinessContext';
import { quarterlyReviewService } from '../services/quarterly-review-service';
import { strategicSyncService } from '../services/strategic-sync-service';
import type {
  QuarterlyReview,
  QuarterNumber,
  WorkshopStep,
  ReviewType,
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
  ActionItem,
  YearInReview,
  VisionStrategyCheck,
  NextYearTargets,
  AnnualInitiativePlan
} from '../types';
import {
  WORKSHOP_STEPS,
  getWorkshopSteps,
  getCurrentQuarter,
  getDefaultActionReplay,
  getDefaultFeedbackLoop,
  getDefaultQuarterlyTargets,
  getDefaultInitiativesChanges,
  getDefaultPersonalCommitments
} from '../types';

interface UseQuarterlyReviewOptions {
  businessId?: string;
  quarter?: QuarterNumber;
  year?: number;
  reviewId?: string;
  reviewType?: ReviewType;
}

interface UseQuarterlyReviewReturn {
  // State
  review: QuarterlyReview | null;
  isLoading: boolean;
  error: string | null;
  isSaving: boolean;
  hasUnsavedChanges: boolean;
  reviewType: ReviewType;

  // Quarter info
  quarter: QuarterNumber;
  year: number;
  quarterLabel: string;

  // Progress
  currentStep: WorkshopStep;
  stepsCompleted: WorkshopStep[];
  progressPercentage: number;
  canNavigateToStep: (step: WorkshopStep) => boolean;

  // Actions
  initReview: () => Promise<void>;
  saveReview: () => Promise<void>;
  goToStep: (step: WorkshopStep) => Promise<void>;
  completeCurrentStep: () => Promise<void>;
  startWorkshop: () => Promise<void>;
  completeWorkshop: () => Promise<void>;

  // Pre-work
  updatePreWork: (data: Partial<QuarterlyReview>) => void;
  completePreWork: () => Promise<void>;

  // Part 1: Reflection
  updateDashboardSnapshot: (snapshot: DashboardSnapshot) => void;
  updateActionReplay: (actionReplay: ActionReplay) => void;
  updateRocksReview: (rocks: RockReviewItem[]) => void;
  updateScorecardCommentary: (commentary: string) => void;

  // Part 2: Analysis
  updateFeedbackLoop: (feedbackLoop: FeedbackLoop) => void;
  updateFeedbackLoopMode: (mode: FeedbackLoopMode) => void;
  updateOpenLoopsDecisions: (decisions: OpenLoopDecisionRecord[]) => void;
  updateIssuesResolved: (issues: IssueResolution[]) => void;
  updateCustomerPulse: (pulse: CustomerPulse) => void;
  updatePeopleReview: (review: PeopleReview) => void;

  // Part 3: Strategic Review
  updateAssessmentSnapshot: (snapshot: AssessmentSnapshot) => void;
  updateRoadmapSnapshot: (snapshot: RoadmapSnapshot) => void;
  updateSwotAnalysisId: (id: string | null) => void;
  updateConfidence: (data: {
    confidence: number;
    notes: string;
    adjusted: boolean;
    ytdRevenue: number | null;
    ytdGrossProfit: number | null;
    ytdNetProfit: number | null;
  }) => void;

  // Part 4: Planning
  updateAnnualPlanSnapshot: (snapshot: AnnualPlanSnapshot) => void;
  updateRealignmentDecision: (decision: RealignmentData) => void;
  updateInitiativeDecisions: (decisions: InitiativeDecision[]) => void;
  updateQuarterlyTargets: (targets: QuarterlyTargets) => void;
  updateInitiativesChanges: (changes: InitiativesChanges) => void;
  updateQuarterlyRocks: (rocks: Rock[]) => void;
  updatePersonalCommitments: (commitments: PersonalCommitments) => void;
  updateOneThing: (answer: string) => void;

  // Annual Review (Option C)
  updateYearInReview: (data: YearInReview) => void;
  updateVisionStrategy: (data: VisionStrategyCheck) => void;
  updateNextYearTargets: (data: NextYearTargets) => void;
  updateAnnualInitiativePlan: (data: AnnualInitiativePlan) => void;

  // Cross-cutting
  updateCoachNotes: (notes: CoachNotes) => void;
  updateActionItems: (items: ActionItem[]) => void;
}

export function useQuarterlyReview(options: UseQuarterlyReviewOptions = {}): UseQuarterlyReviewReturn {
  const supabase = createClient();
  const { activeBusiness } = useBusinessContext();

  // Determine quarter/year
  const currentQtr = getCurrentQuarter();
  const targetQuarter = options.quarter || currentQtr.quarter;
  const targetYear = options.year || currentQtr.year;

  // State
  const [review, setReview] = useState<QuarterlyReview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [businessId, setBusinessId] = useState<string | null>(options.businessId || null);
  const [userId, setUserId] = useState<string | null>(null);

  // Review type from options or from loaded review
  const reviewType: ReviewType = review?.review_type || options.reviewType || 'quarterly';
  const workshopSteps = useMemo(() => getWorkshopSteps(reviewType), [reviewType]);

  // Sync debounce ref
  const syncTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Get user and business on mount
  useEffect(() => {
    const getUserAndBusiness = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('Not authenticated');
        setIsLoading(false);
        return;
      }
      setUserId(user.id);

      if (options.businessId) {
        setBusinessId(options.businessId);
      } else if (activeBusiness?.id) {
        setBusinessId(activeBusiness.id);
      } else {
        const { data: business } = await supabase
          .from('businesses')
          .select('id')
          .eq('owner_id', user.id)
          .maybeSingle();

        if (business) {
          setBusinessId(business.id);
        } else {
          setError('No business found');
          setIsLoading(false);
        }
      }
    };

    getUserAndBusiness();
  }, [options.businessId, supabase, activeBusiness?.id]);

  // Initialize or fetch review
  const initReview = useCallback(async () => {
    if (!businessId || !userId) return;

    setIsLoading(true);
    setError(null);

    try {
      let data;
      if (options.reviewId) {
        data = await quarterlyReviewService.getReviewById(options.reviewId);
      } else {
        data = await quarterlyReviewService.getOrCreateReview(
          businessId,
          userId,
          targetQuarter,
          targetYear,
          options.reviewType
        );
      }

      if (data) {
        // Migrate step IDs from old 6-step Part 4 to new 5-step Part 4
        const stepMigration: Record<string, string> = {
          '4.2': '4.1',
          '4.3': '4.2',
          '4.4': '4.2',
          '4.5': '4.3',
          '4.6': '4.4',
        };

        if (data.current_step && stepMigration[data.current_step]) {
          data = { ...data, current_step: stepMigration[data.current_step] as WorkshopStep };
        }

        if (data.steps_completed) {
          const migratedSteps = data.steps_completed.map((s: string) =>
            (stepMigration[s] || s) as WorkshopStep
          );
          data = { ...data, steps_completed: [...new Set(migratedSteps)] as WorkshopStep[] };
        }
      }

      setReview(data);
    } catch (err) {
      console.error('Error initializing review:', err);
      setError('Failed to load quarterly review');
    } finally {
      setIsLoading(false);
    }
  }, [businessId, userId, targetQuarter, targetYear, options.reviewId, options.reviewType]);

  // Fetch review when businessId is available
  useEffect(() => {
    if (businessId && userId) {
      initReview();
    }
  }, [businessId, userId, initReview]);

  // Save review
  const saveReview = useCallback(async () => {
    if (!review) return;

    setIsSaving(true);
    try {
      const updated = await quarterlyReviewService.updateReview(review.id, review);
      setReview(updated);
      setHasUnsavedChanges(false);
    } catch (err) {
      console.error('Error saving review:', err);
      setError('Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  }, [review]);

  // Auto-save when there are unsaved changes (debounced)
  useEffect(() => {
    if (!hasUnsavedChanges || !review) return;

    const timer = setTimeout(() => {
      saveReview();
    }, 2000);

    return () => clearTimeout(timer);
  }, [hasUnsavedChanges, review, saveReview]);

  // Two-way sync: after auto-save completes on steps 4.2 and 4.3, sync to strategic plan
  useEffect(() => {
    if (hasUnsavedChanges || !review || !businessId || !userId) return;
    const step = review.current_step;
    if (step !== '4.2' && step !== '4.3') return;

    // Debounce sync to 5 seconds after save completes
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(async () => {
      try {
        if (step === '4.2') {
          // Sync initiative decisions and quarterly targets
          const qKey = `q${review.quarter}`;
          await strategicSyncService.syncInitiativeChanges(businessId, userId, review.initiative_decisions || []);
          await strategicSyncService.syncQuarterlyTargets(businessId, review.quarterly_targets || { revenue: 0, grossProfit: 0, netProfit: 0, kpis: [] }, qKey);
        } else if (step === '4.3') {
          // Sync rocks
          await strategicSyncService.syncRocks(businessId, userId, review.quarterly_rocks || []);
        }
      } catch (err) {
        console.error('[Sync] Background sync failed:', err);
      }
    }, 5000);

    return () => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    };
  }, [hasUnsavedChanges, review?.current_step, businessId, userId]);

  // Progress calculations - use dynamic step list based on review type
  const progressPercentage = useMemo(() => {
    if (!review) return 0;
    const completed = (review.steps_completed || []).filter(s => s !== 'complete').length;
    const total = workshopSteps.length - 1; // Exclude 'complete'
    return Math.min(100, Math.round((completed / total) * 100));
  }, [review, workshopSteps]);

  const canNavigateToStep = useCallback((step: WorkshopStep): boolean => {
    if (!review) return false;
    if (step === 'prework') return true;

    const stepIndex = workshopSteps.indexOf(step);
    if (stepIndex === -1) return false;
    const completedSteps = review.steps_completed || [];

    if (completedSteps.includes(step)) return true;

    let lastCompletedIndex = -1;
    for (let i = workshopSteps.length - 1; i >= 0; i--) {
      if (completedSteps.includes(workshopSteps[i])) {
        lastCompletedIndex = i;
        break;
      }
    }

    return stepIndex <= lastCompletedIndex + 1;
  }, [review, workshopSteps]);

  // Navigation
  const goToStep = useCallback(async (step: WorkshopStep) => {
    if (!review || !canNavigateToStep(step)) return;

    setReview(prev => prev ? { ...prev, current_step: step } : null);
    await quarterlyReviewService.updateProgress(review.id, step, review.steps_completed);
  }, [review, canNavigateToStep]);

  const completeCurrentStep = useCallback(async () => {
    if (!review) return;

    const currentIndex = workshopSteps.indexOf(review.current_step);
    const nextStep = workshopSteps[currentIndex + 1] || 'complete';

    const updated = await quarterlyReviewService.completeStep(
      review.id,
      review.current_step,
      nextStep
    );
    setReview(updated);
  }, [review, workshopSteps]);

  const startWorkshop = useCallback(async () => {
    if (!review) return;
    const updated = await quarterlyReviewService.startWorkshop(review.id);
    setReview(updated);
  }, [review]);

  const completeWorkshop = useCallback(async () => {
    if (!review || !businessId || !userId) return;

    // Final sync to strategic plan tables before completing
    try {
      await strategicSyncService.syncAll(
        businessId,
        userId,
        review.initiative_decisions || [],
        review.quarterly_targets || { revenue: 0, grossProfit: 0, netProfit: 0, kpis: [] },
        `q${review.quarter}`,
        review.quarterly_rocks || [],
        (review.initiatives_changes?.added || []).map(a => ({
          title: a.title,
          category: a.category,
        }))
      );
    } catch (err) {
      console.error('[Sync] Final sync on complete failed:', err);
    }

    const updated = await quarterlyReviewService.completeWorkshop(review.id);
    setReview(updated);
  }, [review, businessId, userId]);

  // Update helpers that set local state and mark unsaved
  const updateLocalState = useCallback((updater: (prev: QuarterlyReview) => QuarterlyReview) => {
    setReview(prev => {
      if (!prev) return null;
      return updater(prev);
    });
    setHasUnsavedChanges(true);
  }, []);

  // Pre-work updates
  const updatePreWork = useCallback((data: Partial<QuarterlyReview>) => {
    updateLocalState(prev => ({ ...prev, ...data }));
  }, [updateLocalState]);

  const completePreWork = useCallback(async () => {
    if (!review) return;
    await saveReview();
    const updated = await quarterlyReviewService.completePreWork(review.id);
    setReview(updated);
  }, [review, saveReview]);

  // Part 1 updates
  const updateDashboardSnapshot = useCallback((snapshot: DashboardSnapshot) => {
    updateLocalState(prev => ({ ...prev, dashboard_snapshot: snapshot }));
  }, [updateLocalState]);

  const updateActionReplay = useCallback((actionReplay: ActionReplay) => {
    updateLocalState(prev => ({ ...prev, action_replay: actionReplay }));
  }, [updateLocalState]);

  const updateRocksReview = useCallback((rocks: RockReviewItem[]) => {
    updateLocalState(prev => ({ ...prev, rocks_review: rocks }));
  }, [updateLocalState]);

  const updateScorecardCommentary = useCallback((commentary: string) => {
    updateLocalState(prev => ({ ...prev, scorecard_commentary: commentary }));
  }, [updateLocalState]);

  // Part 2 updates
  const updateFeedbackLoop = useCallback((feedbackLoop: FeedbackLoop) => {
    updateLocalState(prev => ({ ...prev, feedback_loop: feedbackLoop }));
  }, [updateLocalState]);

  const updateFeedbackLoopMode = useCallback((mode: FeedbackLoopMode) => {
    updateLocalState(prev => ({ ...prev, feedback_loop_mode: mode }));
  }, [updateLocalState]);

  const updateOpenLoopsDecisions = useCallback((decisions: OpenLoopDecisionRecord[]) => {
    updateLocalState(prev => ({ ...prev, open_loops_decisions: decisions }));
  }, [updateLocalState]);

  const updateIssuesResolved = useCallback((issues: IssueResolution[]) => {
    updateLocalState(prev => ({ ...prev, issues_resolved: issues }));
  }, [updateLocalState]);

  const updateCustomerPulse = useCallback((pulse: CustomerPulse) => {
    updateLocalState(prev => ({ ...prev, customer_pulse: pulse }));
  }, [updateLocalState]);

  const updatePeopleReview = useCallback((peopleReview: PeopleReview) => {
    updateLocalState(prev => ({ ...prev, people_review: peopleReview }));
  }, [updateLocalState]);

  // Part 3 updates
  const updateAssessmentSnapshot = useCallback((snapshot: AssessmentSnapshot) => {
    updateLocalState(prev => ({ ...prev, assessment_snapshot: snapshot }));
  }, [updateLocalState]);

  const updateRoadmapSnapshot = useCallback((snapshot: RoadmapSnapshot) => {
    updateLocalState(prev => ({ ...prev, roadmap_snapshot: snapshot }));
  }, [updateLocalState]);

  const updateSwotAnalysisId = useCallback((id: string | null) => {
    updateLocalState(prev => ({ ...prev, swot_analysis_id: id }));
  }, [updateLocalState]);

  const updateConfidence = useCallback((data: {
    confidence: number;
    notes: string;
    adjusted: boolean;
    ytdRevenue: number | null;
    ytdGrossProfit: number | null;
    ytdNetProfit: number | null;
  }) => {
    updateLocalState(prev => ({
      ...prev,
      annual_target_confidence: data.confidence,
      confidence_notes: data.notes,
      targets_adjusted: data.adjusted,
      ytd_revenue_annual: data.ytdRevenue,
      ytd_gross_profit_annual: data.ytdGrossProfit,
      ytd_net_profit_annual: data.ytdNetProfit
    }));
  }, [updateLocalState]);

  // Part 4 updates
  const updateAnnualPlanSnapshot = useCallback((snapshot: AnnualPlanSnapshot) => {
    updateLocalState(prev => ({ ...prev, annual_plan_snapshot: snapshot }));
  }, [updateLocalState]);

  const updateRealignmentDecision = useCallback((decision: RealignmentData) => {
    updateLocalState(prev => ({ ...prev, realignment_decision: decision }));
  }, [updateLocalState]);

  const updateInitiativeDecisions = useCallback((decisions: InitiativeDecision[]) => {
    updateLocalState(prev => ({ ...prev, initiative_decisions: decisions }));
  }, [updateLocalState]);

  const updateQuarterlyTargets = useCallback((targets: QuarterlyTargets) => {
    updateLocalState(prev => ({ ...prev, quarterly_targets: targets }));
  }, [updateLocalState]);

  const updateInitiativesChanges = useCallback((changes: InitiativesChanges) => {
    updateLocalState(prev => ({ ...prev, initiatives_changes: changes }));
  }, [updateLocalState]);

  const updateQuarterlyRocks = useCallback((rocks: Rock[]) => {
    updateLocalState(prev => ({ ...prev, quarterly_rocks: rocks }));
  }, [updateLocalState]);

  const updatePersonalCommitments = useCallback((commitments: PersonalCommitments) => {
    updateLocalState(prev => ({ ...prev, personal_commitments: commitments }));
  }, [updateLocalState]);

  const updateOneThing = useCallback((answer: string) => {
    updateLocalState(prev => ({ ...prev, one_thing_answer: answer }));
  }, [updateLocalState]);

  // Annual Review (Option C) updates
  const updateYearInReview = useCallback((data: YearInReview) => {
    updateLocalState(prev => ({ ...prev, year_in_review: data }));
  }, [updateLocalState]);

  const updateVisionStrategy = useCallback((data: VisionStrategyCheck) => {
    updateLocalState(prev => ({ ...prev, vision_strategy: data }));
  }, [updateLocalState]);

  const updateNextYearTargets = useCallback((data: NextYearTargets) => {
    updateLocalState(prev => ({ ...prev, next_year_targets: data }));
  }, [updateLocalState]);

  const updateAnnualInitiativePlan = useCallback((data: AnnualInitiativePlan) => {
    updateLocalState(prev => ({ ...prev, annual_initiative_plan: data }));
  }, [updateLocalState]);

  // Cross-cutting updates
  const updateCoachNotes = useCallback((notes: CoachNotes) => {
    updateLocalState(prev => ({ ...prev, coach_notes: notes }));
  }, [updateLocalState]);

  const updateActionItems = useCallback((items: ActionItem[]) => {
    updateLocalState(prev => ({ ...prev, action_items: items }));
  }, [updateLocalState]);

  return {
    // State
    review,
    isLoading,
    error,
    isSaving,
    hasUnsavedChanges,
    reviewType,

    // Quarter info
    quarter: targetQuarter,
    year: targetYear,
    quarterLabel: `Q${targetQuarter} ${targetYear}`,

    // Progress
    currentStep: review?.current_step || 'prework',
    stepsCompleted: review?.steps_completed || [],
    progressPercentage,
    canNavigateToStep,

    // Actions
    initReview,
    saveReview,
    goToStep,
    completeCurrentStep,
    startWorkshop,
    completeWorkshop,

    // Pre-work
    updatePreWork,
    completePreWork,

    // Part 1
    updateDashboardSnapshot,
    updateActionReplay,
    updateRocksReview,
    updateScorecardCommentary,

    // Part 2
    updateFeedbackLoop,
    updateFeedbackLoopMode,
    updateOpenLoopsDecisions,
    updateIssuesResolved,
    updateCustomerPulse,
    updatePeopleReview,

    // Part 3
    updateAssessmentSnapshot,
    updateRoadmapSnapshot,
    updateSwotAnalysisId,
    updateConfidence,

    // Part 4
    updateAnnualPlanSnapshot,
    updateRealignmentDecision,
    updateInitiativeDecisions,
    updateQuarterlyTargets,
    updateInitiativesChanges,
    updateQuarterlyRocks,
    updatePersonalCommitments,
    updateOneThing,

    // Annual Review (Option C)
    updateYearInReview,
    updateVisionStrategy,
    updateNextYearTargets,
    updateAnnualInitiativePlan,

    // Cross-cutting
    updateCoachNotes,
    updateActionItems
  };
}
