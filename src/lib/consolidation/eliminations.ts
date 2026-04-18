/**
 * Intercompany Elimination Engine — Phase 34.0
 *
 * Rules live in `consolidation_elimination_rules`. Rule types:
 *   - account_pair      — explicit account_code or regex against account_name_pattern
 *   - account_category  — regex-based match across entities (e.g. "Advertising transfers")
 *   - intercompany_loan — BS-only use (Iteration 34.1 / buildConsolidatedBalanceSheet).
 *                         P&L engine MUST filter these out before calling applyEliminations.
 *
 * Direction semantics (per RESEARCH.md § Pattern 3):
 *   - bidirectional        — eliminate matches on BOTH entities
 *   - entity_a_eliminates  — eliminate matches on entity A only
 *   - entity_b_eliminates  — eliminate matches on entity B only
 *
 * Sign convention:
 *   Elimination `amount` is ALWAYS the negative of the source amount on each matched side
 *   so that (pre-elim consolidated) + (eliminations) = consolidated after eliminations.
 *
 *   Example — Dragon/Easy Hail advertising transfer at Mar 2026:
 *     Dragon Advertising     source: -9,015  → entry.amount = +9,015
 *     Easy Hail Advertising  source: +9,015  → entry.amount = -9,015
 *     Raw sum pre-elim = 0; eliminations net to 0 but explicit entries appear in
 *     the diagnostic panel so the coach can verify the $9,015 transfer was detected.
 */

import type {
  EliminationRule,
  EliminationEntry,
  EntityColumn,
  XeroPLLineLike,
} from './types'

/** Maximum length of an account_name_pattern regex — mirrors DB CHECK constraint. */
const MAX_PATTERN_LENGTH = 256

/**
 * Load active elimination rules for a consolidation group from Supabase.
 * Throws on DB error; callers are responsible for filtering by `rule_type`
 * (P&L engine filters out 'intercompany_loan'; BS engine consumes only that type).
 */
export async function loadEliminationRules(
  supabase: any,
  groupId: string,
): Promise<EliminationRule[]> {
  const { data, error } = await supabase
    .from('consolidation_elimination_rules')
    .select('*')
    .eq('group_id', groupId)
    .eq('active', true)

  if (error) {
    throw new Error(
      `[Eliminations] Failed to load rules for group ${groupId}: ${error.message}`,
    )
  }
  return (data ?? []) as EliminationRule[]
}

/**
 * Match a rule against one side's lines. Matches by exact account_code OR regex on
 * account_name_pattern (case-insensitive). Both matchers triggering = UNION.
 *
 * Throws on:
 *   - pattern > MAX_PATTERN_LENGTH (DoS guard; mirrors DB CHECK constraint)
 *   - invalid regex syntax (error message includes rule_id + pattern for diagnostics)
 */
export function matchRuleToLines(
  rule: EliminationRule,
  side: 'a' | 'b',
  lines: XeroPLLineLike[],
): XeroPLLineLike[] {
  const code = side === 'a' ? rule.entity_a_account_code : rule.entity_b_account_code
  const pattern =
    side === 'a' ? rule.entity_a_account_name_pattern : rule.entity_b_account_name_pattern

  if (!code && !pattern) {
    // DB CHECK enforces at least one matcher per side; defensive no-match in TS.
    return []
  }

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
      throw new Error(
        `[Eliminations] Rule ${rule.id} has invalid regex "${pattern}": ${String(err)}`,
      )
    }
  }

  return lines.filter((line) => {
    if (code && line.account_code === code) return true
    if (re && re.test(line.account_name)) return true
    return false
  })
}

/**
 * Produce elimination entries for a set of rules against per-entity P&L columns,
 * scoped to a single `reportMonth`. Each emitted entry has:
 *   amount = -source_amount  (sign convention — adding entry amounts to the raw
 *                             consolidated sum yields the post-elimination total).
 *
 * Rules that reference an entity not in `byEntity` are silently skipped — this
 * happens when a group has members that weren't loaded (fixture-only tests,
 * or partially-seeded groups). Diagnostics surface can log these later.
 */
export function applyEliminations(
  rules: EliminationRule[],
  byEntity: EntityColumn[],
  reportMonth: string,
): EliminationEntry[] {
  const entries: EliminationEntry[] = []

  for (const rule of rules) {
    const entityA = byEntity.find((e) => e.business_id === rule.entity_a_business_id)
    const entityB = byEntity.find((e) => e.business_id === rule.entity_b_business_id)
    if (!entityA || !entityB) continue // missing member — skip rule (diagnostics TBD)

    const matchedA = matchRuleToLines(rule, 'a', entityA.lines)
    const matchedB = matchRuleToLines(rule, 'b', entityB.lines)

    if (rule.direction !== 'entity_b_eliminates') {
      for (const line of matchedA) {
        const src = line.monthly_values[reportMonth] ?? 0
        entries.push({
          rule_id: rule.id,
          rule_description: rule.description,
          account_type: line.account_type,
          account_name: line.account_name,
          amount: -src,
          source_entity_id: rule.entity_a_business_id,
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
          source_entity_id: rule.entity_b_business_id,
          source_amount: src,
        })
      }
    }
  }

  return entries
}
