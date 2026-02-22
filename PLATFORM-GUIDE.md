# Business Coaching Platform — Complete Feature Guide

> Every user-facing page, feature, and workflow documented for reference.

---

## Table of Contents

1. [Platform Overview](#1-platform-overview)
2. [Roles & Permissions](#2-roles--permissions)
3. [Public Pages](#3-public-pages)
4. [Authentication](#4-authentication)
5. [Client Dashboard](#5-client-dashboard)
6. [Business Dashboard (KPI Tracker)](#6-business-dashboard-kpi-tracker)
7. [Business Profile](#7-business-profile)
8. [Business Assessment](#8-business-assessment)
9. [Business Roadmap (Wisdom Roadmap)](#9-business-roadmap-wisdom-roadmap)
10. [Goals & Strategic Planning](#10-goals--strategic-planning)
11. [Financial Forecast](#11-financial-forecast)
12. [Monthly Report](#12-monthly-report)
13. [Quarterly Review](#13-quarterly-review)
14. [Coaching Sessions](#14-coaching-sessions)
15. [Team — Org Chart](#15-team--org-chart)
16. [Team — Accountability Chart](#16-team--accountability-chart)
17. [Team — Culture & Retention](#17-team--culture--retention)
18. [SWOT Analysis](#18-swot-analysis)
19. [Ideas Journal](#19-ideas-journal)
20. [Issues List, Open Loops, To-Do, Stop Doing](#20-issues-list-open-loops-to-do-stop-doing)
21. [One-Page Plan](#21-one-page-plan)
22. [Vision & Mission](#22-vision--mission)
23. [Messages](#23-messages)
24. [Documents](#24-documents)
25. [Settings & Integrations](#25-settings--integrations)
26. [Coach Portal](#26-coach-portal)
27. [Admin Portal](#27-admin-portal)
28. [Xero Integration (Technical)](#28-xero-integration-technical)

---

## 1. Platform Overview

The platform is a full-stack business coaching tool built on Next.js, Supabase, and Tailwind CSS. It serves three user types — **business owners** (clients), **coaches**, and **admins** — with role-based navigation, real-time data sync, and deep Xero accounting integration.

**Tech stack:** Next.js 13+ App Router, React, TypeScript, Supabase (auth + DB + real-time), Tailwind CSS, jsPDF, @dnd-kit, Claude AI.

---

## 2. Roles & Permissions

| Role | Access | Description |
|------|--------|-------------|
| `super_admin` | Full platform | Platform-level admin, sees all clients |
| `owner` | Full business | Business owner (primary client) |
| `coach` | Full business (assigned) | Sees only their assigned clients |
| `admin` | Full business | Business admin, same access as owner |
| `member` | Custom permissions | Team member, permissions set per section |
| `viewer` | Read-only | Cannot edit, all sections read-only |

### Permission Sections

Owners, admins, and coaches always have full access. Members get customisable access:

| Permission Key | Controls | Member Default |
|----------------|----------|----------------|
| `business_plan` | Roadmap, Vision, SWOT, Goals, One-Page Plan | On |
| `finances` | Forecast, Monthly Report, Cashflow | **Off** |
| `business_engines` | Marketing, Team, Systems sections | On |
| `execute_kpi` | KPI Dashboard | On |
| `execute_weekly_review` | Weekly Review | On |
| `execute_issues` | Issues List | On |
| `execute_ideas` | Ideas Journal | On |
| `execute_productivity` | Open Loops, To-Do, Stop Doing | On |
| `review_quarterly` | Quarterly Review | On |
| `coaching_messages` | Messages | On |
| `coaching_sessions` | Session Notes | On |

---

## 3. Public Pages

### Homepage (`/`)
Marketing landing page. Hero section, WISE Framework cards, feature overview, testimonials, and CTA buttons for sign-up.

### Privacy Policy (`/privacy`)
Legal document covering data collection, usage, sharing, security, and user rights (Australian compliance).

### Terms & Conditions (`/terms`)
Service usage terms including account requirements, coaching services, liability, and dispute resolution.

### Help & Support (`/help`)
FAQ sections with search, quick links to email support, coach messaging, and documentation.

---

## 4. Authentication

### Client Login (`/auth/login`)
- **What the user sees:** Email/password form with Google OAuth option and sign-up toggle.
- **Flow:** Enter credentials → Supabase authenticates → Redirect to `/dashboard`.

### Coach Login (`/coach/login`)
- **What the user sees:** Email/password form with coach-specific branding.
- **Flow:** Enter credentials → Verify coach role → Redirect to `/coach/dashboard`.

### Admin Login (`/admin/login`)
- **What the user sees:** Email/password form with admin branding.
- **Flow:** Enter credentials → Verify super_admin role → Redirect to `/admin`.

### Password Reset (`/auth/reset-password` → `/auth/update-password`)
- **Flow:** Enter email → Receive reset link → Click link → Set new password → Login.

---

## 5. Client Dashboard

**Route:** `/dashboard`

### What the User Sees
A personal command centre showing business health at a glance.

### Cards & Widgets

| Widget | Description |
|--------|-------------|
| **Insight Header** | AI-generated business insight (rotatable, refreshable) |
| **Annual Goals** | 3-year financial goals with days remaining and progress bar |
| **90-Day Goals** | Current quarter targets, days remaining, progress % |
| **Quarterly Rocks** | Key quarterly priorities with on-track/at-risk indicators |
| **Weekly Priorities** | This week's focus areas from sprint planning |
| **Coach Messages** | Unread count, last message preview, quick-open button |
| **Session Actions** | Actions from last coaching session with status |
| **Suggested Actions** | AI-recommended next steps based on current state |

### Workflow
1. User logs in → lands on dashboard
2. Reviews AI insight at top
3. Scans goal progress cards
4. Checks unread coach messages
5. Reviews pending session actions
6. Clicks any card to drill into that feature

### Empty State
If setup is incomplete, shows an onboarding checklist guiding the user through required steps.

---

## 6. Business Dashboard (KPI Tracker)

**Route:** `/business-dashboard`

### What the User Sees
A weekly metrics tracking spreadsheet for the current quarter or full year.

### Layout

**Quarter Progress Header:**
- Current week number and week ending date
- % of quarter complete
- Revenue / Gross Profit / Net Profit QTD with trends

**Metrics Table:**

| Section | Metrics |
|---------|---------|
| **Financial Goals** | Revenue, Gross Profit, Net Profit (annual target, quarterly target, QTD actual, weekly actuals) |
| **Core Business Metrics** | Leads/month, Conversion Rate %, Avg Transaction Value, Team Headcount, Owner Hours/Week |
| **Custom KPIs** | Any user-created KPIs with units (currency, %, number) |

### Workflow
1. Navigate to Business Dashboard
2. Toggle between "Current Quarter" and "Current Year" views
3. Enter this week's numbers in editable cells (Enter key advances to next input)
4. Current week is highlighted in orange
5. Past weeks are locked by default (unlock button available)
6. Trend indicators show on-track / at-risk / off-track
7. "Manage Metrics" button lets you toggle metric visibility and create custom KPIs

---

## 7. Business Profile

**Route:** `/business-profile`

### What the User Sees
Company information form and strategic initiatives summary.

### Fields
Business name, legal name, industry, owner details (name, email, phone), website, address, years in business, revenue, margins, team size, total customers, business model, products/services.

### Workflow
1. Fill in or update company details
2. Data auto-saves
3. Information is used across the platform (dashboards, coach views, reports)

---

## 8. Business Assessment

**Routes:** `/assessment`, `/assessment/results`, `/assessment/manage`, `/assessment/history`

### What the User Sees
A 30-question quiz across 8 Business Engines measuring business health.

### The 8 Business Engines
1. Attract (Marketing)
2. Convert (Sales)
3. Deliver (Operations)
4. People (Team)
5. Systems (Infrastructure)
6. Finance (Financial Management)
7. Leadership (Leadership Development)
8. Time (Personal Time Freedom)

### Workflow
1. Start assessment → answer 30 questions with progress tracking
2. Drafts auto-save to localStorage
3. Submit → view results page with score circles per engine
4. Results show health status, engine-specific metrics, recommendations
5. Compare assessments over time via `/assessment/history`
6. Manage/delete past assessments via `/assessment/manage`

---

## 9. Business Roadmap (Wisdom Roadmap)

**Route:** `/business-roadmap`

### What the User Sees
A visual roadmap of 5 business stages, each containing builds across the 8 engines.

### Stages (by Revenue)

| Stage | Revenue Range |
|-------|--------------|
| Foundation | $0–500K |
| Growth | $500K–2M |
| Scale | $2M–5M |
| Establish | $5M–10M |
| Mastery | $10M+ |

### Views

**Focus View:**
- Current stage with completion percentage
- Priority builds to complete (current stage + catch-up from below)
- Build cards with progress and links to relevant platform features

**Full View (Table):**
- 5 stages × 8 engines interactive grid
- Completion checkmarks per build
- Current stage highlighted in orange, completed stages in green

### Workflow
1. System calculates your stage from revenue
2. Focus View shows priority builds to work on
3. Click a build → modal shows checklist of specific items
4. Complete checklist items → progress updates
5. Each build links to the relevant platform feature (e.g. "Money in the Bank" → Financial Forecast)
6. Stage advancement triggers celebration messages

---

## 10. Goals & Strategic Planning

**Route:** `/goals` (5-step wizard)

### What the User Sees
A guided 5-step process for building a 3-year strategic roadmap.

### Steps

**Step 1 — 3-Year Goals & KPIs**
- Set revenue targets for years 1, 2, and 3
- Choose FY or CY planning
- Define core metrics: leads/month, conversion rate, avg transaction value, headcount, owner hours
- Create custom KPIs
- SWOT insights displayed inline

**Step 2 — Strategic Ideas**
- Capture ideas organised by business engine (8 categories)
- Unlimited idea capture with auto-save

**Step 3 — Prioritise Initiatives**
- Select 8–20 initiatives from captured ideas
- Drag-and-drop prioritisation
- Mark as quick wins vs strategic bets

**Step 4 — Annual Plan**
- Distribute initiatives across Q1–Q4
- Set quarterly revenue targets
- Past/current quarters are locked

**Step 5 — 90-Day Sprint**
- Focus on the next quarter
- Add sprint initiatives and operational activities
- Assign ownership and accountability

### Features
- Auto-save with cloud sync indicator
- Step validation prevents advancing without minimum data
- Coaching tips with key questions at each step
- Progress tracking (% complete per step)

---

## 11. Financial Forecast

**Route:** `/finances/forecast`

### What the User Sees

**Welcome Screen (new forecast):**
- "Start Forecast Builder" button to launch the AI-guided wizard
- "Build manually" alternative

**Main Interface (3 tabs):**

#### P&L Forecast Tab (Default)
Interactive table showing:
- Account names grouped by section (Revenue, COGS, Operating Expenses, Other)
- Baseline actuals (prior fiscal year)
- YTD actuals (current year from Xero)
- Forecast months (remaining months)
- Calculated columns: FY Total, % Revenue, Avg/Mo, Forecast Method

**Key actions:**
- Click any cell to edit values inline
- Lock/unlock historical data columns
- View mode vs Setup mode toggle
- Undo/Redo (Ctrl+Z / Ctrl+Y) with 50-state history
- Bulk OpEx adjustments (% increase across all lines)
- Save (Ctrl+S) with last-saved timestamp and unsaved-changes indicator

#### Assumptions Tab
Read-only summary of all forecast assumptions:
- **Goals:** 3-year revenue and profit margin targets
- **Revenue:** Each account with prior year, growth rate, forecast
- **COGS:** Variable/fixed costs with rates
- **Team:** Existing employees (salary, increases, super cost) and planned hires
- **OpEx:** All accounts grouped by cost behaviour (fixed, variable, adhoc, seasonal)
- **Subscriptions Audit:** 4-category vendor breakdown (Essential, Review, Reduce, Cancel)
- **CapEx:** Equipment/assets with amount and month

Each section has an "Edit" button that opens the wizard at that step.

#### Versions Tab
- Save current forecast as a named version
- Load/restore previous versions
- Overwrite existing versions

### Forecast Wizard (10 Steps)

| Step | What You Do |
|------|-------------|
| 1. Goals | Set 3-year revenue, gross profit %, net profit % targets |
| 2. Prior Year | Load actuals from Xero, adjust if needed |
| 3. Revenue & COGS | Set growth type (% or $) per revenue line; COGS as variable/fixed |
| 4. Team | Add existing staff with salary increases; add planned hires with start months; set super/WorkCover/payroll tax rates |
| 5. Operating Expenses | Choose cost behaviour per line (fixed/variable/adhoc/seasonal) |
| 6. Subscriptions | Categorise vendors (Essential/Review/Reduce/Cancel); see annual spend and savings |
| 7. CapEx | Add equipment/asset purchases with timing |
| 8. Growth Plan | Review 3-year trajectory, adjust annual growth rates |
| 9. Review | Summary of all assumptions with edit links; "Generate Forecast" button |

**AI CFO Assistant:** Side panel with Claude AI offering suggestions and answering questions throughout the wizard.

### Xero Integration
- "Connect Xero" panel shows auth status and sync buttons
- Auto-syncs P&L data on connection
- CSV import as alternative to Xero

---

## 12. Monthly Report

**Route:** `/finances/monthly-report`

### What the User Sees

A comprehensive Budget vs Actual reporting tool with 8 tabs.

### Tabs

#### 1. Budget vs Actual Report (Default)
- Month selector dropdown
- Summary cards: Total Revenue, Expenses, Gross Profit, Net Profit vs Budget
- Section-by-section breakdown with variance highlighting (green = favourable, red = unfavourable)
- AI-generated commentary for expenses over budget ($500+ variance)
- Editable coach notes per line
- Reconciliation gate showing unreconciled accounts

#### 2. Full Year
- Complete 12-month projection table with all accounts
- Actual values + variance per month
- YTD and Full Year totals

#### 3. Trends
- Revenue, expense, gross profit, net profit trend charts across 12 months
- Margin % trends

#### 4. Charts (Configurable)
Grid of financial analysis charts:

| Category | Charts |
|----------|--------|
| **P&L Analysis** | Revenue Breakdown, Budget Burn Rate, Revenue vs Expenses Trend, Break-Even Analysis, Variance Heatmap, Expense Waterfall |
| **Cashflow** | Cash Runway, Cumulative Net Cash, Working Capital Gap |
| **People** | Team Cost %, Cost Per Employee |
| **Subscriptions** | Subscription Creep |

#### 5. Subscriptions
Vendor list with monthly cost, frequency, categorisation, last transaction date, cumulative annual spend.

#### 6. Wages
Payroll breakdown: employee names, gross salary, super, taxes, net pay, variance from forecast, YTD summary.

#### 7. Cashflow
Cashflow forecast with table and chart views. Shows opening/closing bank balance, cash from operations, tax payments, CapEx, loan repayments, working capital changes. Configurable DSO, DPO, GST frequency.

#### 8. Account Mapping
Maps Xero accounts to report categories. Auto-map button uses AI classification. Badge shows when unmapped accounts need attention.

### Top Bar Actions
- Month selector
- Settings (configure visible sections, link forecast, map accounts)
- Layout Editor (drag-drop widget placement for PDF)
- Save Draft / Finalise / Export PDF

### Report Generation Flow
1. Select month → 2. System loads Xero actuals → 3. Click "Generate Report" → 4. Variance calculated against budget → 5. AI commentary auto-generated → 6. Edit notes → 7. Save draft or export PDF → 8. After reconciliation, "Finalise" locks the report.

### PDF Export
- Modular layout editor with drag-drop sections
- Sections: Executive summary, budget detail, YTD, subscriptions, wages, cashflow, charts
- Professional styling with branding, colour coding, page breaks

---

## 13. Quarterly Review

**Routes:** `/quarterly-review`, `/quarterly-review/workshop`, `/quarterly-review/summary/[id]`, `/quarterly-review/history`

### What the User Sees
A structured 14-step workshop process for quarterly business review.

### Workshop Structure

| Part | Steps | Focus |
|------|-------|-------|
| **Pre-Work** | 1 step | Self-assessment questions |
| **Part 1: Reflection** | 2 steps | Review last quarter's metrics and action items |
| **Part 2: Analysis** | 3 steps | Feedback loop, open loops, issues list |
| **Part 3: Strategic Review** | 4 steps | Assessment snapshot, roadmap progress, SWOT update, confidence check |
| **Part 4: Planning** | 4 steps | Quarterly reset, sprint planning, completion |

### Workflow
1. Start new review or continue in-progress
2. Work through 14 steps sequentially (can jump between)
3. Progress bar shows % complete
4. Submit final review → generates summary
5. View summary at `/quarterly-review/summary/[id]`
6. Compare past reviews via `/quarterly-review/history`

---

## 14. Coaching Sessions

**Routes:** `/sessions` (list), `/sessions/[id]` (detail)

### What the User Sees

**Sessions List:**
- Sessions grouped by date (Today, Yesterday, etc.)
- Status badges (Active, Completed)
- Duration, client rating (1–5 stars), transcript indicator

**Session Detail:**
- Date and status
- Takeaways and notes fields
- 1–5 star rating
- Written feedback for coach
- Action items: add with description and due date, mark complete, track status (pending/completed/missed/carried over)
- Auto-save with manual save backup

### Workflow
1. Coach starts a session (or client opens existing)
2. Discussion points captured during session
3. Action items created with due dates
4. Client rates the session and adds feedback
5. Actions carry forward to next session if incomplete

---

## 15. Team — Org Chart

**Route:** `/team/org-chart`

### What the User Sees
A full interactive org chart builder with drag-and-drop, versioning, and PDF export.

### Features

**Three View Modes:**
- **Detailed:** Name, title, department badge, employment type, Planned/Assistant badges, direct report count, collapse/expand
- **Compact:** Name and title only with collapse toggle
- **Photo:** Large avatar with badges

**Person Management (floating detail panel):**
- Name, job title, department, employment type
- Start date, annual salary
- Hours per week with auto-calculated FTE (38hr standard week)
- Assistant Role toggle (positions to the side of manager with dashed connector)
- Vacant/Planned Role toggle with optional planned hire date
- Coach notes

**Canvas Interactions:**
- Drag-and-drop reparenting (prevents circular hierarchies)
- Zoom (25%–200%) with Ctrl+scroll and +/- buttons
- Auto-fit zoom when content grows beyond viewport
- Pan by clicking and dragging empty space
- Double-click empty space to fit-to-screen
- Search by name/title/department
- Department filter

**Versions:**
- Create future org scenarios (e.g. "FY27", "Q2 2026")
- Switch between versions via dropdown
- Version comparison badges: green (new), amber (modified), red (removed)
- Non-destructive scenario planning

**Templates:**
- Owner-Operator (3 roles), Small Team (8 roles), Growth Stage (14 roles)
- Apply as new version or merge into current
- Templates include EA assistant roles

**Analytics Bar (collapsible):**
- Headcount (filled + planned), Total FTE, Total cost, Cost/FTE
- Span of control (min–max, average)
- Org depth (levels)
- Department breakdown bar chart

**PDF Export:**
- Configurable options: headcount, salaries, department tags, employment type, planned/vacant, assistant badges
- Professional layout with header/footer and analytics

**Keyboard Shortcuts:**
- Ctrl+Z / Cmd+Z: Undo | Ctrl+Y / Cmd+Shift+Z: Redo
- Escape: Deselect | Delete: Remove selected person

### Workflow
1. Start from empty state → quick-start or apply template
2. Click nodes to open floating detail panel → edit person info
3. Hover node → click "+" to add direct report
4. Drag nodes to reparent
5. Toggle "Assistant Role" to position EAs to the side
6. Create versions for future planning
7. Export PDF with chosen tags and analytics

---

## 16. Team — Accountability Chart

**Route:** `/team/accountability`

### What the User Sees
A table mapping 6 core business functions to people, responsibilities, and success metrics.

### Functions
1. Sales & Business Development
2. Marketing & Lead Generation
3. Operations & Delivery
4. Finance & Administration
5. Customer Success
6. Leadership & Strategy

### Columns
| Column | Description |
|--------|-------------|
| Function/Role | Pre-defined label (read-only) |
| Person Responsible | Text input — who owns this function |
| Key Responsibilities | Text input — main duties |
| Success Metric | Text input — KPI or measure |

### Workflow
1. Fill in who is responsible for each function
2. Define their key responsibilities and success metrics
3. Auto-saves every 2 seconds
4. "Continue" button navigates to Culture & Retention

---

## 17. Team — Culture & Retention

**Route:** `/team/hiring-roadmap`

### What the User Sees
Six text sections for defining team culture and retention strategy.

### Sections

| Section | Prompt |
|---------|--------|
| **Core Values** | What values define your team? |
| **Team Rituals & Rhythms** | Regular practices that build connection |
| **Recognition & Rewards** | How will you recognise great performance? |
| **Growth & Development** | What development opportunities will you offer? |
| **Work Environment** | What kind of workplace will you create? |
| **Compensation Strategy** | How will you structure pay and benefits? |

### Workflow
1. Fill in each section with your team culture vision
2. Auto-saves every 2 seconds
3. "Save & Return" goes back to dashboard

---

## 18. SWOT Analysis

**Routes:** `/swot`, `/swot/[id]`, `/swot/compare`, `/swot/history`

### What the User Sees
A SWOT matrix (Strengths, Weaknesses, Opportunities, Threats) for strategic analysis.

### Workflow
1. Create a new SWOT analysis
2. Fill in each quadrant
3. Save → view at `/swot/[id]`
4. Compare multiple SWOTs over time via `/swot/compare`
5. Track evolution via `/swot/history`

---

## 19. Ideas Journal

**Routes:** `/ideas`, `/ideas/[id]/evaluate`

### What the User Sees
A capture-and-evaluate tool for strategic ideas.

### Workflow
1. Add ideas as they come up
2. Categorise by business engine
3. Evaluate each idea at `/ideas/[id]/evaluate` with scoring criteria
4. Prioritised ideas feed into the Goals wizard (Step 3)

---

## 20. Issues List, Open Loops, To-Do, Stop Doing

### Issues List (`/issues-list`)
Track and resolve business issues. List view with status tracking and resolution notes.

### Open Loops (`/open-loops`)
Unresolved action items and pending decisions. Keeps accountability visible.

### To-Do (`/todo`)
Personal task management. Add, complete, and organise tasks.

### Stop Doing (`/stop-doing`)
Items to eliminate from operations. Tracks what you've committed to stopping.

---

## 21. One-Page Plan

**Route:** `/one-page-plan`

### What the User Sees
A single-page strategic plan template pulling together vision, goals, quarterly rocks, and key metrics into one reference document.

---

## 22. Vision & Mission

**Route:** `/vision-mission`

### What the User Sees
Editor for defining company vision statement, mission statement, and core values.

---

## 23. Messages

**Route:** `/messages` (client), `/coach/messages` (coach)

### What the User Sees
Real-time messaging interface with conversation list and message thread. Supabase real-time subscriptions for instant delivery.

### Workflow
1. Select conversation from list
2. Type and send messages
3. Real-time delivery and read receipts
4. Unread count badges in navigation

---

## 24. Documents

**Route:** `/client/documents`

### What the User Sees
File browser with folder filtering, file type icons, upload capability, and metadata (name, folder, upload date, created by).

---

## 25. Settings & Integrations

### Settings Hub (`/settings`)
Tabs: Profile, Team, Integrations.

### Account Settings (`/settings/account`)
Profile, email, password updates.

### Notification Preferences (`/settings/notifications`)
Toggle notification settings.

### Team Management (`/settings/team`)
Invite members, set roles and permissions.

### Xero Integration (`/dashboard/integrations/xero`)
- Connect Xero via OAuth flow
- Select business/tenant
- Sync button for manual data refresh
- Connection status indicator

---

## 26. Coach Portal

### Coach Dashboard (`/coach/dashboard`)

**Stats Cards:** Active Clients, Pending Actions, Sessions This Week, Unread Messages.

**Clients Needing Attention:** Flags clients that are at-risk, scored below 50%, or inactive 14+ days.

**Client Overview Table:** All assigned clients with business name, status, last activity, assessment score, business stage, open loops/issues count.

**Quick Actions:** Add Client, Schedule Session, Messages, Reports.

### Client List (`/coach/clients`)
- Grid or list view with search, status filter, industry filter
- Unassigned clients alert (coaches can claim)
- Pending invitations alert

### Client Profile (`/coach/clients/[id]`)
11 tabs: Overview, Profile, Team, Weekly Reviews, Goals, Financials, Actions, Documents, Messages, Private Notes, Activity Log.

**Overview tab** shows: business summary, health score, goals progress, pending actions, recent activity feed.

### Coach View Mode (`/coach/clients/[id]/view/[...path]`)
Allows coaches to see the full client interface (every client page) from the coach perspective. Orange "Coach View" banner. Full sidebar navigation matching the client experience.

### Client Onboarding (`/coach/clients/new`)
4-step wizard:
1. **Basic Info:** Business name, industry, owner details
2. **Program Setup:** Program type (1:1, group, CFO services), session frequency, start date
3. **Module Selection:** Full access or custom per-section
4. **Team Members:** Add additional team members with roles

### Other Coach Pages

| Route | Purpose |
|-------|---------|
| `/coach/clients/[id]/forecast` | View/edit client's financial forecast |
| `/coach/clients/[id]/goals` | Coach-guided strategic planning |
| `/coach/sessions` | All coaching sessions with stats |
| `/coach/sessions/[id]` | Session detail with notes, actions, feedback |
| `/coach/actions` | Aggregate action items across all clients |
| `/coach/schedule` | Calendar view with session scheduling |
| `/coach/analytics` | Coaching impact and engagement metrics |
| `/coach/reports` | Performance reports with export |
| `/coach/ai-insights` | Review AI suggestions and manage benchmarks |
| `/coach/settings` | Profile, notifications, calendar, templates, question bank |

---

## 27. Admin Portal

| Route | Purpose |
|-------|---------|
| `/admin` | Dashboard with stats, alerts, quick actions |
| `/admin/coaches` | Manage coaching staff |
| `/admin/users` | Manage user accounts and roles |
| `/admin/clients` | Manage client onboarding and assignments |
| `/admin/clients/new` | Create new client accounts |
| `/admin/activity` | System activity and audit log |

---

## 28. Xero Integration (Technical)

The platform deeply integrates with Xero as the source of truth for financial data.

### Connection Flow
1. User clicks "Connect Xero" → OAuth 2.0 flow initiated
2. User authorises in Xero → callback stores encrypted tokens
3. Initial sync: current month P&L + bank balances
4. Daily cron job (`/api/Xero/sync-all`) syncs 24 months of P&L at 2am

### What Gets Synced

| Data | Endpoint | Frequency |
|------|----------|-----------|
| P&L by month (24 months) | `/api/Xero/sync-all` | Daily (cron) |
| Chart of accounts | `/api/Xero/chart-of-accounts` | On demand |
| Subscription transactions | `/api/Xero/subscription-transactions` | On demand (wizard) |
| Forecast P&L actuals | `/api/Xero/sync-forecast` | Manual sync button |
| Bank reconciliation status | `/api/Xero/reconciliation` | On demand |

### Subscription Analysis Engine
Deep vendor analysis from Xero invoices and bank transactions:
- Vendor extraction and normalisation
- Frequency detection (monthly/quarterly/annual/ad-hoc)
- Confidence scoring
- Prior FY vs Current FY comparison
- Reconciliation against Xero P&L totals

---

## Navigation Structure (Sidebar)

### Client Sidebar

```
HOME
  Command Centre (/dashboard)

SETUP
  Business Profile (/business-profile)
  Assessment (/assessment)

BUSINESS PLAN [permission: business_plan]
  Roadmap (/business-roadmap)
  Vision, Mission & Values (/vision-mission)
  SWOT Analysis (/swot)
  Goals & Targets (/goals)
  One-Page Plan (/one-page-plan)

FINANCES [permission: finances]
  Financial Forecast (/finances/forecast)
  Monthly Report (/finances/monthly-report)
  Cashflow Forecast (/finances/cashflow)

EXECUTE
  KPI Dashboard (/business-dashboard) [permission: execute_kpi]
  Weekly Review (/reviews/weekly) [permission: execute_weekly_review]
  Issues List (/issues-list) [permission: execute_issues]
  Ideas Journal (/ideas) [permission: execute_ideas]
  Productivity [permission: execute_productivity]
    Open Loops (/open-loops)
    To-Do (/todo)
    Stop Doing (/stop-doing)

BUSINESS ENGINES [permission: business_engines]
  Marketing
    Value Proposition (/marketing/value-prop)
    Marketing Channels (coming soon)
    Content Planner (coming soon)
  Team
    Accountability Chart (/team/accountability)
    Org Chart Builder (/team/org-chart)
    Team Performance (coming soon)
    Culture & Retention (/team/hiring-roadmap)
  Systems
    Systems & Processes (coming soon)

REVIEW
  Quarterly Review (/quarterly-review) [permission: review_quarterly]

COACHING
  Messages (/messages) [permission: coaching_messages]
  Session Notes (/sessions) [permission: coaching_sessions]
```

### Coach Sidebar (Additional)
```
COACH TOOLS
  Coach Notes (/coach/notes)
  Client Overview (/coach/clients)
  Engagement Tracking (/coach/engagement)
  Client Questions (/coach/questions)
```

---

## Page Count Summary

| Category | Count |
|----------|-------|
| Public / Marketing | 4 |
| Authentication | 5 |
| Client pages | ~55 |
| Coach pages | ~17 |
| Admin pages | 7 |
| **Total** | **~88** |

---

*Generated 23 Feb 2026*
