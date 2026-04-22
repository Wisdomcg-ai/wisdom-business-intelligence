---
phase: 40-playwright-e2e
plan: 01
status: complete
completed: 2026-04-23
---

# Plan 40-01 — Summary

## What was installed

- `@playwright/test@^1.59.1` (devDependency)
- Chromium headless shell (`~/Library/Caches/ms-playwright/`)

## What was created

| File | Purpose |
|---|---|
| `playwright.config.ts` | Chromium project, auto-starts prod build via webServer, supports `PLAYWRIGHT_BASE_URL` for external URLs |
| `e2e/smoke.spec.ts` | 3 tests — homepage + auth/login + coach/login render without errors |
| `e2e/coach-flow.spec.ts` | 4 scaffolded tests with `test.skip` — full coach-save flow, scenario C, invariant fire, session-expiry preservation |
| `e2e/README.md` | How to run + un-skip instructions |
| Updated `package.json` | `test:e2e`, `test:e2e:ui`, `test:e2e:headed` scripts |
| Updated `.gitignore` | `test-results/`, `playwright-report/`, `playwright/.cache/` |

## Test run result

```
3 passed, 4 skipped (46 seconds)
```

- ✅ homepage loads without unexpected console errors (vercel.live CSP warnings filtered)
- ✅ auth login page renders (Sign In button visible)
- ✅ coach login page renders (Coach Portal heading visible)
- ⏸️ coach writes to correct client business — skipped (needs test Supabase)
- ⏸️ coach with no active client sees empty state — skipped
- ⏸️ invariant fires if businessId == userId — skipped
- ⏸️ session expiry preserves coach client context — skipped

## Intentionally NOT done in this phase

1. **Full auth-based coach-flow tests.** Require a test Supabase project with seeded test coach + 2 test clients. `coach-flow.spec.ts` has a detailed comment block explaining exactly what's needed to un-skip.
2. **CI integration.** Running Playwright in GitHub Actions requires either a headless-compatible env or a service container. Deliberate follow-up — the infra here runs locally and against any external URL via `PLAYWRIGHT_BASE_URL=...`.
3. **Visual regression, mobile viewports, accessibility audits.** All future work — solid foundation is more valuable than a wide-but-shallow initial rollout.

## How to run against preview deployments

```bash
PLAYWRIGHT_BASE_URL=https://<preview-url>.vercel.app npm run test:e2e
```

## Git

One commit. Branch: `feat/phase-40-playwright`.
