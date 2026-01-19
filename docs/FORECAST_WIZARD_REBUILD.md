# Forecast Wizard Rebuild - CFO Methodology

## The Framework: Revenue - Profit = Expenses

This is the anchor. Every decision is validated against: "Does this fit within our expense budget?"

```
Revenue Target:     $1,500,000
- Profit Target:    $  200,000
= Expense Budget:   $1,300,000  ← This is the constraint
```

## The 5 Steps

### Step 1: Goals (10 seconds)
**Purpose:** Confirm the targets that anchor everything

**Data Source:** Existing goals from database

**UI:**
- Show: Revenue, Gross Profit %, Net Profit targets
- Ask: "These are your FY2026 targets. Confirm or adjust?"
- Suggestions: ["Confirm targets", "Adjust targets"]

**On Complete:** Lock in targets, calculate expense budget

---

### Step 2: Prior Year Analysis (60 seconds)
**Purpose:** Understand the baseline - this informs all cost projections

**Data Source:** Xero P&L Summary API

**UI Shows:**
- Monthly revenue trend (sparkline)
- Revenue by stream (if available)
- COGS as % of revenue
- OpEx breakdown:
  - Recurring monthly (rent, subscriptions, etc)
  - One-offs (insurance paid annually, etc)
  - Average monthly spend

**Ask:** "Prior year OpEx averaged $X/month. Any major changes planned?"

**Suggestions:** ["Use prior year as baseline", "Increase by 5% for inflation", "I have specific changes"]

**On Complete:** Set baseline costs

---

### Step 3: Team Planning (2-3 minutes)
**Purpose:** Map current + future team costs

**Data Source:** Xero Payroll API

**UI Shows:**
- Current team list with salaries
- Current annual team cost
- Default salary increase assumption (6%)

**Ask Flow:**
1. "Your team costs $X/year. Apply 6% increase for FY2026?"
2. "Any new hires planned to support growth?"
   - If yes: Role, Salary, Start Month

**Suggestions:** ["Apply 6% increase", "Different increase %", "Add planned hire"]

**On Complete:** Team costs locked in

---

### Step 4: Strategic Investments (1 minute)
**Purpose:** Capture CAPEX and initiative costs

**Data Source:** Strategic Initiatives from database

**UI Shows:**
- List of active strategic initiatives
- Any with budgets attached

**Ask:** "Any major investments or CAPEX planned? (Equipment, software, training, marketing campaigns)"

**Suggestions:** ["No major investments", "Add investment"]

**On Complete:** Investment costs added

---

### Step 5: Review & Validate (30 seconds)
**Purpose:** Final check - does the math work?

**UI Shows:**
```
REVENUE TARGET          $1,500,000

Less: COGS (30%)        ($450,000)
= GROSS PROFIT          $1,050,000

Less: Team Costs        ($600,000)
Less: Operating Costs   ($200,000)
Less: Investments       ($50,000)
= NET PROFIT            $200,000  ✓ Matches target

EXPENSE BUDGET:         $1,300,000
TOTAL EXPENSES:         $850,000
REMAINING BUFFER:       $450,000  ← Healthy margin
```

**Ask:** "Your forecast hits your profit target with $450k buffer. Ready to save?"

**Suggestions:** ["Save forecast", "Adjust something"]

---

## Right Panel: Live P&L Builder

Always visible. Updates in real-time.

### Header
```
FY2026 Forecast          [Monthly ▼]
Revenue - Profit = Expense Budget
$1.5M  -  $200K  = $1.3M
```

### Progress Bar
```
Expense Budget Used: ████████░░ 65% ($845K of $1.3M)
```

### Sections (collapsible)
1. **Revenue** - Target and any adjustments
2. **COGS** - Team costs classified as delivery
3. **Operating Expenses** - Baseline + adjustments
4. **Team (OpEx)** - Admin/support salaries
5. **Investments** - One-off costs

### Bottom Summary
```
┌─────────────────────────────────┐
│ Net Profit Forecast: $200,000  │
│ vs Target: ✓ On Track          │
│ Budget Remaining: $455,000     │
└─────────────────────────────────┘
```

---

## Chat Design Principles

1. **Show, don't ask** - Display data first, ask for confirmation
2. **One question at a time** - Never multiple questions
3. **Suggestions always visible** - 2-3 options to click
4. **Progress visible** - Step indicator at top
5. **Escape hatch** - Can always skip or go back

---

## Technical Implementation

### State Structure
```typescript
interface ForecastBuilderState {
  // Step tracking
  currentStep: 'goals' | 'baseline' | 'team' | 'investments' | 'review';
  completedSteps: string[];

  // Core targets (from Step 1)
  targets: {
    revenue: number;
    grossProfitPercent: number;
    netProfit: number;
  };

  // Derived constraint
  expenseBudget: number; // revenue - netProfit

  // Baseline (from Step 2)
  baseline: {
    priorYearRevenue: number;
    priorYearCOGS: number;
    priorYearOpEx: number;
    monthlyAvgOpEx: number;
    oneOffExpenses: { name: string; amount: number }[];
  };

  // Team (from Step 3)
  team: {
    existingMembers: TeamMember[];
    salaryIncreasePercent: number;
    plannedHires: PlannedHire[];
    totalTeamCost: number;
  };

  // Investments (from Step 4)
  investments: Investment[];

  // Calculations (derived)
  calculations: {
    totalCOGS: number;
    totalOpEx: number;
    totalTeamCosts: number;
    totalInvestments: number;
    totalExpenses: number;
    projectedProfit: number;
    budgetRemaining: number;
    isOnTrack: boolean;
  };
}
```

### File Structure
```
src/app/finances/forecast/components/
  wizard-v4/
    ForecastBuilder.tsx       # Main component
    BuilderChat.tsx           # Left panel - guided flow
    LivePLPanel.tsx           # Right panel - real-time P&L
    steps/
      GoalsStep.tsx           # Step 1
      BaselineStep.tsx        # Step 2
      TeamStep.tsx            # Step 3
      InvestmentsStep.tsx     # Step 4
      ReviewStep.tsx          # Step 5
    hooks/
      useForecastBuilder.ts   # State management
```

---

## API Endpoints Needed

1. `GET /api/goals` - Already exists
2. `GET /api/Xero/pl-summary` - Already exists
3. `GET /api/Xero/employees` - Already exists
4. `GET /api/strategic-initiatives` - Already exists
5. `POST /api/forecast/save` - Need to create/update

All data sources are available. No new APIs needed for MVP.
