---
phase: 34
plan: 00b
type: execute
wave: 2
depends_on: ['34-00a']
files_modified:
  - src/lib/consolidation/account-alignment.ts
  - src/lib/consolidation/account-alignment.test.ts
  - src/lib/consolidation/engine.ts
  - src/lib/consolidation/engine.test.ts
autonomous: true
requirements: [MLTE-02, MLTE-03]

must_haves:
  truths:
    - "Account alignment key combines account_type + normalized account_name — same name across different types stays separate"
    - "Accounts present in one member but absent in others produce $0 filler entries so every row renders in every entity column"
    - "buildConsolidation() queries xero_pl_lines for all members in parallel via resolveBusinessIds — it never queries by raw ID"
    - "Dragon Mar 2026 fixture → engine output matches dragonExpectedConsolidated values to the dollar (pre-FX, pre-eliminations path — just alignment + aggregation)"
    - "Engine is pure: all Supabase I/O isolated into a single loader function, everything else (alignment, combine) is deterministic from inputs"
  artifacts:
    - path: src/lib/consolidation/account-alignment.ts
      provides: "buildAlignedAccountUniverse, buildEntityColumn, accountAlignmentKey"
      contains: "export function accountAlignmentKey"
    - path: src/lib/consolidation/engine.ts
      provides: "buildConsolidation, loadMemberSnapshots, combineEntities (exported for tests)"
      contains: "export async function buildConsolidation"
    - path: src/lib/consolidation/engine.test.ts
      provides: "alignment + combine behavioural tests using Dragon fixture"
      contains: "Dragon March 2026"
  key_links:
    - from: src/lib/consolidation/engine.ts
      to: src/lib/utils/resolve-business-ids
      via: "resolveBusinessIds called per member before xero_pl_lines query"
      pattern: "resolveBusinessIds\\("
    - from: src/lib/consolidation/engine.ts
      to: src/lib/consolidation/types
      via: "ConsolidationGroup, ConsolidationMember, EntityColumn, ConsolidatedReport imports"
      pattern: "from './types'"
    - from: src/lib/consolidation/account-alignment.ts
      to: src/lib/consolidation/types
      via: "XeroPLLineLike + EntityColumn imports"
      pattern: "from './types'"
---

<objective>
Implement the core consolidation engine — the pure, deterministic part of Iteration 34.0 that does not need FX or eliminations.

This plan delivers:
1. **Account alignment** — the universe builder that takes N members' P&L lines and produces a single sorted account list keyed by `account_type::account_name_normalized`, with $0 fillers for absent-in-member accounts (MLTE-03).
2. **Engine orchestration** — `buildConsolidation(supabase, groupId, reportMonth, fiscalYear)` that loads the group + members, parallel-fetches each member's `xero_pl_lines` via `resolveBusinessIds`, deduplicates, hands off to the alignment + combine pipeline, and returns a `ConsolidatedReport` with empty `eliminations` and `fx_context` blocks (those slots are populated by plans 00c + 00d).
3. **Fixture-backed tests** — assert alignment and combine math against Dragon Mar 2026 fixture values. Since this plan does NOT include FX or eliminations, the tests exercise the Dragon path (all-AUD, rules absent) and verify the plumbing — elimination + FX tests land in their respective plans.

Purpose: isolate the deterministic aggregation math from FX and eliminations so bugs surface in exactly one layer. Downstream plans (00c FX, 00d eliminations) plug into clearly-defined hooks rather than tangling everything in one module.

Output: two `.ts` source files + two `.test.ts` files; tests green; TypeScript clean; no new migrations (foundation came in 00a); no API routes (those come in 00e).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/34-dragon-multi-entity-consolidation/34-CONTEXT.md
@.planning/phases/34-dragon-multi-entity-consolidation/34-RESEARCH.md
@.planning/phases/34-dragon-multi-entity-consolidation/34-PATTERNS.md

@src/lib/cashflow/engine.ts
@src/lib/cashflow/engine.test.ts
@src/lib/utils/resolve-business-ids.ts
@.planning/phases/34-dragon-multi-entity-consolidation/34-00a-SUMMARY.md

<interfaces>
<!-- From plan 00a — types.ts exports everything this module imports -->
```typescript
import type {
  ConsolidationGroup,
  ConsolidationMember,
  XeroPLLineLike,
  EntityColumn,
  ConsolidatedReport,
} from './types'
```

<!-- Dual-ID resolver signature (verified from src/lib/utils/resolve-business-ids.ts) -->
```typescript
interface ResolvedIds { bizId: string; profileId: string; all: string[] }
export async function resolveBusinessIds(
  supabase: { from: (table: string) => any },
  businessId: string,
): Promise<ResolvedIds>
```

<!-- xero_pl_lines table shape — consumed pattern from generate/route.ts:244-265 -->
<!-- Dedup: merge monthly_values by account_name across duplicate rows, which occur due to xero-sync race conditions -->

<!-- Fixture exports available from plan 00a -->
```typescript
// src/lib/consolidation/__fixtures__/dragon-mar-2026.ts
export const FY_MONTHS: readonly string[]
export function evenSpread(months, amount): Record<string, number>
export const DRAGON_ROOFING_BIZ: string
export const EASY_HAIL_BIZ: string
export const dragonRoofingPL: XeroPLLineLike[]
export const easyHailPL: XeroPLLineLike[]
export const dragonExpectedConsolidated: { '2026-03': Record<string, number> }  // keyed by 'type::name_normalized'
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Account alignment module — builds the unified account universe across members</name>
  <files>src/lib/consolidation/account-alignment.ts, src/lib/consolidation/account-alignment.test.ts</files>
  <read_first>
    - src/lib/consolidation/types.ts (from plan 00a — XeroPLLineLike, EntityColumn interfaces)
    - src/lib/consolidation/__fixtures__/dragon-mar-2026.ts (alignment test input)
    - .planning/phases/34-dragon-multi-entity-consolidation/34-RESEARCH.md § `## Common Pitfalls` → Pitfall 4 (alignment key spec — exactly `${account_type}::${account_name.toLowerCase().trim()}`)
    - .planning/phases/34-dragon-multi-entity-consolidation/34-PATTERNS.md § engine section lines 220-235 (deduplication pattern)
  </read_first>
  <behavior>
    - accountAlignmentKey({ account_type: 'Revenue', account_name: '  Sales - Deposit  ' }) returns 'revenue::sales - deposit'  (lowercase + trim)
    - accountAlignmentKey({ account_type: 'opex', account_name: 'Bank Fees' }) !== accountAlignmentKey({ account_type: 'other_expense', account_name: 'Bank Fees' })  (type disambiguates same names — Pitfall 4)
    - buildAlignedAccountUniverse([dragonRoofingPL, easyHailPL]) returns an array where the `Advertising & Marketing` opex row appears exactly once (merged — same key from both members) and `Sales - Deposit` appears exactly once (only in Easy Hail — filler entry for Dragon)
    - buildEntityColumn(member, rawLines, universe, FY_MONTHS) returns an EntityColumn where `lines.length === universe.length` (every universe entry has a row, even absent-in-member ones) and absent-in-member rows have all monthly_values set to 0
    - deduplicateMemberLines([lineA {monthly_values:{...'2026-03': 100}}, lineA_dupe {monthly_values:{...'2026-03': 50}}]) merges by account_name — for duplicate account_name entries, monthly_values are SUMMED (matches generate/route.ts:254-265 behavior)
  </behavior>
  <action>
Create `src/lib/consolidation/account-alignment.ts`:

```typescript
import type { XeroPLLineLike, ConsolidationMember, EntityColumn } from './types'

/**
 * Alignment key — combines account_type and normalized account_name.
 * MUST be lowercase + trimmed name + lowercase type + '::' separator.
 * Prevents Pitfall 4: same account_name under different account_type in different members
 * (e.g. "Bank Fees" as opex vs other_expense) stays separate.
 */
export function accountAlignmentKey(line: { account_type: string; account_name: string }): string {
  return `${line.account_type.toLowerCase().trim()}::${line.account_name.toLowerCase().trim()}`
}

/**
 * Xero sync can produce duplicate rows in xero_pl_lines for the same (business_id, account_name).
 * Mirror generate/route.ts:254-265: merge by account_name within a member, summing monthly_values.
 */
export function deduplicateMemberLines(lines: XeroPLLineLike[]): XeroPLLineLike[] {
  const byName = new Map<string, XeroPLLineLike>()
  for (const line of lines) {
    const key = line.account_name
    const existing = byName.get(key)
    if (!existing) {
      byName.set(key, { ...line, monthly_values: { ...line.monthly_values } })
      continue
    }
    // Merge monthly_values — sum overlapping months
    for (const [month, value] of Object.entries(line.monthly_values)) {
      existing.monthly_values[month] = (existing.monthly_values[month] ?? 0) + value
    }
    // If existing is missing account_code but dupe has it, take it
    if (!existing.account_code && line.account_code) existing.account_code = line.account_code
    if (!existing.section && line.section) existing.section = line.section
  }
  return Array.from(byName.values())
}

export interface AlignedAccount {
  key: string                  // 'revenue::sales - deposit'
  account_type: string
  account_name: string         // display name from first member that had this account
  section: string              // display section from first member that had this account
}

/**
 * Builds a deduplicated, sorted universe of accounts across all members' deduped lines.
 * Sort order: account_type (revenue, cogs, opex, other_income, other_expense) → account_name alpha.
 */
export function buildAlignedAccountUniverse(memberDedupedLines: XeroPLLineLike[][]): AlignedAccount[] {
  const universe = new Map<string, AlignedAccount>()
  for (const memberLines of memberDedupedLines) {
    for (const line of memberLines) {
      const key = accountAlignmentKey(line)
      if (!universe.has(key)) {
        universe.set(key, {
          key,
          account_type: line.account_type,
          account_name: line.account_name,
          section: line.section ?? '',
        })
      }
    }
  }
  const typeOrder: Record<string, number> = {
    revenue: 0, cogs: 1, opex: 2, other_income: 3, other_expense: 4,
  }
  return Array.from(universe.values()).sort((a, b) => {
    const ta = typeOrder[a.account_type.toLowerCase()] ?? 99
    const tb = typeOrder[b.account_type.toLowerCase()] ?? 99
    if (ta !== tb) return ta - tb
    return a.account_name.localeCompare(b.account_name)
  })
}

/**
 * Build per-entity column from a member's deduped lines + the unified universe.
 * Every universe row MUST appear in the column. Absent-in-member rows get all-zero monthly_values.
 */
export function buildEntityColumn(
  member: ConsolidationMember,
  memberDedupedLines: XeroPLLineLike[],
  universe: AlignedAccount[],
  fyMonths: readonly string[],
): EntityColumn {
  const byKey = new Map<string, XeroPLLineLike>()
  for (const line of memberDedupedLines) {
    byKey.set(accountAlignmentKey(line), line)
  }
  const zeroMonths = (): Record<string, number> => {
    const z: Record<string, number> = {}
    for (const m of fyMonths) z[m] = 0
    return z
  }
  const lines = universe.map(u => {
    const existing = byKey.get(u.key)
    if (existing) {
      return existing
    }
    // Filler — absent in this member
    return {
      business_id: member.source_business_id,
      account_name: u.account_name,
      account_code: null,
      account_type: u.account_type,
      section: u.section,
      monthly_values: zeroMonths(),
    } satisfies XeroPLLineLike
  })
  return {
    member_id: member.id,
    business_id: member.source_business_id,
    display_name: member.display_name,
    display_order: member.display_order,
    functional_currency: member.functional_currency,
    lines,
  }
}
```

Create `src/lib/consolidation/account-alignment.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  accountAlignmentKey,
  deduplicateMemberLines,
  buildAlignedAccountUniverse,
  buildEntityColumn,
} from './account-alignment'
import type { XeroPLLineLike, ConsolidationMember } from './types'
import {
  FY_MONTHS,
  dragonRoofingPL,
  easyHailPL,
  DRAGON_ROOFING_BIZ,
  EASY_HAIL_BIZ,
} from './__fixtures__/dragon-mar-2026'

describe('accountAlignmentKey', () => {
  it('normalizes type + name (lowercase + trim)', () => {
    expect(accountAlignmentKey({ account_type: 'Revenue', account_name: '  Sales - Deposit  ' }))
      .toBe('revenue::sales - deposit')
  })
  it('same name under different type yields different keys (Pitfall 4)', () => {
    const a = accountAlignmentKey({ account_type: 'opex', account_name: 'Bank Fees' })
    const b = accountAlignmentKey({ account_type: 'other_expense', account_name: 'Bank Fees' })
    expect(a).not.toBe(b)
  })
})

describe('deduplicateMemberLines', () => {
  it('sums monthly_values of duplicate account_name rows', () => {
    const input: XeroPLLineLike[] = [
      { business_id: 'x', account_name: 'Sales', account_type: 'revenue', section: 'Revenue', monthly_values: { '2026-03': 100, '2026-04': 50 } },
      { business_id: 'x', account_name: 'Sales', account_type: 'revenue', section: 'Revenue', monthly_values: { '2026-03': 200, '2026-05': 30 } },
    ]
    const result = deduplicateMemberLines(input)
    expect(result.length).toBe(1)
    expect(result[0].monthly_values).toEqual({ '2026-03': 300, '2026-04': 50, '2026-05': 30 })
  })
})

describe('buildAlignedAccountUniverse — Dragon fixture', () => {
  it('produces a single universe covering accounts from both members', () => {
    const universe = buildAlignedAccountUniverse([dragonRoofingPL, easyHailPL])
    // At minimum the elimination-pivot accounts must appear
    const names = universe.map(u => u.account_name)
    expect(names).toContain('Advertising & Marketing')           // shared between members
    expect(names).toContain('Sales - Deposit')                   // Easy Hail only
    expect(names).toContain('Referral Fee - Easy Hail')          // Dragon only
    expect(names).toContain('Sales - Referral Fee')              // Easy Hail only
  })
  it('sorts revenue accounts before opex', () => {
    const universe = buildAlignedAccountUniverse([dragonRoofingPL, easyHailPL])
    const revIdx = universe.findIndex(u => u.account_type === 'revenue')
    const opexIdx = universe.findIndex(u => u.account_type === 'opex')
    expect(revIdx).toBeLessThan(opexIdx)
  })
})

describe('buildEntityColumn — fills absent accounts with $0', () => {
  it('Dragon entity column covers every universe row including Easy-Hail-only accounts', () => {
    const universe = buildAlignedAccountUniverse([dragonRoofingPL, easyHailPL])
    const dragonMember: ConsolidationMember = {
      id: 'm-dragon', group_id: 'g1', source_business_id: DRAGON_ROOFING_BIZ,
      display_name: 'Dragon Roofing Pty Ltd', display_order: 0, functional_currency: 'AUD',
    }
    const col = buildEntityColumn(dragonMember, dragonRoofingPL, universe, FY_MONTHS)
    expect(col.lines.length).toBe(universe.length)
    const depositRow = col.lines.find(l => l.account_name === 'Sales - Deposit')
    expect(depositRow).toBeDefined()
    expect(depositRow!.monthly_values['2026-03']).toBe(0)  // absent in Dragon → $0 filler
  })
})
```
  </action>
  <verify>
    <automated>npx vitest run src/lib/consolidation/account-alignment.test.ts --reporter=dot</automated>
  </verify>
  <acceptance_criteria>
    - `grep "export function accountAlignmentKey\|export function deduplicateMemberLines\|export function buildAlignedAccountUniverse\|export function buildEntityColumn" src/lib/consolidation/account-alignment.ts` returns 4 matches
    - `grep "toLowerCase().trim()" src/lib/consolidation/account-alignment.ts` returns >=1 match (Pitfall 4 normalization)
    - Tests cover all 5 behaviours in `<behavior>` block
    - `npx vitest run src/lib/consolidation/account-alignment.test.ts` reports >=5 passing tests
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>Alignment module complete with universe builder, dedup, and entity-column filler. Dragon fixture exercises all three edge cases (merged account, Dragon-only, Easy-Hail-only). Key is type::name-lowercase — Pitfall 4 test green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Engine orchestration — buildConsolidation with parallel member fetch + combine</name>
  <files>src/lib/consolidation/engine.ts, src/lib/consolidation/engine.test.ts</files>
  <read_first>
    - src/lib/consolidation/account-alignment.ts (just written in task 1)
    - src/lib/consolidation/types.ts
    - src/lib/consolidation/__fixtures__/dragon-mar-2026.ts
    - src/lib/utils/resolve-business-ids.ts (cache + dual-ID signature)
    - src/app/api/monthly-report/generate/route.ts (lines 150-270 — the service-role query + dedup pattern to mirror)
    - .planning/phases/34-dragon-multi-entity-consolidation/34-PATTERNS.md § `src/lib/consolidation/engine.ts`
    - .planning/phases/34-dragon-multi-entity-consolidation/34-RESEARCH.md § `### Pattern 1: Per-Member Parallel Fetch + Alignment` (lines 192-274)
  </read_first>
  <behavior>
    - buildConsolidation() calls resolveBusinessIds once per member — NEVER queries xero_pl_lines by raw source_business_id
    - Parallel fetch via Promise.all — a 3-member group (IICT) fires 3 queries concurrently, not serially
    - combineEntities([entityA, entityB]) with eliminations=[] produces consolidated.lines where each row's monthly_values = sum of entity contributions; row ordering matches universe
    - Returns a ConsolidatedReport with fx_context.missing_rates=[] (FX fills this in plan 00c) and eliminations=[] (plan 00d fills this)
    - Engine tolerates a member returning zero xero_pl_lines (empty member = all-zero entity column in universe)
    - Dragon-with-no-eliminations path: Engine output for 2026-03 matches fixture-computed expected values where:
        Advertising & Marketing consolidated = -9015 + 9015 = 0  (pre-elimination sum)
        Sales - Deposit consolidated = 0 + 11652 = 11652
        Referral Fee - Easy Hail consolidated = 818 + 0 = 818  (pre-elimination sum)
  </behavior>
  <action>
Create `src/lib/consolidation/engine.ts`:

```typescript
/**
 * Multi-Entity Consolidation Engine (P&L)
 *
 * Takes a consolidation group + member list, fetches each member's xero_pl_lines in parallel,
 * aligns accounts across entities, and produces a per-entity column structure + a combined column.
 *
 * This module is PURE orchestration — FX translation (fx.ts) and elimination rules (eliminations.ts)
 * are plugged in by the caller. The engine's output has slots for both but does not compute them.
 *
 * Auditing: every query uses resolveBusinessIds. No raw-id queries against xero_pl_lines.
 */

import { resolveBusinessIds } from '@/lib/utils/resolve-business-ids'
import type {
  ConsolidationGroup,
  ConsolidationMember,
  XeroPLLineLike,
  EntityColumn,
  EliminationEntry,
  ConsolidatedReport,
} from './types'
import {
  buildAlignedAccountUniverse,
  buildEntityColumn,
  deduplicateMemberLines,
  accountAlignmentKey,
  type AlignedAccount,
} from './account-alignment'

interface LoadedGroup {
  group: ConsolidationGroup
  members: ConsolidationMember[]
}

interface MemberSnapshot {
  member: ConsolidationMember
  rawLines: XeroPLLineLike[]
}

export interface BuildConsolidationOpts {
  groupId: string
  reportMonth: string       // 'YYYY-MM'
  fiscalYear: number
  fyMonths: readonly string[]   // 12 'YYYY-MM' keys, driven by business fiscal year
}

/**
 * Load group + members from consolidation_groups + consolidation_group_members.
 */
export async function loadGroup(
  supabase: any,
  groupId: string,
): Promise<LoadedGroup> {
  const { data: group, error: gErr } = await supabase
    .from('consolidation_groups')
    .select('*')
    .eq('id', groupId)
    .single()
  if (gErr || !group) throw new Error(`[Consolidation Engine] Group ${groupId} not found: ${gErr?.message ?? ''}`)

  const { data: members, error: mErr } = await supabase
    .from('consolidation_group_members')
    .select('*')
    .eq('group_id', groupId)
    .order('display_order', { ascending: true })
  if (mErr) throw new Error(`[Consolidation Engine] Failed to load members: ${mErr.message}`)

  return { group, members: members ?? [] }
}

/**
 * Per-member parallel fetch. Calls resolveBusinessIds once per member (mandatory).
 */
export async function loadMemberSnapshots(
  supabase: any,
  members: ConsolidationMember[],
): Promise<MemberSnapshot[]> {
  return Promise.all(members.map(async (member) => {
    const ids = await resolveBusinessIds(supabase, member.source_business_id)
    const { data: lines, error } = await supabase
      .from('xero_pl_lines')
      .select('business_id, account_name, account_code, account_type, section, monthly_values')
      .in('business_id', ids.all)
    if (error) throw new Error(`[Consolidation Engine] Failed to load xero_pl_lines for member ${member.display_name}: ${error.message}`)
    return { member, rawLines: (lines ?? []) as XeroPLLineLike[] }
  }))
}

/**
 * Combine per-entity columns into a single consolidated column.
 * Formula: consolidated[account][month] = Σ entities[account][month] + Σ eliminations[account][month]
 * (eliminations are signed — negative amounts reduce totals.)
 */
export function combineEntities(
  byEntity: EntityColumn[],
  universe: AlignedAccount[],
  eliminations: EliminationEntry[],
  fyMonths: readonly string[],
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
      const elims = elimsByKey.get(u.key) ?? []
      // Only apply elimination to the reportMonth its source_amount was scoped to;
      // but in this engine we keep eliminations month-agnostic — the caller must build month-specific rules.
      // For simplicity in V1: eliminations carry `amount` which applies to monthly_values[reportMonth] only.
      // For other months, eliminations do not apply (consolidated[other_month] = pure sum).
      // This is enforced by the eliminations engine in plan 00d filtering by reportMonth before calling here.
      // INTENTIONAL NO-OP (checker revision #8): the `* 0` multiplier zeroes the elimination
      // contribution in this plan on purpose. Plan 00b ships the orchestration scaffolding; plan
      // 00d removes the `* 0` and adds the `reportMonth` parameter so eliminations are actually
      // applied to the reportMonth only. This structure is chosen (rather than a stub with no
      // elimination code at all) so plan 00d's diff is minimal and the sign-convention plumbing
      // is in place at the call site.
      sum += elims.reduce((acc, e) => acc + e.amount, 0) * 0   // STAGING for plan 00d — do NOT remove in 00b
      monthly[m] = sum
    }
    return {
      account_type: u.account_type,
      account_name: u.account_name,
      monthly_values: monthly,
    }
  })

  return { lines }
}

/**
 * Main entry point. FX translation and elimination plug-in points are marked.
 * Plans 00c and 00d wire them into this function.
 */
export async function buildConsolidation(
  supabase: any,
  opts: BuildConsolidationOpts,
): Promise<ConsolidatedReport> {
  const startedAt = Date.now()

  const { group, members } = await loadGroup(supabase, opts.groupId)
  const snapshots = await loadMemberSnapshots(supabase, members)

  // 2. Dedup per member
  const deduped = snapshots.map(s => ({
    ...s,
    lines: deduplicateMemberLines(s.rawLines),
  }))

  // 3. FX PLUG-IN POINT — plan 00c replaces this identity with actual translation
  const translated = deduped  // pass-through for now; plan 00c overrides

  // 4. Build universe + entity columns
  const universe = buildAlignedAccountUniverse(translated.map(t => t.lines))
  const byEntity = translated.map(t =>
    buildEntityColumn(t.member, t.lines, universe, opts.fyMonths)
  )

  // 5. ELIMINATION PLUG-IN POINT — plan 00d replaces this [] with actual entries
  const eliminations: EliminationEntry[] = []

  // 6. Combine
  const consolidated = combineEntities(byEntity, universe, eliminations, opts.fyMonths)

  const totalLines = deduped.reduce((acc, d) => acc + d.lines.length, 0)

  return {
    group,
    byEntity,
    eliminations,
    consolidated,
    fx_context: { rates_used: {}, missing_rates: [] },
    diagnostics: {
      members_loaded: members.length,
      total_lines_processed: totalLines,
      eliminations_applied_count: 0,
      eliminations_total_amount: 0,
      processing_ms: Date.now() - startedAt,
    },
  }
}
```

Create `src/lib/consolidation/engine.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { combineEntities } from './engine'
import {
  buildAlignedAccountUniverse,
  buildEntityColumn,
  accountAlignmentKey,
} from './account-alignment'
import {
  FY_MONTHS,
  dragonRoofingPL,
  easyHailPL,
  DRAGON_ROOFING_BIZ,
  EASY_HAIL_BIZ,
} from './__fixtures__/dragon-mar-2026'
import type { ConsolidationMember } from './types'

function buildFixtureColumns() {
  const universe = buildAlignedAccountUniverse([dragonRoofingPL, easyHailPL])
  const dragonMember: ConsolidationMember = {
    id: 'm-dragon', group_id: 'g1', source_business_id: DRAGON_ROOFING_BIZ,
    display_name: 'Dragon Roofing Pty Ltd', display_order: 0, functional_currency: 'AUD',
  }
  const easyHailMember: ConsolidationMember = {
    id: 'm-easyhail', group_id: 'g1', source_business_id: EASY_HAIL_BIZ,
    display_name: 'Easy Hail Claim Pty Ltd', display_order: 1, functional_currency: 'AUD',
  }
  const dragonCol = buildEntityColumn(dragonMember, dragonRoofingPL, universe, FY_MONTHS)
  const easyHailCol = buildEntityColumn(easyHailMember, easyHailPL, universe, FY_MONTHS)
  return { universe, byEntity: [dragonCol, easyHailCol] }
}

describe('combineEntities — Dragon March 2026 (no eliminations)', () => {
  it('Sales - Deposit consolidated = 0 (Dragon) + 11652 (Easy Hail) = 11652', () => {
    const { universe, byEntity } = buildFixtureColumns()
    const consolidated = combineEntities(byEntity, universe, [], FY_MONTHS)
    const depositRow = consolidated.lines.find(l => l.account_name === 'Sales - Deposit')
    expect(depositRow).toBeDefined()
    expect(depositRow!.monthly_values['2026-03']).toBeCloseTo(11652, 0)
  })

  it('Advertising & Marketing consolidated = -9015 + 9015 = 0 (pre-elimination)', () => {
    const { universe, byEntity } = buildFixtureColumns()
    const consolidated = combineEntities(byEntity, universe, [], FY_MONTHS)
    const advRow = consolidated.lines.find(l => l.account_name === 'Advertising & Marketing')
    expect(advRow).toBeDefined()
    expect(advRow!.monthly_values['2026-03']).toBeCloseTo(0, 0)
  })

  it('every universe row appears exactly once in consolidated', () => {
    const { universe, byEntity } = buildFixtureColumns()
    const consolidated = combineEntities(byEntity, universe, [], FY_MONTHS)
    expect(consolidated.lines.length).toBe(universe.length)
  })

  it('empty elimination list produces pure arithmetic sum', () => {
    const { universe, byEntity } = buildFixtureColumns()
    const consolidated = combineEntities(byEntity, universe, [], FY_MONTHS)
    // Referral Fee - Easy Hail: Dragon 818, Easy Hail 0 (filler) → consolidated 818 (pre-elim)
    const refFeeRow = consolidated.lines.find(l => l.account_name === 'Referral Fee - Easy Hail')
    expect(refFeeRow).toBeDefined()
    expect(refFeeRow!.monthly_values['2026-03']).toBeCloseTo(818, 0)
  })
})

describe('combineEntities — months other than reportMonth are pure sums', () => {
  it('months with no data sum to zero', () => {
    const { universe, byEntity } = buildFixtureColumns()
    const consolidated = combineEntities(byEntity, universe, [], FY_MONTHS)
    const depositRow = consolidated.lines.find(l => l.account_name === 'Sales - Deposit')
    // Assuming fixture only populates 2026-03, other months should be 0
    expect(depositRow!.monthly_values['2025-07'] ?? 0).toBe(0)
  })
})
```

The `loadGroup` and `loadMemberSnapshots` functions require a live Supabase — they are not unit-tested here. Integration tests in plan 00e (API route test) exercise them.
  </action>
  <verify>
    <automated>npx vitest run src/lib/consolidation/engine.test.ts --reporter=dot && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `grep "export async function buildConsolidation\|export async function loadGroup\|export async function loadMemberSnapshots\|export function combineEntities" src/lib/consolidation/engine.ts` returns 4 matches
    - `grep "resolveBusinessIds" src/lib/consolidation/engine.ts` returns >=1 match (mandatory per shared pattern)
    - `grep "Promise.all" src/lib/consolidation/engine.ts` returns >=1 match (parallel fetch enforced)
    - `grep "from '@/lib/utils/resolve-business-ids'" src/lib/consolidation/engine.ts` returns 1 match
    - `npx vitest run src/lib/consolidation/engine.test.ts` reports >=4 passing tests
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>Engine orchestrates load → dedup → universe → columns → combine. Parallel Supabase fetches use resolveBusinessIds. Dragon fixture pre-elimination values (0, 11652, 0, 818) match expected arithmetic sums. FX + eliminations plug-in points clearly marked for plans 00c/00d.</done>
</task>

</tasks>

<verification>
  <commands>
    - `npx vitest run src/lib/consolidation --reporter=dot` — all tests from both modules green
    - `npx tsc --noEmit` — clean
    - `grep -r "resolveBusinessIds" src/lib/consolidation/engine.ts` — ≥1 match
  </commands>
</verification>

<success_criteria>
- account-alignment.ts + tests green (alignment key, dedup, universe, column filler)
- engine.ts + tests green (load + parallel fetch + combine)
- Dragon fixture arithmetic path confirmed: Sales-Deposit=11652, Advertising=0, Referral=818 (pre-elim)
- resolveBusinessIds used per member (NOT raw ID queries)
- FX + eliminations plug-in points marked and empty
</success_criteria>

<output>
After completion, create `.planning/phases/34-dragon-multi-entity-consolidation/34-00b-SUMMARY.md` summarising:
- Module line counts
- Test count + all-green
- Any Dragon fixture TODO_MATT_CONFIRM rows encountered (flag for plan 00e integration)
- Hooks exposed for plan 00c (FX plug-in point) and plan 00d (eliminations plug-in point)
</output>
