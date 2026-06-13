# Dual-ID Key-Mismatch Audit — System-Wide (2026-06-13)

**Trigger:** Phase 73 Precision dry-run caught the annual-reset services reading
business_kpis/strategic_initiatives by businesses.id; Matt asked to check the whole system.
**Method:** multi-agent fan-out over every profile-keyed table + adversarial verification.

**Scope:** 156 call sites examined · **41 active bugs** · 38 latent · 1 cosmetic.
Canonical key for all audited tables = `business_profiles.id` (verified: disjoint UUID namespaces, 0 collisions).

---

# Dual-ID Key-Mismatch Audit — Final Report

**Canonical key for all audited tables: `business_profiles.id`.** Two disjoint UUID namespaces (`businesses.id` vs `business_profiles.id`, 0 collisions across 27 businesses / 27 profiles). Most affected columns are `text` with no FK, so wrong-key reads silently return 0 rows and wrong-key writes silently split data — except where Phase A FK migration `20260611010000` is now live (`weekly_reviews`, `kpi_actuals`, `financial_forecasts`, `weekly_metrics_snapshots`, `quarterly_snapshots`, `vision_targets`, `strategic_initiatives`), where a wrong-key write is now a hard FK violation.

---

## ACTIVE BUGS (broken for real clients today)

These return 0 rows or write orphaned/FK-violating data on a path real clients exercise now.

### Coach KPI / weekly-metrics dashboard — root cause (one fix cures 11 sites)
| Table | File:Line | What's wrong | Impact | Fix |
|---|---|---|---|---|
| weekly_metrics_snapshots | `src/app/business-dashboard/hooks/useBusinessDashboard.ts:127` | `bizId = overrideBusinessId` assigned with NO translation (override branch bypasses the resolveBusinessId translation at L137-142) | Coach KPI page passes `[id]` route param (a businesses.id); every snapshot read filters business_id=businesses.id → 0 rows → coach sees all-zero QTD revenue/GP/NP for every client. Inserts silently create rows under businesses.id (hard FK violation once 20260611010000 applies). | Look up `business_profiles.id` by `.eq('business_id', overrideBusinessId)` and assign that to `bizId`; render empty state if no profile (do NOT fall back to overrideBusinessId). Fixes the 11 downstream snapshot read/insert sites (hook 178/185/205/224/242, service 173/192/249/276). |
| business_kpis | `src/app/business-dashboard/hooks/useBusinessDashboard.ts:160` & `:332` | Same `bizId` (coach override path) flows into `getUserKPIs` | Coach KPI view → 0 KPI rows; owner self-view OK | Resolved by the L127 translation fix above. |
| business_financial_goals | `src/app/goals/services/financial-service.ts:166` (caller `useBusinessDashboard.ts`) | Coach-override branch passes businesses.id straight to `loadFinancialGoals` | financialData/coreMetrics load empty on the coach-viewing-client dashboard | Same L127 caller fix; service itself is correct. |

### business_kpis — coach-save core bug
| Table | File:Line | What's wrong | Impact | Fix |
|---|---|---|---|---|
| business_kpis | `src/app/api/goals/save/route.ts:203` (R), `:214` (delete), `:221` (upsert) | All three key on `kpiBusinessId = businessId` (= body.businessId = businesses.id) instead of `saveProfileId` (already in scope, L100) | Coach Goals-Wizard save: existing-KPI read returns empty (55/55 prod rows are profile.id), reconcile delete targets empty partition (stale KPIs persist), upsert writes under businesses.id → orphaned from every read. | Use `saveProfileId` at all three sites (set `business_id: saveProfileId` in `kpisToUpsert`). |
| business_kpis | `src/app/goals/hooks/useStrategicPlanning.ts:467` (owner save) & `:323` (coach save body) | `kpiBusinessId = businessesId \|\| businessId`; `businessesId` (businesses.id) is always populated so the profile.id fallback never fires | Owner/coach KPI saves write under businesses.id, orphaned from all reads | Owner (L467): pass `businessId` (profile.id) to `saveUserKPIs`, drop the businessesId preference. Coach (L323): cleanest fix is the route fix above (use `saveProfileId`); no client change strictly required. |

### business_kpis — demo seed (renders nothing)
| Table | File:Line | What's wrong | Impact | Fix |
|---|---|---|---|---|
| business_kpis | `src/app/api/admin/demo-client/route.ts:364` (seed) & `:841` (teardown) | Seed writes `business_id: businessId` (businesses.id); profileId lands only in secondary col. Teardown deletes by the same wrong key. | Seeded demo KPIs invisible to every coach/owner read; teardown only "works" because both are equally wrong. | Seed: `business_id: profileId` (L222). Teardown: `.eq('business_id', profileId)` — fix in lockstep. |

### strategic_initiatives — user_id-keyed reads/writes on a profile-keyed table
| Table | File:Line | What's wrong | Impact | Fix |
|---|---|---|---|---|
| strategic_initiatives | `src/components/strategic-initiatives.tsx:562`, `:601`, `:634` (writes) | `insert({ user_id, ... })` with NO business_id at all (addInitiative / addFromAssessment / addFromRoadmap) | **Most damaging defect:** nothing created via the `/strategic-initiatives` UI is ever visible to the profile.id-keyed One Page Plan / Goals / Quarterly Review reads. | Set `business_id = profile.id` on insert; backfill user_id-only rows in R14. |
| strategic_initiatives | `src/components/strategic-initiatives.tsx:201` (read) | `.eq('user_id', ownerId\|\|user.id)` on profile-keyed table | `/strategic-initiatives` list empty for clients keyed on profile.id; only legacy user_id rows surface | Resolve profile.id and read `business_id = profile.id`. |
| strategic_initiatives | `src/app/api/annual-plan/route.ts:102` (read) | `.eq('user_id', userId)` with no business_id fallback | initiatives_count / initiatives[] empty for real clients (448/448 rows are profile-keyed) | Resolve profile.id (handler already fetched business_profiles at L63-67) and query `business_id = profile.id`. |
| strategic_initiatives | `src/app/quarterly-review/components/steps/InitiativesReviewStep.tsx:55` & `InitiativeReviewStep.tsx:106` (reads) | `.eq('user_id', activeBusiness?.ownerId\|\|user.id)` on profile-keyed table | QR initiatives-changes and active-initiatives steps render empty for real clients | Query `business_id = profile.id`. |

### business_financial_goals — raw businesses.id reads, no resolution
| Table | File:Line | What's wrong | Impact | Fix |
|---|---|---|---|---|
| business_financial_goals | `src/app/api/analytics/client/[id]/route.ts:66` (read) | `.eq('business_id', businessId)` where businessId is verified businesses.id (L30); no fallback. Same file already resolves profile ids for forecasts at L70-74. | financialProgress chart permanently empty for every client | Move `resolveBusinessProfileIds(...)` (already at L70) above L63; use `.in('business_id', ids.all)` (matching forecasts). |
| business_financial_goals | `src/app/swot/page.tsx:394` (read) | `.eq('business_id', getSwotBusinessId(user.id))` — helper only ever returns user_id/businesses.id, never profile.id | Read returns 0 → year_type defaults to 'FY' → SWOT quarter labels wrong for every CY client | Look up `business_profiles.id` and use it for the goals read; keep the SWOT helper only for swot_analyses. |

### weekly_reviews — coach views & demo seed (post-FK now hard errors)
| Table | File:Line | What's wrong | Impact | Fix |
|---|---|---|---|---|
| weekly_reviews | `src/app/reviews/services/weekly-review-service.ts:499` & `:553` (reads) | `.eq('business_id', businessId)` where coach caller passes clientId (businesses.id) | Coach Weekly Reviews tab shows no submissions / all "Not Started" for real clients (owner path OK) | Resolve clientId→profile.id at `coach/clients/[id]/page.tsx:1316`. Note L553 (`getTeamReviewStatus`) needs BOTH: business_users is businesses.id-keyed, weekly_reviews is profile.id-keyed — pass a separate profileId param. |
| weekly_reviews | `src/app/coach/clients/page.tsx:167`, `coach/clients/[id]/page.tsx:449` & `:812` (realtime), `coach/dashboard/page.tsx:152` | `.in/.eq('business_id', …)` built from `.from('businesses')` ids | "latest completed weekly review" signal always empty; client-file recent-activity feed empty; realtime never fires (no auto-refresh) | Build businesses.id→profile.id map; query weekly_reviews with profileIds; realtime filter `business_id=eq.${profileId}`. |
| weekly_reviews | `src/app/api/coach/client-completion/route.ts:359` (read) | Uses `businessIds` while adjacent profile tables correctly use `profileIds`; lookup via `weeklyReviewsByBusiness.get(biz.id)` | weekly_reviews completion module permanently not_started/0 for every client | Query `.in('business_id', profileIds)` and look up by profile id — mirror the strategic_initiatives/financial_forecasts handling in the same file. |
| weekly_reviews | `src/app/api/admin/demo-client/route.ts:579` (insert) | Two defects: business_id=businesses.id AND wrong schema (`week_start`/`status`/`data` columns don't exist; real cols are `week_start_date`/`week_end_date`/`is_completed`) | Insert fails at the DB; demo client shows no weekly reviews | Rewrite to real schema: `business_id: profileId`, `week_start_date`/`week_end_date`, `is_completed`, flat fields. Schema fix is mandatory — id fix alone is insufficient. |

### vision_targets — coach activity feed
| Table | File:Line | What's wrong | Impact | Fix |
|---|---|---|---|---|
| vision_targets | `src/app/coach/clients/[id]/page.tsx:651` (read) | `.eq('user_id', effectiveUserId)`; production writes set only `business_id` (user_id is NULL for real clients) | "Updated Vision targets" activity card never appears for any real client | `.eq('business_id', businessProfileId)` — businessProfileId already in scope (L349). |

### quarterly_snapshots & kpi_actuals — workshop completion silently drops data (FK live)
| Table | File:Line | What's wrong | Impact | Fix |
|---|---|---|---|---|
| quarterly_snapshots | `src/app/quarterly-review/services/quarterly-review-service.ts:824` (write, data @798) | `business_id: review.business_id` (= businesses.id via resolveBusinessId); only live writer | Snapshots written under businesses.id while the 3 reader steps (NextYearTargetsStep:67, YearInReviewStep:58, QuarterlyPlanStep:567) read under profile.id → Year-in-Review / Next-Year-Targets / Quarterly-Plan show ZERO historical actuals. Phase A FK now makes the upsert throw (caught/swallowed → snapshot silently lost). | Resolve profile.id (via business_profiles by user_id/business_id) before upsert; thread the hook's already-resolved `resolvedProfileBusinessId` down. Reader primary keys are correct — fix the writer. |
| kpi_actuals | `src/app/quarterly-review/services/quarterly-review-service.ts:726` (write) | Same root cause: `business_id: review.business_id` (businesses.id); kpi_actuals_business_id_fkey → business_profiles(id) is LIVE | Every saveKpiActuals upsert FK-violates; error swallowed (L746-749). PROD: 0 rows written since 2026-04-22; KPI actuals silently lost on every workshop completion. | Thread `resolvedProfileBusinessId` into saveKpiActuals, or resolve inside via `business_profiles.eq('business_id', review.business_id)` (fallback by user_id). onConflict key is fine; only business_id is wrong. |

### financial_forecasts — selector + demo seed (FK live)
| Table | File:Line | What's wrong | Impact | Fix |
|---|---|---|---|---|
| financial_forecasts | `src/app/finances/forecast/components/ForecastSelector.tsx:115` (insert) | `business_id = businessId` (page state = resolveBusinessId = businesses.id) | handleDuplicate FK-violates → "Failed to duplicate forecast"; duplicate never created | Resolve profile.id like `loadForecasts` does (L79-87: `business_profiles.select('id').eq('business_id', businessId)`); insert with `profile?.id ?? businessId`. |
| financial_forecasts | `src/app/finances/forecast/components/ForecastSelector.tsx:220` (update) | `update({is_active:false}).eq('business_id', businessId)` matches 0 profile-keyed rows | Previously-active forecast not deactivated → activate step violates `unique_active_forecast_per_fy` → "Failed to set active forecast" or two active rows | Resolve profile.id and use it in the deactivate filter. |
| financial_forecasts | `src/app/api/admin/demo-client/route.ts:588` (insert) | `business_id: businessId` (businesses.id) despite profileId at L222; FK live | Insert FK-violates → forecast null, 12 P&L lines skipped → demo client has no forecast | Use `profileId`; guard for null. |

---

## LATENT BUGS (correct today, fire under a reachable edge — usually `|| businesses.id` / `|| user.id` fallback or backwards lookup ordering)

### Fragile fallback ordering — relies on wrong ids returning 0 rows
- **business_kpis primary reads use businesses.id, rescued only by profile.id fallback:** `one-page-plan/services/plan-data-assembler.ts:448` (primary businessesId; only L452 fallback returns data), `goals/hooks/useStrategicPlanning.ts:814` (`kpiBizId = overrideBusinessId || bizId`). **Fix:** promote the profile.id branch to PRIMARY, drop the businessesId/overrideBusinessId attempt.
- **business_financial_goals inverted ordering (worst case):** `quarterly-review/summary/[id]/page.tsx:90` tries `[data.business_id (businesses.id), ownerId (user.id), profile.id]` — canonical id LAST. A stale businesses.id-keyed row would shadow the correct one. **Fix:** reorder to `[profile.id, data.business_id, ownerId]`.
- **business_financial_goals write split risk:** `api/goals/save/route.ts:177` upsert `business_id: saveProfileId` (`profileId || businessId`) with `onConflict:'business_id'` + UNIQUE constraint — if client omits profileId, writes a SECOND divergent row. **Fix:** resolve profile.id server-side; 422 if missing; never fall back to raw businesses.id.
- **QR step reads `profile?.id || review.business_id`** (businesses.id fallback): `ScorecardReviewStep.tsx:187`, `QuarterlyTargetsStep.tsx:133`, `QuarterlyPlanStep.tsx:381` (business_kpis); plus the business_financial_goals/strategic_initiatives variants across `quarterly-review/page.tsx:98`, `AnnualInitiativePlanStep.tsx:97/129`, `ConfidenceRealignmentStep.tsx:141/189`, `NextYearTargetsStep.tsx:57`, `QuarterlyPlanStep.tsx:342/408/415/422/429/479`, `YearInReviewStep.tsx:68`, `VisionStrategyStep.tsx:75`, `useQuarterlyReview.ts:221`. **Fix (shared):** resolve profile.id via `business_profiles.business_id = review.business_id` (robust for team members, not just owner user_id) and drop the businesses.id fallback.
- **plan-data-assembler initiative reads** `:389/541/562/578` (`[businessId(profile.id), user.id, businessesId]`) and goals read `:310` (`[businessId, ownerUserId, businessesId]`): profile.id first, fall through to polluted spaces on empty. **Fix:** restrict to `[businessId]` for these profile-keyed tables.
- **strategic-sync-service writes/reads** `:99/189/301/395/404/470/500/551/653/662`: `syncBusinessId = profileBusinessId || getSnapshotBusinessId() || businessId`; L395/404 (`syncRocks`) has NO snapshot fallback so it's the most exposed. **Fix:** make `profileBusinessId` mandatory (docstring already requires it); throw rather than fall back to businesses.id.
- **plan_snapshots split history:** `one-page-plan/page.tsx:196` (read, `|| resolved.businessId`), `useQuarterlyReview.ts:535/602` (writes via `getSnapshotBusinessId()` user_id lookup + `|| businessId` fallback). Goals-wizard snapshots (profile.id) and QR snapshots (businesses.id on miss) become invisible to each other in version history. **Fix:** use the hook's already-resolved `profileBusinessId` state (L158); drop the businesses.id fallback; skip snapshot if null. (Service sites `plan-snapshot-service.ts:54/70/104` are pass-through — fix callers.)
- **business_financial_goals fallback-only:** `api/goals/resolve-business/route.ts:120` and `api/goals/route.ts:75` (profile-first, businesses.id fallback reachable only on profile miss). **Fix:** drop the businessId fallback when profileId resolves; the resolve-business one (L116-127) can be deleted outright.

### Dead / no-op fallbacks (wrong key-space, but nothing is written there)
- **operational_activities:** `useStrategicPlanning.ts:986` (`loadActivities(user.id)`) — operational_activities was never written under user.id (unlike strategic_initiatives). **Fix:** delete the fallback block (L984-986). `QuarterlyRocksStep.tsx:218` (`profile?.id || review.business_id`) — fallback to businesses.id under-reports the activities checklist count; resolve via business_profiles.
- **sprint_key_actions:** `useStrategicPlanning.ts:975` (`loadSprintActions(user.id)`) — sole writer always keyed on business_profiles.id; user.id query always returns []. **Fix:** delete the L974-976 fallback; keep only `loadSprintActions(bizId)`.

### api/kpis/route.ts — unenforced contract (no in-repo caller)
- `:84/150/157/196/267/326` — handler keys on raw query/body `businessId`; verifyBusinessAccess is dual-ID tolerant. **Fix:** resolve `businessId → business_profiles.id` once at handler top and use it everywhere below (or document the contract). Consider deleting the dead POST handler.

### strategic_initiatives — deliberately deferred to R14
- `api/strategic-initiatives/route.ts:81/98` (user_id loops tried FIRST), `:112` (profile.id tried SECOND). Masked today by the L112 business_id fallback. **Fix:** after R14 cleanse, drop the user_id loops; query `business_id = profile.id` only.

### activity_log — non-canonical writes
- `goals/services/kpi-service.ts:302` — strategic-planning caller passes `kpiBusinessId = businessesId || businessId` (businesses.id) for the activity_log identity. No FK, no business_id reader today, dual-tolerant RLS — so latent. **Fix:** log activity_log under profile.id (separate `activityBusinessId` param, or split the FK-column id from the activity id at `useStrategicPlanning.ts:467-468`).

### demo_client teardown / fragility (super-admin, demo-only)
- financial_forecasts teardown `demo-client/route.ts:831/837` (read/delete by businesses.id) — masked by the L864 profile-delete cascade; fix in lockstep with the L588 seed or rely on cascade.
- weekly_reviews teardown `:824` — masked because the L579 insert is itself broken; fix together.
- vision_targets seed `:301` (`business_id: profileId || demoUserId` — drop the demoUserId fallback, throw on profile-insert failure) and teardown `:843` (`.eq('user_id', ownerId)` — delete by canonical `business_id: profileId`).
- forecast-service `:247` (`profileBusinessId = profile?.id || businessId`) — fallback now FK-fails; replace with explicit domain error when profile missing.
- dashboard-preferences-service `:55/112` — pass-through; the `?? resolved.businessId` fallback at `useBusinessDashboard.ts:142` is the source; harden to `profile?.id ?? null`.

---

## COSMETIC
- `weekly-metrics-service.ts:238` — UPDATE matched by PK (`.eq('id', snapshot.id)`); business_id payload re-set is inert. Drop business_id from the update payload, or leave; resolved incidentally by the L127 fix.
- `weekly-review-service.ts:440` (`getIncompleteReviewsForWeek`) — dead code, zero callers. Delete or, if revived, standardize on profileIds.

---

## Root cause + systemic recommendation

**Root cause.** The system carries three distinct id-spaces for the same business entity — `businesses.id`, `business_profiles.id` (canonical), and `auth user_id` — and `resolveBusinessId()` returns a branded `BusinessId` that is *always* a `businesses.id`. Components freely mix it with the canonical profile id. Three structural enablers let the mismatch hide: (1) most `business_id` columns are `text` with **no FK**, so wrong-key reads silently return 0 rows and wrong-key writes silently split data; (2) **dual-tolerant RLS** (`bp.id = business_id OR b.id = business_id`) passes both id-spaces; (3) pervasive **`profile?.id || businesses.id` / `|| user.id` fallback chains and id-try loops** that mask the bug whenever the wrong-key read returns 0 rows — until a stale row, a missing profile, or a newly-applied FK makes it fire. The coach-override path in `useBusinessDashboard.ts:127` is the single highest-leverage instance: it skips the translation its own sibling branch performs, and one fix cures 11 downstream sites.

**Systemic recommendations (in priority order):**

1. **One shared resolver, used everywhere.** A single `resolveBusinessProfileId(input): BusinessProfileId | null` that accepts any of the three id-spaces, translates to the canonical `business_profiles.id`, and returns `null` (never a silent businesses.id) on miss. Every read/write of a profile-keyed table calls it; ban inline `business_profiles.select('id')` lookups and ad-hoc `|| businesses.id` fallbacks in feature code. The Phase A FK tables prove the canonical key — make the resolver the only sanctioned path to it.

2. **Type-branded ids enforced at query boundaries.** Brand `BusinessId`, `BusinessProfileId`, and `UserId` as distinct nominal types (the codebase already brands `BusinessId`/`UserId` in `BusinessContext`). Type the `business_id` parameter of every service/Supabase wrapper as `BusinessProfileId` so passing a `BusinessId` is a **compile error** — this would have statically caught every "active-bug" write in this audit (`quarterly-review-service.ts:726/824`, `ForecastSelector.tsx:115/220`, `strategic-initiatives.tsx:562/601/634`, the goals/save KPI sites).

3. **Kill the fallback chains; fail loud.** Replace every `profile?.id || review.business_id` / `|| resolved.businessId` / id-try loop with the resolver returning `null` → explicit empty/"no profile" state. Fallbacks that mask wrong-key reads are the single most common pattern across the latent findings and the mechanism by which active bugs went unnoticed until an FK was added.

4. **Finish the FK rollout (Phase B) + delete dead code.** Convert the remaining `text business_id` columns (`activity_log`, `plan_snapshots`, etc.) to uuid + FK → `business_profiles(id)` and rewrite RLS to single-branch on the canonical key, so silent data-splits become loud errors. In parallel, delete the verified dead code (`SnapshotService`, `KPIService.updateKPIValue`/`deleteKPI`, `getIncompleteReviewsForWeek`, the dead `/api/kpis` POST handler, the sprint/operational user_id fallbacks) to remove latent traps for future wiring.

5. **R14 data cleanse as the prerequisite for removing legacy reads.** The deliberately-deferred user_id loops (`api/strategic-initiatives/route.ts:81/98`) and the documented legacy fallbacks can only be removed once R14 confirms no rows remain keyed by `user_id`/`businesses.id`; sequence the cleanse before deleting those compatibility shims.

**Suggested fix order:** (1) `useBusinessDashboard.ts:127` translation [11 sites]; (2) `api/goals/save/route.ts:203/214/221` coach-save; (3) the four `strategic-initiatives.tsx` writes [most damaging — invisible-on-write]; (4) `quarterly-review-service.ts:726/824` [FK-violating, silent data loss]; (5) remaining user_id-read active bugs (`annual-plan`, `analytics/client`, `swot`, QR initiative steps, weekly_reviews coach paths, vision_targets); (6) ForecastSelector FK fixes; (7) demo-client seed/schema; then the latent fallback-hardening and shared-resolver/branded-type refactor.