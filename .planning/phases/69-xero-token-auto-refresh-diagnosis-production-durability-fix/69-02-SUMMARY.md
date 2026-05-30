# 69-02 — Manual Xero Reconnect — SUMMARY

**Phase:** 69 — Xero token auto-refresh diagnosis + production durability fix
**Plan:** 69-02
**Type:** Interactive checkpoint (autonomous: false)
**Executed:** 2026-05-30
**Outcome:** ✓ 5/5 tenants reconnected

## What shipped

- **Runbook:** [69-RECONNECT-RUNBOOK.md](./69-RECONNECT-RUNBOOK.md) — reusable procedure for clearing expired Xero connections via OAuth re-consent. Captures pre-flight checks, OAuth URL pattern, verification SQL, and operator quirks discovered during execution.
- **Investigation helper:** `scripts/phase-69-reconnect-investigate.mjs` — queries `xero_connections` for recently-updated rows + per-tenant detail. Used when the audit script appeared to show stale state immediately after a reconnect.
- **5 reconnected production tenants** unblocking month-end reporting:

| Client | Tenant | businesses.id (short) | expires_at after |
|---|---|---|---|
| Envisage | Malouf Family Trust (AUD) | `8c8c63b2…` | `2026-05-30T02:12Z` |
| Just Digital | Aeris Solutions Pty Ltd (AUD) | `fea253dd…` | `2026-05-30T02:14Z` |
| IICT | IICT Group Pty Ltd (AUD) | `fbc6dffd…` | `2026-05-30T02:16Z` |
| IICT | IICT (Aust) Pty Ltd (AUD) | `fbc6dffd…` | `2026-05-30T02:16Z` |
| IICT | IICT Group Limited (HKD) | `fbc6dffd…` | `2026-05-30T02:16Z` |

## Total operator time

~5 minutes (much faster than 25-min plan estimate because IICT's 3 tenants refreshed in a single OAuth flow).

## Key quirks discovered

1. **Audit script transient stale-read** — `phase-69-token-state-audit.mjs` showed pre-reconnect state on first invocation immediately after a successful OAuth callback. Re-running the script seconds later showed fresh data. Possibly a Supabase REST API caching layer or a client-side query cache in the script's connection. The investigation helper script confirmed actual DB state was correct. **Implication for monitoring:** post-reconnect verification should retry on stale read rather than alerting.

2. **Single OAuth flow refreshes all tenants under a business_id** — the callback iterates every tenant the consent scope returns and upserts each by `(business_id, tenant_id)`. So for multi-tenant businesses (IICT), one reconnect refreshes all rows simultaneously, including across mixed currencies (2× AUD + 1× HKD).

3. **`id` column changes on reconnect** — appears the callback either DELETEs+INSERTs or INSERTs with a fresh PK rather than UPDATEing in-place. Application code is unaffected because queries key by `(business_id, tenant_id)` not by `id`, but any future foreign key into `xero_connections.id` would be a problem. None observed at time of this run.

4. **No `pending_xero_connections` table observed** — older docs may reference a pending pattern. Current callback writes directly to `xero_connections`.

## Verification

- [x] All 5 tenants show `expires_at > now() + interval '1 hour'` at time of verification (note: Xero access tokens are 30-min; "1h" threshold is conservative and will only hold for first ~30 min before on-demand or cron-driven refresh fires)
- [x] All 5 tenants show `updated_at` within 5 minutes of execution
- [x] All 5 tenants show `is_active=true`
- [x] Runbook contains required sections: `## Pre-flight`, `## Per-Tenant Reconnect Loop`, `## Verification SQL`, `## Reconnect Outcome`, `## Final State`, `## Operator Notes`
- [x] Runbook contains all 5 tenants (Envisage, Aeris, IICT×3) in the Reconnect Outcome table
- [x] Zero modifications to `src/` (`git status --porcelain src/` empty)

## Followups

1. **Once PR #231 merges + deploys:** verify cron `refresh-xero-tokens` resumes firing by checking `cron_heartbeats` table within 12h (per `69-04-MONITORING-RUNBOOK.md`)
2. **If cron still does not fire:** fallback to external cron (GitHub Actions hitting `/api/cron/refresh-xero-tokens` with `Authorization: Bearer ${CRON_SECRET}`) — runbook documented but not built
3. **Until cron deploys:** on-demand refresh via `token-manager.getValidAccessToken()` keeps these 5 tokens alive during normal user activity. Tokens will only re-expire if a tenant goes >30min without any user activity AND the cron is not running.

## Files changed

- `.planning/phases/69-xero-token-auto-refresh-diagnosis-production-durability-fix/69-RECONNECT-RUNBOOK.md` (new)
- `.planning/phases/69-xero-token-auto-refresh-diagnosis-production-durability-fix/69-02-SUMMARY.md` (new — this file)
- `scripts/phase-69-reconnect-investigate.mjs` (new — reusable troubleshooter)

Zero production code or schema changes.
