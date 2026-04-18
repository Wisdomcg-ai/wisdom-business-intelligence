---
phase: 34
plan: 00d
type: execute
wave: 3
depends_on: ['34-00a', '34-00b']
files_modified:
  - src/lib/consolidation/eliminations.ts
  - src/lib/consolidation/eliminations.test.ts
  - src/lib/consolidation/engine.ts
  - src/lib/consolidation/engine.test.ts
  - supabase/migrations/20260421d_seed_dragon_iict_groups.sql
autonomous: false
requirements: [MLTE-01, MLTE-02]

must_haves:
  truths:
    - "applyEliminations(rules, byEntity, reportMonth) returns an EliminationEntry[] with amount negating each matched line's reportMonth value"
    - "Bidirectional rule on Dragon advertising (±$9,015) produces TWO entries summing to -(−9015) + -(+9015) = 0 net — but both sides get zeroed individually in the consolidated column"
    - "rule_type='intercompany_loan' (BS use, plan 34-01a) matches against both sides and zeroes both — signed correctly to keep BS balanced"
    - "matchRuleToLines prefers account_code exact match; falls back to regex on account_name_pattern (case-insensitive)"
    - "engine.buildConsolidation loads ALL active rules and filters out `intercompany_loan` before applying — P&L only sees account_pair + account_category rules; intercompany_loan rules are exclusively consumed by buildConsolidatedBalanceSheet in plan 01a (checker revision #5)"
    - "Dragon fixture → engine output AFTER eliminations: Advertising consolidated = 0, Referral Fees consolidated = 0 (both rules net to zero post-elim)"
    - "Dragon Consolidation + IICT Consolidation + member rows + Dragon elimination rules seeded into DB via idempotent migration"
    - "Schema push runs successfully via npx supabase db push --linked (blocks on user auth confirmation if needed)"
  artifacts:
    - path: src/lib/consolidation/eliminations.ts
      provides: "applyEliminations, matchRuleToLines, loadEliminationRules"
      contains: "export function applyEliminations"
    - path: supabase/migrations/20260421d_seed_dragon_iict_groups.sql
      provides: "Dragon + IICT groups + members + Dragon elimination rules + is_cfo_client flags"
      contains: "ON CONFLICT DO NOTHING"
  key_links:
    - from: src/lib/consolidation/engine.ts
      to: src/lib/consolidation/eliminations.ts
      via: "loadEliminationRules + applyEliminations calls at the ELIMINATION PLUG-IN POINT"
      pattern: "applyEliminations\\("
    - from: src/lib/consolidation/engine.ts
      to: src/lib/consolidation/account-alignment.ts
      via: "elimsByKey lookup uses accountAlignmentKey to apply entries to the right consolidated row"
      pattern: "accountAlignmentKey"
    - from: supabase/migrations/20260421d_seed_dragon_iict_groups.sql
      to: businesses table
      via: "DO block with name ILIKE lookups + ON CONFLICT DO NOTHING"
      pattern: "name ILIKE"
---

<objective>
Complete Iteration 34.0 engine functionality + ship the seed data + push all schema to Supabase.

Three deliverables:
1. **Elimination engine** — implements the rule-matching and elimination-entry generation logic. Wires the `ELIMINATION PLUG-IN POINT` in engine.ts from plan 00b.
2. **Seed migration** — inserts Dragon Consolidation + IICT Consolidation groups + their members + Dragon's three elimination rules (advertising bidirectional ±$9,015; referral fees bidirectional $818; intercompany loan for 34.1 BS use). Flags both parent businesses as `is_cfo_client=true` so they appear in the CFO dashboard.
3. **[BLOCKING] Schema push** — runs `npx supabase db push --linked` to apply all four Iteration 34.0 migrations (from plan 00a) + the seed migration (from this plan) to the hosted Supabase. Human-verify checkpoint confirms the push before moving on.

This plan consolidates the end of Iteration 34.0's schema + engine work into a single coherent unit. By shipping eliminations + seed + push together we ensure:
- The seeded rules have an engine that can exercise them (integration confidence)
- One push event applies the whole set, not a flaky partial state
- The CHECKPOINT ensures Matt sees the DB state before plan 00e queries it

**Prerequisite:** plans 00a + 00b complete (fixtures, types, engine orchestration with plug-in points).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/34-dragon-multi-entity-consolidation/34-CONTEXT.md
@.planning/phases/34-dragon-multi-entity-consolidation/34-RESEARCH.md
@.planning/phases/34-dragon-multi-entity-consolidation/34-PATTERNS.md

@.planning/phases/34-dragon-multi-entity-consolidation/34-00a-SUMMARY.md
@.planning/phases/34-dragon-multi-entity-consolidation/34-00b-SUMMARY.md

@src/lib/consolidation/types.ts
@src/lib/consolidation/engine.ts
@src/lib/consolidation/__fixtures__/dragon-mar-2026.ts
@supabase/migrations/20260421_consolidation_groups.sql
@supabase/migrations/20260419_cashflow_schedules.sql

<interfaces>
<!-- From plan 00a — types.ts -->
```typescript
export interface EliminationRule {
  id: string
  group_id: string
  rule_type: 'account_pair' | 'account_category' | 'intercompany_loan'
  entity_a_business_id: string
  entity_a_account_code: string | null
  entity_a_account_name_pattern: string | null
  entity_b_business_id: string
  entity_b_account_code: string | null
  entity_b_account_name_pattern: string | null
  direction: 'bidirectional' | 'entity_a_eliminates' | 'entity_b_eliminates'
  description: string
  active: boolean
}

export interface EliminationEntry {
  rule_id: string
  rule_description: string
  account_type: string
  account_name: string
  amount: number             // negative — reduces consolidated total
  source_entity_id: string
  source_amount: number
}
```

<!-- From plan 00b — engine.ts exports -->
```typescript
export async function buildConsolidation(supabase, opts: BuildConsolidationOpts): Promise<ConsolidatedReport>
export function combineEntities(byEntity, universe, eliminations, fyMonths)
// ELIMINATION PLUG-IN POINT is currently: `const eliminations: EliminationEntry[] = []`
```

<!-- RESEARCH.md § Pattern 3 spec — lines 317-406 is the canonical shape -->

<!-- Seed migration analog — supabase/migrations/20260419_cashflow_schedules.sql:51-58 -->
```sql
INSERT INTO cashflow_schedules (...) VALUES (...) ON CONFLICT (business_id, name) DO NOTHING;
-- PATTERNS.md § seed migration shows the DO $$ ... RAISE NOTICE fallback pattern
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Elimination engine + rule loader + comprehensive tests</name>
  <files>src/lib/consolidation/eliminations.ts, src/lib/consolidation/eliminations.test.ts</files>
  <read_first>
    - src/lib/consolidation/types.ts (EliminationRule, EliminationEntry shapes)
    - src/lib/consolidation/__fixtures__/dragon-mar-2026.ts (dragonRoofingPL + easyHailPL — contain the ±$9,015 advertising + $818 referral fees)
    - .planning/phases/34-dragon-multi-entity-consolidation/34-RESEARCH.md § `### Pattern 3: Intercompany Elimination` (lines 312-407 — canonical algorithm)
    - .planning/phases/34-dragon-multi-entity-consolidation/34-PATTERNS.md § `src/lib/consolidation/eliminations.ts` (implementation pointer to RESEARCH.md)
    - .planning/phases/34-dragon-multi-entity-consolidation/34-RESEARCH.md § Pitfall 1 (double-counting intercompany transactions)
  </read_first>
  <behavior>
    - matchRuleToLines({entity_a_account_code:'420',entity_a_account_name_pattern:null}, 'a', lines) matches lines where account_code==='420'
    - matchRuleToLines({entity_a_account_code:null,entity_a_account_name_pattern:'Advertising'}, 'a', lines) matches lines where /Advertising/i.test(account_name)
    - matchRuleToLines with BOTH code and pattern returns the UNION (either matcher triggers a match)
    - applyEliminations for a bidirectional rule on Dragon's $9,015 advertising + EasyHail's $9,015 advertising (both sides) returns TWO EliminationEntry rows, each with amount = -(source_amount); net consolidated impact for that row = (-9015 + -9015 + 9015 + 9015)... wait: the engine sums entity-contribution THEN adds elimination amounts. So raw sum = Dragon -9015 + EasyHail +9015 = 0, then elimination entries add -(−9015) + -(+9015) = 9015 + -9015 = 0 again, net consolidated = 0. Both pre-elim sum AND post-elim match to zero — the BOOKKEEPING is correct because without eliminations we'd miss that a $9,015 real-world transfer occurred (Pitfall 1)
    - For referral fees: Dragon revenue $818 + EasyHail revenue $818 (different account_names → different universe rows). Each account's universe row sees: Dragon's revenue row pre-sum=818, elim=-818, post=0; EasyHail's revenue row pre-sum=818, elim=-818, post=0. Neither name appears on both sides so the rule MUST match each side by separate account_name patterns
    - direction='entity_a_eliminates' only emits entries for matches on entity A lines (skips entity B)
    - direction='entity_b_eliminates' only emits entries for matches on entity B lines (skips entity A)
    - direction='bidirectional' emits entries for both sides
    - Month filter: applyEliminations(rules, byEntity, '2026-03') produces entries whose `amount` reflects only the 2026-03 monthly_value, not the full-year sum
    - Missing business (rule references an entity_a_business_id not in byEntity) → rule silently skipped (no error, logged to diagnostics later)
    - Regex DoS guard: pattern longer than 256 chars throws (matches the DB CHECK constraint)
    - Invalid regex syntax throws a descriptive error with rule_id + pattern
  </behavior>
  <action>
Create `src/lib/consolidation/eliminations.ts`:

```typescript
/**
 * Intercompany Elimination Engine.
 *
 * Rules live in `consolidation_elimination_rules`. Types:
 *   - account_pair    — explicit account_code or regex against account_name_pattern
 *   - account_category — regex-based match across entities (e.g. "Advertising transfers")
 *   - intercompany_loan — used by Iteration 34.1 BS; same matching shape
 *
 * Direction semantics (per RESEARCH.md § Pattern 3):
 *   - bidirectional        — eliminate matches on BOTH entities
 *   - entity_a_eliminates  — eliminate matches on entity A only
 *   - entity_b_eliminates  — eliminate matches on entity B only
 *
 * Sign convention:
 *   Elimination amount is ALWAYS the negative of the source amount on each matched side,
 *   so (pre-elim consolidated) + (eliminations) = consolidated after eliminations.
 *   Example: Dragon advertising -9015 + EasyHail advertising +9015 = 0 raw sum;
 *   bidirectional elimination adds +9015 (cancels Dragon) and -9015 (cancels EasyHail);
 *   consolidated = 0. Elimination entries are shown in the diagnostic panel so the
 *   user can see the $9,015 transfer was detected and cancelled.
 */

import type {
  EliminationRule,
  EliminationEntry,
  EntityColumn,
  XeroPLLineLike,
} from './types'

const MAX_PATTERN_LENGTH = 256   // DB CHECK constraint mirrors this

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
    throw new Error(`[Eliminations] Failed to load rules for group ${groupId}: ${error.message}`)
  }
  return (data ?? []) as EliminationRule[]
}

export function matchRuleToLines(
  rule: EliminationRule,
  side: 'a' | 'b',
  lines: XeroPLLineLike[],
): XeroPLLineLike[] {
  const code = side === 'a' ? rule.entity_a_account_code : rule.entity_b_account_code
  const pattern = side === 'a' ? rule.entity_a_account_name_pattern : rule.entity_b_account_name_pattern

  if (!code && !pattern) {
    // DB CHECK enforces at least one matcher; defensive in TS
    return []
  }

  if (pattern && pattern.length > MAX_PATTERN_LENGTH) {
    throw new Error(`[Eliminations] Rule ${rule.id} pattern exceeds ${MAX_PATTERN_LENGTH} chars (DoS guard)`)
  }

  let re: RegExp | null = null
  if (pattern) {
    try {
      re = new RegExp(pattern, 'i')
    } catch (err) {
      throw new Error(`[Eliminations] Rule ${rule.id} has invalid regex "${pattern}": ${String(err)}`)
    }
  }

  return lines.filter(line => {
    if (code && line.account_code === code) return true
    if (re && re.test(line.account_name)) return true
    return false
  })
}

export function applyEliminations(
  rules: EliminationRule[],
  byEntity: EntityColumn[],
  reportMonth: string,
): EliminationEntry[] {
  const entries: EliminationEntry[] = []

  for (const rule of rules) {
    const entityA = byEntity.find(e => e.business_id === rule.entity_a_business_id)
    const entityB = byEntity.find(e => e.business_id === rule.entity_b_business_id)
    if (!entityA || !entityB) continue   // missing member — silently skip; diagnostics can log later

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
```

Create `src/lib/consolidation/eliminations.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { applyEliminations, matchRuleToLines } from './eliminations'
import type { EliminationRule, EntityColumn } from './types'
import {
  dragonRoofingPL,
  easyHailPL,
  DRAGON_ROOFING_BIZ,
  EASY_HAIL_BIZ,
} from './__fixtures__/dragon-mar-2026'

function makeEntity(businessId: string, lines: any): EntityColumn {
  return { member_id: `m-${businessId}`, business_id: businessId, display_name: businessId, display_order: 0, functional_currency: 'AUD', lines }
}

describe('matchRuleToLines', () => {
  it('matches by account_code exact', () => {
    const rule: EliminationRule = {
      id: 'r1', group_id: 'g1', rule_type: 'account_pair',
      entity_a_business_id: DRAGON_ROOFING_BIZ, entity_a_account_code: '420', entity_a_account_name_pattern: null,
      entity_b_business_id: EASY_HAIL_BIZ,      entity_b_account_code: '420', entity_b_account_name_pattern: null,
      direction: 'bidirectional', description: 'advertising', active: true,
    }
    const matched = matchRuleToLines(rule, 'a', dragonRoofingPL)
    expect(matched.some(l => l.account_name === 'Advertising & Marketing')).toBe(true)
  })

  it('matches by account_name_pattern case-insensitive', () => {
    const rule: EliminationRule = {
      id: 'r2', group_id: 'g1', rule_type: 'account_category',
      entity_a_business_id: DRAGON_ROOFING_BIZ, entity_a_account_code: null, entity_a_account_name_pattern: 'advertising',
      entity_b_business_id: EASY_HAIL_BIZ,      entity_b_account_code: null, entity_b_account_name_pattern: 'advertising',
      direction: 'bidirectional', description: 'advertising', active: true,
    }
    const matched = matchRuleToLines(rule, 'a', dragonRoofingPL)
    expect(matched.length).toBeGreaterThan(0)
  })

  it('throws on pattern > 256 chars (DoS guard)', () => {
    const rule: EliminationRule = {
      id: 'r3', group_id: 'g1', rule_type: 'account_pair',
      entity_a_business_id: DRAGON_ROOFING_BIZ, entity_a_account_code: null, entity_a_account_name_pattern: 'a'.repeat(300),
      entity_b_business_id: EASY_HAIL_BIZ,      entity_b_account_code: 'X',  entity_b_account_name_pattern: null,
      direction: 'bidirectional', description: 'bad', active: true,
    }
    expect(() => matchRuleToLines(rule, 'a', dragonRoofingPL)).toThrow(/DoS/)
  })

  it('throws on invalid regex pattern', () => {
    const rule: EliminationRule = {
      id: 'r4', group_id: 'g1', rule_type: 'account_pair',
      entity_a_business_id: DRAGON_ROOFING_BIZ, entity_a_account_code: null, entity_a_account_name_pattern: '[unclosed',
      entity_b_business_id: EASY_HAIL_BIZ,      entity_b_account_code: 'X',  entity_b_account_name_pattern: null,
      direction: 'bidirectional', description: 'bad', active: true,
    }
    expect(() => matchRuleToLines(rule, 'a', dragonRoofingPL)).toThrow(/invalid regex/)
  })
})

describe('applyEliminations — Dragon advertising bidirectional', () => {
  it('produces two entries (one per side) with amounts = -source_amount', () => {
    const entityA = makeEntity(DRAGON_ROOFING_BIZ, dragonRoofingPL)
    const entityB = makeEntity(EASY_HAIL_BIZ, easyHailPL)
    const rule: EliminationRule = {
      id: 'r-adv', group_id: 'g1', rule_type: 'account_category',
      entity_a_business_id: DRAGON_ROOFING_BIZ, entity_a_account_code: null, entity_a_account_name_pattern: 'advertising & marketing',
      entity_b_business_id: EASY_HAIL_BIZ,      entity_b_account_code: null, entity_b_account_name_pattern: 'advertising & marketing',
      direction: 'bidirectional', description: 'Dragon/EasyHail advertising transfer', active: true,
    }
    const entries = applyEliminations([rule], [entityA, entityB], '2026-03')
    expect(entries.length).toBe(2)
    const dragonEntry = entries.find(e => e.source_entity_id === DRAGON_ROOFING_BIZ)
    const easyHailEntry = entries.find(e => e.source_entity_id === EASY_HAIL_BIZ)
    expect(dragonEntry!.source_amount).toBe(-9015)
    expect(dragonEntry!.amount).toBe(9015)          // -(−9015)
    expect(easyHailEntry!.source_amount).toBe(9015)
    expect(easyHailEntry!.amount).toBe(-9015)       // -(+9015)
  })
})

describe('applyEliminations — direction variants', () => {
  const entityA = makeEntity(DRAGON_ROOFING_BIZ, dragonRoofingPL)
  const entityB = makeEntity(EASY_HAIL_BIZ, easyHailPL)
  const baseRule: Omit<EliminationRule, 'direction'> = {
    id: 'r', group_id: 'g1', rule_type: 'account_category',
    entity_a_business_id: DRAGON_ROOFING_BIZ, entity_a_account_code: null, entity_a_account_name_pattern: 'advertising',
    entity_b_business_id: EASY_HAIL_BIZ,      entity_b_account_code: null, entity_b_account_name_pattern: 'advertising',
    description: 'adv', active: true,
  }

  it('entity_a_eliminates emits only entity A entries', () => {
    const entries = applyEliminations([{ ...baseRule, direction: 'entity_a_eliminates' }], [entityA, entityB], '2026-03')
    expect(entries.every(e => e.source_entity_id === DRAGON_ROOFING_BIZ)).toBe(true)
  })

  it('entity_b_eliminates emits only entity B entries', () => {
    const entries = applyEliminations([{ ...baseRule, direction: 'entity_b_eliminates' }], [entityA, entityB], '2026-03')
    expect(entries.every(e => e.source_entity_id === EASY_HAIL_BIZ)).toBe(true)
  })
})

describe('applyEliminations — missing entity silently skipped', () => {
  it('rule referencing absent business_id produces zero entries', () => {
    const entityA = makeEntity(DRAGON_ROOFING_BIZ, dragonRoofingPL)
    const rule: EliminationRule = {
      id: 'r', group_id: 'g1', rule_type: 'account_pair',
      entity_a_business_id: DRAGON_ROOFING_BIZ, entity_a_account_code: '420', entity_a_account_name_pattern: null,
      entity_b_business_id: 'missing-biz-uuid', entity_b_account_code: '420', entity_b_account_name_pattern: null,
      direction: 'bidirectional', description: 'x', active: true,
    }
    const entries = applyEliminations([rule], [entityA], '2026-03')
    expect(entries.length).toBe(0)
  })
})

describe('applyEliminations — reportMonth scoping', () => {
  it('only sources values from the reportMonth', () => {
    const entityA = makeEntity(DRAGON_ROOFING_BIZ, [
      { business_id: DRAGON_ROOFING_BIZ, account_name: 'Advertising', account_code: null, account_type: 'opex', section: 'OpEx', monthly_values: { '2026-03': 100, '2026-04': 999 } },
    ])
    const entityB = makeEntity(EASY_HAIL_BIZ, [
      { business_id: EASY_HAIL_BIZ, account_name: 'Advertising', account_code: null, account_type: 'opex', section: 'OpEx', monthly_values: { '2026-03': -100, '2026-04': -999 } },
    ])
    const rule: EliminationRule = {
      id: 'r', group_id: 'g1', rule_type: 'account_category',
      entity_a_business_id: DRAGON_ROOFING_BIZ, entity_a_account_code: null, entity_a_account_name_pattern: 'advertising',
      entity_b_business_id: EASY_HAIL_BIZ,      entity_b_account_code: null, entity_b_account_name_pattern: 'advertising',
      direction: 'bidirectional', description: 'adv', active: true,
    }
    const entries = applyEliminations([rule], [entityA, entityB], '2026-03')
    expect(entries.every(e => Math.abs(e.source_amount) === 100)).toBe(true)   // only March sourced
  })
})
```
  </action>
  <verify>
    <automated>npx vitest run src/lib/consolidation/eliminations.test.ts --reporter=dot</automated>
  </verify>
  <acceptance_criteria>
    - `grep "export async function loadEliminationRules\|export function matchRuleToLines\|export function applyEliminations" src/lib/consolidation/eliminations.ts` returns 3 matches
    - `grep "MAX_PATTERN_LENGTH = 256\|256" src/lib/consolidation/eliminations.ts` returns match (DoS guard)
    - `grep "entity_a_eliminates\|entity_b_eliminates\|bidirectional" src/lib/consolidation/eliminations.ts` returns >=3 matches (all 3 directions handled)
    - `grep "amount: -src\|-source" src/lib/consolidation/eliminations.ts` returns >=1 match (sign convention)
    - `npx vitest run src/lib/consolidation/eliminations.test.ts` reports >=9 passing tests
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>Eliminations module complete with rule loader, pattern/code matcher, direction-aware apply. DoS guard + invalid-regex guard in place. All three direction variants tested, missing-entity skip tested, month-scoping tested.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Wire eliminations into engine + update engine tests with post-elimination expectations</name>
  <files>src/lib/consolidation/engine.ts, src/lib/consolidation/engine.test.ts</files>
  <read_first>
    - src/lib/consolidation/engine.ts (existing from plan 00b — ELIMINATION PLUG-IN POINT is `const eliminations: EliminationEntry[] = []`)
    - src/lib/consolidation/eliminations.ts (just written — loadEliminationRules + applyEliminations)
    - src/lib/consolidation/engine.test.ts (existing tests from plan 00b — tests assume empty eliminations)
    - src/lib/consolidation/__fixtures__/dragon-mar-2026.ts (dragonExpectedConsolidated — post-elimination expected values)
  </read_first>
  <behavior>
    - buildConsolidation with 2 members + 1 bidirectional advertising rule produces eliminations.length === 2 (one per side)
    - buildConsolidation output diagnostics.eliminations_applied_count === rules matched × sides per rule (based on direction)
    - buildConsolidation output diagnostics.eliminations_total_amount === sum of |entry.amount| across eliminations
    - combineEntities applies elimination entries: consolidated[account][reportMonth] = Σ entity-values + Σ elimination-amounts-for-that-account
    - combineEntities does NOT apply eliminations to months other than reportMonth (eliminations are month-scoped by applyEliminations)
    - Dragon fixture + advertising bidirectional rule: consolidated['opex::advertising & marketing']['2026-03'] should end at (-9015 + 9015) + (9015 + -9015) = 0 + 0 = 0
    - Referral fees rules (entity_a pattern='referral fee - easy hail', entity_b pattern='sales - referral fee', direction=bidirectional): Dragon's "Referral Fee - Easy Hail" revenue row consolidated ends at 818 + -818 = 0; EasyHail's "Sales - Referral Fee" revenue row consolidated ends at 818 + -818 = 0
  </behavior>
  <action>
**Modify `src/lib/consolidation/engine.ts`** to wire eliminations into buildConsolidation + combineEntities:

1. Import from `./eliminations`:
```typescript
import { loadEliminationRules, applyEliminations } from './eliminations'
```

2. Replace the ELIMINATION PLUG-IN POINT line `const eliminations: EliminationEntry[] = []` with (**checker revision #5 — filter out `intercompany_loan` rules from the P&L engine; those rules are BS-only and are consumed by `buildConsolidatedBalanceSheet` in plan 01a**):
```typescript
// 5. ELIMINATION APPLICATION
// Load ALL active rules for the group, then filter out BS-only rule types before applying
// to the P&L engine. `intercompany_loan` rules are consumed exclusively by the BS path
// in plan 01a (buildConsolidatedBalanceSheet). Mixing them here would incorrectly zero
// out P&L rows that share a name pattern with a loan account.
const allRules = await loadEliminationRules(supabase, opts.groupId)
const plRules = allRules.filter(r => r.rule_type !== 'intercompany_loan')
const eliminations = applyEliminations(plRules, byEntity, opts.reportMonth)
```

The 3-value CHECK enum on `rule_type` (from plan 00a migration) guarantees only `'account_pair' | 'account_category' | 'intercompany_loan'` are possible; the filter is therefore equivalent to `r.rule_type === 'account_pair' || r.rule_type === 'account_category'` but the negative filter is more future-proof if additional P&L-eligible types are added later.

3. Fix `combineEntities` — in plan 00b the elimination-apply was a no-op (`* 0`). Change that line to actually apply the elimination amounts but ONLY for `opts.reportMonth`. Signature needs updating to accept `reportMonth`:

```typescript
export function combineEntities(
  byEntity: EntityColumn[],
  universe: AlignedAccount[],
  eliminations: EliminationEntry[],
  fyMonths: readonly string[],
  reportMonth: string,
): ConsolidatedReport['consolidated'] {
  const elimsByKey = new Map<string, EliminationEntry[]>()
  for (const e of eliminations) {
    const key = accountAlignmentKey({ account_type: e.account_type, account_name: e.account_name })
    const arr = elimsByKey.get(key) ?? []
    arr.push(e)
    elimsByKey.set(key, arr)
  }

  const lines = universe.map(u => {
    const monthly: Record<string, number> = {}
    for (const m of fyMonths) {
      let sum = 0
      for (const col of byEntity) {
        const lineInEntity = col.lines.find(l =>
          accountAlignmentKey({ account_type: l.account_type, account_name: l.account_name }) === u.key
        )
        sum += lineInEntity?.monthly_values[m] ?? 0
      }
      // Eliminations are scoped to reportMonth (applyEliminations filters by month at source)
      if (m === reportMonth) {
        const elims = elimsByKey.get(u.key) ?? []
        sum += elims.reduce((acc, e) => acc + e.amount, 0)
      }
      monthly[m] = sum
    }
    return { account_type: u.account_type, account_name: u.account_name, monthly_values: monthly }
  })

  return { lines }
}
```

4. Update buildConsolidation to pass `opts.reportMonth` to combineEntities:
```typescript
const consolidated = combineEntities(byEntity, universe, eliminations, opts.fyMonths, opts.reportMonth)
```

5. Update `diagnostics` to reflect actual elimination count + total:
```typescript
diagnostics: {
  members_loaded: members.length,
  total_lines_processed: totalLines,
  eliminations_applied_count: eliminations.length,
  eliminations_total_amount: eliminations.reduce((acc, e) => acc + Math.abs(e.amount), 0),
  processing_ms: Date.now() - startedAt,
},
```

**Modify `src/lib/consolidation/engine.test.ts`** — update existing combineEntities tests (they currently call combineEntities(byEntity, universe, [], FY_MONTHS) with 4 args) and ADD new tests exercising elimination effects:

1. Update existing calls to pass `'2026-03'` as reportMonth (5th argument).
2. Existing tests with `eliminations=[]` must still pass (no behavioural change when elimination array is empty).
3. Add new tests:

```typescript
import { applyEliminations } from './eliminations'
import type { EliminationRule } from './types'

describe('combineEntities — with Dragon advertising elimination', () => {
  const advRule: EliminationRule = {
    id: 'r-adv', group_id: 'g1', rule_type: 'account_category',
    entity_a_business_id: DRAGON_ROOFING_BIZ, entity_a_account_code: null, entity_a_account_name_pattern: 'advertising & marketing',
    entity_b_business_id: EASY_HAIL_BIZ,      entity_b_account_code: null, entity_b_account_name_pattern: 'advertising & marketing',
    direction: 'bidirectional', description: 'Dragon/EasyHail advertising transfer', active: true,
  }

  it('applies bidirectional advertising elimination so consolidated nets to zero', () => {
    const { universe, byEntity } = buildFixtureColumns()
    const eliminations = applyEliminations([advRule], byEntity, '2026-03')
    const consolidated = combineEntities(byEntity, universe, eliminations, FY_MONTHS, '2026-03')
    const advRow = consolidated.lines.find(l => l.account_name === 'Advertising & Marketing')
    // Pre-sum: Dragon -9015 + EasyHail +9015 = 0
    // Eliminations: +9015 (negates Dragon) + -9015 (negates EasyHail) = 0
    // Consolidated: 0 + 0 = 0
    expect(advRow!.monthly_values['2026-03']).toBeCloseTo(0, 0)
  })

  it('elimination does NOT apply to non-report months', () => {
    const { universe, byEntity } = buildFixtureColumns()
    const eliminations = applyEliminations([advRule], byEntity, '2026-03')
    const consolidated = combineEntities(byEntity, universe, eliminations, FY_MONTHS, '2026-03')
    const advRow = consolidated.lines.find(l => l.account_name === 'Advertising & Marketing')
    // 2025-07 has no data → pure sum of zeros → still zero
    expect(advRow!.monthly_values['2025-07'] ?? 0).toBe(0)
  })
})

describe('buildConsolidation diagnostics reflect elimination work', () => {
  // (Integration-level — covered by the route test in plan 00e where supabase is mocked/live.
  //  This describe block is a placeholder to remind future planners that diagnostics should be unit-verified end-to-end.)
  it.skip('diagnostics.eliminations_applied_count matches applied rules × sides', () => {})
})
```

Keep this task focused — no API route work, no UI work, no migration work. Engine-only integration of eliminations.
  </action>
  <verify>
    <automated>npx vitest run src/lib/consolidation --reporter=dot && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `grep "loadEliminationRules\|applyEliminations" src/lib/consolidation/engine.ts` returns >=2 matches
    - **Checker revision #5 — P&L must filter out intercompany_loan:** `grep "rule_type !== 'intercompany_loan'\|plRules\|r\.rule_type !==" src/lib/consolidation/engine.ts` returns >=1 match
    - **Filter applied BEFORE applyEliminations call:** line order in engine.ts has `allRules = await loadEliminationRules(...)` then the filter then `applyEliminations(plRules, ...)`
    - `grep "reportMonth" src/lib/consolidation/engine.ts` returns >=3 matches (signature + calls + guard in combineEntities)
    - `grep "eliminations_applied_count: eliminations.length\|eliminations.reduce" src/lib/consolidation/engine.ts` returns >=2 matches (diagnostics populated)
    - `grep "\* 0" src/lib/consolidation/engine.ts` returns 0 matches (no-op placeholder from plan 00b removed)
    - `npx vitest run src/lib/consolidation --reporter=dot` — all tests green (new + existing)
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>buildConsolidation loads + filters (intercompany_loan excluded) + applies elimination rules; combineEntities applies elimination amounts to consolidated month. Diagnostics populated. Dragon bidirectional advertising elimination test green. intercompany_loan rules stay BS-only (checker revision #5).</done>
</task>

<task type="auto">
  <name>Task 3: Seed migration — Dragon + IICT groups + members + Dragon elimination rules + is_cfo_client flags</name>
  <files>supabase/migrations/20260421d_seed_dragon_iict_groups.sql</files>
  <read_first>
    - supabase/migrations/20260419_cashflow_schedules.sql (system seed analog — lines 51-58)
    - supabase/migrations/20260421_consolidation_groups.sql (from plan 00a — table shapes this seed populates)
    - .planning/phases/34-dragon-multi-entity-consolidation/34-PATTERNS.md § `supabase/migrations/20260421b_seed_dragon_iict_groups.sql` (DO block + RAISE NOTICE + ON CONFLICT DO NOTHING pattern)
    - .planning/phases/34-dragon-multi-entity-consolidation/34-CONTEXT.md § `## Specific Ideas` (exact Dragon elimination rules to seed)
  </read_first>
  <action>
Create `supabase/migrations/20260421d_seed_dragon_iict_groups.sql`:

```sql
-- ============================================================
-- Phase 34 Iteration 34.0 seed data
-- Creates Dragon Consolidation + IICT Consolidation groups,
-- their members, Dragon's three elimination rules, and flags both
-- parent businesses as is_cfo_client so they appear on /cfo.
--
-- Idempotent: ON CONFLICT DO NOTHING + DO blocks gated on business lookups.
-- Safe to re-run. If member businesses are missing (e.g. fresh dev DB),
-- RAISE NOTICE logs the skip; migration does NOT error.
-- ============================================================

DO $$
DECLARE
  -- Dragon group
  v_dragon_parent_biz      uuid;   -- "Dragon Consolidation" parent business (may = Dragon Roofing if no umbrella exists)
  v_dragon_roofing_biz     uuid;
  v_easy_hail_biz          uuid;
  v_dragon_group_id        uuid;

  -- IICT group
  v_iict_parent_biz        uuid;   -- "IICT Consolidation" parent
  v_iict_aust_biz          uuid;
  v_iict_hk_biz            uuid;
  v_iict_group_ptyltd_biz  uuid;
  v_iict_group_id          uuid;
BEGIN
  -- ==================== Dragon ====================
  -- Parent business for Dragon Consolidation. In Matt's setup this is the Dragon Roofing
  -- business itself (which doubles as the "umbrella"), OR a dedicated business row.
  -- We try a dedicated "Dragon Consolidation" first, fall back to Dragon Roofing.
  SELECT id INTO v_dragon_parent_biz FROM businesses WHERE name ILIKE '%Dragon Consolidation%' LIMIT 1;
  SELECT id INTO v_dragon_roofing_biz FROM businesses WHERE name ILIKE '%Dragon Roofing%' LIMIT 1;
  SELECT id INTO v_easy_hail_biz     FROM businesses WHERE name ILIKE '%Easy Hail%'     LIMIT 1;

  IF v_dragon_parent_biz IS NULL THEN
    v_dragon_parent_biz := v_dragon_roofing_biz;    -- fallback per PATTERNS.md seed pattern
  END IF;

  IF v_dragon_parent_biz IS NULL OR v_dragon_roofing_biz IS NULL OR v_easy_hail_biz IS NULL THEN
    RAISE NOTICE 'Dragon seed skipped — missing businesses (parent=%, roofing=%, easyhail=%)',
      v_dragon_parent_biz, v_dragon_roofing_biz, v_easy_hail_biz;
  ELSE
    -- Group
    INSERT INTO consolidation_groups (name, business_id, presentation_currency)
    VALUES ('Dragon Consolidation', v_dragon_parent_biz, 'AUD')
    ON CONFLICT (business_id) DO NOTHING;

    SELECT id INTO v_dragon_group_id FROM consolidation_groups WHERE business_id = v_dragon_parent_biz;

    -- Members
    INSERT INTO consolidation_group_members (group_id, source_business_id, display_name, display_order, functional_currency)
    VALUES
      (v_dragon_group_id, v_dragon_roofing_biz, 'Dragon Roofing Pty Ltd', 0, 'AUD'),
      (v_dragon_group_id, v_easy_hail_biz,     'Easy Hail Claim Pty Ltd', 1, 'AUD')
    ON CONFLICT (group_id, source_business_id) DO NOTHING;

    -- Elimination rule 1: Advertising transfer (bidirectional)
    INSERT INTO consolidation_elimination_rules (
      group_id, rule_type,
      entity_a_business_id, entity_a_account_code, entity_a_account_name_pattern,
      entity_b_business_id, entity_b_account_code, entity_b_account_name_pattern,
      direction, description, active
    )
    VALUES (
      v_dragon_group_id, 'account_category',
      v_dragon_roofing_biz, NULL, '^Advertising & Marketing$',
      v_easy_hail_biz,      NULL, '^Advertising & Marketing$',
      'bidirectional', 'Dragon/EasyHail advertising transfer (intercompany expense reallocation)', true
    )
    ON CONFLICT DO NOTHING;

    -- Elimination rule 2: Referral fees (bidirectional) — different account names per side
    INSERT INTO consolidation_elimination_rules (
      group_id, rule_type,
      entity_a_business_id, entity_a_account_code, entity_a_account_name_pattern,
      entity_b_business_id, entity_b_account_code, entity_b_account_name_pattern,
      direction, description, active
    )
    VALUES (
      v_dragon_group_id, 'account_pair',
      v_dragon_roofing_biz, NULL, '^Referral Fee - Easy Hail$',
      v_easy_hail_biz,      NULL, '^Sales - Referral Fee$',
      'bidirectional', 'Dragon-to-EasyHail referral fees', true
    )
    ON CONFLICT DO NOTHING;

    -- Elimination rule 3: Intercompany loan (BS use — Iteration 34.1 consumes this rule)
    INSERT INTO consolidation_elimination_rules (
      group_id, rule_type,
      entity_a_business_id, entity_a_account_code, entity_a_account_name_pattern,
      entity_b_business_id, entity_b_account_code, entity_b_account_name_pattern,
      direction, description, active
    )
    VALUES (
      v_dragon_group_id, 'intercompany_loan',
      v_dragon_roofing_biz, NULL, 'Loan Payable - Dragon Roofing',
      v_easy_hail_biz,      NULL, 'Loan Receivable - Dragon Roofing',
      'bidirectional', 'Dragon/EasyHail intercompany loan ($280k–$315k range)', true
    )
    ON CONFLICT DO NOTHING;

    -- CFO dashboard flag
    UPDATE businesses SET is_cfo_client = true WHERE id = v_dragon_parent_biz;

    RAISE NOTICE 'Dragon Consolidation seeded (group_id=%)', v_dragon_group_id;
  END IF;

  -- ==================== IICT ====================
  SELECT id INTO v_iict_parent_biz       FROM businesses WHERE name ILIKE '%IICT Consolidation%' LIMIT 1;
  SELECT id INTO v_iict_aust_biz         FROM businesses WHERE name ILIKE '%IICT%Aust%' LIMIT 1;
  SELECT id INTO v_iict_hk_biz           FROM businesses WHERE name ILIKE '%IICT Group Limited%' LIMIT 1;
  SELECT id INTO v_iict_group_ptyltd_biz FROM businesses WHERE name ILIKE '%IICT Group Pty Ltd%' LIMIT 1;

  IF v_iict_parent_biz IS NULL THEN
    v_iict_parent_biz := v_iict_aust_biz;  -- fallback
  END IF;

  IF v_iict_parent_biz IS NULL OR v_iict_aust_biz IS NULL OR v_iict_hk_biz IS NULL OR v_iict_group_ptyltd_biz IS NULL THEN
    RAISE NOTICE 'IICT seed skipped — missing businesses (parent=%, aust=%, hk=%, ptyltd=%)',
      v_iict_parent_biz, v_iict_aust_biz, v_iict_hk_biz, v_iict_group_ptyltd_biz;
  ELSE
    INSERT INTO consolidation_groups (name, business_id, presentation_currency)
    VALUES ('IICT Consolidation', v_iict_parent_biz, 'AUD')
    ON CONFLICT (business_id) DO NOTHING;

    SELECT id INTO v_iict_group_id FROM consolidation_groups WHERE business_id = v_iict_parent_biz;

    INSERT INTO consolidation_group_members (group_id, source_business_id, display_name, display_order, functional_currency)
    VALUES
      (v_iict_group_id, v_iict_aust_biz,         'IICT (Aust) Pty Ltd',     0, 'AUD'),
      (v_iict_group_id, v_iict_group_ptyltd_biz, 'IICT Group Pty Ltd',      1, 'AUD'),
      (v_iict_group_id, v_iict_hk_biz,           'IICT Group Limited (HK)', 2, 'HKD')  -- functional_currency HKD per CONTEXT.md
    ON CONFLICT (group_id, source_business_id) DO NOTHING;

    -- P&L eliminations for IICT at March 2026 appear minimal per CONTEXT.md.
    -- BS-level intercompany loan elimination can be seeded here too since the rule_type is supported:
    INSERT INTO consolidation_elimination_rules (
      group_id, rule_type,
      entity_a_business_id, entity_a_account_code, entity_a_account_name_pattern,
      entity_b_business_id, entity_b_account_code, entity_b_account_name_pattern,
      direction, description, active
    )
    VALUES (
      v_iict_group_id, 'intercompany_loan',
      v_iict_hk_biz,   NULL, 'Loan - IICT \(Aust\)',   -- matches "Loan - IICT (Aust) Pty Ltd"
      v_iict_aust_biz, NULL, 'Receivable - IICT Group Limited|Intercompany Receivable',
      'bidirectional', 'IICT HK/Aust intercompany loan ($51,385 per Mar 2026 PDF)', true
    )
    ON CONFLICT DO NOTHING;

    UPDATE businesses SET is_cfo_client = true WHERE id = v_iict_parent_biz;

    RAISE NOTICE 'IICT Consolidation seeded (group_id=%)', v_iict_group_id;
  END IF;
END $$;
```

Note the `CONFLICT DO NOTHING` on rules uses the implicit unique constraint — if no constraint matches, it's a no-op on re-run but the row may be duplicated. To keep it safer, we rely on the fact that running the migration once creates the rules, and operators should only re-run if businesses changed. This matches cashflow_schedules.sql's pragma.

**Do NOT** add a UNIQUE constraint in this seed — that's a schema change and belongs in a separate migration if needed later. PATTERNS.md's analog uses `ON CONFLICT DO NOTHING` as a defensive default.

Edge case: if multiple businesses have names matching the ILIKE patterns, `LIMIT 1` picks one deterministically. Operators should rename conflicting businesses before re-running.
  </action>
  <verify>
    <automated>test -f supabase/migrations/20260421d_seed_dragon_iict_groups.sql && npx supabase db lint --linked 2>&1 | tee /tmp/phase34-00d-task3.log; grep -E "error|Error" /tmp/phase34-00d-task3.log && exit 1 || true</automated>
  </verify>
  <acceptance_criteria>
    - File exists
    - `grep -c "DO \$\$" supabase/migrations/20260421d_seed_dragon_iict_groups.sql` returns 1 (single DO block wrapping everything)
    - `grep "RAISE NOTICE" supabase/migrations/20260421d_seed_dragon_iict_groups.sql` returns >=2 matches (Dragon + IICT skip paths)
    - `grep "ON CONFLICT" supabase/migrations/20260421d_seed_dragon_iict_groups.sql` returns >=6 matches (group + members + rules per group × 2 groups)
    - `grep "'Dragon Consolidation'\|'IICT Consolidation'" supabase/migrations/20260421d_seed_dragon_iict_groups.sql` returns matches
    - `grep "functional_currency.*'HKD'\|'HKD'" supabase/migrations/20260421d_seed_dragon_iict_groups.sql` returns 1 match (IICT Group Limited only)
    - `grep "'NZD'" supabase/migrations/20260421d_seed_dragon_iict_groups.sql` returns 0 matches (no stale NZD)
    - `grep "Advertising & Marketing" supabase/migrations/20260421d_seed_dragon_iict_groups.sql` returns >=2 matches (entity_a + entity_b patterns)
    - `grep "Referral Fee\|Sales - Referral Fee" supabase/migrations/20260421d_seed_dragon_iict_groups.sql` returns >=2 matches
    - `grep "intercompany_loan" supabase/migrations/20260421d_seed_dragon_iict_groups.sql` returns >=2 matches (Dragon + IICT BS rules)
    - `grep "is_cfo_client = true" supabase/migrations/20260421d_seed_dragon_iict_groups.sql` returns 2 matches (Dragon + IICT)
    - `npx supabase db lint --linked` exits 0
  </acceptance_criteria>
  <done>Seed migration staged. Idempotent via DO block + ON CONFLICT DO NOTHING. Covers Dragon (3 rules: adv + referral + loan) + IICT (1 BS loan rule) + is_cfo_client flags. HKD set on IICT HK member only.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: [BLOCKING] Push all Iteration 34.0 migrations to Supabase + verify DB state</name>
  <what-built>
All Iteration 34.0 schema + seed migrations staged locally:
- `20260421_consolidation_groups.sql` (plan 00a) — 3 tables + RLS
- `20260421b_fx_rates.sql` (plan 00a) — fx_rates table + RLS
- `20260421c_cfo_snapshot_column.sql` (plan 00a) — cfo_report_status snapshot columns
- `20260421d_seed_dragon_iict_groups.sql` (this plan) — Dragon + IICT groups + members + Dragon rules + is_cfo_client flags

Engine + elimination + FX modules are complete and unit-tested against fixtures.
  </what-built>
  <how-to-verify>
Execute the push and verify the DB state in three steps.

**1. Push the migrations:**
```bash
npx supabase db push --linked
```

Expected output ends with `Finished supabase db push.` with no error lines.
If `supabase login` is required, the command halts — re-run after authentication.

**2. Verify the schema landed — run each query (via `npx supabase db remote sql` or a SQL console):**
```sql
-- Must return 4 tables
SELECT table_name FROM information_schema.tables
  WHERE table_schema='public'
  AND table_name IN ('consolidation_groups','consolidation_group_members','consolidation_elimination_rules','fx_rates')
  ORDER BY table_name;

-- Must return snapshot_data + snapshot_taken_at columns
SELECT column_name FROM information_schema.columns
  WHERE table_schema='public' AND table_name='cfo_report_status'
  AND column_name IN ('snapshot_data','snapshot_taken_at');

-- Must return 2 groups (Dragon Consolidation, IICT Consolidation) — or 0 if businesses missing + NOTICE was raised
SELECT name, presentation_currency FROM consolidation_groups ORDER BY name;

-- Must return 5 members total (2 Dragon + 3 IICT) — or subset based on which businesses exist
SELECT g.name, m.display_name, m.functional_currency, m.display_order
  FROM consolidation_group_members m
  JOIN consolidation_groups g ON g.id = m.group_id
  ORDER BY g.name, m.display_order;

-- Must return 3+ rules on Dragon; 1+ rule on IICT (depending on which businesses were present at migration time)
SELECT g.name, r.description, r.rule_type, r.direction
  FROM consolidation_elimination_rules r
  JOIN consolidation_groups g ON g.id = r.group_id
  ORDER BY g.name, r.description;

-- Must return 2 rows with is_cfo_client=true (or fewer if businesses didn't match seed NAME patterns)
SELECT name, is_cfo_client FROM businesses
  WHERE id IN (SELECT business_id FROM consolidation_groups);
```

**3. Confirm the expected state:**
- Schema: 4 tables + 2 columns present.
- Seed: At minimum one group + its members present. If `RAISE NOTICE` messages appeared for missing businesses (shown in `db push` output), that is expected in fresh dev DBs and acceptable — Matt can insert the missing business rows manually before plan 00e's API test runs.
- `is_cfo_client=true` on Dragon and/or IICT parent businesses (depending on which existed).

Type `approved` if the push succeeded and the seed data is present (or the NOTICE messages clearly document which businesses are missing). Type `issues: <description>` if something blocked or a migration failed.
  </how-to-verify>
  <action>See how-to-verify below — this is a human-verified checkpoint. The executor MUST not perform implementation work in this task; it gates wave progression until the verifier types `approved`.</action>
  <verify>
    <automated>echo "Checkpoint requires human approval — no automated verification possible"</automated>
  </verify>
  <done>Checkpoint approved by human verifier (resume-signal received matching `approved`).</done>
  <resume-signal>approved — or — issues: &lt;describe&gt;</resume-signal>
</task>

</tasks>

<verification>
  <commands>
    - `npx vitest run src/lib/consolidation --reporter=dot` — all tests green (alignment, engine, fx, eliminations)
    - `npx tsc --noEmit` — clean
    - Post-push DB verification queries return expected rows (human-verified at checkpoint)
  </commands>
</verification>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Client coach session → API route | User's auth.getUser() validated; role-gated by assigned_coach_id |
| API route → DB (service role) | Service key has bypass; API MUST verify access before calling engine |
| DB → engine (via loader) | RLS on 4 new tables enforces coach + super_admin only |
| Elimination rule regex → engine | Untrusted user input (coach-created pattern) executed server-side |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-34-01 | Information Disclosure | consolidation_groups / members / rules tables | mitigate | RLS trifecta (coach/super_admin/service_role) on every new table — coach cannot query groups for businesses they are not assigned to (plan 00a migration) |
| T-34-02 | Denial of Service | eliminations.ts regex match | mitigate | matchRuleToLines throws on patterns > 256 chars (also enforced by DB CHECK constraint) + throws on invalid regex syntax with rule_id context (implemented in task 1 of this plan) |
| T-34-03 | Tampering | Seed migration with ILIKE name match | accept | `LIMIT 1` + `ON CONFLICT DO NOTHING` prevents duplicate creation. If businesses have conflicting names operators rename before re-run. Low risk because coach-authored businesses are self-managed. |
| T-34-04 | Information Disclosure | fx_rates table (reference data) | mitigate | RLS trifecta enforced: `fx_rates_coach_all`, `fx_rates_super_admin_all`, `fx_rates_service_role` (plan 00a migration, per checker revision #1). Every Phase 34 read path uses the service-role client so legitimate queries bypass RLS; coaches can read/write directly via the admin UI with no privilege escalation. No `authenticated_read` policy — rejected to minimize surface area. |
</threat_model>

<success_criteria>
- Elimination engine + tests green (rule load, match, apply, all directions, DoS guard, missing-entity skip, month-scoped)
- Engine wires eliminations and applies them in combineEntities at reportMonth only
- Seed migration staged and lints clean
- Schema push ran successfully; Dragon + IICT groups + rules visible in DB (or NOTICE explains missing businesses)
- Unit test count: ≥20 across src/lib/consolidation/ after this plan
</success_criteria>

<output>
After completion, create `.planning/phases/34-dragon-multi-entity-consolidation/34-00d-SUMMARY.md` summarising:
- Elimination rules seeded (Dragon: 3, IICT: 1 — or actuals per NOTICE output)
- Whether Dragon + IICT businesses existed in DB at push time (affects integration test in plan 00e)
- Engine + elimination test counts
- DB state confirmed at checkpoint (or the issues encountered)
</output>
