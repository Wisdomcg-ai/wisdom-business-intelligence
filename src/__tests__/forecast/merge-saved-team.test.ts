/**
 * Reopening a forecast must not lose the people the operator added by hand.
 *
 * Urban Road, 7 Sep 2026: Xero payroll lists 6 employees; the forecast also
 * carries 13 contractors paid through bills ($354,000/yr) plus a bonus on one
 * of them. The shell's `Xero ?? saved` rule dropped all 13 (and the bonus,
 * whose member id no longer resolved) on every reopen.
 */
import { describe, it, expect } from 'vitest'
import {
  mergeSavedTeamMembers,
  keepHandAddedMembers,
  savedMemberToTeamMember,
  type SavedTeamMember,
} from '@/app/finances/forecast/components/wizard-v4/utils/merge-saved-team'
import type { TeamMember } from '@/app/finances/forecast/components/wizard-v4/types'

const xero = (id: string, name: string, over: Partial<TeamMember> = {}): TeamMember => ({
  id, name, role: 'Team Member', type: 'full-time', hoursPerWeek: 38, currentSalary: 100_000,
  increasePct: 3, newSalary: 0, superAmount: 0, isFromXero: true, _xeroEmployeeId: id, ...over,
})
const saved = (employeeId: string, name: string, over: Partial<SavedTeamMember> = {}): SavedTeamMember => ({
  employeeId, name, role: 'Role', employmentType: 'full-time', currentSalary: 90_000, salaryIncreasePct: 3,
  includeInForecast: true, isFromXero: true, ...over,
})

const XERO = [xero('x-lara', 'Lara Powell', { currentSalary: 103_000 }), xero('x-suz', 'Suzanne Atkin', { currentSalary: 77_250 })]
const CONTRACTOR = saved('c-akshay', 'Akshay Nirmal Proprietorship', {
  role: 'All Departments — Data', employmentType: 'contractor', currentSalary: 72_000, salaryIncreasePct: 0, isFromXero: false,
})
const MANUAL_EMPLOYEE = saved('m-dir', 'Director Fees Only', { employmentType: 'part-time', currentSalary: 40_000, isFromXero: false })

describe('mergeSavedTeamMembers', () => {
  it('keeps every hand-added saved member alongside the fresh Xero people, with the saved id', () => {
    const out = mergeSavedTeamMembers(XERO, [saved('x-lara', 'Lara Powell'), saved('x-suz', 'Suzanne Atkin'), CONTRACTOR, MANUAL_EMPLOYEE])
    expect(out.map((m) => m.id)).toEqual(['x-lara', 'x-suz', 'c-akshay', 'm-dir'])
    const akshay = out.find((m) => m.id === 'c-akshay')!
    expect(akshay).toMatchObject({ type: 'contractor', contractorType: 'onshore', currentSalary: 72_000, increasePct: 0, isFromXero: false, role: 'All Departments — Data' })
    // Xero's figures win for Xero people.
    expect(out.find((m) => m.id === 'x-lara')!.currentSalary).toBe(103_000)
  })

  it('does not resurrect a saved Xero employee who is no longer on payroll', () => {
    const departed = saved('x-old', 'Thomas White', { isFromXero: true })
    const out = mergeSavedTeamMembers(XERO, [departed, CONTRACTOR])
    expect(out.map((m) => m.id)).toEqual(['x-lara', 'x-suz', 'c-akshay'])
  })

  it('matches a Xero employee to the saved member by id, Xero EmployeeID, or name — never duplicating', () => {
    const renamedId = xero('new-guid', 'Suzanne Atkin', { _xeroEmployeeId: 'x-suz' })
    const byName = xero('another-guid', 'lara  powell', { _xeroEmployeeId: undefined })
    const out = mergeSavedTeamMembers([renamedId, byName], [saved('x-suz', 'Suzanne Atkin', { salaryIncreasePct: 5 }), saved('x-lara', 'Lara Powell', { salaryIncreasePct: 4, isFromXero: false })])
    expect(out).toHaveLength(2)
    // Saved ids are kept so bonuses / departures keyed on them still resolve.
    expect(out.map((m) => m.id).sort()).toEqual(['x-lara', 'x-suz'])
    // The operator's increase % survives the re-import; Xero has no such field.
    expect(out.find((m) => m.id === 'x-suz')!.increasePct).toBe(5)
    expect(out.find((m) => m.id === 'x-lara')!.increasePct).toBe(4)
    // …but Xero's identity fields stay Xero's.
    expect(out.find((m) => m.id === 'x-suz')!._xeroEmployeeId).toBe('x-suz')
  })

  it('a hand-added member later imported from Xero under the same name is not added twice', () => {
    const out = mergeSavedTeamMembers(XERO, [saved('manual-1', 'Lara Powell', { isFromXero: false, currentSalary: 1 })])
    expect(out).toHaveLength(2)
    expect(out.find((m) => m.name === 'Lara Powell')!.currentSalary).toBe(103_000)
  })

  it('no Xero employees → the saved team is reconstructed exactly as before (Xero-flagged included)', () => {
    const out = mergeSavedTeamMembers([], [saved('x-lara', 'Lara Powell'), CONTRACTOR])
    expect(out.map((m) => m.id)).toEqual(['x-lara', 'c-akshay'])
    expect(out[0]).toMatchObject({ isFromXero: true, currentSalary: 90_000, increasePct: 3 })
  })

  it('nothing saved → Xero team untouched; junk saved rows are ignored', () => {
    expect(mergeSavedTeamMembers(XERO, undefined)).toBe(XERO)
    expect(mergeSavedTeamMembers(XERO, [{ employeeId: '', name: 'ghost' } as SavedTeamMember])).toEqual(XERO)
  })

  it('savedMemberToTeamMember defaults: role, hours, increase, type', () => {
    const m = savedMemberToTeamMember({ employeeId: 'z', name: 'Zed', employmentType: 'weird' })
    expect(m).toMatchObject({ id: 'z', role: 'Team Member', type: 'full-time', hoursPerWeek: 38, increasePct: 3, currentSalary: 0, isFromXero: false })
    expect(m.contractorType).toBeUndefined()
  })
})

describe('keepHandAddedMembers (manual Refresh from Xero)', () => {
  const live: TeamMember[] = [
    xero('x-lara', 'Lara Powell', { increasePct: 4 }),
    { ...savedMemberToTeamMember(CONTRACTOR) },
    xero('x-gone', 'Thomas White'),
  ]

  it('re-imports Xero people, keeps hand-added ones, drops Xero people Xero no longer lists', () => {
    const fresh = [xero('x-lara', 'Lara Powell', { currentSalary: 110_000 }), xero('x-new', 'New Hire')]
    const out = keepHandAddedMembers(fresh, live)
    expect(out.map((m) => m.id)).toEqual(['x-lara', 'x-new', 'c-akshay'])
    expect(out[0].currentSalary).toBe(110_000)
  })

  it('does not duplicate a hand-added person who now appears in Xero under the same name', () => {
    const fresh = [xero('x-akshay', 'Akshay Nirmal Proprietorship')]
    const out = keepHandAddedMembers(fresh, live)
    expect(out.filter((m) => /Akshay/.test(m.name))).toHaveLength(1)
    expect(out[0].id).toBe('x-akshay')
  })

  it('no Xero employees → the live team is left alone', () => {
    expect(keepHandAddedMembers([], live)).toBe(live)
  })
})
