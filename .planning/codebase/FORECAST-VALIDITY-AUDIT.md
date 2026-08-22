# Forecast Builder Validity Audit — 21 Aug 2026

Trigger: Matt — "one more deep dive into the forecast builder... my concerns are
mainly that this is not adaptable across different businesses and different
chart of accounts." Assessment only; NO fixes applied yet.

Method: 32-agent workflow, 4 dimensions (CoA adaptability / independent formula
recomputation / process+data-flow / empirical replay against prod across 12
client CoAs, read-only), every material finding adversarially verified.
**28 confirmed, 0 refuted, 16 further P2-tier unverified, 40 checks solid.**
Full evidence: `FORECAST-VALIDITY-AUDIT-RAW.md` + `forecast-validity-audit-findings.json`
(same dir). Report artifact: https://claude.ai/code/artifact/b3acb40e-0836-4692-9ff3-a642cd93ba60

## Verdict

Y1 core engine is solid (revenue exact-to-dollar fleet-wide, #377-379 COGS fixes
intact, draft/generate semantics hold, super 0.12, multi-org aggregation, dual-ID
discipline all clean). Two systemic weaknesses:
1. **The CoA boundary is keyword-guessing** — breaks BOTH directions purely on
   account naming; 3 live client forecasts wrong today.
2. **Y2/Y3 held to a far lower standard than Y1** — several UI controls never
   persist; summary-parity guard is Y1-only so nothing fires.

## Live prod damage (Wave 0 — data repair first)

- **XVAL-2** Dragon FY27 missing ~$435k/yr "Virtual Contractors" (NP overstated
  ~4.4% of $9.94M revenue). Cause: TEAM_COST_KEYWORDS 'contractor' +
  shouldExcludeFromOpEx once Step 4 has payroll imports; bill-paid contractors
  have no Step-4 replacement. Digital Bond missing ~$134k same way. Urban Road
  ($433k) + Efficient Living ($161k) hit it on their next forecast.
- **XVAL-1** Digital Bond FY27 +$274k/yr zombie NULL-code wages/super duplicate
  lines (pre-SYS-code rows bypass unique index). Armstrong has 2 NULL-code
  lines, Envisage FY26 has 1 — re-arms anywhere.
- **XVAL-4** IICT active FY27 = abandoned pre-#350 session: $20k revenue vs $5M
  goal, no HK org (HK$18.4M) or second AU org ($3.67M). Root of "IICT budget=0".

## CoA adaptability defects (Wave 1 — the structural fix)

- **COA-01 (P0)** Payroll-in-COGS double count BY CONSTRUCTION (COGS seeded as
  %-of-rev unfiltered + Step 4 auto-import + convertTeam OpEx wages). Verified:
  no connected client currently has payroll wages typed COGS (Precision demo
  shape only) — bites the first trades onboarding.
- **XVAL-3/COA-03 (P1)** Inverse: wage accounts missing keywords ('Employment
  Expenses: Office team' $248k EL, 'Directors Costs - X' SPM) stay in OpEx AND
  get regenerated → double count.
- **XVAL-7 (P1)** 49/444 prod OpEx accounts fall through to adhoc incl IICT
  Consultancy $1.18M + Offshore VAs $917k; CV pattern-rescue UNREACHABLE
  (priorYearMonthly never populated by any writer). **XVAL-6** 'Work Cover'
  two-word spelling defeats carve-out.
- **COA-06 (P2)** Revenue named 'Rental Income'/'Royalties' demoted to Other
  Income → equipment-hire/franchise business sees ~$0 revenue in Step 2.
- **COA-05 (P1)** CSV/XLSX import: rows named containing income/revenue/expense/
  cost of/operating/total consumed as section headers → silently dropped.
  Only ingestion path for non-Xero prospects.
- **COA-07 (P2)** <12mo Xero ledger history seeds fixed OpEx at fraction of
  run-rate (÷12 always). 2 prod businesses at 3/12 months.
- **PROC-05/FML-14 (P1)** July-FY hardcoded end-to-end ('-07'/'-06' literals,
  fiscalYearStart:'07'). AU fleet safe; IICT HK org is the live risk.
- **COA-04 (P1)** Step 5 'Refresh from Xero' backfill is dead code (a.code vs
  accountCode; synthetic opex-N ids; default filter=subscription) that still
  clears the banner → subscription double-count guard silently disarmed.
- **PROC-06 (P1)** Server restore replaces opexLines with the FILTERED,
  code-stripped export → team/sub-covered lines + accountCodes lost on reopen;
  guard disarmed; clearing Step 4 later cannot un-exclude.

## Y2/Y3 fidelity defects (Wave 2)

- **FML-01/PROC-01/FML-06 (P0)** y2/y3 Overrides + %overrides + seasonal
  targets + COGS y2y3Trend: honored on screen, never exported/materialized,
  lost on reopen.
- **FML-02 (P0)** Partial Y2/Y3 monthly grid → monthlyToQuarterly returns
  all-zeros <12 keys → stores $0 for the year; also position-based key order.
- **FML-03/PROC-02 (P1)** Complete Y2/Y3 monthly grids flattened to quarter÷3
  in storage (revenue+COGS+variable OpEx+commissions inherit) — #379 class
  still live for out-years.
- **FML-04 (P1)** Materializer charges 12% super on bonuses+commissions;
  summary doesn't (materializer closer to ATO-correct; screens understate).
- **FML-05 (P1)** Explicit 0% increase coerced to 3% by summary (`|| 3`);
  Step 5 + materializer honor 0 — three different answers.
- **FML-07 (P1)** CapEx: op-lease charges 12mo/yr ignoring start month + term;
  depreciation never caps at useful life; legacy finance interest not clipped.
- **FML-08 (P1)** Seasonal OpEx Y2/Y3: three formulas (summary/Step5/
  materializer); materializer runs one growth-step hot with actual_months.
- Summary-parity guard is **Y1-only** — extend to 3 years as the backstop.

## Lifecycle (Wave 3)

- **PROC-03 (P1)** Stale localStorage draft on second device shadows newer
  server assumptions; mount-edit autosave overwrites last-writer-wins.
- **PROC-04 (P1)** Final Generate non-atomic: headline+goals+is_completed
  written BEFORE materialize RPC; RPC failure leaves divergence (loud, Sentry).
- P2 tail (unverified, logged in RAW): COA-09 $80k fabricated salaries labeled
  Xero-sourced; COA-10 FOURWEEKLY→monthly ~-7.7% wages; COA-11 code-less
  accounts unmappable; FML-09 partial year1Monthly summary/materializer gap;
  FML-10/11/13 stale side-panel formulas; PROC-07 commission timing reverts
  monthly on restore; PROC-08 defaultOpExIncreasePct not persisted; PROC-09
  generate no forecastId↔businessId check; PROC-10 recompute-vs-draft
  assumptions; PROC-11 orphaned draft rows; XVAL-5 synthetic account codes
  ('revenue-0', client-random) defeat per-line budget↔actual joins; XVAL-8
  xero_accounts hygiene (Envisage CoA duplicated under NULL tenant).

## Verified SOLID (do not re-audit)

Y1 revenue exact-to-dollar fleet-wide w/ actuals lock + residue absorption;
#377-379 intact; draft/generate #350 semantics no regression; 0-line generate
blocked client+server; is_active advisory-locked + unique index, no dup line
groups/orphans in prod; super 0.12 + contractors excluded both sides; loan
PMT/amortization correct; multi-org aggregatePeriod merges Dragon to the
dollar; no HKD-as-AUD anywhere; catalog-first P&L classification sound
(sync layer ≠ the problem); dual-ID discipline on all audited routes;
spreadsheet-reader robust; parity check's own math correct.

## Recommended fix order (agreed structure, awaiting Matt's go)

- **Wave 0**: repair Digital Bond zombies (+constraint), Dragon contractors
  (regenerate post-Wave-1), retire IICT shell.
- **Wave 1**: VISIBLE ACCOUNT MAP step — every account's inferred role shown
  with $ value, operator confirms once, persisted per business; keywords
  become suggestions never silent decisions; COGS-side team guard; immediate
  keyword wounds (contractor-class words out of auto-exclude, 'work cover'
  in, fix dead Refresh, lossless restore).
- **Wave 2**: export+materialize all Y2/Y3 operator input; store monthly
  grids monthly; partial grid = explicit months + formula fill; reconcile the
  4 summary-vs-stored formula disagreements; parity guard → all 3 years.
- **Wave 3**: draft freshness timestamps; atomic Generate; P2 tail.
- **Accepted constraints**: July-FY-only (revisit before non-July onboarding);
  CSV import fix before next non-Xero demo.
