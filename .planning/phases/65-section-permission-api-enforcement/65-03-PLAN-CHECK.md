# 65-03-PLAN-CHECK

**Verdict:** PASS

Plan 65-03 is a documentation-only soak gate. It ships no code, no env changes, and gates progression to ENFORCE on a human verdict against three explicit Sentry criteria.

## Coverage analysis

Delivers the soak protocol document with:
- Pre-soak checklist (env var unset, 65-02 promoted, timer start timestamp)
- Sentry query string and grouping rules
- Three acceptance criteria (legitimate denies only / no missed allow cases / volume sanity)
- Investigation playbook for unexpected denies
- Sign-off block with verdict + next step

The plan correctly enforces the precision-pattern item 4 (log-then-enforce in two distinct waves with soak window) and item 11 (don't auto-promote — manual verification before flip).

## Precision compliance

- ✅ Soak window opens AFTER `vercel promote` of 65-02, not at merge — correctly handles the rollout-freeze that precludes auto-deploy.
- ✅ 24h minimum / 48h preferred matches CONTEXT.md.
- ✅ Block-to-flip criteria (Criterion A: every denied user is genuinely `finances:false`; Criterion B: no owner/admin/coach/super_admin in `not_a_member` events) directly catch the failure modes Phase 61 surfaced.
- ✅ Rollback path documented (revert env var → still false, no behavior change → just revert 65-02 PR if helper is throwing).
- ✅ Pure manual gate. Zero code changes. Verify block asserts empty diff against `src/`.

## Test coverage assessment

N/A — this plan ships no code. The "test" is the human review of production Sentry data, which is correctly captured as a `checkpoint:human-verify` task with a blocking gate and a `resume-signal`.

## Specific issues found

**Nice-to-have 1** (FLAG): Criterion C ("Total events ≥ 1") allows an auto-pass when "the production tenant has no `finances:false` members at all." Today, JDS / Envisage / IICT-HK production tenants all have ≥ 1 such member historically — verify that's still true before relying on the auto-pass. Worth a one-line check in the pre-soak block: `SELECT count(*) FROM business_users WHERE (section_permissions->>'finances')::boolean = false`. If zero, plant a synthetic test member for the soak window or extend wait time.

**Nice-to-have 2** (FLAG): The soak-readout template's §4 Criterion B SQL stub uses `system_roles WHERE user_id='<uid>' AND role='super_admin'`. Confirm the actual column / value matches what the helper checks (the 65-01 helper will be the source of truth). The readout doc was written before 65-01 ships; if 65-01 picks a different super_admin lookup pattern, the readout SQL becomes stale. Recommend Task 1 add: "After 65-01 ships, update §4 Criterion B's SQL stubs to match the helper's exact super_admin and coach-assignment queries."

## Required revisions

None. Both items above are FLAGs, not BLOCKs. They strengthen the soak signal but don't gate execution.

## Notes for the executor

- The `resume-signal` block correctly distinguishes "PASSED", "FAILED", and "extend soak — need more data". That's the right granularity.
- Doc is ≥60 lines, all eight numbered sections present, all three criteria named.
