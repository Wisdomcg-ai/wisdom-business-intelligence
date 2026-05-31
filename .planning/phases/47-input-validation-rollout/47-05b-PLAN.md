---
phase: 47-input-validation-rollout
plan: 05b
type: execute
wave: 4
depends_on: ["47-01", "47-02", "47-03", "47-04"]
files_modified:
  - "src/app/api/cfo/**/route.ts"
  - "src/app/api/goals/**/route.ts"
  - "src/app/api/kpis/**/route.ts"
  - "src/app/api/annual-plan/**/route.ts"
  - "src/app/api/strategic-initiatives/**/route.ts"
  - "src/app/api/plan-snapshots/**/route.ts"
  - "src/app/api/analytics/**/route.ts"
  - "src/app/api/subscription-budgets/**/route.ts"
  - "src/app/api/business-profile/**/route.ts"
  - "src/app/api/forecast-wizard-v4/**/route.ts"
  - "src/app/api/wizard/**/route.ts"
  - "src/app/api/actions/**/route.ts"
autonomous: true
requirements: [VALID-05]

must_haves:
  truths:
    - "Every UNWRAPPED mutating verb and query GET in the reports/planning-data subtree (cfo, goals, kpis, annual-plan, strategic-initiatives, plan-snapshots, analytics, subscription-budgets, business-profile, wizards, actions) is wrapped in OBSERVE mode"
    - "Verb-level (not file-level) dedup: where 47-02 already wrapped cfo/summaries, only the MISSING verbs/files in cfo are wrapped; an already-wrapped export is NEVER re-wrapped"
    - "Each authored schema models the route's ACTUAL fields (not a blanket z.object({}).passthrough())"
    - "Zero behavior change (observe mode, ZOD_ENFORCE_ROUTES empty)"
  artifacts:
    - path: ".planning/phases/47-input-validation-rollout/47-05b-ROUTE-LIST.md"
      provides: "Per-verb checklist for this subtree: file → export → wrapped-already? → schema field count"
      contains: "route.ts"
  key_links:
    - from: "src/app/api/goals/**/route.ts (unwrapped verbs)"
      to: "src/lib/api/with-schema.ts"
      via: "import { withSchema|withQuerySchema }"
      pattern: "from ['\"]@/lib/api/with-schema"
---

<objective>
Sweep the **reports / planning-data** subtree (VALID-05, slice b of 3): cfo (excluding the already-wrapped summaries + report-status), goals, kpis, annual-plan, strategic-initiatives, plan-snapshots, analytics, subscription-budgets, business-profile, forecast-wizard-v4, wizard, actions. Sibling of 47-05a and 47-05c — same wave, no file overlap, parallelizable. Option B uniformly, observe mode only.

Purpose: Complete observe-mode adoption across the planning/reporting data surface — one of three parallel slices finishing VALID-05.
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
@.planning/phases/47-input-validation-rollout/47-02-SUMMARY.md

# Wrapper contract from 47-01: withSchema / withQuerySchema, Option B (clone-and-forward). routeId = path
#   under src/app/api, no leading slash.
# CRITICAL — verb-level dedup (BLOCKER 2 fix): 47-02 wrapped cfo/summaries and 47-04 wrapped cfo/report-status.
#   Do NOT re-touch those exports. For any file in cfo already touched, classify at the EXPORT level
#   (grep -nE "export (async function|const) (GET|POST|PUT|PATCH|DELETE)") and wrap only MISSING verbs;
#   NEVER re-wrap an already-wrapped export (double withSchema = build error).
# RESEARCH anti-pattern: do NOT wrap upstream-response .json() — inbound boundary only.
# Sibling slices: 47-05a (admin/coach/clients/sessions/team/monthly-report),
#   47-05c (cron/auth/ai/chat/todos/notifications/ideas/email/documents/activity-log/processes).
#   These three partition the remaining tree with NO overlap.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Build the per-verb checklist for this subtree</name>
  <files>.planning/phases/47-input-validation-rollout/47-05b-ROUTE-LIST.md</files>
  <action>
    Enumerate this slice's routes:
      find src/app/api/cfo src/app/api/goals src/app/api/kpis src/app/api/annual-plan src/app/api/strategic-initiatives src/app/api/plan-snapshots src/app/api/analytics src/app/api/subscription-budgets src/app/api/business-profile src/app/api/forecast-wizard-v4 src/app/api/wizard src/app/api/actions -name route.ts | sort
    For EACH file, list EVERY export with a verb/export-level scan (NOT a file-level grep):
      grep -nE "export (async function|const) (GET|POST|PUT|PATCH|DELETE)" <file>
    Classify each export: (a) already wrapped by 47-02/04 (cfo/summaries, cfo/report-status — LEAVE), (b) unwrapped body verb (withSchema, model real fields), (c) query GET (withQuerySchema), (d) input-less GET (permissive z.object({})). Record file + routeId + per-export status in 47-05b-ROUTE-LIST.md. Record an expected commit count = one commit per top-level subdir touched.
  </action>
  <verify>
    <automated>test -f .planning/phases/47-input-validation-rollout/47-05b-ROUTE-LIST.md && grep -q "route.ts" .planning/phases/47-input-validation-rollout/47-05b-ROUTE-LIST.md</automated>
  </verify>
  <done>ROUTE-LIST.md lists every export across this subtree with per-verb wrapped/unwrapped classification and an expected per-subdir commit count.</done>
</task>

<task type="auto">
  <name>Task 2: Wrap every UNWRAPPED verb in this subtree (verb-level, never double-wrap)</name>
  <files>src/app/api/cfo, src/app/api/goals, src/app/api/kpis, src/app/api/analytics, src/app/api/business-profile</files>
  <action>
    Work through 47-05b-ROUTE-LIST.md. For each export marked UNWRAPPED only:
    - Body verb: READ the handler, inline `const ...Schema = z.object({...})` modeling the ACTUAL destructured fields (do not guess); wrap via Option B (handler body untouched, keeps its own request.json()).
    - Query GET: `withQuerySchema(routeId, z.object({...matching searchParams...}), handler)`.
    - Input-less GET: `withQuerySchema(routeId, z.object({}), handler)`.
    - Import from `@/lib/api/with-schema`. routeId = path under src/app/api.
    NEVER re-wrap an export already wrapped by 47-02/04 (double `withSchema` = build error). NEVER wrap upstream-response `.json()`. Observe mode only. No auth/structure changes.
    Commit one batch per top-level subdir, each tsc + lint green. Message: `feat(47-05b): observe-mode schemas — <subdir> routes (VALID-05)`.
  </action>
  <verify>
    <automated>npx tsc --noEmit && for r in $(find src/app/api/cfo src/app/api/goals src/app/api/kpis src/app/api/annual-plan src/app/api/strategic-initiatives src/app/api/plan-snapshots src/app/api/analytics src/app/api/subscription-budgets src/app/api/business-profile src/app/api/forecast-wizard-v4 src/app/api/wizard src/app/api/actions -name route.ts); do grep -ql "withSchema\|withQuerySchema" "$r" || { echo "UNWRAPPED FILE: $r"; exit 1; }; done && echo SUBTREE_B_WRAPPED</automated>
  </verify>
  <done>Every file in this subtree carries a wrapper; every previously-unwrapped verb is now wrapped; NO export double-wrapped (tsc/build clean); lint clean; observe mode only.</done>
</task>

<task type="auto">
  <name>Task 3: Schema-substance spot-check + full-suite regression + commit</name>
  <files>src/app/api/goals</files>
  <action>
    Schema-substance spot-check (Warning B): sample at least 5 wrapped routes from this subtree and assert each has a NON-EMPTY field schema:
      grep -A6 "z.object({" <sampled route.ts> | grep -qE "z\.(string|number|boolean|enum|array)"
    Input-less routes (permissive z.object({})) are exempt but listed as such. In 47-05b-SUMMARY.md list EACH wrapped route with its modeled field count.
    Run the FULL vitest suite (slice touches ~25 files — MEMORY feedback_executor_scoped_tests). Fix genuine regressions by loosening a schema, never by altering the wrapper. Ignore only the plan-period-banner timezone flake. Ensure all per-subdir commits are made.
  </action>
  <verify>
    <automated>npx vitest run && npx tsc --noEmit</automated>
  </verify>
  <done>Spot-check passes; SUMMARY lists per-route field counts; full suite green (timezone flake excepted); tsc + lint clean; all per-subdir commits made.</done>
</task>

</tasks>

<verification>
- Every route.ts in this subtree carries a `withSchema`/`withQuerySchema` call.
- No export is double-wrapped (build/tsc clean).
- Schema-substance spot-check: sampled wrapped routes have non-empty typed field schemas; SUMMARY lists per-route field counts.
- `npx vitest run` full suite green (timezone flake excepted); `npx tsc --noEmit` clean; lint clean on touched files.
- ZOD_ENFORCE_ROUTES empty — observe mode, zero behavior change. No upstream-response `.json()` wrapped.
</verification>

<success_criteria>
The reports/planning-data subtree is fully observe-wrapped at the verb level with substantive schemas and zero behavior change — slice b of the three parallel VALID-05 slices.
</success_criteria>

<output>
After completion, create `.planning/phases/47-input-validation-rollout/47-05b-SUMMARY.md`.
</output>
