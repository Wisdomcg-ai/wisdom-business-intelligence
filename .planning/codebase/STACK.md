# Technology Stack

**Analysis Date:** 2026-05-30

---

## Languages

**Primary:**
- TypeScript 5.9.3 (installed) / `^5.3.3` (declared) — all application code in `src/`
  - Strict mode enabled (`"strict": true` in `tsconfig.json`)
  - `noUnusedLocals` and `noUnusedParameters` are both **off** — dead code accumulates silently
  - Target: `ES2020`, module resolution: `node` (not `bundler` — see Stability Flags below)

**Secondary:**
- JavaScript (`.js`) — `next.config.js`, `tailwind.config.js`, `postcss.config.js`
- SQL — 45 Supabase migrations in `supabase/migrations/`
- TypeScript/Deno — three Supabase Edge Functions in `supabase/functions/` (Deno runtime, likely undeployed — see CONCERNS)

---

## Runtime

**Environment:**
- Node.js 20 (`.nvmrc` pins `20`; `node --version` on dev machine: `v20.20.1`)
- Vercel Serverless (Node.js runtime) for all API routes and pages
- Edge Runtime used only by `src/middleware.ts` — verified by ESLint override blocking `crypto`, `fs`, `path`, `child_process` imports in that file

**Package Manager:**
- npm (lockfile: `package-lock.json` present)

---

## Frameworks

**Core:**
- Next.js 14.2.35 (installed) / `^14.2.35` (declared) — App Router, not Pages Router
  - React 18.3.1
  - `reactStrictMode: true`
  - All pages use `'use client'` or `export const dynamic = 'force-dynamic'` — **no static generation in use**
  - Middleware runs on Edge Runtime (`src/middleware.ts`)

**UI:**
- Tailwind CSS `^3.4.18` — utility-first; config at `tailwind.config.js`
- `tailwind-merge ^3.4.0` — runtime class merging
- `lucide-react ^0.309.0` — icon library (barrel-file optimization enabled in `next.config.js`)
- `@heroicons/react ^2.2.0` — secondary icon set (two icon libraries in use)
- `recharts ^3.5.0` — charting
- `@tanstack/react-virtual ^3.13.12` — virtualized lists
- `sonner ^2.0.7` + `react-hot-toast ^2.6.0` — **two toast libraries** (redundancy; see CONCERNS)

**Forms:**
- `react-hook-form ^7.62.0` + `@hookform/resolvers ^5.2.1`
- `zod ^4.0.17` — schema validation

**Drag-and-Drop:**
- `@dnd-kit/core ^6.3.1`, `@dnd-kit/sortable ^10.0.0`, `@dnd-kit/utilities ^3.2.2`
- `@hello-pangea/dnd ^18.0.1` — **two drag-and-drop libraries** (redundancy; see CONCERNS)

**State:**
- `zustand ^5.0.8` — global state (forecast wizard store in `src/lib/store/wizardStore.ts`)
- React local state for most components

**Data / Formatting:**
- `date-fns ^4.1.0` — date utilities (v4 is current stable; v3→v4 is a breaking change)
- `uuid ^13.0.0` — ID generation

**Export / File:**
- `exceljs ^4.4.0` — Excel export
- `xlsx ^0.18.5` — secondary spreadsheet library (**known security issues in SheetJS community edition** — see CONCERNS)
- `jspdf ^3.0.4` + `jspdf-autotable ^5.0.2` — PDF generation

**Process Diagrams:**
- `bpmn-moddle ^9.0.4` + `diagram-js ^15.4.0` — BPMN diagramming

**Email Templates:**
- `@react-email/components ^1.0.1` — React email component library (installed alongside the custom HTML-string templates in `src/lib/email/resend.ts`; unclear if actively used)

---

## Testing

**Unit/Integration:**
- Vitest 4.1.4 — config at `vitest.config.ts`; environment: `jsdom`
- `@testing-library/react ^16.3.2` + `@testing-library/jest-dom ^6.9.1` + `@testing-library/user-event ^14.6.1`
- `@vitejs/plugin-react ^6.0.1` — JSX transform for tests
- 91 test files under `src/__tests__/` and co-located in `src/lib/`
- Run commands:
  ```bash
  npm test          # vitest run (CI)
  npm run test:watch  # vitest (watch mode)
  ```

**E2E:**
- Playwright 1.59.1 — config at `playwright.config.ts`; Chromium only; tests in `e2e/`
- Uses production build (`npm run build && npm run start`) not dev server
- Run commands:
  ```bash
  npm run test:e2e
  npm run test:e2e:ui
  npm run test:e2e:headed
  ```

---

## Build / Dev Tooling

- `next build` — production build (wraps with Sentry + bundle-analyzer)
- `next dev` — local dev server
- `@next/bundle-analyzer ^16.2.4` — enabled via `ANALYZE=true npm run build` (or `npm run analyze`)
- `sharp ^0.34.5` — image optimization (peer dep of Next.js image)
- `sucrase ^3.35.1` — fast TypeScript transpiler (used by build tooling, not app code)
- ESLint 8.56.0 — config at `.eslintrc.json`; extends `next/core-web-vitals`
  - `eslint-config-next 14.0.4` — version **pinned to 14.0.4** while Next.js is 14.2.35 (minor drift, low risk)
  - Edge-runtime-safe import restrictions on `src/middleware.ts`
- PostCSS — `postcss.config.js`
- Autoprefixer — `autoprefixer ^10.4.21`
- `dotenv ^17.2.3` — env loading (for scripts; Next.js handles `.env.local` natively)

---

## Key Dependencies

**Critical (prod stability):**
- `@supabase/supabase-js ^2.76.1` (installed 2.87.1) — database + auth client
- `@supabase/ssr ^0.7.0` — server/edge Supabase client
- `@supabase/auth-helpers-nextjs ^0.10.0` — **legacy auth helper, Supabase has deprecated this package** in favor of `@supabase/ssr`; both are present (see CONCERNS)
- `xero-node ^13.0.0` (installed 13.3.0) — Xero SDK package present but **not imported anywhere in `src/`**; all Xero API calls use raw `fetch` (see CONCERNS)
- `@sentry/nextjs ^10.48.0` (installed 10.48.0)
- `resend ^6.5.2` (installed 6.6.0) — transactional email

**AI:**
- `@anthropic-ai/sdk ^0.39.0` — Claude API (primary AI for CFO agent and advisor)
- `openai ^5.13.1` — OpenAI GPT fallback (used in `src/app/api/ai/advisor/route.ts` and wizard chat)

**Utilities:**
- `jsonwebtoken ^9.0.2` — JWT signing (used in `src/lib/utils/encryption.ts` context for report link tokens)
- `clsx ^2.1.1` — class name utility

---

## Configuration Files

| File | Purpose |
|------|---------|
| `next.config.js` | Next.js config — image optimization, compression, security headers, Sentry+bundle-analyzer wrapping |
| `tsconfig.json` | TypeScript — strict mode, `@/*` path alias, excludes `supabase/functions` and `_archive` |
| `vercel.json` | Vercel cron schedule (5 crons) |
| `.nvmrc` | Node version pin: `20` |
| `tailwind.config.js` | Tailwind config |
| `postcss.config.js` | PostCSS config |
| `.eslintrc.json` | ESLint config |
| `vitest.config.ts` | Vitest config |
| `playwright.config.ts` | Playwright config |
| `sentry.server.config.ts` | Sentry server-side init |
| `sentry.client.config.ts` | Sentry client-side init (includes Session Replay) |
| `sentry.edge.config.ts` | Sentry edge-runtime init |
| `.env.example` | Canonical list of expected env vars |
| `supabase/config.toml` | Supabase local dev config |

---

## Environment Variable Surface

All env vars consumed by `src/` (via `process.env`):

**Required (app will hard-fail without these):**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
- `SUPABASE_SECRET_KEY` (or legacy `SUPABASE_SERVICE_KEY` / `SUPABASE_SERVICE_ROLE_KEY`)
- `XERO_CLIENT_ID` — Xero OAuth app client ID
- `XERO_CLIENT_SECRET` — Xero OAuth app secret
- `APP_SECRET_KEY` (or `ENCRYPTION_KEY`) — AES-256-GCM key for token encryption (must be 64-char hex or 44-char base64)
- `CRON_SECRET` — bearer token for all 5 cron routes (fail-closed gate)
- `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` — Sentry DSN (throws in production if absent)

**Required for specific features:**
- `RESEND_API_KEY` — email sending
- `ADMIN_EMAIL` — daily health report recipient
- `NEXT_PUBLIC_APP_URL` — OAuth redirect base URL (defaults to `http://localhost:3000`)
- `REPORT_LINK_SECRET` — HMAC signing for public report view tokens
- `OPENEXCHANGERATES_APP_ID` — FX rate sync for consolidation

**Optional / fallback:**
- `OPENAI_API_KEY` — OpenAI fallback for AI advisor routes
- `ANTHROPIC_API_KEY` — Claude for CFO agent and AI advisor
- `OAUTH_STATE_SECRET` — HMAC signing for Xero OAuth state (falls back to `APP_SECRET_KEY`)
- `REPORT_FROM_EMAIL` / `REPORT_FROM_NAME` — CFO report email sender
- `DEMO_CLIENT_EMAIL` / `DEMO_CLIENT_PASSWORD` — demo client seeding
- `NEXT_PUBLIC_XERO_API_URL` — Xero API base URL override (legacy AWS Lambda path, currently unused)

**Feature flags (runtime behaviour):**
- `FORECAST_INVARIANTS_STRICT` — when `true`, forecast read violations throw 500 instead of log
- `FORECAST_FX_VIA_ENGINE_DISABLE` — disables FX engine path
- `SECTION_PERMISSION_ENFORCE` — toggles section permission enforcement

**Deployment context (Vercel-injected):**
- `VERCEL_ENV` — `production` / `preview` / `development`
- `VERCEL_GIT_COMMIT_SHA` — current commit SHA
- `NODE_ENV` — standard

**Key-name aliases for Supabase secret key (all checked in order):**
`SUPABASE_SECRET_KEY` → `SUPABASE_SERVICE_KEY` → `SUPABASE_SERVICE_ROLE_KEY`
Resolver: `src/lib/supabase/keys.ts`

---

## Stability / Version Flags

| Item | Status | Risk |
|------|--------|------|
| Next.js 14.2.35 | Current patch of 14.x; Next.js 15 is available | Low — 14.x still maintained |
| `@supabase/auth-helpers-nextjs ^0.10.0` | **Deprecated** by Supabase; superseded by `@supabase/ssr` | Medium — both installed, divergence risk |
| `moduleResolution: "node"` in tsconfig | Old resolution mode; `bundler` is recommended for App Router | Low — functional but may hide import issues |
| `xlsx ^0.18.5` (SheetJS community) | Version 0.18.5 has known ReDoS and prototype-pollution CVEs | **High** — evaluate `exceljs` as sole export lib |
| `xero-node ^13.0.0` installed but never imported | Dead dependency adding ~3MB to node_modules | Low — remove to reduce attack surface |
| Dual toast libraries (`sonner` + `react-hot-toast`) | Two coexisting; bundle bloat | Low — consolidate |
| Dual DnD libraries (`@dnd-kit` + `@hello-pangea/dnd`) | Two coexisting; bundle bloat | Low — consolidate |
| `eslint-config-next 14.0.4` | Pinned behind Next.js 14.2.35 | Low — update to match Next.js |
| In-memory rate limiter (`src/lib/utils/rate-limiter.ts`) | Resets on every cold start; per-instance not per-cluster | Medium — ineffective on multi-instance Vercel |
| Supabase Edge Functions (`supabase/functions/`) | Deno-runtime code present; unclear deployment status | Medium — see INTEGRATIONS.md |

---

*Stack analysis: 2026-05-30*
