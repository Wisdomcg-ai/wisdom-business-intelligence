/**
 * Intercompany Elimination Engine — Phase 34 (Tenant Model)
 *
 * Rules live in `consolidation_elimination_rules`, business-scoped, pairing two
 * tenants (tenant_a_id, tenant_b_id) within the SAME business. Rule types:
 *   - account_pair      — explicit account_code or regex against account_name_pattern
 *   - account_category  — regex-based match across tenants
 *   - intercompany_loan — BS-only (filtered out by P&L engine before applyEliminations)
 *
 * Direction semantics:
 *   - bidirectional        — eliminate matches on BOTH tenants
 *   - entity_a_eliminates  — eliminate matches on tenant A only
 *   - entity_b_eliminates  — eliminate matches on tenant B only
 *
 * Sign convention: entry.amount = -source_amount so that
 *   (raw consolidated sum) + (Σ entry.amount) = post-elimination consolidated total.
 */

import type {
  EliminationRule,
  EliminationEntry,
  EntityColumn,
  XeroPLLineLike,
} from './types'

const MAX_PATTERN_LENGTH = 256

/**
 * Load active elimination rules for a business. Callers filter by rule_type
 * (P&L filters out 'intercompany_loan'; BS consumes only that type).
 */
export async function loadEliminationRulesForBusiness(
  supabase: any,
  businessId: string,
): Promise<EliminationRule[]> {
  const { data, error } = await supabase
    .from('consolidation_elimination_rules')
    .select('*')
    .eq('business_id', businessId)
    .eq('active', true)

  if (error) {
    throw new Error(`[Eliminations] Failed to load rules for business ${businessId}: ${error.message}`)
  }
  return (data ?? []) as EliminationRule[]
}

/**
 * Match a rule against one side's lines. Matches by exact account_code OR regex on
 * account_name_pattern (case-insensitive, union).
 *
 * Throws on:
 *   - pattern > MAX_PATTERN_LENGTH (DoS guard)
 *   - invalid regex syntax
 */
export function matchRuleToLines(
  rule: EliminationRule,
  side: 'a' | 'b',
  lines: XeroPLLineLike[],
): XeroPLLineLike[] {
  const code = side === 'a' ? rule.entity_a_account_code : rule.entity_b_account_code
  const pattern =
    side === 'a' ? rule.entity_a_account_name_pattern : rule.entity_b_account_name_pattern

  if (!code && !pattern) return []

  if (pattern && pattern.length > MAX_PATTERN_LENGTH) {
    throw new Error(
      `[Eliminations] Rule ${rule.id} pattern exceeds ${MAX_PATTERN_LENGTH} chars (DoS guard)`,
    )
  }

  let re: RegExp | null = null
  if (pattern) {
    try {
      re = new RegExp(pattern, 'i')
    } catch (err) {
      throw new Error(`[Eliminations] Rule ${rule.id} has invalid regex "${pattern}": ${String(err)}`)
    }
  }

  return lines.filter((line) => {
    if (code && line.account_code === code) return true
    if (re && re.test(line.account_name)) return true
    return false
  })
}

/**
 * Produce elimination entries for a set of rules against per-tenant P&L columns,
 * scoped to a single `reportMonth`.
 *
 * Rules referencing a tenant not in byTenant are skipped.
 */
export function applyEliminations(
  rules: EliminationRule[],
  byTenant: EntityColumn[],
  reportMonth: string,
): EliminationEntry[] {
  const entries: EliminationEntry[] = []

  for (const rule of rules) {
    const tenantA = byTenant.find((e) => e.tenant_id === rule.tenant_a_id)
    const tenantB = byTenant.find((e) => e.tenant_id === rule.tenant_b_id)
    if (!tenantA || !tenantB) continue

    const matchedA = matchRuleToLines(rule, 'a', tenantA.lines)
    const matchedB = matchRuleToLines(rule, 'b', tenantB.lines)

    if (rule.direction !== 'entity_b_eliminates') {
      for (const line of matchedA) {
        const src = line.monthly_values[reportMonth] ?? 0
        entries.push({
          rule_id: rule.id,
          rule_description: rule.description,
          account_type: line.account_type,
          account_name: line.account_name,
          amount: -src,
          source_tenant_id: rule.tenant_a_id,
          source_amount: src,
        })
      }
    }
    if (rule.direction !== 'entity_a_eliminates') {
      for (const line of matchedB) {
        const src = line.monthly_values[reportMonth] ?? 0
        entries.push({
          rule_id: rule.id,
          rule_description: rule.description,
          account_type: line.account_type,
          account_name: line.account_name,
          amount: -src,
          source_tenant_id: rule.tenant_b_id,
          source_amount: src,
        })
      }
    }
  }

  return entries
}
