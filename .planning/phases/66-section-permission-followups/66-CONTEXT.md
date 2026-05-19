# Phase 66: Section-Permission Follow-ups & Hardening - Context

**Gathered:** 2026-05-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Close the four follow-up items surfaced by Phase 65 so the `SECTION_PERMISSION_ENFORCE` cutover (Phase 65 Wave 65-04) is safe and the section-permission gate is consistent across the API surface:

1. **Legacy `financials`-key audit + migration** — the `business_users` baseline DEFAULT JSONB uses the legacy key `financials`, while the Phase 65 helper `requireSectionPermission` checks `finances`. Any production row that carries only the legacy key would have its `finances` permission read as "missing" → defaults to allow → a denied member slips through once ENFORCE is on. **This is the prerequisite for Phase 65 Wave 65-04.**
2. **Consolidated-route business-ID resolution drift** — `consolidated/`, `consolidated-bs/`, `consolidated-cashflow/` routes do not call `resolveBusinessIds`; normalize business-ID resolution across them.
3. **Service-role data-fetching audit** — produce a per-route disposition document for the service-role clients Phase 65-02 left in the 32 finance routes.
4. **Ops/admin service-role section-permission audit** — decide (document) whether admin/cron routes that surface $ data should also run the section-permission check.

**Out of scope:** Actually executing the service-role → auth-bound RLS conversions. That is a separate, later phase planned per-route.
</domain>

<decisions>
## Implementation Decisions

### Sequencing
- **D-01:** Phase 66 is split so the legacy-key audit + migration is the FIRST plan (66-01), shipped on its own as fast as possible to unblock the Phase 65 Wave 65-04 ENFORCE cutover. The other three items follow at normal pace and do not gate the cutover.

### Legacy `financials`-key audit (item 1)
- **D-02:** Audit production data using the verifier-script pattern — a one-off TypeScript script modeled on `scripts/verify-production-migration.ts`. It queries `business_users` against production and reports every row whose `section_permissions` JSONB carries `financials` but not `finances` (and, more generally, any row missing the `finances` key). Matt runs the script; its output drives the migration.
- **D-03:** After the audit confirms the affected-row set, ship an idempotent migration that backfills the `finances` key for affected rows. The exact backfill rule (e.g. `finances` ← value of legacy `financials`, or `finances` ← false for explicitly-denied legacy rows) is to be decided in planning once the audit output is known — but the migration MUST be safe to run regardless of current row state.
- **D-04:** The audit script and the migration are both prerequisites for flipping `SECTION_PERMISSION_ENFORCE=true`. Phase 65 Wave 65-04 must not proceed until 66-01 is shipped and the migration applied to production.

### Service-role data-fetching audit (item 3)
- **D-05:** Phase 66 produces an audit/report document only — a per-route disposition for each service-role client left in the 32 finance routes: `convert` (to auth-bound RLS reads), `keep` (legitimate cross-business / system-level need, documented), or `carve` (move to an ops-only endpoint). The actual conversions are explicitly deferred to a later phase, planned per-route with care because they risk RLS regressions on live tenants (Dragon, IICT, Fit2Shine, JDS).

### Consolidated-route drift (item 2) & ops/admin audit (item 4)
- **D-06:** Consolidated-route fix normalizes `consolidated/`, `consolidated-bs/`, `consolidated-cashflow/` to resolve business IDs via `resolveBusinessIds` (the canonical dual-ID resolver), matching the rest of the finance routes. Planner to confirm this does not change behavior for live consolidation tenants.
- **D-07:** Ops/admin section-permission audit (item 4) is a decision document — enumerate admin/cron routes that surface $ data and recommend per-route whether each should also run the section-permission check. No code changes required for item 4 in this phase unless the audit surfaces a trivial, low-risk gap.

### Claude's Discretion
- Plan breakdown beyond "66-01 = legacy-key audit first": the planner decides how to group items 2, 3, 4 into subsequent plans.
- Exact migration backfill semantics — settled in planning after audit output is in hand (see D-03).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 65 source of these follow-ups
- `.planning/phases/65-section-permission-api-enforcement/65-CONTEXT.md` — revised service-role bypass policy (2026-05-15); the source of items 1, 3, 4
- `.planning/phases/65-section-permission-api-enforcement/65-01-SECTION-KEY-VERIFICATION.md` — grep evidence that `finances` is canonical and the baseline DEFAULT JSONB still uses legacy `financials`
- `.planning/phases/65-section-permission-api-enforcement/65-02-SUMMARY.md` — the 32-route wiring; lists the routes carrying service-role clients
- `.planning/phases/65-section-permission-api-enforcement/65-02-PLAN.md` — `<output>` block enumerating the three Phase 66+ follow-ups

### Legacy-key audit (item 1)
- `supabase/migrations/00000000000000_baseline_schema.sql` — `business_users` table definition; the `section_permissions` JSONB DEFAULT (~line 1929) uses legacy `financials`
- `src/lib/permissions/requireSectionPermission.ts` — the helper that checks `section_permissions['finances']`
- `src/lib/permissions/index.ts` — `DEFAULT_MEMBER_PERMISSIONS` / `FULL_PERMISSIONS` shapes (TS side uses `finances`)
- `scripts/verify-production-migration.ts` — the verifier-script pattern to model the audit script on (4-gate prod-query structure)

### Consolidated-route drift (item 2)
- `src/app/api/monthly-report/consolidated/route.ts`, `consolidated-bs/route.ts`, `consolidated-cashflow/route.ts` — the three routes lacking `resolveBusinessIds`
- `src/lib/utils/resolve-business-ids.ts` — the canonical dual-ID resolver to adopt

### Service-role / ops audit (items 3, 4)
- The 32 finance routes in `src/app/api/{forecast,monthly-report,Xero}/` — service-role clients left in place by Phase 65-02
- `src/app/api/Xero/reconciliation/route.ts:1-25` — canonical auth-bound + service-role coexistence pattern
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/verify-production-migration.ts` — proven prod-query script pattern (single-tenant triage, 4 gates); model the legacy-key audit script on its structure and connection setup.
- `src/lib/utils/resolve-business-ids.ts` — canonical dual-ID resolver; consolidated routes adopt it.
- `requireSectionPermission` (Phase 65) — already the single source of truth for the gate; Phase 66 does not change it.

### Established Patterns
- Dual business ID system (`businesses.id` vs `business_profiles.id`) — known trap; the consolidated-route fix must use `resolveBusinessIds` so the gate and data reads agree on the ID form.
- Idempotent, transaction-wrapped migrations scoped to specific tables (Phase 61 / Phase 49 precedent).

### Integration Points
- Phase 65 Wave 65-04 (ENFORCE cutover) is gated on 66-01 shipping — the legacy-key migration must be applied to production before the env-var flip.
</code_context>

<specifics>
## Specific Ideas

- The legacy-key audit script is operator-run (Matt executes against prod), consistent with how `verify-production-migration.ts` is used for JDS/Envisage/IICT-HK triage.
</specifics>

<deferred>
## Deferred Ideas

- **Service-role → auth-bound RLS conversions** — Phase 66 only audits and documents disposition. Executing the conversions across the 32 finance routes is its own phase (planned per-route; RLS-regression risk on live tenants).
- **Ops/admin route section-permission wiring** — item 4 produces a recommendation document only; any actual wiring of admin/cron routes is a future phase unless a trivial low-risk gap surfaces.

None of the discussion strayed outside the four scoped items.
</deferred>

---

*Phase: 66-section-permission-followups*
*Context gathered: 2026-05-16*
