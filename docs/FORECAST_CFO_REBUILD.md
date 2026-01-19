# Forecast CFO - Complete Rebuild Plan

## The Vision

A **conversational forecast builder** that feels like working with your CFO. Not forms. Not wizards. A guided conversation that builds your forecast step by step.

## Core Principles

1. **Data First** - Never ask what we already know. Show it, ask to confirm.
2. **AI Intelligence** - Smart suggestions based on industry, history, and goals.
3. **Real-Time Impact** - Every decision immediately shows its effect on the P&L.
4. **Single Focus** - One thing at a time. No hunting across tabs or panels.
5. **Progressive Disclosure** - Simple by default, details when needed.

## The CFO Methodology

```
Revenue Target
    ↓
- Net Profit Target
    ↓
= EXPENSE BUDGET (Your constraint)
    ↓
Allocate: Team + OpEx + Investments ≤ Budget
```

## The Flow

### Step 1: Goals
**AI Says:** "Let's confirm your targets for FY26. Based on your goals, you're aiming for:
- Revenue: $850,000
- Net Profit: $102,000 (12%)
- **Expense Budget: $748,000** (this is what you have to work with)

Does this look right?"

**Actions:** [Confirm] [Adjust]

### Step 2: Prior Year Analysis
**AI Says:** "Here's what Xero shows for your last 12 months:
- Revenue: $720,000
- COGS: 35% of revenue
- OpEx: $180,000 ($15K/month average)

For your forecast, should I assume:
- Same COGS % (35%)
- OpEx grows with inflation (~5%)?

Or do you have different assumptions?"

**Actions:** [Use These] [Adjust Assumptions]

### Step 3: Team Planning
**AI Shows:**
```
┌─────────────────────────────────────────────────────────────┐
│ YOUR TEAM                                    Total: $245,000│
├─────────────────────────────────────────────────────────────┤
│ Name           │ Position        │ Salary    │ Type │      │
├─────────────────────────────────────────────────────────────┤
│ Sarah Johnson  │ Office Manager  │ $75,000   │ OpEx │ [✎]  │
│ Mike Chen      │ Senior Tech     │ $95,000   │ COGS │ [✎]  │
│ Lisa Park      │ Sales Rep       │ $68,000   │ OpEx │ [✎]  │
├─────────────────────────────────────────────────────────────┤
│                              [+ Add Team Member]            │
└─────────────────────────────────────────────────────────────┘
```

**AI Says:** "Your team costs $245K (with super). Planning a salary increase this year?"

**Salary Increase Slider:** 0% ----[●]---- 15% → 6%

**AI Says:** "6% increase brings total to $260K. Any new hires planned?"

**Add Hire Form (inline):**
```
Name: [____________]  Role: [____________]  Salary: [$________]
Start: [Jul 2025 ▼]   Type: [OpEx ▼]       [Add to Team]
```

### Step 4: Strategic Investments
**AI Says:** "Any major investments planned for FY26? These are one-off costs beyond normal operations."

**Quick Add Buttons:**
[+ Marketing Campaign] [+ New Equipment] [+ Software/Tech] [+ Training] [+ Custom]

**When clicked, inline form:**
```
Investment: [Marketing Campaign        ]
Amount:     [$25,000                   ]
When:       [Q2 FY26 ▼]
Type:       [○ OpEx (expense now)  ● CapEx (asset)]
[Add] [Cancel]
```

### Step 5: Review & Save
**AI Shows Final P&L:**
```
┌─────────────────────────────────────────────────────────────┐
│ FY26 FORECAST SUMMARY                                       │
├─────────────────────────────────────────────────────────────┤
│ Revenue                                         $850,000    │
│ Cost of Goods Sold (35%)                       ($297,500)   │
│ ─────────────────────────────────────────────────────────── │
│ GROSS PROFIT                          $552,500      65%     │
│ ─────────────────────────────────────────────────────────── │
│ Team Costs (4 people)                          ($280,000)   │
│ Operating Expenses (+5%)                       ($189,000)   │
│ Strategic Investments                           ($25,000)   │
│ ─────────────────────────────────────────────────────────── │
│ NET PROFIT                             $58,500      6.9%    │
└─────────────────────────────────────────────────────────────┘

⚠️ You're $43,500 below your 12% profit target.

💡 To hit your target, you could:
• Reduce team costs by $20K (defer a hire or reduce increases)
• Cut $20K from investments
• Increase revenue target to $920K
```

**Actions:** [Adjust Forecast] [Save Anyway] [Request Coach Review]

---

## UI Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 📊 Build Your FY26 Forecast                              [Save] [Close] │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────┐  ┌───────────────────────────────┐ │
│  │                                 │  │                               │ │
│  │  CONVERSATION                   │  │  YOUR NUMBERS                 │ │
│  │  ═════════════                  │  │  ═══════════════              │ │
│  │                                 │  │                               │ │
│  │  AI CFO message bubbles         │  │  Revenue      $850,000        │ │
│  │  with inline forms and          │  │  - Profit     $102,000        │ │
│  │  action buttons                 │  │  ═══════════════════          │ │
│  │                                 │  │  = Budget     $748,000        │ │
│  │  ┌─────────────────────────┐    │  │                               │ │
│  │  │ Team table here when    │    │  │  Spent So Far                 │ │
│  │  │ on team step            │    │  │  ████████████░░░ 72%          │ │
│  │  └─────────────────────────┘    │  │  $538,500 of $748,000         │ │
│  │                                 │  │                               │ │
│  │  [Back]              [Continue] │  │  Remaining: $209,500 ✓        │ │
│  │                                 │  │                               │ │
│  │                                 │  │  ─────────────────────────    │ │
│  │                                 │  │  Progress                     │ │
│  │                                 │  │  ✓ Goals                      │ │
│  │                                 │  │  ✓ Prior Year                 │ │
│  │                                 │  │  → Team Planning              │ │
│  │                                 │  │  ○ Investments                │ │
│  │                                 │  │  ○ Review                     │ │
│  │                                 │  │                               │ │
│  └─────────────────────────────────┘  └───────────────────────────────┘ │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Technical Implementation

### State Management
```typescript
interface ForecastCFOState {
  // Current step
  step: 'goals' | 'baseline' | 'team' | 'investments' | 'review';

  // Core data
  targets: {
    revenue: number;
    netProfit: number;
    expenseBudget: number; // Calculated: revenue - netProfit
  };

  baseline: {
    cogsPercent: number;
    priorYearOpEx: number;
    opExInflation: number;
  };

  team: {
    members: TeamMember[];
    salaryIncreasePercent: number;
    newHires: PlannedHire[];
  };

  investments: Investment[];

  // Conversation
  messages: CFOMessage[];

  // Calculations (derived)
  calculations: {
    forecastCOGS: number;
    teamCosts: number;
    opExCosts: number;
    investmentCosts: number;
    totalExpenses: number;
    projectedProfit: number;
    budgetRemaining: number;
    isOnTrack: boolean;
  };
}
```

### AI Integration
- Use Claude API for smart suggestions
- Context includes: goals, Xero data, industry benchmarks
- Suggestions are helpful, not mandatory
- All AI suggestions logged for learning

### Data Sources
1. **Goals** - From Goals & Targets module
2. **Team** - From Xero Payroll (if connected) or manual entry
3. **Prior Year** - From Xero P&L Summary
4. **Investments** - Linked to Strategic Initiatives

---

## Key Differences from Current Implementation

| Current | New |
|---------|-----|
| Separate step panels | Single flowing conversation |
| Empty forms to fill | Data shown first, confirm or adjust |
| No AI guidance | Smart suggestions throughout |
| Clunky table editing | Inline editing in conversation |
| Static numbers | Real-time budget tracker |
| Generic UI | Feels like talking to a CFO |

---

## Files to Create

1. `/components/forecast-cfo/ForecastCFO.tsx` - Main component
2. `/components/forecast-cfo/CFOConversation.tsx` - Left panel conversation
3. `/components/forecast-cfo/BudgetTracker.tsx` - Right panel numbers
4. `/components/forecast-cfo/TeamTable.tsx` - Inline team editor
5. `/components/forecast-cfo/InvestmentCards.tsx` - Investment quick-add
6. `/components/forecast-cfo/hooks/useForecastCFO.ts` - State management
7. `/api/ai/forecast-suggestions/route.ts` - AI suggestions endpoint

---

## Implementation Order

1. **Core Structure** - Layout, state management, step flow
2. **Goals Step** - Load from goals, confirm targets
3. **Baseline Step** - Load from Xero, set assumptions
4. **Team Step** - Table with inline editing, salary slider, add hires
5. **Investments Step** - Quick-add cards, custom form
6. **Review Step** - Full P&L, suggestions, save
7. **AI Integration** - Smart suggestions at each step
8. **Polish** - Animations, mobile, edge cases

---

*This is the plan. Let's build it right.*
