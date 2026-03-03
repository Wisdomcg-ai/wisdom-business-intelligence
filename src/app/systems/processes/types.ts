import type {
  ProcessSnapshot,
  StickyNote,
  SwimlaneDefinition,
  SwimlaneColor,
  ProcessStepData,
  ProcessFlowData,
  StepType,
  FlowType,
} from '@/types/process-builder'

// ─── Builder State ───────────────────────────────────────────────────

export interface BuilderState {
  processId: string
  processName: string
  description: string
  snapshot: ProcessSnapshot
  selectedStepId: string | null
  detailPanelOpen: boolean
  zoom: number
  isDirty: boolean
  // Undo/redo
  history: ProcessSnapshot[]
  historyIndex: number
}

// ─── Builder Actions ─────────────────────────────────────────────────

export type BuilderAction =
  // Data lifecycle
  | { type: 'SET_DATA'; payload: { name: string; description: string; snapshot: ProcessSnapshot } }
  | { type: 'MARK_SAVED' }
  // Process metadata
  | { type: 'SET_NAME'; payload: string }
  | { type: 'SET_DESCRIPTION'; payload: string }
  // Sticky notes
  | { type: 'ADD_NOTE'; payload: StickyNote }
  | { type: 'UPDATE_NOTE'; payload: { id: string; updates: Partial<StickyNote> } }
  | { type: 'DELETE_NOTE'; payload: string }
  | { type: 'ADD_NOTES_BATCH'; payload: StickyNote[] }
  // Swimlanes
  | { type: 'ADD_SWIMLANE'; payload: SwimlaneDefinition }
  | { type: 'UPDATE_SWIMLANE'; payload: { id: string; updates: Partial<SwimlaneDefinition> } }
  | { type: 'DELETE_SWIMLANE'; payload: string }
  | { type: 'REORDER_SWIMLANE'; payload: { id: string; newOrder: number } }
  // Steps
  | { type: 'ADD_STEP'; payload: ProcessStepData }
  | { type: 'UPDATE_STEP'; payload: { id: string; updates: Partial<ProcessStepData> } }
  | { type: 'DELETE_STEP'; payload: string }
  | { type: 'MOVE_STEP'; payload: { stepId: string; targetSwimlaneId: string; targetIndex: number; targetOrderNum?: number } }
  | { type: 'DROP_NOTE_TO_LANE'; payload: { noteId: string; swimlaneId: string; index: number } }
  // Flows
  | { type: 'ADD_FLOW'; payload: ProcessFlowData }
  | { type: 'UPDATE_FLOW'; payload: { id: string; updates: Partial<ProcessFlowData> } }
  | { type: 'DELETE_FLOW'; payload: string }
  | { type: 'AUTO_CONNECT' }
  | { type: 'CLEAR_ALL_FLOWS' }
  // UI state
  | { type: 'SELECT_STEP'; payload: string | null }
  | { type: 'TOGGLE_DETAIL_PANEL'; payload?: boolean }
  | { type: 'SET_ZOOM'; payload: number }
  // Undo/redo
  | { type: 'UNDO' }
  | { type: 'REDO' }
