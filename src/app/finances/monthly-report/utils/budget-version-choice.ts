/**
 * What the settings panel says about a client's approved budget, and whether
 * the coach may switch to it.
 *
 * The picker was disabled unless there was EXACTLY ONE locked version, which is
 * a business with one Xero organisation. Dragon Roofing & Easy Hail is held to
 * one version per organisation and IICT to one for the group; both could import
 * their budgets and neither could be switched onto them (DRG-03).
 *
 * The rule now is the resolver's: one version per scope in force. Two versions
 * of the SAME scope effective from the same month is what nothing can choose
 * between, and that — not "more than one version" — is what disables the
 * picker. A later revision of one organisation's budget (a different effective
 * month) is ordinary and stays selectable.
 */
export interface BudgetVersionSummary {
  id: string
  label: string | null
  effective_from: string | null
  months_covered: number | null
  fiscal_year: number
  tenant_id?: string | null
  source?: string | null
}

export interface BudgetVersionChoice {
  /** May the coach choose the approved budget? */
  selectable: boolean
  /** The option's own words. */
  label: string
  /** What the coach needs to know beneath it, or null. */
  note: string | null
  tone: 'neutral' | 'warning'
}

export function budgetVersionChoice(
  versions: readonly BudgetVersionSummary[],
  orgNames: Record<string, string> = {},
): BudgetVersionChoice {
  if (versions.length === 0) {
    return { selectable: false, label: 'Approved budget', note: 'No budget imported for this business yet.', tone: 'neutral' }
  }

  const clash = new Map<string, BudgetVersionSummary[]>()
  for (const v of versions) {
    const key = `${v.fiscal_year}|${v.tenant_id ?? ''}|${v.effective_from ?? ''}`
    clash.set(key, [...(clash.get(key) ?? []), v])
  }
  const ambiguous = [...clash.values()].find((group) => group.length > 1)
  if (ambiguous) {
    return {
      selectable: false,
      label: 'Approved budget',
      note: `Two approved budgets take effect from ${ambiguous[0].effective_from ?? 'the same month'}`
        + `${ambiguous[0].tenant_id ? ` for ${orgNames[ambiguous[0].tenant_id] ?? 'one organisation'}` : ''}`
        + ', so the report cannot choose between them.',
      tone: 'warning',
    }
  }

  // Xero's own word for a single imported budget, kept so the ten clients
  // already on it read what they have always read.
  const allXero = versions.every((v) => (v.source ?? 'xero') === 'xero')
  const noun = allXero ? 'Xero budget' : 'Approved budget'

  if (versions.length === 1) {
    const v = versions[0]
    const parts = [
      v.label ?? 'imported',
      v.effective_from ? `effective ${v.effective_from}` : null,
      v.months_covered != null ? `${v.months_covered} of 12 months` : null,
    ].filter(Boolean)
    return { selectable: true, label: `${noun} — ${parts.join(' · ')}`, note: null, tone: 'neutral' }
  }

  const perOrg = versions.filter((v) => v.tenant_id)
  const named = [...new Set(perOrg.map((v) => orgNames[v.tenant_id as string] ?? 'an organisation'))]
  return {
    selectable: true,
    label: `${noun} — ${versions.length} versions`,
    note: named.length > 0
      ? `One per Xero organisation: ${named.join(', ')}. The report sums them in AUD.`
      : 'The report reads the version in force for each month.',
    tone: 'neutral',
  }
}
