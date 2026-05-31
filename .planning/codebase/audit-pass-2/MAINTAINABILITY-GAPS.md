# Maintainability / Validation / Fork-Readiness / Test-Coverage — Audit Pass 2 (NET-NEW)

**Date:** 2026-05-31
**Branch:** `main` @ e1b4e7c7 (Phase 70 merged)
**Method:** Static analysis only (Read/Grep/Glob). No app run, no DB, no network.
**Scope:** What pass-1 (C-01..C-40 / R1..R28) MISSED in the maintainability / input-validation / fork-readiness / testing lane, plus Phase-70 drift.
**Strategy tag legend:** CODE = fix once, fork inherits · PROD = WisdomBI-prod data/config only · BOTH = code + one-time prod cleanup.

---

## (a) Net-New Findings

### MNT-N1 — `Xero/employees` GET is unauthenticated service-role (employee PII/salary exposure) — same class as C-36, NOT named by R24
- **Sev:** CRITICAL · **Effort:** S · **Fork-split:** CODE
- **Evidence:** `src/app/api/Xero/employees/route.ts:108-140` — `GET` builds a service-role client via `getSupabaseAdmin()` and gates only on `business_id` presence (line 113-119). `grep -c "getUser|verifyBusinessAccess|authError|hasAccess"` on the file = **0**. Any caller with a valid `business_id` UUID retrieves employee records (names, pay, terminated flags) for any tenant.
- **Why missed:** R24/C-36 enumerated only `monthly-report/templates` as "the worst instance of the C-07 raw-service-role-client class," and TESTING.md flagged employees as "no auth check" but it was never promoted into the C-xx finding set or the roadmap. It is a second live, currently-open hole of the *exact same severity*, and it leaks PII rather than templates.
- **Fix:** Add `getAuthenticatedUser()` + `verifyBusinessAccess(user.id, business_id)` to the GET (and any other verb). Ship alongside R24.

### MNT-N2 — KPI concept fragmented across 13 tables; ~9 are dead (zero code refs) — R19 only flagged forecasts
- **Sev:** MEDIUM · **Effort:** M (prod drop) / S (document) · **Fork-split:** PROD (fork omits) + CODE (pick canonical before fork)
- **Evidence (baseline_schema.sql):** `business_kpis:1790`, `custom_kpis_library:2453`, `kpi_actuals:3284`, `kpi_alerts:3310`, `kpi_benchmarks:3332`, `kpi_definitions:3349`, `kpi_definitions_backup:3378`, `kpi_history:3401`, `kpi_tracking_values:3415`, `kpi_values:3435`, `kpis:3457`, `strategic_kpis:4747`, `strategic_kpis_backup:4778`, `user_kpis:5308`. Dead (zero `src` refs outside tests): `kpi_alerts`, `kpi_benchmarks`, `kpi_definitions`, `kpi_definitions_backup`, `kpi_tracking_values`, `kpi_values`, `strategic_kpis`, `strategic_kpis_backup`. Live: `business_kpis` (20), `kpis` (9), `custom_kpis_library`/`kpi_actuals`/`user_kpis` (1 each).
- **Why missed:** R19 scoped the "multiple sources of truth" finding to forecasts + wizard versions only. The KPI surface is the worse offender — 13 tables, no documented canonical, a `kpi_definitions_backup` AND `strategic_kpis_backup` alongside `kpi-definitions-legacy.ts` (R15). A fork engineer asked "where do KPIs live?" has no answer.
- **Fix:** Declare `business_kpis` (or the `src/lib/kpi/` registry) canonical, document it, and exclude the dead 8 from the fork's schema. Drop in prod after non-reference confirmation (same track as R15).

### MNT-N3 — ~15 abandoned tables carry into the fork; backup tables beyond R15's single one
- **Sev:** LOW · **Effort:** S · **Fork-split:** PROD (don't migrate into fork) + CODE-hygiene
- **Evidence:** Zero-code-reference tables (grep across `src`, excluding tests): `annual_snapshots:1532`, `assessments_backup:1659`, `forecast_decisions:2844`, `forecast_insights:2933`, `forecast_values:3066`, `forecast_years:3107`, `life_goals:3477`, plus the 8 dead KPI tables in MNT-N2. **R15 named only `strategic_initiatives_backup`** — there are at least **three** backup tables (`assessments_backup`, `kpi_definitions_backup`, `strategic_kpis_backup`) plus a wide field of abandoned feature tables.
- **Why missed:** R15 was assembled from C-23/C-24/C-30/C-31 which each named one artifact; nobody ran the full "table exists in schema but has zero application references" sweep. The fork inheriting an empty-but-defined `life_goals`/`forecast_insights`/`assessments_backup` is pure confusion debt.
- **Fix:** Extend R15's drop list to the full ~15. Generate the list mechanically (schema tables minus `.from()` refs) so nothing is missed.

### MNT-N4 — "Goals" concept fragmented across 6 tables with no canonical
- **Sev:** LOW · **Effort:** S · **Fork-split:** CODE (document) + PROD (drop dead)
- **Evidence:** `goals:3174`, `annual_goals` (1 ref), `business_financial_goals:1720` (29 refs — the live one), `strategic_goals:4601` (3 refs), `life_goals:3477` (0 refs), `quarterly_goals` (1 ref). Five spellings of "a goal," only `business_financial_goals` is meaningfully used.
- **Why missed:** Same root as MNT-N2 — pass-1 only chased forecasts/KPIs for the "multiple sources of truth" theme, never goals.
- **Fix:** Document `business_financial_goals` as canonical; fold `annual_goals`/`quarterly_goals`/`strategic_goals` decision into the same pre-fork schema-rationalization pass as MNT-N2.

### MNT-N5 — Legal entity name + ABN hardcoded in privacy/terms; legal entity is literally a live TENANT name
- **Sev:** MEDIUM (fork legal blocker) · **Effort:** S · **Fork-split:** CODE
- **Evidence:** `src/app/terms/page.tsx:29-30,352-354` and `src/app/privacy/page.tsx:28,234-236` hardcode **"Envisage Australia Pty Ltd ATF Malouf Family Trust (ABN 11 331 804 705) trading as Wisdom Coaching."** The fork (inLIFE Pulse) would ship WisdomBI's legal terms and a wrong ABN — a real legal/compliance exposure, not just branding. Note the double-bind: **"Envisage" is also a live WisdomBI tenant** (Phase 70 had `70-05-B1-envisage-cleanup`), so the legal-entity string collides with a tenant name in support/log searches.
- **Why missed:** R7/C-26/C-27 catalogued brand *strings* and *URLs* in email templates and routes, but never opened the legal pages. ABN + trust name is a different (legal) coupling class.
- **Fix:** Parameterize legal entity, ABN, trading name, and effective dates into the brand config module (R7's target). Mark privacy/terms as requiring legal review per fork.

### MNT-N6 — Brand/identity coupling is ~3x wider than R7 stated (40+ files, marketing pages, layout metadata, ICS, components)
- **Sev:** HIGH (for fork) · **Effort:** M · **Fork-split:** CODE
- **Evidence:** R7/C-26 said "7 email files, 3+ pages, 6 routes." Actual `grep -ril "wisdombi|wisdomcg"` = **40+ files, 121 hits.** Beyond emails/routes: `src/app/layout.tsx:13` (`title: 'WisdomBi - Business Intelligence'` + favicon `/favicon.png`), marketing pages `src/app/bali-retreat/*`, `src/app/ai-advantage/*`, `src/app/page.tsx`, `src/app/help/page.tsx`; layout components `src/components/DashboardWrapper.tsx`, `src/components/ui/BrandedLoader.tsx`, `src/components/admin/AdminLayout.tsx`, `src/components/layouts/{ClientSidebar,CoachLayoutNew}.tsx`, `src/components/client/ClientLayout.tsx`, `src/components/layout/sidebar-layout.tsx`; and `src/lib/utils/ics-generator.ts` (calendar invites carry the brand). See full inventory in section (b).
- **Why missed:** R7 sampled the email path (the obvious one) and stopped. The UI chrome, marketing funnels, and calendar generator were never enumerated.
- **Fix:** R7's centralized brand config must cover: app title/metadata, favicon/logo paths, loader, all sidebar/layout chrome, ICS organizer, and the entire `/bali-retreat` + `/ai-advantage` marketing funnels (or exclude marketing from the fork entirely).

### MNT-N7 — Hardcoded third-party embed IDs: Vimeo video ID + Stripe JS in CSP — fork inherits WisdomBI's media/payment posture
- **Sev:** MEDIUM · **Effort:** S · **Fork-split:** CODE
- **Evidence:** `src/app/ai-advantage/page.tsx:213` embeds a hardcoded **Vimeo video `1181446316`** (WisdomBI marketing content); `src/middleware.ts:202,207` whitelists `https://js.stripe.com` and `https://player.vimeo.com` in `script-src`/`frame-src` of the CSP — yet there is **no Stripe SDK or billing code anywhere in `src`** (the only `stripe` references are cashflow keyword-classifiers). The CSP carries a payment-processor allowance the app doesn't use; the fork inherits both a stale CSP grant and someone else's marketing video.
- **Why missed:** Pass-1 didn't audit `middleware.ts` CSP or marketing-page embeds for fork coupling.
- **Fix:** Move embed IDs to config; drop the unused `js.stripe.com` CSP grant (or wire it intentionally); decide whether marketing pages fork at all.

### MNT-N8 — Support/sender email + domain sprawl: four inconsistent identities across `.ai` / `.au` / `.com.au`
- **Sev:** MEDIUM · **Effort:** S · **Fork-split:** CODE (config) + PROD (pick one)
- **Evidence:** Live (non-test) sender/support addresses in `src`: `support@wisdombi.ai` (5), `matt@wisdombi.au` (4 — note `.au` not `.com.au`), `noreply@mail.wisdombi.ai`, `matt@wisdombi.ai`, `support@wisdomcg.com.au`, `coach@wisdombi.com.au`, `admin@wisdombi.com.au`. Three different apex domains (`wisdombi.ai`, `wisdombi.au`, `wisdomcg.com.au`) and inconsistent prefixes for the same human. MEMORY notes the *intended* single SaaS sender is `cfo@wisdombi.ai`, which appears in none of these.
- **Why missed:** R7 named only `DEFAULT_FROM` in `resend.ts`. The support/contact addresses scattered through routes and pages were never collected, and the domain inconsistency (a deliverability + trust risk) went unnoticed.
- **Fix:** Single `SUPPORT_EMAIL` / `SENDER_EMAIL` config; reconcile to one apex domain.

### MNT-N9 — Insecure demo-credential fallback defaults baked into code
- **Sev:** MEDIUM (security) · **Effort:** S · **Fork-split:** CODE
- **Evidence:** `src/app/api/admin/demo-client/route.ts:32-33` — `email: process.env.DEMO_CLIENT_EMAIL || 'demo@smithsplumbing.com.au'` and `password: process.env.DEMO_CLIENT_PASSWORD || 'DemoPassword123!'`. A literal default password in source. If `DEMO_CLIENT_PASSWORD` is unset (likely in a fresh fork env), the demo account is created with a publicly-known credential.
- **Why missed:** R17/C-21 covered Xero `process.env.X!` and R18/C-22 covered encryption-key fallbacks, but the demo-credential insecure default is a distinct site not in either.
- **Fix:** Fail-closed if `DEMO_CLIENT_PASSWORD` unset (or remove the demo route from the fork). Never ship a default password literal.

### MNT-N10 — `NEXT_PUBLIC_APP_URL` fallback inconsistency: silently splits between `localhost:3000` and `https://wisdombi.ai`
- **Sev:** MEDIUM · **Effort:** S · **Fork-split:** CODE
- **Evidence:** 17 call sites read `process.env.NEXT_PUBLIC_APP_URL || <fallback>`, but the fallback is **inconsistent**: `https://wisdombi.ai` in email/invite routes (`send-invitation:104`, `auth/reset-password:101`, `admin/clients:377`, `coach/clients:226,260`, `team/invite:190,337,424,532`) vs `http://localhost:3000` in Xero OAuth (`Xero/auth:13`, `Xero/callback:23`, `admin/clients:330`). A fork that forgets `NEXT_PUBLIC_APP_URL` sends invitation emails pointing at **wisdombi.ai** (R7/C-27 caught this) AND silently builds Xero OAuth redirects against **localhost** (NET-NEW), breaking the connect flow with no error.
- **Why missed:** R7/C-27 caught the `wisdombi.ai` invite-email fallback but not the *second, different* `localhost:3000` fallback in the OAuth path — a fork-breaking default that fails silently rather than loudly.
- **Fix:** Single env-validation at boot (fail if `NEXT_PUBLIC_APP_URL` unset in production); remove per-site fallback literals.

### MNT-N11 — `zod` is a dependency but used in ZERO files — confirms R5 and removes any "partial pattern" excuse
- **Sev:** HIGH (informational sharpening of R5) · **Effort:** L · **Fork-split:** CODE
- **Evidence:** `package.json` declares `"zod": "^4.0.17"`, but `grep -rl "from 'zod'"` across all of `src` = **0 files**. 107 of 130 route files call `req.json()`/`request.json()`; **0** import zod. There is no existing validated route to copy a pattern from — the fix must establish the pattern from scratch.
- **Why missed:** R5 said "no Zod across 82+ routes" but didn't note zod is already *installed* (so no new dep needed) and that there is *not a single* reference route. Both facts change the fix plan: it's a greenfield convention, and the lib is already vendored.
- **Fix:** Build the `validate(schema)` wrapper now; apply to financial-write routes first (`forecasts/scenarios`, `monthly-report/*`, `kpis`, `goals`). zod v4 is current — no install needed.

### MNT-N12 — No Node version pinning (`engines` absent) — fork build reproducibility risk
- **Sev:** LOW · **Effort:** S · **Fork-split:** CODE
- **Evidence:** `package.json` has no `engines`, no `packageManager`, no `.nvmrc` (none found). `package-lock.json` IS present (good — deterministic installs). 60 deps use floating `^`/`~` ranges; none use `*`/`latest` (good). No `.github/dependabot.yml` / `renovate.json` (confirms R-gap: no automated dep updates).
- **Why missed:** Pass-1 noted "no Dependabot/Renovate" but not the missing Node pin. A fork bootstrapped on a different Node major could hit Next 15 / undici / crypto differences silently.
- **Fix:** Add `"engines": { "node": ">=20 <23" }` (or match Vercel runtime) + `.nvmrc`. Add Dependabot config (already in the backlog).

### MNT-N13 — `forecast_payroll_summary` backfilled by Phase 70 script but only 4 code refs; payroll-summary write path is script-only, not app-wired
- **Sev:** LOW · **Effort:** S (verify) · **Fork-split:** CODE-doc
- **Evidence:** Phase 70's `scripts/70-03-A2-payroll-summary-backfill.mjs` upserts `forecast_payroll_summary` (commit 99a3b8a3), but the table has only 4 `src` refs and the backfill was a one-off script. If the app never writes this table in normal operation, the data goes stale after the next forecast edit. Worth confirming the app write-path exists before relying on it for month-end reporting.
- **Why missed:** This is Phase-70-introduced; pass-1 predates it.
- **Fix:** Confirm an app-level writer exists for `forecast_payroll_summary`; if not, either wire it or document the table as report-snapshot-only.

---

## (b) Brand / Identity Coupling Inventory (what the fork MUST parameterize)

| Category | Locations | Current value | Fork action |
|---|---|---|---|
| App title / metadata | `src/app/layout.tsx:13-14` | `'WisdomBi - Business Intelligence'`, description | env-driven `APP_NAME`/`APP_DESCRIPTION` |
| Favicon / logo | `src/app/layout.tsx:15-18` (`/favicon.png`); `LOGO_URL` in `resend.ts`; `wisdombi.ai/images/logo-main.png` (5 hits) | static paths | config `BRAND_LOGO_URL`/`FAVICON` |
| Brand colors | `resend.ts` (`BRAND_ORANGE/NAVY`), `#F5821F` literals in `team/invite/route.ts` | hardcoded hex | brand theme config |
| Email sender (`DEFAULT_FROM`) | `src/lib/email/resend.ts:7` | WisdomBI sender | `SENDER_EMAIL` config |
| Support / contact emails | `support@wisdombi.ai`(5), `matt@wisdombi.au`(4), `support@wisdomcg.com.au`, `coach@wisdombi.com.au`, `admin@wisdombi.com.au`, `noreply@mail.wisdombi.ai` | inconsistent across 3 domains | single `SUPPORT_EMAIL` |
| Legal entity + ABN | `terms/page.tsx:29-30,352-354`; `privacy/page.tsx:28,234-236` | "Envisage Australia Pty Ltd ATF Malouf Family Trust, ABN 11 331 804 705, t/a Wisdom Coaching" | config + legal review (MNT-N5) |
| App URL fallbacks | 17 sites; `https://wisdombi.ai` (invites) / `http://localhost:3000` (OAuth) | inconsistent fallbacks | fail-closed env (MNT-N10) |
| Absolute URLs in copy | `wisdombi.ai/{reset-password,messages,auth/login,coach/dashboard,ai-advantage}`, `staging.wisdombi.ai` | hardcoded | derive from `NEXT_PUBLIC_APP_URL` |
| Marketing funnels | `src/app/bali-retreat/*`, `src/app/ai-advantage/*`, `src/app/page.tsx`, `help/page.tsx` | WisdomBI-specific content | exclude from fork or fully re-skin |
| Vimeo embed | `ai-advantage/page.tsx:213` | video `1181446316` | config or drop |
| CSP third-party grants | `middleware.ts:202,207` | `js.stripe.com` (unused), `player.vimeo.com` | prune/parameterize (MNT-N7) |
| UI chrome | `DashboardWrapper.tsx`, `BrandedLoader.tsx`, `AdminLayout.tsx`, `ClientSidebar.tsx`, `CoachLayoutNew.tsx`, `ClientLayout.tsx`, `sidebar-layout.tsx` | "WisdomBI" strings | brand config |
| Calendar invites | `src/lib/utils/ics-generator.ts` | brand in ICS organizer/summary | brand config |
| Report sender name/email | `REPORT_FROM_NAME`, `REPORT_FROM_EMAIL` env (already parameterized — good) | env | confirm fork sets these |

---

## (c) Test-Coverage Gap Map (danger area → has tests? → needed before which R-item)

| Danger area | Has tests? | Gap detail | Needed before |
|---|---|---|---|
| **Resolver id-mapping** (`resolve-business-ids.ts`, `resolve-xero-business-id.ts`) | **NO direct unit tests** | `business-id-resolution.test.ts` MOCKS `resolveBusinessIds` (verifies the *route* passes `bizId`, not the resolver's own logic). No test for the dual-ID divergence case, the module-level cache, or the silent `bizId=profileId=inputId` fallback. | **R1** — cannot safely collapse 3 resolvers without characterization tests pinning current behavior |
| **RLS visibility (4-role × 2-ID)** | **NO** behavioral tests | `db-06-rls-comments.test.ts` checks comment *presence* only; `sec05` is live-DB-skippable. No test runs a non-owner and asserts a row is hidden, or asserts coach/team/super_admin visibility. | **R2 / R14 / R16** — the 4-role × 2-ID access matrix must exist before touching RLS helpers or removing the `auth.uid()::TEXT` mask |
| **Cashflow GST/depreciation classification** | **PARTIAL** | `engine.test.ts`, `engine.phase282.test.ts`, `account-resolution.test.ts`, `opex-classifier.test.ts` exist — but no test asserts the keyword-match *misclassifies* (e.g. "Software Superannuation" → GST-exempt). | **R6** — need a pin on current (wrong) behavior before switching to xero_type |
| **Consolidation currency / FX** | **YES (strong)** | `fx.test.ts`, `oxr.test.ts`, `eliminations.test.ts`, `balance-sheet.test.ts`, `account-alignment.test.ts`. Gap: no test that `presentation_currency` hardcoded `'AUD'` (`engine.ts:136`) breaks a non-AUD parent. | **R6** — add the non-AUD-parent characterization test |
| **Forecast math** | **YES** | `forecast-read-service*.test.ts`, `save-and-materialize.test.ts`, `net-profit.test.ts`, reconciliation gates (fixture-driven). Solid. | n/a — characterization already exists |
| **Super / wages** | **PARTIAL** | payroll-mapping + step4 wizard tests exist; super rate now hardcoded `0.12` (commit ce9d0cd8). No test pins that per-forecast super overrides are *ignored* (MEMORY note) — a future config-UI feature could silently break this. | R6-adjacent |
| **Cron auth (loose form)** | **PARTIAL** | only `Xero/sync-all` has the SEC-02 test. The 4 loose-form crons (`cron/sync-all-xero`, `reconciliation-watch`, `weekly-digest`, `daily-health-report`) have **no** fail-closed regression test. | **R4** |
| **Unauthenticated service-role routes** | **NO** | No test asserts `Xero/employees` (MNT-N1) or `monthly-report/templates` (C-36) require auth. | **R24 + MNT-N1** |
| **Request-body validation** | **N/A** | zero zod, zero validation tests (MNT-N11). | **R5** |
| **Xero OAuth callback** | **NO** | `Xero/callback/route.ts` (483 lines) — connection establishment path, zero tests. | R3/R8 (Xero durability) |

---

## (d) Confirmations (pass-1 findings re-verified true @ e1b4e7c7)

- **R5/C-17 (no validation):** CONFIRMED + sharpened (MNT-N11). 107/130 routes parse a body; 0 import zod; zod IS already in `package.json`.
- **R7/C-26/C-27 (brand coupling):** CONFIRMED but *understated* — see MNT-N5/N6/N7/N8 (40+ files vs the ~13 stated).
- **R18/C-22 (encryption key sprawl):** pattern CONFIRMED, and the analogous **Supabase-key sprawl is actually CLEAN** — `src/lib/supabase/keys.ts:30-59` centralizes the 3 service-key names + 2 anon-key names behind `getSupabaseSecretKey()`/`getSupabasePublishableKey()`, imported by 68 files with **0 raw bypasses in `src/app`**. (Not a finding — a positive pattern R18 should copy.)
- **R19/C (forecasts ambiguity):** CONFIRMED `financial_forecasts` (70 refs, canonical) vs `forecasts` (≈0 live refs). `wide_compat` is **NOT** dead — it's referenced by 9+ live monthly-report/forecast routes; the "ambiguity" is naming, not orphan-hood. KPI/goals fragmentation (MNT-N2/N4) is the bigger instance R19 missed.
- **R15/C-23/C-30/C-31 (backup/legacy):** CONFIRMED + widened (MNT-N3) — at least 15 dead tables, 3 backup tables (not 1).
- **C-14/R6 (hardcoded AUD):** CONFIRMED still present at `consolidation/engine.ts:136`.
- **C-36/R24 (templates no-auth):** CONFIRMED, and **MNT-N1 is a second instance of the same class** (employees route).
- **TypeScript:** `strict: true` CONFIRMED; `as any` clusters in financial math are modest (10 in consolidation+cashflow combined, mostly DB-row narrowing) — not a top concern; the 490 API-route `as any` are ~85% Sentry-call workarounds (per CONVENTIONS) — cosmetic.
- **Supply chain:** `package-lock.json` present (good); no `*`/`latest` deps (good); no Dependabot/Renovate (gap, known); **no Node `engines` pin** (MNT-N12, NET-NEW).

---

## (e) Phase-70 Drift

- **No `src/` code drift.** Phase 70 (merged `e1b4e7c7`) touched **only** `.planning/` docs and `scripts/*.mjs|.ts` (data-backfill one-offs: `70-01`..`70-09`). Zero changes under `src/`, `supabase/migrations/`, `package.json`, or `middleware.ts`. Every pass-1 code finding remains exactly as written.
- **One data-path note (MNT-N13):** `forecast_payroll_summary` was backfilled by `scripts/70-03` but has only 4 app refs — verify an app write-path exists or the data goes stale after the next forecast edit.
- **Tenant-name/legal-entity collision surfaced by Phase 70:** "Envisage" is both the hardcoded legal entity in privacy/terms (MNT-N5) and the live tenant cleaned in `70-05-B1-envisage-cleanup` — a search/observability hazard the fork should resolve by parameterizing the legal name.
- **Super rate hardcoded `0.12`** (commit ce9d0cd8) aligns with MEMORY's guidance (ignore per-forecast overrides); no test pins this — flagged under test-gap map.
