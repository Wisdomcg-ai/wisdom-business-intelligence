# Testing Patterns

**Analysis Date:** 2026-04-04

## Test Framework

**Runner:**
- No automated test framework is configured (no Jest, Vitest, Playwright, or Cypress)
- No `test` script in `package.json`
- No test configuration files exist at the project root
- `.gitignore` includes `/coverage` directory (suggesting testing was planned but not implemented)

**Assertion Library:**
- None configured

**Run Commands:**
```bash
npm run lint              # ESLint checks (next lint)
npm run build             # TypeScript compilation check
npm run smoke-test        # HTTP smoke test of key routes
npm run verify            # build + lint + smoke-test combined
```

## Test File Organization

**Location:**
- No test files exist in the `src/` directory
- No `__tests__/` directories
- No `*.test.ts`, `*.test.tsx`, `*.spec.ts`, or `*.spec.tsx` files in application code

## Current Verification Approach

The project relies on three manual/scripted verification methods instead of automated tests:

### 1. Smoke Test Script

**File:** `scripts/smoke-test.sh`

Starts the production server and verifies key public routes return expected HTTP status codes:
- `/auth/login` -- expects 200
- `/` -- expects 200
- `/privacy` -- expects 200
- `/terms` -- expects 200

Run via: `npm run smoke-test`

### 2. Pre-Merge Check Script

**File:** `scripts/test-before-merge.sh`

A manual checklist script that runs before merging to main:
- TypeScript compilation (`npm run build`)
- ESLint linting (`npm run lint`)
- Console statement count in source files
- `any` type count check
- TODO/FIXME comment scan
- Secret exposure check (`.env.local` not tracked)
- Large file detection (>200KB in `src/`)
- Unit test runner (checks if `test` script exists -- currently warns "No tests configured yet")

### 3. In-Browser KPI System Test

**File:** `src/components/testing/KPISystemTest.tsx`

A client-side component that runs KPI system health checks in the browser (not an automated test):
- Tests KPI hook loading
- Tests formatting functions
- Tests industry/stage mapping
- Outputs results to browser console and renders in UI

## Mocking

**Framework:** None configured

**Patterns:** Not applicable -- no test files exist

## Fixtures and Factories

**Test Data:**
- No test fixtures or factory functions
- Seed data scripts exist for Supabase: `supabase/seed_demo_account.sql`, `supabase/seed_demo_complete.sql`, `supabase/seed_forecast_assumptions.sql`
- These are database-level seed scripts, not test fixtures

## Coverage

**Requirements:** None enforced
**Coverage tool:** None configured

## Test Types

**Unit Tests:**
- Not implemented

**Integration Tests:**
- Not implemented

**E2E Tests:**
- Not implemented (no Playwright or Cypress)

## What Testing Would Be Most Valuable

Based on the codebase analysis, the following testing priorities would provide the highest value:

### Priority 1: API Route Tests (Integration)

**Why:** API routes contain critical business logic -- auth checks, data access authorization, and multi-tenant data isolation. Bugs here can expose data across tenants.

**Key routes to test:**
- `src/app/api/goals/route.ts` -- business ID resolution and access control
- `src/app/api/business-profile/route.ts` -- profile data access
- `src/app/api/forecasts/` -- forecast CRUD operations
- `src/app/api/admin/` -- admin-only operations
- `src/app/api/coach/` -- coach authorization checks

**Suggested approach:** Vitest with `@supabase/supabase-js` mocked to test auth checks and access control logic without a live database.

### Priority 2: Service Layer Unit Tests

**Why:** Service classes contain core business logic that is already well-separated from UI.

**Key services to test:**
- `src/app/goals/services/financial-service.ts` -- financial data save/load
- `src/app/goals/services/kpi-service.ts` -- KPI calculations
- `src/app/goals/services/strategic-planning-service.ts` -- strategic planning data
- `src/lib/services/issuesService.ts` -- issues CRUD
- `src/lib/services/openLoopsService.ts` -- open loops CRUD
- `src/lib/utils/validation.ts` -- input validation functions
- `src/lib/utils/api-response.ts` -- response formatting

### Priority 3: Hook Tests

**Why:** Custom hooks contain complex state management and business logic.

**Key hooks to test:**
- `src/hooks/useActiveBusinessId.ts` -- business ID resolution for multi-tenant queries
- `src/hooks/useAutoSave.ts` -- debounced auto-save with dirty tracking
- `src/app/goals/hooks/useStrategicPlanning.ts` -- complex multi-ID business logic
- `src/app/dashboard/hooks/useDashboardData.ts` -- dashboard data aggregation

**Suggested approach:** `@testing-library/react-hooks` or Vitest with React testing utilities.

### Priority 4: Permission System Tests

**Why:** The permission system gates access to navigation and features. Bugs can expose or hide functionality incorrectly.

**Key files to test:**
- `src/lib/permissions/index.ts` -- `hasPermission`, `filterNavigationByPermissions`, `shouldShowSection`
- `src/lib/auth/roles.ts` -- `getUserSystemRole`, role-based redirects
- `src/contexts/BusinessContext.tsx` -- `getPermissionsForRole` function

### Priority 5: E2E Smoke Tests

**Why:** The existing shell-based smoke test only checks 4 public routes. Expanding to cover authenticated flows would catch integration issues.

**Suggested approach:** Playwright for critical user journeys:
- Client login and dashboard load
- Coach login and client selection
- Strategic planning wizard save/load cycle
- Forecast creation flow

## Recommended Setup

**Framework recommendation:** Vitest (already compatible with the Next.js + TypeScript stack, faster than Jest)

**Configuration needed:**
1. Install: `npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom`
2. Create `vitest.config.ts` with path aliases matching `tsconfig.json`
3. Add `"test": "vitest"` and `"test:coverage": "vitest --coverage"` to `package.json` scripts
4. Create test utilities for mocking Supabase client

**Test file convention (recommended):**
- Co-locate tests with source: `src/lib/utils/validation.test.ts` alongside `src/lib/utils/validation.ts`
- Use `.test.ts` / `.test.tsx` suffix (matches existing `.gitignore` `/coverage` entry)

---

*Testing analysis: 2026-04-04*
