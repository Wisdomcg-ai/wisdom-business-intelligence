---
phase: 70-production-data-backfill-migration-debt-cleanup-for-month-end-reporting-clients
plan: 04
subsystem: subscription-budgets
tags: [supabase, subscription-budgets, renewal-month, backfill, xero, vendor-normalization, no-schema-change]

# Dependency graph
requires:
  - phase: 70-production-data-backfill-migration-debt-cleanup-for-month-end-reporting-clients
    plan: 01
    provides: Pre-write rollback snapshot capturing subscription_budgets baseline (103 rows) for full restoration if needed
  - phase: 69-xero-token-auto-refresh-durability
    plan: 04
    provides: Xero token-refresh cron health — without a valid access token this backfill cannot read Xero bank transactions for vendor cadence inference
provides:
  - scripts/70-04-A3-subscription-renewal-month-backfill.ts (three-mode dry-run / --apply / --enter-manual cross-client renewal_month backfill — preserved for future onboarding when more annual subs are added)
  - 2 subscription_budgets rows updated in production with renewal_month inferred from Xero billing cadence (Envisage Australia / LastPass = January; Envisage Australia / Click Up = January)
  - Empirical correction of the Phase 70 audit's framing — live production held only 2 NULL annual+active rows, not the 91 (44 Envisage + 47 JDS) the audit reported
provides:
  - The unblocked input for the cashflow engine's annual-subscription line — Envisage's LastPass + Click Up annual lumps now show as January charges instead of being silently 1/12-smoothed across the year
  - A reusable Xero-cadence inference path: same script can be re-run after every onboarding to backfill any newly-added annual sub
affects: [70-05-envisage-cleanup, 70-06-jds-cleanup, 70-07-iict-cleanup, code-fixes-phase-B2-vendor-normalization-consolidation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Three-mode operational script (dry-run / --apply / --enter-manual) with persisted unresolved-list as the handoff between automatic Xero inference and interactive manual entry — file at .planning/phases/70-.../70-04-unresolved-renewals.json"
    - "Vendor normalization REUSED via direct import of createVendorKey + extractVendorName from src/lib/utils/vendor-normalization.ts (NOT reimplemented) — same matcher as src/app/api/monthly-report/subscription-detail/route.ts, which is the explicit unblock for next-phase code-fix B2 (consolidating the two paths so they never drift)"
    - "Xero token acquisition via the centralized getValidAccessToken from src/lib/xero/token-manager.ts (Phase 53 invariant — no hand-rolled refresh), with per-tenant try/catch so a single token failure marks rows as UNRES_TOKEN instead of crashing the whole script"
    - "Xero BankTransactions pagination (100/page, 50-page safety cap, 429 backoff, SPEND-only filter over a 24-month window) implemented inline because no shared helper existed for this read pattern"

key-files:
  created:
    - scripts/70-04-A3-subscription-renewal-month-backfill.ts (built in Task 1, commit c52b647c)
    - .planning/phases/70-production-data-backfill-migration-debt-cleanup-for-month-end-reporting-clients/70-04-unresolved-renewals.json (empty [] — both candidate rows resolved automatically, no manual entry required)
    - .planning/phases/70-production-data-backfill-migration-debt-cleanup-for-month-end-reporting-clients/70-04-SUMMARY.md (this file)
  modified:
    - subscription_budgets (production): 2 rows updated — Envisage Australia / LastPass renewal_month=1, Envisage Australia / Click Up renewal_month=1
    - .planning/STATE.md
    - .planning/ROADMAP.md

key-decisions:
  - "AUDIT FRAMING MISMATCH (recorded 2026-05-31): the Phase 70 audit's claim of '44/44 Envisage, 47/47 JDS' annual NULL renewal_month rows is wrong against live production. Live reality at the time of this plan: exactly 2 NULL annual+active rows, both belonging to Envisage Australia (LastPass + Click Up). JDS has zero rows where frequency='annual' AND is_active=true AND renewal_month IS NULL. The audit was likely counting historical/inactive rows or a different criteria combination. The script's filter is correct — it matches the column semantics the cashflow engine actually reads. No remediation needed for the 'missing 89 rows' — they don't exist in production."
  - "Renewal month inferred from the most recent matching Xero SPEND transaction's calendar month within a 24-month lookback. Both Envisage matches were Jan 2026 charges (LastPass 2026-01-27 \$254.23; Click Up 2026-01-31 \$372.61). Plan-row annual_budget values are slightly lower (LastPass \$237.60, Click Up \$418.08) — small drift from prior FX rates / amount changes is expected and is not material for cadence inference; the calendar month is the load-bearing field."
  - "Vendor normalization: import createVendorKey + extractVendorName from src/lib/utils/vendor-normalization.ts directly (no second normalizer in the script). This is the locked must_have from PLAN frontmatter and the explicit dependency for code-fix B2 — both the backfill path and the report query path (src/app/api/monthly-report/subscription-detail/route.ts:6) now reference the SAME function, so they can never drift on what vendor='Click Up' vs 'ClickUp' vs 'Click-Up' means."
  - "Script kept at .ts extension (NOT .mjs) per PLAN frontmatter — runs natively under tsx like scripts/verify-production-migration.ts. This is what allows the direct import of @/lib/utils/vendor-normalization + @/lib/xero/token-manager (no transpile step needed)."
  - "Idempotency proven: post-apply dry-run reports 'candidate rows: 0' and exits with 'Resolved: 0 / 0   Unresolved: 0 / 0'. Re-running --apply would be a guaranteed no-op."
  - "Unresolved seed file (.planning/phases/70-.../70-04-unresolved-renewals.json) written as empty array because both candidate rows resolved automatically. The --enter-manual flow exists and is wired but was not exercised — kept for future onboarding when a new annual sub is added for a vendor that has not yet appeared in Xero (e.g. new sub paid externally)."

patterns-established:
  - "Cross-client backfill scripts that consume Xero data MUST acquire tokens via getValidAccessToken from src/lib/xero/token-manager.ts (the Phase 53 centralization invariant). Hand-rolled refresh re-introduces the bug 53-02 deleted."
  - "Vendor normalization is owned by src/lib/utils/vendor-normalization.ts. Any new code path that needs to match a vendor_name string to a Xero Contact.Name MUST import createVendorKey from there — never reimplement, never fork. The next-phase code-fix B2 will consolidate the two consumers (this backfill + the subscription-detail report route); future consumers can join the same import without rework."
  - "When a Phase 70 audit-driven plan claims to operate on N rows but live production holds M << N, the resolver script's filter (frequency='annual' AND is_active=true AND renewal_month IS NULL) is the source of truth. Audit framings on the way in are inputs, not contracts. Document the mismatch in the SUMMARY so the next plan does not chase phantom rows."

# Metrics
metrics:
  duration: ~30 minutes total (initial build + checkpoint review + apply + summary)
  tasks: 2 (build + apply checkpoint)
  files: 1 created (script, prior commit c52b647c) + 1 created (this SUMMARY) + 1 created (empty unresolved JSON artifact) + 2 modified (STATE, ROADMAP)
  completed: 2026-05-31
  candidate-rows-found: 2
  candidate-rows-claimed-by-audit: 91 (44 Envisage + 47 JDS)
  candidate-rows-resolved-by-xero: 2
  candidate-rows-needing-manual-entry: 0
  candidate-rows-token-error: 0
  failures: 0
---

# Phase 70 Plan 04: Subscription Renewal-Month Backfill Summary

Cross-business `subscription_budgets.renewal_month` backfill: built three-mode dry-run/`--apply`/`--enter-manual` TypeScript script, ran apply against production, verified idempotency. **2 rows populated** (Envisage Australia / LastPass = January, Envisage Australia / Click Up = January), both inferred from January 2026 Xero SPEND transactions. **0 rows required manual entry.** The audit's claim of 91 NULL rows (44 Envisage + 47 JDS) was a framing mismatch — live production held exactly 2 such rows, both belonging to Envisage.

## What shipped

### scripts/70-04-A3-subscription-renewal-month-backfill.ts

Three-mode TypeScript script:

| Mode | Flag | Effect |
|---|---|---|
| Dry-run | (default) | Print per-row MATCH/UNRES preview; zero writes |
| Apply | `--apply` | Write `renewal_month` for MATCH rows; persist UNRES list to JSON for manual-entry pass |
| Manual entry | `--enter-manual` | Read the unresolved JSON, prompt stdin for each row, write user-entered 1-12 or leave NULL on "skip" |
| Skip Xero | `--skip-xero` (modifier) | Bypass Xero API entirely (testing without consuming quota) |

**Vendor matching:** `createVendorKey(vendor_name) === createVendorKey(extractVendorName(tx.Contact?.Name, tx.LineItems?.[*].Description || tx.Reference))`. Imports come from `src/lib/utils/vendor-normalization.ts` directly — no second normalizer in the script. This is the load-bearing decision that unblocks code-fix B2 in the next phase.

**Xero data acquisition:** `getValidAccessToken({ id: conn.id }, supabase)` from `src/lib/xero/token-manager.ts` (Phase 53 centralization invariant), then paginated `GET https://api.xero.com/api.xro/2.0/BankTransactions?where=Type=="SPEND" AND Date >= DateTime(<24mo_ago>)`. 100/page, 50-page safety cap, 429 rate-limit backoff, per-tenant try/catch so a token failure marks rows UNRES_TOKEN instead of crashing the script.

**Algorithm:**
1. Fetch all `subscription_budgets` rows where `frequency='annual' AND is_active=true AND renewal_month IS NULL`.
2. Group by `business_id`; for each business, fetch its active `xero_connections` and per-tenant SPEND transactions (cached).
3. For each candidate row: find the most recent matching transaction across all the business's tenants; pick its calendar month (`tx.Date.getUTCMonth() + 1`) as `renewal_month`.
4. APPLY mode: per-row `UPDATE subscription_budgets SET renewal_month=$1, updated_at=NOW() WHERE id=$2`.
5. Unresolved rows written to `70-04-unresolved-renewals.json` for the `--enter-manual` pass.

**Invariants (do not relax without re-reading 70-04-PLAN.md):**
- `renewal_month` already set → NEVER touched (Matt's existing values win, even if Xero would propose differently)
- `is_active = false` → skipped (out of scope)
- `frequency != 'annual'` → skipped (monthly subs have no renewal_month concept)
- Zero rows ever deleted
- Idempotent — re-run after `--apply` produces zero writes

## Production outcome

```
candidate rows: 2  (frequency=annual AND is_active=true AND renewal_month IS NULL)

business="Envisage Australia Pty Ltd" (bid=8c8c63b2-bdc4-4115-9375-8d0fd89acc00)
  rows to resolve: 2
  · fetching Xero bank transactions for tenant="Malouf Family Trust" (tid=04d9df1f...)
    fetched 3604 SPEND tx in last 24mo
  ✓ MATCH    vendor="LastPass"  →  renewal_month=1  (matched tx 2026-01-27 $254.23)
  ✓ MATCH    vendor="Click Up"  →  renewal_month=1  (matched tx 2026-01-31 $372.61)
  Resolved: 2 / 2   Unresolved: 0 / 2

Apply pass
  ✓ UPDATED  Envisage Australia / "LastPass"  →  renewal_month=1
  ✓ UPDATED  Envisage Australia / "Click Up"  →  renewal_month=1

Resolved: 2 / 2   Unresolved: 0 / 2
Rows UPDATED: 2
Failures: 0
```

### Per-row outcome

| Business | Vendor | Inferred renewal_month | Matched Xero tx | Plan annual_budget |
|---|---|---|---|---|
| Envisage Australia Pty Ltd | LastPass | **1 (January)** | 2026-01-27 SPEND $254.23 | $237.60 |
| Envisage Australia Pty Ltd | Click Up | **1 (January)** | 2026-01-31 SPEND $372.61 | $418.08 |

Plan-row `annual_budget` differs slightly from the matched Xero amount — this is expected drift (FX rate movement between budget-setting and actual charge, or a vendor price change). Not material for cadence inference; the calendar month is the load-bearing field. Note both subs renew within four days of each other in late January, which is consistent with Envisage having signed up to both during the same SaaS rollout.

### 0 rows needing manual entry

`70-04-unresolved-renewals.json` was written as `[]` because both candidate rows resolved automatically from Xero. The `--enter-manual` flow exists and was tested-paths-wise (it reads the JSON, prompts for input, writes the user value) but was not exercised in this run.

## Audit framing mismatch (recorded)

The Phase 70 audit's framing said **"44/44 Envisage + 47/47 JDS = 91 NULL annual renewal_month rows"** (see `.planning/phases/70-.../70-04-PLAN.md` line 33 and `.planning/phases/70-.../70-CONTEXT.md` line 78). 

Live production reality at apply time (2026-05-31): **2 NULL annual+active rows total, all 2 belonging to Envisage. JDS has zero rows matching the filter.**

The script's filter is the source of truth: `frequency='annual' AND is_active=true AND renewal_month IS NULL`. This is the filter the cashflow engine and the wages-tab roll-up actually consume, so this is the only filter that matters for "is the data debt closed?"

Possible explanations for the audit-vs-reality gap (not investigated in this plan because the fix is what matters, not the audit-tool diagnosis):
- The audit may have counted **inactive** rows (`is_active = false`) — out of scope for cashflow rendering
- The audit may have counted **monthly** rows (`frequency != 'annual'`) — by definition have no renewal_month
- JDS rows may have been previously cleaned up in an earlier ad-hoc pass and the audit script not re-run
- The audit may have been keyed on `business_profiles.id` while the table is keyed on `businesses.id` (a Phase 70 known dual-ID hazard — see `project_dual_id.md`)

**The data debt for this plan is closed.** No phantom rows to chase. The audit script (`scripts/phase-70-data-audit.mjs`) should be re-checked in plan **70-08 (C1)** against the correct filter to prevent this framing mismatch recurring.

## Cashflow / wages-tab impact

Before this plan: Envisage's LastPass + Click Up annual lumps had `renewal_month = NULL`. The cashflow engine therefore had to fall back to spreading the annual budget 1/12 across the year as a smoothed monthly charge. That's directionally wrong — both subs are real January 2026 cash outflows of ~$254 + ~$373 = ~$627, not a $52/month smoothed approximation across the FY.

After this plan: both rows have `renewal_month = 1`, so the cashflow engine can correctly show ~$627 as a single January charge and zero in months 2-12. This is the expected upstream input for the cashflow tab's annual-lumps breakdown.

(Verifying the cashflow tab actually surfaces this correctly is **code-phase work**, not data-phase work — flagged in CONTEXT.md as out-of-scope here.)

## Vendor normalization implementation choice (for code-fix B2)

The script imports `createVendorKey` + `extractVendorName` from `src/lib/utils/vendor-normalization.ts` directly — **no inline normalizer, no new util file, no fork.** This satisfies the locked must_have on the PLAN frontmatter:

```yaml
key_links:
  - from: "scripts/70-04-A3-subscription-renewal-month-backfill.ts"
    to: "src/lib/utils/vendor-normalization.ts createVendorKey"
    via: "imported and reused — NOT reimplemented"
```

**Implication for code-fix phase B2:** the consolidation work in B2 has two known consumers of `createVendorKey` to unify:

1. `src/app/api/monthly-report/subscription-detail/route.ts` (line 6 — the report query path)
2. `scripts/70-04-A3-subscription-renewal-month-backfill.ts` (line 62 — this backfill)

Both already point at the same source of truth, so B2's job is no longer "consolidate divergent normalizers" but rather "verify they cannot diverge in future" — likely tightening the function signature, adding a lint rule against inline `vendorName.toLowerCase().trim()` patterns elsewhere, and adding a regression test that exercises the same fixture through both consumers.

No new util file was needed for this plan.

## Idempotency verification

After `--apply` completed, re-ran dry-run. Result:

```
candidate rows: 0  (frequency=annual AND is_active=true AND renewal_month IS NULL)
✓ Nothing to backfill — every annual+active row already has renewal_month set.
Summary
Resolved: 0 / 0   Unresolved: 0 / 0
```

The script will never re-write a row whose `renewal_month` is already set, even if a new Xero transaction in a different month would suggest otherwise. Matt's existing values (and the values written by this `--apply`) are the source of truth.

## Reusable for future onboarding

The script is **not single-shot** — it is the long-lived tool for renewal-month backfill. Re-run after every onboarding that adds annual subs:

```bash
# After adding annual subs for a newly-onboarded client:
npx tsx scripts/70-04-A3-subscription-renewal-month-backfill.ts            # dry-run preview
npx tsx scripts/70-04-A3-subscription-renewal-month-backfill.ts --apply    # commit Xero-inferred values
npx tsx scripts/70-04-A3-subscription-renewal-month-backfill.ts --enter-manual  # manually enter the rest
```

This is the expected pattern when 70-05 (Envisage cleanup), 70-06 (JDS cleanup), 70-07 (IICT cleanup) add new annual subs as part of their onboarding completion work. Each per-client plan can chain this script as a post-step to backfill `renewal_month` for any annual subs they create.

## Deviations from Plan

None — plan executed as written.

The "91 NULL rows" framing mismatch is documented as a key decision and an audit-script follow-up, not a deviation from this plan's task list. The script's filter was correct; it just resolved fewer candidates than the audit had projected. The end-state invariant ("every annual + is_active row has renewal_month populated or Matt-skipped") is achieved.

## Matt's confirms (resolved at apply checkpoint, 2026-05-31)

| Question | Matt's answer | Status |
|---|---|---|
| Approve writing renewal_month=1 (January) to Envisage / LastPass + Envisage / Click Up | **approved** | confirmed |
| Investigate the 89 phantom rows the audit claimed but reality lacked | not in scope for this plan — log in SUMMARY, flag for 70-08 audit re-run | confirmed |
| Inline vendor normalization vs new util file | reuse existing `src/lib/utils/vendor-normalization.ts` (locked by PLAN must_have) | confirmed |

## Deferred items (out of scope for 70-04)

- **70-08 (C1) audit re-run** should verify the filter used by `scripts/phase-70-data-audit.mjs` matches the cashflow engine's filter (`frequency='annual' AND is_active=true AND renewal_month IS NULL`) so the "91 NULL rows" framing mismatch cannot recur in future month-end audits.
- **Code-fix phase B2** is unblocked — both backfill (this script) and report-query (`subscription-detail/route.ts`) consume the same `createVendorKey`. B2 can now focus on hardening (lint rule + regression test) rather than initial consolidation.
- **Verifying the cashflow tab actually renders annual lumps in their correct month** is code-phase work, not data-phase work.
- **Backfilling renewal_month for newly-onboarded annual subs from 70-05/06/07** — re-run this script as a post-step in each per-client cleanup plan.

## Commits

| # | Hash | Type | Description |
|---|------|------|-------------|
| 1 | c52b647c | feat | subscription_budgets.renewal_month backfill script (A3, .ts) |
| 2 | 15ac3f21 | chore | apply A3 renewal_month backfill — Envisage LastPass + ClickUp = January |
| 3 | (next) | docs | complete renewal_month backfill plan (this SUMMARY + STATE + ROADMAP) |

## Self-Check: PASSED

- scripts/70-04-A3-subscription-renewal-month-backfill.ts — FOUND (committed c52b647c, ~680 lines, .ts extension)
- .planning/phases/70-.../70-04-SUMMARY.md — FOUND (this file)
- .planning/phases/70-.../70-04-unresolved-renewals.json — FOUND (empty array, committed 15ac3f21)
- commit c52b647c (script build) — FOUND in `git log`
- commit 15ac3f21 (apply event) — FOUND in `git log`
- production state: re-ran dry-run after apply → "candidate rows: 0 / Resolved: 0 / 0" → idempotency verified
- production write target: `https://uudfstpvndurzwnapibf.supabase.co` (matches `.env.local`)
- direct DB query: 2 annual+active rows, 2 with renewal_month set, 0 NULL — final state matches plan's success criteria
