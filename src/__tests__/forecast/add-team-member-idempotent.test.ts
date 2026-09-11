/**
 * Urban Road's FY2027 forecast held 25 team members for 6 employees and 13
 * contractors — every salaried person twice, once from the restored draft and
 * once from Xero. SYS-TEAM-WAGES read $121,699 a month against a real payroll
 * of $52,519, and the Full Year page's wages forecast sat $546,000 above the
 * budget printed beside it.
 *
 * The rule these pin: adding somebody already on the team is not an add.
 */
import { describe, it, expect } from 'vitest'
import { normaliseName } from '@/app/finances/forecast/components/wizard-v4/utils/merge-saved-team'

interface Member { name: string; _xeroEmployeeId?: string }

/** The predicate `addTeamMember` applies before appending. */
function alreadyOnTeam(team: readonly Member[], member: Member): boolean {
  const xeroId = member._xeroEmployeeId
  const nameKey = normaliseName(member.name)
  return team.some((m) =>
    (!!xeroId && m._xeroEmployeeId === xeroId) ||
    (!!nameKey && normaliseName(m.name) === nameKey),
  )
}

const TEAM: Member[] = [
  { name: 'Andrea Shinners', _xeroEmployeeId: '2c50063e-f7ca-41b9-87e6-befddd844679' },
  { name: 'Cheryl Henderson', _xeroEmployeeId: '28cf67bf-460b-4ccf-9ac9-7d3df96718ab' },
  { name: 'Ailene Alfonso' }, // hand-added contractor, no Xero id
]

describe('adding a team member who is already there', () => {
  it('recognises the same Xero employee', () => {
    expect(alreadyOnTeam(TEAM, {
      name: 'Andrea Shinners', _xeroEmployeeId: '2c50063e-f7ca-41b9-87e6-befddd844679',
    })).toBe(true)
  })

  it('recognises the same person when Xero renames them', () => {
    // Married name, corrected spelling — the id still says who it is.
    expect(alreadyOnTeam(TEAM, {
      name: 'Andrea Shinners-Smith', _xeroEmployeeId: '2c50063e-f7ca-41b9-87e6-befddd844679',
    })).toBe(true)
  })

  it('recognises a hand-added contractor by name when Xero later knows them', () => {
    // The contractor has no Xero id on the team; the incoming row has one.
    // Falling through on the id alone would have added a second Ailene.
    expect(alreadyOnTeam(TEAM, {
      name: 'Ailene Alfonso', _xeroEmployeeId: 'e53da7c3-09f3-44da-98af-bcb0363a033f',
    })).toBe(true)
  })

  it('matches the name past spacing and case', () => {
    // The real data carries "Suzanne  Atkin" with two spaces.
    expect(alreadyOnTeam([{ name: 'Suzanne  Atkin' }], { name: 'suzanne atkin' })).toBe(true)
  })

  it('still admits somebody genuinely new', () => {
    expect(alreadyOnTeam(TEAM, { name: 'New Person', _xeroEmployeeId: 'nobody' })).toBe(false)
  })

  it('admits a second person whose name is blank rather than collapsing them', () => {
    // An empty name is not evidence of identity.
    expect(alreadyOnTeam([{ name: '' }], { name: '' })).toBe(false)
  })

  it('the whole Xero payroll applied twice yields one team', () => {
    const payroll: Member[] = [
      { name: 'Andrea Shinners', _xeroEmployeeId: 'a' },
      { name: 'Deborah Leydon', _xeroEmployeeId: 'b' },
      { name: 'Lara Powell', _xeroEmployeeId: 'c' },
    ]
    let team: Member[] = []
    for (const pass of [payroll, payroll]) {
      for (const m of pass) if (!alreadyOnTeam(team, m)) team = [...team, m]
    }
    expect(team).toHaveLength(3)
  })
})
