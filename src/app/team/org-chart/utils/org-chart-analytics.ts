import { OrgChartPerson, OrgAnalytics } from '../types'
import { getChildren, getRootNodes } from './tree-helpers'

const STANDARD_FULL_TIME_HOURS = 38

export function getPersonFTE(person: OrgChartPerson): number {
  if (person.hoursPerWeek != null && person.hoursPerWeek > 0) {
    return Math.round((person.hoursPerWeek / STANDARD_FULL_TIME_HOURS) * 100) / 100
  }
  // Default: full-time = 1.0, others = 0 (user should fill in)
  return person.employmentType === 'full-time' ? 1.0 : 0
}

export function getAnalytics(people: OrgChartPerson[]): OrgAnalytics {
  const filled = people.filter((p) => !p.isVacant)
  const vacant = people.filter((p) => p.isVacant)

  // FTE totals
  const filledFTE = Math.round(filled.reduce((sum, p) => sum + getPersonFTE(p), 0) * 100) / 100
  const totalFTE = Math.round(people.reduce((sum, p) => sum + getPersonFTE(p), 0) * 100) / 100

  // Department breakdown
  const byDepartment: Record<string, { count: number; cost: number; fte: number }> = {}
  for (const p of people) {
    const dept = p.department || 'Unassigned'
    if (!byDepartment[dept]) byDepartment[dept] = { count: 0, cost: 0, fte: 0 }
    byDepartment[dept].count++
    byDepartment[dept].cost += p.salary || 0
    byDepartment[dept].fte = Math.round((byDepartment[dept].fte + getPersonFTE(p)) * 100) / 100
  }

  // Employment type breakdown
  const byEmploymentType: Record<string, number> = {}
  for (const p of people) {
    const type = p.employmentType || 'full-time'
    byEmploymentType[type] = (byEmploymentType[type] || 0) + 1
  }

  // Span of control (managers with direct reports)
  const managers = people.filter(
    (p) => getChildren(people, p.id).length > 0
  )
  const reportCounts = managers.map((m) => getChildren(people, m.id).length)
  const spanOfControl =
    reportCounts.length > 0
      ? {
          avg: Math.round(
            (reportCounts.reduce((a, b) => a + b, 0) / reportCounts.length) * 10
          ) / 10,
          min: Math.min(...reportCounts),
          max: Math.max(...reportCounts),
        }
      : { avg: 0, min: 0, max: 0 }

  // Org depth
  const orgDepth = calculateOrgDepth(people)

  return {
    totalHeadcount: filled.length,
    plannedHeadcount: vacant.length,
    totalCost: filled.reduce((sum, p) => sum + (p.salary || 0), 0),
    plannedCost: vacant.reduce((sum, p) => sum + (p.salary || 0), 0),
    filledFTE,
    totalFTE,
    byDepartment,
    byEmploymentType,
    spanOfControl,
    orgDepth,
  }
}

function calculateOrgDepth(people: OrgChartPerson[]): number {
  if (people.length === 0) return 0
  const roots = getRootNodes(people)
  let maxDepth = 0

  function traverse(personId: string, depth: number) {
    maxDepth = Math.max(maxDepth, depth)
    const children = getChildren(people, personId)
    for (const child of children) {
      traverse(child.id, depth + 1)
    }
  }

  for (const root of roots) {
    traverse(root.id, 1)
  }

  return maxDepth
}

export function formatCurrency(amount: number): string {
  if (amount >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(1)}M`
  }
  if (amount >= 1_000) {
    return `$${(amount / 1_000).toFixed(0)}k`
  }
  return `$${amount.toLocaleString()}`
}
