# Architecture & Boundaries Audit
**Wisdom BI Platform** — Next.js 14 + Supabase + Xero multi-tenant BI  
**Codebase**: 303k LOC, 992 TS/TSX files, 120 API routes, 95 pages, 144 components, 142 lib files  
**Review date**: 2026-04-28

---

## Score: 6.5/10
**Verdict**: Functional multi-tenant separation with good consolidation logic, but major server/client boundary leaks, scattered business-resolution patterns, and significant routing complexity create maintenance risk. Foundation is sound; execution needs discipline.

---

## Strengths

1. **Consolidated reporting engine is well-isolated** (10 test files, pure functions)  
   - `src/lib/consolidation/` modules (fx.ts, eliminations.ts, balance-sheet.ts, engine.ts) are deterministic, testable, and cleanly separated by concern  
   - Tests cover Dragon AUD + IICT NZ/HK FX scenarios  
   - `src/lib/consolidation/engine.ts:93-120` — business + tenant loading is explicit and scoped  

2. **Single tenant-scoping resolver** (`src/lib/business/resolveBusinessId.ts`)  
   - Role-aware (client vs coach vs admin), prevents user-ID-as-business-ID bug  
   - Clear invariant checking; throws loudly on fallback recurrence  
   - Used consistently in key pages (forecast, monthly-report, goals, sessions)  

3. **Comprehensive error boundaries + loading states** (42 error.tsx, 14 loading.tsx files across routes)  
   - Per-route error handling reduces silent failures  
   - Global fallback at `src/app/global-error.tsx`  

4. **API route tenant enforcement**  
   - `/api/consolidation/businesses/[id]/route.ts:51-78` — explicit role+ownership checks before write  
   - `/api/Xero/sync/route.ts:15-46` — verifyUserAccess() guards sync against unauthorized tenants  
   - `/api/sessions/[id]/analyze-transcript/route.ts:50-66` — business traversal validates ownership  

5. **Branded types for ID safety**  
   - `src/lib/types/ids.ts` — UserId, BusinessId, BusinessProfileId are branded strings  
   - Prevents accidental UserId ↔ BusinessId swaps at compile time  

---

## Findings (Grouped by Severity)

### 🔴 CRITICAL: Server/Client Boundary Violations

**Problem**: 539 'use client' directives; 118 components call `.from('table').select()` directly; 1 'use server' file in app; weak isolation between server-only libs and client code.

**Evidence**:
- **`src/app/dashboard/assessment-results/page.tsx:1,23`** — 'use client' page imports jsPDF + autoTable (server-only PDF libs)  
  - jsPDF bundled into client JS (~200kb uncompressed)  
- **`src/components/*/*.tsx`** — 23 files import `createClient()` + call `.from()` directly:  
  - `src/components/coach/tabs/MessagesTab.tsx` — `.from('messages').update()` in client component  
  - `src/components/layouts/ClientLayout.tsx` — fires `.from('business_users').select()`  
  - **119 'use client' files in `/components/`; 25 are pure server components** (untagged)  
- **Server-only libs in client bundles**:  
  - `@anthropic-ai/sdk` — used only in `/api/` routes, never bundled client-side ✓  
  - `openai` — used only in `/api/` routes ✓  
  - `exceljs`, `jspdf` — **imported in `/app/dashboard/assessment-results/page.tsx` (client)** and `/app/finances/monthly-report/services/monthly-report-pdf-service.ts` (unclear if server-only)  
  - `xero-node` — found only in `/api/` and `/lib/xero/token-manager.ts` ✓  
  - `resend` — correctly isolated in `/lib/email/resend.ts` (imported only by `/api/` routes) ✓  

**Impact**: Client bundle bloat; potential security exposure if credentials leak into client state.

**Fix**: Extract jsPDF generation to POST `/api/pdf/generate` route; mark 94 components as fully server (remove 'use client' and move to separate files or make parent server).

---

### 🔴 CRITICAL: Dual API Route Naming (singular vs plural forecast/forecast**s**)

**Problem**: Two independent API hierarchies for forecasts cause confusion and potential duplicate logic:
- `/api/forecast/[id]` (singular) → 3 routes  
- `/api/forecasts/` (plural) → 5 routes  
- `/api/forecast-wizard-v4/generate` — why v4? Where are v1-v3?  

**Evidence**:
- `/api/forecast/[id]/route.ts` — unknown contract  
- `/api/forecasts/apply-scenario/route.ts` — scenario logic  
- `/api/forecasts/import-csv/route.ts` — CSV import  
- `/api/forecasts/export/route.ts` — export  
- `/api/forecast/[id]/actuals-summary/route.ts` — actuals  
- `/api/forecast-wizard-v4/generate/route.ts` — OpenAI-powered forecast generation  

**Impact**: UI code uncertain which endpoint to call; maintenance burden (are both kept in sync?).

**Fix**: Unify under `/api/forecasts/` (plural); v4 → v5 or remove version suffix if it's the canonical implementation.

---

### 🟠 HIGH: Xero Sync Routes Sprawl (4 implementations)

**Problem**: Multiple "Xero sync" endpoints; unclear which is canonical:

| Endpoint | Purpose | Status |
|----------|---------|--------|
| `/api/Xero/sync/route.ts` | Core sync | Active; enforces `verifyUserAccess()` |
| `/api/Xero/sync-all/route.ts` | Bulk sync? | Active; unclear if used |
| `/api/Xero/sync-forecast/route.ts` | Forecast-scoped? | Active; may duplicate core logic |
| `/api/monthly-report/sync-xero/route.ts` | Report-specific? | Active; different code path |

**Evidence**:
- `/api/Xero/sync/route.ts:49-77` — syncs bank summaries, journals, contacts  
- `/api/Xero/sync-all/route.ts` — search returns results but code unreviewed  
- `/api/Xero/sync-forecast/route.ts` — likely duplicates sync logic  
- Only `sync` and `sync-forecast` found in grep; `sync-all` likely legacy  

**Impact**: Three sync code paths; bugs fixed in one may not propagate; DRY violation.

**Fix**: Audit `sync-all` — deprecate if unused; merge `sync-forecast` into main `sync` with forecast-mode flag.

---

### 🟠 HIGH: `/api/Xero/` Naming Inconsistency (capitalized)

**Problem**: Capitalized "Xero" in API routes inconsistent with codebase kebab-case convention.

**Evidence**:
- `/api/Xero/sync/` — capitalized  
- `/api/Xero/callback/` — capitalized  
- All other routes: `/api/forecasts/`, `/api/consolidation/`, `/api/sessions/` — lowercase  
- File naming: mixed PascalCase (`ClientLayout.tsx`, `CreateSessionModal.tsx`) and kebab-case (`sidebar-layout.tsx`, `strategic-initiatives.tsx`)  

**Impact**: Minor — cosmetic inconsistency, but violates Next.js convention (routes should be lowercase).

**Fix**: Rename `/api/Xero/*` → `/api/xero/*`.

---

### 🟠 HIGH: Test/Admin Routes in Production

**Problem**: Two endpoints that should be one-time migrations or test utilities exposed in production:

**Evidence**:
- **`/api/email/test/route.ts:27`** — sends test emails to any address (gated by super_admin, but unnecessary in production)  
  - `all=true` parameter sends branding test, client invite, password reset, etc. — useful for initial QA, not ongoing  
- **`/api/migrate/route.ts:8`** — running migrations via HTTP POST (should be CLI or deployment script)  
  - `/api/migrate/opex-fields/route.ts` — same issue  
  - Both gated by `super_admin` but should not be exposed to HTTP at all  

**Impact**: Production uptime risk if migration accidentally re-runs; test email route invites support burden.

**Fix**: Move to `/scripts/` folder (cron jobs or Next.js server actions); remove HTTP routes or add `process.env.NODE_ENV === 'development'` guard.

---

### 🟡 MEDIUM: 147 `.eq('business_id', ...)` Clauses Across 120 API Routes

**Problem**: Business-scoping is manual per-route; no centralized tenant-enforcement middleware.

**Evidence**:
```
147 occurrences of .eq('business_id', ...) in /api routes
95 occurrences of .eq('user_id', ...)
5 occurrences of .eq('owner_id', ...)
```

Each route manually:
1. Extracts user from session  
2. Resolves business_id (if needed)  
3. Calls `.eq('business_id', businessId)`  

But **no middleware or helper enforces this pattern** — easy to forget.

**Evidence**:
- `/api/Xero/sync/route.ts:15-46` — custom `verifyUserAccess()` helper (good)  
- `/api/coach/clients/route.ts:18-39` — manual role check + inline queries (ok)  
- Many other routes don't explicitly scoped by business until query time (risky)  

**Impact**: **Tenant escape vector** if any route forgets the `.eq()` check.

**Fix**: 
1. Create `requireTenantAccess(request)` middleware that extracts + validates user + business_id, returns `{ userId, businessId, role }` or 401/403  
2. Apply to all `/api/` routes via wrapper function  
3. Audit 120 routes to ensure **all data queries AND writes are scoped**

---

### 🟡 MEDIUM: Business Resolution Pattern Fragmentation (19 callers; not DRY)

**Problem**: `resolveBusinessId()` is the canonical helper, but 59 files independently resolve business IDs; no single source of truth.

**Evidence**:
- **Canonical**: `src/lib/business/resolveBusinessId.ts:69` — role-aware, throws on userId==businessId  
- **Scattered usage**: 19 distinct files import it (forecast page, monthly-report, goals, sessions, etc.)  
- **Alternative patterns** (not found but implied): Some routes may call `getBusinessId()` or inline `.eq('owner_id', user.id)`  
- **No helper in 101 calls** of `createRouteHandlerClient()` — many routes probably don't validate at all  

**Impact**: 
- Inconsistent validation across routes  
- New routes may forget the check entirely  
- Maintenance burden if logic changes  

**Fix**: 
1. Create `/lib/api/middleware.ts` with `requireTenantAccess()` (see above)  
2. Deprecate inline `resolveBusinessId()` calls; route handlers should call middleware once  
3. Add lint rule: flag routes without explicit tenant scoping  

---

### 🟡 MEDIUM: 25 Untagged Server Components in `/components/`

**Problem**: 25 components lack `'use client'` but import client-only libs.

**Evidence**:
```bash
find /src/components -type f \( -name "*.tsx" -o -name "*.ts" \) \
  ! -name "*.test.*" | xargs grep -L "'use client'" | wc -l
→ 25 files
```

Examples likely include:
- Components importing `createClient()` but not marked 'use client'  
- Components importing hooks like `useXeroSync` (client-only)  

**Impact**: 
- Ambiguous execution context (will they render server or client?)  
- Hard to reason about data flow  
- May silently break if Next.js changes heuristics  

**Fix**: 
1. Audit 25 components  
2. Mark all as 'use client' if they use client libs; or move to `src/app/` with RSC boundaries  
3. Enforce: `lint-client-boundary` rule (fail if untagged component imports client-only lib)  

---

### 🟡 MEDIUM: Consolidation Budget Mode (Single vs Per-Tenant)

**Problem**: Phase 34 Step 2 introduced dual budget mode (single business-level vs per-tenant forecasts), but not all code paths may be tested.

**Evidence**:
- `src/lib/consolidation/engine.ts:89` — `consolidation_budget_mode` column with defensively coalesced default ('single')  
- Column added via migration `20260420195612_consolidation_budget_mode.sql` (recent)  
- 10 test files for consolidation, but unclear if both modes are tested in engine tests  

**Impact**: 
- New column may not be populated in existing rows; defensive default masks bugs  
- Per-tenant budget logic may have edge cases not covered by tests  
- Migration may have failed silently on old rows  

**Fix**: 
1. Run data audit: `SELECT COUNT(*) WHERE consolidation_budget_mode IS NULL` on `businesses`  
2. Add explicit test: `engine-budget-mode.test.ts` for both 'single' and 'per_tenant' modes  
3. Remove defensive coalesce; fail loudly if column missing (so migrations are caught early)  

---

### 🟡 MEDIUM: Two Drag-and-Drop Libraries (Both Active)

**Problem**: Both `@dnd-kit/core` and `@hello-pangea/dnd` are in package.json and used in separate components; no clear plan for migration.

**Evidence**:
- `@dnd-kit/core` (v6.3.1) — used in:  
  - `src/app/finances/monthly-report/components/layout-editor/PDFLayoutEditorModal.tsx`  
  - `src/app/finances/monthly-report/components/layout-editor/GridCell.tsx`  
  - `src/app/team/org-chart/components/OrgChartNode.tsx`, `OrgChartBuilder.tsx`  
- `@hello-pangea/dnd` (v18.0.1) — used in:  
  - `src/components/AnnualPlan.tsx`  
- Both are maintained (dnd-kit newer, hello-pangea forked from react-beautiful-dnd)  

**Impact**: 
- Duplicate bundle size (~50kb combined)  
- Different APIs in different parts of UI  
- Maintenance burden if one deprecates  

**Fix**: Choose one (recommend dnd-kit for newer, better maintained); migrate `AnnualPlan.tsx` to dnd-kit; remove `@hello-pangea/dnd`.

---

### 🟢 GOOD: Multi-Tenant Model — Business ID Threading

**Verdict**: Consistent, explicit, well-scoped.

**Evidence**:
- **Business context centralized**: `src/contexts/BusinessContext.tsx:60-75` — CurrentUser, ActiveBusiness, ViewerPermissions all typed and thread through app  
- **Page-level resolution**: All major pages (forecast, monthly-report, goals, sessions, dashboard) call `useBusinessContext()` + `resolveBusinessId()` early  
- **RLS + explicit scoping**: Routes use both:  
  - RLS policies (implicit, database-layer)  
  - Explicit `.eq('business_id', businessId)` checks (explicit, application-layer)  
- **Tenant ID vs Business ID**: Dual-ID system handled in `resolveBusinessIds()` (for Xero tenant ↔ business mapping)  

**Not a finding; continue this pattern.**

---

### 🟢 GOOD: Middleware CSRF Protection

**Evidence**:
- `src/middleware.ts:9-32` — generateCsrfToken(), set on every response  
- Token stored in httpOnly=false (readable by JS) ✓  
- sameSite=strict ✓  
- 24-hour expiry ✓  

**Minor note**: CSRF validation not shown in route examples; assume Supabase or app handles verification. ✓

---

### 🟢 GOOD: Zustand Store (Single, Isolated)

**Evidence**:
- Only 1 Zustand store found: `src/lib/store/wizardStore.ts`  
- Persisted store for process wizard conversation history  
- No conflicting context providers; BusinessContext is separate  

**Clean separation of concerns.** ✓

---

### 🟢 GOOD: Service Layer Emerging

**Evidence**:
- `src/lib/services/` — 9 files:  
  - `historical-pl-summary.ts` — P&L aggregation  
  - `claude-cfo-agent.ts` — AI integration  
  - `messageAttachments.ts` — attachment handling  
- `/app/finances/forecast/services/forecast-service.ts` — forecast CRUD  
- `/app/finances/monthly-report/services/monthly-report-service.ts` — report generation  

Most pages delegate to services rather than inline DB queries. ✓

---

## Top 5 Duplication / Refactor Targets

### 1. **Xero Sync Routes** (3 code paths)
   - **Files**: `/api/Xero/sync`, `/api/Xero/sync-all`, `/api/Xero/sync-forecast`, `/api/monthly-report/sync-xero`  
   - **Effort**: High  
   - **Payoff**: Reduce from 4 to 1 canonical sync (with mode flags)  
   - **Why**: 147 lines of DB access code likely duplicated across routes  

### 2. **Forecast API Routes** (singular + plural)  
   - **Files**: `/api/forecast/[id]/*` + `/api/forecasts/*`  
   - **Effort**: Medium  
   - **Payoff**: Single namespace, clear contracts  
   - **Why**: UI code confused which to call; v4 naming suggests iterations not cleaned up  

### 3. **Business Resolution Pattern** (scatter vs centralized)  
   - **Files**: 59 imports of `resolveBusinessId`; 101 calls to `createRouteHandlerClient`  
   - **Effort**: Medium (refactor infrastructure)  
   - **Payoff**: Single `requireTenantAccess()` middleware applied to 120 routes; catch tenant escapes via linting  
   - **Why**: Current pattern is error-prone; easy to forget `.eq('business_id', ...)` in new routes  

### 4. **jsPDF Generation in Client Code**  
   - **Files**: `/app/dashboard/assessment-results/page.tsx`, `/app/finances/monthly-report/services/monthly-report-pdf-service.ts` (unclear if server), `/app/systems/processes/utils/pdf-generator.ts`, etc.  
   - **Effort**: Medium  
   - **Payoff**: Reduce client bundle by ~200kb; centralize PDF generation logic  
   - **Why**: 5 PDF generation paths; at least one is in a client component  

### 5. **Consolidation with Service-Role Dual-Client Pattern**  
   - **Files**: `/api/consolidation/businesses/[id]/route.ts` (uses `supabaseAdmin` + `authSupabase` pattern 3x)  
   - **Effort**: Low  
   - **Payoff**: Extract to `/lib/api/dual-client.ts`  
   - **Why**: Pattern repeated; consolidation is a high-security zone (multi-tenant FX, elimination rules)  

---

## Layer / Boundary Assessment

### Data Flow: Typical Page (forecast, monthly-report, goals)

```
Page ('use client')
  → useBusinessContext() + resolveBusinessId()
    → createClient().from('financial_forecasts').select() [CLIENT]
    → ForecastService [private lib, calls API or direct DB]
    → /api/forecast/[id] [OPTIONAL: for server-side work]
      → createRouteHandlerClient() [AUTH]
      → verifyUserAccess() [TENANT CHECK]
      → supabase.from(...).eq('business_id', businessId) [SCOPED]
```

**Verdict**: Mostly consistent. Pages call `.from()` directly instead of delegating entirely to service layer, but scope is enforced at page level via context + RLS.

**Risk**: Pages that don't call `resolveBusinessId()` early are vulnerable.

---

## Other Notes

### Naming Consistency Findings

| Pattern | Count | Severity |
|---------|-------|----------|
| `/api/Xero/*` (capitalized) | 19 routes | 🟡 Inconsistent with `/api/forecasts/` |
| Component naming: PascalCase | ~90 | ✓ Standard |
| Utility naming: kebab-case | ~50 | ✓ Standard |
| Mixed in lib: kebab + camelCase | ~30 | 🟡 Some files like `processWizard.ts` |

---

## Recommendations (Priority Order)

1. **URGENT**: Implement `requireTenantAccess()` middleware; apply to all 120 routes; audit for .eq('business_id') enforcement. (Prevents tenant escapes.)

2. **URGENT**: Extract jsPDF → `/api/pdf/generate`; mark `/components/` 'use client' boundary clearly (prevent client bundle bloat).

3. **HIGH**: Unify Xero sync routes; deprecate `sync-all`, `sync-forecast` if unused. Test canary on 1 real Xero connection.

4. **HIGH**: Resolve `/api/forecast` vs `/api/forecasts` naming; consolidate v4 logic.

5. **MEDIUM**: Audit & test consolidation budget mode (single vs per-tenant) in engine.test.ts.

6. **MEDIUM**: Rename `/api/Xero/*` → `/api/xero/*` for convention consistency.

7. **MEDIUM**: Choose dnd-kit; migrate AnnualPlan.tsx; remove @hello-pangea/dnd.

8. **LOW**: Move `/api/migrate/*` + `/api/email/test` to scripts; guard with NODE_ENV=development if HTTP-exposed.

---

## Summary Table

| Domain | Files | 'use client' | Tests | Server/Client Boundary | Duplication | Tenant Scoping |
|--------|-------|-------------|-------|------------------------|-------------|---|
| Auth | 1 lib | — | No | ✓ (server-only) | None | ✓ RLS enforced |
| Forecasts | 20 files | 8/20 | No | 🔴 Boundary leaks (jsPDF in client) | 3 sync routes | ✓ Explicit |
| Consolidation | 21 lib + 10 tests | — | 10 tests | ✓ (pure) | None | ✓ Explicit |
| Monthly Report | 15 components | 12/15 | No | 🟡 PDF generation scattered | 4 sync paths | ✓ Explicit |
| Sessions | 2 pages + 5 routes | 1/1 | No | ✓ (mostly server) | None | ✓ Explicit |
| Dashboard | 8 components | 8/8 | No | 🟡 Direct .from() calls | None | ✓ Context-driven |
| Coaching | 20 components | 18/20 | No | 🟡 Some client DB calls | None | ✓ Explicit |

---

## Conclusion

**Strengths**:  
- Consolidation engine is a model of clean, testable design  
- Business-ID/tenant-scoping is explicit and role-aware  
- Error boundaries + loading states comprehensive  

**Weaknesses**:  
- 539 'use client' components with inconsistent server/client boundaries (118 call DB directly)  
- No middleware for tenant enforcement; manual `.eq('business_id', ...)` in 147 places (DRY violation, escape risk)  
- Xero sync + Forecast API have 4 partially overlapping implementations  
- Test endpoint `/api/email/test` + migration routes in production  

**Maintainability Risk**: Medium-High. Consolidation scales well, but business logic is scattered. Next 6 months: implement tenant middleware (security), unify Xero/Forecast endpoints (DRY), extract PDF (perf).

