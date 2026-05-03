# WisdomBI

The internal platform powering Wisdom Business Coaching — financial forecasting, monthly reporting, cashflow planning, and the coach-facing dashboards built around them. Single-tenant per-client; Xero is the source-of-truth for financial data.

## Tech stack

- **Next.js 14** (App Router) — frontend + API routes
- **Supabase** — Postgres, auth, RLS, storage, edge functions
- **TypeScript** — `strict: true`, branded ID types
- **Tailwind CSS** + shadcn/ui-style components
- **Vitest** — unit + integration tests
- **Playwright** — nightly smoke tests against production
- **Sentry** — error tracking + performance
- **Xero SDK** (`xero-node`) — accounting data sync

## Prerequisites

- **Node 20+** (CI uses 20; nothing newer required)
- **npm** (lockfile is npm-managed; do not switch to pnpm/yarn)
- **Supabase CLI** if you need to apply / write migrations: `brew install supabase/tap/supabase`
- A **Supabase project** (dev or your own sandbox; production access is restricted)
- A **Xero developer app** (sandbox tenant) if you'll touch Xero sync code

## First-time setup

```bash
# 1. Clone
git clone https://github.com/Wisdomcg-ai/wisdom-business-intelligence.git
cd wisdom-business-intelligence

# 2. Install
npm install

# 3. Environment
cp .env.example .env.local
# Then fill in the values — see .env.example for what's required vs optional.
# At minimum you need NEXT_PUBLIC_SUPABASE_URL + the two Supabase keys to start.

# 4. Run
npm run dev
# → http://localhost:3000
```

For Xero connectivity (sync, reconciliation, forecasting against real data) you also need `XERO_CLIENT_ID` + `XERO_CLIENT_SECRET` from a Xero developer app pointed at a sandbox tenant.

## Common workflows

```bash
npm run dev              # local dev server (port 3000)
npm run build            # production build (also runs lint + typecheck)
npm run lint             # ESLint (next/core-web-vitals + react-hooks)
npm run test             # vitest (full suite)
npm run test:watch       # vitest in watch mode
npm run test:e2e         # Playwright (against PLAYWRIGHT_BASE_URL)
npm run analyze          # bundle analyzer (ANALYZE=true next build → HTML report)
npm run smoke-test       # ./scripts/smoke-test.sh
npm run verify           # build + lint + smoke-test (pre-push sanity)
```

CI on every PR runs **lint + typecheck + vitest + build** as required status checks on `main`. Anything red blocks the merge.

### Reconciliation tooling (Phase 44.2)

Verify a single tenant's data matches Xero to the cent in production:

```bash
npx tsx scripts/verify-production-migration.ts \
  --business-id=<uuid> \
  --tenant-id=<uuid> \
  --balance-date=YYYY-MM-DD \
  --fy-end=YYYY-MM-DD \
  --fy-start-month-key=YYYY-MM-01 \
  [--include-inactive] [--allowlist=Account1,Account2]
```

Reference invocations for canonical tenants live in the operator's Claude memory at `~/.claude/.../reference_xero_reconciliation_verifier.md`.

## Project structure

```
src/
  app/                        Next.js App Router routes (UI + /api/*)
    api/                      API route handlers (Xero sync, forecast, monthly report, etc.)
    finances/                 Finance-related pages (forecast wizard v4, monthly report, cashflow)
    coach/                    Coach-facing dashboards
    admin/                    Admin tools
  components/                 Shared UI components
  lib/
    services/                 Server-side business logic (forecast-read-service, historical-pl-summary, etc.)
    xero/                     Xero sync orchestrator + parsers + reconciliation gates
    supabase/                 Supabase client factories (admin vs anon)
    consolidation/            Multi-tenant consolidation engine
    cashflow/                 Cashflow forecast engine
  __tests__/                  Vitest suite (mirrors src/ structure)

supabase/
  migrations/                 Canonical migration source (timestamped: 20260430000001_*.sql)

.planning/                    GSD workflow artifacts: phases, plans, summaries, audit reports
  phases/                     Per-phase folders (PHASE.md, NN-PLAN.md, NN-SUMMARY.md)
  STATE.md                    Current milestone position + decisions

scripts/                      One-off CLI tools (verifiers, diagnostics, onboarding scripts)

docs/                         Active reference docs (architecture, design system, business patterns)
  archive/                    Executed plans + dated reports preserved for history
```

## Workflow for new work (GSD)

This repo uses a structured "Get Shit Done" workflow for non-trivial changes:

1. Scaffold a phase folder under `.planning/phases/<NN>-<slug>/` with `PHASE.md` (goal + requirements + success criteria).
2. Run `gsd-phase-researcher` → `RESEARCH.md`.
3. Run `gsd-planner` → `<NN>-NN-PLAN.md`.
4. Run `gsd-plan-checker` → `PLAN-CHECK.md` (PASS / PASS WITH NOTES / BLOCK).
5. Run `gsd-executor` → atomic commits + `<NN>-NN-SUMMARY.md`.
6. Run `gsd-verifier` → `VERIFICATION.md` (GOAL ACHIEVED / NOT ACHIEVED).
7. Open PR; CI gates run; merge.

For small bugs or trivial cleanups, skip the ceremony — direct PR is fine. The artifact trail is for changes where "just trust me" doesn't scale.

See `.planning/STATE.md` for current milestone position. See `.planning/phases/44.2-cfo-grade-xero-reconciliation/` for a worked example of full-ceremony GSD on a complex multi-plan phase.

## Key invariants

- **Xero is source-of-truth for financials.** Every account, every month, every tenant must match Xero to within $0.01. See `src/lib/xero/reconciliation-gates.ts` for the 4 gates enforced on every sync.
- **`data_quality` flag at every read.** The forecast read service returns `verified` / `partial` / `failed` / `no_sync` / `stale`; UI surfaces a `DataIntegrityBanner` when not `verified`.
- **Per-tenant first-class.** Consolidated entities (one business → multiple Xero connections) reconcile per-tenant; worst-of severity rolls up to the business level.
- **Branded ID types.** `BusinessId`, `UserId` etc. enforce compile-time tenant separation. Use `resolveBusinessIds()` for dual-id (`businesses.id` vs `business_profiles.id`) lookups.
- **Migrations live in `supabase/migrations/` only.** The legacy `database/migrations/` directory was removed in Phase 45.

## Where to ask

- **Internal questions:** Matt (mattmalouf@wisdomcg.com.au) or check `.planning/STATE.md` + recent phase SUMMARYs for context on recent decisions.
- **Claude Code helpers:** see `CLAUDE.md` (or per-phase planning docs) for project-specific guidance the editor uses.
- **Bugs / regressions:** open a phase under `.planning/phases/` if non-trivial; otherwise file directly as a PR.
