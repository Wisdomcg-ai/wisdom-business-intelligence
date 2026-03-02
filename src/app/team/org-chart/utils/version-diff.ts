import { OrgChartPerson, OrgChartVersion, VersionDiffResult } from '../types'

export function compareVersions(
  current: OrgChartVersion,
  target: OrgChartVersion
): VersionDiffResult {
  const currentIds = new Set(current.people.map((p) => p.id))
  const targetIds = new Set(target.people.map((p) => p.id))
  const currentMap = new Map(current.people.map((p) => [p.id, p]))

  const added = target.people.filter((p) => !currentIds.has(p.id))

  const removed = current.people.filter((p) => !targetIds.has(p.id))

  const modified: { person: OrgChartPerson; changes: string[] }[] = []
  for (const person of target.people) {
    if (!currentIds.has(person.id)) continue
    const original = currentMap.get(person.id)!
    const changes: string[] = []

    if (original.name !== person.name) changes.push('name')
    if (original.title !== person.title) changes.push('title')
    if (original.department !== person.department) changes.push('department')
    if (original.salary !== person.salary) changes.push('salary')
    if (original.employmentType !== person.employmentType) changes.push('type')
    if (original.parentId !== person.parentId) changes.push('reports to')
    if (original.isVacant !== person.isVacant) changes.push('vacancy')

    if (changes.length > 0) {
      modified.push({ person, changes })
    }
  }

  return { added, removed, modified }
}

export function getDiffStatus(
  personId: string,
  diff: VersionDiffResult | null
): 'new' | 'modified' | 'removed' | null {
  if (!diff) return null
  if (diff.added.some((p) => p.id === personId)) return 'new'
  if (diff.modified.some((m) => m.person.id === personId)) return 'modified'
  if (diff.removed.some((p) => p.id === personId)) return 'removed'
  return null
}

export function getDiffSummary(diff: VersionDiffResult): string {
  const parts: string[] = []
  if (diff.added.length > 0) parts.push(`+${diff.added.length} role${diff.added.length > 1 ? 's' : ''}`)
  if (diff.removed.length > 0) parts.push(`-${diff.removed.length} role${diff.removed.length > 1 ? 's' : ''}`)
  if (diff.modified.length > 0) parts.push(`${diff.modified.length} changed`)

  const addedCost = diff.added.reduce((sum, p) => sum + (p.salary || 0), 0)
  const removedCost = diff.removed.reduce((sum, p) => sum + (p.salary || 0), 0)
  const netCost = addedCost - removedCost
  if (netCost !== 0) {
    const sign = netCost > 0 ? '+' : ''
    const formatted = Math.abs(netCost) >= 1000
      ? `${sign}$${(netCost / 1000).toFixed(0)}k`
      : `${sign}$${netCost.toLocaleString()}`
    parts.push(`${formatted} cost`)
  }

  return parts.join(', ')
}
