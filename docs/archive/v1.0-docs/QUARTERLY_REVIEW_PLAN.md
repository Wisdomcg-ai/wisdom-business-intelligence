# Quarterly Review Workshop - Implementation Plan

## Overview

A 4-hour guided workshop experience that connects existing platform features into a cohesive quarterly planning process. Based on Matt Malouf's proven methodology from Wisdom Consulting Group.

**Core Principle:** Targets drive initiatives. Set the destination first, then figure out what you need to do to get there.

---

## Workshop Structure (4 Hours)

```
PART 1: REFLECTION (60 mins)
├── 1.1 Pre-Work Questionnaire Review (10 mins)
├── 1.2 Business Dashboard Review (20 mins)
└── 1.3 Action Replay (30 mins)

PART 2: ANALYSIS (60 mins)
├── 2.1 Feedback Loop Framework (30 mins)
├── 2.2 Open Loops Audit (15 mins)
└── 2.3 Issues List - IDS (15 mins)

PART 3: STRATEGIC REVIEW (60 mins)
├── 3.1 Assessment & Roadmap Check (15 mins)
├── 3.2 SWOT Update (30 mins)
└── 3.3 Annual Target Confidence Check (15 mins)

PART 4: PLANNING (60 mins)
├── 4.1 Quarterly Targets & KPIs (15 mins)      ← Numbers first
├── 4.2 Strategic Initiatives Review (15 mins)  ← Then initiatives
├── 4.3 90-Day Sprint / Rocks (20 mins)         ← Then priorities
└── 4.4 Personal Commitments (10 mins)

→ ONE PAGE PLAN AUTO-UPDATES
```

---

## File Structure

```
src/app/quarterly-review/
├── page.tsx                          # Main entry - workshop overview/start
├── layout.tsx                        # Workshop layout with progress indicator
├── components/
│   ├── WorkshopProgress.tsx          # Progress bar showing 4 parts
│   ├── WorkshopNav.tsx               # Navigation between steps
│   ├── QuarterSelector.tsx           # Select which quarter to review
│   │
│   ├── part1-reflection/
│   │   ├── PreWorkReview.tsx         # 1.1 Review pre-work questionnaire
│   │   ├── DashboardReview.tsx       # 1.2 Business dashboard data review
│   │   └── ActionReplay.tsx          # 1.3 Four-column retrospective
│   │
│   ├── part2-analysis/
│   │   ├── FeedbackLoop.tsx          # 2.1 Stop/Less/Continue/More/Start matrix
│   │   ├── OpenLoopsAudit.tsx        # 2.2 Open loops review & decisions
│   │   └── IssuesList.tsx            # 2.3 IDS process
│   │
│   ├── part3-strategic/
│   │   ├── AssessmentRoadmap.tsx     # 3.1 Assessment scores & roadmap check
│   │   ├── SwotUpdate.tsx            # 3.2 Quarterly SWOT refresh
│   │   └── ConfidenceCheck.tsx       # 3.3 Annual target confidence
│   │
│   ├── part4-planning/
│   │   ├── QuarterlyTargets.tsx      # 4.1 Set quarterly financial targets & KPIs
│   │   ├── InitiativesReview.tsx     # 4.2 Review & update strategic initiatives
│   │   ├── SprintRocks.tsx           # 4.3 90-day sprint / rocks selection
│   │   └── PersonalCommitments.tsx   # 4.4 Hours, days off, personal goals
│   │
│   └── completion/
│       ├── WorkshopSummary.tsx       # Summary of all workshop outputs
│       └── OnePagePlanUpdate.tsx     # Confirmation of One Page Plan updates
│
├── hooks/
│   ├── useQuarterlyReview.ts         # Main state management hook
│   ├── useWorkshopProgress.ts        # Track progress through workshop
│   └── useQuarterData.ts             # Fetch data for selected quarter
│
├── services/
│   └── quarterly-review-service.ts   # Database operations
│
├── types/
│   └── index.ts                      # TypeScript interfaces
│
├── utils/
│   └── calculations.ts               # Helper functions
│
├── [step]/
│   └── page.tsx                      # Dynamic route for each step
│
└── pre-work/
    └── page.tsx                      # Pre-work questionnaire (done before workshop)
```

---

## Database Schema

### New Table: `quarterly_reviews`

Main table storing the quarterly review workshop data.

```sql
-- Quarterly Review Workshop Data
CREATE TABLE IF NOT EXISTS public.quarterly_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Quarter identification
  quarter INTEGER NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  year INTEGER NOT NULL,
  review_type TEXT DEFAULT 'quarterly' CHECK (review_type IN ('quarterly', 'annual', 'mid-year')),

  -- ═══════════════════════════════════════════════════════════════
  -- PRE-WORK QUESTIONNAIRE (completed before workshop)
  -- ═══════════════════════════════════════════════════════════════

  prework_completed_at TIMESTAMPTZ,

  -- Last quarter reflection
  last_quarter_rating INTEGER CHECK (last_quarter_rating BETWEEN 1 AND 10),
  biggest_win TEXT,
  biggest_challenge TEXT,
  key_learning TEXT,

  -- Personal pulse
  hours_worked_avg INTEGER,
  days_off_taken INTEGER,
  energy_level INTEGER CHECK (energy_level BETWEEN 1 AND 10),
  purpose_alignment INTEGER CHECK (purpose_alignment BETWEEN 1 AND 10),

  -- Looking ahead
  one_thing_for_success TEXT,
  coach_support_needed TEXT,

  -- ═══════════════════════════════════════════════════════════════
  -- PART 1: REFLECTION
  -- ═══════════════════════════════════════════════════════════════

  -- 1.2 Dashboard Review (snapshot of actuals vs targets at review time)
  dashboard_snapshot JSONB DEFAULT '{}',
  /*
    {
      "revenue": { "target": 280000, "actual": 265000, "variance": -15000 },
      "grossProfit": { "target": 140000, "actual": 138000, "variance": -2000 },
      "netProfit": { "target": 42000, "actual": 35000, "variance": -7000 },
      "kpis": [
        { "name": "Leads", "target": 50, "actual": 42 },
        { "name": "Conversion", "target": 25, "actual": 28 }
      ],
      "rocksCompletion": { "completed": 2, "total": 4, "percentage": 50 }
    }
  */

  -- 1.3 Action Replay
  action_replay JSONB DEFAULT '{}',
  /*
    {
      "worked": ["Item 1", "Item 2"],
      "didntWork": ["Item 1", "Item 2"],
      "plannedButDidnt": ["Item 1", "Item 2"],
      "newIdeas": ["Item 1", "Item 2"],
      "keyInsight": "The one thing we learned..."
    }
  */

  -- ═══════════════════════════════════════════════════════════════
  -- PART 2: ANALYSIS
  -- ═══════════════════════════════════════════════════════════════

  -- 2.1 Feedback Loop Framework
  feedback_loop JSONB DEFAULT '{}',
  /*
    {
      "marketing": { "stop": [], "less": [], "continue": [], "more": [], "start": [] },
      "sales": { "stop": [], "less": [], "continue": [], "more": [], "start": [] },
      "operations": { "stop": [], "less": [], "continue": [], "more": [], "start": [] },
      "finances": { "stop": [], "less": [], "continue": [], "more": [], "start": [] },
      "people": { "stop": [], "less": [], "continue": [], "more": [], "start": [] },
      "owner": { "stop": [], "less": [], "continue": [], "more": [], "start": [] },
      "topPriorities": ["Priority 1", "Priority 2", "Priority 3"]
    }
  */

  -- 2.2 Open Loops (decisions made during workshop)
  open_loops_decisions JSONB DEFAULT '[]',
  /*
    [
      { "loopId": "uuid", "title": "...", "decision": "complete|delegate|delete|defer", "notes": "..." },
      ...
    ]
  */

  -- 2.3 Issues List (IDS outcomes)
  issues_resolved JSONB DEFAULT '[]',
  /*
    [
      { "issueId": "uuid", "issue": "...", "solution": "...", "owner": "...", "dueDate": "..." },
      ...
    ]
  */

  -- ═══════════════════════════════════════════════════════════════
  -- PART 3: STRATEGIC REVIEW
  -- ═══════════════════════════════════════════════════════════════

  -- 3.1 Assessment & Roadmap
  assessment_snapshot JSONB DEFAULT '{}',
  /*
    {
      "totalScore": 185,
      "maxScore": 290,
      "percentage": 64,
      "engines": {
        "attract": { "score": 32, "max": 40 },
        "convert": { "score": 28, "max": 40 },
        ...
      },
      "assessmentDate": "2024-09-15",
      "retakeRequested": false
    }
  */

  roadmap_snapshot JSONB DEFAULT '{}',
  /*
    {
      "currentStage": "traction",
      "revenue": 680000,
      "buildItemsComplete": 12,
      "buildItemsTotal": 18,
      "stageConfirmed": true
    }
  */

  -- 3.2 SWOT (reference to swot_analyses table)
  swot_analysis_id UUID REFERENCES public.swot_analyses(id),

  -- 3.3 Annual Target Confidence
  annual_target_confidence INTEGER CHECK (annual_target_confidence BETWEEN 1 AND 10),
  confidence_notes TEXT,
  targets_adjusted BOOLEAN DEFAULT FALSE,

  -- ═══════════════════════════════════════════════════════════════
  -- PART 4: PLANNING
  -- ═══════════════════════════════════════════════════════════════

  -- 4.1 Quarterly Targets
  quarterly_targets JSONB DEFAULT '{}',
  /*
    {
      "revenue": 320000,
      "grossProfit": 160000,
      "netProfit": 48000,
      "kpis": [
        { "id": "uuid", "name": "Leads", "target": 60 },
        { "id": "uuid", "name": "Conversion", "target": 30 }
      ]
    }
  */

  -- 4.2 Strategic Initiatives (changes made during workshop)
  initiatives_changes JSONB DEFAULT '{}',
  /*
    {
      "carriedForward": ["uuid1", "uuid2"],
      "removed": ["uuid3"],
      "deferred": [{ "id": "uuid4", "toQuarter": "q2" }],
      "added": [{ "title": "...", "category": "..." }]
    }
  */

  -- 4.3 90-Day Sprint / Rocks
  quarterly_rocks JSONB DEFAULT '[]',
  /*
    [
      {
        "id": "uuid",
        "title": "Hire operations manager",
        "owner": "Matt",
        "doneDefinition": "Fully onboarded by Dec 15",
        "linkedInitiativeId": "uuid",
        "priority": 1
      },
      ...
    ]
  */

  -- 4.4 Personal Commitments
  personal_commitments JSONB DEFAULT '{}',
  /*
    {
      "hoursPerWeekTarget": 45,
      "daysOffPlanned": 10,
      "daysOffScheduled": ["2024-12-23", "2024-12-24", ...],
      "personalGoal": "Exercise 3x per week"
    }
  */

  -- ═══════════════════════════════════════════════════════════════
  -- METADATA
  -- ═══════════════════════════════════════════════════════════════

  -- Workshop progress tracking
  current_step TEXT DEFAULT 'prework',
  steps_completed JSONB DEFAULT '[]',
  /*
    ["prework", "1.1", "1.2", "1.3", "2.1", "2.2", "2.3", "3.1", "3.2", "3.3", "4.1", "4.2", "4.3", "4.4"]
  */

  -- Status
  status TEXT DEFAULT 'not_started' CHECK (status IN ('not_started', 'prework_complete', 'in_progress', 'completed')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint: one review per quarter per business
  UNIQUE(business_id, quarter, year)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_quarterly_reviews_business_id ON public.quarterly_reviews(business_id);
CREATE INDEX IF NOT EXISTS idx_quarterly_reviews_user_id ON public.quarterly_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_quarterly_reviews_quarter_year ON public.quarterly_reviews(year DESC, quarter DESC);
CREATE INDEX IF NOT EXISTS idx_quarterly_reviews_status ON public.quarterly_reviews(status);

-- RLS Policies
ALTER TABLE public.quarterly_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own quarterly reviews" ON public.quarterly_reviews
  FOR SELECT USING (
    user_id = auth.uid()
    OR business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can insert own quarterly reviews" ON public.quarterly_reviews
  FOR INSERT WITH CHECK (
    business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can update own quarterly reviews" ON public.quarterly_reviews
  FOR UPDATE USING (
    business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can delete own quarterly reviews" ON public.quarterly_reviews
  FOR DELETE USING (
    business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid())
  );

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_quarterly_reviews_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER quarterly_reviews_updated_at
  BEFORE UPDATE ON public.quarterly_reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_quarterly_reviews_updated_at();
```

---

## Integration Points

### Existing Features to Connect

| Feature | Location | How We Use It |
|---------|----------|---------------|
| Business Dashboard | `/business-dashboard/` | Pull actuals vs targets for Part 1.2 |
| Assessment | `/assessment/` | Show scores in Part 3.1, link to retake |
| Business Roadmap | `/business-roadmap/` | Show stage in Part 3.1 |
| SWOT | `/swot/` | Create new quarterly SWOT in Part 3.2 |
| Open Loops | `/open-loops/` | Pull existing loops for Part 2.2 |
| Issues List | `/issues-list/` | Pull existing issues for Part 2.3 |
| Goals | `/goals/` | Pull annual targets for Part 3.3 |
| Strategic Initiatives | `/strategic-initiatives/` | Review in Part 4.2 |
| KPI Selection | `/kpi-selection/` | Pull KPIs for Part 4.1 |
| One Page Plan | `/one-page-plan/` | Auto-update on completion |

### Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         DATA FLOW                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  INPUTS (Pull from existing)          OUTPUTS (Update existing) │
│  ─────────────────────────            ──────────────────────── │
│                                                                 │
│  business-dashboard                                             │
│  └─ actuals vs targets        ───►    One Page Plan             │
│                                       └─ Auto-regenerates       │
│  assessments                                                    │
│  └─ 8 engine scores           ───►    swot_analyses             │
│                                       └─ New quarterly SWOT     │
│  business_roadmap                                               │
│  └─ current stage             ───►    strategic_initiatives     │
│                                       └─ Status updates         │
│  swot_analyses                        └─ Quarter assignments    │
│  └─ previous SWOT                                               │
│                               ───►    open_loops                │
│  open_loops                           └─ Decision updates       │
│  └─ current loops                                               │
│                               ───►    issues                    │
│  issues                               └─ Resolution updates     │
│  └─ current issues                                              │
│                               ───►    goals (quarterly targets) │
│  goals                                └─ KPI targets            │
│  └─ annual targets                                              │
│  └─ quarterly targets                                           │
│                                                                 │
│  strategic_initiatives                                          │
│  └─ all initiatives                                             │
│                                                                 │
│  kpi_selections                                                 │
│  └─ selected KPIs                                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## TypeScript Interfaces

```typescript
// src/app/quarterly-review/types/index.ts

export type QuarterNumber = 1 | 2 | 3 | 4;
export type WorkshopStatus = 'not_started' | 'prework_complete' | 'in_progress' | 'completed';
export type ReviewType = 'quarterly' | 'annual' | 'mid-year';

export type WorkshopStep =
  | 'prework'
  | '1.1' | '1.2' | '1.3'
  | '2.1' | '2.2' | '2.3'
  | '3.1' | '3.2' | '3.3'
  | '4.1' | '4.2' | '4.3' | '4.4'
  | 'complete';

export interface QuarterlyReview {
  id: string;
  businessId: string;
  userId: string;
  quarter: QuarterNumber;
  year: number;
  reviewType: ReviewType;

  // Pre-work
  preworkCompletedAt: string | null;
  lastQuarterRating: number | null;
  biggestWin: string | null;
  biggestChallenge: string | null;
  keyLearning: string | null;
  hoursWorkedAvg: number | null;
  daysOffTaken: number | null;
  energyLevel: number | null;
  purposeAlignment: number | null;
  oneThingForSuccess: string | null;
  coachSupportNeeded: string | null;

  // Part 1: Reflection
  dashboardSnapshot: DashboardSnapshot;
  actionReplay: ActionReplay;

  // Part 2: Analysis
  feedbackLoop: FeedbackLoop;
  openLoopsDecisions: OpenLoopDecision[];
  issuesResolved: IssueResolution[];

  // Part 3: Strategic
  assessmentSnapshot: AssessmentSnapshot;
  roadmapSnapshot: RoadmapSnapshot;
  swotAnalysisId: string | null;
  annualTargetConfidence: number | null;
  confidenceNotes: string | null;
  targetsAdjusted: boolean;

  // Part 4: Planning
  quarterlyTargets: QuarterlyTargets;
  initiativesChanges: InitiativesChanges;
  quarterlyRocks: Rock[];
  personalCommitments: PersonalCommitments;

  // Metadata
  currentStep: WorkshopStep;
  stepsCompleted: WorkshopStep[];
  status: WorkshopStatus;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// Part 1 Types
export interface DashboardSnapshot {
  revenue: MetricSnapshot;
  grossProfit: MetricSnapshot;
  netProfit: MetricSnapshot;
  kpis: KpiSnapshot[];
  rocksCompletion: {
    completed: number;
    total: number;
    percentage: number;
  };
}

export interface MetricSnapshot {
  target: number;
  actual: number;
  variance: number;
}

export interface KpiSnapshot {
  id: string;
  name: string;
  target: number;
  actual: number;
}

export interface ActionReplay {
  worked: string[];
  didntWork: string[];
  plannedButDidnt: string[];
  newIdeas: string[];
  keyInsight: string;
}

// Part 2 Types
export interface FeedbackLoopArea {
  stop: string[];
  less: string[];
  continue: string[];
  more: string[];
  start: string[];
}

export interface FeedbackLoop {
  marketing: FeedbackLoopArea;
  sales: FeedbackLoopArea;
  operations: FeedbackLoopArea;
  finances: FeedbackLoopArea;
  people: FeedbackLoopArea;
  owner: FeedbackLoopArea;
  topPriorities: string[];
}

export type OpenLoopDecision = 'complete' | 'delegate' | 'delete' | 'defer';

export interface OpenLoopDecisionRecord {
  loopId: string;
  title: string;
  decision: OpenLoopDecision;
  notes: string;
  deferToQuarter?: string;
  delegateTo?: string;
}

export interface IssueResolution {
  issueId: string;
  issue: string;
  solution: string;
  owner: string;
  dueDate: string;
}

// Part 3 Types
export interface AssessmentSnapshot {
  totalScore: number;
  maxScore: number;
  percentage: number;
  engines: Record<string, { score: number; max: number }>;
  assessmentDate: string;
  retakeRequested: boolean;
}

export interface RoadmapSnapshot {
  currentStage: string;
  revenue: number;
  buildItemsComplete: number;
  buildItemsTotal: number;
  stageConfirmed: boolean;
}

// Part 4 Types
export interface QuarterlyTargets {
  revenue: number;
  grossProfit: number;
  netProfit: number;
  kpis: Array<{
    id: string;
    name: string;
    target: number;
  }>;
}

export interface InitiativesChanges {
  carriedForward: string[];
  removed: string[];
  deferred: Array<{ id: string; toQuarter: string }>;
  added: Array<{ title: string; category: string }>;
}

export interface Rock {
  id: string;
  title: string;
  owner: string;
  doneDefinition: string;
  linkedInitiativeId?: string;
  priority: number;
}

export interface PersonalCommitments {
  hoursPerWeekTarget: number;
  daysOffPlanned: number;
  daysOffScheduled: string[];
  personalGoal: string;
}
```

---

## UI/UX Design Principles

### 1. Workshop Flow
- Clear 4-part structure visible at all times
- Progress indicator showing completed steps
- Ability to navigate back to previous steps
- Auto-save on each step completion

### 2. Visual Design
- Consistent with existing platform (Tailwind, slate/teal palette)
- Card-based sections for each framework
- Clear visual hierarchy
- Celebratory completion states

### 3. Data Pre-population
- Pull existing data wherever possible
- Show "last quarter" vs "this quarter" comparisons
- Minimize manual data entry

### 4. Mobile Consideration
- Workshop primarily designed for desktop (4-hour session)
- Pre-work questionnaire should be mobile-friendly
- Summary/PDF export for mobile review

### 5. Coach Integration
- Coach can view client's quarterly reviews
- Option to share workshop summary with coach
- Coach can add notes/comments

---

## Implementation Order

### Phase 1: Foundation
1. Database migration
2. Types and interfaces
3. Service layer (CRUD operations)
4. Main hooks (useQuarterlyReview, useWorkshopProgress)
5. Layout and navigation components

### Phase 2: Pre-Work
6. Pre-work questionnaire page
7. Quarter selector component

### Phase 3: Part 1 - Reflection
8. Pre-work review component
9. Dashboard review component (integrate with business-dashboard)
10. Action Replay component

### Phase 4: Part 2 - Analysis
11. Feedback Loop Framework component
12. Open Loops Audit component (integrate with open-loops)
13. Issues List / IDS component (integrate with issues-list)

### Phase 5: Part 3 - Strategic Review
14. Assessment & Roadmap check component
15. SWOT Update component (integrate with swot)
16. Confidence Check component

### Phase 6: Part 4 - Planning
17. Quarterly Targets & KPIs component
18. Strategic Initiatives Review component
19. 90-Day Sprint / Rocks component
20. Personal Commitments component

### Phase 7: Completion
21. Workshop Summary component
22. One Page Plan update trigger
23. PDF export functionality

### Phase 8: Polish
24. Animations and transitions
25. Error handling and edge cases
26. Coach view integration
27. Testing and refinement

---

## Component Specifications

### WorkshopProgress.tsx
- Fixed header showing 4 parts
- Visual progress through each part
- Time estimate for remaining sections
- Quick navigation to any completed step

### ActionReplay.tsx
- 4-column drag-and-drop interface
- Add items via text input or quick buttons
- Reorder items within columns
- Key insight text area at bottom
- Auto-save on changes

### FeedbackLoop.tsx
- 6 rows x 5 columns matrix
- Expandable cells for longer lists
- Color coding by column (red for stop, green for start, etc.)
- Top 3 priorities extraction at bottom
- Quick-add buttons for common items

### DashboardReview.tsx
- Read-only display of business-dashboard data
- Visual comparison (target vs actual)
- Traffic light status indicators
- Rocks completion checklist
- Commentary/notes section

### SwotUpdate.tsx
- Show previous quarter SWOT as baseline
- Add/remove items with change tracking
- Visual diff showing what changed
- Save as new quarterly SWOT

### SprintRocks.tsx
- Select from initiatives or create new
- Drag to reorder priority
- Owner assignment dropdown
- "Done =" definition for each rock
- Link to initiative (optional)
- Maximum 5 rocks enforcement

---

## Testing Checklist

- [ ] Pre-work questionnaire saves correctly
- [ ] Dashboard data pulls accurately
- [ ] Action Replay items persist
- [ ] Feedback Loop matrix saves all cells
- [ ] Open Loops decisions update existing records
- [ ] Issues resolutions update existing records
- [ ] Assessment snapshot captures current state
- [ ] Roadmap stage confirmation works
- [ ] SWOT creates new quarterly analysis
- [ ] Confidence score saves
- [ ] Quarterly targets save and link to goals
- [ ] Initiative changes apply correctly
- [ ] Rocks save and appear on One Page Plan
- [ ] Personal commitments save
- [ ] Workshop completion triggers One Page Plan update
- [ ] PDF export generates correctly
- [ ] Coach can view client reviews

---

## Success Criteria

1. **Workshop completes in ~4 hours** - No unnecessary friction
2. **Data pre-populated** - Minimal manual entry
3. **One Page Plan updates** - Automatic reflection of workshop outputs
4. **Historical tracking** - Can compare quarter over quarter
5. **Coach visibility** - Coaches can review with clients
6. **Mobile pre-work** - Questionnaire works on mobile
7. **PDF export** - Shareable workshop summary

---

## Notes

- This feature builds on existing platform capabilities rather than duplicating them
- The quarterly review is the "connective tissue" between all strategic planning features
- Core IP: Action Replay and Feedback Loop Framework are Matt's proven tools
- Targets drive initiatives - this order is intentional and important
