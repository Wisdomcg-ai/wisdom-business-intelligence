// Quarterly Review Workshop Types
// Based on Matt Malouf's Wisdom Consulting Group methodology
// Restructured: 19 steps across 4 parts (quarterly) or 5 parts (annual)

export type QuarterNumber = 1 | 2 | 3 | 4;
export type WorkshopStatus = 'not_started' | 'prework_complete' | 'in_progress' | 'completed';
export type ReviewType = 'quarterly' | 'annual' | 'mid-year';

export type WorkshopStep =
  | 'prework'
  | '1.1' | '1.2' | '1.3' | '1.4'  // Part 1: Reflect
  | '2.1' | '2.2' | '2.3' | '2.4' | '2.5'  // Part 2: Analyse
  | '3.1' | '3.2'  // Part 3: Strategic Review
  | 'A4.1' | 'A4.2' | 'A4.3' | 'A4.4'  // Part 4: Annual Planning (annual-only)
  | '4.1' | '4.2' | '4.3' | '4.4'  // Part 4/5: Plan (quarterly) / Next Quarter (annual)
  | 'complete';

// Standard quarterly review steps
export const WORKSHOP_STEPS: WorkshopStep[] = [
  'prework',
  '1.1', '1.2', '1.3', '1.4',
  '2.1', '2.2', '2.3', '2.4', '2.5',
  '3.1', '3.2',
  '4.1', '4.2', '4.3', '4.4',
  'complete'
];

// Annual review steps (includes annual planning between Part 3 and Part 4)
export const ANNUAL_WORKSHOP_STEPS: WorkshopStep[] = [
  'prework',
  '1.1', '1.2', '1.3', '1.4',           // Part 1: Reflect
  '2.1', '2.2', '2.3', '2.4', '2.5',    // Part 2: Analyse
  '3.1', '3.2',                           // Part 3: Strategic Review
  'A4.1', 'A4.2', 'A4.3', 'A4.4',       // Part 4: Annual Planning (annual-only)
  '4.1', '4.2', '4.3', '4.4',           // Part 5: Next Quarter Sprint
  'complete'
];

/**
 * Get the correct workshop steps based on review type
 */
export const getWorkshopSteps = (reviewType: ReviewType = 'quarterly'): WorkshopStep[] => {
  return reviewType === 'annual' ? ANNUAL_WORKSHOP_STEPS : WORKSHOP_STEPS;
};

export const STEP_LABELS: Record<WorkshopStep, string> = {
  'prework': 'Pre-Work Questionnaire',
  '1.1': 'Pre-Work Review',
  '1.2': 'Scorecard Review',
  '1.3': 'Rocks Accountability',
  '1.4': 'Action Replay',
  '2.1': 'Feedback Loop Framework',
  '2.2': 'Open Loops Audit',
  '2.3': 'Issues List (IDS)',
  '2.4': 'Customer Pulse',
  '2.5': 'People Review',
  '3.1': 'Assessment & Roadmap',
  '3.2': 'SWOT Update',
  // Annual-only steps
  'A4.1': 'Year in Review',
  'A4.2': 'Vision & Strategy Check',
  'A4.3': 'Next Year Targets',
  'A4.4': 'Annual Initiative Plan',
  // Regular Part 4 (becomes Part 5 in annual)
  '4.1': 'Annual Plan & Confidence',
  '4.2': 'Quarterly Plan',
  '4.3': 'Sprint Planning',
  '4.4': 'Session Close',
  'complete': 'Review Complete'
};

export const PART_LABELS: Record<string, string> = {
  '1': 'Reflect',
  '2': 'Analyse',
  '3': 'Strategic Review',
  '4': 'Plan'
};

// Annual review uses 5 parts
export const ANNUAL_PART_LABELS: Record<string, string> = {
  '1': 'Reflect',
  '2': 'Analyse',
  '3': 'Strategic Review',
  'A4': 'Annual Planning',
  '5': 'Next Quarter'
};

/**
 * Get the part label based on review type
 */
export const getPartLabel = (part: string, reviewType: ReviewType = 'quarterly'): string => {
  if (reviewType === 'annual') {
    return ANNUAL_PART_LABELS[part] || PART_LABELS[part] || part;
  }
  return PART_LABELS[part] || part;
};

/**
 * Get the part number for a given step in context of review type
 */
export const getStepPart = (step: WorkshopStep, reviewType: ReviewType = 'quarterly'): string => {
  if (step === 'prework' || step === 'complete') return '';
  if (step.startsWith('A4.')) return 'A4';
  const part = step.split('.')[0];
  // In annual reviews, regular Part 4 becomes Part 5
  if (reviewType === 'annual' && part === '4') return '5';
  return part;
};

export const PART_DURATIONS: Record<string, number> = {
  '1': 55,
  '2': 70,
  '3': 25,
  '4': 75,
  'A4': 90,
  '5': 75
};

/**
 * Check if current quarter is the last quarter of the year
 */
export const isLastQuarterOfYear = (quarter: QuarterNumber): boolean => {
  return quarter === 4;
};

// Feedback Loop Areas
export type FeedbackLoopArea = 'marketing' | 'sales' | 'operations' | 'finances' | 'people' | 'owner';
export type FeedbackLoopColumn = 'stop' | 'less' | 'continue' | 'more' | 'start';
export type FeedbackLoopMode = 'business_wide' | 'by_area';

export const FEEDBACK_LOOP_AREAS: FeedbackLoopArea[] = ['marketing', 'sales', 'operations', 'finances', 'people', 'owner'];
// Simplified to 3 essential columns (less/more kept in type for backwards compatibility)
export const FEEDBACK_LOOP_COLUMNS: FeedbackLoopColumn[] = ['stop', 'continue', 'start'];

export const FEEDBACK_LOOP_AREA_LABELS: Record<FeedbackLoopArea, string> = {
  marketing: 'Marketing',
  sales: 'Sales',
  operations: 'Operations',
  finances: 'Finances',
  people: 'People',
  owner: 'Owner'
};

export const FEEDBACK_LOOP_COLUMN_LABELS: Record<FeedbackLoopColumn, string> = {
  stop: 'Stop',
  less: 'Do Less',
  continue: 'Continue',
  more: 'Do More Of',
  start: 'Start'
};

export const FEEDBACK_LOOP_COLUMN_COLORS: Record<FeedbackLoopColumn, string> = {
  stop: 'bg-red-50 border-red-200',
  less: 'bg-slate-50 border-gray-200',
  continue: 'bg-green-50 border-green-200',
  more: 'bg-slate-50 border-gray-200',
  start: 'bg-blue-50 border-blue-200'
};

// Open Loop Decision Types
export type OpenLoopDecision = 'complete' | 'delegate' | 'delete' | 'defer';

export const OPEN_LOOP_DECISION_LABELS: Record<OpenLoopDecision, string> = {
  complete: 'Complete (schedule it)',
  delegate: 'Delegate (assign owner)',
  delete: 'Delete (let go)',
  defer: 'Defer (to specific date)'
};

// ═══════════════════════════════════════════════════════════════
// New Enums for Restructured Workshop
// ═══════════════════════════════════════════════════════════════

export type RockReviewDecision = 'completed' | 'carry_forward' | 'drop' | 'modify';
export type RealignmentChoice = 'keep_targets' | 'adjust_targets';
export type InitiativeAction = 'keep' | 'accelerate' | 'defer' | 'kill';
export type PersonAction = 'retain' | 'develop' | 'performance_manage' | 'replace';

// ═══════════════════════════════════════════════════════════════
// New Interfaces for Restructured Workshop
// ═══════════════════════════════════════════════════════════════

// Step 1.3: Rocks Accountability
export interface RockReviewItem {
  rockId: string;
  title: string;
  owner: string;
  successCriteria: string;
  progressPercentage: number;
  decision: RockReviewDecision;
  outcomeNarrative: string;
  lessonsLearned: string;
}

// Step 2.4: Customer Pulse
export interface CustomerPulse {
  compliments: string[];
  complaints: string[];
  trends: string[];
  notes: string;
}

// Step 2.5: People Review
export interface PersonAssessment {
  name: string;
  role: string;
  action: PersonAction;
  notes: string;
}

export interface HiringNeed {
  role: string;
  priority: 'urgent' | 'next_quarter' | 'future';
  notes: string;
}

export interface PeopleReview {
  assessments: PersonAssessment[];
  hiringNeeds: HiringNeed[];
  capacityNotes: string;
  trainingNeeds: string;
}

// Step 4.1: Annual Plan Review
export interface AnnualPlanSnapshot {
  yearType: 'FY' | 'CY';
  planYear: number;
  currentQuarter: number;
  remainingQuarters: number;
  annualTargets: {
    revenue: number;
    grossProfit: number;
    netProfit: number;
  };
  ytdActuals: {
    revenue: number;
    grossProfit: number;
    netProfit: number;
  };
  remaining: {
    revenue: number;
    grossProfit: number;
    netProfit: number;
  };
  runRateNeeded: {
    revenue: number;
    grossProfit: number;
    netProfit: number;
  };
  strategicInitiatives: Array<{
    id: string;
    title: string;
    status: string;
    progressPercentage: number;
  }>;
}

// Step 4.2: Confidence & Realignment
export interface RealignmentData {
  choice: RealignmentChoice;
  executionChanges: string[];
  adjustedTargets?: {
    revenue: number;
    grossProfit: number;
    netProfit: number;
  };
  rationale: string;
}

// Step 4.3: Initiative Review
export interface InitiativeDecision {
  initiativeId: string;
  title: string;
  category: string;
  currentStatus: string;
  progressPercentage: number;
  decision: InitiativeAction;
  notes: string;
  quarterAssigned?: string;
  source?: 'strategic_ideas' | 'roadmap' | string;
  ideaType?: 'strategic' | 'operational';
  reviewedInStep1?: boolean;
  completedInStep1?: boolean;
  rockReviewDecision?: string;
  // Sprint planning fields (added by Step 4.3)
  why?: string;
  outcome?: string;
  startDate?: string;
  endDate?: string;
  assignedTo?: string;
  milestones?: Array<{
    id: string;
    description: string;
    targetDate: string;
    isCompleted: boolean;
  }>;
  tasks?: Array<{
    id: string;
    task: string;
    assignedTo: string;
    minutesAllocated: number;
    dueDate: string;
    status: 'not_started' | 'in_progress' | 'done';
    order: number;
  }>;
  totalHours?: number;
}

// ═══════════════════════════════════════════════════════════════
// Annual Review Interfaces (Option C)
// ═══════════════════════════════════════════════════════════════

// Step A4.1: Year in Review
export interface YearInReview {
  annualFinancials: {
    revenue: { target: number; actual: number };
    grossProfit: { target: number; actual: number };
    netProfit: { target: number; actual: number };
  };
  rocksCompletionRate: number;
  totalRocksAllYear: number;
  completedRocksAllYear: number;
  biggestAnnualWin: string;
  biggestAnnualChallenge: string;
  stateOfBusiness: string;
  coachCommentary: string;
}

// Step A4.2: Vision & Strategy Check
export interface VisionStrategyCheck {
  currentVision: string;
  currentMission: string;
  coreValues: string[];
  stillAligned: boolean;
  proposedChanges: string;
  oneYearPriorities: string[];
  strategicShifts: string;
}

// Step A4.3: Next Year Targets
export interface NextYearTargets {
  nextYear: number;
  yearType: 'FY' | 'CY';
  revenue: number;
  grossProfit: number;
  netProfit: number;
  stretchRevenue?: number;
  stretchGrossProfit?: number;
  stretchNetProfit?: number;
  growthRateRevenue?: number;
  growthRateGrossProfit?: number;
  growthRateNetProfit?: number;
  notes: string;
}

// Step A4.4: Annual Initiative Plan (stored as JSONB)
export interface AnnualInitiativePlan {
  nextYear: number;
  yearType: 'FY' | 'CY';
  quarterlyTargets: {
    q1: { revenue: number; grossProfit: number; netProfit: number };
    q2: { revenue: number; grossProfit: number; netProfit: number };
    q3: { revenue: number; grossProfit: number; netProfit: number };
    q4: { revenue: number; grossProfit: number; netProfit: number };
  };
  initiatives: Array<{
    id: string;
    title: string;
    category: string;
    quarterAssigned: string;
    assignedTo?: string;
    notes?: string;
  }>;
}

// Coach Notes (keyed by step ID)
export interface CoachNotes {
  [stepId: string]: string;
}

// Action Items
export interface ActionItem {
  id: string;
  description: string;
  owner: string;
  dueDate: string;
  sourceStep: string;
  completed: boolean;
}

// ═══════════════════════════════════════════════════════════════
// Main Data Interface
// ═══════════════════════════════════════════════════════════════

export interface QuarterlyReview {
  id: string;
  business_id: string;
  user_id: string;
  quarter: QuarterNumber;
  year: number;
  review_type: ReviewType;

  // Pre-work
  prework_completed_at: string | null;
  last_quarter_rating: number | null;
  biggest_win: string | null;
  biggest_challenge: string | null;
  key_learning: string | null;
  hours_worked_avg: number | null;
  days_off_taken: number | null;
  energy_level: number | null;
  purpose_alignment: number | null;
  one_thing_for_success: string | null;
  coach_support_needed: string | null;

  // Part 1: Reflection
  dashboard_snapshot: DashboardSnapshot;
  action_replay: ActionReplay;
  rocks_review: RockReviewItem[];
  scorecard_commentary: string | null;

  // Part 2: Analysis
  feedback_loop: FeedbackLoop;
  feedback_loop_mode: FeedbackLoopMode;
  open_loops_decisions: OpenLoopDecisionRecord[];
  issues_resolved: IssueResolution[];
  customer_pulse: CustomerPulse;
  people_review: PeopleReview;

  // Part 3: Strategic
  assessment_snapshot: AssessmentSnapshot;
  roadmap_snapshot: RoadmapSnapshot;
  swot_analysis_id: string | null;
  annual_target_confidence: number | null;
  confidence_notes: string | null;
  targets_adjusted: boolean;
  // Annual YTD actuals for confidence check
  ytd_revenue_annual: number | null;
  ytd_gross_profit_annual: number | null;
  ytd_net_profit_annual: number | null;

  // Part 4: Planning
  annual_plan_snapshot: AnnualPlanSnapshot;
  realignment_decision: RealignmentData;
  initiative_decisions: InitiativeDecision[];
  quarterly_targets: QuarterlyTargets;
  initiatives_changes: InitiativesChanges;
  quarterly_rocks: Rock[];
  personal_commitments: PersonalCommitments;
  one_thing_answer: string | null;

  // Annual Review (Option C) - only populated for annual reviews
  year_in_review: YearInReview;
  vision_strategy: VisionStrategyCheck;
  next_year_targets: NextYearTargets;
  annual_initiative_plan: AnnualInitiativePlan;

  // Cross-cutting
  coach_notes: CoachNotes;
  action_items: ActionItem[];

  // Metadata
  current_step: WorkshopStep;
  steps_completed: WorkshopStep[];
  status: WorkshopStatus;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

// Part 1 Types
export interface DashboardSnapshot {
  revenue?: MetricSnapshot;
  grossProfit?: MetricSnapshot;
  netProfit?: MetricSnapshot;
  kpis?: KpiSnapshot[];
  // Core Business Metrics from Goals
  coreMetrics?: CoreMetricsSnapshot;
  rocksCompletion?: {
    completed: number;
    total: number;
    percentage: number;
    rocks?: Array<{
      title: string;
      completed: boolean;
      percentage?: number;
    }>;
  };
}

export interface CoreMetricsSnapshot {
  leadsPerMonth?: MetricSnapshot;
  conversionRate?: MetricSnapshot;
  avgTransactionValue?: MetricSnapshot;
  teamHeadcount?: MetricSnapshot;
  ownerHoursPerWeek?: MetricSnapshot;
}

export interface MetricSnapshot {
  target: number;
  actual: number;
  variance: number;
  percentageAchieved?: number;
}

export interface KpiSnapshot {
  id: string;
  name: string;
  target: number;
  actual: number;
  unit?: string;
}

export interface ActionReplay {
  worked: string[];
  didntWork: string[];
  plannedButDidnt: string[];
  newIdeas: string[];
  keyInsight: string;
}

// Part 2 Types
export interface FeedbackLoopAreaData {
  stop: string[];
  less: string[];
  continue: string[];
  more: string[];
  start: string[];
}

export interface FeedbackLoop {
  marketing: FeedbackLoopAreaData;
  sales: FeedbackLoopAreaData;
  operations: FeedbackLoopAreaData;
  finances: FeedbackLoopAreaData;
  people: FeedbackLoopAreaData;
  owner: FeedbackLoopAreaData;
  topPriorities: string[];
}

export interface OpenLoopDecisionRecord {
  loopId: string;
  title: string;
  decision: OpenLoopDecision;
  notes: string;
  deferToQuarter?: string;
  delegateTo?: string;
}

export interface IssueResolution {
  issueId: string;
  issue: string;
  solution: string;
  owner: string;
  dueDate: string;
}

// Part 3 Types
export interface AssessmentSnapshot {
  totalScore?: number;
  maxScore?: number;
  percentage?: number;
  engines?: Record<string, { score: number; max: number }>;
  assessmentDate?: string;
  retakeRequested?: boolean;
}

export interface RoadmapSnapshot {
  currentStage?: string;
  stageName?: string;
  revenue?: number;
  buildItemsComplete?: number;
  buildItemsTotal?: number;
  stageConfirmed?: boolean;
}

// Part 4 Types
export interface QuarterlyTargets {
  revenue: number;
  grossProfit: number;
  netProfit: number;
  kpis: Array<{
    id: string;
    name: string;
    target: number;
    unit?: string;
  }>;
}

export interface InitiativesChanges {
  carriedForward: string[];
  removed: string[];
  deferred: Array<{ id: string; toQuarter: string }>;
  added: Array<{ title: string; category: string; description?: string }>;
}

// Rock type aligned with Goals Wizard QuarterlyRock
export type RockStatus = 'not_started' | 'on_track' | 'at_risk' | 'completed' | 'missed';

export interface Rock {
  id: string;
  title: string;
  description?: string;
  owner: string;
  status: RockStatus;
  progressPercentage: number;
  linkedInitiatives?: string[];  // IDs of strategic initiatives
  linkedKPIs?: string[];         // IDs of KPIs this rock will impact
  successCriteria: string;       // Was doneDefinition
  startDate?: string;
  targetDate?: string;
  completionDate?: string;
  notes?: string;
  priority?: number;             // Optional priority for ordering
  // Backward compatibility
  doneDefinition?: string;       // @deprecated Use successCriteria
  linkedInitiativeId?: string;   // @deprecated Use linkedInitiatives[]
}

export interface PersonalCommitments {
  hoursPerWeekTarget: number | null;
  daysOffPlanned: number | null;
  daysOffScheduled: string[];
  personalGoal: string;
}

// ═══════════════════════════════════════════════════════════════
// Default Factories
// ═══════════════════════════════════════════════════════════════

export const getDefaultActionReplay = (): ActionReplay => ({
  worked: [],
  didntWork: [],
  plannedButDidnt: [],
  newIdeas: [],
  keyInsight: ''
});

export const getDefaultFeedbackLoopArea = (): FeedbackLoopAreaData => ({
  stop: [],
  less: [],
  continue: [],
  more: [],
  start: []
});

export const getDefaultFeedbackLoop = (): FeedbackLoop => ({
  marketing: getDefaultFeedbackLoopArea(),
  sales: getDefaultFeedbackLoopArea(),
  operations: getDefaultFeedbackLoopArea(),
  finances: getDefaultFeedbackLoopArea(),
  people: getDefaultFeedbackLoopArea(),
  owner: getDefaultFeedbackLoopArea(),
  topPriorities: []
});

export const getDefaultQuarterlyTargets = (): QuarterlyTargets => ({
  revenue: 0,
  grossProfit: 0,
  netProfit: 0,
  kpis: []
});

export const getDefaultInitiativesChanges = (): InitiativesChanges => ({
  carriedForward: [],
  removed: [],
  deferred: [],
  added: []
});

export const getDefaultPersonalCommitments = (): PersonalCommitments => ({
  hoursPerWeekTarget: null,
  daysOffPlanned: null,
  daysOffScheduled: [],
  personalGoal: ''
});

export const getDefaultCustomerPulse = (): CustomerPulse => ({
  compliments: [],
  complaints: [],
  trends: [],
  notes: ''
});

export const getDefaultPeopleReview = (): PeopleReview => ({
  assessments: [],
  hiringNeeds: [],
  capacityNotes: '',
  trainingNeeds: ''
});

export const getDefaultAnnualPlanSnapshot = (): AnnualPlanSnapshot => ({
  yearType: 'CY',
  planYear: new Date().getFullYear(),
  currentQuarter: 1,
  remainingQuarters: 3,
  annualTargets: { revenue: 0, grossProfit: 0, netProfit: 0 },
  ytdActuals: { revenue: 0, grossProfit: 0, netProfit: 0 },
  remaining: { revenue: 0, grossProfit: 0, netProfit: 0 },
  runRateNeeded: { revenue: 0, grossProfit: 0, netProfit: 0 },
  strategicInitiatives: []
});

export const getDefaultRealignmentData = (): RealignmentData => ({
  choice: 'keep_targets',
  executionChanges: [],
  rationale: ''
});

export const getDefaultYearInReview = (): YearInReview => ({
  annualFinancials: {
    revenue: { target: 0, actual: 0 },
    grossProfit: { target: 0, actual: 0 },
    netProfit: { target: 0, actual: 0 },
  },
  rocksCompletionRate: 0,
  totalRocksAllYear: 0,
  completedRocksAllYear: 0,
  biggestAnnualWin: '',
  biggestAnnualChallenge: '',
  stateOfBusiness: '',
  coachCommentary: '',
});

export const getDefaultVisionStrategyCheck = (): VisionStrategyCheck => ({
  currentVision: '',
  currentMission: '',
  coreValues: [],
  stillAligned: true,
  proposedChanges: '',
  oneYearPriorities: [],
  strategicShifts: '',
});

export const getDefaultNextYearTargets = (): NextYearTargets => ({
  nextYear: new Date().getFullYear() + 1,
  yearType: 'CY',
  revenue: 0,
  grossProfit: 0,
  netProfit: 0,
  notes: '',
});

export const getDefaultAnnualInitiativePlan = (): AnnualInitiativePlan => ({
  nextYear: new Date().getFullYear() + 1,
  yearType: 'CY',
  quarterlyTargets: {
    q1: { revenue: 0, grossProfit: 0, netProfit: 0 },
    q2: { revenue: 0, grossProfit: 0, netProfit: 0 },
    q3: { revenue: 0, grossProfit: 0, netProfit: 0 },
    q4: { revenue: 0, grossProfit: 0, netProfit: 0 },
  },
  initiatives: [],
});

// Year type (aligned with Goals Wizard)
export type YearType = 'FY' | 'CY';

// Quarter utilities
export const getQuarterLabel = (quarter: QuarterNumber, year: number): string => {
  return `Q${quarter} ${year}`;
};

/**
 * Get current quarter based on year type
 * - CY (Calendar Year): Q1=Jan-Mar, Q2=Apr-Jun, Q3=Jul-Sep, Q4=Oct-Dec
 * - FY (Fiscal Year - Australian): Q1=Jul-Sep, Q2=Oct-Dec, Q3=Jan-Mar, Q4=Apr-Jun
 */
export const getCurrentQuarter = (yearType: YearType = 'CY'): { quarter: QuarterNumber; year: number } => {
  const now = new Date();
  const month = now.getMonth(); // 0-11
  const calendarYear = now.getFullYear();

  if (yearType === 'FY') {
    // Australian Financial Year: Jul 1 - Jun 30
    // Q1: Jul-Sep (months 6-8), Q2: Oct-Dec (months 9-11), Q3: Jan-Mar (months 0-2), Q4: Apr-Jun (months 3-5)
    if (month >= 6 && month <= 8) return { quarter: 1, year: calendarYear + 1 }; // FY starts in July
    if (month >= 9 && month <= 11) return { quarter: 2, year: calendarYear + 1 };
    if (month >= 0 && month <= 2) return { quarter: 3, year: calendarYear };
    return { quarter: 4, year: calendarYear };
  }

  // Calendar Year: Standard Q1=Jan-Mar, etc.
  if (month < 3) return { quarter: 1, year: calendarYear };
  if (month < 6) return { quarter: 2, year: calendarYear };
  if (month < 9) return { quarter: 3, year: calendarYear };
  return { quarter: 4, year: calendarYear };
};

export const getNextQuarter = (yearType: YearType = 'CY'): { quarter: QuarterNumber; year: number } => {
  const current = getCurrentQuarter(yearType);
  if (current.quarter === 4) {
    return { quarter: 1, year: current.year + 1 };
  }
  return { quarter: (current.quarter + 1) as QuarterNumber, year: current.year };
};

export const getPreviousQuarter = (yearType: YearType = 'CY'): { quarter: QuarterNumber; year: number } => {
  const current = getCurrentQuarter(yearType);
  if (current.quarter === 1) {
    return { quarter: 4, year: current.year - 1 };
  }
  return { quarter: (current.quarter - 1) as QuarterNumber, year: current.year };
};

// Helper to get default Rock (aligned with Goals Wizard QuarterlyRock)
export const getDefaultRock = (): Rock => ({
  id: `rock-${Date.now()}`,
  title: '',
  owner: '',
  status: 'not_started',
  progressPercentage: 0,
  successCriteria: '',
  linkedInitiatives: [],
  linkedKPIs: []
});

// Strategic Initiative type for integration with Goals Wizard
export interface StrategicInitiativeRef {
  id: string;
  title: string;
  description?: string;
  category?: string;
  status?: 'not_started' | 'in_progress' | 'completed' | 'cancelled' | 'on_hold';
  progressPercentage?: number;
  quarterAssigned?: string;
}
