# Wisdom BI Coaching Platform - Complete Architecture

## 🎯 Vision
Build a world-class coaching platform that enables coaches to effectively manage clients, track progress, communicate, and deliver transformational results. Future-ready for SaaS monetization.

## 📐 Architecture Overview

### **Phase 1: Foundation (Week 1-2)**
**Goal: Build the core admin panel with client management**

#### Features:
1. **Enhanced Coach Dashboard**
   - Real-time metrics and KPIs
   - Client health at-a-glance
   - Activity feed
   - Quick actions bar

2. **Client Detail View (Master-Detail)**
   - Left sidebar: Client list with search/filter
   - Right panel: Client workspace with tabs:
     - Overview (key metrics, recent activity)
     - Annual Plan (existing feature)
     - Financial Forecast (existing feature)
     - Goals & Targets (existing feature)
     - Sessions (new)
     - Actions & Tasks (new)
     - Chat (new)
     - Documents (new)
     - Insights (new)

3. **Database Schema**
   - Run COACH_ADMIN_SCHEMA.sql
   - Set up proper RLS policies
   - Create helper functions

---

### **Phase 2: Session Management (Week 3)**
**Goal: Complete coaching session workflow**

#### Features:
1. **Session Calendar**
   - Monthly/weekly calendar view
   - Schedule new sessions
   - Session reminders
   - Recurring sessions support

2. **Session Detail Page**
   - Pre-session agenda builder
   - Session notes (during/after)
   - Attendee management
   - Time tracking

3. **Transcript Upload & Processing**
   - Upload transcript files (from Fireflies/Plaud)
   - AI-powered action extraction
   - Auto-generate session summary
   - Link actions to session

4. **Action Tracking**
   - Create actions for client or coach
   - Set due dates and priorities
   - Status tracking (open → in progress → completed)
   - Action dashboard with filtering

---

### **Phase 3: Communication Hub (Week 4)**
**Goal: Seamless coach-client communication**

#### Features:
1. **Real-time Chat**
   - Per-client chat channels
   - File attachments
   - Message threads
   - Read receipts
   - Unread notifications

2. **Q&A System**
   - Clients submit questions
   - Coach responds with rich text
   - Tag and categorize questions
   - Build knowledge base over time

3. **Notifications Center**
   - Bell icon with badge count
   - New messages, upcoming sessions, overdue actions
   - Mark as read/unread
   - In-app + email notifications

---

### **Phase 4: Document Library (Week 5)**
**Goal: Organized document sharing**

#### Features:
1. **Folder Structure**
   - Organized by client + categories
   - Templates library (business plans, financial models)
   - Version control for documents
   - Preview common file types

2. **Upload & Share**
   - Drag-and-drop upload
   - Share with specific users
   - Access permissions
   - Download tracking

---

### **Phase 5: Insights & Analytics (Week 6)**
**Goal: Data-driven coaching decisions**

#### Features:
1. **Client Progress Dashboard**
   - Goal completion rates over time
   - Financial health trends
   - Session frequency analysis
   - Action completion rates

2. **Coach Analytics**
   - Cross-client metrics
   - Time allocation by client
   - Most common challenges
   - Success patterns

3. **AI-Powered Insights**
   - Predict client churn risk
   - Suggest coaching focus areas
   - Identify patterns across clients
   - Auto-generate monthly reports

---

### **Phase 6: Multi-User & Permissions (Week 7)**
**Goal: Enable team access**

#### Features:
1. **User Invitation System**
   - Email invitations
   - Role selection (owner/admin/member)
   - Set granular permissions
   - Invitation expiry

2. **Permission Management**
   - Toggle feature access per user
   - Edit permissions UI
   - User list with roles

3. **Activity Audit Log**
   - Track all user actions
   - View history per client
   - Security and compliance

---

### **Phase 7: SaaS Foundations (Week 8)**
**Goal: Prepare for commercialization**

#### Features:
1. **Subscription System**
   - Stripe integration
   - Plan tiers (Free, Pro, Enterprise)
   - Usage limits enforcement
   - Billing portal

2. **Coach Onboarding**
   - Self-signup flow
   - Onboarding wizard
   - Demo data seeding
   - Tutorial tooltips

3. **Multi-Tenancy**
   - Isolate coach data
   - Shared resources (templates)
   - Performance optimization

---

## 🎨 UI/UX Design System

### **Color Palette**
```
Primary: Blue (#2563EB)
Success: Green (#10B981)
Warning: Yellow (#F59E0B)
Danger: Red (#EF4444)
Neutral: Gray (#6B7280)
```

### **Layout Pattern**
```
┌─────────────────────────────────────────────────────┐
│ Top Nav: Logo | Search | Notifications | Profile   │
├──────────┬──────────────────────────────────────────┤
│          │                                          │
│ Client   │  Client Workspace                       │
│ List     │  ┌────────────────────────────────────┐ │
│          │  │ Tabs: Overview | Plan | Forecast   │ │
│ Client 1 │  │       Sessions | Chat | Documents  │ │
│ Client 2 │  └────────────────────────────────────┘ │
│ Client 3 │                                          │
│          │  [Tab Content Area]                     │
│ Search   │                                          │
│ Filter   │                                          │
│          │                                          │
└──────────┴──────────────────────────────────────────┘
```

### **Key Components**
1. **Command Palette** (Cmd+K): Quick navigation
2. **Client Switcher**: Fast client selection
3. **Activity Timeline**: Visual activity feed
4. **Stat Cards**: Consistent metric display
5. **Action Cards**: Uniform task display

---

## 🔐 Security & Privacy

1. **Row-Level Security (RLS)**
   - Coach can only see their clients
   - Users can only see their business data
   - Super admin sees everything

2. **Audit Logging**
   - All data modifications logged
   - IP address and user agent tracking
   - GDPR compliance ready

3. **Data Export**
   - Clients can export all their data
   - Coach can export client reports
   - Compliance with data portability

---

## 🚀 Technical Stack

### **Frontend**
- Next.js 14 (App Router)
- React 18
- TypeScript
- Tailwind CSS
- Lucide Icons
- React Query (for server state)
- Zustand (for global state)

### **Backend**
- Supabase (PostgreSQL)
- Row-Level Security
- Realtime subscriptions
- Storage for files

### **AI Integration**
- OpenAI GPT-4 for:
  - Action extraction from transcripts
  - Session summaries
  - Insight generation
  - Question answering

### **Payments**
- Stripe for subscriptions
- Webhook handling
- Usage metering

---

## 📊 Database Schema Summary

### **Core Tables**
- `user_roles` - User roles per business
- `user_permissions` - Granular permissions
- `coaching_sessions` - Session records
- `session_actions` - Tasks from sessions
- `chat_messages` - Coach-client chat
- `shared_documents` - File library
- `business_insights` - Generated insights
- `activity_log` - Audit trail

### **Existing Tables (Leverage)**
- `businesses` - Client companies
- `annual_plans` - Strategic plans
- `financial_forecasts` - Financial data
- `goals` - Goals & targets

---

## 📈 Success Metrics

### **Coach Metrics**
- Client engagement score
- Session completion rate
- Action completion rate
- Response time (chat/Q&A)

### **Client Metrics**
- Business health score
- Goal completion %
- Financial performance
- Activity level

### **Platform Metrics**
- Monthly Active Users (MAU)
- Session frequency
- Document uploads
- Chat messages sent

---

## 🎯 Implementation Priorities

### **Must-Have (MVP)**
1. ✅ Client list and overview
2. ✅ Existing features integration (Plan, Forecast, Goals)
3. 🔨 Session management
4. 🔨 Chat system
5. 🔨 Document library
6. 🔨 Action tracking

### **Should-Have (V1.1)**
1. Advanced analytics
2. AI insights
3. Multi-user permissions
4. Email notifications

### **Nice-to-Have (V2.0)**
1. Subscription billing
2. Coach marketplace
3. Mobile app
4. Integrations (Calendar, Slack, etc.)

---

## 🔄 Migration Path

### **Current State → Target State**
1. Keep existing dashboard as backup
2. Build new `/coach` route with new architecture
3. Migrate features one by one
4. A/B test with real usage
5. Sunset old dashboard

---

## 📝 Next Steps

1. **Run database migration**: `COACH_ADMIN_SCHEMA.sql`
2. **Build enhanced coach dashboard**: New layout with client list
3. **Implement session management**: Calendar + session details
4. **Add chat system**: Real-time messaging
5. **Create document library**: File upload and organization
6. **Generate insights**: AI-powered analytics

---

## 🤝 Team & Roles

- **Matt**: Product owner, coach, domain expert
- **Claude**: Development partner, architecture
- **Future**: Additional coaches (as SaaS grows)

---

**Built with ❤️ for transformational coaching**
