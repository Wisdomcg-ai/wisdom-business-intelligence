# Technology Stack

**Analysis Date:** 2026-04-04

## Languages

**Primary:**
- TypeScript 5.3+ - All application code (`src/**/*.ts`, `src/**/*.tsx`)
- SQL - Database migrations and seed files (`supabase/migrations/*.sql`)

**Secondary:**
- TypeScript (Deno) - Supabase Edge Functions (`supabase/functions/*/index.ts`)
- JavaScript - Configuration files (`next.config.js`, `tailwind.config.js`, `postcss.config.js`)

## Runtime

**Environment:**
- Node.js 20 (specified in `.nvmrc`)
- Deno - Supabase Edge Functions runtime (`supabase/functions/`)

**Package Manager:**
- npm (lockfile: `package-lock.json` present)

## Frameworks

**Core:**
- Next.js 14.2 (`next@^14.2.35`) - Full-stack React framework using App Router
- React 18.2 (`react@^18.2.0`) - UI library
- React DOM 18.2 (`react-dom@^18.2.0`)

**Styling:**
- Tailwind CSS 3.4 (`tailwindcss@^3.4.18`) - Utility-first CSS, configured in `tailwind.config.js`
- PostCSS 8.5 (`postcss@^8.5.6`) + Autoprefixer (`autoprefixer@^10.4.21`)
- `clsx@^2.1.1` + `tailwind-merge@^3.4.0` - Conditional class name utilities

**Testing:**
- No test framework installed. No `jest`, `vitest`, `playwright`, or `cypress` in dependencies.

**Build/Dev:**
- Next.js built-in bundler (Webpack with custom config in `next.config.js`)
- ESLint 8.56 (`eslint@^8.56.0`) with `eslint-config-next@14.0.4` (flat config in `eslint.config.mjs`)
- `sharp@^0.34.5` - Image optimization (used by Next.js `<Image>`)
- `sucrase@^3.35.1` - Fast TypeScript compilation for scripts

## Key Dependencies

**Critical:**
- `@supabase/ssr@^0.7.0` - Server-side Supabase client for Next.js App Router (primary auth/data client)
- `@supabase/supabase-js@^2.76.1` - Supabase JavaScript client (used for admin/service-role client)
- `@supabase/auth-helpers-nextjs@^0.10.0` - Legacy auth helpers (may be superseded by `@supabase/ssr`)
- `@anthropic-ai/sdk@^0.39.0` - Anthropic Claude AI integration (primary AI provider)
- `openai@^5.13.1` - OpenAI GPT integration (fallback AI provider)
- `resend@^6.5.2` - Email delivery service

**Data & Visualization:**
- `recharts@^3.5.0` - Chart/graph library for dashboards and reports
- `exceljs@^4.4.0` - Excel file generation for exports
- `xlsx@^0.18.5` - Excel file parsing for imports
- `jspdf@^3.0.4` + `jspdf-autotable@^5.0.2` - PDF generation

**UI Components:**
- `@heroicons/react@^2.2.0` - Icon library
- `lucide-react@^0.309.0` - Additional icon library (optimized via `next.config.js` barrel file optimization)
- `react-hot-toast@^2.6.0` - Toast notifications (legacy, being replaced)
- `sonner@^2.0.7` - Toast notifications (current, used in root layout)
- `react-hook-form@^7.62.0` + `@hookform/resolvers@^5.2.1` - Form management
- `zod@^4.0.17` - Schema validation (used with react-hook-form resolvers)

**Drag & Drop:**
- `@dnd-kit/core@^6.3.1` + `@dnd-kit/sortable@^10.0.0` + `@dnd-kit/utilities@^3.2.2` - Modern DnD library
- `@hello-pangea/dnd@^18.0.1` - Alternative DnD library (Atlassian-style, used in some views)

**Accounting Integration:**
- `xero-node@^13.0.0` - Xero accounting API SDK (listed but direct Xero API calls via `fetch` are used instead)

**Utilities:**
- `date-fns@^4.1.0` - Date manipulation
- `uuid@^13.0.0` - UUID generation
- `axios@^1.11.0` - HTTP client (limited usage)
- `jsonwebtoken@^9.0.2` - JWT handling
- `dotenv@^17.2.3` - Environment variable loading for scripts

**Process Mapping (niche):**
- `bpmn-moddle@^9.0.4` - BPMN diagram data model
- `diagram-js@^15.4.0` - Diagram rendering engine

**Virtualization:**
- `@tanstack/react-virtual@^3.13.12` - Virtual list rendering for large datasets

## State Management

**Server State:**
- Supabase client queries (no React Query / SWR). Data is fetched directly via `supabase.from().select()` in components and API routes.

**Client State:**
- React Context: `BusinessContext` (`src/contexts/BusinessContext.tsx`) - Global active business and viewer permissions
- Zustand 5.0 (`zustand@^5.0.8`) with `persist` middleware - Process wizard state (`src/lib/store/wizardStore.ts`)
- React `useState`/`useReducer` for local component state

**Pattern:** Most state management relies on Supabase queries in components + a single React Context for business/user context. Zustand is used sparingly for wizard flows that need persistence.

## Database

**Provider:** Supabase (PostgreSQL)
- Connection: `NEXT_PUBLIC_SUPABASE_URL` env var
- 102 migration files in `supabase/migrations/`
- Row-Level Security (RLS) extensively used (multiple RLS migration files)
- Supabase Auth for user management
- Supabase Storage for file attachments (bucket: `message-attachments`)

**Access Patterns:**
- Browser client (singleton): `src/lib/supabase/client.ts` - uses `createBrowserClient` from `@supabase/ssr`
- Server component client: `src/lib/supabase/server.ts` - `createServerComponentClient()` and `createRouteHandlerClient()`
- Admin/Service role client: `src/lib/supabase/admin.ts` - `createServiceRoleClient()` bypasses RLS

## Authentication

**Provider:** Supabase Auth
- Email/password authentication
- Cookie-based sessions managed via `@supabase/ssr`
- Middleware-enforced authentication (`src/middleware.ts`)

**Role System:**
- Three roles: `super_admin`, `coach`, `client` (defined in `src/lib/auth/roles.ts`)
- Roles stored in `system_roles` table with fallback to `users.system_role` column
- Permissions system for team members (`src/lib/permissions/index.ts`)
- Business-scoped viewer context: `owner | admin | member | viewer | coach` (`src/contexts/BusinessContext.tsx`)

## Security

**CSRF Protection:**
- Token-based CSRF via middleware (`src/middleware.ts`) and helpers (`src/lib/security/csrf.ts`)

**Content Security Policy:**
- Full CSP headers set in middleware, including Supabase, Xero, OpenAI, and Stripe frame sources

**Rate Limiting:**
- In-memory rate limiter (`src/lib/utils/rate-limiter.ts`) with per-route configs (auth: 5/15min, AI: 30/hr, API: 100/min)

**AI Input Sanitization:**
- Prompt injection detection and input sanitization (`src/lib/utils/ai-sanitizer.ts`)

**Encryption:**
- AES-256-GCM encryption for Xero tokens at rest (`src/lib/utils/encryption.ts`)
- HMAC-signed OAuth state parameters

**Security Headers:**
- X-Frame-Options, X-Content-Type-Options, HSTS, Referrer-Policy set in both middleware and `next.config.js`

## Configuration

**TypeScript:**
- `tsconfig.json`: Strict mode enabled, ES2020 target, `@/*` path alias to `./src/*`

**Next.js (`next.config.js`):**
- ESLint ignored during builds
- React strict mode enabled
- Image optimization (AVIF, WebP)
- Custom security headers and caching
- Optional Sentry integration (conditionally loaded)
- Package import optimization for `lucide-react`

**Tailwind (`tailwind.config.js`):**
- Custom brand colors: `brand-navy` (#172238), `brand-teal` (#0d9488), `brand-orange` (#F5821F)
- Enhanced font scale (all sizes bumped up for readability)
- Custom animations (fadeIn, dropdown enter/exit)

**Environment Variables (from `.env.example`):**
- Required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- Required: `NEXT_PUBLIC_APP_URL` (production: `https://wisdombi.ai`)
- Email: `RESEND_API_KEY`
- AI: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`
- Xero: `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, `NEXT_PUBLIC_XERO_API_URL`
- Encryption: `APP_SECRET_KEY` or `ENCRYPTION_KEY`
- Cron: `CRON_SECRET`, `ADMIN_EMAIL`
- Optional: `SENTRY_ORG`, `SENTRY_PROJECT`

## Platform Requirements

**Development:**
- Node.js 20+ (per `.nvmrc`)
- npm
- Supabase CLI (for local development with edge functions and migrations)
- `.env.local` file with Supabase credentials at minimum

**Production:**
- Deployed to hosting platform (no Vercel config, Dockerfile, or CI/CD config detected in repo)
- Domain: `wisdombi.ai` (referenced in CSP, email templates, and app URL)
- Supabase hosted project for database, auth, storage, and edge functions
- Resend for transactional email (domain: `mail.wisdombi.ai`)

## Scripts

```bash
npm run dev          # Start Next.js dev server
npm run build        # Production build
npm run start        # Start production server
npm run lint         # Run ESLint
npm run smoke-test   # Run smoke tests (shell script)
npm run verify       # Build + lint + smoke test
```

**Utility scripts in `scripts/`:**
- `smoke-test.sh` - Smoke testing
- `test-before-merge.sh` - Pre-merge verification
- `run-migration.js` - Database migration runner
- `run-payroll-migration.js` - Payroll-specific migration
- `pre-refactor-snapshot.sh` - Pre-refactor backup
- `rollback.sh` - Rollback utility

---

*Stack analysis: 2026-04-04*
