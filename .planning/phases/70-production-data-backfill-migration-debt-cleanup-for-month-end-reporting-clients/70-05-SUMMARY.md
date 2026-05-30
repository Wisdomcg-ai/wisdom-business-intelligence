---
phase: 70-production-data-backfill-migration-debt-cleanup-for-month-end-reporting-clients
plan: 05
subsystem: subscription-budgets
tags: [supabase, subscription-budgets, envisage, paypal-dedupe, account-codes, backfill, xero, vendor-normalization, no-schema-change]

# Dependency graph
requires:
  - phase: 70-production-data-backfill-migration-debt-cleanup-for-month-end-reporting-clients
    plan: 01
    provides: Pre-write rollback snapshot capturing subscription_budgets baseline (103 rows) — restorable if needed
  - phase: 70-production-data-backfill-migration-debt-cleanup-for-month-end-reporting-clients
    plan: 04
    provides: Vendor normalization import pattern (createVendorKey + extractVendorName direct from src/lib/utils/vendor-normalization.ts) — reused here so subscription-detail report route and this script always share the same matcher
  - phase: 69-xero-token-auto-refresh-durability
    plan: 04
    provides: Xero token-refresh cron health — without a valid access token this script cannot read Xero BankTransactions for vendor→account_code inference
provides:
  - scripts/70-05-B1-envisage-cleanup.ts (two-mode dry-run / --apply Envisage subscription_budgets cleanup script — 670 LOC; preserved for future re-runs as new Envisage subs are added)
  - 1 subscription_budgets row DELETED in production (Envisage generic "Paypal" merged-into-and-replaced-by the more specific "Paypal Australia 1043714034893")
  - 36 subscription_budgets rows UPDATED in production with account_codes inferred from the last 12 months of Envisage Xero SPEND BankTransactions
provides:
  - The monthly report's subscription tab can now match Envisage vendor spend to a P&L account_code for 36/43 rows (84%) — variance lines that previously rendered blank (because account_codes was empty) will now resolve
  - Paypal duplication permanently closed for Envisage — exactly one Paypal row remains and it carries the merged budget + inherited account_codes [415, 440, 710]
affects: [70-06-jds-cleanup, 70-07-iict-cleanup, 70-08-audit-rerun, code-fixes-phase-B2-vendor-normalization-consolidation, future-monthly-report-subscription-variance-rendering]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two-mode operational script (dry-run / --apply) with --skip-xero testing flag; per-step try/catch around STEP A's UPDATE-then-DELETE so a failed DELETE leaves a loud error and aborts but does NOT silently corrupt state"
    - "Paypal merge done as 'merge-then-delete' (NEVER bulk delete): identify specific-vs-generic by regex (/paypal\\s+australia\\b/i OR contains 8+ digits for the specific; /^paypal$/i for the generic); if pattern is not exactly 1+1 → log error and skip (no mutation)"
    - "Account-code inference: build a vendor_key → account_code → count index over the last 12 months of Envisage SPEND BankTransactions (one fetch, 1815 transactions for Malouf Family Trust tenant), then top-3 most-frequent codes per vendor (cap at 3 — anything more is noise)"
    - "Generic-fallback inference for Paypal keeper: when the specific row's vendor_name maps to zero Xero matches (Xero contacts use 'Paypal', not 'Paypal Australia 1043714034893'), fall back to looking up the generic 'Paypal' vendor_key and inherit its codes [415, 440, 710]"
    - "Explicit skip-list for junk vendor names (SKIP_AUTOFILL_VENDOR_NAMES = Set<string>) — currently only 'Unknown' (372 tx across 34 codes, no dominant pattern would mislead variance)"
    - "Vendor normalization reused via direct import of createVendorKey + extractVendorName from src/lib/utils/vendor-normalization.ts — same pattern as 70-04 and src/app/api/monthly-report/subscription-detail/route.ts (B2 consolidation prep)"
    - "Xero token acquisition via the centralized getValidAccessToken from src/lib/xero/token-manager.ts (Phase 53 invariant — no hand-rolled refresh)"
    - "Idempotency guard on Step B updates: .or('account_codes.is.null,account_codes.eq.{}') filter on the UPDATE so a row that was filled in by hand between dry-run inference and apply will NEVER be overwritten"

key-files:
  created:
    - scripts/70-05-B1-envisage-cleanup.ts (Task 1, commit 364c37a8; D1+D2 amendments, commit 359e7173)
    - .planning/phases/70-production-data-backfill-migration-debt-cleanup-for-month-end-reporting-clients/70-05-SUMMARY.md (this file)
  modified:
    - subscription_budgets (production, Envisage business_id=8c8c63b2-bdc4-4115-9375-8d0fd89acc00): 1 row DELETED (generic Paypal id=fab1f8a5-c38e-4634-b33a-19ba892be007), 36 rows UPDATED with account_codes (the Paypal keeper id=fbc38c1a-9993-45da-990d-a4c986ec7e29 received [415, 440, 710] via fallback)
    - .planning/STATE.md
    - .planning/ROADMAP.md

key-decisions:
  - "AUDIT FRAMING CORRECT (recorded 2026-05-31): unlike 70-02 and 70-04 where the Phase 70 audit overcounted, the audit's expectation for 70-05 matched live production exactly — 44/44 active Envisage rows had empty account_codes. The plan's 'longest-tail data debt' framing was real. This is a useful signal: not every audit framing is wrong; verify per-plan."
  - "D1 (Matt 2026-05-31) — PayPal post-merge codes inheritance: the kept row 'Paypal Australia 1043714034893' has zero direct Xero BankTransaction matches because Xero contacts use the generic 'Paypal' name. Without a fallback, the surviving row would carry empty account_codes despite being the most-active vendor (30 matches as 'Paypal' in the last 12mo). Decision: when the keeper matches the Paypal-specific pattern AND has zero direct matches, infer from the generic 'Paypal' vendor_key. Result: keeper inherited [415, 440, 710] (415×27, 710×2, 440×1). Implemented in `runAccountCodesBackfill` as a `fallbackNote: ' [via generic \"Paypal\" fallback]'` branch."
  - "D2 (Matt 2026-05-31) — 'Unknown' vendor auto-fill skip: the row vendor_name='Unknown' matched 372 SPEND transactions in the last 12mo, spread across 34 distinct account codes. Top-3 (492×67, 473×40, 404×37) account for <40% of activity. Decision: SKIP — never auto-fill. Marked UNRESOLVED with the explicit reason 'excluded from auto-fill (junk vendor name, no dominant pattern)'. Recommend deactivating or renaming this row in a future ops cleanup pass — it's an artifact of un-categorized BankTransactions that someone seeded as a subscription_budget row at some point."
  - "D3 (Matt 2026-05-31) — 'Jb Hi Fi Group Pl' duplicate of 'JB Hi-Fi' deferred OUT OF 70-05 SCOPE. 70-05's locked scope is Paypal-only dedupe (see CONTEXT.md decisions block). 'Jb Hi Fi Group Pl' shows 0 direct matches; 'JB Hi-Fi' resolved to [440, 710] (4 matches). Resolving this duplicate requires a generalized vendor-aliasing decision (not just a single regex pattern) — deferred to a future ops cleanup or to a follow-up plan in this phase."
  - "D4 (Matt 2026-05-31) — apply approved. Executed `npx tsx scripts/70-05-B1-envisage-cleanup.ts --apply`. Result: 1 DELETE + 36 UPDATEs + 1 keeper UPDATE rolled into the merge UPDATE. Zero failures. Re-run dry-run confirms idempotency."
  - "STEP A's keeper UPDATE merges account_codes from both rows (uniq+sort) — but both rows started empty, so the immediate post-merge keeper had empty account_codes. STEP B then re-fetched the keeper as a candidate (it's still active + empty), and the Paypal-fallback branch wrote [415, 440, 710] in the apply pass. This is by design: the codes inheritance is fundamentally driven by Xero observation, not by row-to-row UPDATE. If both rows had had non-empty codes, STEP A's set-union would have preserved them."
  - "monthly_budget on both Paypal rows was identical (\$238.78) so the max() merge was a no-op. annual_budget is a GENERATED column (monthly_budget × 12) so Postgres recomputed it automatically — script does NOT write to annual_budget."
  - "7 UNRESOLVED rows after apply: Abacus.ai, Jb Hi Fi Group Pl, Kindle, Paddle, Shutterstock, Tech, Unknown. All are either (a) vendors with zero Xero BankTransaction matches in the 12mo window OR (b) the 'Unknown' explicit skip. These are NOT failures — they are Matt-acknowledged surfaces for manual review."

patterns-established:
  - "Per-client dedupe scripts in this phase (70-05 Envisage, future 70-06 JDS, 70-07 IICT) MUST be merge-then-delete with a per-step try/catch — never bulk-delete. The pattern is: (1) read both rows, (2) compute merged values, (3) UPDATE keeper to merged values, (4) DELETE loser, (5) if step 4 fails, log loudly and exit — don't proceed with downstream backfill."
  - "When a 'specific' vendor row (e.g. 'Paypal Australia 1043714034893') has zero direct Xero matches because the Xero contact uses a shorter generic name, the inference should fall back to the generic vendor_key. The trigger pattern (regex on vendor_name) should be explicit in the script — don't make this implicit."
  - "Junk vendor names (vendor_name='Unknown' is the canonical example) should be marked UNRESOLVED with an explicit reason string in the script. Auto-filling them with top-3 codes from a long-tail distribution would surface misleading variance worse than leaving the row empty."
  - "Per-row UPDATE in the apply pass must use a safety guard like `.or('account_codes.is.null,account_codes.eq.{}')` so concurrent manual edits between dry-run and apply are never overwritten."

# Metrics
metrics:
  duration: ~45 minutes total (initial script build + checkpoint review + D1/D2 amendments + apply + idempotency + summary)
  tasks: 2 (build + apply checkpoint)
  files: 1 created (script, prior commit 364c37a8) + 1 created (this SUMMARY) + 2 modified (STATE, ROADMAP)
  completed_date: 2026-05-31
  paypal_rows_before: 2 (specific + generic)
  paypal_rows_after: 1 (specific kept; generic merged-then-deleted)
  envisage_subs_count_before: 44
  envisage_subs_count_after: 43
  rows_with_account_codes_after: 36 (84% of 43)
  unresolved_rows: 7 (Abacus.ai, Jb Hi Fi Group Pl, Kindle, Paddle, Shutterstock, Tech, Unknown)
---

# Phase 70 Plan 05: Envisage subscription_budgets Cleanup Summary

Resolved the Envisage Paypal duplicate by merging the generic "Paypal" row into the specific "Paypal Australia 1043714034893" row (keeper inherited the loser's would-have-been Xero account_codes [415, 440, 710] via generic-name fallback), and backfilled 36 empty `account_codes` arrays across remaining Envisage rows by inferring top-3 codes from 12 months of Envisage SPEND BankTransactions.

## Audit framing — CORRECT

Unlike Phase 70-02 (where the audit overcounted multi-active forecasts by counting business-cardinality instead of unique-key-cardinality) and Phase 70-04 (where the audit overcounted NULL renewal_month by counting historical/inactive rows), the Phase 70 audit's framing for 70-05 matched live production exactly:

- Audit expectation: 44 active Envisage subscription_budgets rows with empty account_codes
- Live reality at apply time: 44 active rows, 0 with populated account_codes, 44 with empty
- After apply: 43 active rows (1 merged-deleted), 36 populated, 7 UNRESOLVED

The plan's "longest-tail data debt" framing was real. **Lesson:** audit framings are not categorically wrong; verify per-plan.

## STEP A — Paypal merge

| Field | Keeper (kept) | Loser (deleted) | After merge |
|---|---|---|---|
| id | fbc38c1a-9993-45da-990d-a4c986ec7e29 | fab1f8a5-c38e-4634-b33a-19ba892be007 | — |
| vendor_name | "Paypal Australia 1043714034893" | "Paypal" | — |
| vendor_key | paypalaustralia1043714034893 | paypal | — |
| monthly_budget | $238.78 | $238.78 | $238.78 (max preserved) |
| annual_budget | $2865.36 (generated) | $2865.36 (generated) | $2865.36 (recomputed by Postgres) |
| account_codes | [] | [] | [415, 440, 710] (via fallback) |
| is_active | true | true | true (OR) |

**Why the keeper started empty after the merge:** both rows had empty `account_codes` at the source, so the set-union was empty. STEP B then re-processed the keeper (it's still active + empty), and its specific-row vendor name matched the Paypal-fallback regex pattern (`/paypal\s+australia\b/i`), triggering the generic-fallback inference branch. The generic "Paypal" vendor_key index had 30 matches in Envisage's last 12mo of SPEND (415×27, 710×2, 440×1) → top-3 = [415, 440, 710].

## STEP B — account_codes backfill

**36 rows UPDATED** with inferred codes. Sample (full list in apply log `/tmp/70-05-apply.log`):

| Vendor | Codes | Match basis |
|---|---|---|
| Add Event | [485] | 1 match |
| Adobe | [485] | 12 matches, all 485 |
| Anthropic | [485] | 5 matches |
| Apple | [440, 461, 485] | 117 matches (485×114 dominant; trailing codes legitimate alternates) |
| Audible | [473, 485] | 12 matches (485×11, 473×1) |
| JB Hi-Fi | [440, 710] | 4 matches (440×3, 710×1) |
| Loom | [420, 485, 504] | 13 matches (504×11 dominant) |
| OpenAI | [485] | 25 matches, all 485 |
| **Paypal Australia 1043714034893** | **[415, 440, 710]** | **30 matches via generic "Paypal" fallback** |
| Telstra | [473, 485, 489] | 43 matches (485×35 dominant) |

**7 UNRESOLVED** (Matt-acknowledged, NOT failures):

| Vendor | Reason | Recommendation |
|---|---|---|
| Abacus.ai | no Xero BankTransaction matches in last 12mo | Manual entry if active; deactivate if dormant |
| Jb Hi Fi Group Pl | no Xero match (likely duplicate of "JB Hi-Fi") | **Deferred per D3** — future cleanup pass should merge into "JB Hi-Fi" |
| Kindle | no Xero match | Manual entry (paid via Amazon, may not appear as direct Xero SPEND) |
| Paddle | no Xero match | Manual entry if active |
| Shutterstock | no Xero match | Manual entry if active |
| Tech | no Xero match (vague name) | Rename or deactivate |
| Unknown | **Explicit skip per D2** — 372 tx spread across 34 codes, no dominant pattern | Deactivate or rename in future cleanup |

## Idempotency

Re-running `npx tsx scripts/70-05-B1-envisage-cleanup.ts` after `--apply` reports:

```
═══ PAYPAL MERGE PLAN ═══
  Found 1 Paypal-matching row(s) for Envisage
  ✓ already deduped (one specific Paypal row remains)

═══ ACCOUNT_CODES BACKFILL ═══
  Active Envisage subs: 43
  Already have non-empty account_codes (untouched): 36
  Candidate rows (empty account_codes): 7

  Backfill totals: INFERRED=0  UNRESOLVED=7  SKIPPED_XERO=0  SKIPPED_NULL=0
```

The 7 UNRESOLVED rows remain UNRESOLVED on every re-run (no PL activity matches; "Unknown" stays explicitly skipped). A future ops cleanup or manual entry would resolve them — not a script concern.

## Decisions log (Matt 2026-05-31)

| ID | Decision | Implementation |
|---|---|---|
| D1 | Apply generic Paypal's inferred codes [415,440,710] to the keeper | Added Paypal-specific-pattern fallback branch in `runAccountCodesBackfill` per-row inference |
| D2 | Skip auto-fill for vendor_name='Unknown'; leave account_codes empty | Added `SKIPPED_AUTOFILL_VENDOR_NAMES = new Set(['Unknown'])` skip-list with `UNRESOLVED` status + reason string |
| D3 | Defer "Jb Hi Fi Group Pl" duplicate of "JB Hi-Fi" out of 70-05 scope | No code change; documented in this SUMMARY under UNRESOLVED rows for future cleanup |
| D4 | Approved apply | Executed `--apply`; verified idempotency by re-running dry-run |

## Commit history

| Hash | Commit |
|---|---|
| 364c37a8 | feat(70-05): envisage subscription_budgets cleanup script (Paypal dedupe + account_codes inference) |
| 359e7173 | fix(70-05): Paypal post-merge codes + Unknown auto-fill skip per Matt |
| 9ce1f547 | chore(70-05): apply B1 Envisage cleanup — 1 dedupe + 36 account_codes |

## Follow-ups

- **Phase 70-08** (C1 audit re-run): re-run `scripts/phase-70-data-audit.mjs` and confirm Envisage subscription count is now 43 (was 44), and 36+ rows have non-empty `account_codes`
- **Future ops cleanup** (no plan yet): resolve the 7 UNRESOLVED Envisage subs (Abacus.ai, Jb Hi Fi Group Pl, Kindle, Paddle, Shutterstock, Tech, Unknown) via manual entry, deactivation, or rename
- **Future ops cleanup**: generalized vendor-aliasing (e.g. "Jb Hi Fi Group Pl" → "JB Hi-Fi", "Paypal Australia 1043714034893" → "Paypal") — would require a broader cross-client aliasing decision, not just per-plan regex

## Self-Check: PASSED

- scripts/70-05-B1-envisage-cleanup.ts: FOUND
- Commit 364c37a8: FOUND
- Commit 359e7173: FOUND
- Commit 9ce1f547: FOUND
- Envisage subscription_budgets row count: 43 (was 44) — verified via apply log "count AFTER: 43"
- Paypal merge idempotency: verified — re-run dry-run reports "already deduped"
- account_codes backfill idempotency: verified — re-run dry-run reports "0 INFERRED + 7 UNRESOLVED"
