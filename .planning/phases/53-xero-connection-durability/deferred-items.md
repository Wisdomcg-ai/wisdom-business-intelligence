# Phase 53 — Deferred Items

## Discovered during 53-05 execution

### Next.js 16 async searchParams migration (out of scope)

The `posttooluse-validate` hook flagged Next.js 16's async `searchParams` in
`src/app/api/Xero/employees/route.ts` lines 82-83. Two reasons this is NOT
addressed in 53-05:

1. **Project is on Next.js ^14.2.35** (per package.json + research doc §5),
   where `new URL(request.url).searchParams` on a `NextRequest` is the
   canonical synchronous pattern for Route Handlers.
2. **Wrong API surface.** The Next 16 async migration applies to the
   page-level `searchParams` prop (`{ params, searchParams }: { params: Promise<...> }`),
   not the WHATWG `URL` object's `searchParams` getter used here.
3. **Scope.** 53-05 explicitly says "don't redesign existing patterns" and
   only adds the Sentry comment marker in employees/route.ts.

If/when this project upgrades to Next.js 16, a separate phase should
codemod every `new URL(request.url).searchParams.get(...)` route handler
across the codebase (~30+ sites). Tracked as a future-phase candidate.
