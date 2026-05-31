---
phase: 47-input-validation-rollout
plan: 05c
type: execute
wave: 4
depends_on: ["47-01", "47-02", "47-03", "47-04"]
files_modified:
  - "src/app/api/cron/**/route.ts"
  - "src/app/api/auth/**/route.ts"
  - "src/app/api/ai/**/route.ts"
  - "src/app/api/ai-assist/**/route.ts"
  - "src/app/api/chat/**/route.ts"
  - "src/app/api/todos/**/route.ts"
  - "src/app/api/notifications/**/route.ts"
  - "src/app/api/ideas/**/route.ts"
  - "src/app/api/email/**/route.ts"
  - "src/app/api/documents/**/route.ts"
  - "src/app/api/activity-log/**/route.ts"
  - "src/app/api/processes/**/route.ts"
autonomous: true
requirements: [VALID-05]

must_haves:
  truths:
    - "Every UNWRAPPED mutating verb and query GET in the misc subtree (cron, auth, ai, ai-assist, chat, todos, notifications, ideas, email, documents, activity-log, processes) is wrapped in OBSERVE mode"
    - "Verb-level (not file-level) dedup: notifications/route.ts may have been partially wrapped by 47-02 (notifications routeId) — only MISSING verbs/files in notifications are wrapped; an already-wrapped export is NEVER re-wrapped"
    - "Each authored schema models the route's ACTUAL fields (not a blanket z.object({}).passthrough())"
    - "After 05a+05b+05c, `grep -rln \"withSchema\\|withQuerySchema\" src/app/api/ | wc -l` equals the LIVE route count"
    - "Zero behavior change (observe mode, ZOD_ENFORCE_ROUTES empty)"
  artifacts:
    - path: ".planning/phases/47-input-validation-rollout/47-05c-ROUTE-LIST.md"
      provides: "Per-verb checklist for this subtree: file → export → wrapped-already? → schema field count"
      contains: "route.ts"
  key_links:
    - from: "src/app/api/ai/**/route.ts (unwrapped verbs)"
      to: "src/lib/api/with-schema.ts"
      via: "import { withSchema|withQuerySchema }"
      pattern: "from ['\"]@/lib/api/with-schema"
---

<objective>
Sweep the **misc / infra** subtree (VALID-05, slice c of 3): cron, auth, ai, ai-assist, chat, todos, notifications (excluding the already-wrapped notifications routeId), ideas, email, documents, activity-log, processes. Sibling of 47-05a and 47-05b — same wave, no file overlap, parallelizable. This slice owns the FINAL full-surface count check (success criterion #1) because it is the last of the three to define the remaining files. Option B uniformly, observe mode only.

Purpose: Complete observe-mode adoption across the remaining infra/utility surface and confirm the full-surface grep target at the LIVE route count.
Output: Every unwrapped mutating verb + query GET in this subtree wrapped; per-verb checklist; full-surface count met; gates green.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/47-input-validation-rollout/PHASE.md
@.planning/phases/47-input-validation-rollout/RESEARCH.md
@.planning/phases/47-input-validation-rollout/47-01-SUMMARY.md
@.planning/phases/47-input-validation-rollout/47-02-SUMMARY.md

# Wrapper contract from 47-01: withSchema / withQuerySchema, Option B (clone-and-forward). routeId = path
#   under src/app/api, no leading slash.
# CRITICAL — verb-level dedup (BLOCKER 2 fix): 47-02 wrapped the `notifications` routeId. The notifications
#   subtree has 2 route.ts files; if 47-02 wrapped only one verb/file, classify at the EXPORT level
#   (grep -nE "export (async function|const) (GET|POST|PUT|PATCH|DELETE)") and wrap only MISSING verbs;
#   NEVER re-wrap an already-wrapped export (double withSchema = build error).
# RESEARCH Pitfall 3: cron routes are often GET with no body → permissive withQuerySchema(routeId, z.object({})).
# RESEARCH anti-pattern: do NOT wrap upstream-response .json() (await authResponse.json()) — inbound only.
# This is the LAST of the three 05 slices to land; it confirms the full-surface count (criterion #1).
# Sibling slices: 47-05a (admin/coach/clients/sessions/team/monthly-report),
#   47-05b (cfo/goals/kpis/planning/analytics/business-profile/wizards). NO overlap across the three.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Build the per-verb checklist for this subtree</name>
  <files>.planning/phases/47-input-validation-rollout/47-05c-ROUTE-LIST.md</files>
  <action>
    Enumerate this slice's routes:
      find src/app/api/cron src/app/api/auth src/app/api/ai src/app/api/ai-assist src/app/api/chat src/app/api/todos src/app/api/notifications src/app/api/ideas src/app/api/email src/app/api/documents src/app/api/activity-log src/app/api/processes -name route.ts | sort
    For EACH file, list EVERY export with a verb/export-level scan (NOT a file-level grep):
      grep -nE "export (async function|const) (GET|POST|PUT|PATCH|DELETE)" <file>
    Classify each export: (a) already wrapped by 47-02 (the notifications routeId — LEAVE), (b) unwrapped body verb (withSchema, model real fields), (c) query GET (withQuerySchema), (d) input-less GET incl. cron (permissive z.object({})). Record file + routeId + per-export status in 47-05c-ROUTE-LIST.md. Record an expected commit count = one commit per top-level subdir touched.
  </action>
  <verify>
    <automated>test -f .planning/phases/47-input-validation-rollout/47-05c-ROUTE-LIST.md && grep -q "route.ts" .planning/phases/47-input-validation-rollout/47-05c-ROUTE-LIST.md</automated>
  </verify>
  <done>ROUTE-LIST.md lists every export across this subtree with per-verb wrapped/unwrapped classification and an expected per-subdir commit count.</done>
</task>

<task type="auto">
  <name>Task 2: Wrap every UNWRAPPED verb in this subtree (verb-level, never double-wrap)</name>
  <files>src/app/api/cron, src/app/api/auth, src/app/api/ai, src/app/api/chat, src/app/api/email</files>
  <action>
    Work through 47-05c-ROUTE-LIST.md. For each export marked UNWRAPPED only:
    - Body verb: READ the handler, inline `const ...Schema = z.object({...})` modeling the ACTUAL destructured fields (do not guess); wrap via Option B (handler body untouched, keeps its own request.json()).
    - Query GET: `withQuerySchema(routeId, z.object({...matching searchParams...}), handler)`.
    - Input-less GET (cron, etc.): `withQuerySchema(routeId, z.object({}), handler)`.
    - Import from `@/lib/api/with-schema`. routeId = path under src/app/api.
    NEVER re-wrap an export already wrapped by 47-02 (double `withSchema` = build error). NEVER wrap upstream-response `.json()` (`await authResponse.json()`). Observe mode only. No auth/structure changes.
    Commit one batch per top-level subdir, each tsc + lint green. Message: `feat(47-05c): observe-mode schemas — <subdir> routes (VALID-05)`.
  </action>
  <verify>
    <automated>npx tsc --noEmit && for r in $(find src/app/api/cron src/app/api/auth src/app/api/ai src/app/api/ai-assist src/app/api/chat src/app/api/todos src/app/api/notifications src/app/api/ideas src/app/api/email src/app/api/documents src/app/api/activity-log src/app/api/processes -name route.ts); do grep -ql "withSchema\|withQuerySchema" "$r" || { echo "UNWRAPPED FILE: $r"; exit 1; }; done && echo SUBTREE_C_WRAPPED</automated>
  </verify>
  <done>Every file in this subtree carries a wrapper; every previously-unwrapped verb is now wrapped; NO export double-wrapped (tsc/build clean); lint clean; observe mode only.</done>
</task>

<task type="auto">
  <name>Task 3: Substance spot-check + FULL-SURFACE count + full-suite regression + commit</name>
  <files>src/app/api/ai</files>
  <action>
    Schema-substance spot-check (Warning B): sample at least 5 wrapped routes from this subtree and assert each has a NON-EMPTY field schema:
      grep -A6 "z.object({" <sampled route.ts> | grep -qE "z\.(string|number|boolean|enum|array)"
    Input-less routes (cron, permissive z.object({})) are exempt but listed as such. In 47-05c-SUMMARY.md list EACH wrapped route with its modeled field count.
    FULL-SURFACE check (this slice lands last, so it owns success criterion #1): confirm
      grep -rln "withSchema\|withQuerySchema" src/app/api/ | wc -l  ≥  find src/app/api -name route.ts | wc -l
    i.e. across 05a+05b+05c+02+03+04 EVERY route file now carries a wrapper at the LIVE count (130 today, not the stale 120 — RESEARCH Pitfall 5). If short, the gap is a file none of the three slices claimed — reconcile by reporting it (do not silently double-claim).
    Run the FULL vitest suite (MEMORY feedback_executor_scoped_tests). Fix genuine regressions by loosening a schema, never by altering the wrapper. Ignore only the plan-period-banner timezone flake. Ensure all per-subdir commits are made.
  </action>
  <verify>
    <automated>npx vitest run && [ "$(grep -rln 'withSchema\|withQuerySchema' src/app/api/ | wc -l)" -ge "$(find src/app/api -name route.ts | wc -l)" ] && echo FULL_SURFACE_WRAPPED</automated>
  </verify>
  <done>Spot-check passes; SUMMARY lists per-route field counts; full-surface wrapped count ≥ live route count (every route file wrapped across all 05 slices); full suite green (timezone flake excepted); tsc + lint clean; all per-subdir commits made.</done>
</task>

</tasks>

<verification>
- Every route.ts in this subtree carries a `withSchema`/`withQuerySchema` call.
- No export is double-wrapped (build/tsc clean).
- `grep -rln "withSchema\|withQuerySchema" src/app/api/ | wc -l` ≥ `find src/app/api -name route.ts | wc -l` — full surface wrapped at the LIVE count (success criterion #1).
- Schema-substance spot-check: sampled wrapped routes have non-empty typed field schemas; SUMMARY lists per-route field counts.
- `npx vitest run` full suite green (timezone flake excepted); `npx tsc --noEmit` clean; lint clean on touched files.
- ZOD_ENFORCE_ROUTES empty — observe mode, zero behavior change. No upstream-response `.json()` wrapped.
</verification>

<success_criteria>
The misc/infra subtree is fully observe-wrapped at the verb level with substantive schemas, and — as the last of the three 05 slices — the entire API surface now carries an observe-mode wrapper at the live route count, satisfying VALID-05 and observe-mode success criterion #1. Ready for the VALID-06 enforce flips.
</success_criteria>

<output>
After completion, create `.planning/phases/47-input-validation-rollout/47-05c-SUMMARY.md`.
</output>
