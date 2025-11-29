// ========================================
// WEEK 1 DAY 3: COMPLETE TYPE DEFINITIONS
// File: lib/types/wizard.ts
// ========================================

// ========================================
// PROCESS DIAGRAM TYPES
// ========================================

export interface ProcessDiagram {
  id: string;
  client_id: string;
  coach_id: string | null;
  name: string;
  description: string | null;
  profit_center: string | null;
  industry: string | null;
  status: 'draft' | 'published' | 'archived';
  conversation_method: 'ai' | 'manual';
  conversation_status: 'in_progress' | 'complete' | 'enriched';
  total_time_minutes: number | null;
  diagram_data: DiagramData;
  has_parallel_work: boolean;
  has_payments: boolean;
  has_documents: boolean;
  has_pain_points: boolean;
  step_count: number;
  decision_count: number;
  swimlane_count: number;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  created_by: string;
  last_edited_by: string | null;
}

// ========================================
// PROCESS STEPS
// ========================================

export interface ProcessStep {
  id: string;
  process_id: string;
  order_num: number;
  action: string;
  description: string | null;
  primary_owner: string | null;
  primary_owner_type: 'person' | 'role' | null;
  department: string | null;
  swimlane: string | null;
  estimated_duration: string | null;
  duration_unit: 'minutes' | 'hours' | 'days' | null;
  duration_value: number | null;
  outputs: ProcessOutput[];
  systems: SystemUsed[];
  payments: PaymentMilestone[];
  pain_points: string[];
  automation_opportunity: string | null;
  single_point_of_failure: boolean;
  is_end_step: boolean;
  has_branch: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProcessOutput {
  type: 'document' | 'payment' | 'decision' | 'data' | 'communication';
  name: string;
  description?: string;
}

export interface SystemUsed {
  name: string;
  purpose: string;
}

export interface PaymentMilestone {
  amount: string;
  description: string;
  automationStatus?: 'manual' | 'automatic' | 'needs_setup';
}

// ========================================
// PROCESS DECISIONS (Branches)
// ========================================

export interface ProcessDecision {
  id: string;
  process_id: string;
  after_step_id: string;
  decision_question: string;
  decision_type: 'yes_no' | 'multi_branch';
  branches: DecisionBranch[];
  created_at: string;
  updated_at: string;
}

export interface DecisionBranch {
  outcome: string;
  description: string;
  next_step_id: string | null;
  next_step_order: number | null;
}

// ========================================
// CONVERSATION DATA
// ========================================

export interface ConversationTurn {
  id: string;
  process_id: string;
  turn_number: number;
  role: 'system' | 'user';
  message: string;
  parsed_data: ParsedInput | null;
  confidence: number | null;
  created_at: string;
}

export interface ParsedInput {
  action: string | null;
  owner: string | null;
  department: string | null;
  duration: string | null;
  isBranch: boolean;
  branchOutcomes: DecisionBranch[] | null;
  isProcessComplete: boolean;
  confidence: number;
  rationale: string;
}

// ========================================
// WIZARD STATE MANAGEMENT
// ========================================

export interface WizardState {
  phase: 'setup' | 'unpacking' | 'enrichment' | 'review';
  
  processData: {
    id: string;
    name: string;
    description: string | null;
    profitCenter: string | null;
    steps: ProcessStep[];
    decisions: ProcessDecision[];
  };
  
  currentStep: CurrentStepState;
  
  conversationHistory: ConversationTurn[];
  
  // Metadata
  startedAt: string;
  totalTimeMinutes: number;
  isLoading: boolean;
  error: string | null;
}

export interface CurrentStepState {
  order: number;
  action: string | null;
  owner: string | null;
  department: string | null;
  duration: string | null;
  durationUnit: 'minutes' | 'hours' | 'days' | null;
  branchChecked: boolean;
  hasBranch: boolean;
  branchQuestion: string | null;
  branches: DecisionBranch[];
  isComplete: boolean;
}

// ========================================
// DIAGRAM DATA (React Flow compatible)
// ========================================

export interface DiagramData {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
}

export interface DiagramNode {
  id: string;
  data: {
    label: string;
    owner?: string;
    department?: string;
    duration?: string;
    type?: 'start' | 'process' | 'decision' | 'end';
  };
  position: {
    x: number;
    y: number;
  };
  type?: 'default' | 'diamond' | 'circle';
  style?: Record<string, any>;
}

export interface DiagramEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  type?: 'default' | 'smoothstep' | 'straight';
  animated?: boolean;
  style?: Record<string, any>;
}

// ========================================
// COACH FEATURES
// ========================================

export interface CoachSuggestion {
  id: string;
  process_id: string;
  step_id: string | null;
  suggestion_type: 'bottleneck' | 'risk' | 'automation' | 'handoff' | 'documentation';
  priority: 'high' | 'medium' | 'low';
  suggestion_title: string;
  suggestion_text: string;
  metric_value: number | null;
  recommended_action: string | null;
  dismissed: boolean;
  implemented: boolean;
  created_at: string;
}

export interface ProcessComment {
  id: string;
  process_id: string;
  step_id: string | null;
  commented_by: string;
  commented_to: string | null;
  comment_text: string;
  comment_type: 'suggestion' | 'question' | 'improvement';
  resolved: boolean;
  resolved_at: string | null;
  created_at: string;
}

export interface ProcessVersion {
  id: string;
  process_id: string;
  version_number: number;
  edited_by: string;
  changes_summary: string | null;
  change_type: string | null;
  full_diagram_snapshot: {
    diagram: DiagramData;
    steps: ProcessStep[];
    decisions: ProcessDecision[];
  };
  created_at: string;
}

// ========================================
// API RESPONSE TYPES
// ========================================

export interface ApiResponse<T> {
  data: T | null;
  error: ApiError | null;
  success: boolean;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

// ========================================
// CONVERSATION ENGINE TYPES
// ========================================

export type NextQuestion = 
  | 'PROCESS_NAME'
  | 'ENTRY_TRIGGER'
  | 'STEP_ACTION'
  | 'STEP_OWNER'
  | 'STEP_DEPARTMENT'
  | 'BRANCH_DETECTION'
  | 'BRANCH_OUTCOME'
  | 'NEXT_STEP_OR_DONE'
  | 'PARALLEL_WORK'
  | 'CONFIRM'
  | 'READY_FOR_REVIEW';

export interface QuestionResponse {
  question: string;
  fieldType: 'text' | 'select' | 'checkbox' | 'radio';
  options?: string[];
  placeholder?: string;
  hint?: string;
  required: boolean;
}

// ========================================
// ENRICHMENT TYPES
// ========================================

export interface ParallelWork {
  stepId: string;
  simultaneousActivities: {
    department: string;
    activity: string;
  }[];
}

export interface ProcessAnalysis {
  bottlenecks: Bottleneck[];
  automationOpportunities: AutomationOpportunity[];
  singlePointsOfFailure: SinglePointOfFailure[];
  paymentFlow: PaymentFlowAnalysis;
  cycleTimeAnalysis: CycleTimeAnalysis;
}

export interface Bottleneck {
  stepId: string;
  owner: string;
  stepsOwned: number;
  reason: string;
  recommendation: string;
}

export interface AutomationOpportunity {
  stepId: string;
  currentStatus: string;
  opportunity: string;
  tool: string;
  timeSavings: string;
}

export interface SinglePointOfFailure {
  person: string;
  stepsOwned: string[];
  risk: string;
  recommendation: string;
}

export interface PaymentFlowAnalysis {
  totalValue: string;
  touchpoints: number;
  automationLevel: string;
  recommendations: string[];
}

export interface CycleTimeAnalysis {
  sequentialDuration: string;
  actualDuration: string;
  optimizationPotential: string;
}

// ========================================
// USER/AUTH TYPES
// ========================================

export interface User {
  id: string;
  email: string;
  role: 'client' | 'coach' | 'admin';
  profile: {
    firstName: string;
    lastName: string;
    company: string | null;
  };
  created_at: string;
}

export interface CoachProfile {
  userId: string;
  specialties: string[];
  bio: string | null;
  clients: string[];
}

// ========================================
// EXPORT TYPES
// ========================================

export interface ExportOptions {
  format: 'pdf' | 'png' | 'json';
  includeAnalysis: boolean;
  includeComments: boolean;
  includeVersions: boolean;
}

export interface ExportResult {
  filename: string;
  mimeType: string;
  data: Blob;
  generatedAt: string;
}