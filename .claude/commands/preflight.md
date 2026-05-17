---
description: Run the full local CI gate (typecheck, tests, lint, build) and report pass/fail before opening a PR
---

Run the same checks CI runs, in this order, and report a clear pass/fail summary.
Do not fix anything yet — this command is a diagnostic. If something fails, report
it and ask whether to investigate.

Run each step and capture the result:

1. **Typecheck** — `npx tsc --noEmit`
   Pass = zero `error TS` lines. Ignore pre-existing errors only in stray
   duplicate scripts (files with a literal ` 2`/` 3` suffix in the name) — those
   are known junk; call them out separately, don't count them as a failure.

2. **Tests** — `npx vitest run` (the FULL suite, not a scoped path).
   This is deliberate: scoped runs miss cross-file regressions when a shared
   helper or import changed. Pass = 0 failed.
   Note: `plan-period-banner.test.tsx` can fail locally only due to a timezone
   artifact (AEST) — it passes in CI. If that is the *only* failure, flag it as
   a known local-only artifact, not a real regression.

3. **Lint** — `npm run lint`

4. **Build** — `npm run build`

Report as a table: each step, PASS/FAIL, and the first failure line if any.
End with an overall verdict:
- **READY** — all four green → safe to open/update a PR.
- **NOT READY** — list exactly what failed and offer to investigate.

Keep the output tight. The point is a fast, honest go/no-go before pushing.
