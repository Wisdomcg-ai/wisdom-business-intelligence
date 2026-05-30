# Testing Patterns

**Analysis Date:** 2026-05-30

---

## Test Framework

**Runner:** Vitest (not Jest)
- Config: `vitest.config.ts` (root)
- Environment: `jsdom` (global)
- React JSX transform: `@vitejs/plugin-react`
- Path alias: `@` → `./src`
- Test includes: `src/__tests__/**/*.test.{ts,tsx}` and `src/**/*.test.{ts,tsx}` (co-located tests in lib/)

**Assertion library:** Vitest built-ins + `@testing-library/jest-dom` (loaded via `src/__tests__/setup.ts`)

**E2E framework:** Playwright
- Config: `playwright.config.ts`
- Test dir: `e2e/`
- Browser: Chromium only
- Build command: `npm run build && npm run start` (production build for realism)

**Run Commands:**
```bash
npx vitest run           # CI — run all unit tests once
npx vitest               # Watch mode
npx vitest run --reporter=dot  # CI reporter (used in GitHub Actions)
npx playwright test e2e/smoke.spec.ts  # Smoke E2E (nightly CI)
npx playwright test      # All E2E
```

---

## CI Pipeline

**GitHub Actions — `supabase-preview.yml`** (runs on every PR to `main`):
| Job | What it checks |
|---|---|
| `migration-check` | Migration filenames match `YYYYMMDDHHMMSS_name.sql` |
| `lint` | `next lint` (ESLint with `next/core-web-vitals`) |
| `typecheck` | `tsc --noEmit` |
| `vitest` | `npx vitest run --reporter=dot` |
| `build` | `next build` with placeholder env vars |

**GitHub Actions — `playwright-nightly.yml`** (scheduled 14:00 UTC daily):
- Runs only `e2e/smoke.spec.ts` (3 tests, no DB, no auth)
- Target: `PLAYWRIGHT_BASE_URL` secret (production or stable preview URL)
- No vitest in this pipeline — unit tests only run on PRs

**No coverage enforcement:** No `--coverage` flag in CI. Coverage thresholds are not configured.

---

## Test File Organization

**Primary location:** `src/__tests__/` — centralized test directory, NOT co-located with source files (except for tests in `src/lib/` subdirectories which ARE co-located).

**Co-located tests in lib:**
- `src/lib/cashflow/engine.test.ts`, `engine.phase282.test.ts`, etc.
- `src/lib/consolidation/*.test.ts`
- `src/lib/monthly-report/shared.test.ts`
- `src/app/api/Xero/pl-summary/__tests__/section-permission*.test.ts`

**`src/__tests__/` subdirectories:**
```
src/__tests__/
├── api/           # Route handler tests (cron auth, Xero sync, data quality)
├── coach/         # Coach UI component tests
├── components/    # React component unit tests
├── finance/       # Pure math helpers (net profit)
├── forecast/      # Wizard step tests, payroll mapping (47 tests)
├── goals/         # Plan period, period-banner tests
├── integration/   # Xero reconciliation fixture-driven gate tests
├── lib/           # Shared lib unit tests (apiFetch, csrf, cron-heartbeat)
├── migrations/    # SQL migration file assertions (static + live-DB)
├── security/      # Dead-code deletion guards
├── services/      # ForecastReadService, historical PL summary, opex classifier
├── sql/           # SECURITY DEFINER function validation (live-DB skippable)
├── utils/         # Encryption, FX consolidation helpers
├── vercel/        # vercel.json ↔ cron route registration parity
├── xero/          # Token manager, sync orchestrator, parsers, fixtures/
└── setup.ts       # Global test setup (stub Supabase env vars)
```

**Total test files:** ~91 in `src/__tests__/` + ~17 co-located in `src/lib/` = ~108 test files.

---

## Test Structure

**Standard suite organization:**
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('SomeUnit — scenario description', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()  // when env mutations affect module-level constants
    process.env.CRON_SECRET = 'test-cron-secret'
  })

  afterEach(() => {
    process.env.CRON_SECRET = ORIGINAL_CRON_SECRET  // always restore env
  })

  it('Test N: description of specific behavior', async () => {
    // arrange
    // act
    // assert
  })
})
```

Test names for critical behaviors follow a numbered convention (`Test 1:`, `Test 2:`) inherited from the phase planning documents, which lets `vitest -t 'Test 4'` filter from planning docs.

**Phase-named tests:** Most `src/__tests__/forecast/` files are named `phase-51-step3-*.test.tsx` etc., explicitly keying to the planning phase that introduced them. This is useful for traceability but makes it harder to understand what behavior is being verified at a glance.

---

## Mocking Patterns

### Module boundary mocking (standard)
```typescript
// Mock the service-role Supabase client entirely
vi.mock('@/lib/supabase/admin', () => ({
  createServiceRoleClient: () => ({ from: supabaseFromMock }),
}))

// Mock Sentry to collect call args for assertion
const captureExceptionMock = vi.fn()
vi.mock('@sentry/nextjs', () => ({
  captureException: captureExceptionMock,
  captureMessage: vi.fn(),
}))

// Mock token-manager but re-export real constants
vi.mock('@/lib/xero/token-manager', async () => {
  const actual = await vi.importActual<any>('@/lib/xero/token-manager')
  return { ...actual, getValidAccessToken: getValidAccessTokenMock }
})
```

### Supabase chainable query mock (common in route tests)
```typescript
const supabaseFromMock = vi.fn()

function mockConnectionsQuery(rows: any[] | null, error: any = null) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ data: rows, error }),
  }
  supabaseFromMock.mockReturnValue(builder)
}
```
This pattern chains `.select().eq()` synchronously and resolves the terminal method. Deeper chains (`.select().eq().eq().maybeSingle()`) require each method to return `this`.

### `vi.hoisted` for env vars that affect module-level constants
```typescript
// Must be before any imports — controls top-level constant evaluation
vi.hoisted(() => {
  process.env.FORECAST_INVARIANTS_STRICT = 'true'
})
```
Used in `src/__tests__/services/forecast-read-service.test.ts` and `cron-refresh-xero-tokens-pre-expiry.test.ts`.

### `vi.resetModules()` for re-import with mutated env
```typescript
beforeEach(() => {
  vi.resetModules()
  process.env.CRON_SECRET = 'test-cron-secret'
})

async function importRoute() {
  vi.resetModules()
  return await import('@/app/api/Xero/sync-all/route')
}
```
Used in route tests where `CRON_SECRET` is deleted/set per test.

### DB mocked vs real
**Mocked (all unit tests):** Supabase is always mocked at the module boundary. No test makes real DB calls in CI.

**Real DB (live-DB tests, skipped in CI):**
- `src/__tests__/migrations/` — use `skipIfNoLiveDb()` helper from `src/__tests__/migrations/_helpers.ts`; run against a real Supabase project when `NEXT_PUBLIC_SUPABASE_URL` is not the placeholder
- `src/__tests__/sql/sec05-input-validation.test.ts` — same skip pattern
- `src/__tests__/migrations/db-06-rls-comments.test.ts` — same

**Skip pattern:**
```typescript
const SHOULD_SKIP = !SUPABASE_URL || SUPABASE_URL.includes('placeholder.supabase.co') || !SERVICE_KEY
const d = SHOULD_SKIP ? describe.skip : describe
```

---

## Fixtures and Factories

**Xero API response fixtures:** JSON files in `src/__tests__/xero/fixtures/`
- Real Xero API responses captured from production tenants (JDS, Envisage, IICT-HK)
- Used by reconciliation gate tests (`src/__tests__/integration/xero-reconciliation-gates.test.ts`)
- Naming: `{tenantSlug}-{reportType}-{YYYY-MM-DD}.json`

**Test data factories:**
```typescript
function fakeRow(overrides: Partial<any> = {}) {
  return {
    id: overrides.id ?? 'conn-1',
    business_id: overrides.business_id ?? 'biz-1',
    tenant_id: overrides.tenant_id ?? 'tenant-1',
    tenant_name: overrides.tenant_name ?? 'Tenant One',
    expires_at: overrides.expires_at ?? new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  }
}
```
Inline factory helpers (not in a shared file) — each test file defines its own.

---

## Coverage

**Requirements:** None enforced. No `--coverage` flag in `vitest.config.ts` or CI.

**View coverage:**
```bash
npx vitest run --coverage
```
(Coverage reporter not configured — would use default `v8`.)

---

## Test Types

**Unit tests (91+ files):**
- Pure function tests: parsers (`pl-single-period-parser`, `bs-single-period-parser`, `trialbalance-parser`), math helpers (`net-profit.test.ts`), encryption, classifier
- Route handler tests: mock all I/O, assert HTTP status + response body shape + Sentry calls
- React component tests: `@testing-library/react` with jsdom; wizard step components (50+ in `forecast/`)
- Service tests: `ForecastReadService`, `ForecastReadService` invariants, `HistoricalPLSummary`

**Integration tests (fixture-driven):**
- `src/__tests__/integration/xero-reconciliation-gates.test.ts`: 4 accounting gates (PL vs FY oracle, BS articulation, trial balance balance, BS balance equation) run against real Xero JSON fixtures for JDS, Envisage, IICT-HK tenants

**E2E tests:**
- `e2e/smoke.spec.ts`: 3 tests — homepage loads, auth/login page renders, coach/login page renders. No DB, no auth. Runs nightly against production URL.
- `e2e/coach-flow.spec.ts`: All tests are `test.fixme(...)` — not currently runnable. Requires a seeded test Supabase project that has never been provisioned.

**Migration tests (static + live-DB):**
- Assert migration SQL files exist, contain expected patterns, and (when live DB is available) have been applied correctly.

---

## Coverage Gaps — Stability-Critical Areas

The following areas have **zero or near-zero automated test coverage** and represent the highest regression risk for WisdomBI stability:

### 1. Auth/Access Control (HIGH RISK)
- `src/app/api/Xero/employees/route.ts` — **no auth check in production, zero test coverage**
- `src/app/api/monthly-report/templates/route.ts` — **no auth check, zero test coverage**
- `src/app/api/goals/route.ts` — ad-hoc access check differs from `verifyBusinessAccess`; no test
- `src/app/api/kpis/route.ts` — uses wrong local `verifyBusinessAccess`; no test for the access logic
- No test verifies that `verifyBusinessAccess` (canonical) actually blocks cross-tenant access

### 2. Dual-ID Resolution (HIGH RISK)
- `resolveBusinessIds()` (`src/lib/utils/resolve-business-ids.ts`) — **zero test coverage**
- `resolveXeroBusinessId()` (`src/lib/utils/resolve-xero-business-id.ts`) — zero test coverage
- The module-level `Map` cache in `resolve-business-ids.ts` has no test that it survives warm invocations correctly
- No test for the case where `businesses.id` and `business_profiles.id` differ (the dual-ID failure mode)

### 3. RLS Enforcement (HIGH RISK)
- Zero tests verify that RLS policies actually block cross-tenant queries
- Migration tests assert RLS policies *exist* (names, comments) but not that they *work*
- `src/__tests__/migrations/db-06-rls-comments.test.ts` only checks comment presence
- No test uses a non-owner user and verifies the row is hidden

### 4. Xero Token Refresh (WELL COVERED — but gaps)
**Covered:**
- `src/__tests__/xero/token-manager.test.ts` — race closure, retry policy, deactivation
- `src/__tests__/api/cron-refresh-xero-tokens.test.ts` — all 9 scenarios including SEC-02
- `src/__tests__/api/cron-refresh-xero-tokens-pre-expiry.test.ts` — pre-expiry warning + heartbeats

**Gap:** No test for the full Xero OAuth callback flow (`src/app/api/Xero/callback/route.ts` — 483 lines, zero tests). This is the connection establishment path.

### 5. Money Math (PARTIALLY COVERED)
**Covered:**
- `src/__tests__/finance/net-profit.test.ts` — 5-bucket formula with real tenant numbers
- `src/__tests__/xero/pl-reconciler.test.ts`, `pl-by-month-parser.test.ts`, `pl-single-period-parser.test.ts`
- Reconciliation gate tests (fixture-driven, 4 accounting invariants)

**Gap:** No test for the `opex-classifier` edge cases specific to COGS vs OpEx boundary (`src/__tests__/services/opex-classifier.test.ts` exists but focus is on Xero type mapping, not dollar amounts). No test for the balance-sheet parser's net-assets calculation under non-standard Xero layouts.

### 6. Cron Auth — Loose Form (KNOWN GAP)
- `src/__tests__/api/xero-sync-all-cron-auth.test.ts` tests SEC-02 against `Xero/sync-all` route
- **No SEC-02 regression test for**: `cron/sync-all-xero`, `cron/reconciliation-watch`, `cron/weekly-digest`, `cron/daily-health-report` — all use the loose auth form

### 7. Large Route Files (ZERO COVERAGE)
- `src/app/api/Xero/subscription-transactions/route.ts` (1387 lines) — zero tests
- `src/app/api/Xero/callback/route.ts` (483 lines) — zero tests
- `src/app/api/Xero/balance-sheet/route.ts` (484 lines) — zero tests
- `src/app/api/Xero/sync/route.ts` — zero tests
- `src/app/api/monthly-report/` (most routes) — zero tests

### 8. Section Permission Gate (PARTIALLY COVERED)
- `src/app/api/Xero/pl-summary/__tests__/` — 2 test files covering LOG_ONLY and ENFORCE modes
- **No tests** for section gates in: `forecast/quarterly-summary`, `forecast/seed-from-prior`, `forecast/cashflow/settings`

### 9. E2E / Full Stack (EFFECTIVELY ZERO)
- All `e2e/coach-flow.spec.ts` tests are `test.fixme` — they never run
- No test seeding infrastructure exists (no `supabase/seed-test.sql`)
- The "coach saves to correct business" multi-tenant isolation bug class has no automated coverage

---

## Mocking Philosophy Notes

All service dependencies (Supabase, Sentry, Xero API via `global.fetch`, token-manager) are mocked at the module boundary in every test. This keeps tests fast and hermetic but means:

- Tests assert the contract between the code and its mocked dependencies, not against a real DB
- A bug that only manifests under real RLS (e.g. a policy grants more than intended) is invisible to the test suite
- Real-token rotation behavior is only exercised by the token-manager unit tests, not by any integration path

The `src/__tests__/xero/fixtures/` real JSON responses from production tenants are the closest the suite gets to integration testing for the Xero parsing pipeline.

---

*Testing analysis: 2026-05-30*
