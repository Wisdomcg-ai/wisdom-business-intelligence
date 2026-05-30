---
status: partial
phase: 69-xero-token-auto-refresh-diagnosis-production-durability-fix
source: [69-VERIFICATION.md]
started: 2026-05-30T01:50:00Z
updated: 2026-05-30T01:50:00Z
---

## Current Test

[awaiting human testing — gated on PR #231 merge + production deploy]

## Tests

### 1. Vercel cron registration appears in dashboard after deploy
expected: After PR #231 merges and Vercel deploys, Vercel Dashboard → Project Settings → Crons lists all 5 crons (refresh-xero-tokens, sync-all-xero, reconciliation-watch, daily-health-report, weekly-digest) with valid "Next run" timestamps.
result: [pending]

### 2. cron_heartbeats table receives rows within 12h of deploy
expected: 12h after deploy, run `SELECT cron_path, COUNT(*), MAX(ran_at) FROM cron_heartbeats WHERE ran_at > now() - interval '12 hours' GROUP BY cron_path;` and confirm `refresh-xero-tokens` shows ≥2 rows (cron fires every 6h, so 12h window = 2 expected ticks). Other cron paths show ≥1 row.
result: [pending]

### 3. Sentry alerts configured per 69-04-MONITORING-RUNBOOK.md
expected: 4 Sentry alerts created and active:
- `xero_token_pre_expiry` — warns when expires_at within 24h and not refreshed
- `xero_connection_deactivated` — fires on refresh failure
- `cron_refresh_xero_tokens_*` failure invariants
- `cron_heartbeat_insert_failed` / `cron_heartbeat_threw` — heartbeat plumbing failures
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps

(none — all 3 items are post-deploy operational verifications, not gaps in shipped code)
