# Two Balance-Sheet Stores — Double Fetch and Production Drift

**Date:** 2026-09-16
**Scope:** every path that fetches Xero `Reports/BalanceSheet` and every surface
that reads a stored balance sheet.
**Status:** investigation only — no behaviour changed by this PR.
**Found while:** removing the monthly-report Sync route's false `last_synced_at`
stamp (#548).

---

## Summary

One click of **Sync** on the monthly report fetches each org's balance sheet
from Xero **twice**, into two tables that nothing keeps in step:

| | `xero_bs_lines` | `xero_balance_sheet_lines` |
|---|---|---|
| Written by | `syncBalanceSheetForTenant` ([sync-orchestrator.ts:346](src/lib/xero/sync-orchestrator.ts#L346)) | `syncBusinessBSMirror` → `replaceTenantBSRows` ([bs-writer.ts:59](src/app/api/monthly-report/sync-xero/bs-writer.ts#L59)) |
| Refreshed | 4×/day (`sync-all-xero` 04/10/16/22 UTC) + 4 manual routes | 1×/day (`sync-bs-mirror` 03:00 UTC) + the monthly-report Sync only |
| Shape | long; one row per account per `balance_date` | wide; `monthly_values` jsonb keyed `YYYY-MM` |
| Key space | `business_profiles.id` (FK-enforced) | `businesses.id` (FK-enforced) |
| Window | 15 month-ends today (current FY YTD + full prior FY) | 3 months, including the in-progress one |
| Read by | pack pages, opening bank, the daily `bs_equation` invariant | Consolidated Balance Sheet, consolidated cashflow |

They **do** disagree in production today. At 31 Aug 2026, **6 of 14 active
tenants** differ across the two stores — Urban Road by **$39,649.99 on equity**,
Sharon King by **$19,971.60 on assets**. Both stores balance internally, so no
existing check catches it.

The cause is **cadence, not parsing**: the same report, fetched up to ~24 hours
apart. A fleet-wide comparison found **zero** accounts where the two stores
disagree on `account_type`, and the one tenant whose ledger did not move in the
gap (Distinct Directions) matches **to the cent** on both July and August.

**Recommendation: consolidate onto `xero_bs_lines` and delete the second fetch.**
Detail in §5.

---

## 1. The double fetch

Both paths run inside `POST /api/monthly-report/sync-xero`
([route.ts:114](src/app/api/monthly-report/sync-xero/route.ts#L114) and
[:134](src/app/api/monthly-report/sync-xero/route.ts#L134)), back to back, in
one request.

### Same endpoint, same as-at dates, different parameters

| | orchestrator → `xero_bs_lines` | mirror → `xero_balance_sheet_lines` |
|---|---|---|
| URL | `Reports/BalanceSheet?date=<end>&standardLayout=false&paymentsOnly=false` ([sync-orchestrator.ts:225](src/lib/xero/sync-orchestrator.ts#L225)) | `Reports/BalanceSheet?date=<end>&periods=1&timeframe=MONTH&standardLayout=true` ([bs-mirror-sync.ts:56](src/lib/xero/bs-mirror-sync.ts#L56)) |
| Dates | every month-end in `fyWindows` → **15 today**: 2025-07-31 … 2026-09-30 | last 3 calendar months → **3 today**: 2026-07-31, 2026-08-31, 2026-09-30 |
| Pacing | `fetchXeroWithRateLimit` (Retry-After aware) | plain `fetch` + hard `sleep(500)` per month |

**All three mirror dates are already in the orchestrator's fifteen.** Every BS
fetch the mirror makes on the manual path re-requests a report the same request
pulled seconds earlier.

**Cost per Sync click, per org:** +3 Xero calls (~9% on top of the ~34 the
orchestrator issues for P&L + BS + `/Organisation` + `/Accounts`) and ≥1.5s of
forced pacing plus round-trips. Multi-org businesses multiply it — Dragon and
IICT are 2 orgs each, so +6. The route's `maxDuration` is 300s
([route.ts:28](src/app/api/monthly-report/sync-xero/route.ts#L28)), so this is
not the binding constraint today, but it is pure waste against the 60/min and
5000/day per-org limits.

### Two parameter notes

- `periods=1&timeframe=MONTH` is the exact shape the codebase elsewhere refuses:
  `singlePeriodPLUrl` carries "**NEVER** includes `periods=` or `timeframe=` —
  those are the documented-buggy shape that this plan replaces"
  ([sync-orchestrator.ts:182](src/lib/xero/sync-orchestrator.ts#L182)), and
  `bs-single-period-parser.ts` opens with "Reports/BalanceSheet has the same
  documented periods-parameter bug as Reports/ProfitAndLoss". The mirror reads
  only `Cells[1]`, so the extra comparative column is discarded. **No evidence
  it is producing wrong numbers today** — see §3.
- `standardLayout=true` (mirror) *ignores* the org's custom report layout;
  `standardLayout=false` (orchestrator) honours it. That is deliberate on the
  orchestrator side — the long comment at
  [sync-orchestrator.ts:433](src/lib/xero/sync-orchestrator.ts#L433) explains
  that BS bucketing must follow the layout the user dragged accounts into. The
  two stores are therefore asking Xero for structurally different reports. It
  makes no difference across the current fleet (§3), but it is a divergence
  waiting for the first client with a custom BS layout.

---

## 2. Who reads which

### `xero_bs_lines` — long, profile-keyed, has `basis`

| Reader | Via | Surface |
|---|---|---|
| [money-flow-load.ts:38](src/lib/monthly-report/money-flow-load.ts#L38) | `xero_bs_lines_wide_compat` | "Where Did Our Money Go" pack page |
| [pack-cash-model-load.ts:82](src/lib/monthly-report/pack-cash-model-load.ts#L82) | `xero_bs_lines_wide_compat` | pack cash model |
| [opening-bank-load.ts:78,101](src/lib/monthly-report/opening-bank-load.ts#L78) | **base table**, `.eq('basis','accruals')` ✓ | `/api/monthly-report/opening-bank`, `preview-pack.ts` |
| [metric-invariants/route.ts:153](src/app/api/cron/metric-invariants/route.ts#L153) | `xero_bs_lines_wide_compat` | the daily `bs_equation` invariant |

### `xero_balance_sheet_lines` — wide, businesses-keyed, no `basis` column

| Reader | Surface |
|---|---|
| [consolidation/balance-sheet.ts:138](src/lib/consolidation/balance-sheet.ts#L138) | `/api/monthly-report/consolidated-bs` → `useConsolidatedBalanceSheet` → **Consolidated Balance Sheet** |
| [consolidation/cashflow.ts:142](src/lib/consolidation/cashflow.ts#L142) | `/api/monthly-report/consolidated-cashflow` — per-tenant opening bank |
| [scripts/seed-precision-demo.ts:136](scripts/seed-precision-demo.ts#L136) | writes the Precision Electrical demo |

### Neither — a third source of balance-sheet truth

`/api/Xero/balance-sheet` fetches `Reports/BalanceSheet` **live from Xero on
page load** (two dates per tenant,
[route.ts:103](src/app/api/Xero/balance-sheet/route.ts#L103) and
[:145](src/app/api/Xero/balance-sheet/route.ts#L145)) and stores nothing. That
is what the monthly-report **Balance Sheet tab** (`useBalanceSheet`),
`ForecastOverview` and the pack export freeze render.

So a coach can see **three** different balance sheets for the same client-month
depending on which tab they open: the pack pages (store A), the Consolidated
Balance Sheet (store B), and the Balance Sheet tab (live).

The `bs_equation` invariant was deliberately moved onto store A on 2 Sep 2026
for exactly this reason — [bs-equation.ts:7](src/lib/invariants/bs-equation.ts#L7):
"the check was therefore watching a table the reports don't use — it reported
Armstrong-only for weeks while six tenants sat out of balance in the mirror that
actually renders."

### Ways the two can disagree, beyond cadence

- **Month window.** `buildBSEntityColumn` does
  `monthly_values[asOfDate.slice(0,7)] ?? 0`
  ([balance-sheet.ts:186](src/lib/consolidation/balance-sheet.ts#L186)). The
  mirror holds 3 months. Ask the Consolidated Balance Sheet for anything older
  and **every account returns 0** — a silent all-zero balance sheet, not an
  error, while the pack pages have 15 months of real data for the same month.
  No coverage or staleness guard exists on that route.
- **Key and dedup.** Store A keys on the Xero account GUID (synthesising a
  uuid-v5 when absent) and drops totals by name. The mirror keys on
  `account_name`, aggregates same-named rows, and drops **any row without an
  account GUID** ([report-parsers.ts:166](src/app/api/monthly-report/sync-xero/report-parsers.ts#L166)).
  Different exclusion mechanisms over the same report.
- **Nesting.** The mirror's parser walks exactly one level — top-level `Section`
  → direct `Row` children ([report-parsers.ts:142](src/app/api/monthly-report/sync-xero/report-parsers.ts#L142)).
  Rows inside a nested section are skipped with no log and no Sentry. Store A's
  parser recurses with forward-carry. `standardLayout=true` keeps Xero's BS
  flat, which is why this has not bitten.
- **Number parsing.** Store A uses `parseAmount` — strips `$` and `,`, treats
  accounting parens as negative ([pl-by-month-parser.ts:56](src/lib/xero/pl-by-month-parser.ts#L56)).
  The mirror does `parseFloat(raw.replace(/,/g,''))`
  ([report-parsers.ts:152](src/app/api/monthly-report/sync-xero/report-parsers.ts#L152)):
  a parenthesised negative `(1,234.56)` becomes `NaN` and the row is **skipped
  entirely**; a `$` prefix does the same.
- **Write gate.** Store A skips writing any date failing `A − L − E ≤ $0.05`,
  and its stale-row sweep runs only on dates it did write — so a gated date
  keeps whatever rows were there before, possibly weeks old. The mirror writes
  unconditionally, with no balance gate.
- **`basis`.** Store A has the column; the compat view filters `accruals` and
  `opening-bank-load` filters it on the base table. The mirror has **no `basis`
  column at all** — a cash-basis BS would collide onto the same row and
  overwrite.
- **Month-end date derivation (latent, local only).** `getBSMonthList`'s
  `lastDay()` does `new Date(y, m, 0).toISOString()`
  ([bs-mirror-sync.ts:31](src/lib/xero/bs-mirror-sync.ts#L31)). Verified: under
  `TZ=UTC` that yields `2026-08-31`; under Sydney local time it yields
  **`2026-08-30`** — the wrong day, stored under the right month key. Vercel
  runs UTC so production is correct; any local run of this code is silently off
  by a day. The orchestrator's `lastDayOfMonth` builds the string from date
  parts and is timezone-safe ([sync-orchestrator.ts:108](src/lib/xero/sync-orchestrator.ts#L108)).

---

## 3. Production evidence (read-only)

All figures from small filtered `SELECT`s against prod, 16 Sep 2026. No writes.

### Totals at 31 Aug 2026 — tenants where the stores disagree

| Tenant | Δ assets | Δ liabilities | Δ equity |
|---|---:|---:|---:|
| Urban Road | +186.12 | −39,463.87 | **+39,649.99** |
| Sharon King | **−19,971.60** | −26.25 | −19,945.35 |
| Attaquer | +1,650.38 | +2,628.09 | −977.71 |
| Dragon Roofing | 0.00 | −1,727.29 | +1,727.29 |
| Armstrong & Co | *absent from mirror* | *absent* | *absent* |
| Precision Electrical | *absent from `xero_bs_lines`* | *absent* | *absent* |

(Δ = mirror − `xero_bs_lines`. The other 8 active tenants match exactly.)

### It is cadence, not parsing

Urban Road, 31 Aug 2026, account level:

| Account | `xero_bs_lines` | mirror | Δ |
|---|---:|---:|---:|
| Trade Creditors | 423,603.95 | 380,205.08 | −43,398.87 |
| GST Collected & Paid | 65,475.61 | 69,410.61 | +3,935.00 |
| Trade Debtors | 278,241.94 | 278,428.06 | +186.12 |
| Current Year Earnings | 107,118.53 | 146,768.52 | +39,649.99 |

Four facts establish the cause:

1. **Write times.** Mirror written `2026-09-15 03:01 UTC`; `xero_bs_lines`
   written `2026-09-15 22:08 UTC` — 19 hours apart.
2. **The deltas are a ledger movement, not a misclassification.**
   ΔA = ΔL + ΔE holds exactly (`186.12 = −39,463.87 + 39,649.99`), and **both
   stores balance internally** to the cent. A bucketing bug would break one of
   them. The signature — creditors up, GST up, current-year earnings down — is
   ~$43.4k of August-dated purchase bills entered in the gap.
3. **A tenant whose ledger did not move matches exactly.** Distinct Directions
   agrees to the cent on *both* July and August (1,583,892.38 / 1,320,266.03 /
   263,626.35 and 1,587,806.74 / 1,438,134.92 / 149,671.82).
4. **No bucketing disagreement anywhere.** A fleet-wide comparison of
   `account_type` per (tenant, account_name) at 2026-08-31 returned **zero
   rows**. `standardLayout` and the catalog-vs-section precedence are not
   currently producing different classifications for any client.

Urban Road's July shows the same pattern in miniature: assets identical, a clean
$300 swap between liabilities and equity — one backdated bill.

### Two structural cases that are not cadence

- **Armstrong & Co** — mirror last written **2026-05-28**, holding month keys
  `2026-03, 2026-04, 2026-05`. `monthly_values['2026-08']` is absent, so
  `?? 0` makes the Consolidated Balance Sheet report **$0 assets, $0
  liabilities, $0 equity** for Armstrong in August, confidently and without a
  warning — while `xero_bs_lines` holds a real August sheet ($387,625.85
  assets, last written 11 Aug). Armstrong's Xero connection is the known-broken
  one. The delete+insert swap is the mechanism: a tenant whose token fails
  leaves the stale grid untouched with no staleness marker, and the reader turns
  its absence into a number.
- **Precision Electrical Group** — `is_active = false` (the demo account), 13
  rows in the mirror last written 13 Sep, no counterpart in `xero_bs_lines`.
  `sync-bs-mirror` enumerates active connections only
  ([route.ts:71](src/app/api/cron/sync-bs-mirror/route.ts#L71)), so rows for a
  deactivated org are never refreshed and never removed. The mirror accumulates
  data nothing maintains.

---

## 4. Related finding (not this defect)

[derive-cash-from-bs-mirror.ts:67](src/lib/xero/derive-cash-from-bs-mirror.ts#L67)
reads the `xero_bs_lines` **base table with no `basis` filter** — the basis-view
trap the guard migration exists to prevent. It has **no production caller**
(referenced only by its own tests and by comments in three `Xero/*` routes), so
it is latent, not live. Worth fixing or deleting when that module is next
touched.

---

## 5. Recommendation

**Consolidate onto `xero_bs_lines`. Retire `xero_balance_sheet_lines`, the
second fetch, and the `sync-bs-mirror` cron.**

Two stores are not needed. Nothing the mirror provides is unavailable from
store A — the only genuine gap is shape (`monthly_values` keyed `YYYY-MM` vs
`balances_by_date` keyed `YYYY-MM-DD`), and both consolidation readers already
scope with `.in('business_id', ids.all)`, so the dual-ID spaces are already
handled on both sides.

Store A is the one to keep:

- it is the **fresher** store (4×/day vs 1×/day) and the one the pack pages,
  the preview harness and the `bs_equation` invariant already read — the
  invariant was moved onto it on 2 Sep 2026 for precisely this reason;
- **15 months** instead of 3, which removes the Consolidated Balance Sheet's
  silent all-zero months;
- it has what the mirror lacks: a `basis` column, a GUID key with a natural-key
  unique constraint, an `A − L − E` write gate, a per-date stale-row sweep, a
  basis-guarded compat view, and a timezone-safe month-end.

Suggested sequence, each its own PR:

1. **Stop the duplicate fetch.** Have the orchestrator's single parse feed both
   writers: `parseBSSinglePeriod` already produces everything the wide row
   needs, so `syncBusinessBSMirror` becomes a projection rather than a second
   round-trip. This removes the waste *and* makes drift impossible by
   construction on every path that runs the orchestrator. Behaviour-preserving
   today (§3 fact 4), but it changes the mirror's classification source, so it
   must be pinned with a reconciliation test comparing both projections across
   the fleet before it ships.
2. **Move the consolidation readers onto `xero_bs_lines`**, then delete
   `xero_balance_sheet_lines`, `bs-writer.ts` and `/api/cron/sync-bs-mirror`.
   The alignment key moves from `account_name` to the account GUID, which is an
   improvement but touches `accountAlignmentKey`, `deduplicateLines` and the
   elimination-rule matching — the riskiest step, and the reason it is separate.
3. **Fail-open the Consolidated Balance Sheet.** A month the store does not
   hold, or a tenant whose last write predates the report month, must render
   "could not check" — never `0`. This is the Armstrong case, and it is worth
   doing *before* step 2 since it is independently correct.

Step 1 alone removes the waste but not the drift: the crons still refresh the
two stores on different schedules, so the ~24-hour gap returns within a day.
Only step 2 ends it.

If instead the decision is to **keep both**, then the reason has to be written
down here, and three things need fixing regardless: the Armstrong silent zero,
the 3-month window behind a reader that can ask for any month, and the
timezone-dependent month-end.
