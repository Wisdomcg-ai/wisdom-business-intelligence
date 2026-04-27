# Phase 35: Report Approval + Delivery Workflow - Context

**Gathered:** 2026-04-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Add the UI controls and delivery automation that move a monthly report through the `cfo_report_status` lifecycle (`draft → ready_for_review → approved → sent`) and email the approved report directly to the client via Resend. Replaces the current manual process of exporting from Calxa and emailing separately. The CFO dashboard (Phase 33) reads the updated status immediately.

**In scope:** status pill + action buttons on the monthly report page, POST `/api/cfo/report-status` upsert endpoint, Resend-based email send with PDF attachment, token-signed snapshot view route, `cfo_email_log` audit table, manual resend on failure, auto-revert to draft on edit.

**Out of scope:** client portal (Phase 36), CFO dashboard UI changes beyond what already reads `cfo_report_status`, bulk approval across multiple clients, client-side "sign off" workflow.

**Scope override vs ROADMAP.md:** ROADMAP Phase 35 specifies a Make.com webhook + `businesses.make_webhook_url` column. **This phase replaces that with direct email via Resend** — owning deliverability is a cleaner product story for a CFO SaaS, eliminates the per-business external-URL setup step, and keeps all audit data in the platform.

</domain>

<decisions>
## Implementation Decisions

### Status transitions & actors

- **D-01:** `draft → ready_for_review` requires an explicit "Mark Ready for Review" button, **coach-only** (coach/super_admin via `system_roles`). Clients cannot trigger. No auto-transition from `commentary_approved`.
- **D-02:** Coach can one-click approve-and-send from `draft` directly (skipping `ready_for_review`). `ready_for_review` remains valid for months where a two-step review is wanted.
- **D-03:** Coach can revert `approved` or `sent` → `draft` (admin action). Reverting clears `approved_at` and `sent_at`, preserves `snapshot_data` and `snapshot_taken_at` (audit trail of what was previously sent).
- **D-04:** Clients see the status pill as **read-only** (e.g. "Sent 3 April 2026"). No action buttons visible to non-coach users. Coach/super_admin see the pill plus the contextual action button.

### Email delivery

- **D-05:** Transactional provider: **Resend**. Requires new env `RESEND_API_KEY`. Verified sending domain (likely `wisdombi.ai`).
- **D-06:** Email body = greeting + "View Report" button + PDF attachment. **No headline numbers and no AI narrative in the body.** Minimal, matches the current simple Calxa-send flow the client is used to.
- **D-07:** PDF attachment is generated from the existing jsPDF layout editor output on the monthly report page. No new PDF engine.
- **D-08:** Subject line format: `{Business name} — {Month Year} financial report` (e.g., "Urban Road — March 2026 financial report").
- **D-09:** **From = assigned coach's email directly** (e.g., `mattmalouf@wisdomcg.com.au`). Reply-To = same. This requires each coach's email to be verified in Resend. Initial rollout covers Matt only; additional coaches each complete Resend sender verification before their first send.
- **D-10:** Recipient = `businesses.owner_email` only. No CC, no BCC. Single recipient keeps v1 simple.
- **D-11:** Send is **synchronous** — the `approve-and-send` API call awaits the Resend response. Success (2xx) → status='sent', `sent_at = now()`. Failure (non-2xx, throw, timeout) → status stays 'approved', error toast on client, "Resend" button surfaces on the report page.
- **D-12:** **Timeout on Resend call: 15 seconds**. Longer than typical Resend response (<2s), short enough that the coach isn't stuck watching a spinner.
- **D-13:** Coach can resend an already-sent report at any time ("client lost the email"). Each send is a new `cfo_email_log` row; `sent_at` is updated to the most recent successful send.

### Audit & logging

- **D-14:** New table `cfo_email_log` (append-only) with columns: `id uuid pk`, `cfo_report_status_id uuid fk`, `business_id uuid fk`, `period_month date`, `attempted_at timestamptz`, `triggered_by uuid fk auth.users`, `resend_message_id text nullable`, `status_code int nullable`, `error_message text nullable`, `recipient_email text`. Indexed on `(business_id, period_month)`. RLS: coach/super_admin read own business logs.
- **D-15:** `cfo_report_status.snapshot_data` is populated at the moment of first approval transition (`* → approved`). Contains the frozen report payload needed to render the read-only snapshot view. Re-approval overwrites the snapshot.

### Edit-after-approval

- **D-16:** Once a report is `approved` or `sent`, editing commentary text, section toggles, or template selection **auto-reverts** the status to `draft` on save. Silent — no confirm modal. Pill updates immediately as feedback that re-approval is required.
- **D-17:** "Edit" means coach-initiated changes only: commentary text, section toggles, template picker. **Xero actuals refresh does NOT trigger revert** — background syncs must not flip every approved report back to draft every time numbers settle.
- **D-18:** Prior `snapshot_data` is preserved when a report reverts to draft. The email already sent to the client continues to render the frozen snapshot at `/reports/view/[token]` — the client view stays truthful even while the coach's working view is in flux.

### Report URL (email link)

- **D-19:** New route `/reports/view/[token]` — public, no login required, server-rendered, read-only. Renders the `snapshot_data` payload (not live data) to guarantee the client sees what the coach approved.
- **D-20:** Token scheme: signed JWT (or HMAC-signed compact format) encoding `cfo_report_status.id`. Signing secret = new env `REPORT_LINK_SECRET`.
- **D-21:** Tokens **do not expire**. Tradeoff accepted: if an email is forwarded or leaks, the link stays live indefinitely. Mitigation path — if a leak is suspected, rotating `REPORT_LINK_SECRET` invalidates all existing tokens (drastic, global). An explicit per-business revocation column can be added later if needed.
- **D-22:** URL helper `buildReportUrl(business_id, period_month)` is forward-compatible with Phase 36: if `businesses.portal_slug` is set (added in Phase 36), helper returns `/portal/[slug]?month=YYYY-MM`; otherwise returns the token URL. Emails sent before Phase 36 keep their token links working — not retroactively rewritten.

### Middleware & routing

- **D-23:** `/reports/view/*` must be added to `onboardingExemptRoutes` in `src/middleware.ts` (same pattern Phase 33 used for `/cfo`). Route is also auth-exempt (public read).

### Claude's Discretion

- Exact UI pill component styling (use existing status-pill patterns in the codebase).
- Snapshot payload shape — planner/researcher pick the minimum fields needed to render the read-only view faithfully.
- Whether "Mark Ready for Review" and "Approve & Send" are two buttons or one split-button control on the report page.
- PDF attachment filename format (sensible default, e.g. `{business-slug}-{yyyy-mm}-report.pdf`).
- Error toast copy.
- Exact logging of resend attempts (recommended: each attempt = new `cfo_email_log` row; trust D-14 schema).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §Phase 35 — original scope (NOTE: Make.com webhook replaced by Resend per decisions D-05..D-15 above)
- `.planning/REQUIREMENTS.md` §APPR-01..APPR-05 — functional requirements (all still apply; APPR-02 and APPR-03 now reference "email send" instead of "webhook")

### Existing `cfo_report_status` schema (Phase 33)
- `supabase/migrations/00000000000000_baseline_schema.sql` lines 2153-2179 — `cfo_report_status` table definition, CHECK constraint, `snapshot_data` column comments
- `supabase/migrations/00000000000000_baseline_schema.sql` lines 10643-10650 — RLS policies
- `.planning/phases/33-cfo-dashboard/33-SUMMARY.md` — Phase 33 context, status badge logic, dashboard data sources

### Existing CFO API patterns to replicate
- `src/app/api/cfo/summaries/route.ts` — role check (coach/super_admin via `system_roles`), dual-ID lookup pattern, `cfo_report_status` read usage
- `src/app/api/cfo/flag-client/route.ts` — POST-to-CFO-endpoint pattern (upsert + coach-assignment check)

### Monthly report page integration
- `src/app/finances/monthly-report/page.tsx` — where the status pill + buttons live
- `src/app/finances/monthly-report/hooks/useMonthlyReport.ts` (around line 352) — existing hook that references `cfo_report_status.snapshot_data` as "Phase 35 hook"
- Existing jsPDF layout editor components in `src/app/finances/monthly-report/components/` — reuse for PDF attachment generation

### Middleware + auth patterns
- `src/middleware.ts` — `onboardingExemptRoutes` pattern (add `/reports/view/*`)
- `src/app/cfo/layout.tsx` — role gate pattern (for `/cfo`, not reused for `/reports/view` which is public, but the negative pattern is instructive)

### Project context
- `.planning/PROJECT.md` — platform overview, multi-tenant RLS, Australian market context
- `.planning/STATE.md` — dual-ID system note, role-check conventions, recent resolver-adoption work (Phases 37-40)
- `CLAUDE.md` — project-specific guidelines (if present at repo root)

### Deferred dependency
- Phase 36 (Client Portal) — will add `businesses.portal_slug` and `/portal/[slug]` route; Phase 35's `buildReportUrl` helper must be forward-compatible (D-22)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`cfo_report_status` table (Phase 33)** — already has every column needed: `status`, `approved_by`, `approved_at`, `sent_at`, `snapshot_data`, `snapshot_taken_at`, `commentary_approved`. No schema additions required on this table.
- **`getUserSystemRole()` pattern** — `src/app/api/cfo/summaries/route.ts:111-121` shows the exact role-check boilerplate (coach or super_admin via `system_roles` table). Replicate in `/api/cfo/report-status`.
- **Dual-ID lookup pattern** — `src/app/api/cfo/summaries/route.ts:155-195` — build `allRelatedIds` array from `businesses.id` + `business_profiles.id` before querying `forecast_pl_lines` / `xero_pl_lines`. Required for snapshot payload assembly.
- **jsPDF layout editor** — existing PDF generator lives in monthly report components; reuse its output as the Resend attachment buffer. Do not introduce puppeteer/react-pdf.
- **Phase 33 flag-client endpoint** — `src/app/api/cfo/flag-client/route.ts` is a clean POST-to-CFO pattern to mirror structurally.

### Established Patterns

- **API route role gate:** try { auth.getUser() → system_roles lookup → 403 if not coach/super_admin } catch { 500 }. Consistent across every CFO route.
- **RLS policies** on CFO tables scope by `business_id IN (SELECT id FROM businesses WHERE assigned_coach_id = auth.uid())`. `cfo_email_log` must follow the same pattern.
- **Middleware exempt routes** — `/cfo` was added to `onboardingExemptRoutes` in Phase 33. `/reports/view/*` needs the same treatment AND must bypass auth entirely (publicly accessible via token).
- **Toast + error handling** — existing coach UI uses `toast.error(...)` with a short message + error detail. Match that style for "Email send failed — click Resend to retry".

### Integration Points

- **Monthly report page** (`src/app/finances/monthly-report/page.tsx`) — add status pill + action button to the existing top bar.
- **CFO dashboard** (`/cfo`) reads `cfo_report_status` already; `pending_approval` and `next_due` stats will light up automatically once reports actually transition through the lifecycle. No dashboard code changes strictly required for Phase 35, though a verification task should confirm the counts update as expected.
- **Env config** — two new env vars: `RESEND_API_KEY` and `REPORT_LINK_SECRET`. Both required at runtime; planner must add `.env.example` entries.
- **Resend sender verification** — one-time setup per coach email outside the code (Resend dashboard). Planner should include a deploy-time checklist item but not a code task.

</code_context>

<specifics>
## Specific Ideas

- "Replace Calxa export + manual email" — the CFO product should own email delivery, not hand off to Make.com
- Client-facing link must not require login for v1 (Phase 36 adds the logged-in portal)
- Editing an approved report should **silently** revert to draft — no modal friction for the common "fix a typo" case
- "Forever" tokens accepted despite the "not recommended" framing — Matt's clients reopen old emails months later and that workflow should Just Work

</specifics>

<deferred>
## Deferred Ideas

- **AI narrative in email body** — considered but dropped for v1 body content (D-06). Revisit when Phase 24 AI commentary ships and there's a mature sentence-level narrative to reuse.
- **Dynamic subject line with key insight** — e.g., "Urban Road — March: NP 12% above budget". Rejected for v1 because negative subjects ("NP 18% below budget") feel alarmist. Reconsider if open-rate tracking shows static subjects hurt engagement.
- **Coach-written custom note per send** — add a text box on the approve dialog. Deferred as friction for v1; revisit if coaches ask for it.
- **Bulk approve on /cfo dashboard** — row actions to approve multiple clients at once. Out of scope for v1 (roadmap specifies monthly-report-page-only).
- **Async Resend bounce webhook handler** — `/api/webhooks/resend` to process async bounce/complaint events. Deferred; v1 relies on synchronous send status + manual retry. Add when real bounces become a problem.
- **Per-business revocation of existing tokens** — add a column like `snapshot_token_revoked_at` to invalidate a single report's link without rotating the global secret. Deferred until a leak actually happens.
- **Multi-recipient support** — all users on the business team + coach BCC. Out of scope; v1 sends to `owner_email` only.
- **Client "sign off" workflow** — client triggers `ready_for_review → approved`. Deferred; coach-only v1.
- **Phase 33 Iteration 2 follow-ups** (manual status override UI, flag-client toggle on business profile, trend arrows, `next_due` computation) — already deferred in Phase 33 SUMMARY; not in Phase 35 scope.

</deferred>

---

*Phase: 35-report-approval-delivery-workflow*
*Context gathered: 2026-04-23*
