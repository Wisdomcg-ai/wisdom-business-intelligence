---
phase: 47-input-validation-rollout
plan: 05a
type: execute
wave: 4
depends_on: ["47-01", "47-02", "47-03", "47-04"]
files_modified:
  - "src/app/api/monthly-report/**/route.ts"
  - "src/app/api/admin/**/route.ts"
  - "src/app/api/coach/**/route.ts"
  - "src/app/api/coach-questions/**/route.ts"
  - "src/app/api/sessions/**/route.ts"
  - "src/app/api/team/**/route.ts"
  - "src/app/api/clients/**/route.ts"
autonomous: true
requirements: [VALID-05]

must_haves:
  truths:
    - "Every UNWRAPPED mutating verb (POST/PUT/PATCH/DELETE) and query GET in the admin/coach/clients/sessions/team/monthly-report subtree is wrapped in OBSERVE mode"
    - "Verb-level (not file-level) dedup: where 47-02/47-03 already wrapped SOME verbs of a multi-verb file, only the MISSING verbs are wrapped; an already-wrapped export is NEVER re-wrapped"
    - "Each authored schema models the route's ACTUAL destructured fields (not a blanket z.object({}).passthrough())"
    - "Zero behavior change (observe mode, ZOD_ENFORCE_ROUTES empty)"
  artifacts:
    - path: ".planning/phases/47-input-validation-rollout/47-05a-ROUTE-LIST.md"
      provides: "Per-verb checklist for this subtree: file → export → wrapped-already? → schema field count"
      contains: "route.ts"
  key_links:
    - from: "src/app/api/monthly-report/**/route.ts (unwrapped verbs)"
      to: "src/lib/api/with-schema.ts"
      via: "import { withSchema|withQuerySchema }"
      pattern: "from ['\"]@/lib/api/with-schema"
---

<objective>
Sweep the **admin / coach / clients / sessions / team / monthly-report** subtree (VALID-05, slice a of 3). This is the largest remaining cluster (`monthly-report` alone is 15 routes). Sibling of 47-05b and 47-05c — same wave, no file overlap, parallelizable. Option B uniformly, observe mode only.

Purpose: Complete observe-mode adoption across the coaching/admin/client-management surface, one of three parallel slices that together finish VALID-05 at the LIVE route count.
Output: Every unwrapped mutating verb + query GET in this subtree wrapped in observe mode; per-verb checklist; gates green.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/47-input-validation-rollout/PHASE.md
@.planning/phases/47-input-validation-rollout/RESEARCH.md
@.planning/phases/47-input-validation-rollout/47-01-SUMMARY.md
@.planning/phases/47-input-validation-rollout/47-03-SUMMARY.md

# Wrapper contract from 47-01: withSchema / withQuerySchema, Option B (clone-and-forward, handler keeps
#   its own request.json()). routeId = path under src/app/api, no leading slash.
# CRITICAL — verb-level dedup (BLOCKER 2 fix): 47-03 already wrapped admin/clients, coach/clients/[id],
#   team/invite, team/remove-member, clients/send-invitation etc. Some of those files export MULTIPLE
#   mutating verbs (admin/clients = POST/PATCH/DELETE). 47-03 may have wrapped only SOME verbs. You MUST
#   classify at the EXPORT level: for any file already touched, confirm EVERY `export async function
#   POST|PATCH|PUT|DELETE` (and any `export const POST = withSchema(...)`) is wrapped; wrap only the
#   missing verbs; NEVER re-wrap an already-wrapped export (a double withSchema wrap is a build error).
# RESEARCH anti-pattern: do NOT wrap upstream-response .json() (await xeroResp.json()) — inbound only.
# Sibling slices: 47-05b (cfo/goals/kpis/planning/analytics/business-profile/wizards),
#   47-05c (cron/auth/ai/chat/todos/notifications/ideas/email/documents/activity-log/processes).
#   These three partition the remaining tree with NO overlap.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Build the per-verb checklist for this subtree</name>
  <files>.planning/phases/47-input-validation-rollout/47-05a-ROUTE-LIST.md</files>
  <action>
    Enumerate this slice's routes:
      find src/app/api/monthly-report src/app/api/admin src/app/api/coach src/app/api/coach-questions src/app/api/sessions src/app/api/team src/app/api/clients -name route.ts | sort
    For EACH file, list EVERY mutating export and every GET, using a verb/export-level scan (NOT a file-level grep):
      grep -nE "export (async function|const) (GET|POST|PUT|PATCH|DELETE)" <file>
    Classify each export: (a) already wrapped by 47-02/03 (the export already reads `withSchema(`/`withQuerySchema(` — LEAVE IT, do not touch), (b) unwrapped mutating verb needing `withSchema` (model real fields), (c) query GET needing `withQuerySchema`, (d) input-less GET needing permissive `withQuerySchema(routeId, z.object({}))`. Record file path + routeId + per-export status in 47-05a-ROUTE-LIST.md. Record an **expected commit count** = one commit per top-level subdir touched (e.g. monthly-report, admin, coach, sessions, team) so independent-committability is structural.
  </action>
  <verify>
    <automated>test -f .planning/phases/47-input-validation-rollout/47-05a-ROUTE-LIST.md && grep -q "route.ts" .planning/phases/47-input-validation-rollout/47-05a-ROUTE-LIST.md</automated>
  </verify>
  <done>ROUTE-LIST.md lists every export across this subtree with per-verb wrapped/unwrapped classification and an expected per-subdir commit count.</done>
</task>

<task type="auto">
  <name>Task 2: Wrap every UNWRAPPED verb in this subtree (verb-level, never double-wrap)</name>
  <files>src/app/api/monthly-report, src/app/api/admin, src/app/api/coach, src/app/api/sessions, src/app/api/team, src/app/api/clients</files>
  <action>
    Work through 47-05a-ROUTE-LIST.md. For each export marked UNWRAPPED only:
    - Body verb: READ the handler, inline `const ...Schema = z.object({...})` modeling the ACTUAL destructured fields (MEMORY feedback_testing — do not guess); wrap via Option B (`export const POST = withSchema('routeId', Schema, postHandler)`, handler body untouched, keeps its own request.json()).
    - Query GET: `withQuerySchema(routeId, z.object({...matching searchParams...}), handler)`.
    - Input-less GET: `withQuerySchema(routeId, z.object({}), handler)`.
    - Import from `@/lib/api/with-schema`. routeId = path under src/app/api.
    NEVER re-wrap an export already marked wrapped in 47-02/03 (double `withSchema` wrap = build error). NEVER wrap upstream-response `.json()`. Observe mode only — ZOD_ENFORCE_ROUTES stays empty. No auth/structure changes.
    Commit in reviewable sub-batches: ONE commit per top-level subdir, each tsc + lint green. Message: `feat(47-05a): observe-mode schemas — <subdir> routes (VALID-05)`.
  </action>
  <verify>
    <automated>npx tsc --noEmit && for r in $(find src/app/api/monthly-report src/app/api/admin src/app/api/coach src/app/api/coach-questions src/app/api/sessions src/app/api/team src/app/api/clients -name route.ts); do grep -ql "withSchema\|withQuerySchema" "$r" || { echo "UNWRAPPED FILE: $r"; exit 1; }; done && for r in $(grep -oE "src/app/api/[^ ]+route.ts" .planning/phases/47-input-validation-rollout/47-05a-ROUTE-LIST.md | sort -u); do c=$(grep -cE "export (const|async function) (POST|PUT|PATCH|DELETE|GET) ?=? ?withSchema|= withSchema|= withQuerySchema" "$r"); done; echo SUBTREE_A_WRAPPED</automated>
  </verify>
  <done>Every file in this subtree carries a wrapper; every previously-unwrapped verb is now wrapped; NO export is double-wrapped (tsc/build clean proves no duplicate wrap); lint clean; observe mode only.</done>
</task>

<task type="auto">
  <name>Task 3: Schema-substance spot-check + full-suite regression + commit</name>
  <files>src/app/api/monthly-report</files>
  <action>
    Schema-substance spot-check (Warning B — prevents a lazy blanket-passthrough satisfying the grep): sample at least 5 wrapped routes from this subtree and assert each has a NON-EMPTY field schema, e.g.:
      grep -A6 "z.object({" <sampled route.ts> | grep -qE "z\.(string|number|boolean|enum|array)"
    Routes that legitimately take no input (permissive z.object({})) are exempt but must be listed as such. In 47-05a-SUMMARY.md, list EACH wrapped route with its modeled field count (e.g. `monthly-report/save: 7 fields`) so substance is auditable, not asserted.
    Then run the FULL vitest suite (this slice touches ~30 files — MEMORY feedback_executor_scoped_tests demands a full run). Fix genuine regressions by loosening a schema, NEVER by altering the wrapper. Ignore only the plan-period-banner timezone flake. Ensure all per-subdir commits are made.
  </action>
  <verify>
    <automated>npx vitest run && npx tsc --noEmit</automated>
  </verify>
  <done>Spot-check passes (sampled routes have typed fields); SUMMARY lists per-route field counts; full suite green (timezone flake excepted); tsc + lint clean; all per-subdir commits made.</done>
</task>

</tasks>

<verification>
- Every route.ts in monthly-report/admin/coach/coach-questions/sessions/team/clients carries a `withSchema`/`withQuerySchema` call.
- No export is double-wrapped (build/tsc clean).
- Schema-substance spot-check: sampled wrapped routes have non-empty typed field schemas; SUMMARY lists per-route field counts.
- `npx vitest run` full suite green (timezone flake excepted); `npx tsc --noEmit` clean; lint clean on touched files.
- ZOD_ENFORCE_ROUTES empty — observe mode, zero behavior change. No upstream-response `.json()` wrapped.
</verification>

<success_criteria>
The admin/coach/clients/sessions/team/monthly-report subtree is fully observe-wrapped at the verb level with substantive schemas and zero behavior change — slice a of the three parallel VALID-05 slices.
</success_criteria>

<output>
After completion, create `.planning/phases/47-input-validation-rollout/47-05a-SUMMARY.md`.
</output>
