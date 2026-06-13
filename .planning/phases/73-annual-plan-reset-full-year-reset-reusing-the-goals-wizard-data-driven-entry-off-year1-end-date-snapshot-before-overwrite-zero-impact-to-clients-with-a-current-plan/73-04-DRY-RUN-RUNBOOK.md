# 73-04 Dry-Run Runbook — Annual Reset (operator: Matt)

**Branch:** `plan/phase-73-annual-reset` (merged up to Phase 74 main; `tsc` clean, suite green bar the known timezone test)
**Captured read-only from prod (`uudfstpvndurzwnapibf`) on 2026-06-13.** All figures below are Precision *demo* data.

This is the `73-04` **human-verify** gate. The reset mutates real rows (reversibly), so you drive it. Everything below is pre-computed so it's a click + a paste.

---

## Test matrix

| Client | profile_id | year1_end_date | Expected behaviour |
|---|---|---|---|
| **Precision Electrical Group** (test) | `86e9d84f-6407-4230-84cd-a858982c219e` | **2026-06-30** (FY26 done) | **needs-reset** → CTA "Set your FY2027 Annual Plan", rolls on click |
| **Armstrong & Co** (control) | `678ae542-7f0b-43d1-8784-e7341767c250` | 2027-06-29 (on FY27) | **normal** → "Start Q… Review" CTA, **never reset** |
| **Fit2Shine** (control) | `82cbfa92-f00e-48e0-89fe-0fe6563d994c` | 2027-06-29 (on FY27) | **normal** → never reset |

---

## A. Precision — BEFORE (captured)

| field | before |
|---|---|
| revenue_current / y1 / y2 / y3 | 2,800,000 / **3,400,000** / **4,500,000** / **5,500,000** |
| gross_profit_y1 / y2 | 1,530,000 / **2,115,000** |
| net_profit_y1 / y2 | 442,000 / **675,000** |
| customers_y1 / y2 | 2,200 / **2,800** |
| employees_y1 / y2 | 20 / **25** |
| plan_start / year1_end / plan_end | 2025-07-01 / 2026-06-30 / 2028-06-30 |
| year_type | FY |
| total / incomplete / selected initiatives | 22 / **22** / **14** |
| active KPIs | 12 |
| plan_snapshots (count / max version) | **1 / 1** |

## A. Precision — EXPECTED AFTER (D3 shift: new_current=prior_y1, new_y1=prior_y2, new_y2=new_y3=prior_y3)

| field | expected after | rule |
|---|---|---|
| revenue_current | **3,400,000** | = prior y1 |
| revenue_year1 | **4,500,000** | = prior y2 |
| revenue_year2 | **5,500,000** | = prior y3 |
| revenue_year3 | **5,500,000** | = prior y3 (extrapolated) |
| gross_profit_year1 | **2,115,000** | = prior gp y2 |
| net_profit_year1 | **675,000** | = prior np y2 |
| customers_year1 | **2,800** | = prior cust y2 |
| employees_year1 | **25** | = prior emp y2 |
| plan_start_date | **2026-07-01** | new FY27 start |
| year1_end_date | **2027-06-30** | new FY27 end |
| plan_end_date | **2029-06-30** | newFY+2 |
| quarterly_targets | **{}** | cleared (wizard re-defaults) |
| is_extended_period / year1_months | **false / 12** | clean year |
| year_type | FY | preserved |
| plan_snapshots count / max version | **2 / 2** | +1 snapshot |
| new snapshot label / type / year | **annual_reset_FY2026** / quarterly_review_pre_sync / 2026 | reset tag |
| initiatives: incomplete → | status **not_started**, **selected=false**, fiscal_year **2027** (22 rows) | carry-forward |
| selected initiatives | **14 → 0** | all deselected |

---

## B. Steps

1. Open **Precision** (`/quarterly-review` as coach, or impersonate). Confirm the CTA reads **"Set your FY2027 Annual Plan"** (not a Q-review CTA).
2. Run **VERIFY-PRECISION SQL** below → record BEFORE (should match section A).
3. Click the CTA → lands on `/goals?reset=annual`. Wizard should show the **rolled** ladder in Step 1 (revenue_year1 = 4,500,000) and even-split Step 4; the 22 initiatives appear as **unselected** candidates.
4. Re-run **VERIFY-PRECISION SQL** → AFTER must match section A "expected after".
5. **Idempotency:** reload `/goals` normally (no `?reset`) → re-run SQL → **nothing changes** (revenue_year1 stays 4,500,000, still 2 snapshots).
6. **Zero-impact controls:** open Armstrong + Fit2Shine `/quarterly-review` → both show the **normal** "Start Q… Review" CTA, **no** reset prompt. Run **VERIFY-CONTROLS SQL** before and after step 3 → **zero diff**.

---

## C. Verify SQL (paste into Supabase)

**VERIFY-PRECISION**
```sql
select
  g.revenue_current, g.revenue_year1, g.revenue_year2, g.revenue_year3,
  g.gross_profit_year1, g.net_profit_year1, g.customers_year1, g.employees_year1,
  g.plan_start_date, g.year1_end_date, g.plan_end_date,
  g.quarterly_targets::text as qtargets, g.is_extended_period, g.year1_months, g.year_type,
  (select count(*) from strategic_initiatives si where si.business_id::text='86e9d84f-6407-4230-84cd-a858982c219e' and si.selected) as selected_inits,
  (select count(*) from strategic_initiatives si where si.business_id::text='86e9d84f-6407-4230-84cd-a858982c219e' and si.status in ('not_started','in_progress','on_hold')) as incomplete_inits,
  (select count(*) from plan_snapshots ps where ps.business_id::text='86e9d84f-6407-4230-84cd-a858982c219e') as snapshots,
  (select label from plan_snapshots ps where ps.business_id::text='86e9d84f-6407-4230-84cd-a858982c219e' order by version_number desc limit 1) as latest_snapshot_label
from business_financial_goals g
where g.business_id = '86e9d84f-6407-4230-84cd-a858982c219e';
```

**VERIFY-CONTROLS** (Armstrong + Fit2Shine — must be identical before & after)
```sql
select b.name, g.year1_end_date, g.revenue_year1,
  (select count(*) from plan_snapshots ps where ps.business_id::text = bp.id::text) as snapshots,
  (select count(*) from plan_snapshots ps where ps.business_id::text = bp.id::text and ps.label like 'annual_reset_%') as reset_snaps
from businesses b join business_profiles bp on bp.business_id=b.id
left join business_financial_goals g on g.business_id = bp.id::text
where b.id in ('a0bf1b0a-663e-4636-8c0d-eef62972dcbc','389167dc-acb9-4a56-a594-aa77eae15745') order by b.name;
```
Controls BEFORE (must be unchanged AFTER):
- Armstrong: year1_end 2027-06-29, revenue_year1 7,500,000, snapshots **1**, reset_snaps **0**
- Fit2Shine: year1_end 2027-06-29, revenue_year1 0, snapshots **0**, reset_snaps **0**

---

## D. Rollback (revert Precision after the dry-run)

The reset captured a full restorable snapshot (`annual_reset_FY2026`). To restore Precision to its pre-reset ladder, run `restoreAnnualResetSnapshot({ businessId:'86e9d84f-…', snapshotId:<the new snapshot id> })` (financial ladder is load-bearing and fully restored; KPIs/initiatives are captured in `plan_data` but restored manually). Get the snapshot id:
```sql
select id, label, version_number from plan_snapshots
where business_id::text='86e9d84f-6407-4230-84cd-a858982c219e' and label='annual_reset_FY2026';
```
(If you want, I can add a tiny one-off restore script so it's a single command.)

---

## PASS / FAIL

- **PASS** = Precision rolls to section-A "expected after" exactly, a `annual_reset_FY2026` snapshot appears (count 1→2), re-entry doesn't re-roll, and **both controls are byte-identical before/after**.
- **FAIL** = any control changes, snapshot missing, or rolled values wrong → stop, capture the deviation, do not proceed to 73-05/06.

**Resume signal:** reply `approved` once Precision rolls correctly and both controls are untouched, or describe the deviation.
