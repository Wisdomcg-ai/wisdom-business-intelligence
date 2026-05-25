# Finance API Routes — Authentication & Authorization Audit

**Date:** 2026-05-14 (subsequently 2026-05-15)
**Purpose:** Feed Phase 64 re-scoping after the plan-checker BLOCK on Plan 64-02 surfaced wider auth-less / service-role usage. This audit walks every finance-related API route and classifies its current auth posture, caller, and risk.

## Summary

**Total finance-relevant API routes examined:** 27 (under `src/app/api/forecast/**`, `src/app/api/monthly-report/**`, and `src/app/api/Xero/**` that read/write financial data)

**Auth posture breakdown:**

- **Full auth (user + business membership):** 8 routes
- **Auth but partial business check:** ~7 routes (needs case-by-case)
- **NO auth at all, service-role direct access:** **12 routes** — the security gap
- **Legitimately auth-less (cron/webhook):** **0** — every auth-less route is called from the browser UI
- **Unknown / needs runtime confirmation:** 2-3 routes (`consolidated-bs`, `consolidated-cashflow`, `debug`)

**Bottom line:** Twelve finance routes accept a `business_id` in the request body or URL and return / mutate financial data **without verifying who's calling**. They use `createClient(URL, SERVICE_KEY)` which bypasses RLS — so even the database can't enforce "you must be a member of this business." All twelve are called from the browser UI, so they're not legitimately public.

This is a bigger gap than the original Phase 64 scope (section permissions). Phase 64a (auth bootstrap) must ship before Phase 64b (section permissions) is meaningful.

---

## The 12 unauthenticated finance routes

| # | Route | Method | Reads | Writes | Caller (UI) | Risk |
|---|---|---|---|---|---|---|
| 1 | `/api/monthly-report/auto-map` | POST | `xero_pl_lines_wide_compat`, `financial_forecasts`, `forecast_pl_lines` | `account_mappings` | `useAccountMappings.ts:84` | HIGH |
| 2 | `/api/monthly-report/snapshot` | GET, POST | `monthly_report_snapshots` | `monthly_report_snapshots` | `ReportHistory.tsx:26`, `useMonthlyReport.ts:402` | HIGH |
| 3 | `/api/monthly-report/wages-detail` | POST | `xero_pl_lines_wide_compat`, `forecast_pl_lines`, `account_mappings`, `forecast_employees`, `financial_forecasts`, `xero_connections` + Xero Employees/PayRuns API | — | `useWagesDetail.ts:20` | **CRITICAL** (payroll) |
| 4 | `/api/monthly-report/commentary` | POST | `xero_connections`, `xero_pl_lines_wide_compat`, `account_mappings`, `monthly_report_settings` + Xero Invoices/BankTransactions | — | `page.tsx:571` (commentary panel) | HIGH |
| 5 | `/api/monthly-report/full-year` | POST | `monthly_report_settings`, `account_mappings`, `financial_forecasts`, `forecast_pl_lines`, `xero_pl_lines_wide_compat`, `business_profiles` | — | `useFullYearReport.ts:15` | HIGH |
| 6 | `/api/monthly-report/account-mappings` | GET | `account_mappings`, `xero_pl_lines_wide_compat` | — | Mapping UI dropdown | MEDIUM-HIGH |
| 7 | `/api/monthly-report/subscription-detail` | POST | `xero_connections`, `xero_pl_lines_wide_compat`, `subscription_budgets`, `account_mappings`, `monthly_report_settings` + Xero API | — | Subscriptions tab | HIGH |
| 8 | `/api/monthly-report/settings` | GET, POST | `monthly_report_settings` | `monthly_report_settings` | Settings form | MEDIUM-HIGH |
| 9 | `/api/monthly-report/templates` | GET | template metadata | — | UI dropdown (likely) | LOW |
| 10 | `/api/monthly-report/debug` | GET | raw finance tables | — | Unknown / ops | **CRITICAL** if exposed |
| 11 | `/api/monthly-report/consolidated-bs` | POST | `xero_bs_lines`, `xero_connections` | — | Balance sheet view | HIGH (TBD) |
| 12 | `/api/monthly-report/consolidated-cashflow` | POST | financial data (TBD) | — | Cashflow view (TBD) | HIGH (TBD) |

Every one of these uses `createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)` — a service-role client that bypasses RLS. There is no `supabase.auth.getUser()` call. The `business_id` is accepted from the request body or URL and queried directly.

---

## What's required to fix (Phase 64a)

Per route, the retrofit is:

1. Switch from `createClient(URL, SERVICE_KEY)` to `createRouteHandlerClient()` (user-scoped, cookie-aware)
2. `const { data: { user } } = await supabase.auth.getUser()` — return 401 if no user
3. Resolve dual business IDs via `resolveBusinessIds(supabase, business_id)`
4. Verify business membership via `auth_can_access_business` (RLS will do this once we're user-scoped — but explicit check returns 403 with friendlier shape)
5. Continue with existing query logic against the user-scoped client (RLS enforces row-level access)

**Per-route effort:** ~30-60 min including writing a test. With 12 routes and a shared helper pattern: **~8-12 hours total** (not the 40hr estimate from the audit's worst case — once the first 3 routes establish the pattern, the rest are mechanical).

---

## Recommended re-scope

### Phase 64a — Auth bootstrap (BLOCKING; ship first)
Close the auth-less route gap. 12 routes affected. Same log-then-enforce pattern as original Phase 64, but the "thing being enforced" is presence-of-auth + business-membership, not section permissions.

- Wave 1: Helper `requireFinanceRouteAuth(supabase, businessId)` + unit tests
- Wave 2: Retrofit all 12 routes to switch to user-scoped client + call the helper in **LOG_ONLY** mode (log when auth is missing, still serve the request so we don't break anyone)
- Wave 3: 24-48h Sentry soak — confirm zero unexpected auth-less hits (any hits are bots / scrapers / accidental leakage we should know about)
- Wave 4: Flip to ENFORCE (return 401/403 when no auth)
- Wave 5: Rollback recipe + PR risk assessment

**Effort:** 1.5-2 days

### Phase 64b — Section permissions (ON TOP OF 64a)
The original Phase 64 scope. Now runs on top of fully-authenticated routes. The plans we already created (64-01 through 64-05) can be largely reused after Phase 64a closes the auth gap — we just renumber to 65-01 etc.

**Effort:** Original 1 day estimate

### Phase 64c — Service-role usage rationalization
After 64a removes service-role from user-facing routes, audit remaining service-role usage to confirm only cron/webhook/admin paths use it.

**Effort:** Half day

---

## Risks during Phase 64a

1. **Some routes may be called by internal scripts or one-off ops tools.** The audit found NO such callers, but a runtime log query during the LOG_ONLY soak window would confirm.
2. **Cookie/session handling differs between routes.** Some use `createRouteHandlerClient`, some use raw `createClient`. The migration must use the same `cookies()` pattern as Phase 61 routes (which work correctly).
3. **RLS may reject queries that previously succeeded via service-role.** This is the WHOLE point — but the LOG_ONLY mode catches it before users see broken pages.
4. **Test fixtures may need updating** — anywhere tests mocked the service-role client directly will need to mock the user-scoped client + auth instead.

---

## What NOT to do

- Don't bundle auth bootstrap + section permissions in one phase. Mixing concerns = blast radius.
- Don't disable the routes outright. They're actively used by the monthly report UI.
- Don't switch to service-role in a "rate-limited" way. Either it's user-scoped or it's not.
- Don't add auth in ENFORCE mode immediately. Log-only first, soak, then enforce.

---

*Audit compiled 2026-05-14, applies to commit `7b00d39a` (post-Phase-61 merge). Re-verify route inventory at execution time.*
