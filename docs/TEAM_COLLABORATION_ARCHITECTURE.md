# Team Collaboration & Multi-User Architecture

## Overview

This document outlines the architecture for multi-user collaboration, change tracking, weekly reports, and role-based access control (RBAC) for the WisdomBI business coaching platform.

---

## 1. Role-Based Access Control (RBAC)

### 1.1 User Roles

| Role | Description | Typical User |
|------|-------------|--------------|
| **Owner** | Full access, billing, can delete business | Business founder/CEO |
| **Admin** | Full access except billing/deletion | Operations manager, co-founder |
| **Coach** | View all, edit coach notes, view all reports | Assigned business coach |
| **Member** | Access based on permissions, submit own reports | Team leads, managers |
| **Viewer** | Read-only access based on permissions | Stakeholders, advisors |

### 1.2 Permission Matrix

| Feature | Owner | Admin | Coach | Member | Viewer |
|---------|-------|-------|-------|--------|--------|
| View all data | ✅ | ✅ | ✅ | Per permissions | Per permissions |
| Edit business data | ✅ | ✅ | ✅ | Per permissions | ❌ |
| View all weekly reports | ✅ | ✅ | ✅ | Own only | ❌ |
| Submit weekly report | ✅ | ✅ | ❌ | ✅ | ❌ |
| Manage team members | ✅ | ✅ | ❌ | ❌ | ❌ |
| View audit log | ✅ | ✅ | ✅ | ❌ | ❌ |
| Billing & subscription | ✅ | ❌ | ❌ | ❌ | ❌ |
| Delete business | ✅ | ❌ | ❌ | ❌ | ❌ |

### 1.3 Section Permissions (for Members/Viewers)

Simplified permission groups:

```typescript
interface SectionPermissions {
  // All-or-nothing groups
  business_plan: boolean      // Roadmap, VMV, SWOT, Goals, One-Page Plan
  finances: boolean           // Forecast, Budget, Cashflow
  business_engines: boolean   // Marketing, Team, Systems (all sub-items)

  // Individual toggles - Execute section
  execute_kpi: boolean        // KPI Dashboard
  execute_weekly_review: boolean  // Weekly Review
  execute_issues: boolean     // Issues List
  execute_ideas: boolean      // Ideas Journal
  execute_productivity: boolean   // Open Loops, To-Do, Stop Doing

  // Individual toggles - Other
  review_quarterly: boolean   // Quarterly Review
  coaching_messages: boolean  // Messages
  coaching_sessions: boolean  // Session Notes
}
```

---

## 2. Database Schema

### 2.1 Core Tables

```sql
-- Business users (existing, enhanced)
CREATE TABLE business_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'member', -- owner, admin, coach, member, viewer
  section_permissions JSONB DEFAULT '{}',
  invited_by UUID REFERENCES auth.users(id),
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT 'pending', -- pending, active, inactive, removed
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, user_id)
);

-- Audit log for tracking all changes
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  user_name VARCHAR(255), -- Denormalized for quick display
  user_email VARCHAR(255),

  -- What changed
  table_name VARCHAR(100) NOT NULL,
  record_id UUID NOT NULL,
  action VARCHAR(20) NOT NULL, -- create, update, delete

  -- Change details
  field_name VARCHAR(100), -- Specific field if single field change
  old_value JSONB,
  new_value JSONB,
  changes JSONB, -- Full diff for multi-field changes

  -- Context
  description TEXT, -- Human-readable: "Updated revenue target from $1M to $1.5M"
  ip_address INET,
  user_agent TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for audit log
CREATE INDEX idx_audit_log_business ON audit_log(business_id);
CREATE INDEX idx_audit_log_user ON audit_log(user_id);
CREATE INDEX idx_audit_log_table_record ON audit_log(table_name, record_id);
CREATE INDEX idx_audit_log_created ON audit_log(created_at DESC);

-- Active editing sessions (for real-time presence)
CREATE TABLE active_editors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  user_name VARCHAR(255),

  -- What they're editing
  page_path VARCHAR(255) NOT NULL, -- e.g., '/vision-mission', '/goals'
  record_id UUID, -- Specific record if applicable

  -- Session info
  started_at TIMESTAMPTZ DEFAULT NOW(),
  last_heartbeat TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(business_id, user_id, page_path)
);

-- Auto-cleanup stale sessions (no heartbeat for 2 minutes)
-- Run via cron or Supabase Edge Function
```

### 2.2 Weekly Reports Schema

```sql
-- Weekly report periods
CREATE TABLE weekly_report_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  week_ending DATE NOT NULL, -- Always a Friday
  status VARCHAR(20) DEFAULT 'open', -- open, closed, archived
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, week_ending)
);

-- Individual weekly reports (one per user per week)
CREATE TABLE weekly_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  period_id UUID REFERENCES weekly_report_periods(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Report status
  status VARCHAR(20) DEFAULT 'draft', -- draft, submitted, reviewed
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id),

  -- Report content (flexible JSONB for customization)
  report_data JSONB DEFAULT '{
    "wins": [],
    "challenges": [],
    "priorities_completed": [],
    "priorities_next_week": [],
    "kpi_updates": {},
    "issues_raised": [],
    "ideas_submitted": [],
    "notes": ""
  }',

  -- Scoring/Rating (optional)
  self_rating INTEGER CHECK (self_rating BETWEEN 1 AND 10),
  manager_rating INTEGER CHECK (manager_rating BETWEEN 1 AND 10),
  manager_feedback TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(period_id, user_id)
);

-- Weekly report comments/discussion
CREATE TABLE weekly_report_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES weekly_reports(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  user_name VARCHAR(255),
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_weekly_reports_business ON weekly_reports(business_id);
CREATE INDEX idx_weekly_reports_user ON weekly_reports(user_id);
CREATE INDEX idx_weekly_reports_period ON weekly_reports(period_id);
CREATE INDEX idx_weekly_reports_status ON weekly_reports(status);
```

---

## 3. Real-Time Collaboration

### 3.1 Presence System

Using Supabase Realtime to show who's online and what they're viewing/editing.

```typescript
// hooks/usePresence.ts
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { RealtimeChannel } from '@supabase/supabase-js'

interface PresenceUser {
  user_id: string
  user_name: string
  avatar_url?: string
  page_path: string
  is_editing: boolean
  last_seen: string
}

export function usePresence(businessId: string, pagePath: string) {
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([])
  const [editingUsers, setEditingUsers] = useState<PresenceUser[]>([])
  const supabase = createClient()

  useEffect(() => {
    const channel = supabase.channel(`presence:${businessId}`)

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        const users = Object.values(state).flat() as PresenceUser[]
        setOnlineUsers(users)
        setEditingUsers(users.filter(u => u.is_editing && u.page_path === pagePath))
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        // Handle user joining
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        // Handle user leaving
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: currentUser.id,
            user_name: currentUser.name,
            page_path: pagePath,
            is_editing: false,
            last_seen: new Date().toISOString()
          })
        }
      })

    return () => {
      channel.unsubscribe()
    }
  }, [businessId, pagePath])

  const setEditing = async (isEditing: boolean) => {
    // Update presence state
  }

  return { onlineUsers, editingUsers, setEditing }
}
```

### 3.2 Edit Locking Flow

```
1. User navigates to page (e.g., /vision-mission)
   → Join presence channel
   → Show "Also viewing: User A, User B"

2. User clicks "Edit" button
   → Check if anyone else is editing
   → If yes: Show warning "User A is currently editing. Continue anyway?"
   → If no: Mark as editing, show "You are editing"

3. While editing:
   → Send heartbeat every 30 seconds
   → Other users see "User X is editing this section"

4. User saves or cancels:
   → Clear editing state
   → Log changes to audit_log
   → Broadcast update via Realtime

5. Conflict resolution:
   → If two users save simultaneously, last-write-wins
   → But both changes are logged in audit_log
   → Show notification: "This page was updated by User A"
```

### 3.3 UI Components

```typescript
// components/collaboration/PresenceIndicator.tsx
// Shows avatars of users viewing the current page

// components/collaboration/EditingBanner.tsx
// Shows warning when someone else is editing
// "⚠️ Sarah is currently editing this section"

// components/collaboration/ActivityFeed.tsx
// Shows recent changes: "John updated Revenue Target 5 min ago"
```

---

## 4. Audit Log System

### 4.1 Automatic Logging

Use Supabase Database Triggers or application-level logging.

```typescript
// lib/audit.ts
interface AuditLogEntry {
  business_id: string
  user_id: string
  user_name: string
  user_email: string
  table_name: string
  record_id: string
  action: 'create' | 'update' | 'delete'
  field_name?: string
  old_value?: any
  new_value?: any
  changes?: Record<string, { old: any; new: any }>
  description: string
}

export async function logChange(entry: AuditLogEntry) {
  const supabase = createClient()

  await supabase.from('audit_log').insert({
    ...entry,
    ip_address: getClientIP(),
    user_agent: navigator.userAgent,
    created_at: new Date().toISOString()
  })
}

// Helper to generate human-readable descriptions
export function describeChange(
  tableName: string,
  fieldName: string,
  oldValue: any,
  newValue: any
): string {
  const fieldLabels: Record<string, string> = {
    'revenue_target': 'Revenue Target',
    'vision_statement': 'Vision Statement',
    'mission_statement': 'Mission Statement',
    // ... more mappings
  }

  const label = fieldLabels[fieldName] || fieldName

  if (oldValue === null) {
    return `Set ${label} to "${newValue}"`
  } else if (newValue === null) {
    return `Cleared ${label}`
  } else {
    return `Changed ${label} from "${oldValue}" to "${newValue}"`
  }
}
```

### 4.2 Viewing Audit History

```typescript
// components/audit/ChangeHistory.tsx
// Modal or panel showing history of changes for a record

interface ChangeHistoryProps {
  tableName: string
  recordId: string
}

// Shows timeline:
// - Dec 9, 2024 3:45 PM - Sarah updated Revenue Target from $1M to $1.5M
// - Dec 8, 2024 10:30 AM - John created this record
// - etc.
```

---

## 5. Weekly Reports System

### 5.1 Report Workflow

```
Monday:
  → System creates new report period (week ending Friday)
  → Team members see "New weekly report available"

Throughout week:
  → Team members can draft their report
  → Auto-save as they work
  → Can link to KPIs, issues, ideas they worked on

Friday:
  → Reminder notification: "Submit your weekly report"
  → Submit button becomes prominent

After submission:
  → Owner/Admin/Coach can view all reports
  → Can add comments/feedback
  → Can mark as reviewed

Weekly Dashboard:
  → Owner sees summary: 5/7 reports submitted
  → Click to view individual reports
  → Aggregate metrics across team
```

### 5.2 Report Content Structure

```typescript
interface WeeklyReportData {
  // Wins & Achievements
  wins: {
    id: string
    description: string
    linked_goal_id?: string // Link to a goal if applicable
  }[]

  // Challenges & Blockers
  challenges: {
    id: string
    description: string
    needs_help: boolean
    linked_issue_id?: string // Link to issues list
  }[]

  // What I completed this week
  priorities_completed: {
    id: string
    description: string
    completion_percentage: number
  }[]

  // What I'm focusing on next week
  priorities_next_week: {
    id: string
    description: string
    estimated_hours?: number
  }[]

  // KPI Updates (if responsible for any)
  kpi_updates: {
    [kpi_id: string]: {
      actual_value: number
      notes?: string
    }
  }

  // New issues raised
  issues_raised: string[] // IDs of issues created this week

  // Ideas submitted
  ideas_submitted: string[] // IDs of ideas created this week

  // Free-form notes
  notes: string

  // Self-assessment
  productivity_rating: number // 1-10
  satisfaction_rating: number // 1-10
}
```

### 5.3 Weekly Report Views

**For Team Members:**
- Their own report form
- History of past reports

**For Owner/Admin/Coach:**
- Dashboard: All team reports for current week
- Individual report view with commenting
- Comparison view: See patterns across weeks
- Export to PDF/CSV

---

## 6. Implementation Phases

### Phase 1: Foundation (Week 1)
- [ ] Create database tables (audit_log, weekly_reports, etc.)
- [ ] Update business_users with new permission structure
- [ ] Create permission checking utilities
- [ ] Update sidebar to use new permission system

### Phase 2: Audit Logging (Week 1-2)
- [ ] Create audit logging utility functions
- [ ] Add logging to key update operations
- [ ] Create "View History" UI component
- [ ] Add change history to key pages (Vision/Mission, Goals, etc.)

### Phase 3: Presence & Collaboration (Week 2)
- [ ] Set up Supabase Realtime channels
- [ ] Create usePresence hook
- [ ] Add presence indicators to pages
- [ ] Implement soft edit locking
- [ ] Add "someone is editing" warnings

### Phase 4: Weekly Reports (Week 2-3)
- [ ] Create weekly report submission form
- [ ] Build report dashboard for Owner/Admin/Coach
- [ ] Add notifications/reminders
- [ ] Implement commenting system
- [ ] Add report history view

### Phase 5: Polish & Integration (Week 3)
- [ ] Connect reports to KPIs, issues, ideas
- [ ] Add export functionality
- [ ] Performance optimization
- [ ] Testing & bug fixes

---

## 7. API Endpoints

```typescript
// Team Management
POST   /api/team/invite          // Invite new team member
PUT    /api/team/[id]/role       // Update member role
PUT    /api/team/[id]/permissions // Update member permissions
DELETE /api/team/[id]            // Remove team member

// Audit Log
GET    /api/audit                // Get audit log (with filters)
GET    /api/audit/[table]/[id]   // Get history for specific record

// Weekly Reports
GET    /api/reports/weekly                    // Get all reports for current period
GET    /api/reports/weekly/[period_id]        // Get reports for specific period
GET    /api/reports/weekly/user/[user_id]     // Get user's report history
POST   /api/reports/weekly                    // Create/update report
PUT    /api/reports/weekly/[id]/submit        // Submit report
POST   /api/reports/weekly/[id]/comment       // Add comment to report

// Presence
GET    /api/presence/[page]      // Get users on page (fallback for non-realtime)
POST   /api/presence/heartbeat   // Update presence
```

---

## 8. Security Considerations

1. **Row Level Security (RLS)** - All queries filtered by business_id and user permissions
2. **API Validation** - Check user role before allowing operations
3. **Audit Log Immutability** - No UPDATE/DELETE on audit_log table
4. **Presence Cleanup** - Auto-remove stale presence records
5. **Rate Limiting** - Prevent audit log spam
6. **Audit Log Retention** - 6 months, auto-cleanup via scheduled job

---

## 9. Notification Preferences System

Users can configure which notifications they receive.

### 9.1 Notification Types

| Notification | Description | Default |
|--------------|-------------|---------|
| `weekly_report_reminder` | Friday reminder to submit weekly report | ON |
| `report_feedback` | When someone comments on your report | ON |
| `data_changed` | When someone edits data you created | ON |
| `someone_editing` | Real-time alert when someone starts editing | OFF |
| `team_member_joined` | New team member accepts invite | ON (Owner/Admin only) |
| `coaching_session` | Session reminders and notes | ON |
| `weekly_digest` | Weekly summary email | ON |

### 9.2 Notification Preferences Schema

```sql
-- User notification preferences
CREATE TABLE notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,

  -- Notification toggles
  weekly_report_reminder BOOLEAN DEFAULT true,
  report_feedback BOOLEAN DEFAULT true,
  data_changed BOOLEAN DEFAULT true,
  someone_editing BOOLEAN DEFAULT false,
  team_member_joined BOOLEAN DEFAULT true,
  coaching_session BOOLEAN DEFAULT true,
  weekly_digest BOOLEAN DEFAULT true,

  -- Delivery preferences
  email_enabled BOOLEAN DEFAULT true,
  push_enabled BOOLEAN DEFAULT true,
  in_app_enabled BOOLEAN DEFAULT true,

  -- Quiet hours (optional)
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  timezone VARCHAR(50) DEFAULT 'UTC',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, business_id)
);
```

---

## 10. Decisions Made

| Question | Decision |
|----------|----------|
| Can viewers see weekly reports? | **No** - Viewers cannot see weekly reports |
| Can coach edit business data? | **Yes** - Coach can edit everything |
| Audit log retention period? | **6 months** - Auto-cleanup older records |
| User notification preferences? | **Yes** - Configurable per user |
| Weekly report deadline? | **Soft reminder** - Can submit anytime but reminded Friday |

---

## 11. Future Enhancements

- **Version History** - Full document versioning with restore capability
- **Change Approval** - Require approval for certain changes
- **Offline Support** - Queue changes when offline
- **Mobile App** - Push notifications for presence/changes
- **AI Summary** - Auto-summarize weekly reports for leadership
