---
phase: 47
slug: input-validation-rollout
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-01
---

# Phase 47 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Nyquist gate: `nyquist_validation` key absent from `.planning/config.json` → treated as ENABLED. This file makes per-requirement coverage explicit (derived from RESEARCH §"Validation Architecture" test-map and each plan's `<verify>` blocks).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (jsdom env, globals on, `@vitejs/plugin-react`, setup `src/__tests__/setup.ts`) |
| **Config file** | `vitest.config.ts` (root) |
| **Quick run command** | `npx vitest run src/lib/api/__tests__/with-schema.test.ts` |
| **Full suite command** | `npx vitest run` (full — required after any cross-route sweep, MEMORY `feedback_executor_scoped_tests`) |
| **Estimated runtime** | ~30-45s full suite |

---

## Sampling Rate

- **After every task commit:** Run the wrapper unit test (`npx vitest run src/lib/api/__tests__/with-schema.test.ts`) plus `npx tsc --noEmit`.
- **After every plan wave:** Run `npx vitest run` (full — catches cross-route regressions from the observe-mode sweep).
- **Before `/gsd:verify-work`:** Full suite green + `tsc --noEmit` clean + lint clean on touched files.
- **Known-ignorable:** the timezone flake at `src/__tests__/goals/plan-period-banner.test.tsx` (MEMORY) — the ONLY tolerated red.
- **Max feedback latency:** 60 seconds.

---

## Requirement → Validation Map

> Every requirement VALID-01..06 maps to its verifying tests/checks. Observe-mode requirements (VALID-02..05) are gated by three layers: (1) **wrapper-present** grep, (2) **tsc + full vitest** green, (3) a **schema-substance spot-check** (Warning B) so a lazy `z.object({}).passthrough()` on every route cannot satisfy the gate. VALID-01 is fully unit-tested; VALID-06 is pinned by a CI integration test plus a human-gated runbook.

| Req ID | Behavior validated | Test Type | Automated Command | Plan | File Exists |
|--------|--------------------|-----------|-------------------|------|-------------|
| VALID-01 | observe mode: parse fail → `Sentry.captureMessage('zod:would-reject', level:'warning')` called once, handler STILL runs with raw body, response unchanged (clone-and-forward, no double-read 500) | unit | `npx vitest run src/lib/api/__tests__/with-schema.test.ts -t observe` | 47-01 | ❌ W0 |
| VALID-01 | enforce mode (route in `ZOD_ENFORCE_ROUTES`): parse fail → 400 `{ error:'Validation failed', issues: <flatten> }`, handler NOT called | unit | `... -t enforce` | 47-01 | ❌ W0 |
| VALID-01 | success: valid body → handler invoked, body stream intact, no capture | unit | `... -t "passes through"` | 47-01 | ❌ W0 |
| VALID-01 | query variant: `withQuerySchema` validates `searchParams`, same observe/enforce branch | unit | `... -t query` | 47-01 | ❌ W0 |
| VALID-01 | `ctx`/params forwarded verbatim for BOTH sync `{params:{id}}` and Promise `{params:Promise<{id}>}` forms | unit | `... -t params` | 47-01 | ❌ W0 |
| VALID-01 | empty / non-JSON body → no throw; schema decides | unit | `... -t "empty"` | 47-01 | ❌ W0 |
| VALID-01 | `isEnforced` reads `process.env` per-call; `'*'` enforces all; comma list trimmed | unit | `... -t isEnforced` | 47-01 | ❌ W0 |
| VALID-02 | all 5 read-only routes carry a wrapper call | smoke (grep) | `[ "$(grep -rln 'withSchema\|withQuerySchema' src/app/api/coach/stats src/app/api/notifications src/app/api/health src/app/api/admin/check-auth src/app/api/cfo/summaries \| wc -l)" -eq 5 ]` | 47-02 | n/a |
| VALID-02 | no behavior change + no cross-route regression | full suite + tsc | `npx vitest run && npx tsc --noEmit` | 47-02 | ✅ existing |
| VALID-03 | all 8 admin/team write routes wrapped; sync-params route (`coach/clients/[id]`) compiles (ctx forwarded) | smoke (grep) + tsc | grep the 8 paths == covered && `npx tsc --noEmit` | 47-03 | n/a |
| VALID-03 | schema-substance spot-check — wrapped write routes have non-empty field schemas (not blanket passthrough) | spot-check (grep) | sample wrapped routes: `grep -A6 "z.object({" <file> \| grep -qE "z\.(string\|number\|boolean\|enum\|array)"` + SUMMARY lists per-route modeled field count | 47-03 | n/a |
| VALID-03 | no behavior change (observe), `team/invite` legacy guard preserved | full suite | `npx vitest run` | 47-03 | ✅ existing |
| VALID-04 | every enumerated financial-write route (forecast/forecasts/Xero/consolidation + cfo/report-status) wrapped; Promise-params routes compile | smoke (loop) + tsc | per-route grep loop over `47-04-ROUTE-LIST.md` && `npx tsc --noEmit` | 47-04 | n/a |
| VALID-04 | schema-substance spot-check — money/id fields modeled (`z.number()`/`z.string()`), not blanket passthrough | spot-check (grep) | sample wrapped financial routes have typed fields; SUMMARY lists per-route modeled field count | 47-04 | n/a |
| VALID-04 | no regression on dense financial suites (forecast 365 + consolidation + Xero) | full suite | `npx vitest run` | 47-04 | ✅ existing |
| VALID-05 | every REMAINING route (per 05a/05b/05c route lists) wrapped at the LIVE count; full-surface grep ≥ live route count | smoke (loop + count) | per-subtree grep loop && `[ "$(grep -rln 'withSchema\|withQuerySchema' src/app/api/ \| wc -l)" -ge "$(find src/app/api -name route.ts \| wc -l)" ]` | 47-05a/b/c | n/a |
| VALID-05 | schema-substance spot-check — sampled wrapped routes have non-empty field schemas; each sub-plan SUMMARY lists per-route modeled field count | spot-check (grep) | `grep -A5 "z.object({" <sampled files> \| grep -qE "z\.(string\|number\|boolean\|enum\|array)"` | 47-05a/b/c | n/a |
| VALID-05 | no cross-route regression across the ~79-route sweep | full suite | `npx vitest run` | 47-05a/b/c | ✅ existing |
| VALID-06 | env-listed route → 400 + handler NOT called; env-absent route → handler called, no 400 (env var is the ONLY control) | integration | `npx vitest run src/lib/api/__tests__/with-schema.enforce.test.ts` | 47-06 | ❌ W0 |
| VALID-06 | staged human-driven flips gated by 7-days-zero Sentry evidence per route, AU/NZ window, instant env rollback | manual (runbook) | see Manual-Only Verifications | 47-06 | n/a |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/api/__tests__/with-schema.test.ts` — covers VALID-01 (observe / enforce / passthrough / query / params / empty-body / isEnforced). Created in 47-01 RED task.
- [ ] `src/lib/api/with-schema.ts` — the wrapper itself (VALID-01 deliverable, 47-01 GREEN task).
- [ ] `src/lib/api/__tests__/with-schema.enforce.test.ts` — pins env-gated 400 for VALID-06 (47-06 Task 1).

*Framework + Sentry-mock convention already exist (`forecast/seed-from-prior/__tests__/route.test.ts:21-25`) — no install step required.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Observe-mode would-reject baseline traffic | VALID-02..05 (Success Criterion #2) | Requires live Sentry data over ~7 days; cannot be asserted in CI | Sentry saved-search `message:"zod:would-reject"`. Confirm events appear across wrapped routes within 7 days of observe rollout — proves wiring; false-positive volume informs schema refinement before enforce. |
| Per-route 7-days-zero evidence before enforce flip | VALID-06 (Success Criteria #3/#4) | 7-consecutive-day Sentry window per route is time-based, operator-driven | Per route: `message:"zod:would-reject" AND tags.route:"<id>"` must show zero events for 7 consecutive days BEFORE adding the id to `ZOD_ENFORCE_ROUTES`. See `47-06-ENFORCE-RUNBOOK.md`. |
| Staged env flip + 24h post-flip watch | VALID-06 (Success Criterion #5) | Vercel env edit is human-only; tenant-impact watch is observational | Append route ids to `ZOD_ENFORCE_ROUTES` in risk-tier order (read-only → admin → financial) in the AU/NZ off-hours window; watch Sentry 24h per tier; rollback = remove id + redeploy env. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (with-schema.ts, with-schema.test.ts, with-schema.enforce.test.ts)
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
