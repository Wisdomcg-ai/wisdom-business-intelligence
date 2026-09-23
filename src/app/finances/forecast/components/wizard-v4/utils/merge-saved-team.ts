/**
 * Step 4 team on reopen: Xero payroll is the source of truth for the people
 * it knows about; everyone the operator added by hand must survive.
 *
 * Before 8 Sep 2026 the wizard shell did `Xero employees ?? saved team`: the
 * moment Xero returned at least one employee, every saved member that Xero
 * does not know — contractors paid through bills, a director on no payroll,
 * a manually added casual — vanished from Step 4, along with the bonuses,
 * departures and commissions keyed on them. Urban Road's 13 contractors
 * ($354,000/yr) had to be re-typed on every reopen.
 *
 * Rules:
 *   - No Xero employees → the saved team is reconstructed as-is (unchanged
 *     fallback, including members flagged isFromXero).
 *   - A saved member that matches a Xero employee (same id, same Xero
 *     EmployeeID, or the same name) is represented by the fresh Xero record,
 *     keeping the SAVED id (so bonuses/departures/commissions still resolve)
 *     and the saved salary increase % (Xero has no such concept; the operator
 *     set it).
 *   - A saved member Xero does not list is kept only if the operator added
 *     them (isFromXero === false). A saved Xero employee who is no longer on
 *     payroll is not resurrected — Step 4's reconcile handles departures.
 */
import type { TeamMember, EmploymentType } from '../types'

/** The saved-assumptions shape (ExistingTeamMember) — kept structural so callers can pass raw JSON. */
export interface SavedTeamMember {
  employeeId: string
  name: string
  role?: string
  employmentType?: string
  currentSalary?: number
  year1Salary?: number
  hoursPerWeek?: number
  salaryIncreasePct?: number
  includeInForecast?: boolean
  isFromXero?: boolean
}

const EMPLOYMENT_TYPES: EmploymentType[] = ['full-time', 'part-time', 'casual', 'contractor']

function normaliseType(t: string | undefined): EmploymentType {
  return (EMPLOYMENT_TYPES as string[]).includes(t ?? '') ? (t as EmploymentType) : 'full-time'
}

export function normaliseName(name: string | undefined | null): string {
  return (name ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Rebuild a wizard TeamMember from its saved form (newSalary/superAmount are recomputed by the store). */
export function savedMemberToTeamMember(saved: SavedTeamMember): TeamMember {
  const type = normaliseType(saved.employmentType)
  return {
    id: saved.employeeId,
    name: saved.name,
    role: saved.role || 'Team Member',
    type,
    ...(type === 'contractor' ? { contractorType: 'onshore' as const } : {}),
    hoursPerWeek: saved.hoursPerWeek || 38,
    currentSalary: saved.currentSalary ?? 0,
    increasePct: typeof saved.salaryIncreasePct === 'number' ? saved.salaryIncreasePct : 3,
    newSalary: 0,
    superAmount: 0,
    isFromXero: saved.isFromXero ?? false,
  }
}

function findSavedMatch(xero: TeamMember, saved: SavedTeamMember[]): SavedTeamMember | undefined {
  const xeroName = normaliseName(xero.name)
  return (
    saved.find((s) => s.employeeId === xero.id) ??
    saved.find((s) => !!xero._xeroEmployeeId && s.employeeId === xero._xeroEmployeeId) ??
    saved.find((s) => normaliseName(s.name) === xeroName)
  )
}

export function mergeSavedTeamMembers(
  xeroTeam: TeamMember[],
  saved: SavedTeamMember[] | null | undefined,
): TeamMember[] {
  const savedList = (saved ?? []).filter((s) => s && typeof s.employeeId === 'string' && s.employeeId.length > 0)
  if (xeroTeam.length === 0) return savedList.map(savedMemberToTeamMember)
  if (savedList.length === 0) return xeroTeam

  const consumed = new Set<SavedTeamMember>()
  const merged: TeamMember[] = xeroTeam.map((xero) => {
    const match = findSavedMatch(xero, savedList)
    if (!match) return xero
    consumed.add(match)
    return {
      ...xero,
      // Keep the id the saved bonuses / departures / commissions point at.
      id: match.employeeId,
      ...(typeof match.salaryIncreasePct === 'number' ? { increasePct: match.salaryIncreasePct } : {}),
    }
  })

  const seenIds = new Set(merged.map((m) => m.id))
  const seenNames = new Set(merged.map((m) => normaliseName(m.name)))
  for (const s of savedList) {
    if (consumed.has(s)) continue
    // Xero used to know this person and no longer does — a departure, not a
    // loss to repair here.
    if (s.isFromXero === true) continue
    if (seenIds.has(s.employeeId) || seenNames.has(normaliseName(s.name))) continue
    const member = savedMemberToTeamMember(s)
    merged.push(member)
    seenIds.add(member.id)
    seenNames.add(normaliseName(member.name))
  }
  return merged
}

/**
 * Manual "Refresh from Xero": re-import Xero's people, keep the operator's.
 * Same rule as above, applied to the LIVE team instead of the saved one.
 */
export function keepHandAddedMembers(xeroTeam: TeamMember[], current: TeamMember[]): TeamMember[] {
  if (xeroTeam.length === 0) return current
  const ids = new Set(xeroTeam.map((m) => m.id))
  const xeroIds = new Set(xeroTeam.map((m) => m._xeroEmployeeId).filter(Boolean))
  const names = new Set(xeroTeam.map((m) => normaliseName(m.name)))
  const kept = current.filter(
    (m) =>
      !m.isFromXero &&
      !ids.has(m.id) &&
      !(m._xeroEmployeeId && xeroIds.has(m._xeroEmployeeId)) &&
      !names.has(normaliseName(m.name)),
  )
  return [...xeroTeam, ...kept]
}
