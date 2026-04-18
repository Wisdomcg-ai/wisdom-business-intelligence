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
import { loadEliminationRules, applyEliminations } from './eliminations'

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
  /**
   * Optional FX translator invoked once per member whose `functional_currency`
   * differs from the group's `presentation_currency`. Members sharing the
   * presentation currency are short-circuited and NEVER reach the callback
   * (pure pass-through, zero cost).
   *
   * The callback returns:
   *   - `translated`  — the same-shape XeroPLLineLike array in presentation currency
   *   - `missing`     — month keys (e.g. '2026-03') for which no rate was available;
   *                     surfaced to the UI via `fx_context.missing_rates`
   *   - `ratesUsed`   — a flat map with keys `${currency_pair}::${month}` so multiple
   *                     pairs can coexist in one response
   *
   * Omit this callback to get the pre-34.0c pass-through behaviour (used by
   * unit tests and AUD-only groups where `functional_currency === presentation_currency`
   * for every member).
   */
  translate?: (
    member: ConsolidationMember,
    lines: XeroPLLineLike[],
  ) => Promise<{
    translated: XeroPLLineLike[]
    missing: string[]
    ratesUsed: Record<string, number>
  }>
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
 * Formula: consolidated[account][reportMonth] = Σ entities[account][reportMonth] + Σ eliminations[account]
 *          consolidated[account][otherMonth]  = Σ entities[account][otherMonth]   (no eliminations applied)
 *
 * Eliminations are month-scoped at the source (applyEliminations uses `reportMonth` to derive
 * source amounts), so we only apply them when iterating the reportMonth. Applying them to every
 * month would double-count or misapply values from other months that weren't part of the rule.
 *
 * Sign convention: eliminations carry negative amounts that reduce the consolidated total.
 */
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
      // Eliminations apply only to the reportMonth (their source amounts were sampled there).
      if (m === reportMonth) {
        const elims = elimsByKey.get(u.key) ?? []
        sum += elims.reduce((acc, e) => acc + e.amount, 0)
      }
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

  // 4. FX TRANSLATION — only invoked for members whose functional_currency differs
  // from the group's presentation_currency. AUD-only consolidations (e.g. Dragon)
  // short-circuit here and incur zero FX cost. Missing rates surface via
  // `fx_context.missing_rates[]` — we NEVER silently fall back to 1.0.
  const fxRatesUsed: Record<string, number> = {}
  const fxMissing: { currency_pair: string; period: string }[] = []
  const translated = await Promise.all(
    deduped.map(async (d) => {
      // Short-circuit: same currency → pass-through (no callback invocation)
      if (
        !opts.translate ||
        d.member.functional_currency === group.presentation_currency
      ) {
        return d
      }
      const { translated: tLines, missing, ratesUsed } = await opts.translate(
        d.member,
        d.lines,
      )
      Object.assign(fxRatesUsed, ratesUsed)
      const pair = `${d.member.functional_currency}/${group.presentation_currency}`
      for (const m of missing) {
        fxMissing.push({ currency_pair: pair, period: m })
      }
      return { ...d, lines: tLines }
    }),
  )

  // 5. Build universe + entity columns
  const universe = buildAlignedAccountUniverse(translated.map((t) => t.lines))
  const byEntity = translated.map((t) => buildEntityColumn(t.member, t.lines, universe, opts.fyMonths))

  // 6. ELIMINATION APPLICATION
  // Load ALL active rules for the group, then filter out BS-only rule types before applying
  // to the P&L engine. `intercompany_loan` rules are consumed exclusively by the BS path
  // in plan 01a (buildConsolidatedBalanceSheet). Mixing them here would incorrectly zero
  // out P&L rows that share a name pattern with a loan account.
  const allRules = await loadEliminationRules(supabase, opts.groupId)
  const plRules = allRules.filter((r) => r.rule_type !== 'intercompany_loan')
  const eliminations = applyEliminations(plRules, byEntity, opts.reportMonth)

  // 7. Combine
  const consolidated = combineEntities(byEntity, universe, eliminations, opts.fyMonths, opts.reportMonth)

  const totalLines = deduped.reduce((acc, d) => acc + d.lines.length, 0)

  return {
    group,
    byEntity,
    eliminations,
    consolidated,
    fx_context: { rates_used: fxRatesUsed, missing_rates: fxMissing },
    diagnostics: {
      members_loaded: members.length,
      total_lines_processed: totalLines,
      eliminations_applied_count: eliminations.length,
      eliminations_total_amount: eliminations.reduce((acc, e) => acc + Math.abs(e.amount), 0),
      processing_ms: Date.now() - startedAt,
    },
  }
}
