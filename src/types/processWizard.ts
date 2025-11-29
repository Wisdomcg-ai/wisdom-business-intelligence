// ============================================
// ENHANCED PROCESS WIZARD TYPES
// ============================================

// Basic step type
export interface StepUI {
  id: string;
  order: number;
  title: string;
  type: 'action' | 'decision';
  role: string;
  documents?: string;
  systems?: string;
  amount?: string;
  timing?: string;
  decisionQuestion?: string;
  yesBranch?: string;
  noBranch?: string;
}

// ============================================
// ENHANCED STEP WITH RICH METADATA
// ============================================
export interface EnhancedStepUI extends StepUI {
  // Annotations
  notes?: string;
  duration?: string; // "2 days", "30 minutes"
  durationValue?: number;
  durationUnit?: 'minutes' | 'hours' | 'days' | 'weeks';
  
  // Financial
  costValue?: number;
  costCurrency?: string; // USD, GBP, etc
  costDescription?: string; // "30% deposit", "$200 per unit"
  
  // Resources
  resourcesRequired?: string[]; // ["CRM", "Email", "ServiceM8"]
  documentsRequired?: string[]; // ["Quote", "Invoice", "Approval"]
  
  // Outputs/Deliverables
  outputs?: string[]; // ["Confirmation Email", "Photos", "Report"]
  
  // Decision branching (if type === 'decision')
  yesOutcome?: string; // Where YES leads
  noOutcome?: string; // Where NO leads
  decisionCriteria?: string; // Detailed criteria
  
  // Process properties
  isAutomated?: boolean;
  automationDetails?: string;
  isLoop?: boolean; // Returns to previous step
  loopCondition?: string;
  isSubProcess?: boolean;
  subProcessSteps?: string[];
  
  // Approval/Sign-off
  requiresApproval?: boolean;
  approverRole?: string;
  approvalNote?: string;
  
  // Conditional branching
  branches?: {
    condition: string;
    outcome: string;
    nextStep?: string;
  }[];
}

// ============================================
// CONVERSATION TYPES
// ============================================
export type ConversationState =
  | 'AWAITING_STEP_NAME'
  | 'AWAITING_ROLE'
  | 'AWAITING_TYPE'
  | 'AWAITING_DECISION_QUESTION'
  | 'AWAITING_YES_BRANCH'
  | 'AWAITING_NO_BRANCH';

export interface CurrentStepData {
  title?: string;
  role?: string;
  type?: 'action' | 'decision';
  decisionQuestion?: string;
  yesBranch?: string;
  noBranch?: string;
}

// ============================================
// DATABASE TYPES (from Supabase)
// ============================================
export interface ProcessDiagram {
  id: string;
  client_id: string;
  name: string;
  description?: string;
  status: 'draft' | 'published' | 'archived';
  step_count?: number;
  decision_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface ProcessStep {
  id: string;
  process_id: string;
  order_num: number;
  action: string;
  description?: string;
  primary_owner?: string;
  department?: string;
  estimated_duration?: string;
  outputs?: string[];
  systems?: string[];
  payments?: Array<{ amount?: string; description?: string }>;
  swimlane?: string;
  created_at?: string;
}

export interface ProcessDecision {
  id: string;
  process_id: string;
  after_step_id: string;
  decision_question: string;
  decision_type: 'yes_no' | 'multiple';
  branches?: Array<{
    outcome: string;
    next_step_title?: string;
  }>;
  created_at?: string;
}

// ============================================
// DIAGRAM RENDERING TYPES
// ============================================
export interface DiagramConfig {
  stepWidth: number;
  stepHeight: number;
  diamondSize: number;
  horizontalSpacing: number;
  verticalSpacing: number;
  leftMargin: number;
  topMargin: number;
  iconSize: number;
  fontSize: {
    title: number;
    label: number;
    annotation: number;
  };
  colors: {
    action: string;
    decision: string;
    process: string;
    annotation: string;
    connector: string;
  };
}

export interface SwimLane {
  role: string;
  index: number;
  color: string;
  steps: EnhancedStepUI[];
}

// ============================================
// HELPER TYPES
// ============================================
export interface StepPosition {
  x: number;
  y: number;
  roleIndex: number;
  width: number;
  height: number;
}

export interface Connector {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label?: string;
  type: 'normal' | 'yes' | 'no' | 'loop';
  isLoop?: boolean;
}

// ============================================
// EXCLUSION UTILITY (for table display)
// ============================================
export function isExcluded(value: string | undefined): boolean {
  return !value || value.toLowerCase() === 'n/a';
}