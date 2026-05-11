# Phase 59: Forecast Seed from Prior FY - Research

**Researched:** 2026-05-11
**Domain:** Forecast wizard persistence, multi-table DB writes, seed transformation, localStorage hydration
**Confidence:** HIGH (all findings from direct code reading, no training-data guesses)

---

## Summary

Phase 59 adds a one-click "Seed FY{N+1} from FY{N}" path to the empty state. The implementation touches four distinct layers: a pure-function transformation service, a new API route, a UI extension to `ForecastEmptyState`, and a localStorage-clearing hydration handshake in the wizard.

The single most important finding is **the localStorage handshake is already solved correctly by `startFresh=true`** — this flag is passed to `useForecastWizard`, which in its `useState` initializer synchronously removes the localStorage key and calls `createInitialState`. The wizard then behaves as a fresh, API-driven load. DB-seeded `assumptions` are hydrated into wizard state not via the hook's state initializer, but through `ForecastWizardV4.tsx`'s mount-time `loadData()` async effect, which reads `forecast.assumptions` from `/api/forecast/{id}` when `state.priorYear` is missing. This chain is already exercised by the existing "Create Forecast" flow.

The atomic write path (`save_assumptions_and_materialize` RPC) must be used for 59-02, not serial UPDATE+INSERT. That RPC is the established norm for all wizard saves, enforced since Phase 44 D-12.

**Primary recommendation:** 59-01 is a pure transformer (no DB). 59-02 calls the same `save_assumptions_and_materialize` RPC used by `/api/forecast-wizard-v4/generate`. 59-03 adds a second CTA to `ForecastEmptyState`. 59-04 clears localStorage before opening the wizard (already done by `startFresh=true`). Do not reinvent any of these paths.

---

## Question-by-Question Answers (the 8 specific unknowns)

### Q1: Wizard persistence model — does `startFresh=true` clear localStorage, then hydrate from DB?

**Answer: YES, fully resolved. The handshake works in two phases.**

**Phase A — localStorage clear (synchronous, in useState initializer):**
`useForecastWizard.ts:392-402`
```typescript
if (startFresh) {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(getStorageKey(businessId, fiscalYearStart));
    } catch { /* ignore */ }
  }
  initializedRef.current = true;
  return createInitialState(fiscalYearStart, businessId);
}
```
This runs in the `useState` initializer (synchronous, before any render). The localStorage key is removed, the wizard opens with a blank `createInitialState`.

**Phase B — DB hydration (async, in ForecastWizardV4.tsx `loadData` effect):**
`ForecastWizardV4.tsx:378-493` — after the initial render, `hasRestoredData` is false (state is empty from `createInitialState`), so the wizard proceeds to the full API initialization path. The key path for seeded data:
```typescript
const priorYearMissing = !state.priorYear || ...;
if (priorYearMissing && resolvedId) {
  const forecastRes = await fetch(`/api/forecast/${resolvedId}`);
  const savedAssumptions = forecastData?.forecast?.assumptions;
  // ... reconstruct priorYear from savedAssumptions
  actionsRef.current.setPriorYear(priorYear);
}
```

**BUT**: this path only reconstructs `priorYear` (the Step 2 context display). The revenue/COGS/OpEx/team LINES are reconstructed from `assumptions` only when `setPriorYear` is called (which rebuilds those line arrays from scratch). This is correct for the seed path because the seeded `assumptions` JSONB contains `revenue.lines[].year1Monthly`, `cogs.lines[]`, `team.existingTeam[]`, `opex.lines[]` — the wizard will use those to populate Steps 3-5-6.

**Critical detail:** `ForecastWizardV4.tsx:52` passes `fiscalYear - 1` (not `fiscalYear`) as the `fiscalYearStart` parameter to `useForecastWizard`:
```typescript
const { state, actions, ... } = useForecastWizard(fiscalYear - 1, businessId, startFresh);
```
So for FY27, `fiscalYearStart=2026` and the localStorage key is `forecast-wizard-v4-{businessId}-2026`.

**Confidence: HIGH** (read directly from code).

---

### Q2: `forecast_months` JSONB key format and edge cases

**Key format: `YYYY-MM` (e.g., `"2025-07": 50000`)** — confirmed by `MonthlyData` type at `types.ts:78-80` and `generateFiscalMonthKeys()` in `fiscal-year-utils.ts:154-167`.

For AU FY (start month 7), FY2026 keys: `["2025-07", "2025-08", ..., "2026-06"]` — 12 keys.
For FY2027 keys: `["2026-07", ..., "2027-06"]`.

**Month-shift semantics for 59-01:**
The existing `remapMonthKeysToForecastYear()` at `useForecastWizard.ts:95-130` shows the established pattern: index by calendar month (`MM` string), then re-anchor onto target-year keys. This anchors by calendar month, not by positional index.

For the seed service, the shift is simpler: add 1 to the year component of every key. Example:
- `"2025-07": 50000` → `"2026-07": 50000`
- `"2026-06": 30000` → `"2027-06": 30000`

This can be implemented with a one-liner: `Object.fromEntries(Object.entries(src).map(([k, v]) => [shiftKey(k, +1), v]))` where `shiftKey` increments the year portion.

**Edge cases to handle:**
- **Sparse months:** Some forecasts may not have all 12 keys (e.g., if the operator never completed Step 3 for some lines). The shift must preserve sparsity — do not fill gaps.
- **Legacy quarterly data (`year2Quarterly`, `year3Quarterly`):** Present on `RevenueLineAssumption` and `COGSLineAssumption`. For a 1-year seed, only `year1Monthly` needs shifting. For multi-year forecasts, `year2Monthly` and `year3Monthly` also shift. The quarterly fields are legacy compat — the seed service should shift `year1Monthly`/`year2Monthly`/`year3Monthly` only; the quarterly fields are derived and the wizard does not read them for FY27 (it uses the monthly data directly from assumptions via `assumptions-to-pl-lines.ts`).
- **`forecast_pl_lines.forecast_months`:** These are the materialized monthly values (written by `save_assumptions_and_materialize`). The seed writes the shifted values here via the RPC; no special treatment needed beyond the same key-shift.
- **No "year totals" stored alongside month keys.** The JSONB objects are pure `{YYYY-MM: number}` maps. Annual totals are computed at read time, never stored in the same object.

**Confidence: HIGH.**

---

### Q3: `ForecastAssumptions` shape — what to strip, what to preserve, do absent fields crash the wizard?

**Confirmed from `types/assumptions.ts:305-339` (`ForecastAssumptions` interface):**

```typescript
export interface ForecastAssumptions {
  version: number;           // REQUIRED — copy from prior, bump is fine
  createdAt: string;         // set to now on seed
  updatedAt: string;         // set to now on seed

  industry?: string;         // preserve
  employeeCount?: number;    // preserve
  fiscalYearStart: string;   // REQUIRED — '07' for AU FY — preserve

  goals?: GoalsAssumption;   // STRIP (excluded per PHASE.md)

  revenue: RevenueAssumptions;  // REQUIRED — seed and shift
  cogs: COGSAssumptions;        // REQUIRED — seed and shift
  team: TeamAssumptions;        // REQUIRED — copy (salaries carry over, start month shifts irrelevant)
  opex: OpExAssumptions;        // REQUIRED — copy (monthlyAmounts, percentages, etc.)
  capex: CapExAssumptions;      // STRIP — set to { items: [] }

  plannedSpends?: PlannedSpend[]; // STRIP — set to [] (this IS the CapEx replacement)
  subscriptions?: SubscriptionAuditSummary; // OPTIONAL — omit; wizard loads live from DB
  priorYearByMonth?: PriorYearByMonthSnapshot; // OPTIONAL — omit; will be rebuilt on first save
}
```

**Fields to strip (set to empty/null) for the seed:**
- `goals` — explicitly excluded per PHASE.md
- `capex.items` — set `{ items: [] }`
- `plannedSpends` — set `[]`
- `subscriptions` — omit or set to a default stub; subscriptions are loaded live from `subscription_budgets` table on wizard mount (`useForecastWizard.ts:450-500`), so this field in assumptions is ignored at wizard open time
- `priorYearByMonth` — omit; will be repopulated when the wizard next saves

**Does the wizard tolerate absent optional fields?** YES. `createEmptyAssumptions()` at `types/assumptions.ts:429-461` shows that `goals`, `plannedSpends`, `subscriptions`, and `priorYearByMonth` are all either absent or default to empty. The wizard checks `savedAssumptions?.goals` with optional chaining throughout. No crash risk from absent optional sections.

**REQUIRED fields that must be present in the seeded payload:**
- `version`, `createdAt`, `updatedAt`, `fiscalYearStart`
- `revenue.lines[]`, `revenue.seasonalityPattern`, `revenue.seasonalitySource`
- `cogs.lines[]`
- `team.existingTeam[]`, `team.plannedHires[]`, `team.superannuationPct`, `team.workCoverPct`, `team.payrollTaxPct`
- `opex.lines[]`
- `capex.items[]`

**Confidence: HIGH.**

---

### Q4: `subscription_budgets` — keyed by `(business_id, vendor_key)` or `(business_id, fiscal_year)`?

**Answer: Keyed by `(business_id, vendor_key)` only. No `fiscal_year` column.**

From `subscription-budgets/route.ts:121`:
```typescript
onConflict: 'business_id,vendor_key',
```

The GET query at `route.ts:43-53` also only filters by `business_id` (and optionally `forecast_id`). There is no `fiscal_year` column on `subscription_budgets`.

**Implication for 59-02:** The seed endpoint does NOT need to insert `subscription_budgets` rows for the target FY. They already exist for the business and carry across years automatically — the wizard mount effect at `useForecastWizard.ts:450-500` fetches `GET /api/subscription-budgets?business_id=...` (no fiscal year filter) and loads whatever is there.

PHASE.md says "INSERT INTO subscription_budgets rows for target FY (copy vendor list)" — this is INCORRECT based on the schema. The `subscription_budgets` table is not year-scoped. The seed service only needs to touch `financial_forecasts.assumptions` and `forecast_pl_lines`. No subscription_budgets writes needed.

**Confidence: HIGH** (direct schema evidence from upsert conflict key and GET query shape).

---

### Q5: Existing duplicate/clone code

**Answer: No existing clone/seed/duplicate forecast implementation exists.**

Comprehensive search results:
- `page.tsx:366`: "You can still duplicate it to create new scenarios." — this is a string in a `confirm()` dialog for the lock-forecast flow. No duplicate implementation follows.
- `ForecastSelector.tsx`, `ForecastWizardV4.tsx`: no `clone` or `duplicate` functions
- `src/app/api/forecast/` routes: `[id]`, `cashflow/`, `dashboard-actuals/`, `quarterly-summary/` — none are clone/seed routes
- No `forecast-seed-service.ts` or similar file anywhere in `src/`

The mention in `page.tsx` is aspirational UI copy that was never implemented. 59-01/59-02 are new code paths.

**Confidence: HIGH.**

---

### Q6: Auth pattern for new forecast routes

**Canonical pattern (verified from 3 routes):**

1. **`/api/forecast/[id]/route.ts` (GET)** — simple auth:
   - `createRouteHandlerClient()` + `supabase.auth.getUser()` → 401 if no user
   - Dual-ID resolve (bizDirect → business_profiles fallback)
   - Check: owner OR team member (`business_users`) OR coach/admin (`system_roles`)
   - Return 403 if none match

2. **`/api/forecast/[id]/recompute/route.ts` (POST)** — cleaner pattern, use this:
   - `createRouteHandlerClient()` + `getUser()` → 401
   - Load forecast → resolve `ids` via `resolveBusinessIds(supabase, forecast.business_id)`
   - Check `businesses` row for `owner_id` and `assigned_coach_id`
   - Fallback check `business_users` (team member)
   - Fallback check `system_roles` (super_admin or coach)
   - Return 403 if none match

3. **`/api/forecast-wizard-v4/generate/route.ts` (POST)** — businessId-first pattern:
   - `createRouteHandlerClient()` + `getUser()` → 401
   - Query `businesses` by `businessId` → 403 if not found
   - Check `business.owner_id === user.id` → OK
   - Fallback: `business_users` check → OK
   - Fallback: `system_roles` coach/super_admin → OK

**For 59-02, use the generate-route pattern** (businessId comes from request body, not forecast ID). The request body is `{ businessId, targetFiscalYear }`, so the access check flows from `businessId` → `businesses` lookup → owner/team/coach.

**Important: use `resolveBusinessIds` to get `profileId`** when querying `financial_forecasts`, because `financial_forecasts.business_id` is `business_profiles.id`, not `businesses.id`.

**Confidence: HIGH.**

---

### Q7: Sentry + error response conventions post-Phase-46 (SEC-07 pattern)

**Canonical pattern** from `cron/sync-all-xero/route.ts:48-56`:
```typescript
} catch (err: any) {
  Sentry.captureException(err, {
    tags: { invariant: 'cron_sync_all_xero' },
  } as any)
  return NextResponse.json(
    { success: false, error: String(err?.message ?? err) },
    { status: 500 },
  )
}
```

**From `forecast/[id]/recompute/route.ts` (more complete, use this for 59-02):**
```typescript
Sentry.captureException(rpcError, {
  tags: { route: 'forecast/[id]/recompute' },
  extra: { context: "[forecast/recompute] Atomic recompute failed" }
} as any)
return NextResponse.json(
  { error: `Recompute failed: ${rpcError.message}`, code: rpcError.code },
  { status: 500 },
)
```

**Rules for 59-02:**
- Import `* as Sentry from '@sentry/nextjs'`
- Every `catch` block at the outer try level: `Sentry.captureException(err, { tags: { route: 'forecast/seed-from-prior' }, extra: { context: "..." } } as any)`
- Named RPC errors: log both `Sentry.captureException` AND return JSON error with the message
- Validation errors (400): return `NextResponse.json({ error: '...' }, { status: 400 })` — no Sentry needed for expected input errors
- Idempotency refusal (409): return `NextResponse.json({ error: 'Target forecast already has data. Seed refused.' }, { status: 409 })` — no Sentry

**`console.error` budget:** Phase 46 baseline is 5 `console.error` calls in `src/app/api/forecast/`. The recompute route uses 0 `console.error`. 59-02 must use 0 (Sentry only, no console.error).

**Confidence: HIGH.**

---

### Q8: localStorage key naming

**Format:** `forecast-wizard-v4-{businessId}-{fiscalYearStart}`

From `useForecastWizard.ts:178-179`:
```typescript
const getStorageKey = (businessId: string, fiscalYear: number) =>
  `forecast-wizard-v4-${businessId}-${fiscalYear}`;
```

**Important:** `fiscalYearStart` is the **calendar year the FY begins** (not the FY number). FY27 (July 2026 – June 2027) has `fiscalYearStart=2026`. This is passed as `fiscalYear - 1` from `ForecastWizardV4.tsx:52`.

So for FY27, the key is `forecast-wizard-v4-{businessId}-2026`.

**For 59-04 (localStorage clear before wizard open):** The calling code in `page.tsx` already sets `wizardStartFresh(true)` which passes `startFresh=true` to `ForecastWizardV4`, which passes it to `useForecastWizard`. The `useForecastWizard` hook's `useState` initializer synchronously removes the key. No additional clearing logic is needed in the seed flow — just pass `startFresh=true` when opening the wizard post-seed.

**Confidence: HIGH.**

---

## Standard Stack

### Internal Services (no new external dependencies)

| Service/Module | Version | Purpose | Source |
|----------------|---------|---------|--------|
| `createRouteHandlerClient` | existing | Supabase server-side client for route handlers | `@/lib/supabase/server` |
| `resolveBusinessIds` | existing | Dual-ID resolution (businesses.id ↔ business_profiles.id) | `@/lib/utils/resolve-business-ids` |
| `convertAssumptionsToPLLines` | existing | Transform ForecastAssumptions → PLLine[] for forecast_pl_lines | `@/app/finances/forecast/services/assumptions-to-pl-lines` |
| `save_assumptions_and_materialize` | existing RPC | Atomic assumptions + pl_lines write in one transaction | Supabase RPC (Phase 44 D-12) |
| `generateFiscalMonthKeys` | existing | Generate YYYY-MM keys for a fiscal year | `@/lib/utils/fiscal-year-utils` |
| `@sentry/nextjs` | existing | Error capture | Phase 46 SEC-07 standard |

**No new npm packages required.**

**Installation:**
```bash
# None — all dependencies already present
```

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── lib/services/
│   └── forecast-seed-service.ts      # 59-01 — pure transformation function
├── app/api/forecast/
│   └── seed-from-prior/
│       └── route.ts                  # 59-02 — POST endpoint
├── app/finances/forecast/components/
│   └── ForecastEmptyState.tsx        # 59-03 — add onSeedForecast prop + second CTA
└── app/finances/forecast/
    └── page.tsx                      # 59-03 + 59-04 — wire seed call + startFresh open
```

### Pattern 1: The Seed Service (59-01)

Pure function, no DB access, no side effects. Returns a transformed `ForecastAssumptions` object for the target FY.

```typescript
// src/lib/services/forecast-seed-service.ts
import type { ForecastAssumptions } from '@/app/finances/forecast/components/wizard-v4/types/assumptions'
import type { PLLine } from '@/app/finances/forecast/types'

export interface SeedResult {
  assumptions: ForecastAssumptions
  plLines: Array<{
    account_name: string
    account_code: string | null
    category: string
    subcategory?: string | null
    sort_order: number
    actual_months: Record<string, number>
    forecast_months: Record<string, number>
    is_from_xero: boolean
  }>
}

export function seedForecastFromPrior(
  priorAssumptions: ForecastAssumptions,
  priorPlLines: PLLine[],
  targetFiscalYear: number,
): SeedResult {
  // 1. Deep-clone priorAssumptions
  const next = structuredClone(priorAssumptions)

  // 2. Strip goals, capex, plannedSpends
  delete next.goals
  next.capex = { items: [] }
  next.plannedSpends = []
  delete next.subscriptions    // will be loaded live from subscription_budgets
  delete next.priorYearByMonth // will be repopulated on first wizard save

  // 3. Update metadata
  const now = new Date().toISOString()
  next.createdAt = now
  next.updatedAt = now

  // 4. Shift all forecast_months keys forward 1 year in revenue/cogs lines
  next.revenue.lines = next.revenue.lines.map(line => ({
    ...line,
    year1Monthly: shiftMonthKeys(line.year1Monthly),
    year2Monthly: line.year2Monthly ? shiftMonthKeys(line.year2Monthly) : undefined,
    year3Monthly: line.year3Monthly ? shiftMonthKeys(line.year3Monthly) : undefined,
    // zero out legacy quarterly (they are derived; not read by assumptions-to-pl-lines)
    year2Quarterly: undefined,
    year3Quarterly: undefined,
  }))

  next.cogs.lines = next.cogs.lines.map(line => ({
    ...line,
    year1Monthly: line.year1Monthly ? shiftMonthKeys(line.year1Monthly) : undefined,
    year2Monthly: line.year2Monthly ? shiftMonthKeys(line.year2Monthly) : undefined,
    year3Monthly: line.year3Monthly ? shiftMonthKeys(line.year3Monthly) : undefined,
  }))

  // 5. Shift pl_lines forecast_months (for direct DB write alongside assumptions)
  const shiftedPlLines = priorPlLines
    .filter(l => l.category !== 'CapEx' && l.category !== 'Goals')
    .map((line, i) => ({
      account_name: line.account_name,
      account_code: line.account_code ?? null,
      category: line.category,
      subcategory: line.subcategory ?? null,
      sort_order: line.sort_order ?? i,
      actual_months: {},  // actuals don't carry forward
      forecast_months: shiftMonthKeys(line.forecast_months || {}),
      is_from_xero: line.is_from_xero || false,
    }))

  return { assumptions: next, plLines: shiftedPlLines }
}

function shiftMonthKeys(src: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(src).map(([key, val]) => {
      // key = "YYYY-MM"; add 1 to the year portion
      const year = parseInt(key.slice(0, 4), 10) + 1
      return [`${year}-${key.slice(5)}`, val]
    })
  )
}
```

### Pattern 2: API Route (59-02)

Mirrors `/api/forecast/[id]/recompute` for auth and `/api/forecast-wizard-v4/generate` for the atomic RPC save.

```typescript
// src/app/api/forecast/seed-from-prior/route.ts
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { resolveBusinessIds } from '@/lib/utils/resolve-business-ids'
import { seedForecastFromPrior } from '@/lib/services/forecast-seed-service'
import * as Sentry from '@sentry/nextjs'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const supabase = await createRouteHandlerClient()

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { businessId, targetFiscalYear } = body

    if (!businessId || !targetFiscalYear) {
      return NextResponse.json(
        { error: 'businessId and targetFiscalYear are required' },
        { status: 400 }
      )
    }

    // Auth — same pattern as generate/route.ts
    const { data: business } = await supabase
      .from('businesses')
      .select('id, owner_id')
      .eq('id', businessId)
      .maybeSingle()

    // ... (owner / team / coach checks)

    // Dual-ID resolve for financial_forecasts queries
    const ids = await resolveBusinessIds(supabase, businessId)

    // Load prior FY forecast
    const priorFY = targetFiscalYear - 1
    const { data: priorForecast } = await supabase
      .from('financial_forecasts')
      .select('id, assumptions, fiscal_year')
      .in('business_id', ids.all)
      .eq('fiscal_year', priorFY)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!priorForecast?.assumptions) {
      return NextResponse.json(
        { error: `No prior FY${priorFY} forecast found` },
        { status: 404 }
      )
    }

    // Load target FY forecast (must exist — getOrCreateForecast ran on page load)
    const { data: targetForecast } = await supabase
      .from('financial_forecasts')
      .select('id, assumptions, forecast_start_month, forecast_end_month, forecast_duration')
      .in('business_id', ids.all)
      .eq('fiscal_year', targetFiscalYear)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!targetForecast) {
      return NextResponse.json(
        { error: `No FY${targetFiscalYear} forecast row found. Visit the page first.` },
        { status: 404 }
      )
    }

    // Idempotency check — refuse if target has non-default data
    const targetHasData = await checkTargetHasData(supabase, targetForecast.id)
    if (targetHasData) {
      return NextResponse.json(
        { error: 'Target forecast already has data. Seed refused.' },
        { status: 409 }
      )
    }

    // Load prior pl_lines
    const { data: priorPlLines } = await supabase
      .from('forecast_pl_lines')
      .select('*')
      .eq('forecast_id', priorForecast.id)
      .order('sort_order', { ascending: true })

    // Transform
    const { assumptions: seededAssumptions, plLines } = seedForecastFromPrior(
      priorForecast.assumptions,
      priorPlLines || [],
      targetFiscalYear,
    )

    // Atomic write via existing RPC
    const { error: rpcError } = await supabase.rpc(
      'save_assumptions_and_materialize',
      {
        p_forecast_id: targetForecast.id,
        p_assumptions: seededAssumptions,
        p_pl_lines: plLines,
      }
    )

    if (rpcError) {
      Sentry.captureException(rpcError, {
        tags: { route: 'forecast/seed-from-prior' },
        extra: { context: '[forecast/seed-from-prior] RPC failed' }
      } as any)
      return NextResponse.json(
        { error: `Seed failed: ${rpcError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, forecastId: targetForecast.id })
  } catch (err) {
    Sentry.captureException(err, {
      tags: { route: 'forecast/seed-from-prior' },
      extra: { context: '[forecast/seed-from-prior] Unexpected error' }
    } as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

### Pattern 3: Idempotency Check

The idempotency gate for 59-02 must distinguish "auto-created empty row" from "operator has data." The cleanest signal:

```typescript
async function checkTargetHasData(supabase: any, forecastId: string): Promise<boolean> {
  // Check if assumptions JSONB has non-empty revenue lines (the canonical
  // indicator that a wizard save has occurred for this forecast)
  const { data: forecast } = await supabase
    .from('financial_forecasts')
    .select('assumptions')
    .eq('id', forecastId)
    .maybeSingle()

  const assumptions = forecast?.assumptions
  if (!assumptions) return false

  // Non-default if revenue lines exist
  const revenueLines = assumptions?.revenue?.lines ?? []
  if (revenueLines.length > 0) return true

  // Also check forecast_pl_lines for any non-zero values
  const { count } = await supabase
    .from('forecast_pl_lines')
    .select('id', { count: 'exact', head: true })
    .eq('forecast_id', forecastId)
    .gt('sort_order', -1)

  return (count ?? 0) > 0
}
```

**Note from PHASE.md:** "existing JDS FY27 record (auto-created by getOrCreateForecast after Chunk 1 shipped) may have empty pl_lines but a non-empty assumptions row from a prior visit." The idempotency check above handles this — if the operator visited FY27 and the wizard saved default goals (empty revenue.lines), the check will see `revenueLines.length === 0` and allow seed. Only a real wizard save (which always generates at least 1 revenue line) will block.

### Pattern 4: Empty State UI (59-03)

`ForecastEmptyState` already has `priorFiscalYearWithForecast` and `onSwitchFiscalYear` props (added in Phase 58). For 59-03, add:

```typescript
// New props
onSeedForecast?: () => void
isSeedingForecast?: boolean
```

When `priorFiscalYearWithForecast` is set AND `onSeedForecast` is provided, replace the existing "Start FY{target} Forecast" button with two side-by-side buttons:
- Primary (brand-orange): "Seed from FY{prior}" with Sparkles icon
- Secondary (outline): "Start FY{target} blank"

The existing `onCreateForecast` prop handles the blank path. Keep that prop.

### Pattern 5: Wizard Open After Seed (59-04)

In `page.tsx`, the seed click handler:

```typescript
const handleSeedForecast = async () => {
  setIsSeedingForecast(true)
  try {
    const res = await fetch('/api/forecast/seed-from-prior', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        businessId,
        targetFiscalYear: selectedFiscalYear || forecast.fiscal_year,
      }),
    })
    if (!res.ok) {
      const { error } = await res.json()
      toast.error(error || 'Seed failed')
      return
    }
    // Clear localStorage for target FY before opening wizard
    // startFresh=true will do this atomically in useForecastWizard's useState initializer
    setSelectedForecastId(forecast.id)      // the target FY forecast row
    setWizardStartFresh(true)               // THIS is what clears localStorage + triggers DB hydration
    setShowWizardV4(true)
  } finally {
    setIsSeedingForecast(false)
  }
}
```

**The `startFresh=true` flag is the only change needed for 59-04.** No additional localStorage clearing code is required because `useForecastWizard`'s `useState` initializer already does it (see Q1 answer above).

### Anti-Patterns to Avoid

- **Do not call `setPriorYear` directly with seeded data.** The wizard hydrates from `forecast.assumptions` via the `ForecastWizardV4` mount effect. Calling `setPriorYear` bypasses the month-shift and rebuilds lines from scratch.
- **Do not use serial UPDATE + INSERT for forecast_pl_lines.** Always use `save_assumptions_and_materialize` RPC. Serial writes can fail silently (the assumption saves but pl_lines fail, leaving the forecast in a broken state).
- **Do not write to `subscription_budgets` from the seed endpoint.** The table is not year-scoped; existing rows carry forward automatically.
- **Do not re-use `forecast-service.ts`'s `savePLLines` method.** That method uses a non-atomic upsert; for the seed, use the RPC.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic assumptions + pl_lines write | Custom UPDATE + bulk INSERT | `save_assumptions_and_materialize` RPC | Already exists; serial writes have silent-failure risk (Phase 44 D-12) |
| Month key generation for target FY | Custom date arithmetic | `generateFiscalMonthKeys(targetFY, yearStartMonth)` from `fiscal-year-utils.ts` | Already handles AU FY vs CY, year boundary logic |
| Assumptions → pl_lines conversion | Custom line generator | `convertAssumptionsToPLLines()` from `assumptions-to-pl-lines.ts` | Handles revenue/COGS/team/opex including multi-year expansion, team exclusion from opex |
| Dual business ID resolution | Manual two-table joins | `resolveBusinessIds()` from `resolve-business-ids.ts` | Returns `{ bizId, profileId, all[] }` — financial_forecasts needs profileId |
| localStorage clear before wizard | `localStorage.removeItem(...)` in page.tsx | Pass `startFresh=true` to `ForecastWizardV4` | The hook's `useState` initializer does it synchronously before any render |

**Key insight:** `convertAssumptionsToPLLines` already knows how to read `assumptions.revenue.lines[].year1Monthly` and write it to `forecast_months`. The seed can use this function directly — pass it the seeded assumptions and let it generate pl_lines, rather than shifting the pl_lines separately. This avoids duplicating the conversion logic. The pl_lines coming from `convertAssumptionsToPLLines` will already have the shifted month keys because the assumptions were shifted by `seedForecastFromPrior` first.

**Revised 59-01 architecture:** `seedForecastFromPrior` returns only the transformed `ForecastAssumptions`. The 59-02 API route then calls `convertAssumptionsToPLLines(seededAssumptions, ...)` to generate the pl_lines payload, exactly as the generate route does. This is simpler and reuses tested code.

---

## Common Pitfalls

### Pitfall 1: localStorage Stale Data After Seed

**What goes wrong:** If the client opens FY27, the wizard auto-saves a minimal state to localStorage (even just viewing step 1). Then the seed runs server-side and writes to the DB. When the wizard opens again without clearing localStorage, it reads the stale minimal state from localStorage and ignores the seeded DB data.

**Why it happens:** `useForecastWizard`'s `useState` initializer prefers localStorage over empty state. The seeded data only exists in `financial_forecasts.assumptions` (DB), not localStorage.

**How to avoid:** Always pass `startFresh=true` when opening the wizard after a seed. This synchronously removes the localStorage key in the `useState` initializer before any render.

**Warning signs:** Wizard opens on step 1 with empty revenue lines despite a successful seed API response. Check: does `wizardStartFresh` get set to `true` before `showWizardV4=true`?

### Pitfall 2: Month-Key Shift Off-By-One for CY (calendar-year) Businesses

**What goes wrong:** For AU FY businesses (yearStartMonth=7), FY26 keys are `2025-07..2026-06`, FY27 keys are `2026-07..2027-06`. Adding 1 to the year of each key works correctly. But for a CY business (yearStartMonth=1), FY2026 keys are all `2026-MM`. A simple +1 gives `2027-MM`, which is correct.

**There is no off-by-one risk in the shift itself.** The shift is symmetric: add 1 to the year portion of every `YYYY-MM` key.

**The actual risk** is if the prior FY assumptions contain keys outside the expected 12-month window (e.g., a malformed 24-month key set from a multi-year forecast saved under a bug). The shift function should validate: only shift keys that match `YYYY-MM` format; ignore others.

**How to avoid:** `shiftMonthKeys` should validate with a regex: `/^\d{4}-\d{2}$/`.

### Pitfall 3: `financial_forecasts.business_id` is `business_profiles.id`, Not `businesses.id`

**What goes wrong:** The seed route receives `businessId` (which is `businesses.id` from the frontend). Querying `financial_forecasts.business_id = businessId` returns 0 rows because the FK is to `business_profiles.id`.

**How to avoid:** Always call `resolveBusinessIds(supabase, businessId)` and use `.in('business_id', ids.all)` for `financial_forecasts` queries. Or use `ids.profileId` for a direct single-value match. Same pattern used in the generate route.

### Pitfall 4: Idempotency Check Incorrectly Blocking Reseed

**What goes wrong:** The idempotency check rejects a seed because the target forecast row has a non-null `assumptions` with some default goals (goals are written by the one-page-plan section, which runs independently). The check then refuses the seed even though revenue lines are empty.

**How to avoid:** The idempotency check must specifically look at `assumptions.revenue.lines.length > 0` (the indicator that a wizard save has populated real data) and/or `forecast_pl_lines` count. Do not check `assumptions !== null` — that will block legitimate seeds.

### Pitfall 5: `convertAssumptionsToPLLines` Requires `forecastStartMonth` and `forecastEndMonth`

**What goes wrong:** When calling `convertAssumptionsToPLLines` with the seeded assumptions, the `ConvertContext` requires `forecastStartMonth` and `forecastEndMonth` strings. These live on `financial_forecasts.forecast_start_month` and `forecast_end_month` columns.

**How to avoid:** Load these from the target forecast row in 59-02. The `getOrCreateForecast` flow already sets them via `calculateForecastPeriods()` when the forecast row is created/updated.

---

## Code Examples

### Month Key Shift Function

```typescript
// Source: derived from useForecastWizard.ts:95-130 (remapMonthKeysToForecastYear pattern)
// and generateFiscalMonthKeys in fiscal-year-utils.ts

function shiftMonthKeys(
  src: Record<string, number> | undefined,
  yearDelta: number = 1
): Record<string, number> {
  if (!src) return {}
  const result: Record<string, number> = {}
  for (const [key, val] of Object.entries(src)) {
    // Validate format
    if (!/^\d{4}-\d{2}$/.test(key)) continue
    const year = parseInt(key.slice(0, 4), 10) + yearDelta
    result[`${year}-${key.slice(5)}`] = val
  }
  return result
}
```

### Assumptions Strip Function

```typescript
// Source: types/assumptions.ts — ForecastAssumptions interface
function stripAndPrepareAssumptions(
  prior: ForecastAssumptions,
  targetFY: number,
): ForecastAssumptions {
  const next = structuredClone(prior)
  const now = new Date().toISOString()

  // Strip excluded sections
  delete next.goals
  next.capex = { items: [] }
  next.plannedSpends = []
  delete next.subscriptions    // loaded live from subscription_budgets on wizard mount
  delete next.priorYearByMonth // rebuilt on first wizard save

  // Update metadata
  next.createdAt = now
  next.updatedAt = now

  // Shift revenue line monthly data
  next.revenue.lines = next.revenue.lines.map(line => ({
    ...line,
    year1Monthly: shiftMonthKeys(line.year1Monthly),
    year2Monthly: shiftMonthKeys(line.year2Monthly),
    year3Monthly: shiftMonthKeys(line.year3Monthly),
    year2Quarterly: undefined,
    year3Quarterly: undefined,
  }))

  // Shift COGS line monthly data
  next.cogs.lines = next.cogs.lines.map(line => ({
    ...line,
    year1Monthly: shiftMonthKeys(line.year1Monthly),
    year2Monthly: shiftMonthKeys(line.year2Monthly),
    year3Monthly: shiftMonthKeys(line.year3Monthly),
  }))

  // team and opex: no month-key shifting needed (they use percentages/amounts,
  // not explicit month keys in assumptions). team.plannedHires[].startMonth
  // DOES need shifting — see note below.

  return next
}

// NOTE: team.plannedHires[].startMonth is a "YYYY-MM" key (PlannedHire.startMonth).
// If prior FY had a planned hire starting in "2026-10", the seed should either:
//   a) Clear plannedHires entirely (hire plans don't carry forward — recommended)
//   b) Shift startMonth by +1 year
// RECOMMENDED: clear plannedHires. The operator should add new hires manually
// for the new FY. Team members (existingTeam) carry forward; planned hires do not.
```

### Auth Pattern for 59-02

```typescript
// Source: /api/forecast-wizard-v4/generate/route.ts:38-79
// Canonical pattern for businessId-first auth

const { data: business, error: bizError } = await supabase
  .from('businesses')
  .select('id, owner_id')
  .eq('id', businessId)
  .maybeSingle()

if (bizError || !business) {
  return NextResponse.json(
    { error: 'Business not found or access denied' },
    { status: 403 }
  )
}

const isOwner = business.owner_id === user.id
if (!isOwner) {
  const { data: teamMember } = await supabase
    .from('business_users')
    .select('id')
    .eq('business_id', businessId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()

  if (!teamMember) {
    const { data: roleData } = await supabase
      .from('system_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle()

    const isCoachOrAdmin = roleData?.role === 'coach' || roleData?.role === 'super_admin'
    if (!isCoachOrAdmin) {
      return NextResponse.json(
        { error: 'Business not found or access denied' },
        { status: 403 }
      )
    }
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| Serial UPDATE assumptions + INSERT pl_lines | `save_assumptions_and_materialize` RPC (atomic) | Phase 44 D-12 | Silent-failure hole closed. 59-02 MUST use the RPC. |
| `getUser()` called after business access check | `getUser()` first, business check second | Phase 46 | Prevents information leakage — 401 before 403 |
| `console.error` in API routes | `Sentry.captureException` only | Phase 46 SEC-07 | 59-02 must use Sentry, zero console.error |
| Positional month key remapping | Calendar-month-anchored remap | Phase 56 P0-18 | FY switch mid-flow no longer corrupts seasonal shape |
| `setPriorYear` on every wizard mount | `setPriorYearDisplay` for display refreshes | Phase 56 P0-3 | Preserves operator customizations in Steps 3/5/6 |

**Deprecated/outdated:**
- `forecast-service.ts`'s `savePLLines`: non-atomic upsert, correct for edit flows but not for the seed's "replace all" semantics. Use RPC instead.
- Legacy `year2Quarterly`/`year3Quarterly` fields on assumptions: kept for back-compat but not needed for new saves. The seed should omit them.

---

## Open Questions for Plan

1. **Should `plannedHires` be cleared or shifted?**
   - What we know: `PlannedHire.startMonth` is a `YYYY-MM` key that would need shifting if carried forward.
   - What's unclear: should FY27 inherit FY26's planned hire schedule (shifted by 1 year) or start clean?
   - Recommendation: clear `plannedHires = []` for the seed. Planned hires are forward-looking; they don't carry from last year's plan. The operator adds new hires in Step 4.

2. **Should the wizard open on step 1 or step 3 after a seed?**
   - The PHASE.md says "opens the wizard with the seeded forecast loaded" without specifying a step.
   - Recommendation: open on step 3 (Revenue & COGS) so the operator immediately sees the seeded values. Pass `initialStep={3}` when calling `setWizardStartStep(3)` before opening.
   - This is a UI decision that doesn't affect the service or API.

3. **Multi-year forecast handling in the seed.**
   - What we know: prior FY forecast may be a 1yr, 2yr, or 3yr forecast. The `forecast_duration` column records this.
   - What's unclear: should the seed produce a 3yr forecast for the target FY even if the prior was 1yr?
   - Recommendation: copy `forecast_duration` from the prior forecast. The operator can change it in step 1.

4. **`expectedMonths` in adhoc OpEx lines after shift.**
   - `OpExLineAssumption.expectedMonths: string[]` contains `YYYY-MM` keys for adhoc expenses.
   - These must also be shifted by +1 year, otherwise the adhoc schedule references months in the prior FY.
   - This is a code correctness issue to flag for 59-01 implementation. Add: `expectedMonths: line.expectedMonths?.map(m => shiftKey(m))`.

---

## Sources

### Primary (HIGH confidence)
- `src/app/finances/forecast/components/wizard-v4/useForecastWizard.ts` — localStorage key format (line 178), startFresh clear (lines 392-402), mount-time hydration chain
- `src/app/finances/forecast/components/wizard-v4/ForecastWizardV4.tsx` — `fiscalYear - 1` param (line 52), mount effect DB hydration (lines 378-493)
- `src/app/finances/forecast/components/wizard-v4/types/assumptions.ts` — `ForecastAssumptions` interface (lines 305-339), `createEmptyAssumptions` (lines 429-461)
- `src/app/finances/forecast/components/wizard-v4/types.ts` — `MonthlyData` type (lines 78-80), `ForecastWizardState` shape
- `src/app/api/subscription-budgets/route.ts` — conflict key `business_id,vendor_key` (line 121), no fiscal_year column
- `src/app/api/forecast-wizard-v4/generate/route.ts` — auth pattern (lines 38-79), `save_assumptions_and_materialize` call (lines 204-211)
- `src/app/api/forecast/[id]/recompute/route.ts` — Sentry pattern (lines 151-153, 173-177), access check pattern (lines 70-108)
- `src/app/api/cron/sync-all-xero/route.ts` — SEC-07 Sentry template (lines 48-56)
- `src/lib/utils/fiscal-year-utils.ts` — `generateFiscalMonthKeys` (lines 154-167), key format confirmed
- `src/lib/utils/resolve-business-ids.ts` — dual-ID shape confirmed, `profileId` for `financial_forecasts`
- `src/app/finances/forecast/services/assumptions-to-pl-lines.ts` — `convertAssumptionsToPLLines` interface, `ConvertContext` requirements

### Secondary (MEDIUM confidence)
- `src/app/finances/forecast/page.tsx` — seed mention is a UI copy string only; no implementation (lines 366, 472-490)
- `src/app/finances/forecast/components/ForecastEmptyState.tsx` — existing props confirmed (`priorFiscalYearWithForecast`, `onSwitchFiscalYear`, `onCreateForecast`)

---

## Metadata

**Confidence breakdown:**
- Wizard persistence model: HIGH — read useForecastWizard.ts + ForecastWizardV4.tsx directly
- Month-key format: HIGH — generateFiscalMonthKeys confirms YYYY-MM
- Assumptions shape: HIGH — types/assumptions.ts is definitive
- subscription_budgets key: HIGH — upsert conflict key is `business_id,vendor_key`
- Existing clone code: HIGH — comprehensive search, none found
- Auth pattern: HIGH — verified across 3 routes
- Sentry pattern: HIGH — two confirmed examples
- localStorage key: HIGH — `getStorageKey` function read directly

**Research date:** 2026-05-11
**Valid until:** 2026-06-11 (stable domain — wizard version is 11, no active churn on these files)
