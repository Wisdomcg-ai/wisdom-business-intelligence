# Architecture

**Analysis Date:** 2026-04-04

## Pattern Overview

**Overall:** Next.js 14 App Router monolith with multi-tenant business coaching SaaS architecture

**Key Characteristics:**
- Server-side middleware for auth gating + CSRF protection
- Client-side `BusinessContext` provider manages multi-tenancy (active business + viewer permissions)
- Three distinct portals: Client (`/dashboard`), Coach (`/coach`), Admin (`/admin`) sharing a common API layer
- Feature modules co-locate components, hooks, services, types, and utilities alongside their route pages
- Supabase handles authentication, database (Postgres), and RLS-based row-level security
- All API routes are Next.js Route Handlers (`app/api/.../route.ts`)

## Layers

**Presentation Layer (Client Components):**
- Purpose: Render UI, handle user interactions, manage local component state
- Location: `src/app/*/page.tsx`, `src/app/*/components/`, `src/components/`
- Contains: React client components (`'use client'`), form handlers, modals, step wizards
- Depends on: Hooks, Services, BusinessContext, UI components
- Used by: End users via browser

**Context & State Layer:**
- Purpose: Manage global app state (current user, active business, viewer permissions)
- Location: `src/contexts/BusinessContext.tsx`, `src/lib/store/wizardStore.ts`
- Contains: React Context provider (BusinessContext), Zustand stores (wizard state)
- Depends on: Supabase client, auth/roles lib
- Used by: All client components via `useBusinessContext()` hook

**Hooks Layer:**
- Purpose: Encapsulate reusable client-side logic (data fetching, side effects, business logic)
- Location: `src/hooks/` (global), `src/app/*/hooks/` (feature-scoped), `src/lib/kpi/hooks/`
- Contains: Custom React hooks for business ID resolution, auto-save, presence, Xero sync
- Depends on: Supabase client, BusinessContext, feature services
- Used by: Page components and feature components

**Service Layer (Client-side):**
- Purpose: Encapsulate Supabase queries and business logic callable from client components
- Location: `src/app/*/services/`, `src/lib/services/`, `src/lib/supabase/helpers.ts`
- Contains: Static class methods or plain functions that use `createClient()` for direct DB queries
- Depends on: Supabase browser client (`src/lib/supabase/client.ts`)
- Used by: Hooks, page components

**API Route Layer (Server-side):**
- Purpose: Handle HTTP requests, enforce auth, perform server-side DB operations, integrate with external APIs
- Location: `src/app/api/*/route.ts`
- Contains: Next.js Route Handlers exporting `GET`, `POST`, `PUT`, `DELETE`, `PATCH` functions
- Depends on: Supabase server client (`createRouteHandlerClient`), admin client (`createServiceRoleClient`), external SDKs
- Used by: Client-side `fetch()` calls, external webhooks, cron triggers

**Library Layer:**
- Purpose: Shared utilities, type definitions, configuration, and cross-cutting concerns
- Location: `src/lib/`
- Contains: Supabase client factories, auth helpers, permissions, security (CSRF), logging, validation, AI integrations, Xero helpers
- Depends on: Environment variables, third-party SDKs
- Used by: All other layers

**Database Layer:**
- Purpose: Data persistence, row-level security, triggers, edge functions
- Location: `supabase/migrations/` (102 migration files), `supabase/functions/`
- Contains: SQL migrations, RLS policies, Supabase Edge Functions (Deno)
- Depends on: Supabase platform
- Used by: All Supabase client calls (browser, server, admin)

## Data Flow

**Client Page Load (typical pattern):**

1. User navigates to a route (e.g., `/goals`)
2. Next.js middleware (`src/middleware.ts`) intercepts: creates Supabase server client, calls `getUser()`, checks auth
3. If unauthenticated, redirects to `/auth/login`; if authenticated, checks role and onboarding status
4. Page component renders as `'use client'`, calls `useBusinessContext()` to get `activeBusiness.id`
5. Page calls a feature hook (e.g., `useStrategicPlanning`) or service function
6. Service function uses `createClient()` (browser Supabase client) to query DB directly via RLS
7. Data returned to component, rendered with Tailwind CSS styled components

**API Route Request (server-side):**

1. Client calls `fetch('/api/goals?business_id=...')`
2. Route handler creates server Supabase client via `createRouteHandlerClient()`
3. Handler calls `supabase.auth.getUser()` to verify authentication
4. Handler verifies business access (checks `business_users`, `businesses.owner_id`, or `businesses.assigned_coach_id`)
5. Handler performs DB queries and returns `NextResponse.json()`

**Coach Viewing Client Data:**

1. Coach navigates to `/coach/clients/[id]/view/[...path]`
2. `CoachViewLayout` wraps the page in the coach sidebar layout
3. The catch-all route (`[...path]/page.tsx`) dynamically imports the matching client page component
4. `BusinessContext.setActiveBusiness(clientId)` sets the active business to the client's business
5. Security check: verifies coach is assigned (`assigned_coach_id`) or has coach/super_admin role
6. `viewerContext.isViewingAsCoach = true` signals to components that a coach is viewing
7. All subsequent data queries use the client's `businessId` via `useActiveBusinessId()`

**State Management:**
- **Global state:** `BusinessContext` (React Context) -- current user, active business, viewer permissions
- **Form/wizard state:** `wizardStore` (Zustand with `persist` middleware) -- process wizard conversation and steps
- **Feature state:** Local `useState`/`useEffect` in page components -- no global feature stores
- **Server state:** No dedicated server-state library (no React Query/SWR); manual `fetch` + `useState`

## Key Abstractions

**Business Context:**
- Purpose: Central tenancy resolver -- determines whose data to show and what permissions apply
- Examples: `src/contexts/BusinessContext.tsx`, `src/hooks/useActiveBusinessId.ts`, `src/hooks/useBusinessContext.ts`
- Pattern: React Context provider wrapping entire app in `src/app/layout.tsx`

**Supabase Client Factories:**
- Purpose: Create correctly configured Supabase clients for different execution contexts
- Examples: `src/lib/supabase/client.ts` (browser singleton), `src/lib/supabase/server.ts` (server/route handler), `src/lib/supabase/admin.ts` (service role, bypasses RLS)
- Pattern: Factory functions; browser client uses singleton pattern to prevent auth flickering

**Feature Services:**
- Purpose: Encapsulate all DB operations for a feature module
- Examples: `src/app/stop-doing/services/stop-doing-service.ts`, `src/app/goals/services/financial-service.ts`, `src/lib/services/issuesService.ts`
- Pattern: Either static class methods (e.g., `TimeLogService.getTimeLogs()`) or plain exported async functions (e.g., `getActiveIssues()`)

**Viewer Permissions:**
- Purpose: Granular permission system for multi-role access (owner, admin, member, viewer, coach)
- Examples: `src/contexts/BusinessContext.tsx` (ViewerPermissions interface), `src/lib/permissions/index.ts` (navigation filtering)
- Pattern: Role-based permission mapping with per-section granularity; sidebar navigation filtered by `hasPermission()`

**RouteError Component:**
- Purpose: Standardized error handling for all route-level error boundaries
- Examples: `src/components/RouteError.tsx`, used by 29 `error.tsx` files across feature routes
- Pattern: Each route's `error.tsx` delegates to `<RouteError section="Goals" />`

## Entry Points

**Root Layout:**
- Location: `src/app/layout.tsx`
- Triggers: Every page render
- Responsibilities: Wraps all content in `BusinessContextProvider` > `ErrorBoundary` > `SidebarLayout`; provides `Toaster` for notifications

**Middleware:**
- Location: `src/middleware.ts`
- Triggers: All non-API, non-static requests (matcher pattern excludes `api`, `_next/static`, `_next/image`, static assets)
- Responsibilities: CSRF token management, Supabase auth session refresh, redirect unauthenticated users, enforce onboarding flow (currently disabled), add security headers (CSP, HSTS, X-Frame-Options, etc.)

**Landing Page:**
- Location: `src/app/page.tsx`
- Triggers: Unauthenticated visit to `/`
- Responsibilities: Public marketing/landing page for WisdomBi

**Client Dashboard:**
- Location: `src/app/dashboard/page.tsx`
- Triggers: Authenticated client navigating to `/dashboard`
- Responsibilities: Main client entry point; shows goals, rocks, weekly priorities, coach messages, session actions

**Coach Portal:**
- Location: `src/app/coach/page.tsx` (redirects to `/coach/dashboard`)
- Triggers: Coach login
- Responsibilities: Coach dashboard, client list, sessions, analytics; uses `CoachLayoutNew` layout

**Admin Portal:**
- Location: `src/app/admin/page.tsx`
- Triggers: Super admin login
- Responsibilities: Client management, coach management, activity monitoring

**API Health Check:**
- Location: `src/app/api/health/route.ts`
- Triggers: Monitoring systems, health checks
- Responsibilities: Returns system health including DB connectivity, latency, uptime

**Cron Endpoint:**
- Location: `src/app/api/cron/daily-health-report/route.ts`
- Triggers: External cron scheduler
- Responsibilities: Daily health reporting

## Error Handling

**Strategy:** Multi-layer error handling with graceful degradation

**Patterns:**
- **Global ErrorBoundary:** `src/components/ErrorBoundary.tsx` -- class component wrapping all page content in root layout; catches React render errors with retry/reload buttons
- **Global Error Page:** `src/app/global-error.tsx` -- catches errors outside the error boundary (root layout failures)
- **Route-level Error Boundaries:** 29 `error.tsx` files across feature routes, all delegating to `src/components/RouteError.tsx` with section-specific labeling
- **API Route Error Handling:** Try/catch in every route handler; returns appropriate HTTP status codes (401, 403, 500) with JSON error messages
- **Client Error Logging:** `src/lib/error-logger.ts` logs client-side errors to `client_error_logs` table in Supabase (non-blocking)
- **Service-level:** Service functions return empty arrays/null on failure with `console.error` logging; callers handle gracefully
- **Not Found Page:** `src/app/not-found.tsx` provides a custom 404 with navigation back to dashboard

## Multi-Tenancy Model

**Tenant Isolation:**
- Each business is a tenant identified by `businesses.id`
- Data is scoped to businesses via `business_id` foreign keys across all feature tables
- Supabase RLS policies enforce row-level access control at the database layer
- Application-level access checks supplement RLS in API routes (verify `business_users` membership, `owner_id`, or `assigned_coach_id`)

**User-to-Business Mapping:**
- `businesses` table: each business has an `owner_id` and optional `assigned_coach_id`
- `business_users` table: join table mapping users to businesses with roles (`owner`, `admin`, `member`, `viewer`)
- `business_profiles` table: stores business metadata, linked to `businesses` via `business_id`

**Role Hierarchy:**
- System roles (stored in `system_roles` table): `super_admin`, `coach`, `client`
- Business roles (stored in `business_users.role`): `owner`, `admin`, `member`, `viewer`
- Coach role gets full access to assigned client businesses
- Super admin gets access to all businesses

## Authentication Flow

**Auth Provider:** Supabase Auth (email/password + Google OAuth)

**Login Flow:**
1. User visits `/auth/login` (clients), `/coach/login` (coaches), or `/admin/login` (admins)
2. Calls `supabase.auth.signInWithPassword()` or `supabase.auth.signInWithOAuth({ provider: 'google' })`
3. After sign-in, checks `system_roles` table via `getUserSystemRole()` (`src/lib/auth/roles.ts`)
4. Role-specific portals reject wrong-role logins (e.g., coach trying to use client login gets signed out)
5. Redirects to role-appropriate dashboard via `getRedirectPathForRole()`

**Session Management:**
- Supabase manages JWT sessions via cookies (httpOnly)
- Middleware refreshes session on every request via `createServerClient` cookie handling
- `BusinessContext` listens to `onAuthStateChange` events and reloads user data on `SIGNED_IN`/`SIGNED_OUT`

**Onboarding Guard (currently disabled):**
- Middleware checks if business profile is completed and assessment is done
- Redirects incomplete users to `/business-profile` or `/assessment`
- Currently disabled with TODO to re-enable

## Cross-Cutting Concerns

**Logging:**
- Structured logger at `src/lib/utils/logger.ts` with `debug`, `info`, `warn`, `error` levels
- Convenience methods: `logger.api()`, `logger.auth()`, `logger.db()`
- Dev mode: colored console output; Production: JSON format for log aggregation
- Client-side error logging to `client_error_logs` table via `src/lib/error-logger.ts`
- Many areas still use direct `console.log`/`console.error` instead of the structured logger

**Validation:**
- Input sanitization at `src/lib/utils/validation.ts` (string sanitization, HTML escaping, email/password validation)
- AI output sanitization at `src/lib/utils/ai-sanitizer.ts`
- Zod available as dependency but not widely adopted for request validation in API routes

**Authentication:**
- Supabase Auth with middleware-level session management
- CSRF protection via `src/lib/security/csrf.ts` (double-submit cookie pattern)
- Security headers in middleware and `next.config.js` (CSP, HSTS, X-Frame-Options, etc.)

**Permissions:**
- Section-level permissions via `src/lib/permissions/index.ts`
- Maps sidebar navigation items to permission keys
- Team members get configurable section access stored in DB
- Owners, admins, and coaches bypass all permission checks

**Notifications:**
- `src/lib/notifications.ts` creates notifications in DB using service role client
- Supabase Edge Functions (`supabase/functions/`) handle notification delivery (check-actions-due, check-session-reminders, send-notifications)

**Email:**
- Resend SDK at `src/lib/email/resend.ts`
- API routes at `src/app/api/email/send/route.ts` and `src/app/api/email/test/route.ts`

## External Integration Architecture

**Xero (Accounting):**
- OAuth flow: Lambda function at `lambda/xero-oauth-handler/` + API routes at `src/app/api/Xero/*/route.ts`
- Token management: `src/lib/xero/token-manager.ts`
- API client: `src/lib/api/xero-client.ts`
- Sync endpoints: sync, sync-all, sync-forecast for pulling financial data
- 16 Xero-related API routes covering accounts, P&L, employees, reconciliation, chart-of-accounts

**AI (Anthropic Claude + OpenAI):**
- Claude CFO Agent: `src/lib/services/claude-cfo-agent.ts` -- conversational forecast wizard using Claude Sonnet/Opus/Haiku
- OpenAI: Available via `openai` package; placeholder at `src/lib/ai/openaiParser.ts`
- AI API routes: `src/app/api/ai/advisor/route.ts`, `src/app/api/ai/forecast-assistant/route.ts`, `src/app/api/ai-assist/route.ts`

---

*Architecture analysis: 2026-04-04*
