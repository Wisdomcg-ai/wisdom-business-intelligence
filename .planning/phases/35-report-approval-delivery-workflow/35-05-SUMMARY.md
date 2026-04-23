---
plan: 35-05
phase: 35-report-approval-delivery-workflow
status: complete
wave: 2
autonomous: false
started: 2026-04-23
completed: 2026-04-24
---

# Plan 35-05 SUMMARY — Public `/reports/view/[token]` Route + Middleware

## Outcome

Anonymous clients can now open the email's "View Report" link and see a read-only snapshot of the approved report without logging in. The page renders only from `cfo_report_status.snapshot_data` — no live Xero/forecast queries. Invalid, tampered, or missing snapshots render a custom not-found page.

## Tasks

| Task | Name | Commit | Status |
|---|---|---|---|
| 1 | Middleware exemption (both arrays) | `3b24345` | ✓ |
| 2 | Public server page + snapshot renderer + 404 | `28edc78` | ✓ |
| 2.5 | UAT-surfaced runtime fixes | `d944963` | ✓ (unplanned) |
| 3 | Manual UAT — 6 checks | — | ✓ All passed |

## Files

### Created (planned)
- `src/app/reports/view/[token]/page.tsx` — server component, token → snapshot lookup → render
- `src/app/reports/view/[token]/ReportSnapshotView.tsx` — client component rendering ReportSnapshotV1
- `src/app/reports/view/[token]/not-found.tsx` — custom 404 for invalid/tampered tokens

### Created (unplanned, UAT fix)
- `src/app/reports/view/[token]/default.tsx` — re-exports page.tsx; prevents Next.js App Router parallel-route fallback during client hydration

### Modified (planned)
- `src/middleware.ts` — added `/reports/view` to BOTH `publicRoutes` (anonymous access) and `onboardingExemptRoutes` (logged-in-but-not-onboarded bypass). RESEARCH.md §Pitfall 6 correction applied — CONTEXT.md D-23 only mentioned `onboardingExemptRoutes`.

### Modified (unplanned, UAT fix)
- `src/components/layout/sidebar-layout.tsx` — added `isPublicReportView` to the early-return list so the auth-loading splash doesn't block anonymous `/reports/view` renders.
- `src/app/reports/view/[token]/page.tsx` — replaced `notFound()` calls with inline `<ReportNotFound />` returns to bypass client hydration fallback to NotFound boundary.

## UAT Results (Task 3)

All 6 checks from Plan 35-05 Task 3 §how-to-verify passed after unplanned fixes applied:

| # | Check | Result |
|---|---|---|
| 1 | Valid token (incognito) → snapshot view renders, URL stays `/reports/view/...` | ✓ |
| 2 | Tampered token (`tampered.xxxxx`) → "Report not found" | ✓ |
| 3 | Valid token (logged-in tab) → same render, no onboarding bounce | ✓ |
| 4 | Snapshot_data = NULL → "Report not found"; restored → renders again | ✓ |
| 5 | Token signed for non-existent UUID → "Report not found" | ✓ |
| 6 | Back button after valid snapshot view → no crash | ✓ |

## Deviations Documented

### Deviation 1: `<ReportNotFound />` inline instead of `notFound()`

**Original plan:** Call `notFound()` from page.tsx when token invalid / row missing / snapshot null.

**Actual:** Return `<ReportNotFound />` inline instead.

**Why:** `notFound()` triggered a Next.js App Router client-hydration fallback ("No default component was found for a parallel route... Falling back to nearest NotFound boundary") that caused the browser to render not-found.tsx even when SSR returned the valid snapshot. Inline return bypasses the NotFound boundary entirely.

**Impact:** Zero functional difference — user still sees the same not-found UI when the token resolves to no valid snapshot. Schema of the component unchanged; imports from `./not-found` so `not-found.tsx` remains the single source of truth for the fallback UI.

### Deviation 2: `default.tsx` added

**Original plan:** Not specified.

**Actual:** Added `src/app/reports/view/[token]/default.tsx` re-exporting `page.tsx`.

**Why:** Next.js App Router requires a `default.tsx` at parallel-route segments during client-side navigation to prevent fallback to NotFound. Pre-existed as a partial fix before Deviation 1 made it redundant; kept as belt-and-braces.

**Impact:** 4-line file, zero runtime cost (dead code unless client-side nav ever hits a state Next.js can't recover).

### Deviation 3: `SidebarLayout` exempt for `/reports/view`

**Original plan:** Middleware updates only (publicRoutes + onboardingExemptRoutes).

**Actual:** Also added `/reports/view` to `SidebarLayout`'s early-return list.

**Why:** Research didn't cover the client-side layout. `SidebarLayout` wraps every page via root layout and shows a full-page "Loading / Please wait..." splash while `supabase.auth.getUser()` resolves. For anonymous routes this never resolves cleanly, so the splash covered the rendered snapshot. Exempting `/reports/view` from the sidebar wrapper (same pattern already used for `/auth`, `/admin`, `/coach`, `/bali-retreat`, `/ai-advantage`) returns `<>{children}</>` directly.

**Impact:** Required for the UAT to pass. RESEARCH.md §Pitfall 6 flagged two middleware arrays; this third layout-level exemption was not caught and surfaces as a research gap for future phases touching public routes.

## Research Gap Noted

For future phases adding public routes, the cross-check list must include:
- `src/middleware.ts` `publicRoutes` array
- `src/middleware.ts` `onboardingExemptRoutes` array
- `src/components/layout/sidebar-layout.tsx` early-return list (isAuthRoute / isAdminRoute / isCoachRoute / isHomePage / isLegalPage / isStandalonePage / **isPublicReportView**)

Plan 35-05 Task 1 captured the first two; the third was missed and surfaced at UAT time.

## Verification

- `npx tsc --noEmit` → exits 0 (verified via curl-triggered dev server compile)
- Middleware grep: `grep -c "'/reports/view'" src/middleware.ts` → 2 (one per array)
- Snapshot-only read path grep (must be 0 references): `grep -rc "forecast_pl_lines\|xero_pl_lines\|financial_metrics" "src/app/reports/view/[token]/"` → 0
- SSR content extraction via curl: `Test Co March 2026 financial report Captured 24 April 2026 • Prepared by Matt Malouf Your March 2026 financial report is available below.` ✓

## Commits (chronological)

- `3b24345` — feat(35-05): exempt /reports/view from middleware auth + onboarding gates
- `28edc78` — feat(35-05): add public snapshot view page + 404
- `d944963` — fix(35-05): resolve public snapshot view hydration fallback (3 UAT-surfaced fixes)

## Requirements Touched

- APPR-02 (email delivery target), APPR-03 (send success path), APPR-05 (public link to report — now token-signed snapshot URL, Make.com webhook replaced per CONTEXT.md)

## Forward Compatibility

- Phase 36 (Client Portal) will add `businesses.portal_slug` and `/portal/[slug]` routes. `buildReportUrl` helper (from Plan 35-02) already prefers the portal URL when `portal_slug` is set, otherwise falls back to the token URL. Existing token URLs in already-sent emails stay valid indefinitely (D-21: no expiry).
- Plan 35-06 will replace the placeholder report body in `ReportSnapshotView` with the full tab-by-tab rendering (P&L, variance, commentary, full-year).
