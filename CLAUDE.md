# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

WisdomBI — a business-coaching + CFO SaaS platform. Coaches manage multiple
client businesses; the platform pulls live financials from Xero, builds monthly
reports, financial forecasts, consolidated multi-entity reports, goals, and
coaching workflows. Target end users are "not numbers people" — **simplicity
beats completeness** in every UX decision.

Production tenants (treat their data as real money — CFO-level accuracy expected):
- **Dragon** — AUD, 2 entities, consolidation
- **IICT** — NZ + HK, 3 entities, consolidation, multi-currency FX
- **Fit2Shine** — coaching
- **Just Digital Signage (JDS)** — Aeris Solutions Pty Ltd

## Tech stack

- **Next.js 14** (App Router) · React 18 · TypeScript 5
- **Supabase** (`@supabase/supabase-js` v2, `@supabase/ssr`) — Postgres + Auth + RLS
- **Vercel** — hosting; `main` auto-deploys to production on merge
- **Xero** (`xero-node` v13) — OAuth, financial data source
- **Sentry** (`@sentry/nextjs`) — error tracking + observability
- **Zod** v4 · **Tailwind** v3 · **Resend** v6 (email) · **Vitest** v4 · **Playwright** (e2e)
- `@anthropic-ai/sdk` — AI features (narrative generation, etc.)

## Commands

| Task | Command |
|------|---------|
| Dev server | `npm run dev` |
| Build | `npm run build` |
| Lint | `npm run lint` |
| Typecheck | `npx tsc --noEmit` |
| Unit/integration tests | `npm test` (`vitest run`) — or `npx vitest run <path>` |
| E2E | `npm run test:e2e` (Playwright) |
| Full local gate | `npm run verify` (build + lint + smoke-test) |

CI gates on every PR: `build`, `lint`, `typecheck`, `vitest`, `migration filenames`,
`Supabase Preview` (applies migrations to a preview branch), `Vercel` (preview deploy).
**Always run the full `npx vitest run` locally** after touching a shared
helper/import — scoped test runs miss cross-file regressions.

## Layout

- `src/app/` — App Router routes. `api/` holds route handlers; UI routes grouped by
  area (`coach/`, `finances/`, `cfo/`, `dashboard/`, `goals/`, …).
- `src/lib/` — domain logic: `xero/`, `consolidation/`, `monthly-report/`,
  `permissions/`, `supabase/`, `finance/`, `services/`, `utils/`.
- `src/components/` — React components. `src/hooks/`, `src/contexts/`, `src/types/`.
- `src/__tests__/` and co-located `*.test.ts` / `__tests__/` dirs.
- `supabase/migrations/` — SQL migrations; `00000000000000_baseline_schema.sql`
  is the authoritative baseline.
- `.planning/` — GSD workflow artifacts (see below). Not application code.
- Import alias: `@/` → `src/`.

## Critical domain knowledge — read before touching finance/Xero/auth code

**Dual business ID system.** `businesses.id` and `business_profiles.id` are
different UUIDs for the same tenant. Passing the wrong one silently breaks Xero
lookups and access checks. Always resolve through the canonical resolver
(`src/lib/utils/resolve-business-ids.ts` / `src/lib/business/resolveBusinessId.ts`)
before querying — never trust a raw `business_id` from a request body.

**Xero BS vs P&L classification.** Balance Sheet accounts are bucketed by the
parser/layout; P&L accounts are classified by the catalog `xero_type`. Do not mix
the two — reversing them imbalances the accounting equation.

**Section-permission gate.** `requireSectionPermission` (`src/lib/permissions/`)
gates finance API routes. It MUST receive an **auth-bound** Supabase client
(`createRouteHandlerClient()`), never a service-role client. The canonical
section key is `finances` (the legacy `financials` key is dead). Owners, admins,
coaches, and super-admins bypass the section check.

**Xero OAuth tokens** are AES-256-GCM encrypted. Refresh flows go through the
centralized token-manager — do not hand-roll token refresh.

## Conventions

- **Git / PRs.** PR-first workflow. **Only ever push to the `wisdom-business-intelligence`
  repo** (`Wisdomcg-ai/wisdom-business-intelligence`) — verify the remote before
  any push. Never force-push `main`. Create new commits, don't amend published ones.
- **Deploys are automatic.** Merging a PR to `main` auto-deploys to production via
  Vercel, and the Supabase GitHub integration applies any new migration to the
  production database. Treat a merge as a production change.
- **Migrations** must be idempotent and transaction-wrapped (`BEGIN`/`COMMIT`),
  scoped to named tables. Schedule risky DB changes outside AU/NZ business hours.
- **Behaviour changes** ship behind a feature flag, observe/LOG_ONLY mode, or
  shadow-compute — never a raw cutover on production tenants.
- **Money:** be wary of IEEE-754 float drift in multi-currency consolidation.
- **TypeScript:** strict; `npx tsc --noEmit` must be clean. `@/` import alias.
- **Comments:** default to none; only explain a non-obvious *why*.

## What to avoid

- Don't pass a service-role Supabase client to `requireSectionPermission`.
- Don't query finance data with an unresolved `business_id` (dual-ID trap).
- Don't push to any remote other than `wisdom-business-intelligence`.
- Don't bypass hooks (`--no-verify`) or skip CI gates to "make it pass".
- Don't add raw-SQL instructions to coach/client-facing UI — build the control.
- Don't ship incremental patches before tracing the root cause.

## GSD planning workflow

This project uses GSD (`/gsd:*` commands). Work is organized into phases under
`.planning/phases/`. `.planning/STATE.md` is the current-state index;
`.planning/ROADMAP.md` is the phase list. Code PRs are kept clean of `.planning/`
commits via the pr-branch flow — planning artifacts are committed to `main`
separately. `.planning/` changes are not application code and don't need tests.
