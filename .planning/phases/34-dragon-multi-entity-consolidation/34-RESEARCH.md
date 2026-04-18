# Phase 34: Dragon Multi-Entity Consolidation — Research

**Researched:** 2026-04-18
**Domain:** Multi-entity financial consolidation (P&L, Balance Sheet, Cashflow) with FX translation + intercompany eliminations
**Confidence:** HIGH (schema + architecture) / MEDIUM (FX source selection) / MEDIUM (UI horizontal scaling pattern)

## Summary

Phase 34 delivers a three-iteration slice that turns WisdomBI into a consolidation platform. Iteration 34.0 ships consolidated P&L with per-entity columns, **FX translation** for NZD-denominated IICT Group Limited, and **intercompany elimination rules** for Dragon's active inter-entity transactions. Iteration 34.1 adds Balance Sheet with closing-spot FX translation (generating a Cumulative Translation Adjustment equity line) and intercompany loan eliminations. Iteration 34.2 aggregates per-entity Phase 28 cashflow engine outputs.

The original roadmap (`ROADMAP.md:486–522`) understated the scope — CONTEXT.md (authoritative) adds FX, eliminations, and Balance Sheet / Cashflow iterations that are **required for day-one usefulness** because the reference PDFs already show these features in the manual reports Matt produces monthly today.

**Primary recommendation:** Build the consolidation engine as a **view-based aggregator** in `src/lib/consolidation/engine.ts` that (1) queries `xero_pl_lines` for all members in parallel, (2) applies FX translation per-member at read time using rates from a new `fx_rates` table, (3) applies elimination rules post-aggregation, and (4) returns a per-entity column structure the UI pivots into Entity A | Entity B | [Entity C] | Eliminations | Consolidated columns. Reuse `generate/route.ts` business logic (variance, subtotal, YTD) by extracting it into shared helpers. Cache consolidated output only via the Phase 35 approval snapshot — no pre-compute.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Consolidation group CRUD | API (`/api/consolidation/groups`) | Supabase RLS | Group definitions are server-authoritative; RLS enforces coach-only visibility |
| Member P&L aggregation | API (`/api/monthly-report/consolidated`) | — | Requires service-role reads across multiple businesses; RLS would block coach-session queries |
| FX translation | API (consolidation engine) | fx_rates scheduled job | Translation is deterministic per (period, currency pair) — server computes, does not push to client |
| Intercompany elimination | API (consolidation engine) | Supabase (rules storage) | Rules live in `consolidation_elimination_rules`; engine applies at query time |
| Per-entity column rendering | Frontend (`ConsolidatedPLTab` component) | — | Pure presentation; receives pre-computed `byEntity[]` + `consolidated` objects |
| Report selector integration | Frontend (`BusinessSelector`) + API | — | Consolidation group appears as selectable item with `business_id` of its parent row |
| Template application | Frontend (existing Phase 23 UI) | — | Consolidated output has identical shape to single-entity — templates apply unchanged |
| Approval snapshot | API (`POST /api/cfo/report-status`) | Supabase (`cfo_report_status.snapshot_data`) | Serializes consolidated JSON when status → `approved` |
| FX rate seeding | Scheduled job (cron / Vercel cron) | Third-party API (exchangeratesapi / RBA CSV) | Monthly rates pulled nightly; manual override UI deferred |

**Why this matters:** Consolidation touches 5 tiers. Putting aggregation on the client (or in the DB via views) breaks down when you need elimination rules + FX in the same query. API-tier aggregation is the only tractable choice.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | Already in project | DB queries via service role | Existing pattern across all report APIs `[VERIFIED: src/app/api/monthly-report/generate/route.ts:11]` |
| `next` (App Router) | Already in project | API routes + pages | Existing platform foundation `[VERIFIED]` |
| `vitest` | Already in project | Unit tests | Existing test suite; cashflow engine uses it `[VERIFIED: src/lib/cashflow/engine.test.ts]` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node-fetch` or global `fetch` | Native | FX rate fetch from external API | Nightly scheduled job; no new dep needed |
| `zod` | If already installed — check `package.json` | Request body validation on new API routes | If team uses zod elsewhere for new API routes `[ASSUMED — verify]` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| View-based (computed on read) | Materialized view / pre-computed rows | Pre-compute means stale data when Xero re-syncs; CONTEXT.md explicitly chose view-based. Only use pre-compute if <3s response budget fails. |
| Custom FX rates table | Xero journal line exchange rates | Xero's rates exist but are per-transaction, not monthly-average; aggregating them would require per-line JSONB manipulation. A `fx_rates` table is simpler and matches IAS 21 `[CITED: AASB 121]` practice. |
| Exchangerates API (paid) | RBA CSV download (free) | RBA F11.1 CSV is the official source; exchangeratesapi.com.au is a paid wrapper. Start with RBA CSV import, switch to API if reliability is an issue. `[CITED: rba.gov.au/statistics/tables/csv/f11.1-data.csv]` |
| In-TS aggregation | Postgres CTE + JSON functions | Eliminations require per-rule matching logic; SQL would be unreadable. TS is the right tool. |

**No new package installs expected** unless zod is not already a dep. Run:
```bash
cd /workspaces/wisdom-business-intelligence && grep '"zod"' package.json
```

**Version verification:** No new libraries. Reuse in-project dependencies.

## Architecture Patterns

### System Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│ USER (Coach/Admin)                                                       │
│   Opens /finances/monthly-report?business_id=<dragon-group-parent-id>    │
└───────────────┬──────────────────────────────────────────────────────────┘
                │
                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ Monthly Report Page (src/app/finances/monthly-report/page.tsx)           │
│   - Existing logic: useMonthlyReport, useFullYearReport                  │
│   - NEW: useConsolidatedReport hook checks if business_id resolves to    │
│     a consolidation_groups.business_id → switches to consolidated mode   │
└───────────────┬──────────────────────────────────────────────────────────┘
                │
     ┌──────────┴──────────┐
     │                     │
     ▼                     ▼
┌─────────────┐    ┌──────────────────────────────────────────────────────┐
│ Single      │    │ Consolidated API                                     │
│ entity      │    │ POST /api/monthly-report/consolidated                │
│ API (no     │    │   { group_id, report_month, fiscal_year }            │
│ change)     │    │                                                      │
└─────────────┘    └──┬───────────────────────────────────────────────────┘
                      │
                      ▼
           ┌────────────────────────────────────────────────────────────┐
           │ Consolidation Engine (src/lib/consolidation/engine.ts)     │
           │                                                            │
           │ 1. Load group + members                                    │
           │ 2. Parallel fetch xero_pl_lines per member (Promise.all)   │
           │ 3. Load elimination rules                                  │
           │ 4. Per-member FX translation (if functional != AUD)        │
           │    ┌──────────────────────┐                                │
           │    │ fx_rates table lookup │                               │
           │    └──────────────────────┘                                │
           │ 5. Align accounts by account_type → unified key set        │
           │ 6. Compute per-entity totals + variance                    │
           │ 7. Apply elimination rules → eliminations column           │
           │ 8. Compute Consolidated = Σ entities − eliminations        │
           │ 9. Attach diagnostic view (which rules fired)              │
           └──────┬─────────────────────────────────────────────────────┘
                  │
                  ▼
           ┌────────────────────────────────────────────────────────────┐
           │ Response: { byEntity: [...], consolidated: {...},          │
           │             eliminations: [...], fx_context: {...},        │
           │             diagnostics: {...} }                           │
           └────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ Nightly Scheduled Job (Vercel cron) — separate concern                   │
│   Fetches RBA F11.1 CSV → upserts fx_rates for this month                │
│   Only active if any consolidation_group_members has                     │
│   functional_currency != presentation_currency                           │
└──────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
src/
├── lib/
│   └── consolidation/                    # NEW
│       ├── engine.ts                     # Main consolidation engine (P&L)
│       ├── engine.test.ts                # Unit tests with fixtures
│       ├── fx.ts                         # FX translation helpers
│       ├── fx.test.ts
│       ├── eliminations.ts               # Elimination rule matcher
│       ├── eliminations.test.ts
│       ├── account-alignment.ts          # Align accounts by account_type across entities
│       ├── bs-engine.ts                  # Iteration 34.1 — BS + CTA
│       ├── cashflow-aggregator.ts        # Iteration 34.2 — per-entity cashflow combine
│       └── __fixtures__/
│           ├── dragon-march-2026.ts      # Reference fixture from Dragon PDF
│           └── iict-march-2026.ts        # Reference fixture from IICT PDF
├── app/
│   └── api/
│       ├── monthly-report/
│       │   └── consolidated/             # NEW
│       │       └── route.ts              # POST consolidated report
│       ├── consolidation/                # NEW
│       │   ├── groups/
│       │   │   └── route.ts              # GET list / POST create groups
│       │   ├── elimination-rules/
│       │   │   └── route.ts              # CRUD on rules (Iteration 34.0 minimal; full UI in 34.3)
│       │   └── fx-rates/
│       │       └── route.ts              # GET rates for period (diagnostic)
│       └── cron/
│           └── fx-sync/                  # NEW — nightly FX rate pull
│               └── route.ts
│   └── finances/
│       └── monthly-report/
│           ├── components/
│           │   └── ConsolidatedPLTab.tsx # NEW — per-entity columns + Consolidated
│           └── hooks/
│               └── useConsolidatedReport.ts  # NEW
└── supabase/migrations/
    ├── 20260421_consolidation_groups.sql         # NEW Iteration 34.0 base
    ├── 20260421b_consolidation_elimination_rules.sql
    ├── 20260421c_fx_rates.sql
    ├── 20260421d_business_profiles_functional_currency.sql  # add column
    ├── 20260422_consolidation_bs_translation.sql # Iteration 34.1
    └── 20260423_consolidation_snapshot.sql       # Iteration 34.0 or 34.1 — cfo_report_status.snapshot_data JSONB
```

### Pattern 1: Per-Member Parallel Fetch + Alignment

**What:** Fetch `xero_pl_lines` for all members in parallel, then merge.
**When to use:** Base P&L consolidation for Iteration 34.0.
**Example:**
```typescript
// src/lib/consolidation/engine.ts
import { resolveBusinessIds } from '@/lib/utils/resolve-business-ids'

interface MemberSnapshot {
  memberId: string           // consolidation_group_members.id
  businessId: string         // source_business_id (businesses.id)
  displayName: string
  functionalCurrency: string
  lines: XeroPLLine[]        // from xero_pl_lines (pre-translation)
  translatedLines: PLLine[]  // AUD-equivalent after FX translation
}

export async function buildConsolidation(
  supabase: SupabaseClient,
  groupId: string,
  reportMonth: string,
  fiscalYear: number,
): Promise<ConsolidatedReport> {
  // 1. Load group + members
  const { data: group } = await supabase
    .from('consolidation_groups')
    .select('*, members:consolidation_group_members(*)')
    .eq('id', groupId)
    .single()

  // 2. Parallel load each member's PL lines
  const memberSnapshots = await Promise.all(
    group.members.map(async (m: any) => {
      const ids = await resolveBusinessIds(supabase, m.source_business_id)
      const { data: lines } = await supabase
        .from('xero_pl_lines')
        .select('account_name, account_type, section, monthly_values')
        .in('business_id', ids.all)
      return { member: m, rawLines: lines ?? [] }
    })
  )

  // 3. FX-translate each non-AUD member
  const translated = await Promise.all(
    memberSnapshots.map(async ({ member, rawLines }) => {
      if (member.functional_currency === group.presentation_currency) {
        return { ...member, translatedLines: rawLines }
      }
      const rates = await loadFxRates(
        supabase,
        member.functional_currency,
        group.presentation_currency,
        fiscalYear,
      )
      return {
        ...member,
        translatedLines: translatePLAtMonthlyAverage(rawLines, rates),
      }
    })
  )

  // 4. Align account universe by account_type (account_name primary key within type)
  const accountUniverse = buildAlignedAccountUniverse(translated)

  // 5. Build per-entity columns keyed on accountUniverse
  const byEntity = translated.map(t => buildEntityColumn(t, accountUniverse, reportMonth, fiscalYear))

  // 6. Load + apply elimination rules
  const { data: rules } = await supabase
    .from('consolidation_elimination_rules')
    .select('*')
    .eq('group_id', groupId)
    .eq('active', true)

  const eliminations = applyEliminations(rules ?? [], byEntity, accountUniverse)

  // 7. Compute consolidated column = Σ entities − eliminations
  const consolidated = combineEntities(byEntity, eliminations)

  return { group, byEntity, eliminations, consolidated, diagnostics: {...} }
}
```

### Pattern 2: FX Translation at Monthly Average (IAS 21 / AASB 121)

**What:** Multiply each P&L line's monthly value by the corresponding month's average rate.
**When to use:** Non-AUD members (IICT Group Limited NZ) for P&L (Iteration 34.0) and income-statement lines on BS (Iteration 34.1).
**Example:**
```typescript
// src/lib/consolidation/fx.ts
interface FxRateRow {
  currency_pair: string   // 'NZD_AUD'
  period_month: string    // '2026-03'
  rate_type: 'monthly_average' | 'closing_spot'
  rate: number
}

export function translatePLAtMonthlyAverage(
  lines: XeroPLLine[],
  rates: Map<string, number>,  // keyed by period_month
): XeroPLLine[] {
  return lines.map(line => ({
    ...line,
    monthly_values: Object.fromEntries(
      Object.entries(line.monthly_values).map(([month, value]) => {
        const rate = rates.get(month)
        if (rate === undefined) {
          console.warn(`[FX] Missing rate for ${month} — passing through untranslated`)
          return [month, value]
        }
        return [month, value * rate]
      })
    )
  }))
}
```

**Standard citation:** *"For practical reasons, an average rate for the period is often used to translate income and expense items where this approximates the exchange rates at the dates of transactions. However, if exchange rates fluctuate significantly, the use of the average rate for a period is inappropriate."* `[CITED: AASB 121 / IAS 21 — https://www.aasb.gov.au/admin/file/content105/c9/AASB121_08-15_COMPmar20_07-21.pdf]`

### Pattern 3: Intercompany Elimination (pair + pattern)

**What:** Match intercompany transactions across entities; post an offsetting entry in the Eliminations column.
**When to use:** Every consolidation with active inter-entity transactions. Dragon has 3 P&L-level rules + 1 BS-level rule on day one.
**Example:**
```typescript
// src/lib/consolidation/eliminations.ts
interface EliminationRule {
  id: string
  rule_type: 'account_pair' | 'account_category'
  entity_a_business_id: string
  entity_a_account_code: string | null
  entity_a_account_name_pattern: string | null
  entity_b_business_id: string
  entity_b_account_code: string | null
  entity_b_account_name_pattern: string | null
  direction: 'bidirectional' | 'entity_a_eliminates' | 'entity_b_eliminates'
  description: string
}

interface EliminationEntry {
  rule_id: string
  rule_description: string
  account_type: string
  account_name: string       // the consolidated row this hits
  amount: number             // negative — reduces consolidated total
  source_entity_id: string
  source_amount: number      // original amount being eliminated
}

export function applyEliminations(
  rules: EliminationRule[],
  byEntity: EntityColumn[],
  monthKey: string,
): EliminationEntry[] {
  const entries: EliminationEntry[] = []
  for (const rule of rules) {
    const entityA = byEntity.find(e => e.businessId === rule.entity_a_business_id)
    const entityB = byEntity.find(e => e.businessId === rule.entity_b_business_id)
    if (!entityA || !entityB) continue

    const matchedA = matchRuleToLines(rule, 'a', entityA.lines)
    const matchedB = matchRuleToLines(rule, 'b', entityB.lines)

    // Pairing logic:
    // bidirectional: cancel min(|a|, |b|) against each pair
    // entity_a_eliminates: zero out A's side only (use for one-sided transfers)
    // entity_b_eliminates: mirror of above
    // Default behaviour: eliminate the full matched amount on the declared side(s)
    // This yields a deterministic single-pass result the diagnostic view can explain.
    for (const lineA of matchedA) {
      entries.push({
        rule_id: rule.id,
        rule_description: rule.description,
        account_type: lineA.account_type,
        account_name: lineA.account_name,
        amount: -(lineA.monthly_values[monthKey] ?? 0),
        source_entity_id: rule.entity_a_business_id,
        source_amount: lineA.monthly_values[monthKey] ?? 0,
      })
    }
    if (rule.direction !== 'entity_a_eliminates') {
      for (const lineB of matchedB) {
        entries.push({
          rule_id: rule.id,
          rule_description: rule.description,
          account_type: lineB.account_type,
          account_name: lineB.account_name,
          amount: -(lineB.monthly_values[monthKey] ?? 0),
          source_entity_id: rule.entity_b_business_id,
          source_amount: lineB.monthly_values[monthKey] ?? 0,
        })
      }
    }
  }
  return entries
}

function matchRuleToLines(
  rule: EliminationRule,
  side: 'a' | 'b',
  lines: XeroPLLine[],
): XeroPLLine[] {
  const code = side === 'a' ? rule.entity_a_account_code : rule.entity_b_account_code
  const pattern = side === 'a' ? rule.entity_a_account_name_pattern : rule.entity_b_account_name_pattern

  return lines.filter(line => {
    if (code && line.account_code === code) return true
    if (pattern) {
      const re = new RegExp(pattern, 'i')
      if (re.test(line.account_name)) return true
    }
    return false
  })
}
```

### Pattern 4: Approval Snapshot for Historical Integrity

**What:** On status → `approved`, serialize the consolidated output to `cfo_report_status.snapshot_data` JSONB. On re-open, detect snapshot and render from it.
**When to use:** Phase 35 approval hook. Scope lives in Phase 34.0 schema migration so Phase 35 just hooks it.
**Example schema:**
```sql
ALTER TABLE cfo_report_status
  ADD COLUMN IF NOT EXISTS snapshot_data jsonb,
  ADD COLUMN IF NOT EXISTS snapshot_taken_at timestamptz;
```

**Contract:**
- `snapshot_data` holds the full API response object for `/api/monthly-report/consolidated` (or `/generate` for single-entity).
- Monthly report page checks: if `cfo_report_status.status IN ('approved','sent')` AND `snapshot_data IS NOT NULL`, show snapshot data with a banner "Viewing approved snapshot from {snapshot_taken_at}. Live data available."
- A "View live data" toggle re-queries the live API.

### Anti-Patterns to Avoid

- **DB views for consolidation:** Tempting because it's "server-side," but elimination rules (pattern matching) and FX translation (per-month lookup) become unreadable SQL. Stay in TypeScript.
- **Pre-computing all historical periods:** Storage grows O(members × months). CONTEXT.md's view-based choice is correct; only snapshot at approval.
- **Storing translated values in `xero_pl_lines`:** Mutating source data breaks auditability. Translate at read time.
- **Hardcoding Dragon/IICT entity IDs:** Make everything data-driven from `consolidation_group_members`. The table is the configuration.
- **Applying eliminations in SQL:** Pattern-matching rules cross-entity in SQL requires correlated subqueries over JSONB. Keep in TS.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| FX rate fetching | Custom daily scraper | RBA F11.1 CSV (free, official) with fallback to exchangeratesapi.com.au | RBA is the Australian accounting standard-compliant source. The CSV is well-formed and publicly downloadable. `[CITED: rba.gov.au/statistics/tables/csv/f11.1-data.csv]` |
| Cron scheduling | Manual wake-up | Vercel Cron (`vercel.json`) | Already part of the Next.js/Vercel stack. A weekly `/api/cron/fx-sync` endpoint is enough. |
| Business access check | Re-roll | `verifyBusinessAccess` helper `[VERIFIED: src/lib/utils/verify-business-access.ts:13]` | Existing consistent pattern |
| Dual-ID resolution | Look up manually | `resolveBusinessIds` `[VERIFIED: src/lib/utils/resolve-business-ids.ts]` | Every API route uses this — don't diverge |
| Fuzzy account matching | Custom string comparison | `buildFuzzyLookup` from `src/lib/utils/account-matching.ts` `[VERIFIED: src/app/api/monthly-report/generate/route.ts:283]` | Handles "Wages & Salaries" vs "Salaries & Wages" already |
| Fiscal year month range | Hand-roll month arrays | `generateFiscalMonthKeys` `[VERIFIED: src/lib/utils/fiscal-year-utils.ts]` | Already handles non-July fiscal years |
| Variance calc | Re-implement | Copy `calcVariance` + `buildSubtotal` from `generate/route.ts:48–73` into shared `src/lib/monthly-report/shared.ts` before writing the consolidated route | These contain subtle sign-convention logic for revenue vs expense — don't diverge |

**Key insight:** Much of the consolidated P&L route is **the exact same math as the single-entity route applied N+1 times** (once per entity + once for the consolidated column). The first task for Iteration 34.0 should be a mechanical refactor of `src/app/api/monthly-report/generate/route.ts` that extracts `calcVariance`, `buildSubtotal`, `mapTypeToCategory`, `getMonthRange`, `getNextMonth`, `getPriorYearMonth`, and the section-builder logic into `src/lib/monthly-report/shared.ts`. The consolidated route then imports and reuses.

## Runtime State Inventory

> Phase 34 is primarily additive (new tables, new routes). No rename/migration work. However, **seed data** must be created as part of the implementation plan — otherwise the feature ships with zero usable consolidations.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — new tables only | — |
| Live service config | Dragon Roofing and Easy Hail Claim businesses exist in `businesses` table (from Phase 33 CFO dashboard context) `[ASSUMED — verify via `SELECT * FROM businesses WHERE name ILIKE '%Dragon%' OR name ILIKE '%Easy Hail%' OR name ILIKE '%IICT%'`]`. IICT entity business rows may or may not exist yet | Plan must include a verification step + seed migration creating any missing businesses and `business_profiles`. Seed migration creates Dragon Consolidation group + IICT Consolidation group + their elimination rules. |
| OS-registered state | None | — |
| Secrets/env vars | `EXCHANGE_RATES_API_KEY` (optional if using paid API) — may not exist | Document as optional; RBA CSV is no-key fallback |
| Build artifacts | None | — |

**Nothing found in OS-registered state, stored data categories — verified by searching for `Dragon|Easy Hail|IICT|consolidation` across the codebase.**

## Common Pitfalls

### Pitfall 1: Double-counting intercompany transactions
**What goes wrong:** Without elimination rules, Dragon's consolidated advertising expense reports $0 net (Dragon shows $+9,015, Easy Hail shows $-9,015, totals to $0) but other accounts double-count. Worse — referral fees appear as both income on Easy Hail and expense on Dragon; the consolidated P&L then shows both revenue AND expense from the same transaction, inflating the P&L by the full amount twice.
**Why it happens:** The reference PDF from Matt shows these exact transactions. Without eliminations, Consolidated Revenue includes Easy Hail's referral income ($818), Consolidated Expenses includes Dragon's referral expense ($818) — even though nothing real happened externally.
**How to avoid:** Seed elimination rules from day one. Ship the diagnostic view so Matt can verify eliminations are firing correctly before approving the report.
**Warning signs:** Consolidated net profit varies more than ±5% from the sum of entity net profits — suggests missing/miscalibrated elimination rules.

### Pitfall 2: FX translation of zero values creating ghost rows
**What goes wrong:** An NZ entity has 36 months of history; months outside the reporting period have value 0. Multiplying 0 × rate still yields 0 but creates a `monthly_values` entry that wasn't there before if the engine re-stores. Not a correctness bug, but a diff noise bug.
**Why it happens:** Translation is straight multiplication; easy to over-apply.
**How to avoid:** Only translate values present in the source's `monthly_values`. Don't fabricate keys.
**Warning signs:** `JSON.stringify(translated).length >> JSON.stringify(source).length` without new data.

### Pitfall 3: Missing FX rate for a month → silent zero
**What goes wrong:** If `fx_rates` doesn't have a row for 2026-03 NZD/AUD, `rates.get('2026-03')` returns undefined. A naive `value * undefined = NaN`, or a `?? 0` treats the entire month's data as zero.
**Why it happens:** RBA CSV might not have a specific date due to public holidays; if import script doesn't compute monthly average from daily rates, the month is missing.
**How to avoid:** 
1. The FX sync job must compute a monthly-average rate, not import daily rates directly.
2. Engine logs a warning and passes the value through untranslated when a rate is missing (fail loud).
3. A diagnostic field in the consolidated response: `fx_context.missing_rates: ['2026-03']`.
**Warning signs:** Consolidated output displays a banner "FX rate missing for X period — values shown untranslated."

### Pitfall 4: Account alignment edge case — same account_name across entities but different meaning
**What goes wrong:** Both Dragon and Easy Hail have "Bank Fees" but in Dragon it's an OpEx row while in Easy Hail it's classified under Other Expenses. Aligning by `account_name` puts them in different rows; aligning by `account_type` AND `account_name` puts them together correctly. MLTE-03 says "align by account_type" which is ambiguous — it should mean "group by account_type then join same-named lines within that group."
**Why it happens:** Xero's auto-classification isn't 100% consistent across orgs.
**How to avoid:** Alignment key = `${account_type}::${account_name.toLowerCase().trim()}`. Accounts with same name but different type stay separate.
**Warning signs:** An account appears twice in the consolidated output under different section headers.

### Pitfall 5: Loan eliminations at Balance Sheet (Iteration 34.1) getting sign wrong
**What goes wrong:** Dragon Roofing has "Loan Payable - Dragon Roofing Pty Ltd ($315,173)" (liability, positive in Liabilities section). Easy Hail has "Loan Receivable - Dragon Roofing Pty Ltd" (asset, positive in Assets section). Eliminating requires zeroing BOTH — if only one side is zeroed, the consolidated BS doesn't balance (Assets != Liabilities + Equity).
**Why it happens:** BS eliminations are double-entry in nature; P&L eliminations are single-entry. The engine must handle both.
**How to avoid:** `rule_type: 'intercompany_loan'` treats the rule as double-sided: zero the A side AND the B side, no net impact on equity. Unit test: after loan elimination, Assets − Liabilities − Equity should be unchanged from sum of entity Net Assets.
**Warning signs:** Consolidated BS doesn't balance after eliminations.

### Pitfall 6: CTA (Cumulative Translation Adjustment) going to the wrong equity line
**What goes wrong:** When you translate NZ BS at closing spot rate and NZ P&L at monthly average, retained earnings translated at closing rate ≠ (retained earnings at start-of-year rate + P&L translated at monthly average). The difference IS the CTA and must land in equity, not silently disappear.
**Why it happens:** It's a subtle accounting concept. Common rookie error: ignore it and tolerate an "out-of-balance" BS.
**How to avoid:** Iteration 34.1 adds a synthetic equity line "Cumulative Translation Adjustment" computed as: `(BS translation differences) − (P&L translated amounts)`. Start simple: show as single line; segmentation deferred per CONTEXT.md deferred list.
**Warning signs:** Consolidated BS doesn't balance by CTA amount.

## Code Examples

Verified patterns from existing codebase:

### Resolving business IDs (use in every API route)

```typescript
// src/app/api/monthly-report/consolidated/route.ts (NEW)
// Source: src/app/api/monthly-report/full-year/route.ts (verified pattern)
import { resolveBusinessIds } from '@/lib/utils/resolve-business-ids'

const ids = await resolveBusinessIds(supabase, member.source_business_id)
const { data } = await supabase
  .from('xero_pl_lines')
  .select('*')
  .in('business_id', ids.all)
```

### RLS policy template for new tables (coach + super_admin + service_role)

```sql
-- Source: supabase/migrations/20260420_cfo_dashboard.sql
ALTER TABLE consolidation_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "consolidation_groups_coach_all" ON consolidation_groups
  FOR ALL USING (
    business_id IN (
      SELECT id FROM businesses WHERE assigned_coach_id = auth.uid()
    )
  );

CREATE POLICY "consolidation_groups_super_admin_all" ON consolidation_groups
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM system_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

CREATE POLICY "consolidation_groups_service_role" ON consolidation_groups
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

### Idempotent migration pattern

```sql
-- Source: supabase/migrations/20260418b_cashflow_settings_tweaks.sql
-- Use DO $$ blocks for conditional UPDATE logic
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'businesses'
      AND column_name = 'functional_currency'
  ) THEN
    -- Already applied, skip
  ELSE
    ALTER TABLE businesses ADD COLUMN functional_currency text DEFAULT 'AUD';
  END IF;
END $$;
```

### Reusable variance calculation

```typescript
// Extract from src/app/api/monthly-report/generate/route.ts:48
// Move to src/lib/monthly-report/shared.ts
export function calcVariance(
  actual: number,
  budget: number,
  isRevenue: boolean,
): { amount: number; percent: number } {
  const amount = isRevenue ? actual - budget : budget - actual
  const percent = budget !== 0 ? (amount / Math.abs(budget)) * 100 : 0
  return { amount, percent }
}
```

## State of the Art

| Old Approach (original ROADMAP.md) | Current Approach (CONTEXT.md) | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Simple Entity A / Entity B / Combined columns, no eliminations | Per-entity columns + Eliminations column + Consolidated column | 2026-04-18 (user review of PDFs) | Elimination engine is net-new scope |
| AUD-only consolidation | Multi-currency with NZD→AUD translation at monthly average | 2026-04-18 | Net-new `fx_rates` table + scheduled job |
| Single consolidated P&L | 3 iterations: P&L, BS, Cashflow | 2026-04-18 | Splits delivery into 3 ships instead of 1 |
| Business selector returns business_id only | Business selector flags consolidation groups distinctly | 2026-04-18 | UI enhancement |

**Deprecated/outdated:**
- ROADMAP.md Phase 34 "Three-column layout" spec is too narrow — superseded by CONTEXT.md multi-entity + eliminations layout

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `xero_pl_lines` table has shape `{business_id, account_name, account_code, account_type, section, monthly_values jsonb}` | Standard Stack | Medium — verified via 5 existing routes (`generate`, `full-year`, `xero-actuals`, `sync-xero`, `subscription-detail`) so unlikely wrong |
| A2 | `zod` may or may not be a project dep | Standard Stack | Low — plan should run `grep '"zod"' package.json` at start |
| A3 | Dragon Roofing and Easy Hail businesses already exist in `businesses` table (inferred from Phase 33 CFO dashboard setup SQL example) | Runtime State Inventory | Medium — if not present, seed migration must create them before creating group |
| A4 | IICT entity business rows exist or will be created manually | Runtime State Inventory | High — if IICT entities don't have xero_connections and `xero_pl_lines` data, Iteration 34.0 can't demonstrate IICT consolidation. Plan should include verification task early. |
| A5 | IICT Group Limited is the NZ-denominated entity (not IICT Aust or IICT Group Pty Ltd) | FX Translation | Medium — CONTEXT.md says "researcher must confirm by checking member business `base_currency` from Xero connection" but this data isn't currently stored. Plan should include a manual verification step (Matt tells us which entity is NZD) |
| A6 | Vercel Cron is available on the current Vercel plan | FX Rate Sync | Low — fallback is manual run of `/api/cron/fx-sync` on deploy; Matt can run it monthly by visiting a URL |
| A7 | Target response time <3s for consolidated report | Architecture | Low — Dragon has 2 entities × ~269+92=361 accounts × 13 months ≈ 4,700 data points; TS aggregation is milliseconds. Query latency dominates, still well under 3s. |
| A8 | Phase 35 `snapshot_data JSONB` column will be added in Phase 34 migration (not Phase 35) so Phase 34's consolidated output has a home | Approval Snapshot | Low — either phase can own it; adding in Phase 34 means Phase 35 is purely a workflow patch |
| A9 | Xero `xero_connections` table doesn't currently store base currency | FX Translation | Low — verified via grep; `functional_currency` must live on `consolidation_group_members` (already specified in CONTEXT.md) |
| A10 | `cfo_report_status` already supports multi-entity groups via `business_id` column pointing to the consolidation parent business | Approval Snapshot | Low — CONTEXT.md locks this as the design. Confirmed the table accepts any businesses.id FK. |

**Items needing user confirmation before planning:**
- **A4** (IICT entity state): ask Matt "are IICT (Aust), IICT Group Limited, IICT Group Pty Ltd all connected to WisdomBI today?"
- **A5** (which IICT entity is NZD): ask Matt directly to confirm

## Open Questions

1. **Where do FX rates come from on day one?**
   - What we know: IAS 21 / AASB 121 standard is monthly average for P&L, closing spot for BS. RBA F11.1 provides daily AUD/NZD historical rates as CSV.
   - What's unclear: Paid API vs CSV import job
   - Recommendation: Start with a **manual seeding migration** that inserts ~36 months of monthly-average NZD/AUD rates hand-computed from RBA historical CSV. Build a nightly `/api/cron/fx-sync` endpoint in Iteration 34.0 but don't rely on it for go-live — manual seed means Iteration 34.0 ships even if cron is flaky.

2. **Should the Eliminations column be hidden when empty?**
   - What we know: IICT has minimal P&L eliminations; Dragon has several
   - What's unclear: UX preference
   - Recommendation: Show the Eliminations column always when the group has any active rules (even if this month has zero). Consistency beats adaptive UI here.

3. **What's the mobile layout for 3+ entities?**
   - What we know: CONTEXT.md proposes toggle pills on mobile; Calxa's approach is horizontal scroll
   - What's unclear: user preference not captured
   - Recommendation: Desktop = sticky first (Account Name) + sticky last (Consolidated) columns, horizontal scroll for middle entity columns. Mobile = single-entity-at-a-time toggle pills + always-visible Consolidated column below. Ship desktop-first; add mobile toggle in polish task.

4. **Elimination rule storage: encode transfer direction explicitly?**
   - What we know: CONTEXT.md has `direction` enum with 3 values
   - What's unclear: How to represent a $9,015 advertising transfer from Dragon TO Easy Hail vs FROM Easy Hail
   - Recommendation: Use `direction: 'bidirectional'` as default (matches CONTEXT.md's Dragon rule list). The engine eliminates the FULL amount on whichever side it's booked. Post-hoc edge cases (where only one side was booked in Xero) can be handled by a manual journal adjustment rule — deferred to 34.3.

5. **Does the Phase 23 template system need any new section toggles?**
   - What we know: CONTEXT.md locks "templates apply identically"
   - What's unclear: does "per-entity columns" need its own toggle? E.g. show consolidated only, hide entity breakdown?
   - Recommendation: Add ONE new template section: `show_entity_columns: boolean` (default true). This future-proofs without scope creep. Put in the Iteration 34.0 migration.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase | All | ✓ | Already in project | — |
| Xero API access | xero_pl_lines data is pre-synced — no live calls needed | ✓ | — | — |
| RBA F11.1 CSV | FX rate seeding | ✓ (public URL) | CSV format stable for years | exchangeratesapi.com.au (paid) |
| Vercel Cron | Nightly FX sync | ⚠ assumed, verify plan | — | Manual cron via server-side scheduled GET; Matt can wget nightly |
| Node fetch (global) | FX fetching | ✓ | Node 18+ | — |

**Missing dependencies with no fallback:** None — Phase 34 is DB + TS, no new runtime deps.

**Missing dependencies with fallback:**
- Vercel Cron: if unavailable, use a wget from a separate Fly.io/Render/local machine, or have Matt manually visit `/api/cron/fx-sync` once a month.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (already in project) `[VERIFIED: src/lib/cashflow/engine.test.ts]` |
| Config file | vitest config in repo root; uses node environment + co-located tests |
| Quick run command | `npx vitest run src/lib/consolidation` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

**Iteration 34.0 — P&L Consolidation:**

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MLTE-01 | `consolidation_groups` + `consolidation_group_members` tables defined with proper FKs + RLS | integration (SQL) | `npx vitest run src/lib/consolidation/schema.test.ts` | ❌ Wave 0 |
| MLTE-02 | Three-column layout (Entity A \| Entity B \| Combined), extends to N entities | unit | `npx vitest run src/lib/consolidation/engine.test.ts -t "column structure"` | ❌ Wave 0 |
| MLTE-03 | Align by account_type; absent accounts show $0 | unit | `npx vitest run src/lib/consolidation/account-alignment.test.ts` | ❌ Wave 0 |
| MLTE-04 | Group selection auto-loads consolidated view | integration (Playwright if available, else manual) | `npm run test:e2e -- consolidation` OR manual step | N/A (likely manual) |
| MLTE-05 | Template system applies identically | unit (snapshot) | `npx vitest run src/lib/consolidation/template-integration.test.ts` | ❌ Wave 0 |

**Additional tests for scope extensions (FX + Eliminations):**

| Test Name | Purpose | Automated Command |
|-----------|---------|-------------------|
| FX translation at monthly average | Given NZD line + rate 0.93, returns AUD value | `npx vitest run src/lib/consolidation/fx.test.ts` |
| Elimination rule bidirectional | Dragon advertising ±$9,015 nets to $0 consolidated | `npx vitest run src/lib/consolidation/eliminations.test.ts -t "bidirectional"` |
| Elimination rule pattern match | Rule with regex pattern matches multiple account names | `npx vitest run src/lib/consolidation/eliminations.test.ts -t "pattern"` |
| Dragon March 2026 snapshot | Reference fixture from Matt's PDF — consolidated totals exactly match PDF | `npx vitest run src/lib/consolidation/engine.test.ts -t "Dragon March 2026"` |
| IICT March 2026 snapshot | Reference fixture from Matt's PDF — FX + totals match | `npx vitest run src/lib/consolidation/engine.test.ts -t "IICT March 2026"` |

**Reference fixtures are MANDATORY:** Per CONTEXT.md, Matt provided two PDF reports with exact numbers. These become fixture files (`src/lib/consolidation/__fixtures__/dragon-march-2026.ts` and `iict-march-2026.ts`) — the test asserts that the engine produces the PDF's consolidated column to the nearest dollar. If Matt's PDFs and our output diverge, we have a bug or the PDFs have a bug — either way the discrepancy surfaces instead of hiding.

### Sampling Rate
- **Per task commit:** `npx vitest run src/lib/consolidation` (< 5s — the consolidation module only)
- **Per wave merge:** `npx vitest run` (full suite)
- **Phase gate:** Full suite green + reference fixtures match Matt's PDFs within $1

### Wave 0 Gaps

- [ ] `src/lib/consolidation/engine.ts` — main module
- [ ] `src/lib/consolidation/engine.test.ts` — unit tests
- [ ] `src/lib/consolidation/fx.ts` + `fx.test.ts`
- [ ] `src/lib/consolidation/eliminations.ts` + `eliminations.test.ts`
- [ ] `src/lib/consolidation/account-alignment.ts` + test
- [ ] `src/lib/consolidation/__fixtures__/dragon-march-2026.ts` — reference data from PDF
- [ ] `src/lib/consolidation/__fixtures__/iict-march-2026.ts` — reference data from PDF
- [ ] `src/lib/monthly-report/shared.ts` — extracted helpers from `generate/route.ts` (Wave 0 refactor)

*(Framework install: none — vitest already present.)*

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Reuse existing `createRouteHandlerClient().auth.getUser()` pattern; no new auth surface |
| V3 Session Management | yes | Reuse Supabase session; no changes |
| V4 Access Control | yes | RLS on all 4 new tables (coach + super_admin + service_role). API routes ALSO check `verifyBusinessAccess` for belt-and-braces (pattern from Phase 33) |
| V5 Input Validation | yes | `group_id`, `report_month`, `fiscal_year` all need format validation. Consider zod schemas if in use; else manual validation matching existing route patterns |
| V6 Cryptography | no | No new secrets; FX API key (if paid) stored as env var |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via group_id | Tampering | Supabase parameterized queries (`.eq('id', groupId)`) — never concatenate SQL |
| Cross-tenant data leak (coach querying another coach's consolidation) | Information Disclosure | RLS on consolidation_groups enforces `assigned_coach_id = auth.uid()`; API double-checks via `verifyBusinessAccess` |
| Regex DoS in elimination rule `account_name_pattern` | Denial of Service | Wrap `new RegExp()` in try/catch; reject patterns >128 chars; measure execution time in prod logs |
| IDOR on group_id (guessing uuid) | Elevation of Privilege | uuids are non-guessable; RLS handles authorization |
| Malicious elimination rule amplification (a rule that matches ALL lines) | Tampering | Validate rule inserts: pattern must not be `.*` or empty; require explicit entity_a and entity_b business_ids |

## File-by-File Implementation Guidance

> Scoped to Iteration 34.0 unless noted. Planner sequences into tasks.

### Wave 0 — Refactor prerequisites (single task, not in iteration numbering)

1. `src/lib/monthly-report/shared.ts` **NEW**
   - Extract from `src/app/api/monthly-report/generate/route.ts:48-101`: `calcVariance`, `buildSubtotal`, `mapTypeToCategory`, `getMonthRange`, `getNextMonth`, `getPriorYearMonth`, the `ReportLine` interface, and the section-builder logic
   - Add unit tests
   - Update `generate/route.ts` and `full-year/route.ts` to import from this module
   - Risk: low — pure code movement, no behavior change

### Iteration 34.0 — P&L Consolidation

2. `supabase/migrations/20260421_consolidation_groups.sql` **NEW**
   - Creates `consolidation_groups`, `consolidation_group_members` tables per CONTEXT.md spec
   - Adds RLS policies matching `cfo_report_status` pattern
   - Adds `updated_at` trigger

3. `supabase/migrations/20260421b_consolidation_elimination_rules.sql` **NEW**
   - Creates `consolidation_elimination_rules` with rule_type check constraint
   - RLS inheriting from group (rule is visible if group is visible)

4. `supabase/migrations/20260421c_fx_rates.sql` **NEW**
   - Creates `fx_rates (id, currency_pair, period_month, rate_type, rate, source, fetched_at)` with UNIQUE(currency_pair, period_month, rate_type)
   - No RLS (public reference data; service_role writes)
   - Seed with 36 months AUD/NZD monthly-average rates from RBA F11.1 (hand-computed from daily CSV). Plan owner must export the CSV once and compute averages.

5. `supabase/migrations/20260421d_business_profiles_functional_currency.sql` **NEW**
   - `ALTER TABLE consolidation_group_members ADD functional_currency text DEFAULT 'AUD'` (already in 20260421 but re-verify)
   - No change to `businesses` — functional_currency is per-member, not per-business (multiple groups could include the same business in theory)

6. `supabase/migrations/20260421e_cfo_report_status_snapshot.sql` **NEW**
   - `ALTER TABLE cfo_report_status ADD COLUMN IF NOT EXISTS snapshot_data jsonb, ADD COLUMN IF NOT EXISTS snapshot_taken_at timestamptz`
   - Hooked up by Phase 35 but the column lives here so Phase 34 snapshot-on-approve works if user approves before Phase 35 ships

7. `supabase/migrations/20260421f_seed_dragon_iict.sql` **NEW** (data seed, not schema)
   - Inserts Dragon Consolidation group + 2 members
   - Inserts IICT Consolidation group + 3 members (with IICT Group Limited `functional_currency='NZD'`)
   - Inserts 3 Dragon elimination rules (advertising, referral fees, intercompany loan — loan is for 34.1 but rule can exist)
   - Flags `is_cfo_client=true` on the parent businesses for both groups
   - **Idempotent** using `ON CONFLICT DO NOTHING` — plan must know business UUIDs at write time (fetch manually or use a subquery)

8. `src/lib/consolidation/fx.ts` **NEW**
   - `loadFxRates(supabase, fromCurrency, toCurrency, fiscalYear): Promise<Map<string, number>>`
   - `translatePLAtMonthlyAverage(lines, rates): XeroPLLine[]`
   - `translateBSAtClosingSpot(lines, rate): XeroBSLine[]` — exported but only used in 34.1
   - Unit tests with fixture rates

9. `src/lib/consolidation/eliminations.ts` **NEW**
   - `applyEliminations(rules, byEntity, monthKey): EliminationEntry[]`
   - `matchRuleToLines(rule, side, lines): XeroPLLine[]`
   - Unit tests: bidirectional, pattern match, single-direction, missing entity

10. `src/lib/consolidation/account-alignment.ts` **NEW**
    - `buildAlignedAccountUniverse(memberSnapshots): AlignedAccount[]`
    - Key = `${account_type}::${account_name_normalized}`
    - Missing-in-entity accounts get `$0` fillers
    - Tests verify MLTE-03

11. `src/lib/consolidation/engine.ts` **NEW**
    - `buildConsolidation(supabase, groupId, reportMonth, fiscalYear): Promise<ConsolidatedReport>`
    - Orchestrates: load → translate → align → compute entity columns → apply eliminations → combine
    - Reuses `shared.ts` for variance/subtotal math

12. `src/lib/consolidation/__fixtures__/dragon-march-2026.ts` **NEW**
    - Reference fixture: two member businesses × ~15 key accounts × 12 months, exact numbers from Matt's Dragon PDF

13. `src/lib/consolidation/__fixtures__/iict-march-2026.ts` **NEW**
    - Reference fixture: three member businesses (one NZD) × ~12 key accounts × 12 months, exact numbers from Matt's IICT PDF; FX rates for the relevant period

14. `src/lib/consolidation/engine.test.ts` **NEW**
    - "Dragon March 2026" snapshot test — consolidated output matches PDF
    - "IICT March 2026" snapshot test — FX + consolidated match PDF
    - "Eliminations diagnostic view" — every rule that fired is in the diagnostics
    - Alignment edge cases

15. `src/app/api/monthly-report/consolidated/route.ts` **NEW**
    - `POST` with `{ group_id, report_month, fiscal_year }` body
    - Auth check → verify coach has access to group's business_id → call `buildConsolidation` → return
    - Rate limit using existing `checkRateLimit` helper

16. `src/app/api/consolidation/groups/route.ts` **NEW**
    - `GET` lists consolidation groups visible to the user (relies on RLS)
    - `POST` creates new group (admin-only for V1; UI for 34.3)

17. `src/app/finances/monthly-report/hooks/useConsolidatedReport.ts` **NEW**
    - Detects if current `businessId` is a consolidation group parent; if so, uses `/api/monthly-report/consolidated`; else falls back to existing flow

18. `src/app/finances/monthly-report/components/ConsolidatedPLTab.tsx` **NEW**
    - Renders per-entity columns + Eliminations + Consolidated
    - Uses sticky first (Account Name) + sticky last (Consolidated) columns on desktop
    - Mobile toggle pills (see Open Question 3)

19. `src/app/finances/monthly-report/page.tsx` **MODIFY**
    - Add `isConsolidationGroup` detection (call `/api/consolidation/groups` lookup)
    - If true, render `ConsolidatedPLTab` alongside existing tabs
    - Existing `BudgetVsActualDashboard` etc. stays functional for same data via the Consolidated column

20. Business selector integration **MODIFY** — `src/contexts/BusinessContext.tsx` or its consumer
    - When listing businesses for selection, join `consolidation_groups` and flag rows that are group parents with a distinct visual (e.g. "📊 Dragon Consolidation" prefix)
    - Selecting such a row sets `activeBusiness.id = group.business_id` — existing monthly-report route param flow works unchanged

21. `src/app/api/cron/fx-sync/route.ts` **NEW** (optional for 34.0, required before 34.1 NZ goes live)
    - Fetch RBA F11.1 CSV or exchangerates API
    - Compute monthly average for prior month (daily rates → arithmetic mean)
    - Upsert into `fx_rates`
    - Return `{ currency_pairs_updated: ['NZD_AUD'], rates_inserted: 1 }` for log visibility

### Iteration 34.1 — Balance Sheet

22. `src/lib/consolidation/bs-engine.ts` **NEW**
    - Load BS lines per member; translate at closing spot rate
    - Apply loan elimination rules (rule_type='intercompany_loan' — extend CHECK constraint)
    - Compute CTA = sum of translation differences
    - Return per-entity BS columns + Consolidated with CTA equity line

23. `src/app/api/monthly-report/consolidated-bs/route.ts` **NEW**

24. `src/app/finances/monthly-report/components/ConsolidatedBSTab.tsx` **NEW**
    - Reuse `BalanceSheetTab` structure; add entity columns

25. Migration: `ALTER TABLE consolidation_elimination_rules ALTER CONSTRAINT rule_type_check` to include 'intercompany_loan'

### Iteration 34.2 — Cashflow

26. `src/lib/consolidation/cashflow-aggregator.ts` **NEW**
    - For each member: call existing `generateCashflowForecast` from `src/lib/cashflow/engine.ts`
    - Combine opening balances (sum), combine monthly cash movements (sum), aggregate at each line
    - Non-AUD members: translate each cash line at monthly average rate
    - Eliminations: Iteration 34.2 can be simpler (no intercompany loan cashflow eliminations — loans appear as movements in Investing/Financing; deferred decision point)

27. `src/app/api/monthly-report/consolidated-cashflow/route.ts` **NEW**

28. `src/app/finances/monthly-report/components/ConsolidatedCashflowTab.tsx` **NEW**

## Schema Proposal (exact)

```sql
-- ============================================================
-- 20260421_consolidation_groups.sql  (Iteration 34.0)
-- ============================================================

CREATE TABLE IF NOT EXISTS consolidation_groups (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   text        NOT NULL,
  business_id            uuid        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,  -- parent "umbrella" business
  presentation_currency  text        NOT NULL DEFAULT 'AUD',
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id)  -- one group per umbrella business
);

CREATE INDEX IF NOT EXISTS consolidation_groups_business_idx
  ON consolidation_groups (business_id);

CREATE TABLE IF NOT EXISTS consolidation_group_members (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id              uuid        NOT NULL REFERENCES consolidation_groups(id) ON DELETE CASCADE,
  source_business_id    uuid        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  display_name          text        NOT NULL,
  display_order         int         NOT NULL DEFAULT 0,
  functional_currency   text        NOT NULL DEFAULT 'AUD',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, source_business_id)
);

CREATE INDEX IF NOT EXISTS consolidation_group_members_group_idx
  ON consolidation_group_members (group_id, display_order);

-- RLS mirrors cfo_report_status pattern
ALTER TABLE consolidation_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE consolidation_group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "consolidation_groups_coach_all" ON consolidation_groups
  FOR ALL USING (
    business_id IN (SELECT id FROM businesses WHERE assigned_coach_id = auth.uid())
  );

CREATE POLICY "consolidation_groups_super_admin_all" ON consolidation_groups
  FOR ALL USING (
    EXISTS (SELECT 1 FROM system_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "consolidation_groups_service_role" ON consolidation_groups
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Members inherit group visibility
CREATE POLICY "consolidation_group_members_coach_all" ON consolidation_group_members
  FOR ALL USING (
    group_id IN (
      SELECT id FROM consolidation_groups
      WHERE business_id IN (SELECT id FROM businesses WHERE assigned_coach_id = auth.uid())
    )
  );

CREATE POLICY "consolidation_group_members_super_admin_all" ON consolidation_group_members
  FOR ALL USING (
    EXISTS (SELECT 1 FROM system_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "consolidation_group_members_service_role" ON consolidation_group_members
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Triggers for updated_at (reuse existing pattern)
CREATE OR REPLACE FUNCTION update_consolidation_groups_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER consolidation_groups_updated_at
  BEFORE UPDATE ON consolidation_groups
  FOR EACH ROW EXECUTE FUNCTION update_consolidation_groups_updated_at();

CREATE TRIGGER consolidation_group_members_updated_at
  BEFORE UPDATE ON consolidation_group_members
  FOR EACH ROW EXECUTE FUNCTION update_consolidation_groups_updated_at();

-- ============================================================
-- 20260421b_consolidation_elimination_rules.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS consolidation_elimination_rules (
  id                                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id                           uuid        NOT NULL REFERENCES consolidation_groups(id) ON DELETE CASCADE,
  rule_type                          text        NOT NULL CHECK (rule_type IN ('account_pair', 'account_category', 'intercompany_loan')),
  entity_a_business_id               uuid        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  entity_a_account_code              text,
  entity_a_account_name_pattern      text,
  entity_b_business_id               uuid        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  entity_b_account_code              text,
  entity_b_account_name_pattern      text,
  direction                          text        NOT NULL DEFAULT 'bidirectional'
                                                 CHECK (direction IN ('bidirectional', 'entity_a_eliminates', 'entity_b_eliminates')),
  description                        text        NOT NULL,
  active                             boolean     NOT NULL DEFAULT true,
  created_at                         timestamptz NOT NULL DEFAULT now(),
  updated_at                         timestamptz NOT NULL DEFAULT now(),

  -- Must specify at least one matcher per side
  CHECK (entity_a_account_code IS NOT NULL OR entity_a_account_name_pattern IS NOT NULL),
  CHECK (entity_b_account_code IS NOT NULL OR entity_b_account_name_pattern IS NOT NULL),

  -- Guard against regex DoS: patterns capped
  CHECK (length(coalesce(entity_a_account_name_pattern, '')) < 256),
  CHECK (length(coalesce(entity_b_account_name_pattern, '')) < 256)
);

CREATE INDEX IF NOT EXISTS consolidation_elimination_rules_group_idx
  ON consolidation_elimination_rules (group_id, active);

ALTER TABLE consolidation_elimination_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "consolidation_elimination_rules_coach_all" ON consolidation_elimination_rules
  FOR ALL USING (
    group_id IN (
      SELECT id FROM consolidation_groups
      WHERE business_id IN (SELECT id FROM businesses WHERE assigned_coach_id = auth.uid())
    )
  );

CREATE POLICY "consolidation_elimination_rules_super_admin_all" ON consolidation_elimination_rules
  FOR ALL USING (
    EXISTS (SELECT 1 FROM system_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "consolidation_elimination_rules_service_role" ON consolidation_elimination_rules
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER consolidation_elimination_rules_updated_at
  BEFORE UPDATE ON consolidation_elimination_rules
  FOR EACH ROW EXECUTE FUNCTION update_consolidation_groups_updated_at();

-- ============================================================
-- 20260421c_fx_rates.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS fx_rates (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  currency_pair   text        NOT NULL,       -- e.g. 'NZD_AUD' (from_to)
  period_month    text        NOT NULL,       -- 'YYYY-MM'
  rate_type       text        NOT NULL CHECK (rate_type IN ('monthly_average', 'closing_spot')),
  rate            numeric(12, 6) NOT NULL,    -- e.g. 0.932145
  source          text        NOT NULL DEFAULT 'rba_f11_1',
  fetched_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (currency_pair, period_month, rate_type)
);

CREATE INDEX IF NOT EXISTS fx_rates_pair_period_idx
  ON fx_rates (currency_pair, period_month);

-- Reference data; no RLS restriction, but allow service role + authenticated read
ALTER TABLE fx_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fx_rates_authenticated_read" ON fx_rates
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "fx_rates_service_role" ON fx_rates
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 20260421e_cfo_report_status_snapshot.sql
-- ============================================================

ALTER TABLE cfo_report_status
  ADD COLUMN IF NOT EXISTS snapshot_data      jsonb,
  ADD COLUMN IF NOT EXISTS snapshot_taken_at  timestamptz;

-- The full API response payload goes in snapshot_data when status → 'approved'.
-- Shape:
-- {
--   "report_type": "consolidated" | "single_entity",
--   "group_id": "...",
--   "business_id": "...",
--   "report_month": "2026-03",
--   "fiscal_year": 2026,
--   "byEntity": [...],
--   "eliminations": [...],
--   "consolidated": {...},
--   "fx_context": { "rates_used": {...}, "missing_rates": [] },
--   "generated_at": "2026-04-18T00:00:00Z",
--   "source_commit_sha": "..."
-- }
```

## API Contract Proposal

### `POST /api/monthly-report/consolidated`

**Request:**
```json
{
  "group_id": "uuid",
  "report_month": "2026-03",
  "fiscal_year": 2026
}
```

**Response:**
```json
{
  "success": true,
  "report": {
    "group_id": "uuid",
    "group_name": "Dragon Consolidation",
    "report_month": "2026-03",
    "fiscal_year": 2026,
    "presentation_currency": "AUD",
    "byEntity": [
      {
        "member_id": "uuid",
        "business_id": "uuid",
        "display_name": "Dragon Roofing Pty Ltd",
        "display_order": 0,
        "functional_currency": "AUD",
        "sections": [
          { "category": "Revenue", "lines": [ReportLine...], "subtotal": {...} },
          ...
        ],
        "gross_profit_row": {...},
        "net_profit_row": {...},
        "summary": {...}
      },
      ...
    ],
    "eliminations": [
      {
        "rule_id": "uuid",
        "rule_description": "Dragon/Easy Hail advertising transfer",
        "account_type": "opex",
        "account_name": "Advertising & Marketing",
        "amount": -9015,
        "source_entity_id": "uuid-dragon",
        "source_amount": 9015
      }
    ],
    "consolidated": {
      "sections": [...],   // same shape as byEntity[i].sections
      "gross_profit_row": {...},
      "net_profit_row": {...},
      "summary": {...}
    },
    "fx_context": {
      "rates_used": { "NZD_AUD_2026-03": 0.932145 },
      "missing_rates": []
    },
    "diagnostics": {
      "members_loaded": 2,
      "total_lines_processed": 361,
      "eliminations_applied_count": 3,
      "eliminations_total_amount": 9833,
      "processing_ms": 412
    }
  }
}
```

### `GET /api/consolidation/groups`

Returns groups visible to the current user (RLS-scoped).

## Sources

### Primary (HIGH confidence)
- `src/app/api/monthly-report/generate/route.ts` — existing single-entity report pattern to mirror `[VERIFIED]`
- `src/app/api/monthly-report/full-year/route.ts` — business ID resolution pattern `[VERIFIED]`
- `src/lib/utils/resolve-business-ids.ts` — dual-ID resolver `[VERIFIED]`
- `src/lib/cashflow/engine.ts` — cashflow engine for 34.2 aggregation `[VERIFIED]`
- `src/lib/cashflow/engine.test.ts` — vitest pattern to mirror `[VERIFIED]`
- `supabase/migrations/20260420_cfo_dashboard.sql` — RLS + trigger pattern `[VERIFIED]`
- `supabase/migrations/20260418b_cashflow_settings_tweaks.sql` — idempotent migration pattern `[VERIFIED]`
- `.planning/phases/34-dragon-multi-entity-consolidation/34-CONTEXT.md` — authoritative decisions `[VERIFIED]`
- `.planning/REQUIREMENTS.md:165–170, 274–278` — MLTE-01 through MLTE-05 `[VERIFIED]`

### Secondary (MEDIUM confidence)
- [AASB 121 — The Effects of Changes in Foreign Exchange Rates](https://www.aasb.gov.au/admin/file/content105/c9/AASB121_08-15_COMPmar20_07-21.pdf) — monthly average for P&L, closing spot for BS `[CITED]`
- [IFRS Community IAS 21](https://ifrscommunity.com/knowledge-base/ias-21-effects-of-changes-in-foreign-exchange-rates/) — practical application of translation rules `[CITED]`
- [RBA F11.1 historical CSV](https://www.rba.gov.au/statistics/tables/csv/f11.1-data.csv) — free daily AUD/NZD rates since 2023 `[CITED]`
- [exchangeratesapi.com.au](https://www.exchangeratesapi.com.au/) — commercial wrapper over RBA if paid route chosen `[CITED]`

### Tertiary (LOW confidence)
- The sequence of Phase 34's 3 iterations (34.0 / 34.1 / 34.2) vs delivering all in one — CONTEXT.md explicitly breaks them apart but the planner has discretion to reorder

## Project Constraints (from CLAUDE.md)

No `./CLAUDE.md` present in repo root at time of research. No project-wide directives to enforce beyond those already captured in existing code patterns (dual-ID resolution, RLS policies, idempotent migrations, vitest co-located tests).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — existing patterns dominate; no new libraries required
- Architecture: HIGH — view-based engine is locked by CONTEXT.md; implementation details verified against existing routes
- FX translation: MEDIUM — IAS 21 practice is clear; rate source choice (RBA CSV vs paid API) pending user preference
- Eliminations: MEDIUM — rule matching design is specified but real-world Xero edge cases (one-sided entries, journal adjustments) surface only at execution time
- Pitfalls: HIGH — catalogued from accounting fundamentals, not speculation
- Reference fixtures: MEDIUM — Matt's PDFs need to be transcribed to fixture data (mechanical but tedious); the tests built on top will be high-value

**Research date:** 2026-04-18
**Valid until:** 2026-05-18 (FX rate source decisions may shift; IAS 21 / AASB 121 interpretation is stable)
