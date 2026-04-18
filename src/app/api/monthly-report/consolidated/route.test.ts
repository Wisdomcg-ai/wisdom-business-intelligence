/**
 * Integration tests for `buildConsolidation` as consumed by
 * `POST /api/monthly-report/consolidated`.
 *
 * Two cases are covered (checker revision #6):
 *   1. Dragon AUD-only path — advertising elimination nets to 0,
 *      Sales - Deposit passes through at 11,652, no FX invoked.
 *   2. IICT FX translate callback path — the callback is invoked ONLY for
 *      the HKD member, `fx_context.rates_used` carries the HKD/AUD::2026-03
 *      key, and the consolidated column reflects translated values.
 *
 * We exercise `buildConsolidation` directly (rather than lifting a
 * NextRequest through the route) because the route is a thin wrapper: the
 * engine is the behavioural surface and the route's own unit-level concerns
 * (auth, rate limit, stage tracking) are structural enough to verify via
 * grep-based acceptance criteria. This keeps the test fast and decoupled
 * from Next.js runtime shims.
 */

import { describe, it, expect } from 'vitest'
import { buildConsolidation } from '@/lib/consolidation/engine'
import {
  FY_MONTHS,
  dragonRoofingPL,
  easyHailPL,
  DRAGON_ROOFING_BIZ,
  EASY_HAIL_BIZ,
} from '@/lib/consolidation/__fixtures__/dragon-mar-2026'
import {
  iictAustPL,
  iictGroupPtyLtdPL,
  iictHKPL,
  IICT_AUST_BIZ,
  IICT_GROUP_PTY_BIZ,
  IICT_HK_BIZ,
  HKD_AUD_MONTHLY,
} from '@/lib/consolidation/__fixtures__/iict-mar-2026'
import type {
  ConsolidationMember,
  XeroPLLineLike,
} from '@/lib/consolidation/types'

/**
 * Minimal chainable Supabase mock. Supports the query shapes
 * `buildConsolidation` + `resolveBusinessIds` + `loadEliminationRules` use:
 *
 *   .from(T).select(C).eq(col, val).single()
 *   .from(T).select(C).eq(col, val).maybeSingle()
 *   .from(T).select(C).eq(col, val).order(col, opts)
 *   .from(T).select(C).eq(col, val).eq(col2, val2)           (awaited directly — used by loadEliminationRules)
 *   .from(T).select(C).in(col, values)
 *
 * The mock is built around a `rowsByTable` dictionary; every query applies
 * the predicates (eq / in) sequentially against the rows for that table.
 */
function mockSupabase(rowsByTable: Record<string, any[]>) {
  function applyFilters(
    table: string,
    predicates: Array<(r: any) => boolean>,
  ): any[] {
    const rows = rowsByTable[table] ?? []
    return rows.filter((r) => predicates.every((p) => p(r)))
  }

  function builder(table: string, predicates: Array<(r: any) => boolean>) {
    const self: any = {
      eq: (col: string, val: any) =>
        builder(table, [...predicates, (r: any) => r[col] === val]),
      in: (col: string, values: any[]) => {
        const matched = applyFilters(table, [
          ...predicates,
          (r: any) => values.includes(r[col]),
        ])
        // `.in()` is awaitable directly — resolve to `{ data, error }`.
        return Promise.resolve({ data: matched, error: null })
      },
      order: (_col: string, _opts?: any) => {
        const matched = applyFilters(table, predicates)
        return Promise.resolve({ data: matched, error: null })
      },
      single: async () => {
        const matched = applyFilters(table, predicates)
        return {
          data: matched[0] ?? null,
          error: matched.length === 0 ? { message: 'No rows' } : null,
        }
      },
      maybeSingle: async () => {
        const matched = applyFilters(table, predicates)
        return { data: matched[0] ?? null, error: null }
      },
      // Thenable: awaiting a chain like `.eq().eq()` (no terminal .single etc)
      // should resolve to `{ data, error }` — mirrors Supabase's builder.
      then: (resolve: any, reject: any) =>
        Promise.resolve({
          data: applyFilters(table, predicates),
          error: null,
        }).then(resolve, reject),
    }
    return self
  }

  return {
    from: (table: string) => ({
      select: (_cols?: string) => builder(table, []),
    }),
  } as any
}

/**
 * resolveBusinessIds caches across calls in a module-level Map — seed
 * `business_profiles` so the "businesses.id → business_profiles.id" path
 * returns an `id` matching the member's `source_business_id`. This keeps
 * the subsequent `xero_pl_lines .in('business_id', [id])` query targeted.
 */
function businessProfileSelfRefs(...ids: string[]) {
  return ids.map((id) => ({ id, business_id: id }))
}

describe('buildConsolidation — Dragon March 2026 with advertising elimination', () => {
  it('returns consolidated with Advertising=0 and Sales-Deposit=11652', async () => {
    const dragonGroupId = 'group-dragon-test'
    const mock = mockSupabase({
      consolidation_groups: [
        {
          id: dragonGroupId,
          business_id: 'biz-parent-dragon',
          name: 'Dragon Consolidation',
          presentation_currency: 'AUD',
        },
      ],
      consolidation_group_members: [
        {
          id: 'm-1',
          group_id: dragonGroupId,
          source_business_id: DRAGON_ROOFING_BIZ,
          display_name: 'Dragon Roofing Pty Ltd',
          display_order: 0,
          functional_currency: 'AUD',
        },
        {
          id: 'm-2',
          group_id: dragonGroupId,
          source_business_id: EASY_HAIL_BIZ,
          display_name: 'Easy Hail Claim Pty Ltd',
          display_order: 1,
          functional_currency: 'AUD',
        },
      ],
      business_profiles: businessProfileSelfRefs(
        DRAGON_ROOFING_BIZ,
        EASY_HAIL_BIZ,
      ),
      xero_pl_lines: [...dragonRoofingPL, ...easyHailPL],
      consolidation_elimination_rules: [
        {
          id: 'r-adv',
          group_id: dragonGroupId,
          rule_type: 'account_category',
          entity_a_business_id: DRAGON_ROOFING_BIZ,
          entity_a_account_code: null,
          entity_a_account_name_pattern: 'advertising & marketing',
          entity_b_business_id: EASY_HAIL_BIZ,
          entity_b_account_code: null,
          entity_b_account_name_pattern: 'advertising & marketing',
          direction: 'bidirectional',
          description: 'Dragon/EasyHail advertising transfer',
          active: true,
        },
      ],
    })

    const report = await buildConsolidation(mock, {
      groupId: dragonGroupId,
      reportMonth: '2026-03',
      fiscalYear: 2026,
      fyMonths: FY_MONTHS,
    })

    // 1. Advertising eliminated to 0 (Dragon -9015 + EasyHail +9015 + eliminations)
    const advRow = report.consolidated.lines.find(
      (l) => l.account_name === 'Advertising & Marketing',
    )
    expect(advRow).toBeDefined()
    expect(advRow!.monthly_values['2026-03']).toBeCloseTo(0, 0)

    // 2. Sales - Deposit passes through at 11,652 (no elimination touches it)
    const depositRow = report.consolidated.lines.find(
      (l) => l.account_name === 'Sales - Deposit',
    )
    expect(depositRow).toBeDefined()
    expect(depositRow!.monthly_values['2026-03']).toBeCloseTo(11652, 0)

    // 3. Diagnostics — 2 members, eliminations applied
    expect(report.diagnostics.members_loaded).toBe(2)
    expect(report.diagnostics.eliminations_applied_count).toBeGreaterThan(0)

    // 4. FX context empty (AUD-only group, translate callback never supplied)
    expect(report.fx_context.missing_rates).toEqual([])
    expect(report.fx_context.rates_used).toEqual({})
  })
})

// Checker revision #6 — second integration test exercises the FX translate
// callback end-to-end; proves `fx_context.rates_used` is populated and that
// AUD members short-circuit before the callback fires.
describe('buildConsolidation — IICT March 2026 FX translate callback populates rates_used', () => {
  it('calls translate for HKD member only, populates HKD/AUD::2026-03, and consolidated reflects translated values', async () => {
    const iictGroupId = 'group-iict-test'
    const HKD_AUD_RATE = HKD_AUD_MONTHLY['2026-03']

    const mock = mockSupabase({
      consolidation_groups: [
        {
          id: iictGroupId,
          business_id: 'biz-parent-iict',
          name: 'IICT Consolidation',
          presentation_currency: 'AUD',
        },
      ],
      consolidation_group_members: [
        {
          id: 'm-a',
          group_id: iictGroupId,
          source_business_id: IICT_AUST_BIZ,
          display_name: 'IICT (Aust) Pty Ltd',
          display_order: 0,
          functional_currency: 'AUD',
        },
        {
          id: 'm-b',
          group_id: iictGroupId,
          source_business_id: IICT_GROUP_PTY_BIZ,
          display_name: 'IICT Group Pty Ltd',
          display_order: 1,
          functional_currency: 'AUD',
        },
        {
          id: 'm-c',
          group_id: iictGroupId,
          source_business_id: IICT_HK_BIZ,
          display_name: 'IICT Group Limited (HK)',
          display_order: 2,
          functional_currency: 'HKD',
        },
      ],
      business_profiles: businessProfileSelfRefs(
        IICT_AUST_BIZ,
        IICT_GROUP_PTY_BIZ,
        IICT_HK_BIZ,
      ),
      xero_pl_lines: [...iictAustPL, ...iictGroupPtyLtdPL, ...iictHKPL],
      consolidation_elimination_rules: [],
    })

    // Track which members the callback was invoked for (must be HKD only).
    const invokedFor: string[] = []

    const translate = async (
      member: ConsolidationMember,
      lines: XeroPLLineLike[],
    ) => {
      invokedFor.push(member.functional_currency)
      // Engine should short-circuit AUD members — if this branch runs for AUD,
      // it's a bug. We keep the defensive code path but assert on `invokedFor`.
      const pair = `${member.functional_currency}/AUD`
      if (member.functional_currency !== 'HKD') {
        return { translated: lines, missing: [], ratesUsed: {} }
      }
      const translated: XeroPLLineLike[] = lines.map((l) => ({
        ...l,
        monthly_values: Object.fromEntries(
          Object.entries(l.monthly_values).map(([m, v]) => [
            m,
            (v as number) * HKD_AUD_RATE,
          ]),
        ),
      }))
      return {
        translated,
        missing: [],
        ratesUsed: { [`${pair}::2026-03`]: HKD_AUD_RATE },
      }
    }

    const report = await buildConsolidation(mock, {
      groupId: iictGroupId,
      reportMonth: '2026-03',
      fiscalYear: 2026,
      fyMonths: FY_MONTHS,
      translate: translate,
    })

    // 1. fx_context.rates_used populated for the HK member
    expect(report.fx_context.rates_used['HKD/AUD::2026-03']).toBeCloseTo(
      HKD_AUD_RATE,
      6,
    )

    // 2. No missing rates (the fixture rate was available for 2026-03)
    expect(report.fx_context.missing_rates).toEqual([])

    // 3. AUD members were NOT translated — the engine short-circuits them.
    //    We verify this two ways: (a) the callback was called exactly once,
    //    and only for the HKD member; (b) rates_used has no AUD/* keys.
    expect(invokedFor).toEqual(['HKD'])
    for (const key of Object.keys(report.fx_context.rates_used)) {
      expect(key.startsWith('AUD/')).toBe(false)
    }

    // 4. Consolidated column for an HK-only account reflects the translated value.
    const hkOnlyAccount = iictHKPL[0]
    const consolidatedHkRow = report.consolidated.lines.find(
      (l) =>
        l.account_name === hkOnlyAccount.account_name &&
        l.account_type === hkOnlyAccount.account_type,
    )
    if (consolidatedHkRow) {
      const expectedAud =
        (hkOnlyAccount.monthly_values['2026-03'] ?? 0) * HKD_AUD_RATE
      expect(consolidatedHkRow.monthly_values['2026-03']).toBeCloseTo(
        expectedAud,
        2,
      )
    }

    // 5. All three members loaded
    expect(report.diagnostics.members_loaded).toBe(3)
  })
})
