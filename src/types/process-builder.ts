// ============================================================================
// PROCESS BUILDER — Unified Types
// New file, old type files (process-diagram.ts, processWizard.ts) untouched
// ============================================================================

export type StepType = 'action' | 'decision' | 'wait' | 'automation'
export type FlowType = 'sequential' | 'decision' | 'loop' | 'parallel' | 'handoff'
export type ProcessStatus = 'draft' | 'published' | 'archived'

// ─── Client-side Types ───────────────────────────────────────────────

export interface StickyNote {
  id: string
  text: string
  color: string // hex from STICKY_NOTE_COLORS
}

export interface SwimlaneColor {
  name: string
  primary: string
  border: string
  tint: string
}

export interface SwimlaneDefinition {
  id: string
  name: string
  color: SwimlaneColor
  order: number
}

export interface PhaseColor {
  name: string
  primary: string   // header background
  border: string    // darker accent
  tint: string      // light column tint
  text: string      // text on header (white)
}

export interface PhaseDefinition {
  id: string
  name: string
  color: PhaseColor
  order: number
}

export interface DecisionOption {
  label: string
  color: string // 'green' | 'red' | 'blue' | 'orange'
}

export interface ProcessStepData {
  id: string
  swimlane_id: string
  order_num: number
  action_name: string
  step_type: StepType
  phase_id?: string
  phase_name?: string
  description?: string
  business_purpose?: string
  success_criteria?: string
  estimated_duration?: string
  owner_role?: string
  systems_used: string[]
  documents_needed: string[]
  automation_rule?: string
  quality_checks?: string
  decision_yes_label?: string
  decision_no_label?: string
  decision_options?: DecisionOption[] // up to 4 options
}

export interface ProcessFlowData {
  id: string
  from_step_id: string
  to_step_id: string
  flow_type: FlowType
  condition_label?: string
  condition_color?: string
}

export interface ProcessSnapshot {
  notes: StickyNote[]
  swimlanes: SwimlaneDefinition[]
  phases: PhaseDefinition[]
  steps: ProcessStepData[]
  flows: ProcessFlowData[]
}

// ─── Database record (matches process_diagrams table) ────────────────

export interface ProcessDiagramRecord {
  id: string
  user_id: string
  name: string
  description: string | null
  industry: string | null
  status: string
  process_data: ProcessSnapshot | null
  step_count: number
  decision_count: number
  swimlane_count: number
  created_at: string
  updated_at: string
}

// ─── Color Palettes ──────────────────────────────────────────────────

export const SWIMLANE_COLOR_PALETTE: SwimlaneColor[] = [
  { name: 'Amber',   primary: '#F59E0B', border: '#B45309', tint: '#FFFBEB' },
  { name: 'Cyan',    primary: '#06B6D4', border: '#0891B2', tint: '#ECFEFF' },
  { name: 'Orange',  primary: '#FB923C', border: '#EA580C', tint: '#FFF7ED' },
  { name: 'Purple',  primary: '#A78BFA', border: '#7C3AED', tint: '#F5F3FF' },
  { name: 'Green',   primary: '#34D399', border: '#059669', tint: '#ECFDF5' },
  { name: 'Pink',    primary: '#F472B6', border: '#DB2777', tint: '#FDF2F8' },
  { name: 'Navy',    primary: '#1E3A5F', border: '#172554', tint: '#EFF6FF' },
  { name: 'Gray',    primary: '#9CA3AF', border: '#6B7280', tint: '#F9FAFB' },
]

export const STICKY_NOTE_COLORS = [
  '#FEF3C7', // amber-100
  '#DBEAFE', // blue-100
  '#D1FAE5', // emerald-100
  '#FDE2E2', // rose-100 (custom)
  '#E9D5FF', // purple-100
  '#FFEDD5', // orange-100
  '#CCFBF1', // teal-100
  '#F1F5F9', // slate-100
]

export const PHASE_COLOR_PALETTE: PhaseColor[] = [
  { name: 'Orange',   primary: '#EA580C', border: '#C2410C', tint: '#FFF7ED', text: '#FFFFFF' },
  { name: 'Teal',     primary: '#0D9488', border: '#0F766E', tint: '#F0FDFA', text: '#FFFFFF' },
  { name: 'Blue',     primary: '#2563EB', border: '#1D4ED8', tint: '#EFF6FF', text: '#FFFFFF' },
  { name: 'Purple',   primary: '#7C3AED', border: '#6D28D9', tint: '#F5F3FF', text: '#FFFFFF' },
  { name: 'Rose',     primary: '#E11D48', border: '#BE123C', tint: '#FFF1F2', text: '#FFFFFF' },
  { name: 'Emerald',  primary: '#059669', border: '#047857', tint: '#ECFDF5', text: '#FFFFFF' },
  { name: 'Amber',    primary: '#D97706', border: '#B45309', tint: '#FFFBEB', text: '#FFFFFF' },
  { name: 'Charcoal', primary: '#1F2937', border: '#111827', tint: '#F9FAFB', text: '#FFFFFF' },
]

export const DEFAULT_SNAPSHOT: ProcessSnapshot = {
  notes: [],
  swimlanes: [],
  phases: [],
  steps: [],
  flows: [],
}
