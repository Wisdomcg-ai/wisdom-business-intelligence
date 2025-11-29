# Strategic Planning Module Architecture

## Business ID System

This application has **THREE different ID types** that can represent a "business". Understanding this is critical to avoid data loss bugs.

### ID Types

| ID Type | Source Table | Example | Used By |
|---------|--------------|---------|---------|
| `user.id` | Supabase Auth | `52343ba5-...` | SWOT analysis |
| `businesses.id` | `businesses` | `8c8c63b2-...` | Coach relationships |
| `business_profiles.id` | `business_profiles` | `fa0a80e8-...` | **All planning data** |

### Critical Rules

1. **Strategic Planning Data** (goals, KPIs, initiatives) → Uses `business_profiles.id`
2. **SWOT Data** → Uses `user.id` (the owner's auth ID)
3. **Coach-Client Lookup** → Uses `businesses.id` then resolves to `business_profiles.id`

### Database Relationships

```
users (Supabase Auth)
  └── user.id
        │
        ├── businesses (multi-tenant business entities)
        │     └── businesses.id
        │     └── owner_id → user.id
        │     └── assigned_coach_id → user.id (coach)
        │
        ├── business_profiles (business details)
        │     └── business_profiles.id
        │     └── user_id → user.id
        │
        └── swot_items
              └── business_id → user.id (NOT businesses.id!)
```

### Coach View Data Loading

When a coach views a client's goals:

1. `overrideBusinessId` = client's `businesses.id`
2. Look up `businesses` to get `owner_id`
3. Look up `business_profiles` using `owner_id` to get `business_profiles.id`
4. Load/save all planning data using `business_profiles.id`
5. Load SWOT data using `owner_id` (the actual `user.id`)

## Component Structure

```
/src/app/goals/
├── page.tsx                    # Main wizard page (client view)
├── hooks/
│   └── useStrategicPlanning.ts # Core hook with all state management
├── components/
│   ├── Step1GoalsAndKPIs.tsx   # Step 1: Financial goals & KPIs
│   ├── step1/                  # Sub-components for Step 1
│   │   ├── FinancialGoalsSection.tsx
│   │   ├── CoreMetricsSection.tsx
│   │   ├── KPISection.tsx
│   │   └── types.ts
│   ├── Step2StrategicIdeas.tsx # Step 2: Strategic ideas
│   ├── Step3PrioritizeInitiatives.tsx # Step 3: Prioritize
│   ├── Step4AnnualPlan.tsx     # Step 4: Annual plan
│   └── Step5SprintPlanning.tsx # Step 5: 90-day sprint
├── services/
│   ├── financial-service.ts
│   ├── kpi-service.ts
│   ├── strategic-planning-service.ts
│   └── operational-activities-service.ts
└── types.ts                    # Type definitions
```

## Data Persistence

### Save Flow

1. User clicks "Save Progress" button
2. `handleSave()` in page.tsx calls `saveAllData()` from hook
3. `saveAllData()` calls each service with `businessId` (which is `business_profiles.id`)

### Auto-Save Status

**Auto-save is currently DISABLED** due to past data loss issues. The problem was:
- React state changes triggered auto-save
- On initial load, empty state was being saved before real data loaded
- This caused existing data to be overwritten with empty arrays

Future implementation should:
1. Track "dirty" state (user-initiated changes only)
2. Debounce saves
3. Never save during initial load

## Data Tables

| Table | Key | Description |
|-------|-----|-------------|
| `business_financial_goals` | `business_id` = `business_profiles.id` | 3-year financial targets |
| `business_kpis` | `business_id` = `business_profiles.id` | Selected KPIs |
| `strategic_initiatives` | `business_id` = `business_profiles.id` | Ideas & initiatives |
| `sprint_key_actions` | `business_id` = `business_profiles.id` | 90-day actions |
| `swot_items` | `business_id` = `user.id` | SWOT analysis items |
