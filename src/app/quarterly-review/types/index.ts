// Quarterly Review Workshop Types
// Based on Matt Malouf's Wisdom Consulting Group methodology

export type QuarterNumber = 1 | 2 | 3 | 4;
export type WorkshopStatus = 'not_started' | 'prework_complete' | 'in_progress' | 'completed';
export type ReviewType = 'quarterly' | 'annual' | 'mid-year';

export type WorkshopStep =
  | 'prework'
  | '1.1' | '1.2'
  | '2.1' | '2.2' | '2.3'
  | '3.1' | '3.2' | '3.3'
  | '4.1' | '4.2'
  | 'complete';

export const WORKSHOP_STEPS: WorkshopStep[] = [
  'prework',
  '1.1', '1.2',  // 1.2 now includes Action Replay
  '2.1', '2.2', '2.3',
  '3.1', '3.2', '3.3',
  '4.1', '4.2',
  'complete'
];

export const STEP_LABELS: Record<WorkshopStep, string> = {
  'prework': 'Pre-Work Questionnaire',
  '1.1': 'Pre-Work Review',
  '1.2': 'Quarter Performance & Action Replay',
  '2.1': 'Feedback Loop Framework',
  '2.2': 'Open Loops Audit',
  '2.3': 'Issues List (IDS)',
  '3.1': 'Assessment & Roadmap',
  '3.2': 'SWOT Update',
  '3.3': 'Annual Target Confidence',
  '4.1': 'Quarterly Targets & Execution',
  '4.2': '90-Day Sprint',
  'complete': 'Review Complete'
};

export const PART_LABELS: Record<string, string> = {
  '1': 'Reflection',
  '2': 'Analysis',
  '3': 'Strategic Review',
  '4': 'Planning'
};

export const PART_DURATIONS: Record<string, number> = {
  '1': 60,
  '2': 60,
  '3': 60,
  '4': 60
};

// Feedback Loop Areas
export type FeedbackLoopArea = 'marketing' | 'sales' | 'operations' | 'finances' | 'people' | 'owner';
export type FeedbackLoopColumn = 'stop' | 'less' | 'continue' | 'more' | 'start';

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

// Main Data Interfaces
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

  // Part 2: Analysis
  feedback_loop: FeedbackLoop;
  open_loops_decisions: OpenLoopDecisionRecord[];
  issues_resolved: IssueResolution[];

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
  quarterly_targets: QuarterlyTargets;
  initiatives_changes: InitiativesChanges;
  quarterly_rocks: Rock[];
  personal_commitments: PersonalCommitments;

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

export interface Rock {
  id: string;
  title: string;
  owner: string;
  doneDefinition: string;
  linkedInitiativeId?: string;
  priority: number;
  status?: 'not_started' | 'in_progress' | 'completed';
}

export interface PersonalCommitments {
  hoursPerWeekTarget: number | null;
  daysOffPlanned: number | null;
  daysOffScheduled: string[];
  personalGoal: string;
}

// Helper to get default empty state
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

// Quarter utilities
export const getQuarterLabel = (quarter: QuarterNumber, year: number): string => {
  return `Q${quarter} ${year}`;
};

export const getCurrentQuarter = (): { quarter: QuarterNumber; year: number } => {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();

  if (month < 3) return { quarter: 1, year };
  if (month < 6) return { quarter: 2, year };
  if (month < 9) return { quarter: 3, year };
  return { quarter: 4, year };
};

export const getNextQuarter = (): { quarter: QuarterNumber; year: number } => {
  const current = getCurrentQuarter();
  if (current.quarter === 4) {
    return { quarter: 1, year: current.year + 1 };
  }
  return { quarter: (current.quarter + 1) as QuarterNumber, year: current.year };
};

export const getPreviousQuarter = (): { quarter: QuarterNumber; year: number } => {
  const current = getCurrentQuarter();
  if (current.quarter === 1) {
    return { quarter: 4, year: current.year - 1 };
  }
  return { quarter: (current.quarter - 1) as QuarterNumber, year: current.year };
};
