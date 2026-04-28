# Phase 46: Server-Side Hardening

**Milestone:** v1.1 — Codebase Hardening
**Status:** Not started
**Source:** `CODEBASE-AUDIT.md` Top-10 #2, #5, #6, #7, #8 (Security findings), written 2026-04-28

## Goal

Close internal-only security gaps with no contract change. Clients can't tell the difference; the next pen-test can. Net result: dead super-admin attack surface deleted, every cron route fails closed, encryption keys are explicit, and errors actually reach Sentry.

## Why now

- These fixes are individually small but compound the security posture (audit pillar 1 of 10).
- Done after Phase 44 (CI enforcing) so each refactor is validated by tests + build automatically.
- Done before Phase 47 (Zod rollout) because Phase 47's `zod:would-reject` events use `Sentry.captureException` — SEC-07 must adopt structured Sentry-first logging *first* for VALID-01's observe-mode logs to be useful.

## Dependencies

- **Phase 44 (Test Gate & CI Hardening).** CI must be enforcing before security refactors land — encryption-key changes and middleware edits need the typecheck/build/test gate to catch regressions.

## Blast Radius

**Low — internal only.** SEC-01 deletes routes that already return errors today (the RPCs they call don't exist). SEC-02/SEC-04/SEC-08 fail closed where they previously failed open — this is correctness, not a contract change. SEC-07 changes log destinations, not log content. No client-facing UI or API contract change. SEC-04 (encryption-key hardening) requires `APP_SECRET_KEY` to be set explicitly in production — coordinate with Vercel env-var deploy step.

## Requirements (1:1 from REQUIREMENTS.md)

- **SEC-01** — Delete `/api/migrate/route.ts` and `/api/migrate/opex-fields/route.ts` — both call non-existent Supabase RPCs (`exec_sql`, `exec`); dead today, prepared attack surface if those RPCs are ever added.
- **SEC-02** — Fix `/api/Xero/sync-all/route.ts:573-580` cron-secret fail-open. Match the daily-health-report pattern — fail closed if `CRON_SECRET` is unset.
- **SEC-03** — Validate plaintext-token migration window in `xero_connections` (one-shot script that asserts every row's `access_token`/`refresh_token` contains `:`).
- **SEC-04** — Remove plaintext-fallback branch from `src/lib/utils/encryption.ts:79-83` (`decrypt()` returns `encryptedData` if it doesn't contain `:`); require `APP_SECRET_KEY` to be set explicitly in production (no `SUPABASE_SERVICE_KEY` derivation).
- **SEC-05** — Add input validation to two SECURITY DEFINER SQL functions: `create_test_user(role)` rejects unknown roles; `create_quarterly_swot(quarter)` rejects out-of-range quarters.
- **SEC-06** — Decide and document the onboarding gate at `src/middleware.ts:173-201` — either re-enable behind `process.env.ONBOARDING_ENFORCED === 'true'`, or delete the dead branch entirely.
- **SEC-07** — Adopt structured logging — pick `Sentry.captureException` as the production error sink; sweep `console.error` calls in `/api/` routes (start with the 28 service-role-using routes); leave `console.log` only behind `NODE_ENV !== 'production'` guards. Delete the unused `src/lib/utils/logger.ts` if not adopted.
- **SEC-08** — Remove the hardcoded fallback Sentry DSN from `sentry.client.config.ts:3`, `sentry.server.config.ts:3`, `sentry.edge.config.ts:3` — fail loudly if `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN` is missing in production.

## Success Criteria (observable)

1. **`/api/migrate/*` returns 404** (because the routes are deleted) — proven by `curl https://wisdombi.ai/api/migrate` post-deploy. (Validates SEC-01.)
2. **`POST /api/Xero/sync-all` without a `CRON_SECRET` env var returns 500 in production**, with no Xero work executed — verified by deliberately unsetting the env var on a preview deploy and replaying the cron payload. (Validates SEC-02.)
3. **The migration-window script over `xero_connections` reports 100% of rows have `:` in both `access_token` and `refresh_token`** before SEC-04 ships; afterward the plaintext-fallback branch is gone and a unit test confirms `decrypt('plaintext-no-colon')` throws. (Validates SEC-03, SEC-04.)
4. **`Sentry.captureException` count climbs from 2 to 28+** (the service-role-using API routes) within a week of SEC-07 deploy, visible in Sentry's "Most Captured" view; `grep -rn "console.error" src/app/api/` drops at least 80%. (Validates SEC-07.)
5. **Production boot fails fast if `APP_SECRET_KEY` or `SENTRY_DSN` is missing** — verified by a deploy-time smoke test that asserts these env vars are set before serving traffic. The middleware onboarding gate either runs in production behind `ONBOARDING_ENFORCED=true` or the commented branch is gone from `src/middleware.ts`. (Validates SEC-04, SEC-06, SEC-08.)

## Evidence in audit

- `src/app/api/migrate/route.ts:37,49` (`rpc('exec_sql')`) and `src/app/api/migrate/opex-fields/route.ts:35` (`rpc('exec')`); zero matches for those RPCs in `supabase/migrations/` (audit Top-10 #2).
- `src/app/api/Xero/sync-all/route.ts:573-580` — `if (cronSecret && authHeader !== ...)`. Compare to `src/app/api/cron/daily-health-report/route.ts:13` (audit Top-10 #5).
- `src/lib/utils/encryption.ts:20-41,79-83` — plaintext fallback + service-key derivation (audit Top-10 #7).
- `src/middleware.ts:173-201` — 30 lines of commented onboarding logic with undated TODO (audit Top-10 #8).
- `grep -rln "from '@/lib/utils/logger'" src/` returns 0; `grep -rn "console\."` returns 2,012 lines; `grep -rn "Sentry.captureException"` returns 2 (audit Top-10 #6).
- `sentry.{client,server,edge}.config.ts:3` — hardcoded fallback DSN (audit Section A).

## Out of scope for this phase

- CSRF middleware enforcement (deferred until VALID-* lands so Zod can validate the CSRF header alongside the body).
- Distributed rate limiting / Redis (deferred to v1.2).
- `@supabase/auth-helpers-nextjs` → `@supabase/ssr` migration for the 5 remaining callsites (deferred to v1.2).
- Persistent audit log table for super_admin actions (deferred to v1.2).

## Plans

TBD — to be drafted at `/gsd-plan-phase 46`.
