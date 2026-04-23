---
phase: 35-report-approval-delivery-workflow
plan: 03
subsystem: email
tags: [resend, email, pdf-attachment, abortsignal, timeout, vitest]

# Dependency graph
requires:
  - phase: pre-phase-35
    provides: "resend@6.6.0 SDK + existing src/lib/email/resend.ts wrapper (pattern reference)"
provides:
  - "sendMonthlyReport() — single-purpose Resend wrapper for monthly CFO report delivery"
  - "SendMonthlyReportParams + SendMonthlyReportResult TypeScript contracts for the API route (Plan 35-04) to consume"
  - "15-second AbortSignal.timeout + Promise.race deadline pattern, isolated from the generic sendEmail()"
affects: [35-04, 35-05, 35-06, 35-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Promise.race(sendPromise, deadline) with AbortSignal.timeout for bounded external calls"
    - "Class-style vi.mock factory so `new Resend(apiKey)` constructs in tests"
    - "Separate email-sender module per high-value flow (instead of extending src/lib/email/resend.ts)"

key-files:
  created:
    - "src/lib/email/send-report.ts"
    - "src/lib/email/__tests__/send-report.test.ts"
  modified: []

key-decisions:
  - "Use AbortSignal.timeout + Promise.race for the 15s deadline (D-12); do NOT pass signal to Resend SDK because v6.6.0 emails.send has no abort option — race the promises instead"
  - "Use rgb(23, 34, 56) instead of #172238 in the email body to satisfy the 'no 5+ digit runs' test (D-06 — 'no headline numbers'); the 6-digit hex would otherwise appear as numeric data to the test"
  - "Mock resend via `class { emails = { send: mockSend } }` rather than `vi.fn(() => ...)` — vi.fn factories are not constructors, so `new Resend(...)` throws"
  - "Keep coach email + name as required params (fromEmail, fromName); no hardcoded default — single-coach rollout is enforced by the caller, not this module"
  - "Throw synchronously on missing RESEND_API_KEY — fail loudly so misconfigured environments never silently drop sends"

patterns-established:
  - "Bounded external API call: race the SDK promise against a deadline that resolves to a structured error result, not a thrown rejection"
  - "TDD RED→GREEN with vi.stubEnv for env-gated code paths (no hoisting surprises)"

requirements-completed: [APPR-02, APPR-03, APPR-04, APPR-05]

# Metrics
duration: 3min
completed: 2026-04-23
---

# Phase 35 Plan 03: Resend sendMonthlyReport wrapper Summary

**15-second-deadline Resend wrapper that sends branded monthly CFO reports with PDF attachment, coach-email From/Reply-To, and structured success/error/timeout results — all 10 TDD behaviors green.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-23T19:07:11Z
- **Completed:** 2026-04-23T19:10:12Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files created:** 2

## Accomplishments

- `src/lib/email/send-report.ts` exports `sendMonthlyReport()` implementing every D-05..D-13 email decision.
- 10-test unit suite mocks the Resend SDK entirely; no network in CI.
- Deadline path (D-12) has explicit test coverage via `AbortSignal.timeout(30)` + never-resolving mock, completing in <1s.
- TypeScript `tsc --noEmit` passes cleanly across the whole project.
- Plan 35-04's API route can import this module directly — the contract (`SendMonthlyReportParams`, `SendMonthlyReportResult`) is locked.

## Task Commits

1. **TDD RED — failing tests for sendMonthlyReport wrapper** — `e20cd90` (test)
2. **TDD GREEN — implement sendMonthlyReport Resend wrapper** — `356792b` (feat)

_Note: the GREEN commit also adjusted the vitest mock factory from `vi.fn(() => ...)` to a class, because `vi.fn` factories are not constructors._

## Exported Contract (copy-paste ready)

```typescript
export interface SendMonthlyReportParams {
  to: string                   // businesses.owner_email (D-10 — single recipient)
  fromEmail: string            // coach's Resend-verified email (D-09)
  fromName: string             // coach display name for From header
  replyToEmail: string         // usually same as fromEmail (D-09)
  businessName: string         // used in subject + body
  monthLabel: string           // "March 2026"
  clientGreetingName: string   // "Sarah" (first name for greeting)
  reportUrl: string            // from buildReportUrl()
  pdfBuffer: Buffer            // decoded client-side-generated PDF (D-07)
  pdfFilename: string          // "urban-road-2026-03-report.pdf"
  timeoutMs?: number           // default 15_000 (D-12)
}

export interface SendMonthlyReportResult {
  success: boolean
  id?: string                  // Resend message id on success
  error?: string               // Human-readable
  errorCode?: string           // Resend error name (e.g. 'invalid_from_address')
  statusCode?: number          // 200 on success
  timedOut?: boolean           // true when the 15s deadline wins the race
}
```

## Deadline Mechanism

```
Promise.race([
  resend.emails.send(...) wrapped in try/catch returning SendMonthlyReportResult,
  deadline(timeoutMs) — resolves to { success:false, timedOut:true, error }
    when AbortSignal.timeout(ms) fires its 'abort' event
])
```

The signal is NOT passed to Resend because the installed SDK (v6.6.0) does not expose an abort option on `emails.send`. When the deadline wins, the SDK call may still complete on Resend's side — we simply stop waiting for it. Matt's observed Resend p99 is under 2s, so genuine timeouts will be rare and almost always mean a real outage rather than a slow-but-succeeding send.

## Decisions Made

See `key-decisions` in frontmatter. Notable one:

- **Body uses `rgb(23, 34, 56)` not `#172238`** for the navy text color — purely to satisfy the plan's Test 7 assertion that stripping `reportUrl` from the email HTML leaves no 5+ consecutive digit runs (a proxy for "no financial numbers in the body"). Hex navy triggers the regex; RGB form splits the digits with commas and spaces.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] vi.mock factory needed to be class-based**
- **Found during:** Task 1 GREEN step (first test run)
- **Issue:** The plan's suggested `vi.mock('resend', () => ({ Resend: vi.fn(() => ({ emails: { send: mockSend } })) }))` fails because `vi.fn(() => ...)` produces a function that is not callable with `new`. 9 of 10 tests threw `TypeError: ... is not a constructor`.
- **Fix:** Changed mock to `Resend: class { emails = { send: mockSend } }` — idiomatic, allows `new Resend(apiKey)`, and preserves `mockSend` as the single observable.
- **Files modified:** `src/lib/email/__tests__/send-report.test.ts`
- **Verification:** All 10 tests pass; mockSend.mock.calls still captures call args as expected.
- **Committed in:** `356792b` (folded into GREEN commit)

**2. [Rule 1 - Bug] Navy hex color broke Test 7 regex**
- **Found during:** Task 1 GREEN step (Test 7)
- **Issue:** The plan's implementation snippet used `color: #172238` in the body inline style, but Test 7 asserts `htmlWithoutUrl.not.toMatch(/\d{5,}/)` — the 6-digit hex triggers a false positive for "headline numbers in body".
- **Fix:** Switched to `color: rgb(23, 34, 56)`. Visually identical; regex no longer matches.
- **Files modified:** `src/lib/email/send-report.ts`
- **Verification:** Test 7 passes; the rest of the suite unaffected.
- **Committed in:** `356792b`

**3. [Rule 1 - Bug] JSDoc example email tripped "no hardcoded coach email" criterion**
- **Found during:** Task 1 verification (acceptance criteria grep)
- **Issue:** `grep -c 'mattmalouf' src/lib/email/send-report.ts` returned 1 — the string lived in a JSDoc `@e.g.` comment for `fromEmail`. Acceptance criterion requires 0. The intent (parameterise, not hardcode) was already satisfied in executable code, but the literal grep criterion demanded the string vanish.
- **Fix:** Rewrote the JSDoc comments to describe the purpose without the example address.
- **Files modified:** `src/lib/email/send-report.ts`
- **Verification:** `grep -c 'mattmalouf' src/lib/email/send-report.ts` returns 0.
- **Committed in:** `356792b`

---

**Total deviations:** 3 auto-fixed (1 blocking test infra, 2 minor spec-literal fixes)
**Impact on plan:** Zero scope drift. All three fixes align with the plan's stated intent — the plan's snippets would have failed its own acceptance criteria if implemented verbatim. Everything committed within the single TDD GREEN commit.

## Issues Encountered

None beyond the three deviations above. First vitest run caught all three; fixed in one iteration each.

## User Setup Required

None for this plan. `RESEND_API_KEY` is already in `.env` and production Vercel env per the existing `src/lib/email/resend.ts` usage in 10+ routes. Per-coach sender verification in the Resend dashboard is a Plan 35-04 (API route wiring) and Plan 35-07 (deploy checklist) concern, not this plan's.

## Next Phase Readiness

- Plan 35-04 (`POST /api/cfo/report-status`) can import `sendMonthlyReport` directly from `@/lib/email/send-report` and pass the exact params it already plans to assemble (coach email, business name, month label, PDF buffer).
- No module coupling with Plan 35-01 (schema) or Plan 35-02 (middleware/token) — parallel-safe.

## Self-Check: PASSED

Verified before writing this section:

- **Files exist:**
  - `src/lib/email/send-report.ts` ✓ (FOUND)
  - `src/lib/email/__tests__/send-report.test.ts` ✓ (FOUND)
  - `.planning/phases/35-report-approval-delivery-workflow/35-03-SUMMARY.md` ✓ (this file)
- **Commits exist:**
  - `e20cd90` (test: failing RED) ✓ FOUND in `git log`
  - `356792b` (feat: implementation GREEN) ✓ FOUND in `git log`
- **Tests green:** `npx vitest run src/lib/email/__tests__/send-report.test.ts` → 10 passed (10)
- **Types clean:** `npx tsc --noEmit` → exit 0
- **All 14 acceptance-criteria grep checks pass** (including `mattmalouf:0`, `@react-email:0`, `new Resend:1`, `AbortSignal:2`, `15_000:2`).

---
*Phase: 35-report-approval-delivery-workflow*
*Completed: 2026-04-23*
