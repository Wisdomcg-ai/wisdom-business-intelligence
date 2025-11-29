// ============================================================================
// WIZARD TYPE DEFINITIONS
// Purpose: Define the shape of data the wizard builds
// Location: src/lib/types/wizard.ts
// ============================================================================

/**
 * WizardActivity
 * Represents one activity being created by the user
 * Example: "Enquiry", "Qualify Lead", "Send Invoice"
 */
export interface WizardActivity {
  id: string;                    // UUID - unique identifier
  name: string;                  // "Enquiry", "Qualify Lead", etc
  swimlane: string;              // "Sales", "Operations", "Finance"
  type: 'action' | 'decision';   // Is it an action or decision point?
  order: number;                 // Position in sequence (1, 2, 3...)
  description?: string;          // Optional: what does this do?
  outcomes?: string[];           // If decision: ["Yes", "No", "Rejected"]
}

/**
 * WizardFlow
 * Connection between two activities
 * Example: Activity 1 → Activity 2
 */
export interface WizardFlow {
  id: string;                    // UUID
  fromActivityId: string;        // Which activity starts this flow
  toActivityId: string;          // Which activity receives this flow
  label?: string;                // "Yes", "No", "Success", etc (for decisions)
}

/**
 * WizardProcess
 * The complete process being built
 * This gets saved to localStorage
 */
export interface WizardProcess {
  id: string;                    // UUID for the process
  name: string;                  // "Bathroom Renovation", "Sales Process"
  description?: string;          // Optional description
  activities: WizardActivity[];  // All activities in order
  flows: WizardFlow[];          // All connections between activities
  createdAt: string;            // ISO timestamp
  updatedAt: string;            // ISO timestamp
}

/**
 * WizardState
 * What we track in React state while building
 */
export interface WizardState {
  process: WizardProcess;
  currentStep: number;          // Which question are we on?
  lastActivityId?: string;      // The activity we just added (for linking)
}