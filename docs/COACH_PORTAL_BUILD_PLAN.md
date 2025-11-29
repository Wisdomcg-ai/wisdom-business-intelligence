# Coach Portal Major Redesign - Build Plan

## Vision
Transform the coach experience into a world-class command center inspired by HubSpot, Salesforce, Simply.Coach, and CoachVantage - while keeping the client experience focused and warm.

## Design Decisions
- **Colors**: Indigo/Slate for coach (professional) + Teal for client (warm)
- **Sidebar**: Always visible with icons + labels
- **Coach Landing**: Split view - Dashboard stats + Client list

---

## Phase 1: Foundation & Layout System

### 1.1 Create Shared Layout Components
- [ ] `CoachLayout.tsx` - Dark indigo/slate sidebar, professional header
- [ ] `ClientLayout.tsx` - Light teal-accented layout, warm feel
- [ ] `CoachSidebar.tsx` - Fixed sidebar with navigation sections
- [ ] `CoachHeader.tsx` - Top bar with search, notifications, profile

### 1.2 Design System Updates
- [ ] Define coach color palette (indigo-900, slate-800, etc.)
- [ ] Define client color palette (teal-600, warm neutrals)
- [ ] Create shared icon set and sizing standards
- [ ] Typography scale for both portals

### 1.3 Route Structure
```
/coach                    → Redirects to /coach/dashboard
/coach/dashboard          → Command center (stats + client list)
/coach/clients            → Full client list view
/coach/clients/[id]       → Individual client file (tabs)
/coach/clients/new        → Client onboarding wizard
/coach/schedule           → Calendar/sessions view
/coach/messages           → Unified inbox
/coach/actions            → All pending actions
/coach/reports            → Analytics & reports
/coach/settings           → Coach preferences & templates
```

---

## Phase 2: Coach Command Center (Dashboard)

### 2.1 Dashboard Stats Row (Top)
- [ ] Active Clients count with trend
- [ ] Sessions This Week with calendar preview
- [ ] Pending Actions with urgency indicator
- [ ] Unread Messages badge

### 2.2 Today's Schedule Panel
- [ ] List of today's sessions
- [ ] Quick join/start session buttons
- [ ] Next session countdown
- [ ] Prep checklist status

### 2.3 Client Quick List Panel
- [ ] Searchable client list
- [ ] Status indicators (active/pending/at-risk)
- [ ] Last session date
- [ ] Quick action buttons (message, schedule, view)

### 2.4 Activity Feed
- [ ] Recent client activity
- [ ] Completed actions
- [ ] New messages
- [ ] System notifications

---

## Phase 3: Client Management

### 3.1 Client List Page (`/coach/clients`)
- [ ] Table/card view toggle
- [ ] Advanced filters (status, program, industry)
- [ ] Bulk actions (send message, assign action)
- [ ] Sort options (name, last session, health score)
- [ ] Export functionality

### 3.2 Individual Client File (`/coach/clients/[id]`)
Tabbed interface with:

**Overview Tab**
- [ ] Client health score card
- [ ] Key metrics summary
- [ ] Recent activity timeline
- [ ] Quick actions bar

**Profile Tab**
- [ ] Full business profile (editable by coach)
- [ ] Contact information
- [ ] Program details
- [ ] Engagement history

**Sessions Tab**
- [ ] Session history list
- [ ] Session notes (coach private + shared)
- [ ] Upcoming sessions
- [ ] Schedule new session

**Goals & Planning Tab**
- [ ] Strategic goals overview
- [ ] KPIs tracking
- [ ] Annual plan progress
- [ ] Quarterly review status

**Financials Tab**
- [ ] Forecast summary (if enabled)
- [ ] Key financial metrics
- [ ] Xero connection status

**Actions Tab**
- [ ] All action items for this client
- [ ] Create new action
- [ ] Mark complete
- [ ] Overdue alerts

**Documents Tab**
- [ ] Shared documents
- [ ] Upload new document
- [ ] Document categories
- [ ] Version history

**Notes Tab**
- [ ] Private coach notes
- [ ] Session prep notes
- [ ] Client insights

**Messages Tab**
- [ ] Chat history with client
- [ ] Q&A thread

---

## Phase 4: Client Onboarding Wizard

### 4.1 Wizard Steps (`/coach/clients/new`)

**Step 1: Basic Information**
- [ ] Business name
- [ ] Industry selection
- [ ] Owner name & email
- [ ] Phone number
- [ ] Website (optional)

**Step 2: Program Setup**
- [ ] Program type (Executive, Growth, Startup, etc.)
- [ ] Session frequency (weekly, fortnightly, monthly)
- [ ] Engagement start date
- [ ] Contract length

**Step 3: Module Selection**
- [ ] Toggle modules: Goals, Forecast, Chat, Documents
- [ ] Set initial access permissions
- [ ] Configure client portal features

**Step 4: Intake Questions**
- [ ] Select from question templates
- [ ] Add custom questions
- [ ] Set required vs optional
- [ ] Preview intake form

**Step 5: Initial Assessment**
- [ ] Business health assessment
- [ ] SWOT quick capture
- [ ] Top 3 challenges
- [ ] Top 3 opportunities

**Step 6: First Session Prep**
- [ ] Set first session date/time
- [ ] Select agenda template
- [ ] Prepare welcome materials
- [ ] Send client invite email

### 4.2 Post-Onboarding
- [ ] Client receives welcome email
- [ ] Client portal access created
- [ ] Intake form sent automatically
- [ ] First session in calendar

---

## Phase 5: Schedule & Sessions

### 5.1 Calendar View (`/coach/schedule`)
- [ ] Monthly/weekly/daily views
- [ ] All clients' sessions
- [ ] Color-coded by client/program
- [ ] Drag-and-drop rescheduling
- [ ] Availability slots management

### 5.2 Session Management
- [ ] Session templates library
- [ ] Pre-session prep checklist
- [ ] In-session note taking
- [ ] Post-session action creation
- [ ] Session summary generator

---

## Phase 6: Messages & Communication

### 6.1 Unified Inbox (`/coach/messages`)
- [ ] All client conversations
- [ ] Unread filter
- [ ] Search messages
- [ ] Quick reply
- [ ] Mark as follow-up

### 6.2 Broadcast Feature
- [ ] Send message to multiple clients
- [ ] Template messages
- [ ] Schedule send
- [ ] Track open/read status

### 6.3 Q&A Queue
- [ ] Client questions awaiting response
- [ ] Priority queue
- [ ] Response templates
- [ ] Knowledge base integration

---

## Phase 7: Actions & Tasks

### 7.1 Actions Dashboard (`/coach/actions`)
- [ ] All pending actions across clients
- [ ] Filter by client, due date, priority
- [ ] Overdue alerts prominent
- [ ] Bulk complete/reassign

### 7.2 Action Templates
- [ ] Common action templates
- [ ] Quick-add from templates
- [ ] Recurring actions
- [ ] Action categories

---

## Phase 8: Reports & Analytics

### 8.1 Coach Performance
- [ ] Sessions completed this month
- [ ] Client retention rate
- [ ] Average session rating
- [ ] Response time metrics

### 8.2 Client Progress Reports
- [ ] Individual client progress
- [ ] Goal completion rates
- [ ] Financial improvement trends
- [ ] Engagement metrics

### 8.3 Export & Share
- [ ] PDF report generation
- [ ] Email reports to clients
- [ ] Executive summary for stakeholders

---

## Phase 9: Settings & Configuration

### 9.1 Coach Settings (`/coach/settings`)
- [ ] Profile & preferences
- [ ] Notification settings
- [ ] Calendar integration (Google, Outlook)
- [ ] Default session length

### 9.2 Templates Library
- [ ] Session agenda templates
- [ ] Action item templates
- [ ] Email templates
- [ ] Intake form templates

### 9.3 Question Bank
- [ ] Coaching questions library
- [ ] Categorized by topic
- [ ] Add/edit/delete questions
- [ ] Assign to intake forms

---

## Phase 10: Client Portal Redesign

### 10.1 Client Dashboard
- [ ] Warm, welcoming design
- [ ] Next session countdown
- [ ] Pending actions
- [ ] Recent coach messages
- [ ] Quick access to tools

### 10.2 Simplified Navigation
- [ ] Dashboard (home)
- [ ] My Business (profile)
- [ ] Goals & Planning
- [ ] Financials
- [ ] Sessions
- [ ] Actions
- [ ] Documents
- [ ] Messages

### 10.3 Coach Visibility
- [ ] "Your Coach" card with contact
- [ ] Request session feature
- [ ] Ask question feature

---

## Database Schema Updates Required

### New Tables
```sql
-- Coach questions bank
CREATE TABLE coach_questions (
  id UUID PRIMARY KEY,
  coach_id UUID REFERENCES auth.users,
  category TEXT,
  question TEXT,
  is_template BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ
);

-- Intake form templates
CREATE TABLE intake_templates (
  id UUID PRIMARY KEY,
  coach_id UUID REFERENCES auth.users,
  name TEXT,
  description TEXT,
  questions JSONB,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ
);

-- Client intake responses
CREATE TABLE intake_responses (
  id UUID PRIMARY KEY,
  business_id UUID REFERENCES businesses,
  template_id UUID REFERENCES intake_templates,
  responses JSONB,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
);

-- Session templates
CREATE TABLE session_templates (
  id UUID PRIMARY KEY,
  coach_id UUID REFERENCES auth.users,
  name TEXT,
  agenda JSONB,
  duration_minutes INTEGER,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ
);

-- Coach notes (private)
CREATE TABLE coach_notes (
  id UUID PRIMARY KEY,
  coach_id UUID REFERENCES auth.users,
  business_id UUID REFERENCES businesses,
  session_id UUID REFERENCES coaching_sessions,
  content TEXT,
  is_private BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

-- Broadcast messages
CREATE TABLE broadcast_messages (
  id UUID PRIMARY KEY,
  coach_id UUID REFERENCES auth.users,
  subject TEXT,
  content TEXT,
  recipients JSONB,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
);
```

### Table Modifications
```sql
-- Add to businesses table
ALTER TABLE businesses ADD COLUMN health_score INTEGER DEFAULT 50;
ALTER TABLE businesses ADD COLUMN last_session_date TIMESTAMPTZ;
ALTER TABLE businesses ADD COLUMN onboarding_completed BOOLEAN DEFAULT false;
ALTER TABLE businesses ADD COLUMN intake_completed BOOLEAN DEFAULT false;

-- Add to coaching_sessions table
ALTER TABLE coaching_sessions ADD COLUMN template_id UUID REFERENCES session_templates;
ALTER TABLE coaching_sessions ADD COLUMN prep_completed BOOLEAN DEFAULT false;
ALTER TABLE coaching_sessions ADD COLUMN rating INTEGER;
```

---

## Implementation Order

### Week 1: Foundation
1. Create CoachLayout and ClientLayout components
2. Set up new route structure
3. Implement CoachSidebar navigation
4. Create base dashboard skeleton

### Week 2: Dashboard & Client List
1. Build coach dashboard with stats
2. Create client list with filters
3. Implement search functionality
4. Add quick actions

### Week 3: Client File
1. Build tabbed client file interface
2. Implement Overview tab
3. Implement Profile tab (editable)
4. Implement Sessions tab

### Week 4: Client File (continued)
1. Implement Goals tab
2. Implement Actions tab
3. Implement Documents tab
4. Implement Notes tab

### Week 5: Onboarding Wizard
1. Build wizard framework
2. Implement all 6 steps
3. Create welcome email flow
4. Test end-to-end onboarding

### Week 6: Communication
1. Build messages inbox
2. Implement Q&A queue
3. Add broadcast feature
4. Create notification system

### Week 7: Schedule & Actions
1. Build calendar view
2. Implement session management
3. Build actions dashboard
4. Add bulk operations

### Week 8: Reports & Polish
1. Build reports dashboard
2. Create PDF export
3. Polish UI/UX
4. Performance optimization

### Week 9: Client Portal
1. Redesign client dashboard
2. Implement simplified navigation
3. Add coach visibility features
4. Test client experience

### Week 10: Testing & Launch
1. End-to-end testing
2. Bug fixes
3. Documentation
4. Production deployment

---

## Files to Create/Modify

### New Files (Coach Portal)
```
src/components/layouts/
  CoachLayout.tsx
  ClientLayout.tsx
  CoachSidebar.tsx
  CoachHeader.tsx

src/app/coach/
  layout.tsx (use CoachLayout)
  dashboard/page.tsx (command center)
  clients/page.tsx (client list)
  clients/new/page.tsx (onboarding wizard)
  clients/[id]/page.tsx (client file with tabs)
  schedule/page.tsx (calendar)
  messages/page.tsx (inbox)
  actions/page.tsx (all actions)
  reports/page.tsx (analytics)
  settings/page.tsx (preferences)

src/components/coach/
  DashboardStats.tsx
  TodaySchedule.tsx
  ClientQuickList.tsx
  ActivityFeed.tsx
  ClientCard.tsx
  ClientFileTabs.tsx
  OnboardingWizard.tsx
  SessionManager.tsx
  ActionsList.tsx
  MessageThread.tsx
```

### New Files (Client Portal)
```
src/app/(client)/
  layout.tsx (use ClientLayout)
  dashboard/page.tsx
  ... (other client routes)

src/components/client/
  ClientDashboard.tsx
  CoachCard.tsx
  UpcomingSession.tsx
```

### API Routes
```
src/app/api/coach/
  stats/route.ts
  clients/route.ts
  clients/[id]/route.ts
  onboarding/route.ts
  sessions/route.ts
  messages/route.ts
  actions/route.ts
  reports/route.ts
```

---

## Success Metrics

- [ ] Coach can onboard a new client in < 5 minutes
- [ ] All client information accessible within 2 clicks
- [ ] Dashboard loads in < 2 seconds
- [ ] Client can see their coach and request help easily
- [ ] Coach can message multiple clients at once
- [ ] Session prep takes < 2 minutes with templates
- [ ] Clear visual distinction between coach and client portals

---

## Ready to Build

This plan is now ready for implementation. We'll start with Phase 1: Foundation & Layout System.

**Next Steps:**
1. Review and approve this plan
2. Begin with CoachLayout.tsx
3. Iterate based on feedback

---

*Last Updated: November 2024*
*Version: 1.0*
