---
phase: 44-test-gate-ci-hardening
plan: 04
subsystem: ci
tags: [ci, playwright, e2e, smoke, github-actions, nightly]
status: complete
completed_at: "2026-04-28"
duration_minutes: 5
tasks_completed: 1
tasks_total: 1
files_created:
  - .github/workflows/playwright-nightly.yml
files_modified: []
key_files:
  created:
    - path: .github/workflows/playwright-nightly.yml
      lines: 73
      purpose: "Nightly Playwright smoke run against a deployed Vercel preview/production URL"
  modified: []
dependency_graph:
  requires:
    - "e2e/smoke.spec.ts (Phase 40 — 3 zero-dependency smoke tests)"
    - "playwright.config.ts (already honors PLAYWRIGHT_BASE_URL and skips webServer when set)"
  provides:
    - "Nightly Playwright Smoke GitHub Actions workflow"
    - "workflow_dispatch entry point with optional base_url override"
  affects:
    - "GitHub Actions schedule queue (one new daily cron job)"
tech_stack:
  added: []
  patterns:
    - "Mirror of supabase-preview.yml's actions/checkout@v4 + actions/setup-node@v4 + npm ci pattern"
    - "Artifact-only-on-failure (actions/upload-artifact@v4 with if: failure()) keeps green nights tidy"
decisions:
  - "Cron at 14:00 UTC, deliberately AFTER AU/NZ business hours so failures land in time for the next-morning standup without disturbing tenants (Dragon AUD, IICT NZ/HK, Fit2Shine, JDS)"
  - "Chromium-only browser install — matches the single-project setup in playwright.config.ts; avoids ~3 min of webkit/firefox download cost per run"
  - "PLAYWRIGHT_BASE_URL read from a repository secret (not hardcoded) so the target URL can rotate (stable preview → production) without editing the workflow"
  - "Slack/email notification intentionally left as TODO comment block — referencing a non-existent SLACK_WEBHOOK_URL secret would fail the run; will be wired in a later phase once the webhook is provisioned"
  - "Independent workflow file (NOT folded into supabase-preview.yml) — running Playwright on every PR would burn ~15 min × every PR, and TEST-06 specified nightly cadence"
metrics:
  duration: "~5 min"
  task_count: 1
  file_count: 1
requirements_addressed:
  - TEST-06
---

# Phase 44 Plan 04: Nightly Playwright Workflow Summary

A new GitHub Actions workflow (`.github/workflows/playwright-nightly.yml`, 73 lines) runs `e2e/smoke.spec.ts` against a Vercel preview/production URL every night at 14:00 UTC, with a manual `workflow_dispatch` entry point and HTML-report artifact upload on failure.

## What Was Built

Single-file deliverable: `.github/workflows/playwright-nightly.yml`.

The workflow:

1. **Triggers**
   - `schedule: cron: '0 14 * * *'` — daily at 14:00 UTC
   - `workflow_dispatch` with optional `base_url` input for ad-hoc runs against any URL (e.g. a specific PR's preview deployment)

2. **Job: `smoke`** — runs on `ubuntu-latest`, 15 min timeout
   - `actions/checkout@v4`
   - `actions/setup-node@v4` with Node 20 + npm cache
   - `npm ci` (full dependency install)
   - `npx playwright install --with-deps chromium` (chromium-only to match `playwright.config.ts`)
   - Run smoke tests with `PLAYWRIGHT_BASE_URL` resolved from `github.event.inputs.base_url` (manual override) OR `secrets.PLAYWRIGHT_BASE_URL` (scheduled runs)
   - Upload `playwright-report/` as artifact on failure only (`actions/upload-artifact@v4`, 14-day retention)

3. **TODO block** — Slack notification step is checked in as a commented-out reference implementation (using `slackapi/slack-github-action@v1.27.0`) so future-me has the syntax handy. No `SLACK_WEBHOOK_URL` secret is referenced outside the comment block.

## Cron Schedule & Time-Zone Reasoning

The cron expression `0 14 * * *` is in UTC (GitHub's only option). The corrected timezone math (also documented inline in the YAML header):

| Season | AU offset | NZ offset | Sydney start | Auckland start |
|---|---|---|---|---|
| Southern summer | AEDT UTC+11 | NZDT UTC+13 | ~01:00 | ~03:00 |
| Southern winter | AEST UTC+10 | NZST UTC+12 | ~00:00 | ~02:00 |

Runs always land between roughly midnight and 03:00 in our tenants' time zones — well after business hours close, well before the next morning starts. Failures will appear on the GitHub Actions UI before the user's day begins.

Tenants whose time zones drove this choice:
- **Dragon** (AUD) and **JDS** (Aeris Solutions) — Sydney
- **IICT** (NZ + HK FX, 3 entities) — Auckland (HK is +8, but reporting-relevant team is in NZ)
- **Fit2Shine** — Sydney

## Required Secret: `PLAYWRIGHT_BASE_URL`

The workflow reads `secrets.PLAYWRIGHT_BASE_URL` for scheduled runs. **This secret is not yet provisioned** — it is the responsibility of **Plan 44-05** to walk the user through setting it via a `human-action` checkpoint. Until then:

- Scheduled runs will fail fast (empty `baseURL` → connection error). This is by design — a missing secret should be an obvious failure rather than a silent green pass.
- Manual `workflow_dispatch` runs can supply the `base_url` input directly without the secret.

When provisioned, the secret should point to either:
- The production URL once confidence is high enough, or
- A stable Vercel "Production preview" alias (recommended for the first 1–2 weeks)

## Chromium-Only Choice

`playwright.config.ts` defines a single `chromium` project (Desktop Chrome). Installing webkit and firefox would add ~3 minutes of download per run for zero coverage benefit. If multi-browser smoke ever becomes necessary, that's a `playwright.config.ts` change first; this workflow follows.

## Future Enhancements (Out of Scope This Phase)

| Item | Phase | Reason for Deferral |
|---|---|---|
| Slack/email failure notification | TBD (after `SLACK_WEBHOOK_URL` secret provisioned) | Phase 44 must not reference secrets that don't exist; the workflow would fail at runtime |
| Multi-browser smoke (webkit, firefox) | If/when product supports them | Cost vs. coverage isn't justified today |
| Auth-gated smoke spec coverage | Future test-gate phase | Requires test-tenant DB seed; smoke tests are deliberately zero-dependency |
| Trace-on-failure separate artifact | If failures become common | `--reporter=html` already includes trace screenshots; raw traces add noise |

## Run Status

The workflow has been committed but **not yet executed**. The first run will be either:

1. The next 14:00 UTC after merge to `main` (scheduled cron), OR
2. A manual `workflow_dispatch` from Plan 44-05's checkpoint (recommended for initial validation)

The PHASE.md success criterion of "three consecutive green nights" is verified post-merge in Plan 44-05's checkpoint.

## Verification Performed

All plan acceptance criteria pass:

| Check | Result |
|---|---|
| `test -f .github/workflows/playwright-nightly.yml` | OK |
| `python3 -c "import yaml; yaml.safe_load(...)"` (YAML parses) | OK |
| `grep -F "0 14 * * *" ...` | matches |
| `grep -c "workflow_dispatch:" ...` | 1 |
| `grep -c "smoke.spec.ts" ...` | 2 |
| `grep -c "PLAYWRIGHT_BASE_URL" ...` | 3 |
| `grep -c "actions/upload-artifact" ...` | 1 |
| `grep -c "TODO" ...` | 1 |
| `grep "SLACK_WEBHOOK_URL" ... | grep -v "^\s*#"` (uncommented) | empty (OK) |
| `git diff playwright.config.ts e2e/smoke.spec.ts` | empty (OK — unchanged) |
| `npx playwright test e2e/smoke.spec.ts --list` | 3 tests listed (OK) |

Local sanity confirmed by listing tests with `PLAYWRIGHT_BASE_URL=https://example.test`:

```
[chromium] › smoke.spec.ts:9:7 › smoke › homepage loads without unexpected console errors
[chromium] › smoke.spec.ts:27:7 › smoke › auth login page renders
[chromium] › smoke.spec.ts:32:7 › smoke › coach login page renders
Total: 3 tests in 1 file
```

## Deviations from Plan

None — plan executed exactly as written. The plan's `<action>` block contained a complete YAML payload with a corrected timezone-math comment; that payload was used verbatim with the time-zone-math expanded into a small table inline in the comment header for clarity (no behavioural change, comment-only).

## Commits

| Task | Commit | Message |
|---|---|---|
| 1 | `d6f932b` | `feat(44-04): add nightly Playwright workflow against Vercel preview` |

## Self-Check: PASSED

- File `.github/workflows/playwright-nightly.yml` exists (73 lines, valid YAML)
- Commit `d6f932b` exists in `git log --oneline`
- All acceptance criteria checks return expected values
- `playwright.config.ts` and `e2e/smoke.spec.ts` unchanged (constraint honoured)
- No `SLACK_WEBHOOK_URL` reference outside the comment block (constraint honoured)
- Workflow not executed (constraint honoured — Plan 44-05's job)
