# E2E Tests (Playwright)

End-to-end tests for the Wisdom Business Intelligence platform. Uses
Playwright with Chromium.

## Running locally

```bash
# First time only: install the Chromium browser binary
npx playwright install chromium

# Run all tests (builds + starts the app automatically, then tears down)
npm run test:e2e

# Run interactively with the Playwright UI
npm run test:e2e:ui

# Run with a visible browser window (useful for debugging)
npm run test:e2e:headed

# Run against an external URL (e.g. Vercel preview deployment)
PLAYWRIGHT_BASE_URL=https://preview-url.vercel.app npm run test:e2e
```

## Test files

| File | Runs? | What it covers |
|---|---|---|
| `smoke.spec.ts` | ✅ always | Homepage + auth login + coach login pages render without console errors. Zero setup. |
| `coach-flow.spec.ts` | ⏸️ skipped | Full coach-saves-to-correct-business flow. Requires a seeded test Supabase project. |

## Un-skipping the coach-flow tests

See the comment block at the top of `coach-flow.spec.ts`. Summary:

1. Provision a test Supabase project (separate from production)
2. Seed with a test coach + 2 test clients
3. Add test env vars to `.env.test`
4. Remove `test.skip(...)` calls

Once un-skipped, these tests would have caught the original
"coach saves to my business" bug pre-merge. They're the safety net for
every future refactor that touches business-id resolution.

## CI

Not yet wired to CI. Phase 40 intentionally scoped to local infrastructure
+ smoke tests only. Follow-up phase will add `test:e2e` to
`.github/workflows/`.
