# External Integrations

**Analysis Date:** 2026-04-04

## APIs & External Services

### AI / LLM Providers

**Anthropic Claude (Primary AI):**
- Used for: Financial forecast wizard (CFO Copilot), salary estimation, forecast assistant chat
- SDK: `@anthropic-ai/sdk@^0.39.0`
- Auth: `ANTHROPIC_API_KEY` env var
- Models used:
  - `claude-sonnet-4-20250514` - Main forecast assistant conversations (`src/app/api/ai/forecast-assistant/route.ts`)
  - `claude-haiku-3-5-20241022` - Fast parsing/estimation tasks, salary advisor (`src/app/api/ai/advisor/route.ts`)
  - `claude-opus-4-20250514` - Review/analysis tasks (`src/lib/services/claude-cfo-agent.ts`)
- Key files:
  - `src/lib/services/claude-cfo-agent.ts` - CFO Copilot service with step-by-step forecast wizard prompts
  - `src/app/api/ai/forecast-assistant/route.ts` - Forecast assistant API route
  - `src/app/api/ai/advisor/route.ts` - Salary and project cost advisor
- Pattern: Anthropic is tried first; on failure, falls back to OpenAI

**OpenAI (Secondary/Fallback AI):**
- Used for: Business strategy suggestions, process mapping, session transcript analysis, wizard chat
- SDK: `openai@^5.13.1`
- Auth: `OPENAI_API_KEY` env var
- Models used:
  - `gpt-4` - Primary OpenAI model for strategy/analysis
  - `gpt-3.5-turbo` - Fallback when GPT-4 fails or for cost savings
- Key files:
  - `src/app/api/ai-assist/route.ts` - Business strategy field suggestions (OpenAI only, GPT-4 with GPT-3.5 fallback)
  - `src/app/api/wizard/chat/route.ts` - Process mapping wizard chat (OpenAI only)
  - `src/app/api/processes/ai-mapper/route.ts` - Process diagram AI mapper (OpenAI only)
  - `src/app/api/sessions/[id]/analyze-transcript/route.ts` - Coaching session transcript analysis (OpenAI only)
- Note: `src/lib/ai/openaiParser.ts` is a stub/placeholder with no real AI calls

**AI Security Measures:**
- All AI routes require Supabase authentication
- Rate limiting: 30 requests/hour per user (configured in `src/lib/utils/rate-limiter.ts`)
- Input sanitization: Prompt injection detection via `src/lib/utils/ai-sanitizer.ts`
- Input length limits: User messages 5000 chars, transcripts 50000 chars, field values 1000 chars
- Conversation history limited to 10 messages per request

### Xero Accounting Integration

**Xero API:**
- Used for: Syncing financial data (P&L, chart of accounts, employees, invoices, transactions), OAuth2 authentication
- SDK: `xero-node@^13.0.0` is installed but **direct `fetch` calls to Xero API are used** instead
- Auth: OAuth2 flow with `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`
- Token endpoint: `https://identity.xero.com/connect/token`
- API calls via AWS Lambda proxy: `NEXT_PUBLIC_XERO_API_URL` (default: `https://fxbc3bbjo9.execute-api.ap-southeast-2.amazonaws.com/Prod`)
- Key files:
  - `src/lib/api/xero-client.ts` - Client-side Xero API wrapper (calls AWS Lambda endpoints)
  - `src/lib/xero/token-manager.ts` - Token refresh with retry, locking, and error categorization
  - `src/lib/utils/encryption.ts` - AES-256-GCM encryption for Xero tokens at rest
  - `src/app/api/Xero/` - 14+ API routes for Xero operations:
    - `auth/` - Initiate OAuth flow
    - `callback/` - Handle OAuth callback
    - `status/` - Check connection status
    - `sync/`, `sync-all/`, `sync-forecast/` - Data synchronization
    - `accounts/`, `chart-of-accounts/` - Account data
    - `employees/` - Employee data for forecast wizard
    - `pl-summary/` - Profit & Loss summaries
    - `reconciliation/` - Bank reconciliation data
    - `subscription-transactions/` - Subscription tracking
    - `refresh-tokens/` - Manual token refresh
    - `reactivate/` - Reactivate expired connections
    - `pending-connection/`, `complete-connection/` - Multi-step connection flow

**Xero Token Management:**
- Tokens encrypted with AES-256-GCM before storage in `xero_connections` table
- Auto-refresh 15 minutes before expiry
- Database-level locking to prevent concurrent refresh (via `token_refreshing_at` column)
- Retry with exponential backoff (3 attempts)
- Automatic deactivation on permanent errors (invalid_grant, access_denied)
- Health monitoring via `src/lib/health-checks.ts`

### Email (Resend)

**Resend:**
- Used for: Transactional email (client invitations, password resets, session reminders, message notifications)
- SDK: `resend@^6.5.2`
- Auth: `RESEND_API_KEY` env var
- From address: `WisdomBI <noreply@mail.wisdombi.ai>`
- Key files:
  - `src/lib/email/resend.ts` - Email service with branded HTML templates
  - `src/app/api/email/send/route.ts` - General email sending endpoint
  - `src/app/api/email/test/route.ts` - Email branding test endpoint
- Email types implemented:
  - `sendClientInvitation()` - New client onboarding emails with temp password
  - `sendPasswordReset()` - Password reset with expiry link
  - `sendSessionReminder()` - Coaching session reminders with meeting link
  - `sendMessageNotification()` - New chat message alerts
  - `sendTestEmail()` - Branding verification
- Rate limit: 10 emails/hour per user
- All user content HTML-escaped to prevent XSS in emails

## Data Storage

**Database:**
- Supabase PostgreSQL (hosted)
- Connection: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Admin: `SUPABASE_SERVICE_ROLE_KEY`
- 102 migration files spanning Nov 2024 - Apr 2026
- Extensive RLS policies for multi-tenant data isolation
- Key tables (inferred from code): `businesses`, `users`, `system_roles`, `business_profiles`, `assessments`, `xero_connections`, `notifications`, `notification_preferences`, `client_error_logs`, `financial_forecasts`, `forecast_assumptions`

**File Storage:**
- Supabase Storage
- Bucket: `message-attachments` for chat file uploads
- Documents bucket for shared business documents
- Max file size: 10MB
- Key files:
  - `src/lib/services/messageAttachments.ts` - Upload/download service
  - `src/app/api/documents/route.ts` - Document CRUD
  - `src/app/api/documents/[id]/download/route.ts` - Document downloads

**Caching:**
- No dedicated caching layer (no Redis, Memcached)
- In-memory rate limit storage (`Map` in `src/lib/utils/rate-limiter.ts`)
- Next.js built-in caching for static assets and images
- Admin client uses `cache: 'no-store'` to bypass caching

## Authentication & Identity

**Auth Provider:** Supabase Auth
- Implementation: Email/password with cookie-based sessions
- Middleware: `src/middleware.ts` - Handles auth check, CSRF tokens, security headers
- Client: `@supabase/ssr` package creates properly configured server/browser clients
- Role system: `super_admin | coach | client` stored in `system_roles` table
- Key files:
  - `src/lib/supabase/client.ts` - Browser client (singleton)
  - `src/lib/supabase/server.ts` - Server component + route handler clients
  - `src/lib/supabase/admin.ts` - Service role client (bypasses RLS)
  - `src/lib/auth/roles.ts` - Role checking utilities
  - `src/contexts/BusinessContext.tsx` - Client-side auth/business context
- Auth routes:
  - `src/app/api/auth/logout/` - Session termination
  - `src/app/api/auth/reset-password/` - Password reset initiation
  - `src/app/api/auth/update-password/` - Password update

## Monitoring & Observability

**Error Tracking:**
- Sentry (optional, not currently installed) - Conditionally loaded in `next.config.js`
- Custom error tracker: `src/lib/utils/error-tracking.ts` - In-memory error queue with severity levels
- Logs to console in dev; logs to console in production (Sentry fallback)

**Logs:**
- `console.log` / `console.error` with bracket-prefix conventions: `[Email]`, `[Token Manager]`, `[ai/advisor]`
- Custom logger utility: `src/lib/utils/logger.ts`

**Health Checks:**
- `src/lib/health-checks.ts` - Checks database, auth, error rate, and Xero connection health
- `src/app/api/health/` - Health check API endpoint
- `src/app/api/cron/daily-health-report/` - Daily health report sent via email to admin

## Supabase Edge Functions

**Scheduled Functions (Deno runtime):**

- `supabase/functions/send-notifications/index.ts`
  - Purpose: Process queued notifications and send emails via Resend
  - Schedule: Every 15 minutes
  - Uses: Supabase service role client, Resend API (direct fetch)

- `supabase/functions/check-session-reminders/index.ts`
  - Purpose: Check for upcoming coaching sessions and create reminder notifications

- `supabase/functions/check-actions-due/index.ts`
  - Purpose: Check for overdue action items and create notifications

## Cron Jobs

**Via API Routes (secured with `CRON_SECRET`):**
- `src/app/api/cron/daily-health-report/route.ts` - Daily health report email to admin
  - Auth: Bearer token via `CRON_SECRET` env var
  - Runs health checks + gathers usage statistics
  - Emails report to `ADMIN_EMAIL`

## CI/CD & Deployment

**Hosting:**
- No Vercel config (`vercel.json`), Dockerfile, or `.github/` directory detected
- Domain: `wisdombi.ai` (referenced in CSP headers, email templates, and `NEXT_PUBLIC_APP_URL`)
- Supabase hosted project for backend services

**CI Pipeline:**
- No CI/CD configuration files detected in repository
- Manual verification via `npm run verify` (build + lint + smoke test)

## Webhooks & Callbacks

**Incoming:**
- `src/app/api/Xero/callback/` - Xero OAuth2 callback endpoint
- CSP allows frames from `https://js.stripe.com` and `https://login.xero.com`

**Outgoing:**
- Resend email delivery (via SDK and direct API calls in Edge Functions)
- Xero API calls via AWS Lambda proxy (`NEXT_PUBLIC_XERO_API_URL`)
- Anthropic Claude API calls
- OpenAI API calls

## Environment Configuration

**Required env vars:**
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` - Admin database access

**Feature-specific env vars:**
- `RESEND_API_KEY` - Email delivery
- `OPENAI_API_KEY` - OpenAI AI features
- `ANTHROPIC_API_KEY` - Claude AI features (CFO Copilot, forecast wizard)
- `XERO_CLIENT_ID` + `XERO_CLIENT_SECRET` - Xero OAuth
- `NEXT_PUBLIC_XERO_API_URL` - Xero API proxy endpoint
- `APP_SECRET_KEY` or `ENCRYPTION_KEY` - Token encryption key
- `CRON_SECRET` - Cron job authentication
- `ADMIN_EMAIL` - Daily health report recipient
- `NEXT_PUBLIC_APP_URL` - Application base URL
- `SENTRY_ORG` + `SENTRY_PROJECT` - Optional Sentry error tracking

**Env validation:** `src/lib/utils/env-validation.ts` validates required vars at startup and warns about missing optional vars.

**Secrets location:**
- `.env.local` file (gitignored)
- `.env.example` provides template with placeholder values
- Supabase Edge Functions use Supabase Secrets (Deno.env)

## Third-Party Service Summary

| Service | Purpose | Auth Mechanism | Key File |
|---------|---------|----------------|----------|
| Supabase | DB, Auth, Storage, Edge Functions | URL + anon/service key | `src/lib/supabase/*.ts` |
| Anthropic Claude | Primary AI (forecasting, advisor) | API key | `src/lib/services/claude-cfo-agent.ts` |
| OpenAI | Secondary AI (strategy, process mapping) | API key | `src/app/api/ai-assist/route.ts` |
| Xero | Accounting data sync | OAuth2 via AWS Lambda | `src/lib/xero/token-manager.ts` |
| Resend | Transactional email | API key | `src/lib/email/resend.ts` |
| Sentry | Error tracking (optional) | Org + Project config | `next.config.js` |

---

*Integration audit: 2026-04-04*
