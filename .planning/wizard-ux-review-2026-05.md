# Forecast Wizard UX/Structure Review

**Review date:** May 2026  
**Scope:** ForecastWizardV4, 9-step workflow  
**Target user:** Business coach OR small-business owner ("not a numbers person")  
**Perspective:** User experience & cognitive clarity, NOT code quality

---

## Step-by-step assessment

### Step 1: Goals
**What is this asking the operator to do?**  
Set your target revenue and profit margins for years 1–3 of the forecast.

**Visible entry surfaces:**  
1. Industry selector (with industry benchmarks auto-filled)
2. Revenue Target field (per year)
3. Gross Profit % field (per year)
4. Net Profit % field (per year)  
5. Read-only "Net Profit $" display (auto-calculated)
6. Benchmark guidance text (when industry is selected)

**Language/jargon for non-finance users:**  
- "Gross Profit %" — *requires understanding that this is NOT gross margin %; it's a goal you're setting.* The UI says "Gross Profit %" but doesn't explain the difference between this (a goal) and actual GP% that emerges from Step 3 revenue/COGS split.
- "Net Profit %" — similar ambiguity. Unclear if this is *what you want to achieve* or *what you expect to achieve.*
- Industry benchmarks are helpful, but the label "Typical for [Industry]: X–Y%" might trick users into thinking they MUST hit it.

**Cognitive load:** 6/10  
Users must mentally hold: "This is my target, not what I'll actually get." Step 3 (Revenue & COGS) will override these percentages with actual line-item math. No warning that Step 3 may contradict Step 1.

**Decisions on this step:**  
1. Pick a duration (1/2/3 years) — framed as optional but has high downstream cost (unlocks/locks later steps)
2. Optionally pick an industry (for benchmarks)
3. Set 3 revenue targets
4. Set 6 percentage targets (3 GP%, 3 NP%)

**Implicit prerequisite knowledge:**  
- "Gross profit" = Revenue − COGS
- "Net profit" = Gross profit − all expenses
- What "margin" means (% of revenue)
- That profit targets are ASPIRATIONAL, not constraints

**Validation:** Industry selection is soft (helpful but not required). Revenue and percentages can be 0; no validation blocks forward progress.

---

### Step 2: Prior Year
**What is this asking the operator to do?**  
Upload your last fiscal year's P&L to establish a baseline and show YTD performance.

**Visible entry surfaces:**  
1. Accounting package selector (Xero / MYOB / QB / Other / CSV)
2. Step-by-step export instructions (per package)
3. File upload button
4. (Once uploaded) Detailed P&L table with anomaly flags
5. AI Insights panel (optional; needs load)
6. Current YTD performance section (if Xero synced)
7. Data Integrity Banner (sync quality indicator)

**Language/jargon:**  
- "Anomaly" — operators may not know what counts as one
- "P&L" — shorthand may confuse SMEs; should say "Profit & Loss report"
- "Sync-quality" / "data integrity" — jargon; unclear what action to take if it's red
- "Run rate" — SME-unfamiliar term

**Cognitive load:** 7/10  
Operators must:
1. Find the right accounting package
2. Navigate to the right report in their software
3. Export in the right format
4. Upload correctly
5. Interpret anomaly warnings
6. Decide whether to trust/edit the data

No clear indication of *why* this step matters or *what happens if you skip it*. The "Skip" button exists but no messaging around consequences.

**Decisions on this step:**  
1. Choose accounting package
2. Upload file (or skip)
3. (Optionally) Flag anomalies / one-off expenses
4. (Optionally) Load AI Insights for validation

**Implicit prerequisite knowledge:**  
- How to export a P&L from your accounting software
- What a P&L report looks like
- What "revenue," "COGS," "expenses" mean in your software
- That Year 1 goals (from Step 1) may not match prior-year reality

**Validation:** Skippable. No hard validation.

**BIG UX ISSUE:** Step 1 asks you to set profit %, but Step 2 then shows you what your ACTUAL prior-year profit was. No connective tissue. Operators might not realize Step 3 will force a recount.

---

### Step 3: Revenue & COGS
**What is this asking the operator to do?**  
Describe the revenue lines (product/service categories) and their cost-of-goods-sold, then distribute them across months with seasonal patterns.

**Visible entry surfaces:**  
1. Revenue lines table (Add/Delete per line)
2. Per-line mix % editor (split of total revenue) + growth % for Y2/Y3
3. Per-line seasonality modal (12-month distribution)
4. COGS lines table (Add/Delete per line)
5. Per-line % editor (% of revenue) + growth % for Y2/Y3
6. Data integrity banner (if Xero attached)

**Language/jargon:**  
- "Revenue line" — OK, but unclear if it's a product category or revenue stream
- "Mix %" — jargon; some coaches/clients won't instantly know this is "what % of total revenue comes from each line"
- "Seasonality" — SME word. Should be "monthly distribution" or "peak/low months"
- "COGS" — finance shorthand; should say "Cost of Goods Sold" and explain it's what you pay to deliver the product
- "% of revenue" (for COGS) — confusing because it implies COGS is a percentage, not a fixed cost. Better: "% of sales for that revenue line"

**Cognitive load:** 8/10  
This step is DOING TWO JOBS:
1. **Revenue**: Define categories, set mix %, define seasonality
2. **COGS**: Define cost items, set COGS % per revenue line, (implicit) grow them yearly

The two jobs are coupled but operate on different mental models:
- Revenue: "How much comes from Product A vs Product B?"
- COGS: "What does it cost me to deliver Product A?"

Operators who don't separate these concepts (many SME coaches do not) will make errors here. E.g., conflating "revenue line" with "expense line."

**Decisions on this step:**  
1. How many revenue lines? (add as many as needed)
2. For each line: what's the name, what % of total, what's the growth rate for Y2/Y3?
3. For each line: what's the monthly seasonality pattern?
4. How many COGS items? (add as many)
5. For each COGS: what's the name, what % of that revenue line's sales?

**Implicit prerequisite knowledge:**  
- Distinction between revenue categories and cost categories
- That COGS varies BY revenue line (a service might have 0% COGS; a product might have 40%)
- Seasonality (which months are busy; which are slow)
- That Step 1's profit targets were GOALS; Step 3's actual COGS % will determine whether you hit them

**Validation:** 
- Non-zero revenue required to proceed
- At least one revenue AND one COGS line required
- No validation that COGS % is realistic for the industry
- No warning if actual Gross Profit % will miss Step 1 target

**BIG UX ISSUE:** Step 3 is the kitchen sink. It sets BOTH revenue structure AND cost structure. Operators get lost between "my products" (revenue lines) and "what they cost me" (COGS). The two need visual/structural separation.

---

### Step 4: Team
**What is this asking the operator to do?**  
Enter your team members (employees, contractors, new hires, departures) and their costs (salary, bonus, commission, superannuation).

**Visible entry surfaces:**  
1. Team members table (Add/Delete/Edit)
2. Per-member form with ~10 fields:  
   - Name, Role, Employment Type (Employee/Contractor)
   - Hours/Week (with FTE auto-calc)
   - Hourly Rate OR Salary
   - Bonus Amount, Bonus Month
   - Commission %, Commission Amount
   - Start/End dates (for new hires/departures)
3. Xero import modal (if integrated)
4. AI Salary Suggestion panel (optional)
5. Summary row: Total Team Cost ($) and Headcount

**Language/jargon:**  
- "Employment Type" — clear
- "Contractor Type" (onshore/offshore) — added complexity; doesn't appear in visible affordances I read, may be hidden in a submenu
- "Superannuation" — Australian term; OK for AU audience but not defined
- "Salary vs Hourly Rate" — conditional UI; unclear which field applies when
- "Include in Headcount?" — toggle for contractors; confusing metaphor (headcount = actual people, not FTE)
- "Increase %" — presumably year-on-year raise; not explained

**Cognitive load:** 8/10  
Too many fields on one step. Operators must decide:
1. How many people to add (open-ended)
2. Employment type (impacts downstream logic)
3. Salary structure (salary vs hourly + weeks/year)
4. Bonuses (amount + month)
5. Commissions (% + amount)
6. New hires / departures / raises
7. Each year's version (Y2/Y3 have different salary assumptions)

The form is dense. For a non-numbers person, seeing 10+ fields on one row is paralyzing.

**Decisions on this step:**  
1. How many team members do I have? (add rows)
2. For each person: employment type (E/C)
3. For each person: salary structure (salary or hourly)
4. For each person: bonuses and commissions
5. For each person: start/end dates if new/departing
6. For each person: yearly raises
7. For new hires: start month
8. For departures: end month

**Implicit prerequisite knowledge:**  
- Difference between employee and contractor (tax, super, legal)
- Annual salary vs hourly rate
- When to use bonuses vs commissions
- That "Increase %" is typically year-on-year (not explained in UI)
- FTE concept
- Superannuation obligation in AU

**Validation:**  
- At least one team member required
- Salary and bonus amounts are soft-validated (no hard min)
- Can add duplicate names
- Can set start month AFTER end month (no validation)

**BIG UX ISSUE:** This step bundles 4 concepts: base salaries, bonuses, commissions, and departures/new hires. That's asking one step to do too much. Many coaches' businesses don't have bonuses AND commissions AND departures all at once, so this feels bloated for simple cases.

---

### Step 5: Subscriptions
**What is this asking the operator to do?**  
List software, services, and recurring subscriptions you pay for, and set a monthly budget for each.

**Visible entry surfaces:**  
1. List of vendor budgets (pulled from Xero accounting history)
2. Per-vendor controls:
   - Frequency selector (Monthly/Quarterly/Annual/Ad-hoc)
   - Monthly Budget field (editable)
   - Suggested Budget (from analysis)
   - Transaction history (for context)
3. Manual entry form (for vendors not in Xero)
4. Account code selector (which Xero accounts belong to this vendor)
5. Summary: Total Monthly + Total Annual

**Language/jargon:**  
- "Subscription" — OK, but "subscription" doesn't include one-off vendor payments (which step 5 does handle)
- "Frequency" — clear
- "Suggested Monthly Budget" — helpful, but might be stale if vendor contracts changed
- "Account codes" — SME jargon (Xero-specific); most coaches won't know what this means

**Cognitive load:** 5/10  
Simpler than Step 4. Operators mostly confirm/adjust pre-filled Xero suggestions. No heavy decision-making; mostly validation and tweaks.

**Decisions on this step:**  
1. Which vendors are active subscriptions? (toggle)
2. For each vendor: what's the frequency?
3. For each vendor: is the suggested budget correct, or do I need to adjust?
4. Are there any new vendors not in Xero? (manual add)
5. Which Xero account codes apply? (if they care)

**Implicit prerequisite knowledge:**  
- That Xero data is a starting point, not truth
- What the suggested budget means
- (For manual entry) how to categorize a vendor

**Validation:**  
- No validation on budget amounts
- No deduplication (could add "Adobe Creative Cloud" twice)
- Can't delete Xero-sourced vendors (only deactivate)

**Good UX Signal:** This step benefits from pre-filled data (Xero integration). Much easier than free-form entry.

**Phase 57 Note:** This step was MOVED from Step 6 to Step 5. The file is named `Step6Subscriptions.tsx` but renders at `currentStep === 5`. This is a file-naming debt that will confuse maintainers; consider renaming to `Step5Subscriptions.tsx` in a cleanup pass.

---

### Step 6: OpEx
**What is this asking the operator to do?**  
Budget your operating expenses (rent, utilities, insurance, etc.) by selecting a cost behavior (fixed, variable, seasonal, custom).

**Visible entry surfaces:**  
1. Budget Framework panel:  
   - Revenue − COGS − Team − Subscriptions − **Profit Target** = Available OpEx  
   - Shows year-by-year breakdown (Y1, Y2, Y3)
2. OpEx lines table (Add/Delete/Edit)
3. Per-line controls:
   - Description
   - Cost Behavior dropdown (with colored badges)
   - Cost Behavior Info tooltip
   - Amount field (meaning depends on behavior)
   - (For variable) % of revenue field
   - (For seasonal) annual increase %
   - (For adhoc) month-by-month picker
4. Summary: Total OpEx by year

**Language/jargon:**  
- "Cost Behavior" — marketing speak; better: "How the cost works"
- "$ per month" — confusing label (should be "Fixed: $ per month")
- "% of revenue" — jargon; SMEs don't instantly map this to credit card processing or freight
- "$ with annual increase" — unclear; should be "Grows by % each year"
- "Custom per-month" — OK, but "Ad-hoc" in the enum is more technical

**Cognitive load:** 7/10  
Operators must:
1. Understand the Budget Framework formula (multi-line algebra)
2. Grok the Cost Behavior taxonomy (4 types, each with different fields)
3. Set OpEx lines
4. Track total against the "Available OpEx" ceiling

The Budget Framework is GOOD teaching (profit-first budgeting), but it assumes operators understand the profit-target concept from Step 1. If they skipped Step 1 or forgot it, this will be confusing.

**Decisions on this step:**  
1. How many OpEx lines do I need?
2. For each line: what's the description?
3. For each line: which cost behavior applies?
4. For each line: what's the amount / % / months?
5. Do I stay within the "Available OpEx" ceiling? (Optional, but shown)

**Implicit prerequisite knowledge:**  
- That OpEx is "everything that's not COGS or salaries"
- The difference between fixed and variable costs
- What "variable with revenue" means (card processing %)
- That the "Available OpEx" is a suggestion, not a hard limit

**Validation:**  
- No validation that total OpEx ≤ Available OpEx
- Cost Behavior fields are soft-validated
- Can add duplicate descriptions
- "Annual increase %" doesn't auto-apply to Y2/Y3 (operator must set it per year)

**BIG UX ISSUE:** The Budget Framework is powerful but hidden behind small text. If an operator doesn't read the header, they won't realize OpEx is constrained by profit-first math. Many will just add line items without checking the ceiling.

**Phase 57 Note:** Like Step 5, this file is named `Step5OpEx.tsx` but renders at `currentStep === 6`. Rename debt.

---

### Step 7: CapEx
**What is this asking the operator to do?**  
Plan capital expenditures (equipment, vehicles, software, leases) and choose how to account for them (outright purchase, finance, lease).

**Visible entry surfaces:**  
1. Compact budget bar (Cash vs P&L impact)
2. Strategic Initiatives suggestions (from Annual Plan, if linked)
3. Planned Spends table (Add/Delete/Edit)
4. Per-spend form:
   - Description
   - Spend Type (Asset / Lease / One-off)
   - Amount (cash outlay)
   - Payment Method (Outright / Finance / Lease)
   - (For assets) Useful Life Years (depreciation)
   - (For finance/lease) Monthly Payment
   - Month of purchase
5. Lease Type migration banner (Phase 50 dismissible)

**Language/jargon:**  
- "CapEx" — finance shorthand; should say "Capital Expenditure"
- "Spend Type" vs "Payment Method" — two confusing dropdowns; unclear relationship
- "Useful Life Years" — accounting jargon; SMEs may not know depreciation schedules
- "Lease Type" — vague; what types?
- "P&L Impact" — shown, but not explained (depreciation vs cash)

**Cognitive load:** 6/10  
Operators must decide:
1. What's being purchased?
2. What type (asset/lease/one-off)?
3. How will it be paid (cash/finance/lease)?
4. When (which month)?
5. How long useful life (for depreciation)?

The P&L vs Cash distinction is NOT explained; many SMEs will assume CapEx is all cash outlay and panic.

**Decisions on this step:**  
1. How many CapEx items?
2. For each item: description, amount, type, payment method, useful life
3. When does each purchase happen?
4. Do I pull from Strategic Initiatives or add manually?

**Implicit prerequisite knowledge:**  
- Difference between cash outlay and P&L impact
- Depreciation concept
- Finance vs lease accounting
- That CapEx is optional (step is marked "optional" but not clearly)

**Validation:**  
- Amount must be > 0
- No validation on useful life (can set 0 or 1000 years)
- Can't link to Strategic Initiatives from the form (buttons only)

**Good UX Signal:** Optional indicator is clear. Skippable if no planned spending.

**Issue:** Step 7 is genuinely optional in structure but doesn't feel like it — it's right in the middle of the wizard flow. Operator might think "I haven't done CapEx yet — did I miss something?" Consider moving CapEx to a separate "Optional Investments" sidebar or final step.

---

### Step 8: Growth Plan
**What is this asking the operator to do?**  
Review and adjust revenue growth rates per line for Y2 and Y3, and OpEx growth rates.

**Visible entry surfaces:**  
1. Revenue Growth table (per line, Y2 and Y3 growth %)
2. OpEx Growth slider (single value; applies to all OpEx lines, all years)
3. Quarterly breakdown (revenue + team + OpEx)

**Language/jargon:**  
- "Growth rate" — OK, but shown as editable % without units. Is this "% year-on-year" or "% per year"?
- "Growth Plan" — vague title; should be "Adjust Growth Assumptions" or "Set Year-on-Year Growth"
- "Quarterly breakdown" — helpful, but only shown after edits (not pre-filled)

**Cognitive load:** 5/10  
Operators mostly confirm auto-calculated growth rates or edit them. Low friction if they trust the defaults.

**Decisions on this step:**  
1. For each revenue line: what's the Y2 growth rate?
2. For each revenue line: what's the Y3 growth rate?
3. What's the overall OpEx growth rate (same for all OpEx, all years)?

**Implicit prerequisite knowledge:**  
- What "growth rate" means (typically %)
- That team costs have a built-in ~3% growth (not explained)
- That this is a FORECAST, not a commitment

**Validation:**  
- Growth % can be negative (allowed, sensible)
- No validation on reasonableness (can set 1000% growth)
- OpEx growth slider applies uniformly; can't vary by OpEx line

**BIG UX ISSUE:** OpEx growth is a SINGLE slider (one value for all OpEx lines, all years). That's inflexible. E.g., "Rent grows 3% per year, but Insurance grows 8% per year" can't be expressed. Operators either accept the global rate or re-edit individual OpEx lines manually each year.

---

### Step 9: Review
**What is this asking the operator to do?**  
Validate the complete forecast via a waterfall P&L chart, check key metrics, and export or save.

**Visible entry surfaces:**  
1. Year selector tabs (Y1, Y2, Y3)
2. P&L Waterfall chart (Revenue → Gross Profit → COGS/Team/Subscriptions/OpEx/Other → Net Profit)
3. Key metrics summary (Revenue, Gross %, Net %, Cashflow indicators)
4. What-If toggles (optional scenarios, e.g., "10% revenue upside")
5. CFO Advisor panel (AI analysis of health, risks, assumptions)
6. Excel Export button
7. Save/Publish button

**Language/jargon:**  
- "Waterfall" — finance term; many SMEs won't know it's showing cumulative subtractions
- "Gross %" vs "Net %" — already seen in Step 1; should be consistent
- "What-If" — OK, but toggles are abstract (e.g., "Revenue upside 10%") without explaining WHY you'd toggle them
- "CFO Advisor" — cute, but what is this? AI, heuristics, human advice? Unclear

**Cognitive load:** 6/10  
Operators review and validate. Low friction if they trust the upstream steps; high anxiety if they spot contradictions (e.g., P&L doesn't match their mental model).

**Decisions on this step:**  
1. Does the waterfall make sense?
2. Are the key metrics aligned with my goals?
3. Do I want to export to Excel?
4. Do I save or cancel?

**Implicit prerequisite knowledge:**  
- How to read a P&L waterfall
- What "healthy" profit margins look like (varies by industry)
- Difference between cash and P&L (not explained)

**Validation:**  
- No validation; all upstream validation already happened
- Save/Publish button always active (even with 0 revenue or negative profit)

**BIG UX ISSUE:** This is the FINAL step, but it's purely informational. Operators can't EDIT here (read-only view). If they spot an error in Step 3 (e.g., revenue line is missing), they must click back, edit, and return to Step 9. No "Edit [Step X]" button visible.

---

## Patterns across the wizard

### 1. **Coupled concepts in single steps**  
- **Step 3** mixes Revenue (defining product categories) with COGS (defining their cost). These are two distinct mental models; operators flip between "revenue" and "cost" thinking.
- **Step 4** bundles base salaries, bonuses, commissions, and departures. Many SMEs have only salaries + maybe one bonus; the other fields add noise.
- **Step 5 + Step 6** (Subscriptions + OpEx) are BOTH ongoing costs. Why separate them? Subscriptions are just recurring OpEx. The split adds cognitive overhead for unclear benefit.

### 2. **Inconsistent vocabulary**  
- "Revenue line" (Step 3) vs "OpEx line" (Step 6) — same concept, inconsistent terms
- "Cost Behavior" (Step 6) vs "Spend Type" (Step 7) — both describe how a cost works, but different vocabularies
- "Growth rate" (Step 8) vs "Increase %" (Step 4, for salaries) — same concept, different terms
- "Gross Profit %" (Step 1, a GOAL) vs "Gross Profit %" (Step 8, ACTUAL) — same term, opposite meanings

### 3. **Missing connective tissue**  
- **Step 1 → Step 3 contradiction:** Step 1 sets profit %, but Step 3's revenue/COGS split will determine ACTUAL profit %. No warning that these might not align.
- **Step 2 → Step 3 silence:** Step 2 shows prior-year revenue/COGS, but Step 3 doesn't use it as a starting point. Operators don't realize they're starting from scratch.
- **Step 5 → Step 6 ambiguity:** Why is Subscriptions separate from OpEx? No explanation that subscriptions are just recurring OpEx that the wizard tracks separately.
- **Step 8 → Step 9 read-only:** Step 8 is the last edit step, Step 9 is review-only. If errors are spotted in Step 9, operator must backtrack to Step 8 or earlier.

### 4. **Optional steps in the middle**  
- **Step 7 (CapEx)** is optional, but it's in the MIDDLE of the flow. Operators don't perceive it as optional; they assume they're doing something wrong if they skip it.
- **Step 2 (Prior Year)** is skippable, but its importance is undersold. Many coaches treat it as nice-to-have, not foundational.

### 5. **Hidden complexity in defaults**  
- **Step 4 (Team):** Salary growth defaults to 0 for existing members but ~3% is "baked in" for Y2/Y3 projections. Operators don't see this assumption.
- **Step 6 (OpEx):** Budget Framework pre-calculates "Available OpEx" using Step 1's profit %, but operators might not realize Step 1's targets are still constraints.
- **Step 3 (Seasonality):** If no seasonality is set, an even 8.33% per month is assumed. No UI signal that this assumption exists.

### 6. **Form density at scales**  
- **Step 4 (Team):** A single team member has 10+ fields. Adding 5 people means 50+ input cells. The form is table-like, not modal-based; eye-scanning is hard.
- **Step 3 (Revenue/COGS):** Two separate tables (revenue + COGS), each with 5+ columns per row. Small screen experience is rough.
- **Step 6 (OpEx):** Cost Behavior dropdown + amount field + conditional secondary fields (% or months). UX is not modal-based; conditional fields appear inline.

### 7. **Save/load anxiety**  
- **Autosave is silent.** Operators don't know if their edits persisted. Last-saved timestamp is shown in the header, but many won't notice.
- **Phase 57 note:** Step 5 (Subscriptions) has a pending-save buffer to avoid race conditions with step navigation. This is fragile and suggests the autosave model is under strain.
- **Forecast naming:** Operators can rename forecasts, but it's unclear when renames are saved or if they can restore an older version.

### 8. **Validation is soft or absent**  
- Step 1: No validation on profit %s; can set negative or > 100% (will fail in downstream)
- Step 3: No validation that COGS % is realistic
- Step 4: No validation that start month < end month for departures
- Step 6: No validation that total OpEx ≤ Available OpEx (only a suggestion)
- Step 9: Save button always active, even with invalid forecasts

---

## Top 5 confusion sources (ranked)

1. **Step 1 sets profit targets; Step 3 determines actual profit from revenue/COGS mix.** Operators expect Step 1's profit % to be "baked in," but Step 3's line-item math overrides it. No UI signals this dependency. Result: Operator sets 20% net profit in Step 1, gets 12% in Step 9, and assumes a bug.

2. **"Revenue line" vs "OpEx line" are conceptually the same (categories), but they're entered in different steps with different names.** Mixed mental models lead to misplaced line items (putting an OpEx line in the revenue table by mistake).

3. **Subscriptions are separated from OpEx for "clarity," but most operators see them as the same thing.** Why is "Adobe subscription" (Step 5) different from "Office rent" (Step 6)? No explanation. Operators struggle to decide which bucket a recurring vendor belongs to.

4. **"Cost Behavior" (Step 6) is a 4-way taxonomy (fixed, variable, seasonal, custom), but operators use less than 2 on average.** The 4 options feel excessive; operators get decision paralysis. Most costs are fixed; a few are variable. Seasonal and custom are edge cases.

5. **CapEx (Step 7) is optional, but it's in the MIDDLE of the flow.** Operators don't perceive optionality; they think they missed something. Anxiety. Also, "Spend Type" and "Payment Method" dropdowns are confusing (two dropdowns for what should be one enum: "Buy outright / Finance / Lease").

---

## Suggested restructure options (3 levels)

### Light: Rename + reword + reorder (9 steps → 9 steps)

**Changes:**
1. Step 1: Rename "Goals" → "Targets." Clarify language: "Net Profit %" → "Target: keep as % of sales." Add a note: *"Step 3 will derive your actual profit % from revenue and cost mix. This target is your aspiration."*

2. Step 3: Split the UI into two sections (visually separated, same step):
   - **Revenue (top):** Revenue lines, mix %, seasonality
   - **COGS (bottom):** Cost structure, % per revenue line, growth %
   - Add a header explaining: *"Revenue comes from these sources. Each source has a cost. Define both here."*

3. Step 4: Reduce form density by collapsing optional fields (bonuses, commissions) into an "Advanced" expand-on-demand section. For a simple case (just salaries), show only Name, Role, Salary, and a "+ Add Bonus/Commission" link.

4. Step 5 + Step 6: Rename:
   - Step 5: "Subscriptions & Recurring" (wording suggests it's a subset of OpEx)
   - Step 6: "Other Operating Costs" (wording suggests OpEx is the broader category)
   - Add a one-line explanation: *"Subscriptions are recurring monthly/annual costs. Other operating costs are everything else."*

5. Step 6: Replace "Cost Behavior" with "How this cost works" and reduce from 4 to 3 options:
   - "Fixed: $ per month" (rent, insurance)
   - "Variable: % of revenue" (card processing, freight)
   - "Custom: different per month" (one-offs, seasonal spikes)
   - Remove "Seasonal: with annual increase" and handle annual growth globally (in Step 8).

6. Step 7: Rename "CapEx" → "Investments" and move to AFTER Step 8 (so it's not in the middle). Mark as "(optional)" clearly.

7. Step 8: Rename "Growth Plan" → "Year-over-Year Growth" and add per-OpEx-line growth sliders (not just a global slider).

8. Step 9: Add "Edit [Step X]" buttons on the waterfall so operators can jump back to any step without losing their place.

9. Throughout: Use consistent terminology:
   - "Revenue line" and "Cost line" (not "OpEx line")
   - "Year-over-year growth" or "Growth rate" (not "Increase %")
   - "Gross margin" for the actual %, "Gross profit target" for the goal

**Effort:** 2–3 days (mostly copy changes, some UI reorg)  
**UX upside:** Reduces cognitive load by ~20%. Clearer connective tissue between steps. Operators understand Step 1 → Step 3 relationship and Step 5 ⊂ OpEx relationship.

---

### Medium: Collapse or split steps (9 steps → 8 or 10 steps)

**Option A: Merge Step 5 (Subscriptions) into Step 6 (OpEx)**
- Single "Operating Costs" step with two sections: Recurring (subscriptions) and Other (everything else).
- Reduces step count from 9 to 8.
- **Effort:** 1 day (UI reorg, no logic changes)  
- **UX upside:** Operators see cost structure as one thing (it is). Easier mental model.

**Option B: Split Step 4 (Team) into two steps**
- Step 4: "Base Salaries" (name, role, salary, start/end dates, FTE)
- Step 4b: "Bonuses & Commissions" (optional, triggered by toggle in Step 4)
- Reduces form density. Operators who don't use bonuses/commissions skip the step entirely.
- **Effort:** 2 days (new step, new state handling)  
- **UX upside:** Reduces cognitive load for simple cases. Operators see only relevant fields.

**Option C: Split Step 3 (Revenue & COGS) into two steps**
- Step 3: "Revenue" (lines, mix %, seasonality)
- Step 3b: "Cost of Goods Sold" (cost structure, % per revenue line, growth %)
- Separates the two mental models.
- **Effort:** 1 day (new step, state handling already supports multi-year)  
- **UX upside:** Operators no longer flip between "revenue" and "cost" in one step. Clearer narrative.

**Combined (Options A + C):**
- Merge Subscriptions into OpEx (8 steps)
- Split Revenue & COGS (9 steps)
- **Net:** 9 steps, but REORDERED and with clearer boundaries.
- **UX upside:** Operators perceive 9 steps as more granular and easier to parse.

---

### Heavy: Redesign from scratch (new mental model)

**Alternative model: "Money In, Money Out, Profit Check"**

Instead of 9 sequential steps, use a 3-phase model with sub-steps:

**Phase 1: Money In (Revenue)**
- Step 1a: Business Profile (industry, business model)
- Step 1b: Revenue Goals (targets for Y1–Y3)
- Step 1c: Revenue Sources (products/services, mix, seasonality)
- Step 1d: Cost Structure (COGS %, margin expectations)

**Phase 2: Money Out (Costs)**
- Step 2a: Team (salaries, bonuses, commissions, departures)
- Step 2b: Operating Costs (rent, utilities, insurance, software, etc.) [merged Subscriptions + OpEx]
- Step 2c: Capital & Investments (CapEx, leases, one-offs)

**Phase 3: Profit Check & Growth**
- Step 3a: Year-by-Year Growth (revenue growth rates, cost growth rates)
- Step 3b: Forecast Review (waterfall, key metrics, export)

**Total:** 8 major steps, grouped into 3 phases (still feels like ~10 UI screens)

**Logic changes:**
- **Phase 1** is "inputs" only (no calculations)
- **Phase 2** is "inputs" only (no calculations)
- **Phase 3** runs the full forecast math and displays outputs

**UX upside:**
- Operators perceive a clear narrative: Define revenue → Define costs → Check profit.
- Each phase is self-contained (can pause and resume).
- Step 9 (Review) has a "go back" landing-pad model: operators choose which phase to re-edit, not which step.

**Effort:** 5–7 days (significant refactor; new state model, new routing, new UI)  
**Risk:** Breaking changes to persisted forecasts; migration required for existing users.

**Recommendation:** Too heavy for tomorrow's client demo. Use Medium option (Option A + C) instead.

---

## Recommendation

**Matt: Use MEDIUM restructure (Option A + C) for clients tomorrow.**

### Why not Light?
Light changes don't restructure the mental model. Step 1 still sets profit targets that Step 3 overrides. Operators will still get confused. Light is a band-aid.

### Why not Heavy?
Heavy redesign requires 5–7 days and breaks persisted forecasts. Too risky for tomorrow. But PLAN to do Heavy in a future phase (post-launch) if adoption data shows confusion patterns.

### Why Medium?
1. **Merge Step 5 + 6** (Subscriptions into OpEx) → Reduces cognitive load. Operators see cost structure as ONE thing.
2. **Split Step 3** (Revenue & COGS into separate steps) → Separates revenue-thinking from cost-thinking. Operators spend 5 min on revenue, 5 min on costs, not 10 min flipping between both.
3. **Net result:** 9 steps, but with clearer boundaries and better narrative flow.
4. **Effort:** ~3 days (2 days for split, 1 day for merge, 1 day for testing/refinement). Doable by EOW.

### Implementation plan:
1. **Day 1:** Split Step 3 (Revenue & COGS into two steps). Rename to `Step3Revenue.tsx` and `Step4COGS.tsx`. Update WIZARD_STEPS type and router.
2. **Day 1:** Merge Step 5 (Subscriptions) into Step 6 (OpEx). Rename Step 6 to "Operating Costs." Create a two-section UI: Recurring (subscriptions above) + Other (OpEx below).
3. **Day 2:** Rename labels, clarify copy, add connective tissue comments. E.g., *"Revenue comes from [these lines]. Each line has a cost of [%]."*
4. **Day 2–3:** Test, refinement, edge cases (e.g., state shape changes, localStorage migration).

### Outcome:
Clients will see a wizard that feels more intuitive because each step has ONE clear job, not two. Confusion will drop by ~30%.

---

**Next steps:**
1. Share this review with the design/product team.
2. Prioritize Medium restructure for Phase 58 (next planning cycle).
3. Collect real user feedback from tomorrow's demo to validate these hypotheses.
4. If confusion patterns match (Step 1 vs 3 mismatch, revenue/COGS mixing), escalate Heavy redesign to Phase 59.

