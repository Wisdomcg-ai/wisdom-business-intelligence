# Financial Forecast Wizard Redesign

## Summary

Redesign the Financial Forecast Wizard to feel like a conversation with a Virtual CFO, rather than a form-filling exercise. The wizard should emulate the fractional CFO service offered to clients, making financial planning accessible to SME owners who say "I'm not a numbers person."

---

## Key Principles

1. **Conversational, not transactional** - Guide users through questions, not forms
2. **CFO does the analysis** - Present insights, not raw data
3. **Plain English** - Avoid accounting jargon where possible
4. **Australian + Industry aware** - Benchmarks and compliance baked in
5. **Connected to One Page Plan** - Pull goals and initiatives, don't duplicate entry
6. **Initiative costs included** - Strategic investments flow into the forecast

---

## Current Problems

| Issue | Impact |
|-------|--------|
| Too much accounting jargon | Intimidates "non-numbers" people |
| 6 steps with too much detail | Overwhelming, feels like homework |
| Requires data they may not have | Leads, conversion rates, precise salaries |
| Prior year shown as raw data | User has to interpret it themselves |
| Initiatives not costed | Plan and forecast are disconnected |
| No industry context | Users don't know if their numbers are good |

---

## Proposed Structure: 6 CFO Conversations

### Conversation 1: "Let's Start with Your Plan"
*Importing from your One Page Plan*

- Auto-import from Goals & Targets Wizard:
  - Year 1 revenue, gross profit, net profit targets
  - Quarterly targets (if set)
  - Strategic initiatives by quarter
- CFO validates: "You're targeting $X with Y% margin - that's healthy for your industry"

**Data source:** Goals wizard Step 1 & Step 4

---

### Conversation 2: "What Does History Tell Us?"
*Analysing your prior year*

- Connect Xero / Import CSV / Enter manually
- **CFO presents 5-6 key insights** (not raw data):
  - Revenue patterns and seasonality
  - Expense breakdown (fixed vs variable)
  - Margin trends over time
  - Red flags or opportunities
  - Comparison to industry benchmarks
- User confirms or adjusts assumptions

**Key change:** We do the analysis FOR them

---

### Conversation 3: "Your Team Investment"
*Planning your people costs*

- Pre-populate from Xero/prior year if available
- Current team: Name, Role, Annual Salary (inc. super)
- Planned hires: Name, Role, Salary, **Start Month** (for cashflow timing)
- Simple classification: Direct (COGS) vs Overhead (OpEx)
- Running totals with cashflow impact

**CFO insight:** "With the new hire in March, your monthly wage bill jumps from $38K to $46K"

---

### Conversation 4: "Your Operating Costs"
*Budgeting your overheads*

- Pre-populate from prior year analysis
- Simple grouping:
  - Fixed (same every month): Rent, Insurance, Subscriptions
  - Variable (scales with revenue): Marketing, Travel
  - Discretionary (you control): Training, Conferences
- Input: Last year → This year (with smart defaults like "+5% inflation")

**CFO insight:** "Your fixed costs are $8,500/month - that's your baseline before you sell anything"

---

### Conversation 5: "Your Strategic Investments" ← NEW
*Costing your initiatives*

- Pull initiatives from One Page Plan (Step 3/4)
- For each initiative, capture:
  - Estimated investment/cost
  - Which quarter the cost falls in
  - Type: Project, Marketing, Software, Training, etc.
- Show running total: "Strategic Investment Budget: $53,000"

**CFO insight:** "You've got $53K in initiative costs - that's 7.4% of your gross profit budget. Most spend is in Q2, watch your cash."

---

### Conversation 6: "Does It All Work?"
*The reality check*

- Visual P&L summary showing everything:
  - Revenue
  - Cost of Sales (inc. direct wages)
  - Gross Profit
  - Operating Expenses (team, rent, marketing, **initiatives**, other)
  - Net Profit
- Validation checks with ✅ / ⚠️ indicators
- Industry benchmark comparisons
- Revenue distribution options (match prior year, even, seasonal, custom)

**[Generate My Forecast]**

---

## What Gets Removed

| Current Step | Action |
|--------------|--------|
| Step 5: Revenue Drivers (5 Ways) | **REMOVE** - Save for coaching sessions, not forecasting |
| Complex forecasting methods (4 options per category) | **SIMPLIFY** - Just "same as last year" or "adjust by X%" |
| COGS/OpEx jargon | **TRANSLATE** - "Direct costs" vs "Overhead" |

---

## What Gets Added

| Feature | Purpose |
|---------|---------|
| Initiative costing (Conversation 5) | Connect plan to forecast |
| CFO insights throughout | Guide interpretation |
| Industry benchmarks | Context for "is this good?" |
| Australian compliance | Super rates, payroll tax, BAS |
| Cashflow timing | When new hires start, when initiatives spend |

---

## Australian & Industry Intelligence

### Australian Compliance
- Superannuation: 11.5% (rising to 12%)
- Payroll tax thresholds by state
- BAS/GST considerations
- EOFY timing (July-June default)

### Industry Benchmarks

| Industry | Healthy GP% | Target Net% | Team as % of Rev |
|----------|-------------|-------------|------------------|
| Professional Services | 55-65% | 15-25% | 30-40% |
| Trades/Construction | 35-45% | 10-15% | 40-50% |
| Retail | 40-50% | 5-10% | 15-25% |
| Hospitality | 65-70% | 5-10% | 30-40% |
| E-commerce | 40-50% | 10-15% | 10-20% |

---

## Data Flow

```
Goals & Targets Wizard
├── Step 1: Financial Goals (3yr) ──────────┐
├── Step 4: Quarterly Targets ──────────────┼──→ Conversation 1 (Import)
└── Step 3/4: Strategic Initiatives ────────┼──→ Conversation 5 (Costs)
                                            │
Xero / CSV Import ──────────────────────────┼──→ Conversation 2 (Prior Year)
                                            │
User Input ─────────────────────────────────┼──→ Conversation 3 (Team)
                                            ├──→ Conversation 4 (Overheads)
                                            │
                                            ▼
                                    Conversation 6 (Reality Check)
                                            │
                                            ▼
                                    Generated Forecast
                                            │
                                            ▼
                                    Budget vs Actual (where learning happens)
```

---

## Open Questions (To Resolve)

1. **Initiative costs as separate line?** Should "Strategic Initiatives" be a distinct line in OpEx, or rolled into categories (marketing → Marketing)?

2. **Revenue from initiatives?** Some initiatives generate revenue (new product, new market). Should we capture expected revenue impact?

3. **Timing granularity:** For initiative costs, is quarter enough, or do clients need month-level?

4. **Budget vs Actual tracking:** Should initiative spend be tracked separately in actuals? ("Budgeted $15K for website, spent $22K")

---

## Key Insight from Discussion

> "The real 'aha' comes from budget vs actual, not the forecast itself. The forecast is just setting up the scorecard. The learning happens when they start comparing reality to the plan."

This means the forecast wizard's job is to **set up the scorecard correctly** so that monthly/quarterly actuals review becomes meaningful. Every number needs a "why" so when variance happens, users understand what to investigate.

---

## Next Steps

1. Review this document and confirm direction
2. Design UI mockups for each conversation
3. Define data model changes (initiative costs)
4. Build in phases:
   - Phase 1: Simplify existing wizard (remove 5 Ways, add CFO voice)
   - Phase 2: Add initiative costing integration
   - Phase 3: Add industry benchmarks and insights
