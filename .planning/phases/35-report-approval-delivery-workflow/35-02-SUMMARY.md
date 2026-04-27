---
phase: 35-report-approval-delivery-workflow
plan: 02
subsystem: reports
tags: [hmac, token, url-builder, phase-36-forward-compat]
requires:
  - crypto (Node builtin)
  - REPORT_LINK_SECRET env var (runtime)
  - NEXT_PUBLIC_APP_URL env var (runtime)
provides:
  - signReportToken(statusId): string
  - verifyReportToken(token): string | null
  - buildReportUrl(params): string
affects:
  - none (new files only; no existing code modified except .env.example documentation)
tech_stack:
  added: []
  patterns: [hmac-sha256, base64url, timing-safe-compare, forward-compat-helper]
key_files:
  created:
    - src/lib/reports/report-token.ts
    - src/lib/reports/build-report-url.ts
    - src/lib/reports/__tests__/report-token.test.ts
    - src/lib/reports/__tests__/build-report-url.test.ts
  modified:
    - .env.example (added REPORT_LINK_SECRET section; force-added since file was gitignored)
decisions:
  - "D-20 locked: HMAC-SHA256 over JWT — matches existing src/lib/utils/encryption.ts pattern, zero new deps, shorter URLs"
  - "Token format: base64url(statusId).base64url(hmac) — mirrors createSignedOAuthState encoded.sig shape"
  - "D-21 honored: token payload contains ONLY statusId — no exp, no iat — tokens never expire"
  - "Secret-rotation is the only kill-switch (global); per-token revocation deferred (CONTEXT.md deferred-ideas)"
  - "buildReportUrl strips trailing slashes from appUrl to normalize https://x.com and https://x.com/ to same URL"
  - "periodMonth accepts YYYY-MM-DD or YYYY-MM; portal URL always emits YYYY-MM (no day) per D-22"
  - "encodeURIComponent applied to portalSlug to survive special characters (e.g., slashes in 'urban road/2')"
metrics:
  duration_minutes: 3
  tasks_completed: 3
  tests_added: 19
  files_created: 4
  files_modified: 1
  completed_date: "2026-04-23"
---

# Phase 35 Plan 02: Report URL Primitives Summary

**One-liner:** HMAC-SHA256 token sign/verify + forward-compatible `/reports/view` → `/portal/[slug]` URL builder, with 19 unit tests covering roundtrip, tampering, secret rotation, and Phase 36 portal fallback.

## What Shipped

Two pure utility modules in `src/lib/reports/` — no DB, no network, no mocks beyond env vars — plus their co-located tests and a documented `REPORT_LINK_SECRET` in `.env.example`.

### `src/lib/reports/report-token.ts`

- `signReportToken(statusId)` → `base64url(statusId).base64url(hmac_sha256(base64url(statusId)))`
- `verifyReportToken(token)` → returns the original `statusId` or `null`
- Uses Node built-in `crypto.createHmac('sha256', secret)` (mirrors `src/lib/utils/encryption.ts:148-162`)
- Uses `crypto.timingSafeEqual` to prevent signature-comparison timing attacks
- Throws a clear error when `REPORT_LINK_SECRET` is missing or under 16 chars
- **Token payload is ONLY the statusId** — no `exp`, no `iat`, no JSON wrapper. Tokens are valid forever until the secret rotates (D-21 accepted tradeoff).

### `src/lib/reports/build-report-url.ts`

- `buildReportUrl({ statusId, portalSlug?, periodMonth, appUrl? })`
- **Today path:** `portalSlug` null/undefined → returns `${appUrl}/reports/view/${token}` where `token = signReportToken(statusId)`
- **Phase 36 path:** `portalSlug` truthy → returns `${appUrl}/portal/${encodeURIComponent(slug)}?month=YYYY-MM`
- `appUrl` falls back to `process.env.NEXT_PUBLIC_APP_URL`; throws with a clear message if neither is set
- Trailing slashes on `appUrl` are stripped (`https://x.com` and `https://x.com/` produce identical URLs)

### `.env.example`

- Added a dedicated `# REPORT VIEW LINKS - Phase 35` block after the existing Resend block
- Documents `REPORT_LINK_SECRET=your-32-byte-hex-secret` with the generation command (`openssl rand -hex 32`) and the D-21 rotation warning
- Existing `RESEND_API_KEY` and `NEXT_PUBLIC_APP_URL` lines untouched

## Test Coverage (19 tests)

**report-token.test.ts (8 tests):**
1. `signReportToken` returns base64url.base64url format (charset asserted: `[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+`)
2. Roundtrip: `verifyReportToken(signReportToken(id)) === id`
3. `verifyReportToken('not-a-token')` → `null`
4. Tampered signature → `null`
5. Truncated payload → `null`
6. Secret rotated between sign and verify → `null` (D-21 verification)
7. Missing `REPORT_LINK_SECRET` throws with a message containing `REPORT_LINK_SECRET`
8. Empty `statusId` throws

**build-report-url.test.ts (11 tests):**
1. `portalSlug=null` → `/reports/view/<token>` with token that verifies back to statusId
2. `portalSlug='urban-road'` + `periodMonth='2026-03-01'` → `/portal/urban-road?month=2026-03`
3. `portalSlug` undefined → same as null (token URL)
4. `appUrl` omitted → falls back to `NEXT_PUBLIC_APP_URL`
5. Neither `appUrl` nor env var → throws with `NEXT_PUBLIC_APP_URL` in message
6. Trailing slash normalized (`https://x.com/` and `https://x.com` produce same URL)
7. `periodMonth='2026-03'` (YYYY-MM) accepted equivalently to YYYY-MM-DD
8. Malformed `periodMonth` throws
9. Explicit `appUrl` param overrides env var
10. Special characters in `portalSlug` URL-encoded (`urban road/2` → `urban%20road%2F2`)
11. Integration: token in URL is identical to `signReportToken(statusId)` (deterministic HMAC)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] `.env.example` required `git add -f`**
- **Found during:** Task 3 commit
- **Issue:** `.gitignore` line 34 (`.env*`) prevented adding `.env.example`; file was never tracked in the repo
- **Fix:** Used `git add -f .env.example` — `.gitignore` comment on line 33 explicitly says "can opt-in for committing if needed", so this is the intended escape hatch
- **Files modified:** .env.example (newly tracked)
- **Commit:** 7203f79

### Additional Tests Beyond Plan

The plan specified 7 and 6 tests for the two files; actual implementation has 8 and 11. The extras exercise edge cases the plan's "done" criteria implicitly require (portal-path encoding, integration with signReportToken, YYYY-MM acceptance, explicit `appUrl` override). No production code changed — all extra coverage is in the test files only.

## Key Technical Decisions

### Token Format: base64url(payload).base64url(sig)

The existing `createSignedOAuthState` in `src/lib/utils/encryption.ts:185-193` uses `encoded.sig` where `sig` is hex-encoded. For shorter URLs (reports tokens go in email links that users copy/paste), Plan 35-02 uses **base64url for the signature too** — cuts token length by ~25% vs hex. This is a minor divergence from the OAuth helper but stays within the "HMAC via Node crypto" canonical pattern.

### `NEXT_PUBLIC_APP_URL` Normalization Rule

Trailing slashes are stripped with `/\/+$/` (greedy) before concatenation. This handles both the canonical value `https://wisdombi.ai` and a common deploy-time mistake `https://wisdombi.ai/`. Helper test 6 asserts both produce identical output — no double-slash URLs reach the client.

### Tokens Never Expire (D-21)

The payload is a raw `base64url(statusId)` with no JSON wrapping. Adding `exp` later would be a breaking change (tokens in flight would all become decodable but not verifiable under the new schema). That's **intentional** per D-21 — per-token revocation is explicitly deferred in CONTEXT.md. If per-token revocation becomes necessary, the plan is to add a `snapshot_token_revoked_at` column (CONTEXT.md deferred-ideas) rather than changing the token format.

## Deploy-Time Work (Not In This Plan)

**Matt must add `REPORT_LINK_SECRET` to Vercel before Plan 35-05 (the public view route) deploys.** This plan only documents the variable — it's not yet set in production/preview environments.

```bash
# Generate once (save the value securely):
openssl rand -hex 32

# Add to Vercel production + preview:
vercel env add REPORT_LINK_SECRET production preview
```

Rotating this value invalidates every existing `/reports/view/[token]` link — irreversible global kill-switch. Do not rotate casually.

## Downstream Unblocked

Wave 2 plans can now import:

```typescript
import { signReportToken, verifyReportToken } from '@/lib/reports/report-token'
import { buildReportUrl } from '@/lib/reports/build-report-url'
```

- **Plan 35-04 (POST /api/cfo/report-status)** — will call `buildReportUrl` at send time
- **Plan 35-05 (/reports/view/[token] page)** — will call `verifyReportToken(params.token)` to extract statusId
- **Plan 35-06 (email template)** — will receive the URL already built by the route and embed it in the HTML body

## Success Criteria Verification

- [x] Two modules pure (no DB, no network) — testable offline
- [x] D-20 satisfied: no `jsonwebtoken` import (`grep jsonwebtoken src/lib/reports/` → 0 results)
- [x] D-21 verified: Test 6 of report-token.test.ts rotates `REPORT_LINK_SECRET` between sign and verify, asserts `null` returned
- [x] D-22 verified: Tests 1-3 of build-report-url.test.ts cover the null/undefined/truthy `portalSlug` branches
- [x] `npx vitest run src/lib/reports/` → 19 passed
- [x] `npx tsc --noEmit` → exit 0
- [x] Wave 2 unblocked

## Self-Check: PASSED

**Files exist:**
- `src/lib/reports/report-token.ts` → FOUND
- `src/lib/reports/build-report-url.ts` → FOUND
- `src/lib/reports/__tests__/report-token.test.ts` → FOUND
- `src/lib/reports/__tests__/build-report-url.test.ts` → FOUND
- `.env.example` → FOUND (contains `REPORT_LINK_SECRET`)

**Commits exist:**
- `490418e` → FOUND (Task 1: HMAC token helpers)
- `5a4621b` → FOUND (Task 2: buildReportUrl)
- `7203f79` → FOUND (Task 3: .env.example)

**Tests pass:** 19/19 green; `npx tsc --noEmit` exits 0.

**No stubs:** Both modules are fully wired. No hardcoded empty values, no "TODO", no placeholder returns. The Phase 36 portal branch is intentional forward-compat (D-22), not a stub.
