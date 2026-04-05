# Codebase Structure

**Analysis Date:** 2026-04-04

## Directory Layout

```
business-coaching-platform/
├── src/
│   ├── app/                    # Next.js App Router (pages, API routes, feature modules)
│   │   ├── api/                # All API Route Handlers (~80 routes)
│   │   │   ├── Xero/           # Xero accounting integration endpoints (16 routes)
│   │   │   ├── admin/          # Admin portal API (clients, coaches, activity)
│   │   │   ├── ai/             # AI assistant endpoints (advisor, forecast-assistant)
│   │   │   ├── auth/           # Authentication routes (logout, reset-password, update-password)
│   │   │   ├── coach/          # Coach-specific API (clients list, stats)
│   │   │   ├── cron/           # Cron job endpoints (daily-health-report)
│   │   │   ├── forecasts/      # Financial forecast CRUD + scenarios + versioning
│   │   │   ├── goals/          # Goals and targets API
│   │   │   ├── monthly-report/ # Monthly financial reporting (10 sub-routes)
│   │   │   ├── sessions/       # Coaching session management
│   │   │   └── team/           # Team management (invite, remove, org-chart)
│   │   ├── admin/              # Admin portal pages (clients, coaches, users, activity)
│   │   ├── auth/               # Auth pages (login, signup, reset-password, update-password)
│   │   ├── coach/              # Coach portal pages
│   │   │   ├── clients/        # Client list and client-view proxy
│   │   │   │   └── [id]/view/  # Dynamic client view (catch-all route)
│   │   │   ├── dashboard/      # Coach dashboard
│   │   │   ├── sessions/       # Coach session management
│   │   │   └── messages/       # Coach messaging
│   │   ├── dashboard/          # Client dashboard (main entry after login)
│   │   │   ├── components/     # Dashboard-specific components
│   │   │   ├── hooks/          # Dashboard data hooks
│   │   │   └── utils/          # Dashboard formatting utilities
│   │   ├── finances/           # Financial modules
│   │   │   ├── cashflow/       # 13-week rolling cashflow
│   │   │   ├── forecast/       # Financial forecast wizard
│   │   │   │   ├── components/ # Forecast UI components
│   │   │   │   ├── hooks/      # Forecast data hooks
│   │   │   │   ├── services/   # Forecast DB services
│   │   │   │   └── utils/      # Forecast calculation utilities
│   │   │   └── monthly-report/ # Budget vs Actual reporting
│   │   ├── goals/              # Strategic planning wizard (5-step)
│   │   │   ├── components/     # Step components (Step1-Step5)
│   │   │   │   └── step1/      # Sub-components for Step 1
│   │   │   ├── hooks/          # Planning hooks
│   │   │   ├── services/       # Planning DB services (6 service files)
│   │   │   ├── data/           # Static data (operational habits)
│   │   │   └── utils/          # Formatting, constants, quarters
│   │   ├── quarterly-review/   # Quarterly review workshop
│   │   │   ├── components/     # Workshop UI + step components (28 steps)
│   │   │   ├── hooks/          # Review state hook
│   │   │   ├── services/       # Review DB service + strategic sync
│   │   │   └── types/          # Review type definitions
│   │   ├── stop-doing/         # Stop Doing productivity tool
│   │   │   ├── components/     # 5-step wizard components
│   │   │   ├── hooks/          # Stop doing list hook
│   │   │   └── services/       # Stop doing DB service
│   │   ├── assessment/         # Business assessment tool
│   │   ├── business-dashboard/ # KPI/Scorecard dashboard
│   │   ├── business-profile/   # Business profile setup
│   │   ├── business-roadmap/   # Strategic roadmap
│   │   ├── ideas/              # Ideas journal (shared board)
│   │   ├── integrations/       # Integration management page
│   │   ├── issues-list/        # Issues list (shared board)
│   │   ├── messages/           # Client messaging
│   │   ├── one-page-plan/      # One-page business plan
│   │   ├── open-loops/         # Open loops tracker
│   │   ├── reviews/            # Weekly + quarterly review pages
│   │   ├── sessions/           # Coaching session notes
│   │   ├── settings/           # User/team settings
│   │   ├── swot/               # SWOT analysis tool
│   │   ├── systems/            # Systems & processes
│   │   │   └── processes/      # Process diagram builder
│   │   ├── team/               # Team management
│   │   │   ├── accountability/ # Accountability chart
│   │   │   ├── hiring-roadmap/ # Hiring roadmap
│   │   │   └── org-chart/      # Org chart builder
│   │   ├── todo/               # To-do list
│   │   ├── vision-mission/     # Vision, mission & values
│   │   ├── wizard/             # Process wizard
│   │   ├── xero-connect/       # Xero connection flow
│   │   ├── bali-retreat/       # Standalone public event page
│   │   ├── layout.tsx          # Root layout (providers, sidebar, error boundary)
│   │   ├── page.tsx            # Landing/marketing page (public)
│   │   ├── globals.css         # Global styles
│   │   ├── global-error.tsx    # Root error boundary
│   │   └── not-found.tsx       # Custom 404 page
│   ├── components/             # Shared/reusable components
│   │   ├── ui/                 # Design system primitives (Button, Card, PageLayout, etc.)
│   │   ├── layout/             # App shell (sidebar-layout.tsx)
│   │   ├── layouts/            # Portal-specific layouts (Coach, Client, CoachView)
│   │   ├── shared/             # Shared components (RoleSwitcher, Toast)
│   │   ├── admin/              # Admin-portal components
│   │   ├── analytics/          # Analytics/chart components
│   │   ├── assessment/         # Assessment UI components
│   │   ├── client/             # Client-portal components
│   │   │   └── dashboard/      # Client dashboard widgets
│   │   ├── coach/              # Coach-portal components
│   │   │   ├── actions/        # Coach action components
│   │   │   ├── messages/       # Coach messaging UI
│   │   │   ├── reports/        # Coach reporting
│   │   │   ├── schedule/       # Coach scheduling
│   │   │   ├── settings/       # Coach settings
│   │   │   └── tabs/           # Coach tab components
│   │   ├── collaboration/      # Collaboration features
│   │   ├── dashboard/          # Dashboard widget components
│   │   ├── documents/          # Document management UI
│   │   ├── integrations/       # Integration UI components
│   │   ├── notifications/      # Notification components
│   │   ├── onboarding/         # Onboarding flow components
│   │   ├── process-mapper/     # Process mapping UI
│   │   ├── providers/          # Provider components (GlobalErrorHandler)
│   │   ├── swot/               # SWOT analysis UI
│   │   ├── testing/            # Test/debug components
│   │   ├── todos/              # To-do components
│   │   │   ├── hooks/          # To-do hooks
│   │   │   └── utils/          # To-do utilities
│   │   ├── ErrorBoundary.tsx   # Global React error boundary
│   │   ├── RouteError.tsx      # Reusable route-level error component
│   │   └── Navigation.tsx      # Navigation component
│   ├── contexts/               # React Context providers
│   │   └── BusinessContext.tsx  # Central business/user/permissions context
│   ├── hooks/                  # Global custom hooks (14 hooks)
│   ├── lib/                    # Shared libraries and utilities
│   │   ├── supabase/           # Supabase client factories and DB types
│   │   ├── auth/               # Auth role helpers
│   │   ├── permissions/        # Section permission system
│   │   ├── security/           # CSRF protection
│   │   ├── ai/                 # AI integration helpers
│   │   ├── api/                # External API clients (Xero)
│   │   ├── assessment/         # Assessment scoring logic
│   │   ├── audit/              # Audit logging
│   │   ├── cashflow/           # Cashflow calculation engine
│   │   ├── email/              # Email sending (Resend)
│   │   ├── kpi/                # KPI system (adapters, data, hooks, services, utils)
│   │   ├── process-mapper/     # Process diagram logic
│   │   ├── services/           # Shared service functions
│   │   ├── store/              # Zustand stores
│   │   ├── swot/               # SWOT analysis logic
│   │   ├── types/              # Shared type definitions
│   │   ├── utils/              # Utility functions (13 files)
│   │   ├── vision-mission/     # Vision/mission helpers
│   │   └── xero/               # Xero token management
│   ├── types/                  # Global TypeScript type definitions (8 files)
│   ├── scripts/                # Source-level scripts
│   ├── middleware.ts           # Next.js middleware (auth, CSRF, security headers)
│   └── instrumentation.ts     # Next.js instrumentation (Sentry placeholder)
├── supabase/                   # Supabase project configuration
│   ├── migrations/             # SQL migrations (102 files)
│   ├── functions/              # Supabase Edge Functions (Deno)
│   │   ├── check-actions-due/  # Check for due action items
│   │   ├── check-session-reminders/ # Session reminder notifications
│   │   └── send-notifications/ # Send queued notifications
│   └── diagnostics/            # DB diagnostic scripts
├── database/                   # Legacy database directory
│   └── migrations/             # Legacy migration files (17 files)
├── lambda/                     # AWS Lambda functions
│   └── xero-oauth-handler/     # Xero OAuth callback handler (Node.js)
├── scripts/                    # Build/deployment scripts
│   ├── smoke-test.sh           # Post-build smoke test
│   ├── test-before-merge.sh    # Pre-merge validation
│   ├── run-migration.js        # Migration runner
│   └── rollback.sh             # Rollback script
├── public/                     # Static assets
│   └── images/                 # Logo, favicon, brand images
├── docs/                       # Documentation
│   ├── build-logs/             # Build session logs
│   ├── build-sessions/         # Development session notes
│   └── design-conversations/   # Design decision records
├── .planning/                  # GSD planning documents
│   └── codebase/               # Codebase analysis documents
├── next.config.js              # Next.js configuration
├── tailwind.config.js          # Tailwind CSS configuration (brand colors, fonts)
├── tsconfig.json               # TypeScript configuration
├── package.json                # Dependencies and scripts
└── .eslintrc.json              # ESLint configuration
```

## Directory Purposes

**`src/app/` (App Router):**
- Purpose: All routes, pages, and feature modules
- Contains: Page components (`page.tsx`), error boundaries (`error.tsx`), layouts (`layout.tsx`), API routes (`api/*/route.ts`)
- Key files: `layout.tsx` (root layout), `page.tsx` (landing page), `middleware.ts` (auth/security)

**`src/app/api/` (API Routes):**
- Purpose: All server-side HTTP endpoints
- Contains: ~80 route handler files, each exporting HTTP method functions (GET, POST, PUT, DELETE)
- Key files: `api/health/route.ts` (health check), `api/Xero/*/route.ts` (Xero integration)

**`src/components/` (Shared Components):**
- Purpose: Reusable UI components shared across multiple features/portals
- Contains: UI primitives (`ui/`), layout shells (`layout/`, `layouts/`), portal-specific components (`admin/`, `coach/`, `client/`)
- Key files: `ErrorBoundary.tsx`, `RouteError.tsx`, `layout/sidebar-layout.tsx`

**`src/lib/` (Libraries):**
- Purpose: Shared business logic, utilities, and infrastructure code
- Contains: Supabase clients, auth helpers, permissions, validation, logging, AI integration, email, KPI system
- Key files: `supabase/client.ts`, `supabase/server.ts`, `supabase/admin.ts`, `auth/roles.ts`, `permissions/index.ts`

**`src/hooks/` (Global Hooks):**
- Purpose: Reusable React hooks available to all components
- Contains: 14 custom hooks for business context, auto-save, presence, session timeout, Xero sync
- Key files: `useActiveBusinessId.ts`, `useBusinessContext.ts`, `useCoachView.ts`, `useAutoSave.ts`

**`src/contexts/` (Context Providers):**
- Purpose: React Context for global state management
- Contains: Single context provider for the entire app
- Key files: `BusinessContext.tsx`

**`src/types/` (Global Types):**
- Purpose: TypeScript type definitions shared across the app
- Contains: Database types, process builder types, wizard types
- Key files: `database.ts`, `database.types.ts`, `wizard.ts`

**`supabase/` (Database):**
- Purpose: Supabase project configuration, migrations, and edge functions
- Contains: 102 SQL migration files, 3 Edge Functions (Deno), diagnostic scripts
- Key files: `migrations/` (chronological SQL migrations), `functions/` (background workers)

**`lambda/` (AWS Lambda):**
- Purpose: Serverless functions for external OAuth flows
- Contains: Xero OAuth handler (Node.js)
- Key files: `xero-oauth-handler/index.js`

## Key File Locations

**Entry Points:**
- `src/app/layout.tsx`: Root layout -- wraps all pages with providers and shell
- `src/app/page.tsx`: Public landing page
- `src/app/dashboard/page.tsx`: Client dashboard (primary authenticated entry)
- `src/app/coach/page.tsx`: Coach portal entry (redirects to `/coach/dashboard`)
- `src/app/admin/page.tsx`: Admin portal entry
- `src/middleware.ts`: Request middleware (auth, CSRF, security headers)

**Configuration:**
- `next.config.js`: Next.js config (images, security headers, Sentry, webpack)
- `tailwind.config.js`: Tailwind CSS config (brand colors: navy, teal, orange; custom font scale)
- `tsconfig.json`: TypeScript config (strict mode, `@/*` path alias to `./src/*`)
- `.eslintrc.json`: ESLint rules
- `postcss.config.js`: PostCSS config
- `.env.example`: Environment variable template (existence noted only)

**Core Logic:**
- `src/contexts/BusinessContext.tsx`: Multi-tenancy context (user, business, permissions)
- `src/lib/auth/roles.ts`: System role resolution (super_admin, coach, client)
- `src/lib/permissions/index.ts`: Section-level permission checking and navigation filtering
- `src/lib/supabase/client.ts`: Browser Supabase client (singleton)
- `src/lib/supabase/server.ts`: Server Supabase client (server components + route handlers)
- `src/lib/supabase/admin.ts`: Service role client (bypasses RLS)
- `src/lib/security/csrf.ts`: CSRF token generation and validation
- `src/lib/services/claude-cfo-agent.ts`: AI-powered financial forecast agent

**Error Handling:**
- `src/components/ErrorBoundary.tsx`: Global React error boundary
- `src/components/RouteError.tsx`: Reusable route error component
- `src/app/global-error.tsx`: Root-level error handler
- `src/app/not-found.tsx`: Custom 404 page
- `src/lib/error-logger.ts`: Client-side error logging to DB

**Testing/Scripts:**
- `scripts/smoke-test.sh`: Post-build smoke test
- `scripts/test-before-merge.sh`: Pre-merge validation
- `scripts/run-migration.js`: Migration runner utility

## Naming Conventions

**Files:**
- Page components: `page.tsx` (Next.js convention)
- Error boundaries: `error.tsx` (Next.js convention)
- Layouts: `layout.tsx` (Next.js convention)
- API routes: `route.ts` (Next.js convention)
- Components: `PascalCase.tsx` (e.g., `StepHeader.tsx`, `PageLayout.tsx`)
- Hooks: `camelCase.ts` with `use` prefix (e.g., `useActiveBusinessId.ts`, `useDashboardData.ts`)
- Services: `kebab-case.ts` (e.g., `stop-doing-service.ts`, `strategic-planning-service.ts`)
- Types: `camelCase.ts` or `kebab-case.ts` (e.g., `types.ts`, `process-builder.ts`)
- Utilities: `camelCase.ts` or `kebab-case.ts` (e.g., `formatting.ts`, `rate-limiter.ts`)

**Directories:**
- Feature routes: `kebab-case` (e.g., `business-dashboard/`, `quarterly-review/`, `stop-doing/`)
- Component dirs: `PascalCase` for specific components (e.g., `ProcessDiagram/`), `kebab-case` for categories (e.g., `process-mapper/`)
- API routes: `kebab-case` (e.g., `monthly-report/`, `forecast-wizard-v4/`) except `Xero/` (PascalCase -- inconsistency)

## Where to Add New Code

**New Feature Module (e.g., a new business tool):**
- Create route directory: `src/app/{feature-name}/page.tsx`
- Co-locate feature code:
  - `src/app/{feature-name}/components/` -- feature-specific components
  - `src/app/{feature-name}/hooks/` -- feature-specific hooks
  - `src/app/{feature-name}/services/` -- feature-specific DB services
  - `src/app/{feature-name}/types.ts` -- feature-specific types
  - `src/app/{feature-name}/error.tsx` -- route error boundary (use `<RouteError section="..." />`)
- Add API routes if needed: `src/app/api/{feature-name}/route.ts`
- Register in coach view: Add entry to component map in `src/app/coach/clients/[id]/view/[...path]/page.tsx`
- Add to sidebar navigation: Update `src/components/layout/sidebar-layout.tsx`
- Add section permission: Update `src/lib/permissions/index.ts`

**New API Route:**
- Create at: `src/app/api/{resource}/route.ts`
- Export named HTTP method functions: `export async function GET(request: Request) {}`
- Set `export const dynamic = 'force-dynamic'`
- Use `createRouteHandlerClient()` from `src/lib/supabase/server.ts` for authenticated routes
- Use `createServiceRoleClient()` from `src/lib/supabase/admin.ts` when bypassing RLS
- Always verify auth via `supabase.auth.getUser()` and check business access

**New Shared Component:**
- UI primitives: `src/components/ui/{ComponentName}.tsx`
- Portal-specific: `src/components/{portal}/{ComponentName}.tsx`
- Feature-specific: `src/app/{feature}/components/{ComponentName}.tsx`

**New Shared Hook:**
- Global hooks: `src/hooks/use{HookName}.ts`
- Feature-specific: `src/app/{feature}/hooks/use{HookName}.ts`

**New Shared Service/Utility:**
- Service functions: `src/lib/services/{service-name}.ts`
- Utility functions: `src/lib/utils/{utility-name}.ts`
- Feature-specific services: `src/app/{feature}/services/{service-name}.ts`

**New Database Migration:**
- Location: `supabase/migrations/{timestamp}_{description}.sql`
- Naming: `YYYYMMDDHHMMSS_{description}.sql` (e.g., `20260405_add_new_table.sql`)
- Always include RLS policies for new tables
- Update `src/lib/supabase/types.ts` if adding new tables (manual, not auto-generated)

**New Supabase Edge Function:**
- Location: `supabase/functions/{function-name}/index.ts`
- Runtime: Deno
- Used for background tasks (notifications, reminders, scheduled jobs)

## Special Directories

**`_archive/`:**
- Purpose: Archived/deprecated code kept for reference
- Generated: No
- Committed: Yes (untracked in current git status)

**`.archive/`:**
- Purpose: Additional archived code
- Generated: No
- Committed: Yes

**`.next/`:**
- Purpose: Next.js build output and cache
- Generated: Yes (by `next build` and `next dev`)
- Committed: No (in `.gitignore`)

**`node_modules/`:**
- Purpose: npm dependencies
- Generated: Yes (by `npm install`)
- Committed: No (in `.gitignore`)

**`.aws-sam/`:**
- Purpose: AWS SAM build artifacts for Lambda functions
- Generated: Yes (by SAM CLI)
- Committed: No

**`supabase/.branches/` and `supabase/.temp/`:**
- Purpose: Supabase CLI working directories
- Generated: Yes
- Committed: No

**`docs/`:**
- Purpose: Development documentation, build logs, design conversations
- Generated: No (manual documentation)
- Committed: Yes

**`public/images/`:**
- Purpose: Static assets served directly (logos, favicon, brand images)
- Generated: No
- Committed: Yes

---

*Structure analysis: 2026-04-04*
