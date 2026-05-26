# Monthly Report — Deep Gap Audit (Pass 2)

**Date:** 2026-05-14
**Scope:** Everything the first alignment audit didn't cover. Source for this report came from a paranoid "what else?" sweep beyond the 10 drift areas already documented in `.planning/monthly-report-alignment-audit.md`.

---

## Executive summary

Pass 1 found 4 confirmed drifts + 1 UX-confusion area in the monthly report ↔ forecast alignment. Pass 2 surfaced **6 new material findings**, settled the wages double-count question, and flagged one issue that mirrors a Phase 61 gap.

### Highlights

1. **Wages "double-count" is NOT a code bug.** Forecast code does not duplicate wages across Team + OpEx. The 461% error in the memory was a data/UX issue — confusion from a coach configuring `account_mappings` + `wages_account_names` simultaneously and reading the informational wages tab as a separate P&L section.
2. **`finances` permission flag is not enforced on monthly-report API routes** — same gap pattern we identified in Phase 61 sharing. Any authenticated member of a business can call `/api/monthly-report/generate` etc. directly, regardless of section_permissions.
3. **PDF export inherits the budget-matching drift** from Pass 1's Drift #1 — fixing the API route fixes the PDF.
4. **Snapshot system has 3 issues**: no cache invalidation, missing data-quality metadata at approval time, no freshness indicator.
5. **ForecastService dual-ID handling is fragile** but defensive — works today, brittle to future migration.

---

## A. Forecast-side wages double-count — VERDICT

**Status:** ✅ DOES NOT EXIST IN CODE

**Evidence:**
- `src/app/finances/forecast/services/forecast-service.ts:77-106` — OpEx calculation sums `forecast_pl_lines` filtered by `category === 'Operating Expenses'`
- No separate "Team" category in forecast materialization
- Wages accounts flow into OpEx lines via `account_type` mapping; not added a second time
- The wages detail tab in the monthly report is **informational only**; it reads the same source rows as the OpEx P&L section

**Implication:** The `project_opex_double_count` memory should be retired or rewritten. The 461% error was a misread of the wages tab as a separate P&L section. Code is correct.

---

## B. PDF export — inherits the account_code drift

**Status:** ❌ Bug, but downstream of Pass 1's Drift #1

**Evidence:**
- `src/app/finances/monthly-report/services/monthly-report-pdf-service.ts:1-100` consumes pre-computed `GeneratedReport`
- The `GeneratedReport` is built by `/api/monthly-report/generate` whose budget-matching logic still uses ID + name (Pass 1 Drift #1)
- PDF doesn't compute its own budget; it renders what the API returned

**Implication:** Fixing the generate route's account_code join (Pass 1 Drift #1) automatically fixes the PDF. No separate fix needed for the PDF.

---

## C. Snapshot stale data after approval

**Status:** ⚠️ Architectural risk — no cache invalidation

**Evidence:**
- `src/app/api/monthly-report/snapshot/route.ts:102` — `report_data` stored as-is at approval time
- No mechanism to detect or surface Xero syncs that happen after approval
- `src/app/finances/monthly-report/page.tsx` loads snapshot on mount, never refreshes until manual reload
- Phase 35 design intent: snapshot preserved so "already-sent email links keep working" (correct for PDF, problematic for in-app re-view)

**Implication:** A coach who views an approved report in-app may be looking at stale data. The email/PDF version is correctly immutable.

**Recommendation:** Show a "data captured at HH:MM" badge with a "refresh" affordance if the underlying Xero sync timestamp is newer.

---

## D. Snapshot missing data_quality metadata

**Status:** ❌ Missing implementation

**Evidence:**
- `src/app/api/monthly-report/snapshot/route.ts:85-120` — POST upsert omits `data_quality` and `per_tenant_quality` fields
- `src/app/finances/monthly-report/page.tsx:956-960` renders `DataIntegrityBanner` for live reports only
- Quality state at the moment of approval is not captured

**Implication:** If a coach approves when Xero is in sync, but later Xero drifts, an in-app re-view shows the current (possibly stale) quality state rather than the quality at approval. Loss of historical context for compliance / audit.

**Recommendation:** Add `data_quality` JSONB column to the snapshot table, capture at approval, render on snapshot view.

---

## E. Permission enforcement gap on monthly-report API routes

**Status:** ❌ Missing — mirrors Phase 61 gap

**Evidence:**
- `src/app/api/monthly-report/generate/route.ts:33-71` — checks user is owner/coach/business member, but does NOT check `section_permissions.finances`
- Same pattern on: `/snapshot`, `/account-mappings`, `/subscription-detail`, `/wages-detail`, `/full-year`, `/consolidated`
- A member added with `finances: false` cannot SEE the page (UI hides it via sidebar filter), but they CAN call any of these routes directly via browser devtools / curl and get full data back

**Implication:** Section permissions on monthly report are UI-gated only, not API-enforced. Same pattern flagged in the Phase 61 team-access investigation. For trusted internal staff this is fine; for external bookkeepers / junior staff invited specifically to keep finances private, it leaks.

**Recommendation:** Single helper `requireSectionPermission(user, business, 'finances')` called at the top of all monthly-report API routes. Half-day work; matches the same fix already discussed for forecast routes.

---

## F. ForecastService dual-ID consistency

**Status:** ⚠️ Subtle inconsistency, defensive code prevents breakage today

**Evidence:**
- `src/app/finances/forecast/services/forecast-service.ts:297-460` — `loadActualsAsPLLines()` resolves dual IDs then queries date range with `.in('business_id', idsToTry)`
- Catches both `businesses.id` and `business_profiles.id` formats, so works
- Other ForecastService methods don't consistently use the dual-ID pattern; relies on the caller having already resolved

**Implication:** Works today because the `.in()` catches both. Brittle if a future migration changes how rows are keyed.

**Recommendation:** No urgent action. Add a comment block at the top of the service noting which methods are dual-ID-safe.

---

## G. Variance math — zero-budget edge case

**Status:** ✅ Designed behavior, not a bug

**Evidence:**
- `src/lib/monthly-report/shared.ts:45-49` — when `budget = 0`, percent variance returns `0` (not `Infinity` or `NaN`)
- Pragmatic to avoid display issues

**Implication:** Unbudgeted spending shows "0% variance" rather than "infinite" — coaches need to read the $ delta not the %. Worth a tooltip clarifying "% is N/A when budget is zero — check the $ column".

---

## H. Caching and revalidation

**Status:** ✅ Aligned

**Evidence:**
- All monthly-report API routes declare `export const dynamic = 'force-dynamic'`
- No `unstable_cache()` / `revalidateTag()` calls
- Each POST recomputes — no stale Next.js cache risk

---

## I. FX / multi-currency

**Status:** ✅ Aligned

**Evidence:**
- `src/lib/consolidation/fx.ts:1-18` — explicit: "manual-entry rates only. No Vercel cron, no scraper."
- Missing FX rates surface to the user; never silently defaulted to 1.0
- Presentation currency hardcoded to AUD (consistent with platform's AU focus)

---

## J. Consolidation engine missing `resolveBusinessIds()`

**Status:** ⚠️ Already in Pass 1 (Drift #4 there)

Re-confirmed: `src/app/api/monthly-report/consolidated/route.ts:107-112` queries `business_profiles` without first resolving businessId. Fix is the same as Pass 1.

---

## K. Other findings

- **Account-mapping orphans (LOW):** If a forecast line is deleted while a mapping references it via `forecast_pl_line_id`, the mapping becomes a silent dead link. No Sentry log, no UI surface. ~15 min fix to log it.
- **No-Xero-connection UX (LOW):** Generate route returns a blank report rather than a 4xx with explanation. ~15 min fix.
- **Consolidation budget mode UI:** Not surfaced anywhere. All multi-tenant clients are silently stuck in `consolidation_budget_mode = 'single'`. May or may not be intentional — needs your call.

---

## Top NEW findings ranked

### MEDIUM
1. **Permission enforcement gap on monthly-report routes** — mirrors Phase 61. ~half day to add a shared helper across 7 routes.
2. **Snapshot missing data-quality metadata** — capture at approval time so historical reports retain context. ~2-3 hours.
3. **Snapshot stale-data indicator** — refresh badge with last-sync timestamp. ~1 hour.

### LOW
4. **Account-mapping orphan logging** — Sentry alert on dead link. ~15 min.
5. **No-Xero-connection 4xx response** — better error than empty report. ~15 min.
6. **ForecastService dual-ID consistency comment** — documentation only. ~10 min.

---

## Wages double-count verdict (explicit)

**NO IT DOES NOT EXIST.** The 461% error was a data/UX issue, not code duplication. The relevant memory entry should be retired or rewritten:
- Replace `project_opex_double_count.md` with `project_wages_tab_ux_confusion.md` documenting the UX trap and how to spot it.
- Or remove entirely if no UX work is planned.

---

## Questions you might want answers to

1. **Consolidation budget mode UI** — should there be one? Currently all multi-entity clients are stuck in 'single' mode.
2. **Account renames in Xero** — should the platform detect and re-prompt mapping when a Xero account is renamed?
3. **Email send failure** — if Resend fails during approval, does the snapshot still commit? Is the coach notified? (Not investigated in detail.)
4. **Prior-year column blank** — if prior FY has no Xero data, the column is just blank. Could be a "—" or "PY data unavailable" indicator.

---

*Audit pass 2 complete. File-level evidence in this report; full path coverage in `.planning/monthly-report-alignment-audit.md` (pass 1).*
