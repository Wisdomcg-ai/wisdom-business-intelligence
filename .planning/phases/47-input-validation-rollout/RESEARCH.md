# Phase 47: Input Validation Rollout - Research

**Researched:** 2026-06-01
**Domain:** Next.js 15 App Router request validation (Zod v4) + observe→enforce middleware rollout
**Confidence:** HIGH (every finding grounded in real files at cited line numbers; zod v4 API verified by running the installed package)

## Summary

The codebase has **130** `route.ts` files under `src/app/api/**` (PHASE.md says 120 — see the count reconciliation note below). **90** export a mutating verb (`POST`/`PUT`/`PATCH`/`DELETE`) and read a body via `await request.json()`; **40** are GET-only, of which **26** still read `searchParams`. Zod `4.1.13` is installed (`package.json` pins `^4.0.17`) and imported in **0** source files — confirmed by `grep -rln "from 'zod'" src/` returning 0.

Handler signatures are **not uniform**, and this is the single most important design constraint for `withSchema`. Two axes of variation: (1) the request arg is typed `NextRequest` in 71 routes and plain `Request` in 35; (2) dynamic-segment routes pass a second `ctx` arg whose `params` is sometimes a `Promise` (Next 15 canonical — `src/app/api/forecast/[id]/route.ts:11` → `{ params: Promise<{ id: string }> }`) and sometimes a sync object (legacy — `src/app/api/coach/clients/[id]/route.ts:7` → `{ params: { id: string } }`). `withSchema` MUST be generic over both the request type and the entire `ctx` arg, forwarding `ctx` untouched, or it will break 22 dynamic-param routes.

The Sentry path is already standardized (Phase 46 SEC-07): `import * as Sentry from '@sentry/nextjs'` then `Sentry.captureException(err, { tags: { route: '<id>' }, extra: { context: '...' } } as any)` — 440 such calls exist. The observe-mode `zod:would-reject` signal should reuse exactly this shape. The dominant error response shape is `NextResponse.json({ error: <string> }, { status })` — 140 routes return the `{ error: 'Unauthorized' }, 401` form; enforce-mode 400 should match this envelope (`{ error: 'Validation failed', issues: ... }`).

**Primary recommendation:** Build `withSchema<TBody, TArgs extends unknown[]>(schema, handler)` as a thin generic HOF that parses the JSON body once, branches on a module-level `isEnforced(routeId)` check reading `process.env.ZOD_ENFORCE_ROUTES`, and forwards the original request + spread `ctx` args to the inner handler. Default = observe (log-and-continue with raw body). Wrap body-bearing routes only; for GET/query routes use a sibling `withQuerySchema` or accept a `{ query }` option. Do NOT touch handler bodies beyond adding the wrapper (PHASE.md "no signature changes").

> **Count reconciliation (HIGH):** `find src/app/api -name route.ts | wc -l` = **130**, not 120. The audit and PHASE.md success criterion (`grep -rln "withSchema(" ... == 120`) predate ~10 routes added since 2026-04-28. The planner should treat the success criterion as "every body-bearing/query route in the *current* tree" and update the literal `120` to the live count at plan time (re-run the find). Of the 130, the meaningful target for schemas is the **90 body-parsing routes** plus the **26 GET-routes-with-query** = 116 with real input; the other 14 GET routes have no request input and need only a trivial `z.object({})` or can be skipped from the body sweep.

## Project Constraints (from CLAUDE.md / MEMORY)

- **Only push to the `wisdom-business-intelligence` remote.** Verify before pushing (MEMORY: `feedback_git_remote.md`).
- **Go deep before deploying** — trace root cause, plan before coding (MEMORY: `feedback_testing.md`). For Phase 47 this means: enumerate every route's *actual* body shape before writing its schema; do not guess.
- **Executors run scoped tests** — after a cross-route rollout, run the **full** `vitest` locally before pushing; ignore local-only timezone-shaped failures (MEMORY: `feedback_executor_scoped_tests.md`). Critical here: a 116-route sweep touches many files; a scoped run will miss regressions.
- **Verify executor schema deviations** — if an executor's SUMMARY swaps a table/column, grep the baseline schema before merge (MEMORY: `feedback_executor_schema_deviations.md`). Applies if any schema author infers a DB column that does not exist.
- **Atomic commit/PR per plan; risky deploys outside AU/NZ business hours** (STATE.md v1.1 decisions). Observe-mode is zero-blast so timing is relaxed; enforce-mode flips (VALID-06) should follow the AU/NZ window rule.
- `eslint` is now a build-time gate (Phase 44-02) — new files must be lint-clean. `tsc --noEmit` must pass.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VALID-01 | Build `src/lib/api/with-schema.ts` (`withSchema(schema, handler)`; observe logs `zod:would-reject` to Sentry + continues with raw body; enforce returns 400 via `ZOD_ENFORCE_ROUTES`) | §"Architecture Patterns" Pattern 1+2; §"Code Examples"; Sentry shape verified at `team/invite/route.ts:556`; zod v4 `flatten()`/`issues` verified live |
| VALID-02 | Schemas on 5 read-only routes | All 5 exist (verified). `coach/stats`, `notifications`, `health`, `admin/check-auth`, `cfo/summaries`. 26 GET routes read `searchParams` → need `withQuerySchema` variant |
| VALID-03 | Schemas on 8 admin-write routes | All 8 exist (verified). `coach/clients/[id]` uses the **legacy sync-params** signature (`:7`) — wrapper must handle it |
| VALID-04 | ~25 forecast/consolidation/Xero write routes | Live counts: forecast/forecasts mutating = 14, Xero/* mutating = 9, consolidation/* mutating = 6 = **29** write routes in these trees |
| VALID-05 | Sweep remaining ~80 | Remaining body routes = 90 − (8 admin + 29 financial) ≈ 53 mutating + 26 query GETs ≈ 79 remaining-with-input |
| VALID-06 | Flip to enforce via `ZOD_ENFORCE_ROUTES` | §"Architecture Patterns" Pattern 2 — comma-separated route-id allowlist; route id = the `tags.route` value already used in Sentry calls |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | 4.1.13 (installed; `^4.0.17` pinned) | Schema parse/validate at the route boundary | Already a dependency; de-facto TS validation standard; `.safeParse` gives non-throwing branch needed for observe mode |
| @sentry/nextjs | (installed, used in 440 sites) | Structured-logging sink for `zod:would-reject` | Phase 46 SEC-07 made it the canonical sink; observe signal is invisible without it |
| next | 15 (App Router) | Route handler runtime | Defines the `(request, ctx)` signature the wrapper must preserve |

**No new dependencies required.** Everything is already installed.

### Zod v4 specifics worth noting (verified by running `node -e` against `zod@4.1.13`)

- `schema.safeParse(data)` → `{ success: true, data }` or `{ success: false, error }`. **Use `safeParse`, never `parse`** — observe mode must not throw.
- `result.error.issues` is the array of issues. Issue shape (v4): `{ expected, code, path, message }` — e.g. `{"expected":"string","code":"invalid_type","path":["a"],"message":"Invalid input: expected string, received number"}`. Note v4 messages read "Invalid input: expected string, received number" (different wording from v3).
- `result.error.flatten()` **still exists and works** in v4 — returns `{ formErrors: [], fieldErrors: { a: [...] } }`. VALID-01's spec says "returns 400 with `error.flatten()`" — that is valid. (v4 also ships top-level `z.flattenError(error)` and `z.treeifyError(error)`; `.flatten()` is the legacy-but-supported instance method. Recommend `error.flatten()` to match the requirement text verbatim, or `z.flattenError(error)` if you prefer the non-deprecated form — both produce identical output.)
- Async refinements (`.refine` with a promise) require `safeParseAsync`. The wrapper should call `safeParseAsync` to be future-proof for any route that needs an async refinement, OR keep `safeParse` for simplicity since no current schema needs async. **Recommend `safeParseAsync`** — it accepts sync schemas too, costs nothing, and avoids a future footgun.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| zod | valibot / yup | Rejected — zod already in deps and unused is the whole point; adding a lib contradicts the phase |
| `Sentry.captureException` for would-reject | `Sentry.captureMessage` / `Sentry.addBreadcrumb` | `captureMessage` is arguably cleaner semantically (a would-reject is informational, not an exception). 34 `addBreadcrumb` sites exist. **Recommend `Sentry.captureMessage('zod:would-reject', { level: 'warning', tags: { route, invariant: 'zod_would_reject' }, extra: { issues } })`** so it is searchable but not paged as an error. See §"Code Examples". Either works; captureMessage avoids polluting the error rate that the SEC-07 alerting watches. |

## Architecture Patterns

### Recommended file layout
```
src/lib/api/
├── with-schema.ts        # VALID-01: withSchema + withQuerySchema + isEnforced helper
├── fetch.ts              # (exists)
└── xero-client.ts        # (exists)
src/lib/api/__tests__/    # OR src/__tests__/lib/api/  — see Testing section
└── with-schema.test.ts
```
Schemas themselves live co-located next to each route (e.g. `src/app/api/team/invite/schema.ts`) or inline in the route file. Co-located keeps the schema and handler in sync; inline is lower-friction for the 116-route sweep. **Recommend inline `const BodySchema = z.object({...})` at the top of each route** for the sweep, since PHASE.md forbids signature/structure churn and a separate file per route is churn. The success grep is `grep -rln "withSchema(" src/app/api/` which only needs the call site, not a separate schema file.

### Pattern 1: `withSchema` — body validation wrapper (VALID-01)

**What:** A generic HOF that reads `request.json()` once, validates against the Zod schema, and either (observe) logs + calls the handler with the raw parsed body, or (enforce) returns 400 on failure / the validated body on success.

**Concrete TypeScript signature** (handles both `NextRequest`/`Request` and any `ctx` shape, sync or `Promise` params):

```typescript
// Source: synthesized from Next 15 route signatures observed at
//   src/app/api/forecast/[id]/route.ts:9-12 (Promise params)
//   src/app/api/coach/clients/[id]/route.ts:6-8 (sync params)
//   src/app/api/team/invite/route.ts:28 (plain Request, no ctx)
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import type { ZodType } from 'zod'

type RouteHandler<TBody, TArgs extends unknown[]> = (
  request: Request | NextRequest,
  body: TBody,
  ...rest: TArgs
) => Promise<Response> | Response

export function withSchema<TBody, TArgs extends unknown[]>(
  routeId: string,                 // matches the Sentry tags.route value, e.g. 'team/invite'
  schema: ZodType<TBody>,
  handler: RouteHandler<TBody, TArgs>
) {
  return async (request: Request | NextRequest, ...rest: TArgs): Promise<Response> => {
    // parse body once (see Pitfall: body can only be read once)
    let raw: unknown
    try {
      raw = await request.json()
    } catch {
      raw = undefined          // empty/invalid JSON body — let schema decide
    }

    const result = await schema.safeParseAsync(raw)

    if (result.success) {
      return handler(request, result.data, ...rest)
    }

    // parse failed
    if (isEnforced(routeId)) {
      return NextResponse.json(
        { error: 'Validation failed', issues: result.error.flatten() },
        { status: 400 }
      )
    }

    // observe mode: log and continue with the RAW body (zero behaviour change)
    Sentry.captureMessage('zod:would-reject', {
      level: 'warning',
      tags: { route: routeId, invariant: 'zod_would_reject' },
      extra: { issues: result.error.issues, path: routeId },
    } as any)
    return handler(request, raw as TBody, ...rest)
  }
}
```

**Critical signature note:** the inner handler receives the **parsed body as an explicit 2nd argument** rather than re-reading `request.json()`. This solves the "body can only be read once" problem (Pitfall 1) AND means the route handler must change its first lines from `const body = await request.json()` to accepting `body` as a param. That is technically a signature change to each handler — but a mechanical, low-risk one. **Two options for the planner:**

- **Option A (recommended): pass parsed body as 2nd arg** (above). Each route's `export async function POST(request)` becomes `export const POST = withSchema('id', Schema, async (request, body) => {...})` and the in-body `await request.json()` line is deleted. Cleaner, no double-read, but edits the handler's body-read line.
- **Option B (zero handler edits): re-inject via a cloned Request.** Wrapper reads `request.clone().json()` to validate, leaves the original `request` body stream intact, and calls the unchanged handler `(request, ...rest)`. Handler still does its own `await request.json()`. Pro: literally zero handler-body churn (best fit for PHASE.md "no signature changes"). Con: body is parsed twice (negligible cost for small JSON), and `request.clone()` must happen before any read. See Pitfall 1.

**Recommend Option B for the VALID-05 bulk sweep** (80 routes, minimize churn/risk) and Option A is acceptable for the hand-touched VALID-02/03/04 routes if the executor prefers explicit bodies. Pick ONE and apply uniformly to keep the success grep clean. Given PHASE.md's hard "no signature changes, no auth-pattern changes" constraint, **Option B is the safer default for the whole phase.**

Option B signature:
```typescript
export function withSchema<TArgs extends unknown[]>(
  routeId: string,
  schema: ZodType,
  handler: (request: Request | NextRequest, ...rest: TArgs) => Promise<Response> | Response
) {
  return async (request: Request | NextRequest, ...rest: TArgs): Promise<Response> => {
    let raw: unknown
    try { raw = await request.clone().json() } catch { raw = undefined }
    const result = await schema.safeParseAsync(raw)
    if (!result.success) {
      if (isEnforced(routeId)) {
        return NextResponse.json(
          { error: 'Validation failed', issues: result.error.flatten() }, { status: 400 })
      }
      Sentry.captureMessage('zod:would-reject', {
        level: 'warning',
        tags: { route: routeId, invariant: 'zod_would_reject' },
        extra: { issues: result.error.issues },
      } as any)
    }
    return handler(request, ...rest)   // original request, original body stream intact
  }
}
```
This is the **minimal-churn** form: it validates a clone, logs/blocks, and hands the untouched `request` to the existing handler. The handler keeps its own `await request.json()`. Enforce returns 400 before the handler ever runs.

### Pattern 2: `ZOD_ENFORCE_ROUTES` + `isEnforced` (VALID-06)

**Route identifier:** reuse the value already passed as `tags.route` in every Sentry call — e.g. `'team/invite'`, `'forecast/quarterly-summary'`. It is the path under `src/app/api/` with `/route.ts` stripped, no leading slash. This id already exists at 440 call sites, is stable, human-readable, and unambiguous across the 130 routes. Pass it as the first arg to `withSchema`.

**Env var format:** comma-separated list of route ids, e.g.
```
ZOD_ENFORCE_ROUTES=health,coach/stats,notifications,admin/check-auth,cfo/summaries
```
Special sentinel `*` = enforce all (useful at phase end when the allowlist should contain all 130 — simpler than listing every id, and matches success criterion #5 "contains all 120 routes"). Recommend supporting both the explicit list and `*`.

```typescript
// Parse once at module load; routes are static, env is set at deploy.
function parseEnforceSet(): Set<string> {
  const raw = process.env.ZOD_ENFORCE_ROUTES ?? ''
  return new Set(raw.split(',').map(s => s.trim()).filter(Boolean))
}

export function isEnforced(routeId: string): boolean {
  // read env each call (cheap) so tests can flip process.env between cases
  const set = parseEnforceSet()
  return set.has('*') || set.has(routeId)
}
```
**Read `process.env` per-call, not cached at module top-level** — otherwise the unit test can't toggle observe↔enforce by mutating `process.env.ZOD_ENFORCE_ROUTES` between cases (Vitest runs in one module instance). The parse cost is trivial.

### Enforce-mode 400 response shape

Match the codebase's dominant envelope `{ error: <string> }` (140 routes use `{ error: 'Unauthorized' }, 401`; 25 use `{ error: 'business_id is required' }, 400`). Recommended:
```json
{ "error": "Validation failed", "issues": { "formErrors": [], "fieldErrors": { "email": ["Invalid email"] } } }
```
i.e. `{ error: string, issues: error.flatten() }`, status 400. This is additive — existing FE callers branch on `status`/`error` only (verified pattern), and none parse a `issues` key today, so adding it is safe.

### Anti-Patterns to Avoid
- **`schema.parse()` in observe mode** — throws, breaks the request. Always `safeParse`/`safeParseAsync`.
- **Reading `request.json()` twice without `clone()`** — the second read throws "body already read" (Pitfall 1).
- **Caching the enforce-set at module top-level** — defeats per-test toggling and per-deploy env changes.
- **Changing handler auth/structure while adding the wrapper** — PHASE.md forbids it; Option B keeps handlers untouched.
- **Using `Sentry.captureException` for would-reject** — pollutes the error rate SEC-07 alerts on; use `captureMessage(..., {level:'warning'})`.
- **Applying schemas to internal `.json()` calls** — 35 of the `.json()` hits are `await xeroResp.json()` / `await authResponse.json()` (parsing *upstream* responses, not the inbound request). Only wrap the **inbound** `request.json()` boundary. The 90 "mutating + body" count is the correct target, not raw `.json()` occurrences.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Field validation / type coercion | Manual `if (!body.email \|\| typeof body.email !== 'string')` | `z.object({...}).safeParse` | The current `if (!businessId \|\| !firstName \|\| !email \|\| !role)` at `team/invite/route.ts:59` is exactly the hand-rolled pattern the phase replaces |
| Error message formatting | Custom issue→string mapper | `error.flatten()` / `error.issues` | zod v4 ships structured, i18n-ready issues |
| Body double-read guard | Manual stream buffering | `request.clone()` before first read | Web platform primitive; no edge cases |
| Logging sink | New logger | `Sentry.captureMessage` (SEC-07 standard) | Already the canonical sink; observe signal must land where alerting/searches already point |

**Key insight:** The whole phase IS "stop hand-rolling validation." The wrapper is the only new abstraction; everything else (Sentry, error envelope, route ids) reuses existing standards.

## Runtime State Inventory

> Code/config-only phase. No data migration. Inventory included for completeness per the rename/refactor checklist — but Phase 47 renames nothing and stores nothing.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — schemas validate in-flight request bodies; nothing persisted. | None |
| Live service config | **`ZOD_ENFORCE_ROUTES` is a Vercel env var** set per-environment (not in git). VALID-06 flips routes by editing it in the Vercel dashboard/CLI. | Set `ZOD_ENFORCE_ROUTES` in Vercel (prod + preview). Observe mode = var absent/empty (zero behaviour). Document the route-id list. |
| OS-registered state | None. | None |
| Secrets/env vars | `ZOD_ENFORCE_ROUTES` (non-secret, route allowlist). No new secret. | Add to Vercel env; mirror in `.env.example` if one exists. |
| Build artifacts | None — no package rename, no egg-info/compiled artifacts. | None |

**Operational note:** because enforce is env-gated, a 400-regression is reversible by removing a route id from `ZOD_ENFORCE_ROUTES` and redeploying env (no code deploy) — matches PHASE.md "reversible by removing the route from the env-var list."

## Common Pitfalls

### Pitfall 1: Request body can only be read once
**What goes wrong:** `await request.json()` consumes the body stream. A second `await request.json()` (e.g. wrapper reads it, then the handler reads it again) throws `TypeError: Body has already been read`.
**Why it happens:** Web `Request`/`NextRequest` bodies are single-use `ReadableStream`s.
**How to avoid:** Either (Option A) read once in the wrapper and pass the parsed body as an argument; or (Option B, recommended for churn-minimization) read `request.clone().json()` in the wrapper so the original stream stays intact for the handler. `clone()` MUST be called before the original is read.
**Warning signs:** Routes that 500 with "body already read" after wrapping. A unit test that calls the wrapped handler and asserts the inner handler still sees the body catches this.

### Pitfall 2: Empty / non-JSON body throws on `.json()`
**What goes wrong:** Some routes are called with no body or a non-JSON body; `request.json()` rejects.
**Why it happens:** `team/invite` etc. assume a body, but GET-with-query routes and some POSTs have none.
**How to avoid:** Wrap the `.json()` in try/catch → `raw = undefined`, and let the Zod schema decide (`z.object({}).optional()` or a schema that tolerates `undefined`). Shown in both code samples above.
**Warning signs:** A would-reject flood on routes that legitimately take no body — fix by giving them a permissive schema, not by special-casing the wrapper.

### Pitfall 3: GET routes need a *query* schema, not a body schema (26 routes)
**What goes wrong:** 40 routes are GET-only; 26 read `searchParams`. `withSchema` (body) doesn't help them; forcing a body schema produces false would-rejects.
**Why it happens:** The success grep wants `withSchema(` on all 120/130, but read-only routes have no body.
**How to avoid:** Provide `withQuerySchema(routeId, schema, handler)` that validates `new URL(request.url).searchParams` (coerced to an object) instead of the body, with the same observe/enforce branch. VALID-02's 5 routes and 21 other GET routes use this. The 14 GET routes with *no* input get a no-op `z.object({})` query schema (or are excluded from the grep target — planner's call).
**Warning signs:** would-reject events on GET routes complaining "expected object, received undefined."

### Pitfall 4: Heterogeneous handler signatures (the big one)
**What goes wrong:** 22 dynamic-param routes pass a `ctx` 2nd arg; if the wrapper swallows or mis-types it, `await params` breaks. Worse, `params` is `Promise<{id}>` in some files and `{id}` in others.
**Why it happens:** Mid-migration from Next 14→15 param semantics; the codebase has both forms live (`forecast/[id]/route.ts:11` Promise vs `coach/clients/[id]/route.ts:7` sync).
**How to avoid:** Type the wrapper with `...rest: TArgs` (rest/spread) and forward `...rest` verbatim. Never destructure or await `ctx` inside the wrapper. The generic in both code samples does this.
**Warning signs:** Type errors on dynamic routes after wrapping; `params is not a function` / `cannot read id of Promise`.

### Pitfall 5: 130 ≠ 120 — the success criterion count is stale
**What goes wrong:** The phase's success grep hardcodes `== 120`; the live tree has 130 route files. Blindly chasing 120 either leaves 10 routes unwrapped or miscounts.
**How to avoid:** Re-run `find src/app/api -name route.ts | wc -l` at plan time and update the criterion. Define the target as "every route with request input (body OR query) has a `withSchema`/`withQuerySchema` call."
**Warning signs:** grep count plateaus below the live route count.

## Code Examples

### Observe-mode would-reject log (matches SEC-07 Sentry convention)
```typescript
// Source: mirrors src/app/api/team/invite/route.ts:556 (captureException tag shape)
// but uses captureMessage(level:'warning') so it doesn't inflate the error rate.
Sentry.captureMessage('zod:would-reject', {
  level: 'warning',
  tags: { route: 'team/invite', invariant: 'zod_would_reject' },
  extra: { issues: result.error.issues },
} as any)
```
Sentry saved-search for VALID-06 evidence ("7 consecutive days zero events" per route):
`message:"zod:would-reject" AND tags.route:"team/invite"`.

### A concrete schema for the representative offender (`team/invite`)
```typescript
// Source: body destructured at src/app/api/team/invite/route.ts:46-56
const InviteBodySchema = z.object({
  businessId: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().optional(),
  email: z.string().email(),
  phone: z.string().optional(),
  position: z.string().optional(),
  role: z.string().min(1),
  sectionPermissions: z.record(z.string(), z.unknown()).optional(),
  createAccount: z.boolean().optional().default(true),
})
// route becomes: export const POST = withSchema('team/invite', InviteBodySchema, _existingHandler)
```
This replaces the hand-rolled `if (!businessId || !firstName || !email || !role)` at `:59`. In observe mode it logs mismatches; in enforce mode it 400s before any Supabase call.

### Query-schema variant for VALID-02 read routes
```typescript
export function withQuerySchema<TArgs extends unknown[]>(
  routeId: string, schema: ZodType,
  handler: (request: Request | NextRequest, ...rest: TArgs) => Promise<Response> | Response
) {
  return async (request: Request | NextRequest, ...rest: TArgs) => {
    const params = Object.fromEntries(new URL(request.url).searchParams)
    const result = await schema.safeParseAsync(params)
    if (!result.success) {
      if (isEnforced(routeId))
        return NextResponse.json({ error: 'Validation failed', issues: result.error.flatten() }, { status: 400 })
      Sentry.captureMessage('zod:would-reject', {
        level: 'warning', tags: { route: routeId, invariant: 'zod_would_reject' },
        extra: { issues: result.error.issues },
      } as any)
    }
    return handler(request, ...rest)
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `error.flatten()` instance method | `z.flattenError(err)` / `z.treeifyError(err)` top-level fns | zod v4 (2024-25) | `.flatten()` still works (verified); VALID-01 spec text is valid as-written |
| zod v3 issue messages | v4 messages: "Invalid input: expected string, received number" | zod v4 | Don't snapshot-test exact message strings; assert `code`/`path` instead |
| Next 14 sync `params` | Next 15 `params: Promise<...>` (awaited) | Next 15 | Both forms coexist in this repo — wrapper must be param-agnostic |
| Manual `if (!field)` guards | Zod schema at boundary | This phase | The 130-route pattern being replaced |

**Deprecated/outdated:**
- `src/lib/utils/error-tracking.ts` is **stale** — its header comment says "Sentry integration removed — @sentry/nextjs is not installed," but Sentry **is** installed and used in 440 sites. Do NOT route would-reject logging through `errorTracker`; use `Sentry.captureMessage` directly (the SEC-07 canonical path). Flag this file for the planner as a likely Phase-46 cleanup miss; it is out of scope for 47 but should not be imitated.

## Open Questions

1. **Option A (pass body as arg) vs Option B (clone-and-forward) — pick one for the whole phase.**
   - What we know: Option B is zero-handler-churn and best honours PHASE.md "no signature changes"; Option A avoids a second parse and is cleaner for hand-touched routes.
   - What's unclear: whether the executor wants explicit-body handlers for VALID-02/03/04 (more testable) while sweeping VALID-05 with Option B.
   - Recommendation: **Use Option B uniformly.** Lowest risk across 116 routes, satisfies the no-churn constraint, and the second `.json()` parse on a cloned small JSON body is negligible. Revisit only if a route has a huge body.

2. **Should the 14 truly-input-less GET routes count toward the 120/130 grep?**
   - What we know: They have no body and no query. Wrapping them adds a `withSchema`/`withQuerySchema` call for grep-completeness only.
   - Recommendation: Wrap them with a permissive `z.object({})` query schema so the success grep is uniform and a future body addition is auto-validated. Cheap insurance.

3. **`captureMessage` vs `captureException` vs `addBreadcrumb` for the would-reject signal.**
   - What we know: SEC-07 alerting watches the *exception* rate; 440 captureException + 34 addBreadcrumb sites exist.
   - Recommendation: **`captureMessage(level:'warning')`** — searchable and countable for the "7 days zero events" evidence, without inflating the error rate that on-call alerts page on. Confirm with whoever owns the Sentry alert rules before bulk rollout.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| zod | VALID-01..05 schemas | ✓ | 4.1.13 | — |
| @sentry/nextjs | observe-mode logging | ✓ | installed (440 call sites) | — |
| vitest + @vitejs/plugin-react | wrapper unit tests | ✓ | per `vitest.config.ts` (Phase 44 restored) | — |
| Vercel env (`ZOD_ENFORCE_ROUTES`) | VALID-06 enforce flips | ✓ (set at deploy) | — | absent = observe mode (safe default) |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None — fully self-contained, no external services or new installs.

## Validation Architecture

> nyquist_validation key absent from `.planning/config.json` → treated as enabled.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (jsdom env, globals on) — `vitest.config.ts` |
| Config file | `vitest.config.ts` (root); setup `./src/__tests__/setup.ts` |
| Quick run command | `npx vitest run src/lib/api/__tests__/with-schema.test.ts` |
| Full suite command | `npx vitest run` (run full before push — MEMORY `feedback_executor_scoped_tests.md`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VALID-01 | observe mode: parse fail → captureMessage called, handler still runs with raw body, response unchanged | unit | `npx vitest run src/lib/api/__tests__/with-schema.test.ts -t observe` | ❌ Wave 0 |
| VALID-01 | enforce mode (route in `ZOD_ENFORCE_ROUTES`): parse fail → 400 `{error,issues}`, handler NOT called | unit | `... -t enforce` | ❌ Wave 0 |
| VALID-01 | success: valid body → handler called, body intact (no double-read 500) | unit | `... -t "passes through"` | ❌ Wave 0 |
| VALID-01 | `ctx`/params forwarded verbatim (sync + Promise forms) | unit | `... -t params` | ❌ Wave 0 |
| VALID-01 | `isEnforced('*')` enforces all; per-route id matches | unit | `... -t isEnforced` | ❌ Wave 0 |
| VALID-02..05 | every input route wrapped | smoke (grep) | `[ $(grep -rln "withSchema\|withQuerySchema" src/app/api/ \| wc -l) -ge <live count> ]` | n/a |
| VALID-06 | env flip routes return 400 | integration (per route) | route test sets `process.env.ZOD_ENFORCE_ROUTES` then asserts 400 | ❌ per-route |

### Test mocking convention (verified from `forecast/seed-from-prior/__tests__/route.test.ts:21-25`)
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(), captureMessage: vi.fn(), addBreadcrumb: vi.fn(),
}))
// Toggle modes by mutating env between cases (isEnforced reads env per-call):
beforeEach(() => { delete process.env.ZOD_ENFORCE_ROUTES })
// observe test: assert captureMessage called once + inner handler invoked
// enforce test: process.env.ZOD_ENFORCE_ROUTES = 'test/route'; assert 400 + handler NOT called
```
The wrapper is **pure and dependency-light** (only Sentry + zod) → unit-testable without Supabase mocks. Build a fake handler `vi.fn(() => NextResponse.json({ ok: true }))` and a fake `Request` (`new Request('http://x/y', { method: 'POST', body: JSON.stringify({...}) })`). Assert: (1) observe → `captureMessage` called + handler called + handler saw the body; (2) enforce → 400 + handler not called; (3) valid → handler called, no capture.

### Sampling Rate
- **Per task commit:** `npx vitest run src/lib/api/__tests__/with-schema.test.ts`
- **Per wave merge:** `npx vitest run` (full — catches cross-route regressions from the sweep)
- **Phase gate:** full suite green + `tsc --noEmit` + lint clean on touched files before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/lib/api/__tests__/with-schema.test.ts` — covers VALID-01 (observe/enforce/passthrough/params/isEnforced)
- [ ] `src/lib/api/with-schema.ts` — the wrapper itself (VALID-01 deliverable)
- [ ] No framework install needed — Vitest + Sentry mock convention already exist.

## Sources

### Primary (HIGH confidence)
- Live filesystem survey: `find src/app/api -name route.ts` (130), `grep` counts for verbs/json/searchParams/NextRequest-vs-Request/params — all run 2026-06-01.
- `src/app/api/team/invite/route.ts:28,45-64,556` — plain `Request` sig, hand-rolled validation, Sentry tag shape.
- `src/app/api/forecast/[id]/route.ts:9-12` — Next 15 `params: Promise<{id}>`.
- `src/app/api/coach/clients/[id]/route.ts:7` — legacy sync `params: {id}`.
- `src/instrumentation.ts:1,13` — `@sentry/nextjs` register + `captureRequestError`.
- `src/app/api/forecast/seed-from-prior/__tests__/route.test.ts:21-25` — Vitest Sentry mock convention.
- `vitest.config.ts` — framework/aliases/setup.
- zod `4.1.13` API verified by running `node -e` against installed package: `safeParse`, `error.issues` shape `{expected,code,path,message}`, `error.flatten()` output, `z.flattenError`/`z.treeifyError` presence.
- `.planning/phases/47-input-validation-rollout/PHASE.md` — requirements VALID-01..06.
- `.planning/STATE.md` — Phase 46 SEC-07 standardized Sentry; v1.1 decisions (observe→enforce, AU/NZ deploy windows).

### Secondary (MEDIUM confidence)
- `src/lib/utils/error-tracking.ts` — confirmed stale (claims Sentry not installed); flagged, not used.

### Tertiary (LOW confidence)
- None — every claim is file- or runtime-verified.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zod version + API verified by execution; Sentry usage counted in-tree.
- Architecture (wrapper shape, param-forwarding, body-clone): HIGH — both signature forms found live; clone/single-read is a Web platform invariant.
- Route bucket counts (VALID-02..05): HIGH for existence (all named routes verified present) and category totals; the literal "120" success number is MEDIUM (stale vs live 130 — flagged in Pitfall 5).
- Pitfalls: HIGH.

**Research date:** 2026-06-01
**Valid until:** 2026-07-01 (stable domain; re-run the route `find`/`grep` counts at plan time since the tree grows ~weekly).
