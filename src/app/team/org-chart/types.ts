export type EmploymentType = 'full-time' | 'part-time' | 'contractor' | 'casual'

export type ViewMode = 'detailed' | 'compact' | 'photo'

export interface OrgChartPerson {
  id: string
  name: string
  title: string
  department: string
  employmentType: EmploymentType
  startDate: string
  salary: number
  photoUrl?: string
  parentId: string | null
  sortOrder: number
  hoursPerWeek?: number
  isVacant?: boolean
  isAssistant?: boolean
  plannedHireDate?: string
  notes?: string
}

export interface OrgChartVersion {
  id: string
  label: string
  date: string | null
  people: OrgChartPerson[]
  createdAt: string
  updatedAt: string
}

export interface OrgChartSettings {
  showSalaries: boolean
  showHeadcount: boolean
  companyName: string
  departmentColors: Record<string, string>
  viewMode: ViewMode
}

export interface OrgChartData {
  version: 1
  activeVersionId: string
  versions: OrgChartVersion[]
  settings: OrgChartSettings
}

export interface NodePosition {
  x: number
  y: number
}

export interface TreeLayoutResult {
  positions: Map<string, NodePosition>
  totalWidth: number
  totalHeight: number
}

export interface VersionDiffResult {
  added: OrgChartPerson[]
  removed: OrgChartPerson[]
  modified: { person: OrgChartPerson; changes: string[] }[]
}

export interface OrgAnalytics {
  totalHeadcount: number
  plannedHeadcount: number
  totalCost: number
  plannedCost: number
  filledFTE: number
  totalFTE: number
  byDepartment: Record<string, { count: number; cost: number; fte: number }>
  byEmploymentType: Record<string, number>
  spanOfControl: { avg: number; min: number; max: number }
  orgDepth: number
}

export const DEPARTMENT_PALETTE = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-violet-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-orange-500',
  'bg-indigo-500',
] as const

export const DEPARTMENT_BORDER_PALETTE = [
  'border-l-blue-500',
  'border-l-emerald-500',
  'border-l-violet-500',
  'border-l-amber-500',
  'border-l-rose-500',
  'border-l-cyan-500',
  'border-l-orange-500',
  'border-l-indigo-500',
] as const

export const DEPARTMENT_TEXT_PALETTE = [
  'text-blue-700',
  'text-emerald-700',
  'text-violet-700',
  'text-amber-700',
  'text-rose-700',
  'text-cyan-700',
  'text-orange-700',
  'text-indigo-700',
] as const

export const DEPARTMENT_BG_PALETTE = [
  'bg-blue-100',
  'bg-emerald-100',
  'bg-violet-100',
  'bg-amber-100',
  'bg-rose-100',
  'bg-cyan-100',
  'bg-orange-100',
  'bg-indigo-100',
] as const

export function getDepartmentColorIndex(
  department: string,
  departmentColors: Record<string, string>
): number {
  if (departmentColors[department]) {
    const idx = DEPARTMENT_PALETTE.indexOf(departmentColors[department] as any)
    if (idx >= 0) return idx
  }
  const hash = department.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return hash % DEPARTMENT_PALETTE.length
}
