# 47-05b ROUTE-LIST — reports/planning-data subtree (VALID-05 slice b)

Observe-mode (Option B) per-verb checklist. `routeId` = path under `src/app/api` with `/route.ts` stripped.
Classification: **WRAPPED-already** (47-02/04 — leave) · **body** (withSchema) · **query** (withQuerySchema, real fields) · **input-less** (withQuerySchema, `z.object({})`).

| # | File | routeId | Export | Classification | Wrapper | Fields (modeled) |
|---|------|---------|--------|----------------|---------|------------------|
| 1 | actions/route.ts | `actions` | GET | query | withQuerySchema | 2 — business_id, status |
| 2 | actions/route.ts | `actions` | PUT | body | withSchema | 2 — action_id, status |
| 3 | analytics/client/[id]/route.ts | `analytics/client/[id]` | GET | input-less (dynamic param only) | withQuerySchema | 0 — `z.object({})` (exempt) |
| 4 | analytics/coach/route.ts | `analytics/coach` | GET | input-less | withQuerySchema | 0 — `z.object({})` (exempt) |
| 5 | annual-plan/route.ts | `annual-plan` | GET | query | withQuerySchema | 1 — user_id |
| 6 | business-profile/route.ts | `business-profile` | GET | query | withQuerySchema | 1 — business_id |
| 7 | cfo/flag-client/route.ts | `cfo/flag-client` | POST | body | withSchema | 2 — business_id, is_cfo_client |
| 8 | cfo/report-status/route.ts | `cfo/report-status` | POST | **WRAPPED-already (47-04)** | — leave — | — |
| 9 | cfo/summaries/route.ts | `cfo/summaries` | GET | **WRAPPED-already (47-02)** | — leave — | — |
| 10 | forecast-wizard-v4/generate/route.ts | `forecast-wizard-v4/generate` | POST | body | withSchema | 9 — businessId, fiscalYear, forecastDuration, forecastId, forecastName, createNew, isDraft, assumptions, summary |
| 11 | goals/resolve-business/route.ts | `goals/resolve-business` | GET | query | withQuerySchema | 1 — business_id |
| 12 | goals/route.ts | `goals` | GET | query | withQuerySchema | 1 — business_id |
| 13 | goals/save/route.ts | `goals/save` | POST | body | withSchema | 3 — businessId, profileId, data |
| 14 | kpis/route.ts | `kpis` | GET | query | withQuerySchema | 1 — businessId |
| 15 | kpis/route.ts | `kpis` | POST | body | withSchema | 2 — businessId, kpis |
| 16 | kpis/route.ts | `kpis` | DELETE | query | withQuerySchema | 2 — kpiId, businessId |
| 17 | kpis/route.ts | `kpis` | PATCH | body | withSchema | 4 — businessId, kpiId, currentValue, notes |
| 18 | plan-snapshots/route.ts | `plan-snapshots` | POST | body | withSchema | 3 — business_id, label, step4_plan_data |
| 19 | strategic-initiatives/route.ts | `strategic-initiatives` | GET | query | withQuerySchema | 2 — business_id, annual_plan_only |
| 20 | subscription-budgets/route.ts | `subscription-budgets` | GET | query | withQuerySchema | 3 — business_id, forecast_id, active_only |
| 21 | subscription-budgets/route.ts | `subscription-budgets` | POST | body | withSchema | 3 — business_id, forecast_id, budgets |
| 22 | subscription-budgets/route.ts | `subscription-budgets` | DELETE | query | withQuerySchema | 3 — business_id, vendor_key, id |
| 23 | wizard/chat/route.ts | `wizard/chat` | POST | body | withSchema | 4 — userMessage, processData, conversationHistory, stage |

## Verb totals
- Total exports across subtree: 23 (17 files).
- Already wrapped (47-02/04), left untouched: 2 (cfo/report-status POST, cfo/summaries GET).
- To wrap this slice: 21 (8 withSchema body, 13 withQuerySchema — incl. 2 input-less exempt).

## NextRequest retention (tsc-enforced — handler uses `request.nextUrl`)
- `subscription-budgets` GET / DELETE → keep `NextRequest` (use `request.nextUrl.searchParams`).
- All other widened to `Request` (they use `new URL(request.url)` or no URL at all): annual-plan GET, cfo/flag-client POST, kpis (all verbs), plan-snapshots POST.

## Expected commit count (one per top-level subdir touched)
12 subdirs touched → up to 12 commits: actions, analytics, annual-plan, business-profile, cfo, forecast-wizard-v4, goals, kpis, plan-snapshots, strategic-initiatives, subscription-budgets, wizard.
(cfo commit only touches `cfo/flag-client` — report-status/summaries left as-is.)
