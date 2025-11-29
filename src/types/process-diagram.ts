// ============================================================================
// PROCESS DIAGRAM TYPE DEFINITIONS
// Week 1: Foundation Types
// Purpose: Define the shape of all process diagram data
// ============================================================================

// ─── BASIC ENUMS & TYPES ──────────────────────────────────────────────

/** Type of step in the process */
export type StepType = 'action' | 'decision' | 'wait' | 'automation';

/** Type of flow/connection between steps */
export type FlowType = 'sequential' | 'decision' | 'loop' | 'parallel';

/** Complexity level of process */
export type ComplexityLevel = 'simple' | 'moderate' | 'complex';

// ─── DATABASE MODELS ──────────────────────────────────────────────────

/**
 * ProcessDiagram
 * The top-level process - represents an entire workflow
 * Example: "Bathroom Renovation", "Sales Process", "Onboarding"
 */
export interface ProcessDiagram {
  id: string;                    // UUID - unique identifier
  client_id: string;             // UUID - which client owns this
  process_name: string;          // "Bathroom Renovation Workflow"
  trigger_event: string;         // "Customer enquiry comes in"
  success_criteria: string;      // "Job completed and invoiced"
  estimated_duration: string;    // "2-3 weeks"
  estimated_cost?: number;       // $500-$2000 (optional)
  complexity_level: ComplexityLevel; // "simple", "moderate", "complex"
  created_at: string;            // ISO timestamp
  updated_at: string;            // ISO timestamp
}

/**
 * ProcessStep
 * Individual activity/task in the process
 * Example: "Qualify lead", "Send invoice", "Await payment"
 */
export interface ProcessStep {
  id: string;                    // UUID - unique identifier
  process_id: string;            // UUID - which process this belongs to
  
  // Position & Organization
  order_num: number;             // 1, 2, 3... (order in process)
  swimlane_name: string;         // "Sales", "Operations", "Finance"
  department: string;            // For color mapping
  phase_name?: string;           // "Create Day 1", "Post-Sale" (optional)
  
  // Activity Details
  action_name: string;           // "Qualify lead" or "Send invoice"
  step_type: StepType;           // "action" | "decision" | "wait" | "automation"
  description: string;           // Full description of what happens
  business_purpose: string;      // Why this step exists
  success_criteria: string;      // How to know if it succeeded
  
  // Timing & Resources
  estimated_duration: string;    // "15 mins", "2 hours", "5 days"
  owner_role: string;            // "Sales Rep", "Finance Team", etc
  systems_used: string[];        // ["ServiceM8", "Gmail", "Spreadsheet"]
  documents_needed: string[];    // ["Quote form", "Job sheet"]
  
  // Enrichment
  automation_rule?: string;      // If automated: what triggers it (optional)
  cost_estimate?: number;        // $0-$10000 (optional)
  quality_checks: string;        // What QA is performed
  improvement_notes?: string;    // Bottlenecks, opportunities (optional)
  
  // Metadata
  created_at: string;            // ISO timestamp
  updated_at?: string;           // ISO timestamp (optional)
}

/**
 * ProcessFlow
 * Connection between two steps (the arrows in diagram)
 * Example: Step 1 → Step 2 (sequential)
 *          Step 2 → Step 3 (Yes) or Step 4 (No) (decision)
 */
export interface ProcessFlow {
  id: string;                    // UUID - unique identifier
  process_id: string;            // UUID - which process this belongs to
  
  // The Connection
  from_step_id: string;          // UUID - where arrow starts
  to_step_id: string;            // UUID - where arrow ends
  
  // Flow Details
  flow_type: FlowType;           // "sequential" | "decision" | "loop" | "parallel"
  condition_label?: string;      // "Yes", "No", "Rejected", "Approved" (optional)
  condition_color?: string;      // "green", "red", "neutral" (optional)
  notes?: string;                // Additional info (optional)
  
  created_at: string;            // ISO timestamp
}

/**
 * ProcessPhase
 * Logical grouping of activities (like sections in the diagram)
 * Example: "Sales", "Operations", "Post-Sale", "Create Day 1"
 */
export interface ProcessPhase {
  id: string;                    // UUID - unique identifier
  process_id: string;            // UUID - which process this belongs to
  
  phase_name: string;            // "Sales", "Operations", etc
  phase_order: number;           // 1, 2, 3... (display order)
  phase_color: string;           // "#FCD34D", "#06B6D4", etc (hex color)
  department: string;            // For styling consistency
  description?: string;          // What this phase is about (optional)
  
  created_at: string;            // ISO timestamp
}

/**
 * ProcessDiagramComplete
 * All data for a process bundled together
 * Use this when you need the full picture
 */
export interface ProcessDiagramComplete {
  diagram: ProcessDiagram;       // The main process
  steps: ProcessStep[];          // All activities
  flows: ProcessFlow[];          // All connections
  phases: ProcessPhase[];        // All groupings
}

// ─── DEPARTMENT COLOR CONFIGURATION ───────────────────────────────────

/**
 * Department to Color Mapping
 * Maps department names to their visual colors (from PROCESS_DIAGRAM_STANDARD.md)
 */
export const DEPARTMENT_COLORS: Record<
  string,
  {
    primary: string;   // Main color (#FCD34D)
    border: string;    // Border color (#FBBF24)
    tint: string;      // Background tint (#FFFBEB)
  }
> = {
  Sales: {
    primary: '#FCD34D',  // Warm Yellow/Amber
    border: '#FBBF24',   // Darker Amber
    tint: '#FFFBEB',     // Lightest cream
  },
  Operations: {
    primary: '#06B6D4',  // Cyan/Turquoise
    border: '#0891B2',   // Darker Cyan
    tint: '#ECFDF5',     // Light cyan wash
  },
  Finance: {
    primary: '#FB923C',  // Orange
    border: '#EA580C',   // Darker Orange
    tint: '#FEF3C7',     // Light orange
  },
  Marketing: {
    primary: '#78716F',  // Stone/Gray
    border: '#57534E',   // Darker Stone
    tint: '#FAFAF9',     // Very light gray
  },
};

// ─── LAYOUT CONFIGURATION ─────────────────────────────────────────────

/**
 * Layout Configuration
 * All measurements for SVG rendering (from PROCESS_DIAGRAM_STANDARD.md)
 * Keep these values for rendering the diagram
 */
export const LAYOUT_CONFIG = {
  // Widths
  swimlaneBarWidth: 12,    // 12px colored bar on left
  sidebarWidth: 140,       // 140px for department names
  colWidth: 240,           // 240px per function column
  
  // Heights
  rowHeight: 160,          // Per swimlane
  headerHeight: 90,        // Top headers
  
  // Activity Box
  activityWidth: 180,      // Exactly 180px
  activityHeight: 70,      // Exactly 70px
  
  // Spacing
  paddingX: 16,            // Horizontal padding (multiples of 4px)
  paddingY: 16,            // Vertical padding
  gapBetweenActivities: 20, // Space between boxes
  
  // Visual Weight
  connectorThickness: 2.5, // Connector line thickness
  borderThickness: 3.5,    // Activity box border thickness
};

// ─── STEP TYPE HELPERS ────────────────────────────────────────────────

/**
 * Get visual properties for a step type
 */
export function getStepTypeProperties(stepType: StepType) {
  switch (stepType) {
    case 'action':
      return {
        icon: '▭',           // Box icon
        label: 'Action',
        description: 'Task performed by someone',
      };
    case 'decision':
      return {
        icon: '◇',           // Diamond icon
        label: 'Decision',
        description: 'Choice point - Yes/No branch',
      };
    case 'wait':
      return {
        icon: '⏳',          // Hourglass icon
        label: 'Wait',
        description: 'System or person waiting',
      };
    case 'automation':
      return {
        icon: '⚙️',          // Gear icon
        label: 'Automation',
        description: 'Automated process',
      };
    default:
      return {
        icon: '?',
        label: 'Unknown',
        description: 'Unknown step type',
      };
  }
}

/**
 * Get color for a flow condition
 */
export function getConditionColor(condition?: string): string {
  if (!condition) return '#6B7280'; // Default gray
  
  const lower = condition.toLowerCase();
  if (lower === 'yes' || lower === 'approved' || lower === 'success') {
    return '#10B981'; // Green
  }
  if (lower === 'no' || lower === 'rejected' || lower === 'failed') {
    return '#EF4444'; // Red
  }
  
  return '#6B7280'; // Default gray
}

// ─── VALIDATION HELPERS ──────────────────────────────────────────────

/**
 * Validate that a step has all required fields
 */
export function isValidStep(step: Partial<ProcessStep>): boolean {
  return !!(
    step.action_name &&
    step.step_type &&
    step.swimlane_name &&
    step.department &&
    step.owner_role &&
    step.business_purpose &&
    step.success_criteria &&
    step.estimated_duration &&
    step.quality_checks
  );
}

/**
 * Validate that a diagram has all required fields
 */
export function isValidDiagram(diagram: Partial<ProcessDiagram>): boolean {
  return !!(
    diagram.process_name &&
    diagram.trigger_event &&
    diagram.success_criteria &&
    diagram.complexity_level
  );
}

// ============================================================================
// END OF TYPE DEFINITIONS
// If this file compiles without errors, you're ready for Step 3
// ============================================================================