// ============================================================================
// PROCESS WIZARD TYPES - Enhanced with Phase 1 & 3 Data
// Location: /lib/types/processWizard.ts
// ============================================================================

/**
 * Represents the outcome of a decision branch in a process
 * Used when a step has multiple possible paths forward
 */
export interface Outcome {
  id: string;
  title: string;
  description?: string;
  nextStepId?: string;
}

/**
 * Enhanced Step UI - includes all enrichment fields from Phase 1
 * This represents a single action or decision in the process
 */
export interface StepUI {
  // Core fields (from chat)
  id: string;
  order: number;
  title: string;
  type: 'action' | 'decision';
  primaryOwner: string;
  department?: string;

  // Phase 1 - Enhanced Data Collection
  successCriteria?: string; // e.g., "Response within 24 hours"
  automation?: string; // e.g., "Auto-send reminder after 2 days"
  dependencies?: string; // e.g., "Requires approval from Finance"
  criticalNote?: string; // e.g., "This is a bottleneck"
  isKeyStep?: boolean; // Marks critical steps

  // Phase 3 - Advanced Rendering
  outcomes?: Outcome[]; // For decision steps
}

/**
 * Represents a single conversation turn in the wizard
 * Used to maintain chat history
 */
export interface ConversationMessage {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  timestamp: Date;
  stepContext?: {
    stepId?: string;
    phase?: 'setup' | 'building' | 'enrichment' | 'review';
  };
}

/**
 * Data about the current step being built
 * Temporary state while gathering step information
 */
export interface CurrentStepData {
  title: string | null;
  type: 'action' | 'decision' | null;
  primaryOwner: string | null;
  department?: string;
  successCriteria?: string;
  automation?: string;
  dependencies?: string;
  criticalNote?: string;
  isKeyStep?: boolean;
  outcomes?: Outcome[];
}

/**
 * Enrichment state for Phase 1 data collection
 * Tracks which fields have been filled for each step
 */
export interface EnrichmentState {
  stepId: string;
  successCriteriaFilled: boolean;
  automationFilled: boolean;
  dependenciesFilled: boolean;
  criticalNoteFilled: boolean;
  isKeyStepSet: boolean;
  completedAt?: Date;
}

/**
 * Complete wizard conversation state
 * This is the main state object that tracks everything
 */
export interface ConversationState {
  // Wizard phases
  stage: 'setup' | 'building' | 'enrichment' | 'review' | 'complete';

  // Process information
  processId: string; // UUID
  processName: string;
  processDescription?: string;
  trigger?: string; // What triggers this process?

  // Steps
  steps: StepUI[]; // All steps created so far
  currentStepData: CurrentStepData; // Step being currently built

  // Conversation
  messages: ConversationMessage[];
  lastMessageTimestamp: Date;

  // Enrichment tracking (Phase 1)
  enrichmentStates: EnrichmentState[];
  enrichmentPhaseStarted: boolean;

  // User context
  userId: string;
  sessionId: string;

  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Process diagram representation
 * How the process appears in the database
 */
export interface ProcessDiagram {
  id: string;
  clientId: string;
  name: string;
  description?: string;
  status: 'draft' | 'review' | 'approved';
  stepCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Wizard context passed to child components
 * Provides easy access to current state and actions
 */
export interface WizardContextType {
  state: ConversationState;
  updateState: (updates: Partial<ConversationState>) => void;
  addStep: (step: StepUI) => void;
  removeStep: (stepId: string) => void;
  updateStep: (stepId: string, updates: Partial<StepUI>) => void;
  addMessage: (message: ConversationMessage) => void;
  completeEnrichment: (stepId: string) => void;
  submitDiagram: () => Promise<string>; // Returns processId
}

/**
 * Props for the main Wizard component
 */
export interface WizardProps {
  initialProcessId?: string;
  onComplete?: (processId: string) => void;
  readOnly?: boolean;
}

/**
 * Props for diagram visualization components
 */
export interface DiagramVisualizerProps {
  steps: StepUI[];
  title?: string;
  showEnrichment?: boolean;
  isInteractive?: boolean;
}

/**
 * API response when submitting a diagram
 */
export interface SubmitDiagramResponse {
  success: boolean;
  processId: string;
  message: string;
  stepCount: number;
}

/**
 * Error type for wizard operations
 */
export interface WizardError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp: Date;
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

export function isStepUI(obj: any): obj is StepUI {
  return (
    typeof obj === 'object' &&
    obj.id &&
    obj.title &&
    (obj.type === 'action' || obj.type === 'decision')
  );
}

export function isConversationState(obj: any): obj is ConversationState {
  return (
    typeof obj === 'object' &&
    obj.stage &&
    obj.processId &&
    Array.isArray(obj.steps) &&
    Array.isArray(obj.messages)
  );
}

// ============================================================================
// DEFAULT VALUES
// ============================================================================

export const DEFAULT_CURRENT_STEP_DATA: CurrentStepData = {
  title: null,
  type: null,
  primaryOwner: null,
  department: undefined,
  successCriteria: undefined,
  automation: undefined,
  dependencies: undefined,
  criticalNote: undefined,
  isKeyStep: false,
  outcomes: [],
};

export const DEFAULT_ENRICHMENT_STATE: EnrichmentState = {
  stepId: '',
  successCriteriaFilled: false,
  automationFilled: false,
  dependenciesFilled: false,
  criticalNoteFilled: false,
  isKeyStepSet: false,
};

// ============================================================================
// END OF FILE
// ============================================================================