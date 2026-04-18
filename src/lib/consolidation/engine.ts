/**
 * Multi-Entity Consolidation Engine (P&L) — Phase 34
 *
 * Takes a consolidation group + member list, fetches each member's xero_pl_lines in parallel,
 * aligns accounts across entities, and produces a per-entity column structure + a combined column.
 *
 * This module is PURE orchestration — FX translation (fx.ts, plan 00c) and elimination rules
 * (eliminations.ts, plan 00d) are plugged in by the caller. The engine's output has slots for both
 * but does not compute them: fx_context.missing_rates=[], eliminations=[] in this plan.
 *
 * Audit rule: every query uses resolveBusinessIds. No raw-id queries against xero_pl_lines.
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
  reportMonth: string // 'YYYY-MM'
  fiscalYear: number
  fyMonths: readonly string[] // 12 'YYYY-MM' keys, driven by business fiscal year
}

/**
 * Load group + members from consolidation_groups + consolidation_group_members.
 */
export async function loadGroup(supabase: any, groupId: string): Promise<LoadedGroup> {
  const { data: group, error: gErr } = await supabase
    .from('consolidation_groups')
    .select('*')
    .eq('id', groupId)
    .single()
  if (gErr || !group) {
    throw new Error(`[Consolidation Engine] Group ${groupId} not found: ${gErr?.message ?? ''}`)
  }

  const { data: members, error: mErr } = await supabase
    .from('consolidation_group_members')
    .select('*')
    .eq('group_id', groupId)
    .order('display_order', { ascending: true })
  if (mErr) {
    throw new Error(`[Consolidation Engine] Failed to load members: ${mErr.message}`)
  }

  return { group, members: members ?? [] }
}

/**
 * Per-member parallel fetch. Calls resolveBusinessIds once per member (mandatory — xero_pl_lines
 * uses business_profiles.id; members.source_business_id may be either ID, so we resolve both).
 */
export async function loadMemberSnapshots(
  supabase: any,
  members: ConsolidationMember[],
): Promise<MemberSnapshot[]> {
  return Promise.all(
    members.map(async (member) => {
      const ids = await resolveBusinessIds(supabase, member.source_business_id)
      const { data: lines, error } = await supabase
        .from('xero_pl_lines')
        .select('business_id, account_name, account_code, account_type, section, monthly_values')
        .in('business_id', ids.all)
      if (error) {
        throw new Error(
          `[Consolidation Engine] Failed to load xero_pl_lines for member ${member.display_name}: ${error.message}`,
        )
      }
      return { member, rawLines: (lines ?? []) as XeroPLLineLike[] }
    }),
  )
}

/**
 * Combine per-entity columns into a single consolidated column.
 * Formula: consolidated[account][month] = Σ entities[account][month] + Σ eliminations[account][month]
 * (eliminations are signed — negative amounts reduce totals.)
 *
 * NOTE: in this plan (00b) eliminations are passed through but their contribution is
 * multiplied by 0 — see staging comment below. Plan 00d removes the * 0 and adds the
 * reportMonth parameter so eliminations are actually applied on the reportMonth only.
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

  const lines = universe.map((u) => {
    const monthly: Record<string, number> = {}
    for (const m of fyMonths) {
      let sum = 0
      for (const col of byEntity) {
        const lineInEntity = col.lines.find(
          (l) =>
            accountAlignmentKey({ account_type: l.account_type, account_name: l.account_name }) ===
            u.key,
        )
        sum += lineInEntity?.monthly_values[m] ?? 0
      }
      const elims = elimsByKey.get(u.key) ?? []
      // INTENTIONAL NO-OP (checker revision #8): the `* 0` multiplier zeroes the elimination
      // contribution in this plan on purpose. Plan 00b ships the orchestration scaffolding; plan
      // 00d removes the `* 0` and adds the `reportMonth` parameter so eliminations are actually
      // applied to the reportMonth only. This structure is chosen (rather than a stub with no
      // elimination code at all) so plan 00d's diff is minimal and the sign-convention plumbing
      // is in place at the call site.
      sum += elims.reduce((acc, e) => acc + e.amount, 0) * 0 // STAGING for plan 00d — do NOT remove in 00b
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

  // 1. Load group + members
  const { group, members } = await loadGroup(supabase, opts.groupId)

  // 2. Parallel-fetch each member's xero_pl_lines via resolveBusinessIds
  const snapshots = await loadMemberSnapshots(supabase, members)

  // 3. Dedup per member (xero sync race duplicates)
  const deduped = snapshots.map((s) => ({
    ...s,
    lines: deduplicateMemberLines(s.rawLines),
  }))

  // 4. FX PLUG-IN POINT — plan 00c replaces this identity pass-through with actual translation
  const translated = deduped

  // 5. Build universe + entity columns
  const universe = buildAlignedAccountUniverse(translated.map((t) => t.lines))
  const byEntity = translated.map((t) => buildEntityColumn(t.member, t.lines, universe, opts.fyMonths))

  // 6. ELIMINATION PLUG-IN POINT — plan 00d replaces this [] with actual entries
  const eliminations: EliminationEntry[] = []

  // 7. Combine
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
