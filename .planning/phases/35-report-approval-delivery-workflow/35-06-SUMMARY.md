---
plan: 35-06
phase: 35-report-approval-delivery-workflow
status: complete
wave: 3
autonomous: false
started: 2026-04-23
completed: 2026-04-27
---

# Plan 35-06 SUMMARY — Monthly Report Page UI

## Outcome

The coach now has a status pill + contextual action buttons on the monthly report page. Clicking **Approve & Send** generates the PDF in-browser, posts the snapshot + PDF to `/api/cfo/report-status`, and the route sends the email via Resend. Status pill updates immediately to `Sent · [date]`, and the email arrives in the recipient's inbox with a working "View Report" link to the public snapshot view (Plan 35-05).

## Tasks

| Task | Name | Commit | Status |
|---|---|---|---|
| 1 | ReportStatusBar + useReportStatus + approve-and-send + tests | `856c9c4` | ✓ |
| 2 | Mount ReportStatusBar in monthly-report page top bar | `7460725` | ✓ |
| 2.5 | UAT-surfaced: From-email SaaS sender override (deviation) | `1eca57d` | ✓ (unplanned) |
| 3 | Manual UAT — 3 checks | — | ✓ All passed |

## Files

### Created (planned)
- `src/app/finances/monthly-report/components/ReportStatusBar.tsx` — pill + 4 contextual button states
- `src/app/finances/monthly-report/components/__tests__/ReportStatusBar.test.tsx` — 9 tests passing
- `src/app/finances/monthly-report/hooks/useReportStatus.ts` — reads cfo_report_status, returns state + role
- `src/app/finances/monthly-report/services/approve-and-send.ts` — orchestrates PDF gen → base64 → POST

### Modified (planned)
- `src/app/finances/monthly-report/page.tsx` — mounts `<ReportStatusBar>` above MonthSelector
- `vitest.config.ts`, `tsconfig.json`, `package.json`, `package-lock.json` — vitest+react testing setup

### Modified (unplanned, UAT fix)
- `src/app/api/cfo/report-status/route.ts` — From-email override via `REPORT_FROM_EMAIL` / `REPORT_FROM_NAME` env vars (with fallback to coach email/name)
- `.env.example` — documents the new env vars

## UAT Results (Task 3)

| # | Check | Result |
|---|---|---|
| A | Pill appears on monthly report page (Draft + buttons) | ✓ |
| B | Approve & Send → email sends → pill flips to Sent | ✓ (cfo_email_log confirms `status_code: 200`, `message_id` populated) |
| C | Revert to Draft → pill flips back; email link still works | ✓ |

## Deviation from CONTEXT.md (D-09 amendment)

**Original D-09:** "From = assigned coach's email directly (e.g., `mattmalouf@wisdomcg.com.au`). Reply-To = same. This requires each coach's email to be verified in Resend. Initial rollout covers Matt only; additional coaches each complete Resend sender verification before their first send."

**Actual:** From = single SaaS sender (`cfo@wisdombi.ai`) configured via `REPORT_FROM_EMAIL` env var. Reply-To still uses the coach's own email so replies route back to the coach.

**Why:** Per-coach domain verification proved operationally painful during Plan 35-06 UAT. The user's first verification attempt (`wisdomcg.com.au`) wasn't done; pivot to a single verified sender (`wisdombi.ai`) eliminated the blocker without losing the "replies go to coach" behavior. Better SaaS pattern — one domain to verify, scales to N coaches.

**Code change:** Two-line edit in `src/app/api/cfo/report-status/route.ts`:
```ts
fromEmail: process.env.REPORT_FROM_EMAIL || body.coach_email,
fromName: process.env.REPORT_FROM_NAME || body.coach_name,
replyToEmail: body.coach_email,  // unchanged
```

**Forward note for Phase 36 / multi-coach onboarding:** the single-sender pattern means new coaches don't need their own Resend setup — they just need their auth.users.email captured correctly so Reply-To routes properly.

## Required env vars (added)

- `REPORT_FROM_EMAIL` — verified Resend sender address (e.g., `cfo@wisdombi.ai`)
- `REPORT_FROM_NAME` — display name (e.g., `WisdomBI CFO`)

Both must be set in dev `.env.local` AND in Vercel production env before Phase 35 ships to prod.

## Verification (automated)

- `npx tsc --noEmit` → exits 0
- `npx vitest run src/app/finances/monthly-report/components/__tests__/ReportStatusBar.test.tsx` → 9 tests pass (7 component + 2 hook)
- `npm run build` → success (all routes compile)

## Verification (manual, UAT)

- Resend domain `wisdombi.ai` verified in production Resend account
- Test email delivered to `mattmalouf@wisdomcoaching.com.au` with subject `<Business> — <Month> financial report`, PDF attached, "View Report" link opening `/reports/view/[token]`
- `cfo_email_log` row written with `status_code=200` and `resend_message_id`
- Revert button flips status back to draft; previously-sent email link continues to render the frozen snapshot

## Commits

- `856c9c4` — feat(35-06): add ReportStatusBar + useReportStatus + approve-and-send
- `7460725` — feat(35-06): mount ReportStatusBar in monthly-report top bar
- `1eca57d` — fix(35-06): override From to single SaaS sender via env vars

## Forward to Plan 35-07

Plan 35-07 will:
1. Wire `revertReportIfApproved()` into the commentary, snapshot, and settings save paths (D-16/D-17 — auto-revert to draft on approved-report edits)
2. Update ROADMAP.md to reflect the Make→Resend pivot AND the D-09 amendment to single-sender
3. Run final end-to-end UAT
