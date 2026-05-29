# Phase 69: Xero token auto-refresh diagnosis + production durability fix — Context

**Gathered:** 2026-05-30
**Status:** Ready for planning
**Source:** PRD Express Path (this file derived from Phase 70 audit findings + add-phase scope)

<domain>
## Phase Boundary

This is a **production DIAGNOSIS + FIX phase**, not a feature build. Phase 53 already shipped 5 plans of Xero connection durability work (53-01 through 53-05, completed 2026-05-06), including a proactive token refresh cron at `0 */6 * * *` UTC (PR #110). Despite that, the Phase 70 month-end audit on 2026-05-30 found **all 5 sampled production Xero tenants have expired access tokens** (3–7 days expired, one stale 20 days). Phase 53's durability story is regressing in production.

Phase 69 must answer: **why is Phase 53's refresh not keeping tokens alive in production, and how do we fix it permanently?**

This phase covers:
1. Read-only investigation of token-manager + refresh cron + recent commits (auth-lock cap `fec0c1e2`)
2. Inspection of `xero_connections` rows for the 5 known-expired tenants
3. Root-cause documentation
4. Production unblock (manual reconnect of 5 tenants, interactive with Matt approval per tenant)
5. Code fix addressing the root cause
6. Pre-expiry monitoring + alerting (catches future regressions before tokens die)

This phase does NOT cover:
- Calxa migration work (Phase 70+ scope)
- Forecast wizard extended-period bug (separate phase, drafted at docs/phase-69-forecast-wizard-extended-period.md → needs renaming due to numbering collision)
- General Xero feature work (e.g. push-to-Xero, new tenant types)

</domain>

<decisions>
## Implementation Decisions

### Investigation method (locked)
- **Read code before writing**: Phase 53's implementation — `src/lib/xero/token-manager.ts` (776 lines, centralized refresh logic per 53-02), `src/app/api/cron/refresh-xero-tokens/route.ts` (265 lines, the 6-hour cron from 53-04), `src/app/api/Xero/callback/route.ts` (483 lines, OAuth reconnect flow), 53-* SUMMARY docs in `.planning/phases/53-*/`.
- **Recent commit `fec0c1e2`**: "fix(auth): cap supabase-js auth-lock at 10s so stuck sessions self-recover" (PR #229, 2026-05-28). Must understand whether this fix interacts with Xero token refresh — could the lock cap be aborting refresh mid-flight before writes complete?
- **Sentry MCP** (read-only per memory): triage existing Xero refresh errors in production. Use for frequency confirmation, NOT for resolution actions.
- **Data inspection**: query `xero_connections` for the 5 expired tenants. Verify `access_token`, `refresh_token`, `expires_at`, `updated_at`, `last_refresh_attempt`, `refresh_error` (or equivalent columns) for each.

### Known-expired tenants (locked from Phase 70 audit)
| Client | businesses.id | Tenant | Expired |
|---|---|---|---|
| Envisage | 8c8c63b2… | Malouf Family Trust (AUD) | 7d |
| Just Digital | fea253dd… | Aeris Solutions Pty Ltd (AUD) | 4d (last sync 20d ago) |
| IICT | fbc6dffd… | IICT Group Pty Ltd (AUD) | 3d |
| IICT | fbc6dffd… | IICT (Aust) Pty Ltd (AUD) | 3d |
| IICT | fbc6dffd… | IICT Group Limited (HKD) | 3d |

### Production unblock (locked)
- Manual reconnect via the existing OAuth callback flow.
- INTERACTIVE: Matt approves each tenant reconnect individually. No bulk auto-reconnect.
- Document the reconnect runbook in the phase dir so future expiries can be cleared without re-deriving the steps.

### Root cause hypotheses (NOT decisions — for the planner to investigate)
The planner should investigate and identify which (or which combination) of these are the actual root cause. Do not pre-commit to one fix without evidence:
1. **Cron not firing**: Vercel cron schedule misconfigured or disabled
2. **Cron firing but erroring silently**: refresh endpoint throws, no Sentry capture
3. **Refresh succeeding but not persisting**: token written to memory but not back to `xero_connections` (RLS, transaction failure, supabase-js auth-lock interaction)
4. **Refresh threshold too late**: cron only refreshes within 1h of expiry; if cron itself fails once, token already dead by next run
5. **Per-tenant fail-forward gap**: one tenant's refresh failure aborts the whole batch instead of isolating + continuing
6. **Token rotation issue**: Xero returns new `refresh_token` on rotation; if we don't persist it, next refresh fails
7. **fec0c1e2 auth-lock cap regression**: 10s cap aborts a slow refresh write mid-transaction

### Fix decisions (locked principles, not implementation)
- **Fail-loud, not fail-silent**: every refresh failure must surface to Sentry with tenant ID + error class.
- **Per-tenant isolation**: one tenant's refresh failure must not break batch.
- **Persist token rotation**: capture and store `refresh_token` returned in refresh response.
- **Idempotent**: refresh job safe to run twice in same window.
- **Tests**: every code fix must include a regression test that would have caught the failure mode in production.

### Monitoring decisions (locked)
- **Pre-expiry alert**: Sentry alert fires when `expires_at - now() < 24h` AND last refresh attempt did not succeed.
- **CFO dashboard surfacing**: `/cfo` page shows a per-client connection-health pill (already partly exists per 53-05; verify it works, extend if needed).
- **Stale-sync warning**: if `last_synced_at > 48h ago`, show a banner in the per-client monthly-report page.

### Claude's Discretion
- File organization: where to put new monitoring code, whether to extend existing routes or add new
- Test framework choices within existing conventions (vitest is the standard per memory)
- Exact column names if they differ from speculation above — read the schema, don't guess
- Whether the fix needs a migration (e.g. adding a `refresh_failures_count` column) or can be done in code alone

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 53 prior work (the implementation we're debugging)
- `.planning/phases/53-xero-connection-durability/` — all Phase 53 plans + SUMMARY docs
- `src/lib/xero/token-manager.ts` — centralized token refresh (776 lines, per 53-02)
- `src/app/api/cron/refresh-xero-tokens/route.ts` — proactive 6h cron (265 lines, per 53-04)
- `src/app/api/Xero/callback/route.ts` — OAuth reconnect callback (483 lines)
- `vercel.json` — for the cron schedule definition
- Recent commit `fec0c1e2` — supabase-js auth-lock 10s cap (PR #229)

### Phase 70 audit findings (the symptom)
- `docs/phase-70-month-end-audit.md` — full audit including data state for the 5 expired tenants
- `scripts/phase-70-data-audit.mjs` — read-only audit script (re-usable for verification)

### Schema + tenant data
- `xero_connections` table — primary source of truth (read schema from baseline_schema or live DB before assuming column names per memory feedback_executor_schema_deviations)
- `consolidation_groups` + `consolidation_fx_rates` — multi-tenant consolidation (IICT has 3 tenants)

### Project conventions
- `CLAUDE.md` (repo root, if exists) — project guidelines
- Memory: dual-ID lookup (businesses.id vs business_profiles.id) — Xero connections key by `businesses.id`
- Memory: SUPABASE_SECRET_KEY is the canonical env var (legacy SUPABASE_SERVICE_KEY disabled 2026-05-19)
- Memory: executors must run scoped vitest (full suite has timezone-shaped failures safe to ignore)
- Memory: only push to wisdom-business-intelligence repo; never use --no-verify

</canonical_refs>

<specifics>
## Specific Ideas

### Suggested plan breakdown (planner's discretion to merge/split)
- **69-01 — Read-only diagnosis**: read Phase 53 code, query `xero_connections` for 5 tenants, check Vercel cron logs, triage Sentry errors. Output: `69-DIAGNOSIS.md` with named root cause(s) + evidence.
- **69-02 — Manual reconnect runbook + execution**: document the reconnect flow, execute interactively with Matt for the 5 tenants. Output: `69-RECONNECT-RUNBUOK.md` + 5 reconnected tenants verified via test queries.
- **69-03 — Code fix(es) addressing root cause(s)**: scope depends on 69-01 output. Include regression tests.
- **69-04 — Pre-expiry monitoring + alerting**: Sentry alert config + `/cfo` connection-health pill verification + stale-sync banner.

### Test verification requirements
- Regression test for whatever root cause is identified (e.g. if fail-forward gap, test that one tenant's 401 doesn't abort batch).
- E2E or integration test that mocks a near-expiry token and verifies the cron refreshes it.
- Test that token-rotation case is handled (Xero returns new refresh_token in body).

### Acceptance for "fixed"
- All 5 known-expired tenants successfully reconnected and showing valid `expires_at` > 1h from now.
- Cron successfully refreshes a deliberately-near-expiry test token in production (or staging that mirrors production cron config).
- Sentry pre-expiry alert configured and firing on a forced near-expiry scenario.
- Zero regression in existing 53-* tests.

</specifics>

<deferred>
## Deferred Ideas

- Building a self-service "reconnect Xero" button in the coach UI for every connection-health failure mode. The OAuth flow exists; surfacing it more prominently is a Phase 71+ scope (likely part of code-fixes phase).
- Migrating to Xero's newer OAuth scopes or v2 endpoints — out of scope unless evidence shows the current scope is contributing to refresh failures.
- Adding metrics/observability beyond Sentry (e.g. Grafana, custom dashboards) — Sentry alert + /cfo pill is sufficient for v1.

</deferred>

---

*Phase: 69-xero-token-auto-refresh-diagnosis-production-durability-fix*
*Context gathered: 2026-05-30 — derived from Phase 70 audit + add-phase scope*
