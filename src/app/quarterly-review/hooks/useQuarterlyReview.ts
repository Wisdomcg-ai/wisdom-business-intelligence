'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useBusinessContext } from '@/contexts/BusinessContext';
import { quarterlyReviewService } from '../services/quarterly-review-service';
import type {
  QuarterlyReview,
  QuarterNumber,
  WorkshopStep,
  ActionReplay,
  FeedbackLoop,
  DashboardSnapshot,
  AssessmentSnapshot,
  RoadmapSnapshot,
  QuarterlyTargets,
  InitiativesChanges,
  Rock,
  PersonalCommitments,
  OpenLoopDecisionRecord,
  IssueResolution
} from '../types';
import {
  WORKSHOP_STEPS,
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
}

interface UseQuarterlyReviewReturn {
  // State
  review: QuarterlyReview | null;
  isLoading: boolean;
  error: string | null;
  isSaving: boolean;
  hasUnsavedChanges: boolean;

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

  // Part 2: Analysis
  updateFeedbackLoop: (feedbackLoop: FeedbackLoop) => void;
  updateOpenLoopsDecisions: (decisions: OpenLoopDecisionRecord[]) => void;
  updateIssuesResolved: (issues: IssueResolution[]) => void;

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
  updateQuarterlyTargets: (targets: QuarterlyTargets) => void;
  updateInitiativesChanges: (changes: InitiativesChanges) => void;
  updateQuarterlyRocks: (rocks: Rock[]) => void;
  updatePersonalCommitments: (commitments: PersonalCommitments) => void;
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

      // Determine which business to use:
      // 1. If options.businessId is provided (explicit), use it
      // 2. If activeBusiness is set (coach viewing client), use it
      // 3. Otherwise, fetch user's own business
      if (options.businessId) {
        setBusinessId(options.businessId);
      } else if (activeBusiness?.id) {
        setBusinessId(activeBusiness.id);
      } else {
        // Fetch user's own business
        const { data: business } = await supabase
          .from('businesses')
          .select('id')
          .eq('owner_id', user.id)
          .single();

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
      if (options.reviewId) {
        const data = await quarterlyReviewService.getReviewById(options.reviewId);
        setReview(data);
      } else {
        const data = await quarterlyReviewService.getOrCreateReview(
          businessId,
          userId,
          targetQuarter,
          targetYear
        );
        setReview(data);
      }
    } catch (err) {
      console.error('Error initializing review:', err);
      setError('Failed to load quarterly review');
    } finally {
      setIsLoading(false);
    }
  }, [businessId, userId, targetQuarter, targetYear, options.reviewId]);

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

  // Progress calculations
  const progressPercentage = useMemo(() => {
    if (!review) return 0;
    // Exclude 'complete' from both counts to avoid >100%
    const completed = (review.steps_completed || []).filter(s => s !== 'complete').length;
    const total = WORKSHOP_STEPS.length - 1; // Exclude 'complete'
    return Math.min(100, Math.round((completed / total) * 100));
  }, [review]);

  const canNavigateToStep = useCallback((step: WorkshopStep): boolean => {
    if (!review) return false;
    if (step === 'prework') return true;

    const stepIndex = WORKSHOP_STEPS.indexOf(step);
    const completedSteps = review.steps_completed || [];

    // Can navigate to any completed step or the next uncompleted step
    if (completedSteps.includes(step)) return true;

    // Find the last completed step
    let lastCompletedIndex = -1;
    for (let i = WORKSHOP_STEPS.length - 1; i >= 0; i--) {
      if (completedSteps.includes(WORKSHOP_STEPS[i])) {
        lastCompletedIndex = i;
        break;
      }
    }

    // Can go to the next step after last completed
    return stepIndex <= lastCompletedIndex + 1;
  }, [review]);

  // Navigation
  const goToStep = useCallback(async (step: WorkshopStep) => {
    if (!review || !canNavigateToStep(step)) return;

    setReview(prev => prev ? { ...prev, current_step: step } : null);
    await quarterlyReviewService.updateProgress(review.id, step, review.steps_completed);
  }, [review, canNavigateToStep]);

  const completeCurrentStep = useCallback(async () => {
    if (!review) return;

    const currentIndex = WORKSHOP_STEPS.indexOf(review.current_step);
    const nextStep = WORKSHOP_STEPS[currentIndex + 1] || 'complete';

    const updated = await quarterlyReviewService.completeStep(
      review.id,
      review.current_step,
      nextStep
    );
    setReview(updated);
  }, [review]);

  const startWorkshop = useCallback(async () => {
    if (!review) return;
    const updated = await quarterlyReviewService.startWorkshop(review.id);
    setReview(updated);
  }, [review]);

  const completeWorkshop = useCallback(async () => {
    if (!review) return;
    const updated = await quarterlyReviewService.completeWorkshop(review.id);
    setReview(updated);
  }, [review]);

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
    await saveReview(); // Save any pending changes first
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

  // Part 2 updates
  const updateFeedbackLoop = useCallback((feedbackLoop: FeedbackLoop) => {
    updateLocalState(prev => ({ ...prev, feedback_loop: feedbackLoop }));
  }, [updateLocalState]);

  const updateOpenLoopsDecisions = useCallback((decisions: OpenLoopDecisionRecord[]) => {
    updateLocalState(prev => ({ ...prev, open_loops_decisions: decisions }));
  }, [updateLocalState]);

  const updateIssuesResolved = useCallback((issues: IssueResolution[]) => {
    updateLocalState(prev => ({ ...prev, issues_resolved: issues }));
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

  return {
    // State
    review,
    isLoading,
    error,
    isSaving,
    hasUnsavedChanges,

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

    // Part 2
    updateFeedbackLoop,
    updateOpenLoopsDecisions,
    updateIssuesResolved,

    // Part 3
    updateAssessmentSnapshot,
    updateRoadmapSnapshot,
    updateSwotAnalysisId,
    updateConfidence,

    // Part 4
    updateQuarterlyTargets,
    updateInitiativesChanges,
    updateQuarterlyRocks,
    updatePersonalCommitments
  };
}
