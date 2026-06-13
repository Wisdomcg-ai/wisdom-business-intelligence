# 47-06 (VALID-06) — Enforce-flip bake evidence log

The enforce flip turns observe-mode Zod validation into HTTP 400 rejection. It is
HUMAN-GATED and must NOT be flipped until production traffic proves no legitimate
request would be rejected. This file tracks the bake evidence.

## How enforcement is toggled
- Single env var read live by `src/lib/api/with-schema.ts` → `isEnforced(routeId)`.
- `ZOD_ENFORCE_ROUTES` (Vercel → Production env): empty = observe everywhere;
  comma-list of routeIds = enforce those; `*` = enforce all.
- Rollback is instant: blank the var (or drop a routeId) and redeploy. No code change.

## Instrument trust check (done 2026-06-02)
- Wrapper emits `Sentry.captureMessage('zod:would-reject', { level:'warning',
  tags:{ route, invariant:'zod_would_reject' } })` on a parse miss in observe mode.
- `sentry.server.config.ts` has NO `beforeSend`, NO `ignoreErrors`, NO message
  sampling (only `tracesSampleRate: 0.1`, which applies to performance spans, NOT
  `captureMessage`). → warning messages reach Sentry unfiltered. The bake count is
  trustworthy; a zero is a real zero, not a config artifact.

## Baseline reading (2026-06-02)
- Sentry org `wisdombi`, query `invariant:zod_would_reject`, errors dataset, 30d.
- **Result: 0 `zod:would-reject` events across all routes.**
- BUT full surface (130/130) only went live **2026-06-01** (PRs #269–#272). Bake
  time is ~1 day. Zero is EXPECTED-EARLY, not yet evidence of a clean surface.

## Decision rule before recommending a flip
1. Accumulate ≥ ~1–2 weeks of real production traffic post-2026-06-01.
2. Re-run the Sentry query; bucket events by `route` tag.
3. For each route with events: classify each as
   - genuine bad client → safe to enforce, OR
   - schema too strict → LOOSEN the schema (never alter the wrapper), redeploy,
     let it re-bake.
4. When the only remaining `would-reject` events are genuinely malformed requests,
   flip a small batch of safe, well-understood routes first (e.g. `auth/logout`,
   `notifications`), watch Sentry + Vercel for 400s, then widen in batches, finally
   `*`.

## Recheck
- Earliest meaningful recheck: ~2026-06-15. Re-pull the Sentry tally then.
