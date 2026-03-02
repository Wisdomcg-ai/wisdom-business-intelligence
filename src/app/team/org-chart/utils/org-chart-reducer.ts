import {
  OrgChartData,
  OrgChartPerson,
  OrgChartVersion,
  OrgChartSettings,
  ViewMode,
} from '../types'
import { OrgChartTemplate } from './templates'
import { applyTemplateAsVersion, mergeTemplateIntoCurrent } from './templates'

// --- State ---

export interface OrgChartState {
  data: OrgChartData
  selectedPersonId: string | null
  editPanelOpen: boolean
  zoom: number
  viewMode: ViewMode
  search: string
  departmentFilter: string | null
  collapsedIds: Set<string>
  isDirty: boolean
  // Undo/redo
  history: OrgChartData[]
  historyIndex: number
}

// --- Actions ---

export type OrgChartAction =
  | { type: 'SET_DATA'; payload: OrgChartData }
  | { type: 'MARK_SAVED' }
  | { type: 'ADD_PERSON'; payload: { person: OrgChartPerson } }
  | { type: 'UPDATE_PERSON'; payload: { id: string; updates: Partial<OrgChartPerson> } }
  | { type: 'DELETE_PERSON'; payload: { id: string } }
  | { type: 'DUPLICATE_PERSON'; payload: { id: string; newId: string } }
  | { type: 'REPARENT_PERSON'; payload: { personId: string; newParentId: string | null } }
  | { type: 'SELECT_PERSON'; payload: string | null }
  | { type: 'TOGGLE_EDIT_PANEL'; payload?: boolean }
  | { type: 'SET_ZOOM'; payload: number }
  | { type: 'SET_VIEW_MODE'; payload: ViewMode }
  | { type: 'TOGGLE_COLLAPSE'; payload: string }
  | { type: 'SET_SEARCH'; payload: string }
  | { type: 'SET_DEPARTMENT_FILTER'; payload: string | null }
  | { type: 'CREATE_VERSION'; payload: { id: string; label: string; date: string | null } }
  | { type: 'SWITCH_VERSION'; payload: string }
  | { type: 'RENAME_VERSION'; payload: { id: string; label: string } }
  | { type: 'DELETE_VERSION'; payload: string }
  | { type: 'UPDATE_SETTINGS'; payload: Partial<OrgChartSettings> }
  | { type: 'APPLY_TEMPLATE_AS_VERSION'; payload: { template: OrgChartTemplate; versionLabel: string } }
  | { type: 'MERGE_TEMPLATE'; payload: { template: OrgChartTemplate } }
  | { type: 'UNDO' }
  | { type: 'REDO' }

// --- Helpers ---

const MAX_HISTORY = 50

function getActiveVersion(data: OrgChartData): OrgChartVersion {
  return data.versions.find((v) => v.id === data.activeVersionId) || data.versions[0]
}

function updateActiveVersion(
  data: OrgChartData,
  updater: (version: OrgChartVersion) => OrgChartVersion
): OrgChartData {
  return {
    ...data,
    versions: data.versions.map((v) =>
      v.id === data.activeVersionId
        ? updater({ ...v, updatedAt: new Date().toISOString() })
        : v
    ),
  }
}

function pushHistory(state: OrgChartState, newData: OrgChartData): OrgChartState {
  // Truncate any "future" history if we've undone some actions
  const pastHistory = state.history.slice(0, state.historyIndex + 1)
  const newHistory = [...pastHistory, newData].slice(-MAX_HISTORY)
  return {
    ...state,
    data: newData,
    isDirty: true,
    history: newHistory,
    historyIndex: newHistory.length - 1,
  }
}

// --- Initial state factory ---

export function createInitialState(data?: OrgChartData): OrgChartState {
  const defaultData: OrgChartData = data || {
    version: 1,
    activeVersionId: 'current',
    versions: [
      {
        id: 'current',
        label: 'Current',
        date: null,
        people: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    settings: {
      showSalaries: false,
      showHeadcount: true,
      companyName: '',
      departmentColors: {},
      viewMode: 'detailed',
    },
  }

  return {
    data: defaultData,
    selectedPersonId: null,
    editPanelOpen: false,
    zoom: 1,
    viewMode: defaultData.settings.viewMode,
    search: '',
    departmentFilter: null,
    collapsedIds: new Set(),
    isDirty: false,
    history: [defaultData],
    historyIndex: 0,
  }
}

// --- Reducer ---

export function orgChartReducer(
  state: OrgChartState,
  action: OrgChartAction
): OrgChartState {
  switch (action.type) {
    case 'SET_DATA': {
      return {
        ...state,
        data: action.payload,
        viewMode: action.payload.settings.viewMode,
        isDirty: false,
        history: [action.payload],
        historyIndex: 0,
      }
    }

    case 'MARK_SAVED': {
      return { ...state, isDirty: false }
    }

    case 'ADD_PERSON': {
      const newData = updateActiveVersion(state.data, (v) => ({
        ...v,
        people: [...v.people, action.payload.person],
      }))
      return pushHistory(state, newData)
    }

    case 'UPDATE_PERSON': {
      const newData = updateActiveVersion(state.data, (v) => ({
        ...v,
        people: v.people.map((p) =>
          p.id === action.payload.id ? { ...p, ...action.payload.updates } : p
        ),
      }))
      return pushHistory(state, newData)
    }

    case 'DELETE_PERSON': {
      const version = getActiveVersion(state.data)
      const person = version.people.find((p) => p.id === action.payload.id)
      if (!person) return state

      const newData = updateActiveVersion(state.data, (v) => ({
        ...v,
        people: v.people
          .filter((p) => p.id !== action.payload.id)
          .map((p) =>
            p.parentId === action.payload.id
              ? { ...p, parentId: person.parentId }
              : p
          ),
      }))

      const newState = pushHistory(state, newData)
      return {
        ...newState,
        selectedPersonId:
          state.selectedPersonId === action.payload.id
            ? null
            : state.selectedPersonId,
        editPanelOpen:
          state.selectedPersonId === action.payload.id
            ? false
            : state.editPanelOpen,
      }
    }

    case 'DUPLICATE_PERSON': {
      const version = getActiveVersion(state.data)
      const original = version.people.find((p) => p.id === action.payload.id)
      if (!original) return state

      const siblings = version.people.filter(
        (p) => p.parentId === original.parentId
      )
      const maxSort = siblings.length > 0
        ? Math.max(...siblings.map((s) => s.sortOrder))
        : 0

      const duplicate: OrgChartPerson = {
        ...original,
        id: action.payload.newId,
        name: `${original.name} (Copy)`,
        sortOrder: maxSort + 1,
      }

      const newData = updateActiveVersion(state.data, (v) => ({
        ...v,
        people: [...v.people, duplicate],
      }))
      return pushHistory(state, newData)
    }

    case 'REPARENT_PERSON': {
      const newData = updateActiveVersion(state.data, (v) => ({
        ...v,
        people: v.people.map((p) =>
          p.id === action.payload.personId
            ? { ...p, parentId: action.payload.newParentId }
            : p
        ),
      }))
      return pushHistory(state, newData)
    }

    case 'SELECT_PERSON': {
      return {
        ...state,
        selectedPersonId: action.payload,
        editPanelOpen: action.payload !== null ? true : state.editPanelOpen,
      }
    }

    case 'TOGGLE_EDIT_PANEL': {
      const open = action.payload !== undefined ? action.payload : !state.editPanelOpen
      return {
        ...state,
        editPanelOpen: open,
        selectedPersonId: open ? state.selectedPersonId : null,
      }
    }

    case 'SET_ZOOM': {
      return { ...state, zoom: Math.min(2, Math.max(0.25, action.payload)) }
    }

    case 'SET_VIEW_MODE': {
      const newData = {
        ...state.data,
        settings: { ...state.data.settings, viewMode: action.payload },
      }
      return { ...state, data: newData, viewMode: action.payload, isDirty: true }
    }

    case 'TOGGLE_COLLAPSE': {
      const next = new Set(state.collapsedIds)
      if (next.has(action.payload)) {
        next.delete(action.payload)
      } else {
        next.add(action.payload)
      }
      return { ...state, collapsedIds: next }
    }

    case 'SET_SEARCH': {
      return { ...state, search: action.payload }
    }

    case 'SET_DEPARTMENT_FILTER': {
      return { ...state, departmentFilter: action.payload }
    }

    case 'CREATE_VERSION': {
      const currentVersion = getActiveVersion(state.data)
      const newVersion: OrgChartVersion = {
        id: action.payload.id,
        label: action.payload.label,
        date: action.payload.date,
        people: currentVersion.people.map((p) => ({ ...p })),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      const newData: OrgChartData = {
        ...state.data,
        activeVersionId: newVersion.id,
        versions: [...state.data.versions, newVersion],
      }
      return pushHistory(state, newData)
    }

    case 'SWITCH_VERSION': {
      return {
        ...state,
        data: { ...state.data, activeVersionId: action.payload },
        selectedPersonId: null,
        editPanelOpen: false,
      }
    }

    case 'RENAME_VERSION': {
      const newData: OrgChartData = {
        ...state.data,
        versions: state.data.versions.map((v) =>
          v.id === action.payload.id ? { ...v, label: action.payload.label } : v
        ),
      }
      return { ...state, data: newData, isDirty: true }
    }

    case 'DELETE_VERSION': {
      if (action.payload === 'current') return state
      const remaining = state.data.versions.filter((v) => v.id !== action.payload)
      const newActiveId =
        state.data.activeVersionId === action.payload
          ? 'current'
          : state.data.activeVersionId
      const newData: OrgChartData = {
        ...state.data,
        activeVersionId: newActiveId,
        versions: remaining,
      }
      return pushHistory(state, newData)
    }

    case 'UPDATE_SETTINGS': {
      const newData: OrgChartData = {
        ...state.data,
        settings: { ...state.data.settings, ...action.payload },
      }
      return { ...state, data: newData, isDirty: true }
    }

    case 'APPLY_TEMPLATE_AS_VERSION': {
      const { template, versionLabel } = action.payload
      const result = applyTemplateAsVersion(template, versionLabel)
      const newVersion: OrgChartVersion = {
        id: result.versionId,
        label: result.label,
        date: null,
        people: result.people,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      const newData: OrgChartData = {
        ...state.data,
        activeVersionId: newVersion.id,
        versions: [...state.data.versions, newVersion],
      }
      return pushHistory(state, newData)
    }

    case 'MERGE_TEMPLATE': {
      const { template } = action.payload
      const version = getActiveVersion(state.data)
      const mergedPeople = mergeTemplateIntoCurrent(version.people, template)
      const newData = updateActiveVersion(state.data, (v) => ({
        ...v,
        people: mergedPeople,
      }))
      return pushHistory(state, newData)
    }

    case 'UNDO': {
      if (state.historyIndex <= 0) return state
      const newIndex = state.historyIndex - 1
      return {
        ...state,
        data: state.history[newIndex],
        historyIndex: newIndex,
        isDirty: true,
      }
    }

    case 'REDO': {
      if (state.historyIndex >= state.history.length - 1) return state
      const newIndex = state.historyIndex + 1
      return {
        ...state,
        data: state.history[newIndex],
        historyIndex: newIndex,
        isDirty: true,
      }
    }

    default:
      return state
  }
}
