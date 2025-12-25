# Forecast Wizard V3 - Live Build Feature

## Overview

Transform the forecast wizard from a conversation-only experience to a **visual P&L builder** where users watch their forecast come to life in real-time as they make decisions.

**Core Principle**: "Numbers are easier to understand when you see them."

---

## Current State

```
┌────────────────────────────────┬──────────────────────┐
│                                │                      │
│     Chat Panel (60%)           │   Data Panel (40%)   │
│     - AI conversation          │   - Static context   │
│     - All decisions via chat   │   - No live updates  │
│                                │                      │
└────────────────────────────────┴──────────────────────┘
```

**Problems:**
- Users can't see impact of decisions until the end
- Chat becomes verbose explaining numbers
- No visual feedback loop
- Hard to understand running totals

---

## Target State

```
┌──────────────────────┬─────────────────────────────────┐
│                      │                                 │
│  Chat Panel (35%)    │   Live Forecast Panel (65%)     │
│  - Lighter convo     │   - P&L building in real-time   │
│  - Guides & confirms │   - Editable numbers            │
│                      │   - Running totals              │
│                      │   - Annual + Monthly views      │
│                      │                                 │
└──────────────────────┴─────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Layout & Live Summary ✅ (Priority: HIGH)

**Goal**: Get the visual foundation right

**Tasks**:
1. Reduce chat panel width to 35%
2. Expand right panel to 65%
3. Create `LiveForecastPanel` component
4. Add running P&L summary that updates on every decision
5. Store forecast state in context for real-time updates

**Components**:
- `LiveForecastPanel.tsx` - Main container
- `ForecastSummaryCard.tsx` - Running totals display
- Update `ForecastWizardV3.tsx` - New layout proportions

**Summary Display**:
```
┌─────────────────────────────────────┐
│ 📊 FY2026 FORECAST                  │
├─────────────────────────────────────┤
│ Revenue              $1,500,000  ✓  │
│ Cost of Sales          (calculating)│
│ Gross Profit              —         │
│ Operating Expenses        —         │
│ Net Profit                —         │
│ Net Margin                —         │
├─────────────────────────────────────┤
│ Progress: ████░░░░░░ 40% (Team)    │
└─────────────────────────────────────┘
```

---

### Phase 2: Section-by-Section Building (Priority: HIGH)

**Goal**: Each wizard step populates its section visually

**Step → Section Mapping**:
| Wizard Step | Forecast Section |
|-------------|------------------|
| Setup | Revenue Target, Profit Target, Period |
| Team | Team Costs (COGS + OpEx split) |
| Costs | Operating Expenses by Category |
| Investments | Strategic Investments (CapEx + OpEx) |
| Review | Full P&L + Validation |

**Components**:
- `ForecastSection.tsx` - Collapsible section wrapper
- `TeamSection.tsx` - Team costs display
- `OpExSection.tsx` - Operating expenses with categories
- `InvestmentsSection.tsx` - Strategic investments
- `RevenueSection.tsx` - Revenue target display

**Visual States**:
- `✓` Confirmed
- `←` Currently editing
- `⏳` Pending (future step)
- `⚠️` Warning (margin issue, etc.)

---

### Phase 3: Smart Category Grouping (Priority: MEDIUM)

**Goal**: Handle businesses with many accounts without overwhelming UI

**Materiality Rules**:
1. Accounts > 5% of category total → Show individually
2. Accounts < 5% → Group into "Other (X accounts)"
3. "Other" is expandable to see full detail
4. User can "pin" any account to always show
5. User can "merge" related accounts

**Algorithm**:
```typescript
function groupAccountsByMateriality(accounts: Account[], threshold = 0.05) {
  const total = accounts.reduce((sum, a) => sum + a.amount, 0);
  const material = accounts.filter(a => a.amount / total >= threshold);
  const immaterial = accounts.filter(a => a.amount / total < threshold);

  return {
    visible: material.sort((a, b) => b.amount - a.amount),
    grouped: {
      label: `Other (${immaterial.length} accounts)`,
      accounts: immaterial,
      total: immaterial.reduce((sum, a) => sum + a.amount, 0)
    }
  };
}
```

**UI**:
```
│ Rent & Occupancy            $48,000     19.5%    │
│ Marketing & Advertising     $35,000     14.2%    │
│ Insurance                   $22,000      8.9%    │
│ ▶ Other (12 accounts)       $45,000     18.3%    │
│   └─ Click to expand                             │
```

---

### Phase 4: Operating Expenses Methodology (Priority: HIGH)

**Goal**: Clear, visual approach to OpEx forecasting

**Methodology** (per user specification):
1. Pull prior year actuals from Xero
2. Analyze each category:
   - Determine monthly average
   - Identify one-offs (months that are outliers)
   - Exclude one-offs from average OR flag for user decision
3. Apply growth factor (default 5%)
4. Allow manual overrides

**UI Display**:
```
┌───────────────────────────────────────────────────────────┐
│ OPERATING EXPENSES                          [Annual ▼]    │
├───────────────────────────────────────────────────────────┤
│ Category              Prior Yr   Trend    +%    FY26      │
│ ─────────────────────────────────────────────────────────│
│ Rent & Occupancy      $48,000    Stable   +5%   $50,400   │
│ Marketing             $35,000    Growing  +43%  $50,000 ✎ │
│ Insurance             $22,000    Stable   +5%   $23,100   │
│ Software              $12,000    Growing  +25%  $15,000   │
│ ▶ Other (8 accounts)  $45,000    Mixed    +5%   $47,250   │
│                      ────────          ────── ─────────   │
│ TOTAL                $162,000                  $185,750   │
├───────────────────────────────────────────────────────────┤
│ 💡 Marketing override: You set $50k (+43% vs prior)       │
│ ⚠️ Software up 25% - verify with user                     │
└───────────────────────────────────────────────────────────┘
```

**Trend Detection**:
- `Stable` - Monthly variance < 20%
- `Growing` - Clear upward trend
- `Declining` - Clear downward trend
- `Seasonal` - Predictable monthly pattern
- `Irregular` - High variance, use average

---

### Phase 5: Inline Editing (Priority: MEDIUM)

**Goal**: Direct manipulation of numbers in the panel

**Interactions**:
1. **Click number** → Inline edit mode
2. **Type value** → `$50000` or `50k` or `+10%`
3. **Enter** → Save, update totals
4. **Escape** → Cancel edit
5. **Tab** → Move to next editable field

**Smart Input Parsing**:
```typescript
function parseInput(input: string, currentValue: number): number {
  const cleaned = input.replace(/[$,\s]/g, '');

  // Percentage adjustment: "+10%" or "-5%"
  if (cleaned.match(/^[+-]\d+%$/)) {
    const pct = parseFloat(cleaned) / 100;
    return currentValue * (1 + pct);
  }

  // Shorthand: "50k" = 50000, "1.5m" = 1500000
  if (cleaned.match(/^\d+(\.\d+)?k$/i)) {
    return parseFloat(cleaned) * 1000;
  }
  if (cleaned.match(/^\d+(\.\d+)?m$/i)) {
    return parseFloat(cleaned) * 1000000;
  }

  // Plain number
  return parseFloat(cleaned) || currentValue;
}
```

**Visual Feedback**:
```
│ Marketing    [$35,000] → typing → [$50,000]  ✓ Saved    │
│                         ↑ yellow border while editing    │
```

---

### Phase 6: Monthly View Toggle (Priority: MEDIUM)

**Goal**: See monthly breakdown when needed

**Toggle Behavior**:
- Default: Annual totals (cleaner during wizard)
- Click "Monthly" → Expands to show all months
- Per-section toggle (don't force all-or-nothing)

**Monthly Grid**:
```
┌────────────────────────────────────────────────────────────────┐
│ TEAM COSTS                                    [Monthly Grid]   │
├────────────────────────────────────────────────────────────────┤
│                Jul    Aug    Sep    Oct    Nov    Dec    TOTAL │
│ Existing      31.7k  31.7k  31.7k  31.7k  31.7k  31.7k   380k │
│ New Hires        —      —   7.9k   15k    15k    15k     165k │
│ ──────────────────────────────────────────────────────────────│
│ TOTAL         31.7k  31.7k  39.6k  46.7k  46.7k  46.7k   545k │
└────────────────────────────────────────────────────────────────┘
```

---

### Phase 7: Anomaly Detection & Warnings (Priority: LOW)

**Goal**: Proactively flag issues

**Checks**:
1. **Margin too low**: Net margin < 10%
2. **Margin unrealistic**: Net margin > 40%
3. **Category spike**: Any expense up > 50% vs prior
4. **Missing data**: Key categories with $0
5. **Target mismatch**: Calculated profit ≠ profit target

**Display**:
```
├─────────────────────────────────────────────────────────────┤
│ ⚠️ WARNINGS                                                 │
│ • Net margin (8%) below typical SMB range (10-15%)          │
│ • Software costs up 85% - is this planned?                  │
│ • No insurance expense found - check Xero mapping           │
└─────────────────────────────────────────────────────────────┘
```

---

## Technical Architecture

### State Management

```typescript
interface LiveForecastState {
  // Targets
  revenueTarget: number;
  profitTarget: number;
  yearsSelected: number[];

  // Team
  existingTeam: TeamMember[];
  plannedHires: PlannedHire[];
  teamCostsCOGS: number;
  teamCostsOpEx: number;

  // Operating Expenses
  opexCategories: OpExCategory[];
  opexGrowthRate: number;
  opexOverrides: Record<string, number>;

  // Investments
  investments: Investment[];
  investmentsCapEx: number;
  investmentsOpEx: number;

  // Calculated
  grossProfit: number;
  grossMargin: number;
  netProfit: number;
  netMargin: number;

  // Warnings
  warnings: Warning[];
}
```

### Component Hierarchy

```
ForecastWizardV3
├── ChatPanel (35%)
│   ├── MessageList
│   ├── SuggestionButtons
│   └── InputField
│
└── LiveForecastPanel (65%)
    ├── ForecastHeader (title, view toggle)
    ├── ForecastSections
    │   ├── RevenueSection
    │   ├── TeamSection
    │   ├── OpExSection
    │   └── InvestmentsSection
    ├── ForecastSummary (running P&L)
    └── WarningsPanel
```

### Data Flow

```
User Input (Chat or Panel Edit)
         ↓
   Update LiveForecastState
         ↓
   Recalculate Totals
         ↓
   Check for Warnings
         ↓
   Update UI (both panels)
```

---

## File Changes Required

### New Files
- `src/app/finances/forecast/components/wizard-v3/LiveForecastPanel.tsx`
- `src/app/finances/forecast/components/wizard-v3/ForecastSection.tsx`
- `src/app/finances/forecast/components/wizard-v3/TeamSection.tsx`
- `src/app/finances/forecast/components/wizard-v3/OpExSection.tsx`
- `src/app/finances/forecast/components/wizard-v3/InvestmentsSection.tsx`
- `src/app/finances/forecast/components/wizard-v3/RevenueSection.tsx`
- `src/app/finances/forecast/components/wizard-v3/EditableNumber.tsx`
- `src/app/finances/forecast/components/wizard-v3/MonthlyGrid.tsx`
- `src/app/finances/forecast/hooks/useLiveForecast.ts`
- `src/app/finances/forecast/utils/categoryGrouping.ts`
- `src/app/finances/forecast/utils/anomalyDetection.ts`

### Modified Files
- `src/app/finances/forecast/components/wizard-v3/ForecastWizardV3.tsx` - Layout changes
- `src/app/finances/forecast/components/wizard-v3/ChatPanel.tsx` - Width adjustment
- `src/lib/services/claude-cfo-agent.ts` - Lighter responses (visual does heavy lifting)

---

## Success Metrics

1. **Comprehension**: Users understand their forecast without re-reading chat
2. **Speed**: Faster to complete wizard with direct editing
3. **Confidence**: Users feel certain about what they're approving
4. **Engagement**: More time spent reviewing numbers, less reading text

---

## Implementation Order

1. ✅ Phase 1: Layout & Live Summary (START HERE)
2. Phase 2: Section-by-Section Building
3. Phase 4: Operating Expenses Methodology (user priority)
4. Phase 3: Smart Category Grouping
5. Phase 5: Inline Editing
6. Phase 6: Monthly View Toggle
7. Phase 7: Anomaly Detection

---

## Open Questions (Resolved)

| Question | Answer |
|----------|--------|
| Annual or Monthly view? | Both - toggle, default annual |
| How much detail? | Smart grouping by materiality |
| Editable in panel? | Yes, inline editing |

---

*Created: December 25, 2025*
*Author: Claude Code + Matt Malouf*
