# Dual-ID — VERIFIED Active-Bug List (2026-06-13)

Independent re-check of the 41 AI-claimed active bugs against real code + prod data (read-only),
one skeptical verifier per file. Measured result: **23 confirmed-active**, 12 nuanced, 10 latent,
13 false-positive. Supersedes the magnitude (not the direction) of DUAL-ID-AUDIT.md.

---

# MEASURED Verification Report — Dual-ID Active-Bug List

## 1. Corrected Headline Count

The original audit claimed **41 "active bugs."** Independent re-check against code AND prod data reverses roughly 40% of that claim:

| Verdict | Count | What it means |
|---|---|---|
| **CONFIRMED-active** | **23** | Real, measured, firing in prod today |
| Nuanced | 12 | Real key mismatch but impact is contingent/narrow/duplicate of another finding |
| Latent | 10 | Wrong key in code, but unreachable / self-correcting / 0 bad rows in prod |
| False-positive | 13 | No bug — query keys on the correct column, or impact is fully rescued |

Note: the four buckets sum to **58**, not 41 — the re-check decomposed several original single-line "bugs" into the distinct concrete lines they actually touch (e.g. the `/api/goals/save` KPI trio at L196/203/214/221, the demo-seeder insert+teardown pairs, the coach-dashboard `useBusinessDashboard` line-127 cascade). The honest read of the original "41 active": **only 23 are genuinely active**; 35 of the verified items are NOT active (13 false-positive + 12 nuanced + 10 latent).

---

## 2. CONFIRMED-Active List (the real, measured bugs)

### Area A — Coach KPI dashboard (single root cause + its symptoms)

The whole cluster is **one defect**: `useBusinessDashboard.ts:127` assigns the coach route param (`overrideBusinessId`, a `businesses.id`) straight to `bizId` with no translation to `business_profiles.id`. Every downstream profile-keyed read on `/coach/clients/[id]/kpi` then misses. `JOIN businesses b ON b.id=p.id` returns 0 — the namespaces never coincide, so the miss is total.

| # | file:line | True impact (data evidence) | Fix |
|---|---|---|---|
| 1 | `src/app/business-dashboard/hooks/useBusinessDashboard.ts:127` | ROOT CAUSE. `bizId = businesses.id` on coach KPI page; feeds 4 profile-keyed lookups, all empty. Coach sees $0 targets / 0 KPIs / 0 snapshots for **every** client. | Translate override→`business_profiles.id` (mirror resolver at L137-142). Do NOT fall back to the raw override. |
| 2 | `...useBusinessDashboard.ts:159` (`business_financial_goals`) | `loadFinancialGoals(businesses.id)` → null → QuarterProgressCard shows $0/$0/$0 targets for all 14 clients with goals (last write 2026-06-12, data intact). Most visible symptom. | Fixed transitively by #1. |
| 3 | `...useBusinessDashboard.ts:160` (`business_kpis`) | `getUserKPIs(businesses.id)` → `[]` (55/55 rows profile-keyed). KPI fetch empty on coach page. | Fixed transitively by #1. |
| 4 | `...useBusinessDashboard.ts:178` (`weekly_metrics_snapshots`) | `getRecentSnapshots(businesses.id)` → `[]` (51/51 profile-keyed, FK→business_profiles). All QTD roll-ups compute to 0. | Fixed transitively by #1. |
| 5 | `...useBusinessDashboard.ts:185` (`weekly_metrics_snapshots`) | `getOrCreateSnapshot` select misses AND the fallback INSERT is FK-rejected → `currentSnapshot` null, page logs a create error. Not a wrong-business write (FK blocks it). | Fixed transitively by #1; optionally use a non-creating fetch on this read-only page. |

### Area B — Quarterly-review write path (active data loss)

| # | file:line | True impact (data evidence) | Fix |
|---|---|---|---|
| 6 | `src/app/quarterly-review/services/quarterly-review-service.ts:726` (`kpi_actuals`) | `saveKpiActuals` upserts `business_id = review.business_id` (= `businesses.id`). FK `kpi_actuals_business_id_fkey → business_profiles` went live 2026-06-11, so the upsert now raises a foreign_key_violation that the `// Don't throw` branch swallows → **no kpi_actuals written on review completion.** Last good write 2026-03-21. The 2026-06-11 completed review produced 0 new rows. | Resolve `business_profiles.id` (via `resolvedProfileBusinessId` / lookup on `review.business_id`) before writing. Stop swallowing the FK error — log/Sentry it. |
| 7 | `...quarterly-review-service.ts:824` (`quarterly_snapshots`) | Identical failure mode. Upsert with `businesses.id` violates `quarterly_snapshots_business_id_fkey → business_profiles`, swallowed → **no snapshot persisted on completion.** Stale since 2026-03-21. | Same as #6 — write resolved profile id; surface the error. |

### Area C — Strategic-initiatives create flow + annual plan (column-name bugs, not id-key)

These were flagged as dual-ID but are **harder bugs**: the create handlers reference columns that don't exist and omit NOT-NULL columns, so every INSERT hard-fails.

| # | file:line | True impact (data evidence) | Fix |
|---|---|---|---|
| 8 | `src/app/api/annual-plan/route.ts:103` | Filters `.eq('selected_for_annual_plan', true)` — **that column does not exist** in any table/view; real column is `selected` (296/448 true). PostgREST errors, error is discarded, `data` is null → endpoint returns `initiatives:[]`, `count:0` for **100% of users** (all 14 businesses, 1-52 selected each). Silent, no 500. | Change to `.eq('selected', true)`. Fix frontend toggle/insert + TS type. Surface the discarded error at L99. |
| 9 | `src/components/strategic-initiatives.tsx:562` (`addInitiative`) | INSERT omits NOT-NULL `business_id` + `step_type` and references 5 nonexistent columns → hard DB failure → `setError('Failed to add initiative')`. "Add Initiative" button is fully non-functional (0 rows ever created via this path). | Insert canonical `business_id = profileId`, valid `step_type`, real columns only (`source`, `selected`). |
| 10 | `...strategic-initiatives.tsx:601` (`addFromAssessment`) | Same hard INSERT failure (NOT-NULL + unknown `source_type`/`assessment_suggestion_id`). Error swallowed in catch (no setError) → silent no-op. 0 assessment-sourced rows in prod. | Same as #9; surface the error. |
| 11 | `...strategic-initiatives.tsx:634` (`addFromRoadmap`) | Same hard INSERT failure (NOT-NULL + unknown `source_type`/`roadmap_item_id`). Existing `source='roadmap'` rows came from a different/older path. | Same as #9; map roadmap identity onto an existing column. |

### Area D — Coach-facing weekly-review reads (caller passes `businesses.id`)

`weekly_reviews` is profile-keyed (42/42 rows; FK→business_profiles; namespaces disjoint, 0 collisions). Every coach-side path feeds `businesses.id` and gets 0 rows.

| # | file:line | True impact (data evidence) | Fix |
|---|---|---|---|
| 12 | `src/app/reviews/services/weekly-review-service.ts:499` (`getTeamReviewsForWeek`) | Correct from the client page; **broken from the coach Weekly Reviews tab**, which passes `clientId` (businesses.id). Coach sees empty "Submitted Reviews" for all 7 clients with reviews (Precision Electrical 15, Envisage 14, …). | Pass `businessProfileId` (already computed at coach page L319) into `WeeklyReviewsTab`, not `clientId`. Don't edit L499. |
| 13 | `...weekly-review-service.ts:553` (`getTeamReviewStatus`) | Coach completion roster always shows "0 of N complete / Not Started" for all 7 clients despite up to 15 reviews. (Also: the method's own L540 `business_users` query needs businesses.id while this reviews query needs profile.id — internally inconsistent.) | Same root fix; additionally make the method accept both ids so `business_users` and `weekly_reviews` each get the right key. |
| 14 | `src/app/coach/clients/[id]/page.tsx:449` (`weekly_reviews`) | `.eq('business_id', clientId)` (businesses.id) → 0 rows for all 8 clients with reviews. Coach client-page **activity feed silently omits all weekly-review events** (feed-only; no stat/score impact). | Use `businessProfileId` (already at L349); guard for null. Or filter by `user_id` (42/42 populated). |
| 15 | `src/app/coach/clients/[id]/page.tsx:812` (`weekly_reviews` realtime) | Realtime filter `business_id=eq.${clientId}` (businesses.id) never matches a profile-keyed row → **coach page never auto-refreshes** on client review submit. Low impact (manual refresh still loads). | Subscribe with `business_id=eq.${businessProfileId}`; add resolved profile id to effect deps. |
| 16 | `src/app/coach/dashboard/page.tsx:152` (`weekly_reviews`) | `.in('business_id', businessIds)` with businesses.id → 0 rows for all clients. Recent-activity feed always empty; "Last Weekly Review" column always null; clients doing only weekly reviews **over-flagged as inactive** ("No activity in N days"). Hits Precision Electrical, Envisage, ABC Cleaning today. | Build businesses.id→profile.id map from already-fetched `businessProfiles`, query by profile ids, re-key results back to businesses.id. Same bug on the `session_actions` leg (L187). |
| 17 | `src/app/api/coach/client-completion/route.ts:359` (`weekly_reviews`) | `.in('business_id', businessIds)` (businesses.id) → 0 rows for all 8 clients with reviews. Forces `weekly_reviews` module to `not_started`, `streak=0`, emits false "No weekly reviews" alert, **drops engagement score up to 25 pts.** Both the query AND the L611 lookup-by-`biz.id` are wrong. | Query by `profileIds` (or owner `user_id`) AND change L611 lookup to `weeklyReviewsByBusiness.get(profileId)`. Both required. |

### Area E — Analytics + Forecast features (FK / mismatch failures)

| # | file:line | True impact (data evidence) | Fix |
|---|---|---|---|
| 18 | `src/app/api/analytics/client/[id]/route.ts:66` (`business_financial_goals`) | `.eq('business_id', businessId)` where `businessId` is proven a businesses.id (access check at L27 only passes for one). Table 100% profile-keyed (14/14). Returns 0 goals → `financialProgress` chart **always empty for every client** (last write 2026-06-12). The route already resolves `ids` at L70 but never applies it to this query. | Move/reuse `resolveBusinessProfileIds` and key the goals query `.in('business_id', ids.all)`, mirroring the forecasts query at L74. |
| 19 | `src/app/finances/forecast/components/ForecastSelector.tsx:115` (`financial_forecasts`) | `handleDuplicate` inserts `business_id = businessId` (businesses.id) into a column FK-constrained to `business_profiles(id)`. No businesses.id is ever a valid profile id → **every Duplicate INSERT throws, toast error, no copy created** for all 27 clients. `loadForecasts` in the same file already does the dual-id dance. | Resolve `business_profiles.id` (mirror `loadForecasts`) before the insert. |
| 20 | `...ForecastSelector.tsx:220` (`financial_forecasts`) | `handleSetActive` deactivate-others UPDATE filters by businesses.id → **no-op** (matches 0 rows). Old active stays true; the activate-step then collides with `unique_active_forecast_per_fy` → unique_violation → toast error. **"Set as Active" silently fails** in the common multi-version case. Failing-closed (no duplicate-active corruption). | Use the resolved profile id (or `idsToTry`) in the deactivate filter. |

### Area F — Demo seeder (active mis-keys, demo-scope)

`business_kpis` (55/55 profile-keyed; `business_profile_id` column 100% NULL/dead), `weekly_reviews` (42/42 profile-keyed), `financial_forecasts` (35/35 profile-keyed) — the seeder writes `businesses.id`.

| # | file:line | True impact (data evidence) | Fix |
|---|---|---|---|
| 21 | `src/app/api/admin/demo-client/route.ts:364` (`business_kpis`) | Writes `business_id = businesses.id`; every real read filters by profile id → demo client's 10 KPIs invisible in the scorecard. The `business_profile_id` column it populates is never queried. Demo-only. | `business_id: profileId`. |
| 22 | `...demo-client/route.ts:579` (`weekly_reviews`) | Seeds `business_id = businesses.id` → reviews don't appear on the demo client's own Weekly Review page (keys by profile id). Demo-only. | `business_id: profileId` in the builder (L537). |
| 23 | `...demo-client/route.ts:588` (`financial_forecasts`) | Seeds `business_id = businesses.id` → seeded 12-month forecast won't resolve through ForecastReadService (expects profile id). Demo-only. | `business_id: profileId`. |

---

## 3. Audit Corrections (where the original audit overstated or got specifics wrong)

1. **Fabricated date — "kpi_actuals lost since 2026-04-22."** This date is invented and recurs across at least a dozen original findings. The real last write to `kpi_actuals` is **2026-03-21**; `weekly_metrics_snapshots` last wrote **2026-05-28**; `quarterly_snapshots` and `vision_targets` last wrote **2026-03-21**. No table has a 2026-04-22 write.

2. **Wrong table attribution.** The audit attributed "kpi_actuals lost" to routes/pages that **never write `kpi_actuals`** (e.g. `useBusinessDashboard`, `/api/goals/save`, the weekly-metrics service). The only path that writes `kpi_actuals` is `quarterly-review-service.ts:726` (#6).

3. **"Active" labels that are actually latent/false-positive:**
   - `/api/goals/save` KPI **delete** (L214) and **upsert** (L221) were called active data-loss. In prod **0 business_kpis rows are businesses-keyed** (55/55 profile-keyed); the delete is guarded by an always-empty SELECT and never fires; the upsert has never persisted a businesses-keyed row. → latent/false-positive, not active.
   - `useBusinessDashboard` saveSnapshot lines (L205/224/242/332) were flagged; they inherit the persisted (profile-keyed) `business_id` from the read-back row, or short-circuit when the coach path yields null. → nuanced/latent, mostly self-correcting.

4. **Mislabeled columns / wrong root cause.** Several "business_id dual-ID mismatches" actually filter on the **`user_id`** column, which is correct (100% prod match): `annual-plan/route.ts:102`, `InitiativesReviewStep.tsx:55`, `InitiativeReviewStep.tsx:106`, `coach/clients/[id]/page.tsx:651` (vision_targets). These are false-positives on the dual-ID claim. The genuinely-broken adjacent line in `annual-plan` is a **column-name** bug (`selected_for_annual_plan` doesn't exist), not an id-key bug — and the audit missed it.

5. **"Wrong-namespace write" mischaracterized as data corruption.** Multiple confirmed bugs are actually **hard FK/NOT-NULL/unique-constraint failures** that fail closed (no bad row written): `kpi_actuals`/`quarterly_snapshots` upserts (#6/#7), the three strategic-initiatives inserts (#9-11), ForecastSelector duplicate/set-active (#19/#20), `getOrCreateSnapshot` insert (#5). The audit framed these as silent cross-tenant/wrong-business writes; the schema prevents that — the real symptom is a broken feature or swallowed error, which is materially different for remediation.

6. **Demo-seeder teardown "orphan" claims.** L824/831/837/841 were flagged active-orphan; they delete by the **same** (wrong) businesses.id the matching insert used, so teardown is self-consistent — **no orphans today.** They only become active bugs *if* the paired insert is fixed without updating the delete. Must be fixed in lockstep.

7. **Over-broad blast radius.** Items like `swot/page.tsx:394` were sold as platform-wide; the failed `year_type` lookup is masked by a coincidental `'FY'` default for 13 of 14 rows, so exactly **one** client (the single `CY` row) is observably affected. Several coach-read misses are **feed/recency-only**, not stat-counter or health-score corruption.

---

## 4. Bottom Line — How Much to Trust the Remediation Roadmap's Scope

Trust the **direction**, discount the **magnitude by ~40%**. Of the 41 claimed active bugs, only **23 are genuinely active**, and those 23 collapse into roughly **8 distinct root causes** (the coach `useBusinessDashboard` L127 cascade is one fix covering 5 findings; the coach weekly-review `businesses.id`-passed-to-profile-keyed pattern is one pattern covering 6; the QR-service FK-swallow is one fix covering 2). The two highest-severity, customer-facing items — **active KPI/snapshot data-loss on quarterly-review completion (#6/#7)** and the **annual-plan/initiatives column-name breakage (#8-11)** — are real and should lead the roadmap, but note #8-11 are **not** dual-ID problems at all and need schema/column work, not id-resolution. The roadmap should be **re-scoped around root causes rather than line counts**, must add "**surface the swallowed FK/PostgREST errors**" as a cross-cutting workstream (every confirmed write-bug was hidden by a discarded error), and should **drop the 18 false-positive/nuanced/latent items** from the active backlog (track latents separately as hardening). Any cost/effort estimate built on "41 active bugs" or on the fabricated 2026-04-22 data-loss date is overstated and should be rebuilt from the corrected 23-confirmed / 8-root-cause figure.