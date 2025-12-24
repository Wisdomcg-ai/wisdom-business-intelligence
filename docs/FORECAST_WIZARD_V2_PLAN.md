# Forecast Wizard V2 - Implementation Plan

## Executive Summary

Replace the current form-based forecast wizard with a **conversational CFO-guided experience** that:
- Pulls goals from existing Goals & Targets
- Imports team data from Xero
- Links investments to Strategic Initiatives
- Supports 1, 2, and 3-year forecasting
- Uses a hybrid AI agent for natural conversation
- Captures intelligence for learning
- Allows editing at any time

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           FORECAST WIZARD V2                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐              │
│  │   DATA       │    │   AI CFO     │    │   UI         │              │
│  │   SOURCES    │───▶│   AGENT      │───▶│   LAYER      │              │
│  └──────────────┘    └──────────────┘    └──────────────┘              │
│         │                   │                   │                       │
│         ▼                   ▼                   ▼                       │
│  ┌──────────────────────────────────────────────────────────┐          │
│  │                    DATABASE LAYER                         │          │
│  │  - Forecasts  - Decisions  - Sessions  - AI Interactions │          │
│  └──────────────────────────────────────────────────────────┘          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

DATA SOURCES:
├── Goals & Targets (existing)
├── Strategic Initiatives (existing)
├── Xero Connection (employees, accounts)
└── Industry Benchmarks (built-in)

AI CFO AGENT:
├── Claude API (conversation engine)
├── Context Manager (knows user's data)
├── Guardrails (prevents hallucination)
└── Decision Logger (captures learning)

UI LAYER:
├── Chat Interface (conversational)
├── Structured Inputs (numbers, dropdowns)
├── Live Preview (P&L updates in real-time)
└── Quick Entry Mode (for experts)
```

---

## 2. Database Schema Changes

### 2.1 New Tables

```sql
-- Track wizard sessions for analytics
CREATE TABLE forecast_wizard_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  forecast_id UUID REFERENCES financial_forecasts(id),
  user_id UUID REFERENCES auth.users(id),
  business_id UUID REFERENCES businesses(id),

  -- Session tracking
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  mode TEXT CHECK (mode IN ('guided', 'quick')),

  -- Progress tracking
  current_step TEXT,
  steps_completed JSONB DEFAULT '{}',
  -- Format: {"step_name": {"completed": true, "time_spent_seconds": 45}}

  dropped_off_at TEXT, -- Which step if incomplete

  -- Multi-year selection
  years_selected INTEGER[] DEFAULT ARRAY[1], -- [1], [1,2], [1,2,3]

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Track key decisions with reasoning
CREATE TABLE forecast_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  forecast_id UUID REFERENCES financial_forecasts(id),
  session_id UUID REFERENCES forecast_wizard_sessions(id),

  -- Decision details
  decision_type TEXT NOT NULL,
  -- Types: 'new_hire', 'remove_employee', 'salary_change',
  --        'investment', 'cost_added', 'cost_changed', 'goal_adjusted'

  decision_data JSONB NOT NULL,
  -- Contains the actual decision details

  reasoning TEXT, -- User's note on why (optional)

  -- AI involvement
  ai_suggestion JSONB, -- What AI recommended
  user_accepted_ai BOOLEAN,
  ai_confidence TEXT CHECK (ai_confidence IN ('high', 'medium', 'low')),

  -- Linking
  linked_initiative_id UUID REFERENCES strategic_initiatives(id),
  linked_pl_line_id UUID REFERENCES forecast_pl_lines(id),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Strategic investments (linked to initiatives)
CREATE TABLE forecast_investments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  forecast_id UUID REFERENCES financial_forecasts(id),
  initiative_id UUID REFERENCES strategic_initiatives(id),

  -- Investment details
  name TEXT NOT NULL,
  description TEXT,
  investment_type TEXT CHECK (investment_type IN ('capex', 'opex')),
  amount DECIMAL(12,2) NOT NULL,

  -- Timing
  start_month TEXT NOT NULL, -- '2026-02'
  is_recurring BOOLEAN DEFAULT FALSE,
  recurrence TEXT CHECK (recurrence IN ('monthly', 'quarterly', 'annual')),
  end_month TEXT, -- For recurring items

  -- Accounting
  pl_account_category TEXT, -- 'Marketing', 'Technology', etc.
  pl_line_id UUID REFERENCES forecast_pl_lines(id),

  -- CapEx specific
  depreciation_years INTEGER, -- NULL if expensed immediately

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Multi-year forecast data
CREATE TABLE forecast_years (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  forecast_id UUID REFERENCES financial_forecasts(id),

  year_number INTEGER NOT NULL CHECK (year_number IN (1, 2, 3)),
  fiscal_year INTEGER NOT NULL,
  granularity TEXT CHECK (granularity IN ('monthly', 'quarterly', 'annual')),

  -- Summary figures (for years 2-3)
  revenue_target DECIMAL(12,2),
  growth_percent DECIMAL(5,2),
  gross_margin_percent DECIMAL(5,2),
  net_profit_percent DECIMAL(5,2),

  -- Team projections
  headcount_change INTEGER DEFAULT 0,
  team_cost_estimate DECIMAL(12,2),

  -- High-level cost buckets (for years 2-3)
  opex_estimate DECIMAL(12,2),
  capex_estimate DECIMAL(12,2),

  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(forecast_id, year_number)
);

-- Enhance existing ai_interactions table
ALTER TABLE ai_interactions ADD COLUMN IF NOT EXISTS
  session_id UUID REFERENCES forecast_wizard_sessions(id);
ALTER TABLE ai_interactions ADD COLUMN IF NOT EXISTS
  step_context TEXT; -- Which wizard step this was in
```

### 2.2 Indexes

```sql
CREATE INDEX idx_wizard_sessions_business ON forecast_wizard_sessions(business_id);
CREATE INDEX idx_wizard_sessions_user ON forecast_wizard_sessions(user_id);
CREATE INDEX idx_forecast_decisions_forecast ON forecast_decisions(forecast_id);
CREATE INDEX idx_forecast_investments_initiative ON forecast_investments(initiative_id);
CREATE INDEX idx_forecast_years_forecast ON forecast_years(forecast_id);
```

---

## 3. AI CFO Agent Design

### 3.1 Agent Architecture

```typescript
interface CFOAgentContext {
  // Business context
  business_id: string;
  business_name: string;
  industry: string;
  business_stage: 'startup' | 'growth' | 'established';

  // Goals (from Goals & Targets)
  goals: {
    revenue_target: number;
    gross_margin_target: number;
    net_profit_target: number;
    fiscal_year: number;
  };

  // Current data (from Xero)
  current_team: TeamMember[];
  existing_expenses: ExpenseCategory[];
  historical_revenue: MonthlyData[];

  // Strategic context
  strategic_initiatives: Initiative[];

  // Session state
  current_step: string;
  decisions_made: Decision[];
  forecast_so_far: PartialForecast;

  // Conversation history
  messages: Message[];
}

interface CFOAgentConfig {
  // Personality
  persona: 'supportive' | 'direct' | 'educational';
  verbosity: 'concise' | 'detailed';

  // Guardrails
  can_suggest_numbers: boolean;
  must_cite_sources: boolean;
  stay_on_topic: boolean;

  // Capabilities
  can_access_xero: boolean;
  can_access_benchmarks: boolean;
  can_modify_forecast: boolean; // Only with user confirmation
}
```

### 3.2 System Prompt Template

```markdown
You are an AI CFO assistant helping a small business owner build their financial forecast.

## Your Context
- Business: {{business_name}} ({{industry}})
- Fiscal Year: FY{{fiscal_year}}
- Revenue Target: ${{revenue_target}}
- Profit Target: {{net_profit_target}}%

## Current Team (from Xero)
{{#each current_team}}
- {{name}}: {{role}}, ${{salary}}/year
{{/each}}

## Strategic Initiatives
{{#each strategic_initiatives}}
- {{name}}: {{description}}
{{/each}}

## Your Role
1. Guide the user through building their forecast conversationally
2. Ask one question at a time
3. Provide context and suggestions based on their industry
4. Flag concerns if the numbers don't add up
5. Always confirm before making changes

## Guardrails
- NEVER invent financial data - only use real data from their systems
- When suggesting numbers, cite your source (e.g., "Based on market data...")
- If uncertain, say so: "I'm not confident here - you might want to check with your coach"
- Stay focused on the forecast - redirect off-topic questions politely
- Always ask for confirmation before adding or changing data

## Current Step: {{current_step}}
## Decisions Made So Far:
{{#each decisions_made}}
- {{type}}: {{summary}}
{{/each}}

Now continue the conversation naturally, focusing on {{current_step}}.
```

### 3.3 Agent Functions (Tool Calls)

```typescript
// Functions the AI agent can call
const agentFunctions = [
  {
    name: 'add_team_member',
    description: 'Add a new team member to the forecast',
    parameters: {
      name: 'string',
      role: 'string',
      salary: 'number',
      start_month: 'string',
      classification: 'opex | cogs',
      is_planned: 'boolean'
    },
    requires_confirmation: true
  },
  {
    name: 'add_investment',
    description: 'Add a strategic investment',
    parameters: {
      name: 'string',
      initiative_id: 'string',
      amount: 'number',
      type: 'capex | opex',
      start_month: 'string',
      recurring: 'boolean'
    },
    requires_confirmation: true
  },
  {
    name: 'get_salary_benchmark',
    description: 'Look up typical salary for a role',
    parameters: {
      role: 'string',
      location: 'string?'
    },
    requires_confirmation: false
  },
  {
    name: 'validate_forecast',
    description: 'Check if current forecast meets goals',
    parameters: {},
    requires_confirmation: false
  },
  {
    name: 'show_forecast_summary',
    description: 'Display current forecast state',
    parameters: {},
    requires_confirmation: false
  }
];
```

---

## 4. Wizard Flow & Steps

### 4.1 Step Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      WIZARD FLOW                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  STEP 0: SETUP                                                  │
│  ├── Pull goals from Goals & Targets                            │
│  ├── Select years to forecast (1, 2, 3)                         │
│  ├── Connect/verify Xero (if not already)                       │
│  └── Choose mode (Guided / Quick Entry)                         │
│                                                                 │
│  STEP 1: TEAM PLANNING                                          │
│  ├── Review current team (from Xero)                            │
│  ├── Confirm classifications (COGS vs OpEx)                     │
│  ├── Add planned hires                                          │
│  ├── Mark any leavers                                           │
│  └── AI: Suggests if team cost is realistic for revenue         │
│                                                                 │
│  STEP 2: OPERATING COSTS                                        │
│  ├── Review existing costs (from Xero if available)             │
│  ├── Add/adjust regular costs                                   │
│  ├── Categorize by type                                         │
│  └── AI: Flags unusual costs, suggests benchmarks               │
│                                                                 │
│  STEP 3: STRATEGIC INVESTMENTS                                  │
│  ├── Show strategic initiatives                                 │
│  ├── For each: what investments needed?                         │
│  ├── Capture: amount, timing, CapEx/OpEx                        │
│  ├── Map to P&L accounts                                        │
│  └── AI: Suggests based on initiative type                      │
│                                                                 │
│  STEP 4: YEAR 2-3 PROJECTIONS (if selected)                     │
│  ├── Growth assumptions                                         │
│  ├── Major planned changes                                      │
│  ├── Simplified cost projections                                │
│  └── AI: Projects based on Year 1 + growth                      │
│                                                                 │
│  STEP 5: REVIEW & VALIDATE                                      │
│  ├── Full forecast summary                                      │
│  ├── AI validation (meets goals? realistic?)                    │
│  ├── Highlight concerns                                         │
│  ├── Suggest adjustments if needed                              │
│  └── Save / Request coach review                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Detailed Step Specifications

#### Step 0: Setup

```typescript
interface SetupStepData {
  // From Goals & Targets
  goals: {
    fiscal_year: number;
    revenue_target: number;
    gross_margin_percent: number;
    net_profit_percent: number;
  };

  // User selections
  years_to_forecast: (1 | 2 | 3)[];
  year_granularity: {
    1: 'monthly';      // Always monthly
    2: 'quarterly' | 'annual';
    3: 'quarterly' | 'annual';
  };

  // Connection status
  xero_connected: boolean;
  xero_tenant_name?: string;

  // Mode
  wizard_mode: 'guided' | 'quick';
}
```

**CFO Opening:**
> "Welcome! I can see you've set your targets for FY26 - $850K revenue with a 12% net margin.
> That's a solid goal. Let's build a plan to get there.
>
> First, how far out do you want to plan?"

#### Step 1: Team Planning

```typescript
interface TeamStepData {
  // From Xero
  existing_team: {
    id: string;
    name: string;
    role: string;
    annual_salary: number;
    start_date: string;
    classification: 'opex' | 'cogs';
    from_xero: boolean;
  }[];

  // User additions
  planned_hires: {
    role: string;
    name?: string; // Optional for future hires
    annual_salary: number;
    start_month: string;
    classification: 'opex' | 'cogs';
    reasoning?: string;
  }[];

  // Leavers
  planned_departures: {
    employee_id: string;
    end_month: string;
    reasoning?: string;
  }[];

  // Calculated
  total_team_cost: number; // Including super
}
```

**CFO Conversation Example:**
> "I've pulled your team from Xero - you have 3 people costing $238K including super.
> With your revenue target of $850K, that's 28% on wages - healthy for your industry.
>
> Are there any changes planned for FY26?"

#### Step 2: Operating Costs

```typescript
interface OperatingCostsStepData {
  cost_categories: {
    category: string;
    items: {
      name: string;
      annual_amount: number;
      is_monthly: boolean;
      from_xero: boolean;
      notes?: string;
    }[];
    subtotal: number;
  }[];

  total_opex: number;
}

// Standard categories
const COST_CATEGORIES = [
  'Rent & Occupancy',
  'Utilities & Services',
  'Technology & Software',
  'Marketing & Advertising',
  'Insurance',
  'Professional Fees',
  'Travel & Entertainment',
  'Office & Supplies',
  'Other Operating Costs'
];
```

#### Step 3: Strategic Investments

```typescript
interface InvestmentStepData {
  initiatives: {
    id: string;
    name: string;
    description: string;

    investments: {
      name: string;
      type: 'capex' | 'opex';
      amount: number;
      start_month: string;
      is_recurring: boolean;
      recurrence?: 'monthly' | 'quarterly' | 'annual';
      end_month?: string;
      pl_category: string;
      depreciation_years?: number; // For CapEx
      reasoning?: string;
    }[];

    total_investment: number;
  }[];

  total_capex: number;
  total_opex: number;
}
```

**CFO Conversation Example:**
> "You have 3 strategic initiatives. Let's figure out what investment each needs.
>
> Starting with 'Expand Digital Marketing' - what do you need to spend to make this happen?"

#### Step 4: Year 2-3 Projections

```typescript
interface MultiYearStepData {
  year_2?: {
    fiscal_year: number;
    granularity: 'quarterly' | 'annual';

    revenue_growth_percent: number;
    revenue_target: number; // Calculated

    margin_assumption: 'same' | 'improve' | 'decline';
    margin_adjustment?: number;

    headcount_change: number;
    new_roles?: string[];

    major_investments?: {
      description: string;
      amount: number;
      type: 'capex' | 'opex';
    }[];

    notes?: string;
  };

  year_3?: {
    // Same structure as year_2
  };
}
```

**CFO Conversation Example:**
> "For Year 2 (FY27), let's keep it high-level.
> Based on your FY26 forecast, you're on track for $850K.
>
> What growth are you targeting for FY27?"
>
> [Slider: 0% ----●---- 30%]

#### Step 5: Review & Validate

```typescript
interface ValidationResult {
  meets_goals: boolean;

  concerns: {
    severity: 'critical' | 'warning' | 'info';
    area: string;
    message: string;
    suggestion?: string;
  }[];

  summary: {
    year_1: {
      revenue: number;
      gross_profit: number;
      gross_margin: number;
      opex: number;
      net_profit: number;
      net_margin: number;
      vs_target: number; // Difference from goal
    };
    year_2?: { /* same */ };
    year_3?: { /* same */ };
  };

  ai_commentary: string;
}
```

---

## 5. UI Components

### 5.1 Main Layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│  HEADER                                                                  │
│  Logo    FY26 Forecast    [Progress: ●●●○○○]    [Quick Entry ⚡]         │
├────────────────────────────────────┬─────────────────────────────────────┤
│                                    │                                     │
│  LEFT PANEL (60%)                  │  RIGHT PANEL (40%)                  │
│  ══════════════════                │  ═══════════════════                │
│                                    │                                     │
│  Chat Interface                    │  Live Preview                       │
│  ┌────────────────────────────┐    │  ┌─────────────────────────────┐    │
│  │ CFO messages               │    │  │ P&L Summary                 │    │
│  │ User responses             │    │  │ (updates in real-time)      │    │
│  │ Structured inputs          │    │  │                             │    │
│  │ Action buttons             │    │  │ Revenue      $850,000       │    │
│  └────────────────────────────┘    │  │ - COGS       $340,000       │    │
│                                    │  │ Gross Profit $510,000  60%  │    │
│  ┌────────────────────────────┐    │  │                             │    │
│  │ Input area                 │    │  │ - Team       $333,000       │    │
│  │ [Type or select...]        │    │  │ - OpEx       $142,000       │    │
│  └────────────────────────────┘    │  │ Net Profit   $35,000   4%   │    │
│                                    │  │                             │    │
│  [Back]              [Continue]    │  │ ⚠️ Below 12% target         │    │
│                                    │  └─────────────────────────────┘    │
│                                    │                                     │
│                                    │  Progress                           │
│                                    │  ○ Setup                            │
│                                    │  ● Team Planning                    │
│                                    │  ○ Operating Costs                  │
│                                    │  ○ Investments                      │
│                                    │  ○ Year 2-3                         │
│                                    │  ○ Review                           │
│                                    │                                     │
└────────────────────────────────────┴─────────────────────────────────────┘
```

### 5.2 Component Breakdown

```typescript
// Main wizard container
<ForecastWizardV2>
  <WizardHeader />
  <WizardBody>
    <ChatPanel>
      <MessageList />
      <StructuredInput /> // Changes based on what's being asked
      <ActionButtons />
    </ChatPanel>
    <PreviewPanel>
      <PLSummary />
      <ProgressIndicator />
      <QuickActions />
    </PreviewPanel>
  </WizardBody>
</ForecastWizardV2>

// Structured input components (swap based on context)
<SalaryInput />
<TeamMemberForm />
<CostCategoryPicker />
<InvestmentForm />
<GrowthSlider />
<MonthPicker />
<ConfirmationCard />
```

### 5.3 Quick Entry Mode

```
┌──────────────────────────────────────────────────────────────────────────┐
│  QUICK ENTRY MODE                                        [💬 Guided]     │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  GOALS (from Goals & Targets)                              [Edit ↗]     │
│  Revenue: $850,000    Gross Margin: 60%    Net Profit: 12%              │
│                                                                          │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  TEAM                                                      [+ Add]       │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ Name             Role              Salary    Type   Start   Action │  │
│  │ Sarah Johnson    Office Manager    $75,000   OpEx   Mar 22    ✏️ 🗑️ │  │
│  │ Mike Chen        Senior Tech       $95,000   COGS   Jan 23    ✏️ 🗑️ │  │
│  │ Lisa Park        Sales Rep         $68,000   OpEx   Jul 24    ✏️ 🗑️ │  │
│  │ [+ New PM]       Project Manager   $95,000   OpEx   Mar 26    ✏️ 🗑️ │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│  Total: $333,000 (inc. 12% super)                                        │
│                                                                          │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  OPERATING COSTS                                           [+ Add]       │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ Category                    Annual Amount                          │  │
│  │ Rent & Occupancy            $36,000                           ✏️   │  │
│  │ Technology & Software       $12,000                           ✏️   │  │
│  │ Marketing & Advertising     $24,000                           ✏️   │  │
│  │ Insurance                   $8,000                            ✏️   │  │
│  │ Other                       $18,000                           ✏️   │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│  Total: $98,000                                                          │
│                                                                          │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  STRATEGIC INVESTMENTS                                     [+ Add]       │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ Initiative                Investment          Amount   When   Type │  │
│  │ Digital Marketing         Website Redesign    $15,000  Feb    CapEx│  │
│  │ Digital Marketing         Agency Retainer     $36,000  Jan-   OpEx │  │
│  │ New Service Line          Training Program    $8,000   Mar    OpEx │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│  Total: $59,000                                                          │
│                                                                          │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  FORECAST SUMMARY                                                        │
│  Revenue          $850,000                                               │
│  Gross Profit     $510,000    60%                                        │
│  Operating Costs  $490,000                                               │
│  Net Profit       $20,000     2.4%  ⚠️ Below 12% target                  │
│                                                                          │
│  [Validate with AI]                              [Save Forecast]         │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Data Integration

### 6.1 Goals & Targets Integration

```typescript
// Fetch goals for the business
async function loadGoalsForForecast(businessId: string, fiscalYear: number) {
  const { data } = await supabase
    .from('business_goals')
    .select('*')
    .eq('business_id', businessId)
    .eq('fiscal_year', fiscalYear)
    .single();

  return {
    revenue_target: data.revenue_target,
    gross_margin_target: data.gross_margin_percent,
    net_profit_target: data.net_profit_percent,
    // ... other goals
  };
}
```

### 6.2 Xero Team Import

```typescript
// Fetch employees from Xero
async function importTeamFromXero(businessId: string) {
  const response = await fetch('/api/Xero/employees', {
    method: 'POST',
    body: JSON.stringify({ business_id: businessId })
  });

  const employees = await response.json();

  // Map to our format
  return employees.map(emp => ({
    name: emp.firstName + ' ' + emp.lastName,
    role: emp.jobTitle || 'Team Member',
    annual_salary: calculateAnnualSalary(emp),
    start_date: emp.startDate,
    from_xero: true,
    xero_employee_id: emp.employeeID,
    classification: 'opex' // Default, user confirms
  }));
}
```

### 6.3 Strategic Initiatives Integration

```typescript
// Fetch initiatives for the business
async function loadStrategicInitiatives(businessId: string) {
  const { data } = await supabase
    .from('strategic_initiatives')
    .select('*')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .order('priority');

  return data;
}
```

---

## 7. Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [ ] Database migrations (new tables)
- [ ] Basic wizard shell with step navigation
- [ ] Goals integration (pull from Goals & Targets)
- [ ] Session tracking
- [ ] Quick Entry mode (form-based, no AI)

### Phase 2: Xero Integration (Week 2-3)
- [ ] Xero employee import endpoint
- [ ] Team planning step with Xero data
- [ ] Employee classification UI
- [ ] Planned hires / leavers functionality

### Phase 3: AI CFO Agent (Week 3-4)
- [ ] Agent context builder
- [ ] Claude API integration
- [ ] System prompt engineering
- [ ] Tool/function definitions
- [ ] Conversation state management
- [ ] Guardrails implementation

### Phase 4: Full Wizard Flow (Week 4-5)
- [ ] Chat UI components
- [ ] Live P&L preview
- [ ] Operating costs step
- [ ] Strategic investments step
- [ ] Account mapping UI

### Phase 5: Multi-Year & Validation (Week 5-6)
- [ ] Year 2-3 projection step
- [ ] AI validation logic
- [ ] Forecast summary view
- [ ] Concerns/suggestions display

### Phase 6: Polish & Learning (Week 6-7)
- [ ] Decision capture
- [ ] Analytics dashboard (for you)
- [ ] Edit mode (post-completion)
- [ ] Version management
- [ ] Coach review workflow

---

## 8. API Endpoints

### New Endpoints Needed

```typescript
// Wizard session management
POST   /api/forecast/wizard/start
PATCH  /api/forecast/wizard/[sessionId]/step
POST   /api/forecast/wizard/[sessionId]/complete

// AI CFO
POST   /api/ai/cfo/message
POST   /api/ai/cfo/validate

// Xero employees
POST   /api/Xero/employees

// Investments
GET    /api/forecast/[id]/investments
POST   /api/forecast/[id]/investments
PATCH  /api/forecast/investments/[id]
DELETE /api/forecast/investments/[id]

// Multi-year
GET    /api/forecast/[id]/years
POST   /api/forecast/[id]/years
PATCH  /api/forecast/years/[yearId]

// Analytics (for admin)
GET    /api/admin/wizard-analytics
GET    /api/admin/ai-interactions
```

---

## 9. Success Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Wizard completion rate | >80% | Sessions completed / started |
| Time to complete | <15 min | Avg session duration |
| AI suggestion acceptance | >60% | Accepted / total suggestions |
| User satisfaction | >4/5 | Post-completion survey |
| Return edits | <3 per forecast | Edits after completion |
| Coach review requests | Track | Count of review requests |

---

## 10. Open Questions

1. **Xero Payroll Access**: Do all clients have Xero Payroll enabled, or just Xero Accounting? This affects what employee data we can pull.

2. **Strategic Initiatives**: Is there an existing table for these, or do we need to create it? Need to confirm the data structure.

3. **Coach Review Workflow**: Should there be a formal "submit for review" flow, or is it just visibility?

4. **Mobile**: Should this work on mobile, or desktop-only for now?

5. **Offline/Save Draft**: How important is saving progress if user closes browser?

---

## 11. Next Steps

1. **Review this plan** - Confirm direction and priorities
2. **Answer open questions** - Especially Xero and Strategic Initiatives
3. **Create database migrations** - Get schema in place
4. **Build Quick Entry mode first** - Functional without AI
5. **Layer in AI CFO** - Add conversational interface
6. **Test with real data** - Your Xero connection

---

*Document created: December 2024*
*Version: 1.0*
