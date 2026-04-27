# Phase 35: Report Approval + Delivery Workflow — Research

**Researched:** 2026-04-23
**Domain:** Transactional email delivery (Resend) + signed-link snapshot view + UI status lifecycle controls
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Status transitions & actors**
- **D-01:** `draft → ready_for_review` requires an explicit "Mark Ready for Review" button, **coach-only** (coach/super_admin via `system_roles`). Clients cannot trigger. No auto-transition from `commentary_approved`.
- **D-02:** Coach can one-click approve-and-send from `draft` directly (skipping `ready_for_review`). `ready_for_review` remains valid for months where a two-step review is wanted.
- **D-03:** Coach can revert `approved` or `sent` → `draft` (admin action). Reverting clears `approved_at` and `sent_at`, preserves `snapshot_data` and `snapshot_taken_at` (audit trail of what was previously sent).
- **D-04:** Clients see the status pill as **read-only** (e.g. "Sent 3 April 2026"). No action buttons visible to non-coach users. Coach/super_admin see the pill plus the contextual action button.

**Email delivery**
- **D-05:** Transactional provider: **Resend**. Requires new env `RESEND_API_KEY`. Verified sending domain (likely `wisdombi.ai`).
- **D-06:** Email body = greeting + "View Report" button + PDF attachment. **No headline numbers and no AI narrative in the body.**
- **D-07:** PDF attachment is generated from the existing jsPDF layout editor output on the monthly report page. No new PDF engine.
- **D-08:** Subject line format: `{Business name} — {Month Year} financial report`.
- **D-09:** **From = assigned coach's email directly** (e.g., `mattmalouf@wisdomcg.com.au`). Reply-To = same. Requires each coach's email to be verified in Resend. Initial rollout covers Matt only.
- **D-10:** Recipient = `businesses.owner_email` only. No CC, no BCC.
- **D-11:** Send is **synchronous** — awaits Resend response. Success (2xx) → status='sent', `sent_at = now()`. Failure → stays 'approved', error toast, "Resend" button surfaces.
- **D-12:** **Timeout on Resend call: 15 seconds**.
- **D-13:** Coach can resend an already-sent report at any time. Each send is a new `cfo_email_log` row; `sent_at` updates to the most recent successful send.

**Audit & logging**
- **D-14:** New table `cfo_email_log` (append-only) with columns: `id uuid pk`, `cfo_report_status_id uuid fk`, `business_id uuid fk`, `period_month date`, `attempted_at timestamptz`, `triggered_by uuid fk auth.users`, `resend_message_id text nullable`, `status_code int nullable`, `error_message text nullable`, `recipient_email text`. Indexed on `(business_id, period_month)`. RLS: coach/super_admin read own business logs.
- **D-15:** `cfo_report_status.snapshot_data` is populated at the moment of first approval transition (`* → approved`). Contains the frozen report payload. Re-approval overwrites the snapshot.

**Edit-after-approval**
- **D-16:** Editing commentary text, section toggles, or template selection on an `approved` or `sent` report **auto-reverts** status to `draft` on save. Silent, pill updates immediately.
- **D-17:** "Edit" = coach-initiated changes only. **Xero actuals refresh does NOT trigger revert**.
- **D-18:** Prior `snapshot_data` is preserved when a report reverts to draft. The email already sent continues rendering the frozen snapshot at `/reports/view/[token]`.

**Report URL (email link)**
- **D-19:** New route `/reports/view/[token]` — public, no login, server-rendered, read-only. Renders `snapshot_data` (not live).
- **D-20:** Token scheme: signed JWT (or HMAC-signed compact format) encoding `cfo_report_status.id`. Signing secret = new env `REPORT_LINK_SECRET`.
- **D-21:** Tokens **do not expire**. Rotating `REPORT_LINK_SECRET` invalidates all existing tokens (global kill-switch).
- **D-22:** URL helper `buildReportUrl(business_id, period_month)` is forward-compatible with Phase 36: if `businesses.portal_slug` set, returns `/portal/[slug]?month=YYYY-MM`; otherwise token URL. Emails sent before Phase 36 keep token links working.

**Middleware & routing**
- **D-23:** `/reports/view/*` must be added to `onboardingExemptRoutes` in `src/middleware.ts` AND be auth-exempt (public read).

### Claude's Discretion

- Exact UI pill component styling (use existing status-pill patterns — CFO page uses Tailwind `bg-X-100 text-X-800` pattern).
- Snapshot payload shape — planner/researcher pick minimum fields needed.
- Whether "Mark Ready for Review" and "Approve & Send" are two buttons or one split-button.
- PDF attachment filename format (e.g. `{business-slug}-{yyyy-mm}-report.pdf`).
- Error toast copy.
- Logging of resend attempts (recommended: each attempt = new row).

### Deferred Ideas (OUT OF SCOPE)

- AI narrative in email body (Phase 24 territory).
- Dynamic subject line with key insight.
- Coach-written custom note per send.
- Bulk approve on /cfo dashboard.
- Async Resend bounce webhook handler.
- Per-business revocation column.
- Multi-recipient support (CC/BCC).
- Client "sign off" workflow.
- Phase 33 Iteration 2 follow-ups.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| APPR-01 | Monthly report page shows status pill reflecting current `cfo_report_status` (draft / ready_for_review / approved / sent) | Existing `useMonthlyReport` hook already queries snapshot_data; new sibling hook `useReportStatus(businessId, periodMonth)` reads `cfo_report_status`; Tailwind pill pattern mirrors CFO page REPORT_STATUS_STYLES lookup (src/app/cfo/page.tsx:87-93). |
| APPR-02 | "Approve & Send" button transitions status to approved and delivers email *(note: requirement says "Make.com webhook" but CONTEXT.md D-05 overrides to Resend direct email)* | `src/lib/email/resend.ts` already wraps Resend SDK — extend with `sendMonthlyReport()`. Existing `sendEmail()` function shows canonical `Resend.emails.send({...})` shape. Add PDF via `attachments: [{ filename, content: Buffer }]`. |
| APPR-03 | Successful send sets `sent_at` timestamp and transitions status to sent | Synchronous path in `POST /api/cfo/report-status`: Resend 2xx response → single transaction writes status='sent', sent_at=now(), inserts `cfo_email_log` row with resend_message_id. |
| APPR-04 | Send failure leaves status at approved with error toast | Try/catch around `sendEmail()`; log failure to `cfo_email_log` with error_message + status_code; return 207 to client; `sonner` toast at call site. Status stays 'approved' (coach can press Resend). |
| APPR-05 | Delivery destination configurable per business *(requirement says Make.com webhook URL, but CONTEXT.md overrides — recipient is `businesses.owner_email`, already exists)* | Column `businesses.owner_email` already exists (baseline_schema.sql line 1993, indexed line 6985). No new schema column needed for recipient. Email sender verification is a Resend-dashboard operation per coach. |
</phase_requirements>

## Summary

Phase 35 is almost entirely integration work — every dependency exists already. `resend` v6.6.0 is installed and a `src/lib/email/resend.ts` wrapper is live with 10+ production callers (invitations, password resets, weekly digests, team invites). `jspdf` v3.0.4 + the MonthlyReportPDFService class already produce the client-side PDF used in the existing "Export PDF" button. `jsonwebtoken` v9.0.2 is installed. `cfo_report_status` has every column the phase needs (status, approved_by, approved_at, sent_at, snapshot_data, snapshot_taken_at). `businesses.owner_email` exists and is indexed. Badge/pill styling conventions are established in `src/app/cfo/page.tsx`. Test infrastructure (vitest + Playwright) is live from Phase 40.

The only genuinely novel work is: (1) the `cfo_email_log` table + migration, (2) a POST `/api/cfo/report-status` endpoint that composes existing pieces, (3) a public `/reports/view/[token]` route that renders from `snapshot_data`, (4) a HMAC token helper (canonical pattern already in `src/lib/utils/encryption.ts`), (5) middleware exemption, (6) UI pill + action button block on the monthly report page top bar, (7) a browser-side PDF-then-upload flow to get the jsPDF output into the server route's Resend call.

**Primary recommendation:** Extend `src/lib/email/resend.ts` with a `sendMonthlyReport()` function; build `POST /api/cfo/report-status` mirroring the existing CFO route boilerplate; generate PDF client-side (reusing MonthlyReportPDFService, as the Export PDF button already does) and POST it as base64 alongside the status-change payload; use `crypto.createHmac` (not jsonwebtoken) to match the codebase's existing HMAC signing style in `src/lib/utils/encryption.ts`.

## Project Constraints (from CLAUDE.md)

No `CLAUDE.md` file exists at the repo root (verified with `cat CLAUDE.md` returning no output). User-level auto-memory in effect (from session context):
- **Only push to `wisdom-business-intelligence` repo** — any remote push must verify the remote first.
- **Go deep before deploying fixes** — trace root cause fully, plan before coding.
- **Dual business ID system** — any DB query that joins `forecast_pl_lines`, `xero_pl_lines`, or `financial_metrics` must query with `allRelatedIds = [businesses.id, business_profiles.id]`. Snapshot payload assembly must follow this pattern.
- **Design philosophy: simplicity over features** — matches D-06 (no numbers/narrative in email body).

## Standard Stack

### Core (already installed — no new deps required)

| Library | Installed Version | Purpose | Why Standard |
|---------|-------------------|---------|--------------|
| `resend` | 6.6.0 (installed; package.json pins ^6.5.2) | Transactional email SDK | Already in use across 10+ routes; project-wide wrapper in `src/lib/email/resend.ts`. Node >=20 engine. |
| `jspdf` | 3.0.4 | PDF generation (client-side) | Already powers Export PDF button; MonthlyReportPDFService class encapsulates. |
| `jspdf-autotable` | 5.0.2 | Table layouts in jsPDF | Already used by PDF service. |
| `jsonwebtoken` | 9.0.2 | JWT signing (optional alternative for token) | Installed but **not recommended for this phase** — see next section. |
| `crypto` (Node built-in) | n/a | HMAC-SHA256 token signing | Codebase already uses `crypto.createHmac('sha256', key)` pattern in `src/lib/utils/encryption.ts` with `createHmacSignature()` and `verifyHmacSignature()` helpers. Zero new deps. |
| `@supabase/supabase-js` | 2.76.1 | Service-role DB access from routes | Established CFO route pattern. |
| `@supabase/ssr` | 0.7.0 | Auth cookie reading in routes | Used by `createRouteHandlerClient()` for user-bound queries. |
| `sonner` | 2.0.7 | Toast notifications | Already imported in monthly-report page as `toast.error/info/success`. |

### Supporting

| Library | Installed Version | Purpose | When to Use |
|---------|-------------------|---------|-------------|
| `@react-email/components` | 1.0.1 | React-based email templates | Installed but the project's `resend.ts` wrapper uses plain HTML strings with escaping. For a single simple email, **stick with plain HTML string** — matches `sendClientInvitation`, `sendPasswordReset`, etc. Introducing React Email just for this phase adds complexity without payoff. |
| `vitest` | 4.1.4 | Unit tests | Existing tests at `src/lib/consolidation/*.test.ts`, `src/lib/cashflow/*.test.ts`, API route tests co-located as `route.test.ts`. |
| `@playwright/test` | 1.59.1 | E2E tests | `playwright.config.ts` + `tests/` dir exists (Phase 40). Current coach-flow.spec.ts uses `test.skip` pending test Supabase — not appropriate for this phase's primary validation. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| HMAC-SHA256 token | JWT via `jsonwebtoken` | JWT is more standard but overkill for a single numeric claim (`cfo_report_status_id`). Codebase already uses HMAC pattern. HMAC produces shorter URLs. **Recommendation: HMAC.** |
| Plain HTML email | `@react-email/components` | React Email is elegant but every other email in the project is plain HTML; introducing a dual paradigm is inconsistent. **Recommendation: plain HTML string, mirror existing `sendClientInvitation()` style.** |
| Client-then-upload PDF | Puppeteer server-side render | D-07 locks "reuse existing jsPDF output" — puppeteer would duplicate logic and add serverless cold-start pain. **Recommendation: generate in browser, POST as base64.** |
| `crypto.randomUUID()` for token nonce | Unnecessary — ID is non-guessable enough | A signed message with just `cfo_report_status_id` (UUID) is opaque — no additional nonce needed. |

**Installation:** No new packages. Confirm:
```bash
npm ls resend jsonwebtoken jspdf sonner  # All should show installed
```

**Version verification:** Verified from `node_modules/resend/package.json` (v6.6.0 installed). The installed version exceeds the pinned `^6.5.2`. No upgrade needed.

## Architecture Patterns

### Recommended File Structure (New files only)

```
src/
├── app/
│   ├── api/
│   │   └── cfo/
│   │       └── report-status/
│   │           └── route.ts              # POST handler (upsert + send)
│   └── reports/
│       └── view/
│           └── [token]/
│               ├── page.tsx              # Server component: verify → render snapshot
│               └── not-found.tsx         # Invalid token / missing snapshot UI
├── lib/
│   ├── email/
│   │   └── resend.ts                     # EXISTING — extend with sendMonthlyReport()
│   └── reports/
│       ├── report-link-token.ts          # NEW — signToken / verifyToken helpers
│       └── build-report-url.ts           # NEW — forward-compat helper per D-22
└── app/finances/monthly-report/
    └── components/
        └── ReportStatusBar.tsx           # NEW — pill + action button row
        └── (existing files extended)

supabase/
└── migrations/
    └── 20260424_cfo_email_log.sql        # NEW — table + RLS + index
```

### Pattern 1: CFO API Route (role-gated, dual-client)

**What:** Every `/api/cfo/*` route follows this structure.
**When to use:** `POST /api/cfo/report-status`.
**Example (distilled from `src/app/api/cfo/flag-client/route.ts`):**
```typescript
// Source: src/app/api/cfo/flag-client/route.ts + src/app/api/cfo/summaries/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createRouteHandlerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// Service-role client for DB writes that bypass RLS
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    // 1. Auth — who is calling?
    const authClient = await createRouteHandlerClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Role gate — coach or super_admin only
    const { data: roleRow } = await supabase
      .from('system_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle()
    const isSuperAdmin = roleRow?.role === 'super_admin'
    const isCoach = roleRow?.role === 'coach'
    if (!isSuperAdmin && !isCoach) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // 3. Parse + validate body
    const body = await request.json()
    // ... zod-style manual validation

    // 4. Coach-assignment guard (super_admin exempt)
    if (!isSuperAdmin) {
      const { data: biz } = await supabase
        .from('businesses').select('assigned_coach_id').eq('id', body.business_id).maybeSingle()
      if (!biz || biz.assigned_coach_id !== user.id) {
        return NextResponse.json({ error: 'Not your assigned client' }, { status: 403 })
      }
    }

    // 5. Business logic + DB write
    // ...

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Route Name] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

### Pattern 2: Resend Email Send

**What:** Extend `src/lib/email/resend.ts` with a new function; do NOT call `resend.emails.send()` directly from the route.
**Example shape:**
```typescript
// Execution environment: Next.js App Router API route (Node.js runtime, not Vercel Workflows).
// `setTimeout` and `AbortController` below are standard Node.js globals in this context.
// Source: src/lib/email/resend.ts pattern
export async function sendMonthlyReport(params: {
  to: string              // businesses.owner_email
  from: string            // assigned coach's email, e.g. "Matt Malouf <mattmalouf@wisdomcg.com.au>"
  replyTo: string
  businessName: string
  monthLabel: string      // "March 2026"
  clientGreetingName: string
  reportUrl: string       // from buildReportUrl helper
  pdfBuffer: Buffer       // from browser, base64-decoded
  pdfFilename: string     // "urban-road-2026-03-report.pdf"
}): Promise<EmailResult> {
  // Plain HTML template — matches sendClientInvitation style (no React Email)
  const html = `<!DOCTYPE html>...greeting...${getPrimaryButton(reportUrl, 'View Report')}...`
  const subject = `${escapeHtml(businessName)} — ${monthLabel} financial report`

  // Use AbortController for 15s timeout (D-12) — Resend SDK does not expose timeout
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    const { data, error } = await resend.emails.send({
      from, to, replyTo, subject, html,
      attachments: [{ filename: pdfFilename, content: pdfBuffer }],
    })
    if (error) return { success: false, error: error.message }
    return { success: true, id: data?.id }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown' }
  } finally {
    clearTimeout(timer)
  }
}
```

**Attachment handling verified from `node_modules/resend/dist/index.d.mts`:**
```typescript
interface Attachment {
  content?: string | Buffer       // Buffer or base64 string both accepted
  filename?: string | false | undefined
  path?: string                   // URL-hosted attachment (NOT needed here)
  contentType?: string            // auto-derived from filename
}
```
Resend attachment cap: **40 MB per email** (verified in SDK TSDoc comment). Our PDF will be under 5 MB typical.

**Error shape verified:**
```typescript
type RESEND_ERROR_CODE_KEY =
  'invalid_idempotency_key' | 'validation_error' | 'missing_api_key' |
  'restricted_api_key' | 'invalid_api_key' | 'not_found' | 'method_not_allowed' |
  'invalid_attachment' | 'invalid_from_address' | 'invalid_access' |
  'invalid_parameter' | 'invalid_region' | 'missing_required_field' |
  'monthly_quota_exceeded' | 'daily_quota_exceeded' | 'rate_limit_exceeded' |
  'security_error' | 'application_error' | 'internal_server_error'
```
**Critical:** `invalid_from_address` is the error code if the coach's email isn't yet verified in Resend. Surface this specifically in the toast copy so Matt knows to complete Resend sender verification for new coaches.

### Pattern 3: HMAC Token Signing

**What:** Use Node's `crypto.createHmac('sha256', ...)` — matches `src/lib/utils/encryption.ts`.
**Why not JWT:** Codebase has no JWT precedent; HMAC is already established for OAuth state. One less dependency in the trust boundary.
**Example:**
```typescript
// src/lib/reports/report-link-token.ts
import crypto from 'crypto'

// Compact format: base64url(statusId).base64url(sig)
export function signReportToken(statusId: string): string {
  const secret = process.env.REPORT_LINK_SECRET
  if (!secret) throw new Error('REPORT_LINK_SECRET not configured')
  const payload = Buffer.from(statusId, 'utf8').toString('base64url')
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

export function verifyReportToken(token: string): string | null {
  const secret = process.env.REPORT_LINK_SECRET
  if (!secret || !token.includes('.')) return null
  const [payload, sig] = token.split('.')
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url')
  try {
    const ok = crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
    if (!ok) return null
    return Buffer.from(payload, 'base64url').toString('utf8')  // the statusId
  } catch {
    return null
  }
}
```

### Pattern 4: Snapshot Rendering Route (public, server component)

**What:** App Router server component in `/reports/view/[token]/page.tsx`.
**Why server component:** Verifies token + loads `snapshot_data` on the server, never exposes the service key or the raw status ID to the browser. No client interactivity needed on the snapshot page (read-only).

```typescript
// src/app/reports/view/[token]/page.tsx — server component
import { notFound } from 'next/navigation'
import { verifyReportToken } from '@/lib/reports/report-link-token'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export default async function ReportViewPage({ params }: { params: { token: string } }) {
  const statusId = verifyReportToken(params.token)
  if (!statusId) notFound()

  const { data: statusRow } = await supabase
    .from('cfo_report_status')
    .select('snapshot_data, snapshot_taken_at, business_id, period_month')
    .eq('id', statusId)
    .maybeSingle()

  if (!statusRow || !statusRow.snapshot_data) notFound()
  // Render snapshot_data via read-only components
}
```

### Anti-Patterns to Avoid

- **Server-side PDF generation.** Puppeteer/playwright on Vercel = cold starts, memory caps, timeouts. The existing client-side jsPDF path works and D-07 locks it.
- **Embedding the raw status_id in the URL.** Even though IDs are UUIDs, signing is cheap insurance against ID-guessing and signals intent.
- **Putting the business logic in the UI's button handler.** The status transition + snapshot + email send MUST be one server-side transaction (or close to it — see the Transaction Ordering pitfall below).
- **Reusing `sendEmail()` directly from the route.** Wrap in `sendMonthlyReport()` so the single-purpose template + subject + attachment logic is co-located with other email senders, and the API route stays thin.
- **Auto-reverting to draft inside a DB trigger.** D-16 says "silent on save" but the definition of "edit" (D-17) is commentary/sections/template *coach-initiated* — a DB trigger can't distinguish coach-edit from Xero sync. Handle at the API layer where the caller's intent is known.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Send transactional email | Direct SMTP / Nodemailer | Existing `sendEmail()` in `src/lib/email/resend.ts`, extend with `sendMonthlyReport()` | 10+ existing callers, branded template helpers (`getPrimaryButton`, `getEmailFooter`, `escapeHtml`) already done. |
| Generate PDF for attachment | Puppeteer server-side | Existing `MonthlyReportPDFService` + `handleExportPDF` flow | D-07 locks this. Flow: browser generates → `doc.output('arraybuffer')` → `Buffer.from()` → base64 → POST. |
| Sign link tokens | New JWT library / custom crypto | `crypto.createHmac` pattern from `src/lib/utils/encryption.ts` | `createHmacSignature()` and `verifyHmacSignature()` already exist — can be extended or mirrored for this specific use case. |
| CFO API route boilerplate | New auth flow | Copy from `src/app/api/cfo/flag-client/route.ts` | Role check, dual-ID lookup, coach-assignment guard all established. |
| Status pill styling | New badge component | Copy Tailwind lookup pattern from `src/app/cfo/page.tsx:87-101` | `REPORT_STATUS_STYLES` and `REPORT_STATUS_LABELS` are canonical. Pill is already a simple `<span>` with classnames, no component needed. |
| HTML escaping in email | Inline regex | `escapeHtml()` in `src/lib/email/resend.ts` | Already centralised. |
| Middleware route exemption | New middleware | Add `/reports/view` to existing `onboardingExemptRoutes` array in `src/middleware.ts:142-151` | Pattern established by Phase 33 for `/cfo`. **One-line change.** |

**Key insight:** Phase 35 has near-zero greenfield code. 80%+ is composition of existing primitives.

## Common Pitfalls

### Pitfall 1: Resend sender verification is a manual Resend-dashboard step

**What goes wrong:** You deploy the code, a new coach joins, their first send returns `invalid_from_address` error.
**Why it happens:** Resend requires each sender email to be verified (either per-domain or per-address) in the Resend dashboard before sending. The API cannot self-provision this.
**How to avoid:** (1) Add a deploy-time checklist item: "Before a new coach's first send, verify their email in Resend." (2) Surface `invalid_from_address` as a specific toast: "Email send failed — this coach's sender address isn't verified in Resend yet. Contact admin to set up." (3) Initial rollout is Matt only — no broad fan-out needed immediately.
**Warning signs:** Send failure with status_code=403 and error_message containing "from_address" / "domain".

### Pitfall 2: Transaction ordering around send

**What goes wrong:** Status is written to 'sent' before Resend succeeds. Or, Resend succeeds but status write fails. Users see stale or wrong state.
**Why it happens:** The transition and the email send are two operations across two systems.
**How to avoid:** Order of operations for Approve-and-Send:
1. Verify caller, business ownership, current status (must be `draft` or `ready_for_review` or `approved`).
2. Write status='approved', approved_by, approved_at, snapshot_data, snapshot_taken_at (inside one DB transaction). **Commit before calling Resend.**
3. Insert `cfo_email_log` row with `attempted_at = now()`, `recipient_email`, `status_code = null` (pending).
4. Call `sendMonthlyReport()`. Await result (up to 15s timeout — D-12).
5. On success: update status='sent', sent_at=now(), AND update the log row with resend_message_id + status_code=200. On failure: update log row with status_code + error_message, leave status='approved' for the manual Resend button (D-11, D-13).
**Warning signs:** Transient "approved" state visible on dashboard briefly — acceptable because it reflects reality (email not yet delivered).

### Pitfall 3: Snapshot rendering drift

**What goes wrong:** `/reports/view/[token]` looks different from what the coach approved because the rendering code changed shape since the snapshot was captured.
**Why it happens:** `snapshot_data` is a JSONB payload interpreted by current code — but "current code" drifts.
**How to avoid:** (1) Version the snapshot: `snapshot_data.schema_version = 1`. On read, branch: if version mismatch, render with the legacy renderer OR show a banner ("This snapshot was captured before a platform update; click Regenerate to refresh — the original email link continues to work."). (2) Keep the snapshot payload *rendering-oriented* not *computation-oriented* — store already-computed display strings, not raw Xero data. The `GeneratedReport` type used by `saveSnapshot` in useMonthlyReport.ts is already rendering-oriented; reuse that shape.
**Warning signs:** Tests fail for old snapshots after a refactor; clients email Matt asking "why does the link look different now?"

### Pitfall 4: Silent auto-revert confuses the coach

**What goes wrong:** Coach edits commentary on a `sent` report, navigates away, comes back — the pill is now `draft` but they don't remember changing anything.
**Why it happens:** D-16 says silent, which is correct for quick typo fixes, but can surprise on longer edit sessions.
**How to avoid:** (1) On the pill itself, show transient info: pill flashes once on revert with a subtle animation. (2) Tooltip on the pill when draft: "Reverted to draft — re-approve to send updated report". (3) The revert is only on *save*, not on every keystroke (D-16), so it's deterministic and tied to a user action.
**Warning signs:** Coach says "the button disappeared" — they don't realise they reverted by editing.

### Pitfall 5: Coach edits the wrong client's report on shared machine

**What goes wrong:** Not a Phase 35 issue per se, but relevant — the silent auto-revert means a coach could accidentally un-approve via a stray keystroke without a confirm.
**Why it happens:** No modal friction for fast typo fixes (D-16 design choice).
**How to avoid:** Accept the tradeoff per D-16. If a stray edit happens: the old snapshot + sent email are preserved (D-18). Re-approval regenerates. No data lost.

### Pitfall 6: Middleware auth gate applied to public route

**What goes wrong:** `/reports/view/[token]` redirects anonymous clients to login because middleware treats it as protected.
**Why it happens:** The middleware's `publicRoutes` list is hardcoded and `onboardingExemptRoutes` is separate — the current file (src/middleware.ts:86-96) only exempts from auth if the prefix matches `publicRoutes`.
**How to avoid:** Add `/reports/view` to the `publicRoutes` array AND to `onboardingExemptRoutes`. Both are needed — read src/middleware.ts:86-96 and 142-151 carefully. D-23 only mentions `onboardingExemptRoutes` — research correction: both lists need the entry.
**Warning signs:** Anonymous curl to `/reports/view/<token>` returns a 302 to `/auth/login?next=...` instead of 200 with the snapshot page.

### Pitfall 7: PDF generation runs client-side → approve-and-send happens server-side → how does the PDF get to the server?

**What goes wrong:** The server route can't call the browser's jsPDF. Architectural mismatch.
**Why it happens:** D-07 locks client-side PDF reuse, but D-11 says the API route awaits the send.
**How to avoid:** Client orchestrates:
1. User clicks "Approve & Send".
2. Client-side: regenerate the PDF using existing `MonthlyReportPDFService` (same code path as Export PDF).
3. Extract as ArrayBuffer: `const pdfArrayBuffer = doc.output('arraybuffer')`.
4. Encode to base64: `const b64 = Buffer.from(pdfArrayBuffer).toString('base64')` (or use `FileReader` / `btoa` — the `Buffer` polyfill isn't available in browser, use `uint8ArrayToBase64` utility or chunked `btoa`).
5. POST to `/api/cfo/report-status` with `{ action: 'approve_and_send', business_id, period_month, pdf_base64, pdf_filename }`.
6. Server decodes: `const pdfBuffer = Buffer.from(body.pdf_base64, 'base64')`.
7. Pass `pdfBuffer` to `sendMonthlyReport()`.
**Size check:** Base64 bloats by ~33%. A 5 MB PDF becomes ~6.7 MB JSON body. Next.js default body limit is 1 MB — **must override**. In route.ts export: `export const maxDuration = 30` and in the body parsing config: Next.js 14 route handlers have no body size limit by default *for streaming*, but `request.json()` will fail on >1 MB by default. Set `export const runtime = 'nodejs'` and test with a representative PDF; if it fails, switch to `request.formData()` with multipart/form-data — larger ceiling.
**Warning signs:** 413 Request Entity Too Large; silent hang on upload.

### Pitfall 8: snapshot_data is a Phase 35 hook that useMonthlyReport.ts already references

**What goes wrong:** Overwriting the existing hook signature breaks useMonthlyReport. 
**Why it happens:** useMonthlyReport.ts lines 351-359 explicitly reference `cfo_report_status.snapshot_data` as the Phase 35 hook, and `saveSnapshot` currently refuses consolidated snapshots with an explicit error.
**How to avoid:** Extend, don't rewrite. The current `saveSnapshot` writes to `monthly_report_snapshots` (the existing per-business snapshot table used by `ReportHistory`). Phase 35's snapshot writes to `cfo_report_status.snapshot_data`. **These are two different storage locations with two different purposes** — don't merge them. monthly_report_snapshots = coach's draft/finalise work history. cfo_report_status.snapshot_data = the frozen-at-approval payload shown to clients via token link.
**Warning signs:** The `ReportHistory` tab breaks; snapshots stop saving.

## Code Examples

### Example 1: Resend Email Send (verified against installed SDK)

```typescript
// Source: Composition of src/lib/email/resend.ts pattern + Resend SDK v6.6.0 types
import { Resend } from 'resend'
const resend = new Resend(process.env.RESEND_API_KEY!)

const { data, error } = await resend.emails.send({
  from: 'Matt Malouf <mattmalouf@wisdomcg.com.au>',  // Must be Resend-verified
  to: 'client@example.com',                           // String or string[]
  replyTo: 'mattmalouf@wisdomcg.com.au',
  subject: 'Urban Road — March 2026 financial report',
  html: '<p>Hi Sarah...</p>',
  attachments: [
    {
      filename: 'urban-road-2026-03-report.pdf',
      content: pdfBuffer,         // Buffer | string (base64)
      // contentType auto-derived from filename extension
    },
  ],
})
// data.id is the resend_message_id to log
// error.name is one of RESEND_ERROR_CODE_KEY literals
```

### Example 2: Client-Side PDF → base64 → POST flow

```typescript
// Execution environment: browser (client component event handler).
// Uses the browser-native `fetch`, `btoa`, and `ArrayBuffer` APIs — not workflow-sandbox code.
// Source: extension of src/app/finances/monthly-report/page.tsx:571-628 handleExportPDF
async function approveAndSend() {
  // 1. Generate PDF same way handleExportPDF does (lines 571-628)
  const pdf = new MonthlyReportPDFService(report, {
    commentary,
    fullYearReport,
    subscriptionDetail,
    wagesDetail,
    cashflowForecast,
    sections: settings?.sections,
    pdfLayout: settings?.pdf_layout ?? null,
  })
  const doc = pdf.generate()

  // 2. Get as ArrayBuffer (jsPDF v3 API)
  const arrayBuffer = doc.output('arraybuffer') as ArrayBuffer

  // 3. Base64 encode (browser-safe, chunked to avoid stack overflow on large PDFs)
  function arrayBufferToBase64(buf: ArrayBuffer): string {
    const bytes = new Uint8Array(buf)
    let binary = ''
    const CHUNK = 0x8000
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)))
    }
    return btoa(binary)
  }
  const pdfBase64 = arrayBufferToBase64(arrayBuffer)

  // 4. POST
  const res = await fetch('/api/cfo/report-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'approve_and_send',
      business_id: report.business_id,
      period_month: `${report.report_month}-01`,
      pdf_base64: pdfBase64,
      pdf_filename: `${businessSlug}-${report.report_month}-report.pdf`,
    }),
  })

  const data = await res.json()
  if (!res.ok || !data.success) {
    if (data.error_code === 'invalid_from_address') {
      toast.error('Your sender email isn\'t verified in Resend yet. Contact admin.')
    } else {
      toast.error('Email send failed — click Resend to retry')
    }
    return
  }
  toast.success(`Report sent to ${data.recipient_email}`)
}
```

### Example 3: cfo_email_log migration DDL

```sql
-- supabase/migrations/20260424_cfo_email_log.sql
CREATE TABLE IF NOT EXISTS "public"."cfo_email_log" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "cfo_report_status_id" uuid NOT NULL REFERENCES "public"."cfo_report_status"(id) ON DELETE CASCADE,
  "business_id" uuid NOT NULL REFERENCES "public"."businesses"(id) ON DELETE CASCADE,
  "period_month" date NOT NULL,
  "attempted_at" timestamptz NOT NULL DEFAULT now(),
  "triggered_by" uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  "recipient_email" text NOT NULL,
  "resend_message_id" text,
  "status_code" integer,
  "error_message" text
);

CREATE INDEX "idx_cfo_email_log_business_period"
  ON "public"."cfo_email_log"(business_id, period_month);

ALTER TABLE "public"."cfo_email_log" ENABLE ROW LEVEL SECURITY;

-- Coach sees own assigned-client logs
CREATE POLICY "cfo_email_log_coach_select"
  ON "public"."cfo_email_log" FOR SELECT
  USING (business_id IN (
    SELECT id FROM "public"."businesses" WHERE assigned_coach_id = auth.uid()
  ));

-- Super admin sees all
CREATE POLICY "cfo_email_log_super_admin_all"
  ON "public"."cfo_email_log"
  USING (EXISTS (
    SELECT 1 FROM "public"."system_roles"
    WHERE user_id = auth.uid() AND role = 'super_admin'
  ));

-- Service role full access (routes write via service client)
CREATE POLICY "cfo_email_log_service_role"
  ON "public"."cfo_email_log" TO service_role
  USING (true) WITH CHECK (true);

-- Append-only: no UPDATE or DELETE for authenticated users (service role only)
-- Enforced by absence of INSERT/UPDATE/DELETE policies for authenticated
```

### Example 4: Snapshot payload shape (minimum fields)

```typescript
// What snapshot_data JSONB should contain — rendering-oriented per Pitfall 3
interface ReportSnapshotV1 {
  schema_version: 1
  captured_at: string                    // ISO timestamp
  business: {
    id: string                            // businesses.id
    name: string
    slug: string | null                   // null until Phase 36
    industry: string | null
  }
  period: {
    month: string                         // "2026-03-01"
    fiscal_year: number
    label: string                         // "March 2026"
  }
  coach: {
    name: string                          // "Matt Malouf"
    email: string
  }
  // Reuse GeneratedReport shape — already rendering-oriented, already populated by useMonthlyReport
  report: GeneratedReport                 // from src/app/finances/monthly-report/types.ts
  commentary: VarianceCommentary | null   // coach_note + vendor_summary per account
  settings_applied: {
    sections: ReportSections              // which sections to render
    template_id: string | null            // for audit; never affects rendering
  }
  // Consolidation-aware: if is_consolidation, include per-entity payload
  consolidated?: {
    fx_context: unknown                   // shape from ConsolidatedReport
    lines: unknown[]
  }
}
```

## Runtime State Inventory

*This is a greenfield phase — no rename/refactor/migration. Section applies only partially.*

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | `cfo_report_status.snapshot_data` — new column populated by this phase. No legacy data to migrate. | First-time population on first approval; no backfill needed. |
| Live service config | Resend per-coach sender verification. **Lives in Resend dashboard, NOT in git.** Matt's email (`mattmalouf@wisdomcg.com.au`) already used in 10+ production email flows — already verified via existing `noreply@mail.wisdombi.ai` domain OR needs per-address verification. | Verify in Resend dashboard before first send. Add deploy checklist item. Per D-09, other coaches need the same setup before their first send. |
| OS-registered state | None | None — verified: no Task Scheduler / launchd / pm2 registrations reference report delivery. |
| Secrets/env vars | Two new vars: `RESEND_API_KEY` (already exists in `.env.example:6`, already deployed per existing email flows) and `REPORT_LINK_SECRET` (new — required for token signing). | Add `REPORT_LINK_SECRET=` line to `.env.example`. Add to Vercel production + preview env. Initial value: `openssl rand -hex 32`. Rotation = global token invalidation (D-21 accepted tradeoff). |
| Build artifacts | None | None — no compiled state carrying names. |

**Canonical question:** After every file is updated, what runtime state still has old values? Answer: **none, because this is additive greenfield.** The only runtime configuration externalized from the repo is the Resend dashboard sender list — documented above.

## State of the Art

| Old Approach (ROADMAP §Phase 35 original) | Current Approach (per CONTEXT.md override) | When Changed | Impact |
|-------------------------------------------|---------------------------------------------|--------------|--------|
| Make.com webhook fan-out | Direct Resend email send from platform | 2026-04-23 (discuss-phase) | Platform owns deliverability; no per-client webhook config; audit data stays in DB (`cfo_email_log`); simpler product story for CFO SaaS. `businesses.make_webhook_url` column NOT added. |
| Client sees live report data | Client sees frozen `snapshot_data` rendered via public token URL | New to this phase | Client view is truthful to what coach approved, even if coach later edits. Auto-revert (D-16) doesn't break already-sent links. |
| Tokens expire | Tokens valid indefinitely, rotation = global kill-switch | New (D-21) | Matches how clients actually use reports — reopen old emails months later. |

**Deprecated/outdated:** ROADMAP Phase 35 scope referencing Make.com webhook, `businesses.make_webhook_url` column, and APPR-02/03/05 Make.com language. REQUIREMENTS.md APPR-02/03/05 still describe Make.com literally; CONTEXT.md explicitly overrides but REQUIREMENTS.md won't be retroactively edited per conventions. Plan should treat APPR-02/03/05 intent as "delivery mechanism" and map to Resend.

## Open Questions

1. **`businesses.name` vs `business_profiles.business_name` for subject line**
   - What we know: Both columns exist across the dual-ID system; `businesses.name` is the canonical record per the dual-ID note in STATE.md line 52; `business_profiles.business_name` can drift.
   - What's unclear: Which one do CFO clients identify with? User hasn't clarified — Matt's clients ("Urban Road", "Dragon Roofing") are likely stored in `businesses.name` since that's what the CFO dashboard uses.
   - Recommendation: Use `businesses.name`. Fall back to `business_profiles.business_name` if null.

2. **Coach name resolution**
   - What we know: `businesses.assigned_coach_id` → `auth.users.id`. Need the coach's display name + email for the `From` header and email greeting.
   - What's unclear: Where is the coach's display name stored? `auth.users.raw_user_meta_data.full_name`? A `users` / `profiles` table?
   - Recommendation: Planner should trace the code path used by `sendClientInvitation` (which accepts `coachName` as a param) — caller resolves it. For Phase 35: accept `coach_name` + `coach_email` in the API route, resolved by the caller via the same path the existing invitation flow uses. Research finding: `src/app/api/coach/clients/route.ts` calls `sendClientInvitation` — investigate that for the pattern.

3. **Multipart vs JSON for PDF upload**
   - What we know: Base64-in-JSON is simpler but bloats ~33% and may trigger Next.js body size limits.
   - What's unclear: Exact Next.js 14.2.35 route-handler body limit. Docs say no hard limit for streaming; `request.json()` has practical limits.
   - Recommendation: Start with JSON + base64. If testing with a ~7 MB payload fails, switch to multipart/form-data. Planner should add a Wave 0 smoke test: "send a representative 5MB PDF through the route end-to-end".

4. **Should auto-revert logic sit in existing save hooks or new middleware?**
   - What we know: Commentary save goes to `/api/monthly-report/commentary` (indirect — see `src/app/finances/monthly-report/page.tsx:484`); snapshot save goes to `/api/monthly-report/snapshot`; template save is in-memory via `onSettingsChange`. Three different save paths.
   - What's unclear: Is there a unified "coach has edited this report" event, or is each save path separate?
   - Recommendation: Centralize the revert check in a small helper `revertReportIfApproved(business_id, period_month)` called from each save endpoint after their write succeeds. Planner should enumerate exact call sites. Research flag: snapshot save and commentary save both go to API routes (server-side) — good. Template selection is in-memory only until a snapshot save — ALSO covered. Section toggle changes trigger `handleGenerateReport` which goes through `saveSnapshot` on "Save Draft" — covered.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js runtime | All code | ✓ | Project pins Next 14.2.35 which requires Node 18.17+; Resend v6 requires Node >=20 | Resend SDK will error at install time if Node <20. Vercel default Node is 20+. |
| `resend` package | Email send | ✓ | 6.6.0 | None needed |
| `jspdf` + `jspdf-autotable` | PDF generation | ✓ | 3.0.4 + 5.0.2 | None needed |
| `jsonwebtoken` | Token signing alternative | ✓ | 9.0.2 | Use Node `crypto` (recommended) |
| `@supabase/supabase-js` | DB access | ✓ | 2.76.1 | None needed |
| `sonner` | Toast UI | ✓ | 2.0.7 | None needed |
| `crypto` (Node builtin) | HMAC signing | ✓ | Node builtin | N/A |
| `RESEND_API_KEY` env var | Runtime email send | ✓ in `.env.example`, likely live in Vercel | — | Code must throw on missing to fail loudly |
| `REPORT_LINK_SECRET` env var | Token sign/verify | ✗ new — must be added | — | MUST add to `.env.example`, Vercel production, Vercel preview |
| Resend-verified sender for Matt | First-phase production send | Unknown (needs verification) — existing `noreply@mail.wisdombi.ai` domain used, but per-address verification may be separate | — | Deploy checklist item before first send |
| `vitest` | Unit tests | ✓ | 4.1.4 | None needed |
| `@playwright/test` | E2E (optional for this phase) | ✓ | 1.59.1 | Can skip per Phase 40 precedent (test.skip) |

**Missing dependencies with no fallback:** None — `REPORT_LINK_SECRET` must be set but is trivial to generate (`openssl rand -hex 32`).

**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.4 + Playwright 1.59.1 |
| Config files | `vitest.config.ts`, `playwright.config.ts` |
| Quick run command | `npm test` (vitest single run) |
| Full suite command | `npm run verify` (build + lint + smoke-test) |
| E2E command | `npm run test:e2e` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| APPR-01 | Status pill renders current cfo_report_status value | unit | `npx vitest run src/app/finances/monthly-report/components/ReportStatusBar.test.tsx` | ❌ Wave 0 |
| APPR-01 | Client (non-coach) sees pill but no action button | unit (role-based render test) | same test file | ❌ Wave 0 |
| APPR-02 | POST `/api/cfo/report-status action=approve_and_send` transitions status | integration | `npx vitest run src/app/api/cfo/report-status/route.test.ts` | ❌ Wave 0 |
| APPR-02 | `cfo_email_log` row inserted on each attempt | integration | same test file | ❌ Wave 0 |
| APPR-02 | `snapshot_data` populated on first approval | integration | same test file | ❌ Wave 0 |
| APPR-03 | Resend 2xx → status='sent', sent_at populated | integration (mocked Resend) | same test file | ❌ Wave 0 |
| APPR-04 | Resend failure → status stays 'approved', error toast | integration + component test | same + ReportStatusBar.test.tsx | ❌ Wave 0 |
| APPR-05 | Delivery uses `businesses.owner_email` *(per CONTEXT.md override)* | integration | same test file | ❌ Wave 0 |

### Decision → Validation Map (D-01..D-23)

| Decision | Validation Approach | Test File |
|----------|--------------------|-----------| 
| D-01 Coach-only ready-for-review | Integration test: POST as non-coach returns 403 | report-status/route.test.ts |
| D-02 One-click approve from draft | Integration: POST with status='draft' + action='approve_and_send' succeeds | report-status/route.test.ts |
| D-03 Revert preserves snapshot | Integration: POST action='revert_to_draft' → snapshot_data stays, approved_at/sent_at cleared | report-status/route.test.ts |
| D-04 Client read-only pill | Component test: render with role='client' → no buttons | ReportStatusBar.test.tsx |
| D-05 Resend provider + env | Unit: `sendMonthlyReport` calls `resend.emails.send` (mocked); throws if RESEND_API_KEY missing | src/lib/email/resend.test.ts (NEW) |
| D-06 Minimal email body | Unit: snapshot test of generated HTML — asserts no numbers from snapshot_data appear | resend.test.ts |
| D-07 Reuse jsPDF | Manual UAT — verify attached PDF looks identical to Export PDF output | Validation plan item |
| D-08 Subject format | Unit: `sendMonthlyReport({ businessName: 'Urban Road', monthLabel: 'March 2026' })` → subject === 'Urban Road — March 2026 financial report' | resend.test.ts |
| D-09 From = coach email | Unit: assert `from` parameter matches coach.email passed in | resend.test.ts |
| D-10 Single recipient | Unit: assert `to` is string (not array) | resend.test.ts |
| D-11 Synchronous; failure keeps 'approved' | Integration: mock Resend to throw → assert DB state after | route.test.ts |
| D-12 15s timeout | Unit: mock Resend to delay 20s → AbortController fires, error returned | resend.test.ts |
| D-13 Resend updates sent_at | Integration: two successful sends → two log rows, sent_at = most recent | route.test.ts |
| D-14 cfo_email_log schema | Migration test: `select column_name from information_schema.columns where table_name='cfo_email_log'` assertion + RLS policy grep | supabase/migrations/*.test.sql OR manual migration apply + psql check |
| D-15 snapshot_data on first approval | Integration: pre-approval snapshot_data=null → after approve: populated with schema_version=1 | route.test.ts |
| D-16 Auto-revert on edit | Integration (snapshot save endpoint): status='approved' → save commentary edit → status='draft' | snapshot/route.test.ts (extend existing) |
| D-17 Xero sync does NOT revert | Manual UAT — run sync, confirm pill stays approved | Validation plan item |
| D-18 Revert preserves snapshot_data | (same as D-03) | route.test.ts |
| D-19 /reports/view/[token] renders snapshot, not live | Playwright test: navigate to token URL without login → 200 + expected text | tests/report-view.spec.ts (NEW) |
| D-20 HMAC token signing | Unit: signReportToken(id) → verifyReportToken(result) === id; tampered token returns null | src/lib/reports/report-link-token.test.ts (NEW) |
| D-21 Rotating secret invalidates | Unit: rotate REPORT_LINK_SECRET env between sign and verify → returns null | report-link-token.test.ts |
| D-22 buildReportUrl forward-compat | Unit: portal_slug=null → returns /reports/view/TOKEN; portal_slug='urban-road' → returns /portal/urban-road?month=YYYY-MM | src/lib/reports/build-report-url.test.ts (NEW) |
| D-23 Middleware exemption | Playwright: curl `/reports/view/some-token` anonymously → NOT redirected | tests/report-view.spec.ts |

### Sampling Rate

- **Per task commit:** `npx vitest run <new-test-file>` (quick, under 30s)
- **Per wave merge:** `npm test` (full vitest suite; currently 101+ tests passing)
- **Phase gate:** `npm run verify` (build + lint + smoke) + `npm run test:e2e -- tests/report-view.spec.ts` + manual UAT checklist for D-07, D-17

### Wave 0 Gaps

- [ ] `src/app/api/cfo/report-status/route.ts` + `route.test.ts` — primary route + integration tests
- [ ] `src/lib/email/resend.test.ts` — unit tests for sendMonthlyReport (does not exist today; first test for this file)
- [ ] `src/lib/reports/report-link-token.ts` + `.test.ts` — sign/verify helpers
- [ ] `src/lib/reports/build-report-url.ts` + `.test.ts` — forward-compat URL builder
- [ ] `src/app/reports/view/[token]/page.tsx` — public snapshot renderer
- [ ] `src/app/finances/monthly-report/components/ReportStatusBar.tsx` + `.test.tsx` — pill + action button
- [ ] `supabase/migrations/YYYYMMDD_cfo_email_log.sql` — new table migration
- [ ] `.env.example` — add `REPORT_LINK_SECRET=` entry
- [ ] `src/middleware.ts` — add `/reports/view` to both `publicRoutes` AND `onboardingExemptRoutes`
- [ ] `tests/report-view.spec.ts` — Playwright E2E for public token URL
- [ ] Mock strategy: `vi.mock('resend', () => ({ Resend: vi.fn(() => ({ emails: { send: vi.fn() } })) }))` — standard vitest mock pattern; no new test infrastructure needed

**Framework install:** None — vitest + Playwright already installed.

## Sources

### Primary (HIGH confidence)

- `node_modules/resend/dist/index.d.mts` — Attachment interface, RESEND_ERROR_CODE_KEY enum, CreateEmailOptions shape (installed package source-of-truth)
- `node_modules/resend/package.json` — version 6.6.0, Node engines >=20
- `src/lib/email/resend.ts` — existing Resend wrapper with Send, Invitation, PasswordReset, SessionReminder, MessageNotification, TestEmail functions (lines 1-391)
- `src/lib/utils/encryption.ts` — existing `createHmacSignature` / `verifyHmacSignature` helpers using `crypto.createHmac('sha256', key)` (lines 145-175)
- `src/app/api/cfo/summaries/route.ts` — canonical CFO GET route pattern (role check, dual-ID lookup, service-role client)
- `src/app/api/cfo/flag-client/route.ts` — canonical CFO POST route pattern (coach-assignment guard)
- `src/app/cfo/page.tsx:75-101` — REPORT_STATUS_STYLES / REPORT_STATUS_LABELS pattern for pill styling
- `src/app/finances/monthly-report/page.tsx` — monthly report top bar + handleExportPDF PDF generation flow (lines 571-628)
- `src/app/finances/monthly-report/hooks/useMonthlyReport.ts` — existing snapshot_data Phase 35 hook reference (lines 351-359)
- `src/app/finances/monthly-report/services/monthly-report-pdf-service.ts` — jsPDF-based PDF generator (reuse for attachment)
- `src/middleware.ts:86-96, 142-151` — public routes + onboarding-exempt routes arrays
- `supabase/migrations/00000000000000_baseline_schema.sql:2153-2179` — cfo_report_status schema (snapshot_data comment explicitly labels it as Phase 35 hook)
- `supabase/migrations/00000000000000_baseline_schema.sql:1947-1993, 6985` — businesses.owner_email column + index
- `supabase/migrations/00000000000000_baseline_schema.sql:10643-10660` — cfo_report_status RLS policies (pattern to mirror for cfo_email_log)
- `package.json` — installed dependency versions

### Secondary (MEDIUM confidence)

- Resend docs TSDoc `@link https://resend.com/docs/api-reference/emails/send-email#body-parameters` — cross-referenced inside SDK type definitions (same source as Primary)
- Phase 33 SUMMARY (`.planning/phases/33-cfo-dashboard/33-SUMMARY.md`) — Phase 35 hooks pre-identified: `next_due` stat, flag-client UI, manual status override UI all deferred
- STATE.md — dual-ID system, resolver pattern from Phases 37-40

### Tertiary (LOW confidence)

- None — all findings are verified against installed dependencies or project source.

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — every package inspected in `node_modules`; versions confirmed against `package.json`.
- Architecture: **HIGH** — all patterns derived from live code files, not inferred.
- Pitfalls: **HIGH** — each pitfall tied to a specific code location or design decision.
- Validation architecture: **HIGH** — decisions mapped to verifiable code paths.
- Open questions: **MEDIUM** — four items genuinely require planner investigation (coach name resolution, body-size limits, save-path enumeration, which `name` column to use for subject).

**Research date:** 2026-04-23
**Valid until:** 2026-05-23 (30 days — stable core packages, no imminent Resend SDK v7 announcement at time of research)

---

## RESEARCH COMPLETE

**Phase:** 35 — Report Approval + Delivery Workflow
**Confidence:** HIGH

### Key Findings

1. **Zero new dependencies required.** `resend@6.6.0`, `jspdf@3.0.4`, `jsonwebtoken@9.0.2`, `sonner@2.0.7`, and Node `crypto` are all installed. `src/lib/email/resend.ts` already wraps Resend with branded HTML helpers, called from 10+ production routes.
2. **All schema already in place except one table.** `cfo_report_status` has every column the phase needs (snapshot_data is explicitly labelled "Phase 35 hook" in baseline_schema.sql line 2175). `businesses.owner_email` exists and is indexed. Only `cfo_email_log` needs a new migration.
3. **Two established patterns cover 90% of the work.** The CFO API route template (`flag-client/route.ts` + `summaries/route.ts`) and the email send template (`sendClientInvitation` in `resend.ts`) are directly reusable. The token signing pattern is already established in `src/lib/utils/encryption.ts` — prefer HMAC over JWT for consistency.
4. **PDF flow is client-orchestrated.** The existing `handleExportPDF` on the monthly report page already produces the exact PDF we need to attach. Browser generates → base64 encodes → POSTs to route → server decodes → Resend attachment. Body-size concern for large PDFs is the one item requiring a Wave 0 smoke test.
5. **Middleware change is two-line:** add `/reports/view` to both `publicRoutes` and `onboardingExemptRoutes` arrays in `src/middleware.ts`. D-23 only mentions the second — research correction needed in plan.

### File Created

`/Users/mattmalouf/Desktop/business-coaching-platform/.planning/phases/35-report-approval-delivery-workflow/35-RESEARCH.md`

### Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | Inspected `node_modules/resend/dist/index.d.mts` and package.json directly; no guessing |
| Architecture Patterns | HIGH | Every pattern tied to a live file path + line range |
| Pitfalls | HIGH | Each traced to a specific design decision or code constraint |
| Validation Architecture | HIGH | Each of D-01..D-23 mapped to a concrete verification approach |
| Code Examples | HIGH | All examples composed from verified installed SDK types and existing codebase patterns |

### Open Questions (for planner)

1. Coach display-name resolution path (check how `sendClientInvitation` callers resolve it)
2. JSON vs multipart body for ~5-7 MB PDF payload (Next.js 14.2 body-size behavior) — needs Wave 0 smoke test
3. Exact save paths to hook for auto-revert (D-16): `/api/monthly-report/snapshot`, `/api/monthly-report/commentary`, and in-memory template apply all need centralized `revertReportIfApproved()` helper
4. `businesses.name` vs `business_profiles.business_name` for email subject

### Ready for Planning

Research complete. Planner can produce PLAN.md files with confidence — stack is locked, patterns are verified, no experimental territory.
