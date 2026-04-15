# Complete Coach Portal Improvement Plan

## Context
The coach portal is ~60% feature-complete. This plan covers ALL improvements from the analysis — the Client Engagement Dashboard plus every Tier 1-4 improvement identified. Ordered by impact and dependency.

---

## PHASE 1: Client Engagement & Completion Dashboard (build first)

### What: A single view showing all clients' module completion, engagement, and alerts

### New files:
1. `src/app/api/coach/client-completion/route.ts` — aggregates 15 parallel queries for all clients
2. `src/components/coach/ClientCompletionDashboard.tsx` — matrix table component
3. `src/app/coach/dashboard/engagement/page.tsx` — page wrapper
4. `src/app/coach/dashboard/engagement/loading.tsx` — loading state

### Modify:
- `src/components/layouts/CoachLayoutNew.tsx` — add "Engagement" nav item

### Module statuses tracked (27 modules, grouped):

**SETUP (3):**
Business Profile, Assessment / Health Score, Xero Connected

**PLAN (6):**
Vision & Mission, SWOT Analysis, Goals & Targets, One-Page Plan, Business Roadmap, Strategic Initiatives

**FINANCE (4):**
Financial Forecast, Monthly Report, Cashflow Forecast, KPI Dashboard

**EXECUTE (7):**
Weekly Reviews, Quarterly Review, Issues List, Ideas Journal, Open Loops, To-Do List, Stop Doing List

**TEAM (3):**
Org Chart, Accountability Chart, Hiring Roadmap

**MARKETING (1):**
Value Proposition

**SYSTEMS (1):**
Workflow Builder / Process Maps

**COACHING (2):**
Session Notes (client participation), Messages (engagement)

### Engagement signals per client:
Last login, weekly review streak, days since session, open actions count, engagement score (0-100)

### Alerts:
No login 14d+, quarterly review overdue, no forecast, weekly streak broken, low engagement (<30)

### UI: 
Sortable/filterable matrix with sticky client column, grouped column headers (Setup | Plan | Finance | Execute | Team | Marketing | Systems | Coaching), status dots (green/amber/red), expandable detail rows, summary stats header. Columns collapsible by group for narrower views.

---

## PHASE 2: Fix Hardcoded Fake Data (credibility)

### Problem: Reports page shows fake metrics as if they're real
### Files to fix:
- `src/app/coach/reports/page.tsx` — replace hardcoded values:
  - "Avg Response Time: 4 days" → calculate from coaching_sessions gap
  - "Avg Client Health: 72%" → calculate from assessments average
  - "Messages This Week: 24" → calculate from messages table
  - Health trends (random) → calculate from assessment history

---

## PHASE 3: Notification Persistence & Session Reminders

### 3a. Persist notification preferences
- Create `coach_notification_settings` table (migration)
- Update `src/app/coach/settings/page.tsx` to save/load from DB

### 3b. Session reminders (email)
- Add Vercel Cron job: `/api/cron/session-reminders`
- Query `coaching_sessions` for sessions in next 24 hours
- Send reminder email via Resend (already integrated)
- Check coach's notification preferences before sending

### 3c. Action due date reminders
- Add to same cron: check `session_actions` with due_date = tomorrow
- Send email to client and coach

---

## PHASE 4: Real-Time Messaging

### Problem: Messages require page refresh to see new ones
### Fix: Use Supabase Realtime (already available)
- Subscribe to `messages` table changes in `src/app/coach/messages/page.tsx`
- Subscribe in `src/app/messages/page.tsx` (client side)
- Add typing indicators (optional — new `typing_status` table)
- Add read receipts (update `read_at` timestamp, not just boolean)

---

## PHASE 5: View-As-Client Guardrails

### Files to modify:
- `src/app/coach/clients/[id]/view/[...path]/page.tsx`
  - Add "Back to Coach View" floating button
  - Add "Coach Viewing" banner at top
  - Add audit logging (new `coach_audit_log` table)
  - Consider read-only mode toggle

---

## PHASE 6: Message Templates in DB

### Problem: Templates hardcoded in frontend
### Fix:
- Already have `session_templates` table pattern
- Create `message_templates` table (coach_id, name, content, category)
- Update `src/app/coach/messages/page.tsx` to load from DB
- Allow coaches to create/edit/delete templates
- Pre-seed with current hardcoded templates via migration

---

## PHASE 7: Coach Analytics Improvements

### Fix reports page calculated metrics:
- Client health score trending (store weekly snapshots in new table)
- Session effectiveness correlation (sessions → actions completed → metrics improved)
- Engagement scoring with real algorithm (not placeholder)

### New: Coaching ROI Dashboard
- Compare client revenue before vs after engagement start
- Use Xero data (xero_pl_lines) for actual revenue tracking
- Show: revenue growth %, profit improvement, goal achievement rate

---

## PHASE 8: Calendar Integration

### Problem: Calendar buttons are non-functional placeholders
### Options:
- Google Calendar OAuth (most common for AU businesses)
- Generate .ics files for download (simpler, works with any calendar)
- Start with .ics download, upgrade to OAuth later

---

## PHASE 9: Client Self-Scheduling

### New feature: Booking calendar
- Coach sets available time slots in settings
- Client sees available slots and books directly
- Creates `coaching_sessions` record automatically
- Sends confirmation email to both parties

---

## PHASE 10: Weekly Coach Digest Email

### Vercel Cron: `/api/cron/weekly-digest`
- Runs Monday 7am AEST
- For each coach: summarize past week
  - Clients who need attention (no login, overdue actions)
  - Upcoming sessions this week
  - Actions completed vs overdue
  - Module completion progress changes
- Send via Resend

---

## Implementation Priority

| Phase | Effort | Impact | Risk | Deploy |
|-------|--------|--------|------|--------|
| 1. Engagement Dashboard | Large | Critical | Low | Week 1-2 |
| 2. Fix Fake Data | Small | High | None | Week 1 |
| ~~3. Reminders~~ | ~~Medium~~ | ~~High~~ | ~~Low~~ | **DEFERRED** |
| 4. Real-Time Messaging | Medium | Medium | Low | Week 2 |
| 5. View-As Guardrails | Small | Medium | None | Week 2 |
| 6. Message Templates DB | Small | Low | None | Week 3 |
| 7. Analytics Improvements | Large | Medium | Low | Week 3 |
| 8. Calendar Integration | Medium | Medium | Medium | Week 4 |
| ~~9. Client Self-Scheduling~~ | ~~Large~~ | ~~Medium~~ | ~~Medium~~ | **DEFERRED** |
| 10. Weekly Digest Email | Medium | High | Low | Week 3 |

---

## PHASE 11: Pre-Session Client Questionnaire
**Effort: Medium | Impact: High | Week 4**

Client fills in wins, challenges, and priorities BEFORE each session. Coach sees responses when opening the session — maximizes session time.
- New `session_prep` table (session_id, client responses JSONB)
- Configurable questions per coach (from question bank)
- Auto-send questionnaire link 24h before session
- Coach sees responses in session detail page
- Inspired by: CoachAccountable, Satori, Upcoach Agendas

---

## PHASE 12: AI Session Notes
**Effort: Large | Impact: High | Week 5**

Auto-transcribe coaching sessions, generate summaries, and extract action items.
- Upload audio/video recording to session
- Anthropic Claude API transcribes and summarizes
- Auto-generates: key discussion points, decisions made, action items with owners
- Coach reviews and edits before saving
- Action items auto-create session_actions records
- Inspired by: Delenta AI Note-Taker

---

## Quick Wins (can ship alongside Phase 1):
- Add "Back to Coach View" button in view-as-client
- Remove/replace hardcoded fake metrics on reports page
- Persist notification preferences to DB
- Add message templates to DB (migrate hardcoded ones)
