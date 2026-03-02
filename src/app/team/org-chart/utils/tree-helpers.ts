import { OrgChartPerson } from '../types'

export function getRootNodes(people: OrgChartPerson[]): OrgChartPerson[] {
  return people
    .filter((p) => p.parentId === null)
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

export function getChildren(
  people: OrgChartPerson[],
  parentId: string
): OrgChartPerson[] {
  return people
    .filter((p) => p.parentId === parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

export function getStandardChildren(
  people: OrgChartPerson[],
  parentId: string
): OrgChartPerson[] {
  return people
    .filter((p) => p.parentId === parentId && !p.isAssistant)
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

export function getAssistants(
  people: OrgChartPerson[],
  parentId: string
): OrgChartPerson[] {
  return people
    .filter((p) => p.parentId === parentId && p.isAssistant)
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

export function getDescendantIds(
  people: OrgChartPerson[],
  personId: string
): Set<string> {
  const ids = new Set<string>()
  const queue = [personId]
  while (queue.length > 0) {
    const current = queue.shift()!
    const children = people.filter((p) => p.parentId === current)
    for (const child of children) {
      ids.add(child.id)
      queue.push(child.id)
    }
  }
  return ids
}

export function getAncestorIds(
  people: OrgChartPerson[],
  personId: string
): string[] {
  const ancestors: string[] = []
  let current = people.find((p) => p.id === personId)
  while (current?.parentId) {
    ancestors.push(current.parentId)
    current = people.find((p) => p.id === current!.parentId)
  }
  return ancestors
}

export function findPerson(
  people: OrgChartPerson[],
  personId: string
): OrgChartPerson | undefined {
  return people.find((p) => p.id === personId)
}

export function getDirectReportCount(
  people: OrgChartPerson[],
  personId: string
): number {
  return people.filter((p) => p.parentId === personId && !p.isAssistant).length
}

export function searchPeople(
  people: OrgChartPerson[],
  query: string
): Set<string> {
  if (!query.trim()) return new Set()
  const lower = query.toLowerCase()
  const matchingIds = new Set<string>()

  for (const person of people) {
    if (
      person.name.toLowerCase().includes(lower) ||
      person.title.toLowerCase().includes(lower) ||
      person.department.toLowerCase().includes(lower)
    ) {
      matchingIds.add(person.id)
      // Also add ancestors so the path to root is visible
      const ancestors = getAncestorIds(people, person.id)
      ancestors.forEach((id) => matchingIds.add(id))
    }
  }

  return matchingIds
}

export function getAllDepartments(people: OrgChartPerson[]): string[] {
  const depts = new Set<string>()
  for (const p of people) {
    if (p.department) depts.add(p.department)
  }
  return Array.from(depts).sort()
}

export function getNextSortOrder(
  people: OrgChartPerson[],
  parentId: string | null
): number {
  const siblings = people.filter((p) => p.parentId === parentId)
  if (siblings.length === 0) return 0
  return Math.max(...siblings.map((s) => s.sortOrder)) + 1
}
