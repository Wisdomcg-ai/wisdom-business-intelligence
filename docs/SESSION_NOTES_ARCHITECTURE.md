# Session Notes & Multi-User Architecture

## Overview

This document outlines the architecture for:
1. **Multi-User Business Access** - Allow multiple users (owner, partners, team members) to access a business account
2. **Session Notes** - Collaborative note-taking during coaching sessions

---

## 1. Business Users Model

### Table: `business_users`

```sql
CREATE TABLE business_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'partner', 'team_member')),
  invited_by UUID REFERENCES auth.users(id),
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'removed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(business_id, user_id)
);
```

### Role Permissions

| Capability | Owner | Partner | Team Member |
|------------|-------|---------|-------------|
| Full dashboard access | ✅ | ✅ | ✅ |
| Edit all business data | ✅ | ✅ | ⚠️ Limited |
| Start session notes | ✅ | ✅ | ✅ |
| See ALL session notes | ✅ | ✅ | ❌ |
| See sessions they attended | ✅ | ✅ | ✅ |
| Invite users | ✅ | ✅ | ❌ |
| Remove users | ✅ | ⚠️ Cannot remove owner | ❌ |
| Message coach | ✅ | ✅ | ✅ |

### Notes
- **Owner** and **Partner** have equal access (partners are business partners)
- **Team Members** have limited visibility - only see sessions they attend
- Owner/Partner can grant team members visibility to specific sessions

---

## 2. Session Notes Model

### Table: `session_notes`

```sql
CREATE TABLE session_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  coach_id UUID NOT NULL REFERENCES auth.users(id),
  session_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  duration_minutes INTEGER,

  -- COACH FIELDS (coach editable)
  discussion_points TEXT,
  client_commitments TEXT,
  coach_action_items TEXT,          -- Private to coach
  private_observations TEXT,        -- Private to coach
  next_session_prep TEXT,           -- Private to coach
  transcript_url TEXT,
  transcript_name TEXT,

  -- CLIENT FIELDS (client editable)
  client_takeaways TEXT,
  client_notes TEXT,
  client_rating INTEGER CHECK (client_rating >= 1 AND client_rating <= 5),
  client_feedback TEXT,

  -- VISIBILITY
  visible_to_all_users BOOLEAN DEFAULT FALSE,

  -- TIMESTAMPS
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  coach_started_at TIMESTAMPTZ,
  client_started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- One session per business per day
  UNIQUE(business_id, session_date)
);
```

### Table: `session_attendees`

```sql
CREATE TABLE session_attendees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_note_id UUID NOT NULL REFERENCES session_notes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  user_type TEXT NOT NULL CHECK (user_type IN ('coach', 'client')),
  added_by UUID REFERENCES auth.users(id),
  added_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(session_note_id, user_id)
);
```

---

## 3. Field Visibility Rules

### Visible to ALL Attendees
- `session_date`
- `discussion_points`
- `client_commitments`
- `client_takeaways`
- `client_notes`
- `client_rating`
- `client_feedback`
- `transcript_url` / `transcript_name`

### Visible to COACH ONLY
- `coach_action_items`
- `private_observations`
- `next_session_prep`

---

## 4. Session Visibility Rules

```
WHO CAN SEE A SESSION NOTE?

Coach:
└── Always (it's their client)

Owner/Partner:
└── Always (full access to all business data)

Team Member:
├── IF they are in session_attendees → YES
├── OR IF visible_to_all_users = true → YES
└── ELSE → NO
```

---

## 5. User Flow

### Starting a Session

```
Either Coach OR Client can start a session note
                    │
                    ▼
    ┌───────────────────────────────┐
    │ Check: Session exists today?  │
    └───────────────────────────────┘
              │           │
             NO          YES
              │           │
              ▼           ▼
         Create new    Join existing
         session       session
              │           │
              └─────┬─────┘
                    ▼
    ┌───────────────────────────────┐
    │ Add attendees                 │
    │ (creator auto-added)          │
    └───────────────────────────────┘
                    │
                    ▼
    ┌───────────────────────────────┐
    │ LIVE EDITING                  │
    │ • Coach edits coach fields    │
    │ • Clients edit client fields  │
    └───────────────────────────────┘
                    │
                    ▼
    ┌───────────────────────────────┐
    │ End Session                   │
    │ • Prompt client for rating    │
    │ • Upload transcript           │
    │ • Set visibility toggle       │
    └───────────────────────────────┘
```

---

## 6. UI Locations

| Portal | Route | Purpose |
|--------|-------|---------|
| **Coach** | `/coach/sessions` | List all sessions across all clients |
| **Coach** | `/coach/clients/[id]/sessions` | Sessions for specific client |
| **Coach** | `/coach/sessions/[id]` | View/edit session note |
| **Client** | `/sessions` | List my sessions |
| **Client** | `/sessions/[id]` | View/edit my sections |

---

## 7. Build Order

### Phase 1: Multi-User Foundation
1. [ ] Add `role` column to existing `business_users` table
2. [ ] Create RLS policies for role-based access
3. [ ] Update BusinessContext to include user role
4. [ ] Build user invitation UI (Owner/Partner only)

### Phase 2: Session Notes Core
5. [ ] Create `session_notes` table
6. [ ] Create `session_attendees` table
7. [ ] Build Coach session list page
8. [ ] Build Coach session editor page
9. [ ] Build Client session list page
10. [ ] Build Client session editor page

### Phase 3: Enhancements
11. [ ] Transcript upload integration
12. [ ] Real-time sync (optional)
13. [ ] Session analytics/reporting

---

## 8. Key Design Decisions

1. **One session per business per day** - Simplifies merging when both parties start notes
2. **Coach and client edit different fields** - No conflicts, clear ownership
3. **Private coach fields** - Coach can take candid notes without client seeing
4. **Attendees tracking** - Enables team member visibility rules
5. **Visibility toggle** - Owner/Partner can share sessions with full team

---

## 9. API Endpoints (Future)

```
GET    /api/sessions                    # List sessions (filtered by role)
POST   /api/sessions                    # Create/join session
GET    /api/sessions/[id]               # Get session details
PATCH  /api/sessions/[id]               # Update session
POST   /api/sessions/[id]/attendees     # Add attendee
DELETE /api/sessions/[id]/attendees/[uid] # Remove attendee
POST   /api/sessions/[id]/complete      # Mark session complete
POST   /api/sessions/[id]/transcript    # Upload transcript
```

---

*Document created: November 29, 2024*
*Last updated: November 29, 2024*
