# Forecast Wizard V4 Enhancement Plan

**Created:** 2024-12-30
**Status:** Ready for Implementation

## Overview

Enhancing the forecast wizard with CFO-level intelligence:
1. Industry-aware expense classification
2. Cost behavior analysis (Fixed/Variable/Ad-hoc)
3. Dedicated subscription audit with transaction-level analysis
4. Scenario planning foundation

---

## Wizard Steps (8 Total)

| Step | Name | Key Features |
|------|------|--------------|
| 1 | **Goals** | Revenue targets, profit goals, industry from profile |
| 2 | **Prior Year Analysis** | Review historical data, seasonality chart |
| 3 | **Revenue & COGS** | Revenue lines + growth %, COGS with cost behavior |
| 4 | **Team Planning** | Salaries, new hires, increases |
| 5 | **Operating Expenses** | All OpEx with Fixed/Variable/Ad-hoc classification |
| 6 | **Subscription Audit** | Account selection → Transaction analysis → Review |
| 7 | **CapEx** | Capital expenditure items |
| 8 | **Review & Generate** | Summary, sanity checks, generate forecast |

---

## Database Schema

### Migration 1: Update `financial_forecasts`

```sql
-- Add assumptions and scenario support to financial_forecasts
ALTER TABLE financial_forecasts
ADD COLUMN IF NOT EXISTS is_base_forecast BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS assumptions JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS parent_forecast_id UUID REFERENCES financial_forecasts(id) ON DELETE CASCADE;

-- Index for querying scenarios by parent
CREATE INDEX IF NOT EXISTS idx_forecasts_parent ON financial_forecasts(parent_forecast_id)
WHERE parent_forecast_id IS NOT NULL;

-- Comments
COMMENT ON COLUMN financial_forecasts.is_base_forecast IS 'True if this is a base forecast created from wizard, false if it is a scenario';
COMMENT ON COLUMN financial_forecasts.assumptions IS 'Structured assumptions that drive all calculations';
COMMENT ON COLUMN financial_forecasts.parent_forecast_id IS 'For scenarios: links to the base forecast this derives from';
```

### Migration 2: Create `forecast_scenarios`

```sql
CREATE TABLE forecast_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_forecast_id UUID NOT NULL REFERENCES financial_forecasts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,  -- "Optimistic", "Conservative", "Recession"
  description TEXT,
  assumption_overrides JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),

  CONSTRAINT unique_scenario_name_per_forecast UNIQUE(base_forecast_id, name)
);

-- RLS policies
ALTER TABLE forecast_scenarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "forecast_scenarios_access" ON forecast_scenarios
FOR ALL USING (
  base_forecast_id IN (
    SELECT ff.id FROM financial_forecasts ff
    JOIN businesses b ON b.id = ff.business_id
    WHERE b.owner_id = auth.uid() OR b.assigned_coach_id = auth.uid()
  )
  OR EXISTS (SELECT 1 FROM system_roles WHERE user_id = auth.uid() AND role = 'super_admin')
);
```

### Migration 3: Create `subscription_audit_results`

```sql
CREATE TABLE subscription_audit_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  forecast_id UUID REFERENCES financial_forecasts(id) ON DELETE SET NULL,

  -- Vendor details
  vendor_name TEXT NOT NULL,
  vendor_normalized TEXT,
  source_account_id TEXT,
  source_account_name TEXT,

  -- Detection results
  detected_frequency TEXT CHECK (detected_frequency IN ('monthly', 'quarterly', 'annual', 'irregular')),
  confidence TEXT CHECK (confidence IN ('high', 'medium', 'low')),

  -- Financial data
  typical_amount DECIMAL(12,2),
  annual_total DECIMAL(12,2),
  cost_per_employee DECIMAL(12,2),

  -- User decisions
  status TEXT DEFAULT 'review' CHECK (status IN ('essential', 'review', 'reduce', 'cancel')),
  notes TEXT,

  -- Tracking
  last_payment_date DATE,
  next_expected_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_vendor_per_business UNIQUE(business_id, vendor_normalized)
);

-- Indexes
CREATE INDEX idx_subscription_audit_business ON subscription_audit_results(business_id);
CREATE INDEX idx_subscription_audit_status ON subscription_audit_results(status);

-- RLS
ALTER TABLE subscription_audit_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subscription_audit_access" ON subscription_audit_results
FOR ALL USING (
  business_id IN (
    SELECT id FROM businesses
    WHERE owner_id = auth.uid() OR assigned_coach_id = auth.uid()
  )
  OR EXISTS (SELECT 1 FROM system_roles WHERE user_id = auth.uid() AND role = 'super_admin')
);
```

---

## TypeScript Types

### Forecast Assumptions Structure

```typescript
// types/forecast-assumptions.ts

interface RevenueAssumptions {
  lines: {
    accountId: string;
    accountName: string;
    priorYearTotal: number;
    growthPct: number;
    growthType: 'percentage' | 'fixed_amount';
    fixedGrowthAmount?: number;
  }[];
  seasonalityPattern: number[]; // 12 values, sum to 100
}

interface COGSAssumptions {
  lines: {
    accountId: string;
    accountName: string;
    costBehavior: 'variable' | 'fixed';
    percentOfRevenue?: number;
    monthlyAmount?: number;
  }[];
}

interface TeamAssumptions {
  existingTeam: {
    employeeId: string;
    name: string;
    role: string;
    currentSalary: number;
    salaryIncreasePct: number;
    increaseMonth: string;
    includeInForecast: boolean;
  }[];
  plannedHires: {
    id: string;
    role: string;
    salary: number;
    startMonth: string;
    onboardingCostPct: number;
  }[];
  superannuationPct: number;
  workCoverPct: number;
  payrollTaxPct: number;
}

interface OpExAssumptions {
  lines: {
    accountId: string;
    accountName: string;
    priorYearTotal: number;
    costBehavior: 'fixed' | 'variable' | 'adhoc';
    monthlyAmount?: number;
    annualIncreasePct?: number;
    percentOfRevenue?: number;
    expectedAnnualAmount?: number;
    expectedMonths?: string[];
    isSubscription?: boolean;
  }[];
}

interface CapExAssumptions {
  items: {
    id: string;
    name: string;
    amount: number;
    month: string;
    category: 'equipment' | 'vehicle' | 'leasehold' | 'technology' | 'other';
  }[];
}

interface ForecastAssumptions {
  version: number;
  createdAt: string;
  updatedAt: string;

  revenue: RevenueAssumptions;
  cogs: COGSAssumptions;
  team: TeamAssumptions;
  opex: OpExAssumptions;
  capex: CapExAssumptions;

  subscriptions?: {
    auditedAt: string;
    totalAnnual: number;
    essentialAnnual: number;
    reviewAnnual: number;
    potentialSavings: number;
  };

  industry?: string;
  employeeCount?: number;
  fiscalYearStart: string;
}

interface ScenarioOverrides {
  name: string;
  description?: string;
  revenueGrowthMultiplier?: number;
  cogsAdjustmentPct?: number;
  teamChanges?: {
    additionalHires?: TeamAssumptions['plannedHires'];
    removedHires?: string[];
    salaryAdjustmentPct?: number;
  };
  opexAdjustmentPct?: number;
  capexChanges?: {
    additionalItems?: CapExAssumptions['items'];
    removedItems?: string[];
    delayMonths?: number;
  };
}
```

### Cost Behavior Types

```typescript
type CostBehavior = 'fixed' | 'variable' | 'adhoc';

interface OpExLineWithBehavior {
  id: string;
  name: string;
  accountId?: string;
  total: number;
  monthlyAvg: number;
  costBehavior: CostBehavior;
  // For fixed:
  monthlyAmount?: number;
  // For variable:
  percentOfRevenue?: number;
  // For adhoc:
  expectedAmount?: number;
  expectedMonths?: string[];
  // Subscription flag
  isSubscription?: boolean;
}
```

---

## Cost Behavior Classification

| Category | Meaning | Forecasting Method |
|----------|---------|-------------------|
| **Fixed** | Predictable, same each month | Monthly amount × 12 |
| **Variable** | Scales with revenue | % of revenue |
| **Ad-hoc** | Irregular, unpredictable | User enters expected amount |

### Auto-Detection Rules

1. Account name contains "rent", "lease", "insurance" → **Fixed**
2. Account name contains "commission", "merchant", "freight" → **Variable**
3. High correlation with revenue (>0.7) → **Variable**
4. Low variance month-to-month (<10%) → **Fixed**
5. Otherwise → **Ad-hoc** (flag for user review)

---

## Subscription Audit Flow

### Phase 1: Account Selection
User selects which accounts contain subscriptions:
- Pre-suggest accounts with names containing: "subscription", "software", "SaaS", "cloud", "IT"
- User confirms selection

### Phase 2: Transaction Analysis
For selected accounts, fetch last 12 months of transactions:
1. Extract vendor names from descriptions
2. Detect payment frequency (monthly/quarterly/annual/irregular)
3. Calculate annual cost and cost per employee

### Phase 3: Review Table
Display results with actions:
- Essential / Review / Reduce / Cancel
- Flag duplicates (multiple PM tools, etc.)
- Flag upcoming renewals

### Vendor Extraction Mappings

```typescript
const vendorMappings: Record<string, string> = {
  'SLACK': 'Slack',
  'XERO': 'Xero',
  'GOOGLE': 'Google Workspace',
  'MSFT': 'Microsoft 365',
  'MICROSOFT': 'Microsoft 365',
  'CANVA': 'Canva',
  'HUBSPOT': 'HubSpot',
  'ASANA': 'Asana',
  'MONDAY': 'Monday.com',
  'NOTION': 'Notion',
  'FIGMA': 'Figma',
  'ADOBE': 'Adobe',
  'DROPBOX': 'Dropbox',
  'ZOOM': 'Zoom',
  'ATLASSIAN': 'Atlassian',
  'JIRA': 'Atlassian Jira',
  'CONFLUENCE': 'Atlassian Confluence',
  'GITHUB': 'GitHub',
  'AWS': 'Amazon Web Services',
  'AMAZON WEB': 'Amazon Web Services',
  'AZURE': 'Microsoft Azure',
  'DIGITALOCEAN': 'DigitalOcean',
  'MAILCHIMP': 'Mailchimp',
  'INTERCOM': 'Intercom',
  'ZENDESK': 'Zendesk',
  'FRESHDESK': 'Freshdesk',
  'STRIPE': 'Stripe',
  'SQUARE': 'Square',
  'SHOPIFY': 'Shopify',
  'QUICKBOOKS': 'QuickBooks',
  'GUSTO': 'Gusto',
  'DEPUTY': 'Deputy',
  'EMPLOYMENT HERO': 'Employment Hero',
  'TANDA': 'Tanda',
  'DOCUSIGN': 'DocuSign',
  'PANDADOC': 'PandaDoc',
  'CALENDLY': 'Calendly',
  'LOOM': 'Loom',
  'MIRO': 'Miro',
  'AIRTABLE': 'Airtable',
  'TYPEFORM': 'Typeform',
  'SURVEYMONKEY': 'SurveyMonkey',
  'GRAMMARLY': 'Grammarly',
  'LASTPASS': 'LastPass',
  '1PASSWORD': '1Password',
  'NORDVPN': 'NordVPN',
  'EXPRESSVPN': 'ExpressVPN',
};
```

---

## Implementation Order

| # | Task | File(s) | Complexity |
|---|------|---------|------------|
| 1 | Create database migration | `supabase/migrations/20251230_forecast_scenarios.sql` | Low |
| 2 | Create TypeScript types | `src/app/finances/forecast/components/wizard-v4/types/assumptions.ts` | Medium |
| 3 | Update Step 1 - Industry check | `wizard-v4/steps/Step1Goals.tsx` | Low |
| 4 | Update Step 3 - COGS behavior | `wizard-v4/steps/Step3RevenueCOGS.tsx` | Medium |
| 5 | Update Step 5 - OpEx classification | `wizard-v4/steps/Step5OpEx.tsx` | Medium |
| 6 | Create subscription API | `src/app/api/xero/subscription-transactions/route.ts` | Medium |
| 7 | Create vendor extraction utility | `wizard-v4/utils/vendorExtraction.ts` | Medium |
| 8 | Create frequency detection utility | `wizard-v4/utils/frequencyDetection.ts` | Low |
| 9 | Create Step 6 UI | `wizard-v4/steps/Step6Subscriptions.tsx` | Medium |
| 10 | Update wizard step flow | `wizard-v4/ForecastWizardV4.tsx`, `wizard-v4/types.ts` | Low |
| 11 | Update useForecastWizard hook | `wizard-v4/useForecastWizard.ts` | Medium |
| 12 | Save assumptions on generate | Various | Medium |

---

## Key Decisions Made

1. **Industry** - Use existing field from `business_profiles`, don't duplicate
2. **Cost Behavior** - Simplified to Fixed/Variable/Ad-hoc (not academic terms)
3. **Materiality** - Removed concept, show all expenses
4. **D&A** - Excluded from forecast (handled by accountant annually)
5. **Other Expenses Step** - Removed, everything goes in OpEx
6. **Subscription Audit** - User selects accounts first, then analyze transactions
7. **Scenario Planning** - Foundation built now via assumptions JSONB
8. **Database** - Subscription results saved for budget vs actual tracking

---

## Notes

- Wizard creates "base forecast" with `is_base_forecast = true`
- Scenarios are created later (not in this implementation)
- All monthly calculations derive from assumptions
- Variable costs auto-adjust when revenue changes in scenarios
