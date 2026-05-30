# WisdomBI — World-Class Maturity Assessment

**Assessment date:** 2026-05-31
**Standard applied:** Salesforce / HubSpot enterprise-SaaS bar (security review, SOC 2 / ISO 27001 readiness, product excellence).
**Method:** Firsthand code reading + grep evidence. Every grade is anchored to file:line evidence and cross-referenced to the existing finding catalogue (`CONCERNS.md`, items C-01..C-40) and remediation roadmap (`REMEDIATION-ROADMAP.md`, items R1..R28).
**Mandate:** Diagnosis only — no code changed.

> **Honest headline:** WisdomBI is a **capable, security-aware mid-stage SaaS** with genuinely strong perimeter hardening (CSP, HSTS, RLS on 154 tables, fail-loud secrets) — but it is **not yet at the bar an enterprise security questionnaire would pass** because of a small number of *critical* authz/data-integrity gaps and broad code-maturity debt. Closing the Tier-0 items in the roadmap moves the overall grade from **C- to B+** within one focused phase.

---

## Scorecard Summary

| # | Dimension | Grade | One-line verdict |
|---|-----------|:-----:|------------------|
| 1 | Security & Authorization | **D+** | Strong perimeter, but one unauthenticated service-role CRUD endpoint + inconsistent per-route authz |
| 2 | Identity, Tenancy & RLS | **C** | RLS broad (154 tables) and dual-role aware, but triple business-ID collision undermines the guarantee |
| 3 | Reliability & Disaster Recovery | **C-** | Managed Postgres backups exist; no documented RPO/RTO, non-atomic writes report false success |
| 4 | Observability & Monitoring | **C** | Sentry + cron heartbeats + nightly smoke; no structured logging, no alerting SLOs, 1,627 raw `console.*` |
| 5 | Performance & Scalability | **C-** | In-memory rate limiter + module-cache + per-request schema probes won't survive multi-instance scale |
| 6 | Data Privacy & Compliance | **D+** | Tokens encrypted at rest (good); no retention policy, DSR process, or consistent audit trail |
| 7 | Code Quality & Maintainability | **C-** | 3 live forecast-wizard generations, dual Supabase auth libs, 1,286-line orchestrator with bare catches |
| 8 | Testing & QA | **C** | 144 unit specs (healthy) but only 2 e2e specs and no coverage threshold |
| 9 | CI/CD & Release Engineering | **B** | Real PR gates (lint/typecheck/vitest/build/migration) + Supabase preview branches — best dimension |
| 10 | Supply-Chain Security | **C-** | npm lockfile present; no Dependabot/Renovate, no SCA scan, no SBOM |
| 11 | Secrets Management | **B-** | Env-based, fail-loud in prod, encryption hardened; static PBKDF2 salt is the only residual weakness |
| 12 | Accessibility | **D** | No a11y lint/test tooling; conformance unknown and unmeasured |
| 13 | Architecture & Fork-Readiness | **C-** | Triple-ID coupling + hardcoded brand block clean extraction into inLIFE Pulse |

**Overall maturity: C- (≈2.0 GPA).** "Production-functional, not yet enterprise-certifiable."
**Achievable after Tier-0 + Tier-1 roadmap: B+ (≈3.3).**

Grade key: **A** world-class / audit-ready · **B** strong, minor gaps · **C** functional, material gaps · **D** significant risk · **F** failing.

---

## What is already world-class (credit where due)

These were verified firsthand and should be protected during any fork/refactor:

- **HTTP security headers + CSP** — `src/middleware.ts:182-216`: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS (prod, 1yr + preload), and a real Content-Security-Policy with `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`. This is genuinely above the median SaaS.
- **Fail-loud secrets** — `sentry.server.config.ts:8-10` throws in production if no DSN; `src/lib/utils/encryption.ts:28-32` throws if no `APP_SECRET_KEY`/`ENCRYPTION_KEY`. The previous hardcoded Sentry DSN and `SUPABASE_SERVICE_KEY`-derived encryption fallback have **both been removed** (SEC-04). Credit: prior hardening landed.
- **Encryption at rest** — AES-256-GCM authenticated encryption for Xero tokens (`encryption.ts:9-11`).
- **Broad RLS** — 154 tables with RLS enabled, 397 policies (`baseline_schema.sql`); the access helper is dual-role and dual-ID *tolerant* (`auth_get_accessible_business_ids()` baseline_schema.sql:158).
- **Real CI gates** — `.github/workflows/supabase-preview.yml`: lint + typecheck + `vitest run` + `next build` + migration-filename check, all required on `main`, plus per-PR Supabase preview DB branches and a nightly Playwright smoke (`playwright-nightly.yml`).
- **Repo hygiene recovered** — the macOS `" 2"/" 3"` duplicate-file sprawl and `template.yml` infra-disclosure noted in earlier audits are **gone** (cleaned in #228); `_archive/` is down to 1 file.

---

## Dimension Detail

### 1. Security & Authorization — **D+**
**Evidence**
- 🔴 **Unauthenticated service-role CRUD** — `src/app/api/monthly-report/templates/route.ts:8-11,17-205`: module-level service-role client; GET/POST/PUT/DELETE gate **only on `business_id` presence** — no `getUser()`, no `verifyBusinessAccess()`. Any unauthenticated caller can read/modify/delete any tenant's report templates by guessing a `business_id`. (C-36 / R24.)
- 🟠 Authorization is **per-route and inconsistent**: 63 API-route files instantiate a service-role client (`grep getSupabaseSecretKey|service_role src/app/api` → 63). Authz is hand-rolled in each, so coverage is only as good as the weakest route (the templates route proves the failure mode is real, not theoretical).
- 🟠 Canonical `verifyBusinessAccess()` membership check is status- and role-blind — `src/lib/utils/verify-business-access.ts:48-57` matches any `business_users` row regardless of `status='active'`. A removed/invited-but-not-accepted member still passes. (C-34.)
- 🟢 Perimeter (headers/CSP/HSTS) is strong — see "world-class" section.

**Gap to world-class:** Salesforce/HubSpot enforce authz centrally (policy middleware / row-level + a single guarded data layer), not per-handler. One missed handler = a breach; here one is already missed.
**Close it:** R24 (authenticate the templates route — ship first, it's a live exposure), then R7/R11 — route every privileged read/write through *one* guarded data-access layer that calls `verifyBusinessAccess` with status+role filters.

### 2. Identity, Tenancy & RLS — **C**
**Evidence**
- 🔴 Triple business-ID collision across 98 `business_id` columns; 12 tables measurably mixed (`businesses.id` vs `business_profiles.id` vs polluting user-auth IDs). (C-01 / R1, R14.)
- 🟠 RLS helper appends `auth.uid()::TEXT` in the `_text` variant (`baseline_schema.sql:171`) — a pollution mask that *hides* mis-keyed rows instead of failing. Must be removed only **after** the R14 data cleanse (ordering hazard documented in USER-IMPACT.md). (C-32.)
- 🟢 Helper itself is dual-role + dual-ID tolerant; clean profile rows are correctly visible to all four roles (C-02, corrected).

**Gap to world-class:** A multi-tenant SaaS must have *one* unambiguous tenant key. Three colliding ID-spaces means the tenancy boundary is statistically — not provably — correct.
**Close it:** R1 (canonicalize onto the role-aware `resolveBusinessId.ts` + branded `BusinessId`), R14 (cleanse the 12 mixed tables), then R2/C-32 (remove the mask, add the missing FKs).

### 3. Reliability & Disaster Recovery — **C-**
**Evidence**
- 🟠 **Non-atomic write reports false success** — `src/app/api/monthly-report/sync-xero/route.ts:338-371`: balance-sheet rows are deleted, re-inserted with warning-only error handling, then the route returns `success: true` unconditionally even when the insert failed → silent data loss with a green UI. (C-37 / R25.)
- 🟠 `xero_connections.business_id` has **no FK** (`baseline_schema.sql:5545`) — orphaned connection rows survive tenant deletion; no referential integrity. (C-03 / R3.)
- 🟠 Tenant hard-delete cascades through ~40 tables incl. `xero_pl_lines` history with no soft-delete/restore (`admin/clients/route.ts:545-587`, `ON DELETE CASCADE` baseline_schema.sql:9685). Super-admin-gated, but irreversible. (C-39.)
- 🟢 Supabase provides managed daily backups + PITR (platform-level).
- ⚪ **No documented RPO/RTO, restore runbook, or backup-restore drill** in-repo.

**Gap to world-class:** Enterprise buyers ask for RPO/RTO commitments and evidence of restore testing. None exists. Atomicity (transactions) is missing on the write that matters most (financial data).
**Close it:** R25 (wrap delete+insert in a transaction / return real status), R3 (add FK), document RPO/RTO + run one restore drill, add soft-delete for tenant deletion.

### 4. Observability & Monitoring — **C**
**Evidence**
- 🟢 Sentry wired client/server/edge (`sentry.*.config.ts`), `tracesSampleRate` 0.1 in prod.
- 🟢 Cron heartbeats (`src/lib/cron/heartbeat.ts`) record success/partial/failed per invocation (e.g. `sync-all-xero/route.ts:49-58`); nightly Playwright smoke.
- 🟠 **1,627 raw `console.*` calls** across `src` — no structured/leveled logger, no correlation IDs, no log shipping. Debuggability at scale is poor.
- ⚪ No uptime SLO, no alert routing/on-call runbook, no dashboards-as-code.

**Gap to world-class:** Mature SaaS has structured JSON logs with request/tenant correlation IDs, SLOs, and alerting tied to runbooks. WisdomBI has error capture but not operational observability.
**Close it:** Introduce one structured logger (tenant + request-id context), define SLOs for the 5 crons + report generation, wire heartbeat-miss → alert.

### 5. Performance & Scalability — **C-**
**Evidence**
- 🟠 In-memory rate limiter (`src/lib/security/rate-limiter.ts:23`) resets every cold start and is per-instance — on Vercel's multi-instance Fluid Compute it offers near-zero protection. (C-08.) Client key is `x-forwarded-for` (spoofable, C-13).
- 🟠 Module-level resolver cache (`resolve-business-ids.ts:21`) is role-blind and shared across requests in a warm instance — correctness *and* scale risk. (C-10.)
- 🟠 Per-request schema-detection probe on `strategic_initiatives` (C-09) and serial token refresh loop (C-19) — N+1 / latency under fan-out.
- 🟢 Reads use `cache: 'no-store'` in the factory — but 59+ routes bypass the factory with raw `createClient` (C-07).

**Gap to world-class:** Rate limiting and caching must be shared-state (Redis/Upstash) and request-scoped. Current design is single-instance-shaped.
**Close it:** Move rate limiting to a shared store, make the resolver cache request-scoped, replace schema probes with known columns, batch the token refresh.

### 6. Data Privacy & Compliance — **D+**
**Evidence**
- 🟢 Xero OAuth tokens encrypted at rest (AES-256-GCM).
- 🟠 Audit-logging library exists (`src/lib/audit/index.ts`) but has **1 caller** and uses the anon/RLS client — it is not a tamper-resistant, system-wide audit trail. `activity_log.business_id` is `text` with no FK (C-18).
- ⚪ No documented data-retention policy, data-subject-request (DSR/GDPR/CCPA) process, PII inventory, or DPA-ready sub-processor list in-repo.
- ⚪ Report share tokens never expire (`report-token.ts:6-7`, C-15) — financial reports shareable forever.

**Gap to world-class:** Enterprise/SOC 2 requires a PII inventory, retention schedule, immutable audit log, and a DSR runbook. These are absent.
**Close it:** Expiring share tokens (R-share), a single server-side audit writer on a service-role-only table, document retention + DSR. (Highest leverage for closing enterprise security questionnaires.)

### 7. Code Quality & Maintainability — **C-**
**Evidence**
- 🟠 **3 live forecast-wizard generations coexist** — `ForecastWizard.tsx`, `ForecastWizardV2.tsx`, `wizard-v4/ForecastWizardV4.tsx` (+ `api/forecast-wizard-v4`). Maintenance and fork surface multiplied.
- 🟠 **Dual Supabase auth libraries** — 5 files still import deprecated `@supabase/auth-helpers-nextjs` (`forecasts/scenarios/route.ts`, `wizard-v4/.../AICFOPanel.tsx`, `todos/MorningRitual.tsx`, `todos/hooks/useMorningRitual.ts`, `todos/CoachDashboard.tsx`) vs 15 on modern `@supabase/ssr`.
- 🟠 `sync-orchestrator.ts` is 1,286 lines with 11 bare `catch{}` blocks (C-16) — swallowed failures.
- 🟢 Branded ID types exist (`src/lib/types/ids.ts`) but adopted in only ~4 files (C-33).

**Gap to world-class:** One canonical implementation per feature, one client library, no swallowed errors.
**Close it:** Retire V1/V2 wizards, complete the `@supabase/ssr` migration, break up the orchestrator, propagate branded types (R7).

### 8. Testing & QA — **C**
**Evidence**
- 🟢 144 unit/integration specs (`*.test.ts(x)`) against 1,132 src files — a real, non-trivial suite.
- 🟠 Only **2 e2e specs**; no coverage threshold configured in `vitest.config.ts`; no a11y or load tests.
- 🟢 Tests are a required PR gate.

**Gap to world-class:** Critical financial flows (sync, report generation, money math) need e2e + a coverage floor that fails CI on regressions.
**Close it:** Add e2e for the 4×2 role×ID matrix (already specified in the roadmap) and a coverage threshold on `src/lib/{kpi,consolidation,xero}`.

### 9. CI/CD & Release Engineering — **B**
**Evidence**
- 🟢 `supabase-preview.yml`: 5 required gates (migration-check, lint, typecheck, vitest, build) running in parallel on every PR touching code/migrations; Supabase auto-creates a preview DB per PR; nightly Playwright smoke against prod/preview.
- 🟠 No staged rollout / canary (Vercel Rolling Releases available, unused); no automated rollback runbook; no coverage gate.

**Gap to world-class:** Add progressive delivery (canary), a documented rollback, and a coverage gate. The foundation is already strong — this is the closest-to-A dimension.

### 10. Supply-Chain Security — **C-**
**Evidence**
- 🟢 Single committed `package-lock.json` (deterministic npm installs).
- 🔴 **No Dependabot/Renovate** (`.github/dependabot.yml`/`renovate.json` absent), **no SCA scan** (`npm audit`/Snyk/Socket) in CI, no SBOM, no pinned GitHub Action SHAs verified.
- ⚪ No provenance/signing.

**Gap to world-class:** Enterprise security reviews require automated dependency-vuln management and an SBOM. None present.
**Close it:** Enable Dependabot (or Renovate) + `npm audit --audit-level=high` as a CI gate + generate an SBOM on release. Low effort, high enterprise-sales signal.

### 11. Secrets Management — **B-**
**Evidence**
- 🟢 All secrets via env (Vercel), fail-loud in prod (Sentry + encryption). No secrets in repo (prior hardcoded DSN removed).
- 🟠 Encryption key supports hex/base64 *or* a PBKDF2 fallback with a **static, hardcoded salt** `'xero-tokens-salt-v1'` (`encryption.ts:46`) — fine for now but weakens the fallback path; prefer requiring a 32-byte hex/base64 key only.
- ⚪ No documented key-rotation procedure for `APP_SECRET_KEY`.

**Gap to world-class:** Managed KMS + documented rotation. Current state is good for a SaaS of this size; rotation runbook is the main gap.

### 12. Accessibility — **D**
**Evidence**
- 🔴 No `eslint-plugin-jsx-a11y`, no `axe`/`@axe-core`, no a11y tests in `package.json`. Conformance to WCAG 2.1 AA is **unmeasured**.

**Gap to world-class:** Enterprise (esp. public-sector / large orgs) require a VPAT / WCAG AA statement. Cannot be produced today.
**Close it:** Add `eslint-plugin-jsx-a11y` + axe smoke in Playwright; baseline-measure before claiming a grade above D.

### 13. Architecture & Fork-Readiness (inLIFE Pulse) — **C-**
**Evidence**
- 🟠 Triple-ID coupling (dimension 2) is the #1 fork blocker — the new product inherits the ambiguity unless R1/R14 land first.
- 🟠 Brand hardcoded — `src/lib/email/resend.ts:7-30` (sender/brand), plus `wisdombi.ai` URL fallback in 6 routes (C-26/C-27). A fork can't cleanly re-brand without code edits.
- 🟠 Onboarding enforcement is effectively a **no-op for client users** — `src/middleware.ts:159-179` bypasses coaches/super-admins and then *falls through* with no redirect that forces profile/assessment completion. A forked product expecting onboarding to gate access would ship a hole.

**Gap to world-class:** Clean fork needs a single tenant key, externalized branding/config, and enforced onboarding.
**Close it:** R1/R14 (IDs), R7 (brand decouple → config), re-enable onboarding enforcement for clients.

---

## Prioritized Remediation Roadmap (enterprise-sales weighted)

Ordered by **(enterprise-security-review impact × live-user safety) ÷ effort**. Cross-refs to existing roadmap items.

### Phase 0 — Live exposure, ship this week (S effort, high impact)
1. **Authenticate `monthly-report/templates`** — add `getUser()` + `verifyBusinessAccess()` to all 4 verbs. *(C-36 / R24. Live unauthenticated CRUD — fix before anything else.)*
2. **Make BS sync atomic + truthful** — transaction-wrap delete+insert; return real status. *(C-37 / R25.)*
3. **Enable Dependabot + `npm audit` CI gate** — pure config, no runtime risk, immediate questionnaire win. *(Dimension 10.)*

### Phase 1 — Fork gate + authz correctness (M effort)
4. **Canonicalize business ID** onto `resolveBusinessId.ts` + branded `BusinessId`; retire the two role-blind resolvers. *(C-01/C-10/C-11 / R1, R7.)*
5. **Fix `verifyBusinessAccess` membership filter** — require `status='active'` + intended roles. *(C-34.)*
6. **Add FK on `xero_connections.business_id`** + activity_log. *(C-03/C-18 / R3.)*
7. **Shared-store rate limiter** (replace in-memory). *(C-08/C-13 / R8.)*

### Phase 2 — Data integrity cleanse (M–L, ordering-sensitive)
8. **Cleanse 12 mixed-ID tables** (R14) → **then** remove the `auth.uid()::TEXT` mask (C-32). *Hard ordering — never reverse (see USER-IMPACT.md).*
9. **Expiring report share tokens** + server-side audit writer on a service-role-only table. *(C-15/C-18 — privacy/compliance.)*

### Phase 3 — Enterprise readiness & polish (ongoing)
10. Structured logging + SLOs + alert routing (dim 4); e2e for 4×2 role×ID matrix + coverage gate (dim 8); retire V1/V2 wizards + finish `@supabase/ssr` migration (dim 7); a11y tooling baseline (dim 12); document RPO/RTO + key-rotation + DSR/retention (dims 3, 6, 11); externalize branding for inLIFE Pulse (dim 13).

---

## Bottom line for an enterprise buyer's security questionnaire

| Question they will ask | Today's honest answer |
|---|---|
| Is every API authorized? | **No** — one unauthenticated service-role endpoint exists (Phase 0 #1 fixes it). |
| Is tenant isolation provable? | **Partially** — RLS is broad but the triple-ID collision makes it statistical, not provable (Phase 1–2). |
| RPO/RTO + tested restore? | **Undocumented** — managed backups exist, no drill (Phase 1–3). |
| Dependency-vuln management? | **None automated** (Phase 0 #3 — easy win). |
| Audit trail + data retention/DSR? | **Minimal** (Phase 2–3). |
| WCAG AA / VPAT? | **Unmeasured** (Phase 3). |
| Encryption, headers, secrets? | **Strong** — credit the prior hardening. |

**Verdict:** Not certifiable today, but the gap is **narrow and well-understood**. Phase 0 removes the one live exposure; Phase 0–2 (one focused engineering phase) raises the platform to a credible **B+** that survives an enterprise security review. *No code was changed in producing this assessment.*

---

## Target-Grade Plan (per dimension)

> **Principle:** Do not optimise for a 4.0 GPA. Drive to **A only where a breach or a lost deal lives**, stop at **B+** where the grade builds trust without a recurring tax, and **consciously defer** the rest until a *named, revenue-bearing* deal triggers it. For a founder-led product with ~27 tenants, every dimension pushed into permanent-maintenance territory is a permanent tax on velocity and on the inLIFE Pulse fork.

**Trigger legend:** **NOW** = do in the current engineering phase · **FORK** = required before/with the inLIFE Pulse split · **SALES-LED** = start only when a specific deal is gated on it · **OPP** = opportunistic / cheap-now, finish-later.
**Cost type:** **one-time** (finite code change, stays done) vs **recurring** (program that renews — compliance, drills, a11y re-testing).

| # | Dimension | Now | **Target** | Trigger | Cost type | Why this target (not higher) |
|---|-----------|:--:|:--:|:--:|:--:|------------------------------|
| 1 | **Security & Authorization** | D+ | **A** | NOW | one-time | Non-negotiable. One missed handler = breach; one already exists. Central guarded data layer + every route authorized. |
| 2 | **Identity / Tenancy / RLS** | C | **A** | NOW + FORK | one-time | "CFO-grade" requires *provable* tenant isolation. Your recurring incidents live here. Fork doubles the payoff — fix once, both products inherit it. |
| 3 | **Reliability & DR** | C- | **B+** | NOW (integrity) / SALES-LED (drills) | mixed | Atomic financial writes + FKs = **A-worthy and one-time → do now**. Formal RPO/RTO *tested* restore drills are recurring → write the policy now (OPP), run drills only when a deal asks. |
| 4 | **Observability & Monitoring** | C | **B+** | NOW | one-time | Structured logging + SLOs on the 5 crons + report gen is enough to operate safely. Full APM/dashboards-as-code is diminishing returns at this scale. |
| 5 | **Performance & Scalability** | C- | **B+** | NOW | one-time | Shared-store rate limiter + request-scoped resolver cache + kill the schema probes. A-grade load engineering is premature for 27 tenants. |
| 6 | **Data Privacy & Compliance** | D+ | **B-** (audit-*ready*) → A | OPP now / SALES-LED for cert | recurring | Do the cheap parts now: expiring share tokens, one server-side audit-log table, a written retention/DSR policy. **SOC 2 / ISO is a funded program — start only when a named deal pays for it.** |
| 7 | **Code Quality & Maintainability** | C- | **B+** | NOW + FORK | one-time | Retire V1/V2 wizards, finish `@supabase/ssr` migration, break up the 1,286-line orchestrator. Cleaner fork surface; A-grade purity isn't worth the chase. |
| 8 | **Testing & QA** | C | **B+** | NOW | one-time | e2e for the 4×2 role×ID matrix + a coverage floor on `lib/{kpi,consolidation,xero}`. 100% coverage is a vanity metric. |
| 9 | **CI/CD & Release Engineering** | B | **A** | OPP | one-time | Already closest to A. Add canary (Vercel Rolling Releases) + a written rollback + coverage gate — small lift, high signal. Worth the last mile. |
| 10 | **Supply-Chain Security** | C- | **B+** | NOW | mostly one-time | Dependabot + `npm audit` CI gate = cheap, big questionnaire win. SBOM/signing only if SALES-LED. |
| 11 | **Secrets Management** | B- | **B+** | OPP | one-time | Require 32-byte hex/base64 key (drop the static-salt PBKDF2 path) + a written rotation runbook. Managed KMS (A) only if SALES-LED. |
| 12 | **Accessibility** | D | **C** (measured) → A | OPP now / SALES-LED for VPAT | recurring | Add `eslint-plugin-jsx-a11y` + axe smoke to *measure* (D→C). A WCAG AA VPAT is a recurring program — public-sector/large-org deal only. |
| 13 | **Architecture & Fork-Readiness** | C- | **B+** | FORK | one-time | Falls out of #1/#2/#7 + externalise branding (`resend.ts`, URL fallbacks) and re-enable client onboarding. Required before inLIFE Pulse, not before. |

### The shape of the plan
- **Drive to A (3):** Security (#1), Tenancy (#2), CI/CD (#9). *These are where breaches, your incident history, and the cheapest last-mile win sit.*
- **Drive to B+ (7):** Reliability, Observability, Performance, Code Quality, Testing, Supply Chain, Architecture. *Strong, finite, no recurring tax.*
- **Measure then defer (3):** Privacy/Compliance, Secrets-to-KMS, Accessibility. *Do the cheap "audit-ready" parts now; pull the certification/VPAT trigger only SALES-LED.*

### Resulting GPA
- **After NOW + FORK work:** ~**B+ (3.3)** overall — survives an enterprise security review, clean fork.
- **Cost to get there:** the existing Phase 0–2 roadmap (days for Phase 0, one focused engineering phase for 1–2). **No new recurring overhead** until a deal justifies it.
- **The deliberately-unbought grade:** straight-A across all 13 would add SOC 2 + VPAT + DR-drill programs — **months of recurring cost for grades no current customer requires.** That budget is better spent on the fork and on serving the 27 tenants.

### Decision rule to reuse
> **Fix the line items losing money or trust to A. Take the rest to "good" (B+). Buy "perfect" (A on the recurring dimensions) only when a customer's signature is waiting on it.**
