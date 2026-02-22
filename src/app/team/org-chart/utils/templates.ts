import { OrgChartPerson } from '../types'

export interface OrgChartTemplate {
  id: string
  label: string
  description: string
  roleCount: number
  people: OrgChartPerson[]
}

function p(
  id: string,
  name: string,
  title: string,
  department: string,
  parentId: string | null,
  sortOrder: number,
  salary: number = 0,
  isAssistant: boolean = false
): OrgChartPerson {
  return {
    id,
    name,
    title,
    department,
    employmentType: 'full-time',
    startDate: '',
    salary,
    parentId,
    sortOrder,
    isVacant: true,
    isAssistant,
    notes: '',
  }
}

export const ORG_CHART_TEMPLATES: OrgChartTemplate[] = [
  {
    id: 'owner-operator',
    label: 'Owner-Operator',
    description: '1 owner + 2 support roles. Most small businesses start here.',
    roleCount: 3,
    people: [
      p('t-ceo', 'Owner', 'Owner / CEO', 'Leadership', null, 0, 120000),
      p('t-admin', 'Office Manager', 'Office Manager / Admin', 'Operations', 't-ceo', 0, 60000),
      p('t-va', 'Virtual Assistant', 'Virtual Assistant', 'Operations', 't-ceo', 1, 35000),
    ],
  },
  {
    id: 'small-team',
    label: 'Small Team',
    description: 'CEO + key functional leads. The first real org chart.',
    roleCount: 8,
    people: [
      p('t-ceo', 'CEO', 'CEO / Owner', 'Leadership', null, 0, 150000),
      p('t-ea', 'EA', 'Executive Assistant', 'Leadership', 't-ceo', 0, 55000, true),
      p('t-ops', 'Ops Manager', 'Operations Manager', 'Operations', 't-ceo', 0, 90000),
      p('t-ops-1', 'Team Member', 'Team Member', 'Operations', 't-ops', 0, 55000),
      p('t-sales', 'Sales Lead', 'Sales Lead', 'Sales', 't-ceo', 1, 85000),
      p('t-sales-1', 'Sales Rep', 'Sales Representative', 'Sales', 't-sales', 0, 60000),
      p('t-mktg', 'Marketing', 'Marketing Coordinator', 'Marketing', 't-ceo', 2, 65000),
      p('t-admin', 'Office Manager', 'Office Manager / Finance', 'Finance', 't-ceo', 3, 60000),
    ],
  },
  {
    id: 'growth-stage',
    label: 'Growth Stage',
    description: 'Department heads with teams. Scaling towards 15+ people.',
    roleCount: 14,
    people: [
      p('t-ceo', 'CEO', 'CEO / Managing Director', 'Leadership', null, 0, 180000),
      p('t-ea', 'EA', 'Executive Assistant', 'Leadership', 't-ceo', 0, 65000, true),
      // Operations
      p('t-ops', 'Head of Ops', 'Head of Operations', 'Operations', 't-ceo', 0, 110000),
      p('t-ops-1', 'Ops Coordinator', 'Operations Coordinator', 'Operations', 't-ops', 0, 55000),
      p('t-ops-2', 'Team Lead', 'Team Lead', 'Operations', 't-ops', 1, 70000),
      // Sales
      p('t-sales', 'Head of Sales', 'Head of Sales', 'Sales', 't-ceo', 1, 110000),
      p('t-sales-1', 'Sales Rep', 'Sales Representative', 'Sales', 't-sales', 0, 65000),
      p('t-sales-2', 'Sales Rep', 'Sales Representative', 'Sales', 't-sales', 1, 65000),
      // Marketing
      p('t-mktg', 'Marketing Lead', 'Head of Marketing', 'Marketing', 't-ceo', 2, 95000),
      p('t-mktg-1', 'Content Specialist', 'Content & Digital Specialist', 'Marketing', 't-mktg', 0, 60000),
      // Finance
      p('t-fin', 'Finance Manager', 'Finance Manager', 'Finance', 't-ceo', 3, 90000),
      p('t-fin-1', 'Bookkeeper', 'Bookkeeper / Admin', 'Finance', 't-fin', 0, 55000),
      // People
      p('t-hr', 'People Manager', 'People & Culture Manager', 'People', 't-ceo', 4, 85000),
      p('t-hr-1', 'HR Coordinator', 'HR Coordinator', 'People', 't-hr', 0, 55000),
    ],
  },
]

/**
 * Generate unique IDs for template people so they don't clash with existing data.
 */
function reIdPeople(people: OrgChartPerson[]): OrgChartPerson[] {
  const idMap = new Map<string, string>()
  const ts = Date.now()

  // Generate new IDs
  for (const person of people) {
    const newId = `person-${ts}-${Math.random().toString(36).slice(2, 7)}`
    idMap.set(person.id, newId)
  }

  return people.map((person) => ({
    ...person,
    id: idMap.get(person.id)!,
    parentId: person.parentId ? idMap.get(person.parentId) || null : null,
  }))
}

/**
 * Apply template as a brand-new version (non-destructive).
 */
export function applyTemplateAsVersion(
  template: OrgChartTemplate,
  versionLabel: string
): { versionId: string; label: string; people: OrgChartPerson[] } {
  return {
    versionId: `ver-${Date.now()}`,
    label: versionLabel,
    people: reIdPeople(template.people),
  }
}

/**
 * Merge template roles into an existing people array.
 * Adds roles that don't exist (by matching title), keeps existing ones.
 * All new roles are marked vacant.
 */
export function mergeTemplateIntoCurrent(
  existingPeople: OrgChartPerson[],
  template: OrgChartTemplate
): OrgChartPerson[] {
  const templatePeople = reIdPeople(template.people)
  const existingTitles = new Set(
    existingPeople.map((p) => p.title.toLowerCase().trim())
  )

  // Find the root node in existing people (to attach orphan template nodes)
  const existingRoot = existingPeople.find((p) => p.parentId === null)

  // Build a mapping from template parentId to real parentId
  // Match template people to existing people by title
  const templateToExisting = new Map<string, string>()
  for (const tp of templatePeople) {
    const match = existingPeople.find(
      (ep) => ep.title.toLowerCase().trim() === tp.title.toLowerCase().trim()
    )
    if (match) {
      templateToExisting.set(tp.id, match.id)
    }
  }

  // Only add template people whose title doesn't already exist
  const newPeople: OrgChartPerson[] = []
  for (const tp of templatePeople) {
    if (existingTitles.has(tp.title.toLowerCase().trim())) {
      continue // skip — already have this role
    }

    // Resolve parentId: if parent was matched to existing, use existing ID
    let resolvedParentId = tp.parentId
    if (tp.parentId && templateToExisting.has(tp.parentId)) {
      resolvedParentId = templateToExisting.get(tp.parentId)!
    } else if (tp.parentId === null) {
      // Template root — skip if we already have a root, or attach to existing root
      if (existingRoot) {
        resolvedParentId = existingRoot.id
      }
    } else {
      // Parent wasn't matched — attach to existing root as fallback
      if (existingRoot) {
        resolvedParentId = existingRoot.id
      }
    }

    newPeople.push({
      ...tp,
      parentId: resolvedParentId,
      isVacant: true,
      sortOrder: existingPeople.length + newPeople.length,
    })
  }

  return [...existingPeople, ...newPeople]
}
