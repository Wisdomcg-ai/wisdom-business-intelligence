# WisdomBI — Reliability / Xero-Durability / Ops Gap Audit (Pass 2)

**Generated:** 2026-05-31
**Branch/commit:** `main` @ e1b4e7c7 (Phase 70 merged)
**Method:** Static read-only analysis. No code changed, no app run, no DB/network access.
**Scope:** Net-new reliability/integration/ops findings NOT already captured in R1–R28 (C-01–C-40). Plus Phase-70 drift in this lane.

Companion to: `docs/maturity-audit:.planning/codebase/REMEDIATION-ROADMAP.md` (R1–R28) and `CONCERNS.md` (C-01–C-40). Do not re-report those.

---

## (a) Net-new findings

### REL-N1 · Xero health check is DEAD — selects a column that does not exist on `xero_connections`
- **Sev:** CRITICAL · **Effort:** S · **Fork:** CODE
- **What:** Both `checkXero()` and the daily-health-report query `xero_connections` for `token_expires_at` and `last_synced_at`. **`xero_connections` has NO `token_expires_at` column** — the token TTL column on that table is `expires_at`. (`token_expires_at` exists only on the `pending_xero_connections` table, schema line 3813.) Selecting a nonexistent column makes PostgREST return an `error`, which both code paths treat as "table unavailable" and **early-return `status: "ok"`**. Net effect: the entire Xero health signal — token-expiry detection AND stale-sync detection — is permanently dark. `health.checks.xero` always reports healthy; the daily-health-report's "Attention Needed → Xero" section never populates. For a product whose #1 incident class is "connected but not syncing", the dedicated observability surface for exactly that failure is non-functional.
- **Evidence:**
  - `src/lib/health-checks.ts:92` — `.select("id, business_id, is_active, token_expires_at, last_synced_at")` then `if (error) return { status: "ok", message: "Xero table unavailable" }` (line 94-95).
  - `src/app/api/cron/daily-health-report/route.ts:73` — same nonexistent-column select; `token_expires_at` read at `:91`, `last_synced_at` read at `:94`.
  - `xero_connections` column list: `supabase/migrations/00000000000000_baseline_schema.sql:5543–5560` — has `expires_at` (5548) and `last_synced_at` (5555), NO `token_expires_at`.
  - `token_expires_at` only ever written to `pending_xero_connections` (`Xero/callback/route.ts:423`); `complete-connection/route.ts:155` maps it into `xero_connections.expires_at`. No migration adds `token_expires_at` to `xero_connections`.
- **Why missed in pass 1:** Pass 1 catalogued cron auth + heartbeats but did not execute/trace the health-check query against the schema. The bug is invisible at the call-site (it "looks" like a normal select); it only surfaces by diffing the selected columns against the actual table DDL.
- **Fix:** Change both selects to `expires_at`; on `error`, return `status: "warning"|"error"` (NOT "ok") so a genuinely missing table/column screams instead of masking. Add a test that asserts the selected columns exist.

### REL-N2 · Nightly cron sync never updates `xero_connections.last_synced_at` → stale-sync detector (once REL-N1 fixed) will false-positive
- **Sev:** HIGH · **Effort:** S · **Fork:** CODE
- **What:** The orchestrator (`runSyncForAllBusinesses` → `syncBusinessXeroPL`), which is the cron's actual nightly sync, writes `xero_accounts.last_synced_at` (catalog) and `sync_jobs`, but **never updates `xero_connections.last_synced_at`**. That column is only bumped by the user-driven/legacy paths (`Xero/sync/route.ts:179`, `monthly-report/sync-xero/route.ts:361`, `callback`, `complete-connection`). So after REL-N1 is fixed, the "Stale sync (business …)" warning would fire for every tenant that is synced ONLY by the nightly cron and not opened in the UI within 24h — i.e. it inverts: a perfectly-synced dormant tenant is flagged stale, while a never-cron-synced tenant that a user opened looks fresh. The freshness signal is reading the wrong event.
- **Evidence:** `src/lib/xero/sync-orchestrator.ts` — no `xero_connections` update of `last_synced_at` anywhere (writes target `xero_pl_lines`, `xero_bs_lines`, `xero_accounts`, `sync_jobs`, `functional_currency`). Confirmed by grep: only `accounts-catalog.ts:190` writes `last_synced_at` and it targets `xero_accounts` (`:197`).
- **Why missed:** Same root as REL-N1 — the dead select hid the downstream semantics; nobody traced which event actually advances the timestamp.
- **Fix:** Have the orchestrator bump `xero_connections.last_synced_at` on successful per-tenant sync, OR derive freshness from `sync_jobs.finished_at` (the real source of truth) instead of `last_synced_at`.

### REL-N3 · Token-refresh path ignores Xero `Retry-After` on 429 (the rate-limit-aware client is NOT used here)
- **Sev:** MEDIUM (HIGH under portfolio growth / Xero throttling) · **Effort:** S–M · **Fork:** CODE
- **What:** `fetchXeroWithRateLimit` (`xero-api-client.ts`) correctly honors `Retry-After`, daily/minute/concurrent problems — but it is used ONLY by the sync data path. The **token refresh** (`refreshTokenWithRetry`, the hot path for the `refresh-xero-tokens` cron AND every `getValidAccessToken` call) does a raw `fetch` to `identity.xero.com/connect/token` and on a 429 returns `categorizeError` → `rate_limited` with `shouldDeactivate` undefined, which the retry loop treats as transient and retries on a fixed `1s/2s/4s` exponential backoff **with no respect for `Retry-After`**. Under a minute/daily throttle on the identity endpoint, this hammers Xero during exactly the window Xero asked us to back off, and after 3 quick attempts gives up — surfacing as a transient `failed` that the cron will re-hammer on the next tick.
- **Evidence:** `src/lib/xero/token-manager.ts:380` (raw `fetch`), `:551–556` + `:563–567` (backoff ignores any header), `:672–679` (`categorizeError` 429 branch returns no backoff hint). Contrast the correct handling at `xero-api-client.ts:192–241`.
- **Why missed:** R8 flagged the sequential-loop timeout and bare catches in the orchestrator, but the token-manager's separate, hand-rolled fetch/retry was not compared against the rate-limit client.
- **Fix:** Parse `Retry-After` in the 429 branch and sleep accordingly (cap to a sane max); or route the identity call through a shared backoff helper.

### REL-N4 · `getValidAccessToken` lock-contention fallback can stampede Xero with a 2s fixed wait
- **Sev:** MEDIUM · **Effort:** S · **Fork:** CODE
- **What:** When `acquireRefreshLock` fails (a sibling holds the 30s lock), the caller sleeps a **fixed 2000ms once**, re-fetches, and if the token is still stale **falls through and refreshes itself anyway, without the lock**. If the lock-holder's Xero call takes >2s (common under 429/backoff — see REL-N3, where backoff alone can be 1–7s), every concurrent caller proceeds to refresh in parallel. Xero rotates the refresh token on each successful refresh, so N parallel refreshes ⇒ N-1 of them present an already-rotated refresh token ⇒ `invalid_grant` ⇒ the Hole-B race-check is the ONLY thing preventing a spurious deactivation. This is the classic double-refresh-invalidation gotcha, only partially mitigated. The single 2s wait is too short relative to the 30s lock and the multi-second backoff windows.
- **Evidence:** `src/lib/xero/token-manager.ts:225–262` (lock-not-acquired branch: `sleep(2000)` then unconditional fall-through), lock TTL `:707` (30s). Race mitigation depends entirely on `refetchConnectionForRaceCheck` (`:124`, `:440`).
- **Why missed:** Pass 1 noted the lock exists (Phase 53) and assumed it closes the race; the fixed-2s fall-through gap was not stress-traced against backoff durations.
- **Fix:** Loop the wait+refetch (e.g. poll up to ~lock TTL with short sleeps) before self-refreshing, or have non-lock-holders return a transient "retry next tick" instead of self-refreshing.

### REL-N5 · `refreshTokenWithRetry` DB-save failure returns `success:true` with an UNSAVED rotated token → next call gets `invalid_grant` and deactivates a healthy connection
- **Sev:** HIGH · **Effort:** S · **Fork:** CODE
- **What:** On a successful Xero refresh, if the `update` that persists the new access/refresh tokens fails (`updateError`), the function logs and returns `{ success: true, accessToken: <new>, error: 'database_error' }`. The current request proceeds with the new access token, but the **new refresh token was never saved** — Xero has already rotated and invalidated the OLD refresh token. The very next refresh uses the stale (now-invalid) refresh token from the DB → Xero returns `invalid_grant` → the connection is **deactivated as if the user revoked access**, when in fact a transient DB write failed. A single transient Supabase write blip can silently disconnect a live tenant.
- **Evidence:** `src/lib/xero/token-manager.ts:402–422` — on `updateError`, comment says "Return the new token anyway… Next request will refresh again," but the next request refreshes with the un-rotated DB token, which is now dead. `invalid_grant` path → deactivation at `:538–545`.
- **Why missed:** R25 covered BS delete-then-insert returning success-on-failure; this is the same "success masks a write failure" class but in the token path, which pass 1 did not trace to its next-call consequence.
- **Fix:** On `updateError`, return `success:false` (transient `database_error`, `shouldDeactivate:false`) so the caller retries the whole refresh rather than committing to an unpersisted rotation; never let a token rotation go un-saved while reporting success.

### REL-N6 · `sync-all-xero` 300s budget vs realistic sequential workload — risk of mid-portfolio truncation with NO partial-progress heartbeat granularity
- **Sev:** MEDIUM (grows with tenant count) · **Effort:** M · **Fork:** CODE
- **What:** `runSyncForAllBusinesses` iterates businesses **sequentially**, and each `syncBusinessXeroPL` issues ~52 sequential Xero calls per tenant-org (org + accounts + ~24 P&L months + 2 FY-totals + ~24 BS month-ends), each potentially incurring multi-second 429/5xx backoff (up to 60s on a single 5xx exhaust). At ~27 tenants this can blow well past `maxDuration = 300`. When Vercel kills the function mid-loop, the businesses not yet reached get **no `sync_jobs` row and no heartbeat detail** — the cron's single end-of-run heartbeat never executes (the function was killed before line 49), so the heartbeat table shows a MISSING invocation, indistinguishable from "Vercel didn't fire the cron" (the exact Phase-69 failure mode heartbeats were meant to disambiguate). Truncation looks identical to non-invocation.
- **Evidence:** `sync-orchestrator.ts:1268–1270` (sequential per-business loop, no per-business time budget); per-tenant call fan-out `:645–1025`; `xero-api-client.ts:60` 5xx backoff up to 60s; cron heartbeat only at `sync-all-xero/route.ts:49` (after the whole run). `maxDuration=300` at `:30`.
- **Why missed:** R8 framed the timeout risk on the *token-refresh* cron (~200ms/conn). The *sync* cron's per-tenant fan-out is an order of magnitude heavier and was not separately budgeted.
- **Fix:** Add a wall-clock budget check in the business loop that stops cleanly and records a `partial`/`truncated` heartbeat with the count processed; consider bounded concurrency or chunked continuation. Distinguish "ran but truncated" from "never ran."

### REL-N7 · `weekly-digest` and `daily-health-report` write NO Sentry capture for per-item email send failures — only an aggregate count
- **Sev:** LOW–MEDIUM · **Effort:** S · **Fork:** CODE
- **What:** In `weekly-digest`, a per-coach failure is pushed onto a local `errors[]` string array and reflected only as a `partial` heartbeat + an `errors` count in the JSON response — **no Sentry event**. There is no alertable signal that coach X stopped receiving digests; you'd only see it by reading heartbeat metadata. `daily-health-report` similarly only sets heartbeat `status:'partial'` when the email send fails (`result.success===false`) with no Sentry capture — so if Resend silently fails, the one email that tells the operator everything is healthy just… doesn't arrive, and nothing pages.
- **Evidence:** `weekly-digest/route.ts:199` (`errors.push`), `:201–203` (catch → `errors.push`, no Sentry), heartbeat-only at `:208`. `daily-health-report/route.ts:196–200` (partial heartbeat, no Sentry on `!result.success`).
- **Why missed:** Pass 1 confirmed heartbeats exist; it did not check whether per-item failures inside a successful invocation produce an *alertable* signal vs a buried counter.
- **Fix:** `Sentry.captureMessage` on each send failure (and on `daily-health-report` email failure) so ops gets paged, not just a heartbeat row nobody queries.

### REL-N8 · `categorizeError` 429 returns no `shouldDeactivate` field → token cron counts a rate-limited tenant as a generic `failed` and fires a misleading Sentry `cron_refresh_xero_tokens_failed`
- **Sev:** LOW · **Effort:** S · **Fork:** CODE
- **What:** When the identity endpoint 429s and retries exhaust, `categorizeError` returns `{ error:'rate_limited' }` with `shouldDeactivate` absent. In the cron, this lands in the generic `else` (transient failure) branch and emits `cron_refresh_xero_tokens_failed` with `result.error='rate_limited'`. That's correct-ish but conflates "Xero throttled us" with "token genuinely failing," polluting the very Sentry invariant Phase 53 created to mean "real token problem." Combined with REL-N3 (no Retry-After), a throttling event produces noisy false-alarm token-health alerts.
- **Evidence:** `token-manager.ts:672–679`; cron classification `refresh-xero-tokens/route.ts:234–256`.
- **Fix:** Give 429 its own status/tag (`rate_limited`, not `failed`) so token-health alerts stay clean.

---

## (b) Per-cron reliability table

| Cron | Auth posture | Timeout risk | Partial-failure isolation | Failure surfaced? | Heartbeat? |
|---|---|---|---|---|---|
| `refresh-xero-tokens` | **Fail-CLOSED** (correct; `:126–129`) | LOW today (~200ms/conn, seq) → MED at ~400 conns (R8) | Per-conn try/catch; one bad conn doesn't abort run (`:182,257`) | Yes — per-conn Sentry + pre-expiry warning + aggregate | Yes (success/partial/failed/zero-row) |
| `sync-all-xero` | Fail-OPEN if `CRON_SECRET` unset (R4) | **MED–HIGH** — heavy ~52-call/tenant seq fan-out can exceed 300s; truncation = missing heartbeat (**REL-N6**) | Per-tenant + per-business try/catch | Yes — orchestrator Sentry per tenant; BUT mid-run kill loses end-of-run heartbeat | Yes, only at end-of-run (lost on truncation — REL-N6) |
| `reconciliation-watch` | Fail-OPEN if unset (R4) | LOW (`maxDuration=60`, ≤~27 rows, zero Xero calls) | N/A (read-only scan); per-row Sentry guarded | Yes — drift Sentry + query-error Sentry | Yes (success/partial/failed) |
| `weekly-digest` | Fail-OPEN if unset (R4) | LOW–MED (per-coach Promise.all queries; bounded by coach count) | Per-coach try/catch | **Partial — aggregate count only, NO per-coach Sentry** (**REL-N7**) | Yes |
| `daily-health-report` | Fail-OPEN if unset (R4) | LOW | Single-shot; depends on `runHealthChecks` (Xero check is DEAD — **REL-N1**) | **Partial — email-fail = heartbeat only, NO Sentry** (**REL-N7**); Xero attention section never fires (**REL-N1**) | Yes |

Note: the second cron-compatible entry `GET /api/Xero/sync-all` (fail-closed, `:46–50`) is NOT in `vercel.json` and writes **no heartbeat** — if it is ever wired as a cron or hit by an external scheduler, its invocations are invisible to the cadence monitor. Minor; flagged for completeness.

---

## (c) Silent-swallow catch inventory (danger-ranked)

All bare `catch {}` / `catch (e){}` in `src/lib/xero/**`, sync, and financial paths. Most are deliberately-guarded Sentry/observability wrappers (benign — Sentry must never abort a run). Ranked by data-loss potential:

**DANGEROUS (hide data-loss / silent disconnect):**
1. `token-manager.ts:402–422` — **REL-N5**: DB save failure swallowed into `success:true` with unsaved rotated token → next-call deactivation. (Not a bare catch, but a success-masks-failure swallow — highest danger.)
2. `token-manager.ts:259` — `catch {}` when re-decrypting a sibling-rotated refresh token in the lock-contention path: keeps the stale rt and proceeds; combined with REL-N4 contributes to spurious `invalid_grant`. Logs nothing.
3. `token-manager.ts:501` — orchestrator `fiscal_year_start` lookup `catch {}` silently defaults to month 7. A profile-read failure → wrong FY windows → silently syncs the wrong months. Cosmetic-looking, financially material.

**COSMETIC (Sentry/observability guards — correct by design, keep):**
- `xero-api-client.ts:115,126,129` — breadcrumb/body-read guards.
- `sync-orchestrator.ts:332,365,598,752,818,838,941,972,1046,1154` — all wrap `Sentry.captureException/Message` so telemetry can't abort the sync. Correct.
- `token-manager.ts:105,534,608` — error-code parse / Sentry guard / JSON parse. Correct.
- `organisation.ts:141`, `pl-by-month-parser.ts:223` — Sentry guard / parse fallback. Correct.
- `Xero/disconnect:74`, `Xero/employees:39`, `wages-detail:369,439`, `commentary:203,242` — UI/parse fallbacks, not financial-write swallows.

R8's "~11 bare catches in sync-orchestrator.ts" is CONFIRMED (11 found: lines 332,365,598,752,818,838,941,972,1046,1154 + the 501 in the same file) — but all 11 are Sentry-guard wrappers, NOT data-loss swallows. The genuinely dangerous swallows are in **token-manager.ts**, not the orchestrator. R8's danger characterization should be re-pointed.

---

## (d) Confirmations (still true on `main`)

- **R4/C-04 CONFIRMED:** 4 of 5 crons fail-OPEN when `CRON_SECRET` unset — `sync-all-xero:34`, `reconciliation-watch:44`, `weekly-digest:17`, `daily-health-report:17`. Only `refresh-xero-tokens:126–129` (and the non-registered `Xero/sync-all:48`) fail-closed.
- **R8/C-19/C-16 CONFIRMED (with correction):** token refresh is sequential (`refresh-xero-tokens` loop) and sync-orchestrator has 11 bare catches — but those 11 are Sentry guards, not silent data-loss (see (c)). The real silent-data-loss swallows are in token-manager.
- **R25/C-37 CONFIRMED present in pattern:** BS path now uses an `upsert` (`sync-orchestrator.ts:404–417`) that throws on error — but the legacy `monthly-report/sync-xero` delete-then-insert path (the R25 target) is unchanged and out of orchestrator scope.
- **Heartbeats CONFIRMED:** all 5 registered crons call `recordHeartbeat` on success and failure paths; helper is fail-soft (`heartbeat.ts`). Gap: a *killed/truncated* function never reaches its end-of-run heartbeat (REL-N6).
- **reconciliation-watch CONFIRMED:** emits `continuous_reconciliation_drift` Sentry per drift event (`:93`), zero extra Xero calls.

**Clean sub-areas (explicitly):**
- **Xero 429/Retry-After in the SYNC data path:** CLEAN — `xero-api-client.ts` correctly distinguishes daily/minute/concurrent, honors `Retry-After`, drains bodies, and backs off 5xx [1,2,5,15,60]s. (The gap is only the *token* path — REL-N3.)
- **Unbounded `Promise.all` over tenants:** CLEAN — no fan-out `Promise.all` over connections/tenants found; all tenant iteration is sequential (the opposite risk — too slow, not connection-exhaustion). `weekly-digest`/`daily-health-report` use small fixed-width `Promise.all` (4–5 queries), bounded.
- **sync_jobs single-flight + finalize:** CLEAN — `begin_xero_sync_job` claims atomically, `finalize_xero_sync_job` runs in `finally` even on throw (`:1221–1249`).
- **Per-tenant isolation in orchestrator:** CLEAN — per-tenant try/catch, paused/error/partial accounting, one tenant's failure does not abort the portfolio.
- **Sentry sampling:** `tracesSampleRate=0.1` in prod (traces only — does NOT drop captured exceptions/messages, which are always sent). Error signal is NOT being dropped. Acceptable.

---

## (e) Phase-70 drift

**No drift in the reliability/integration/ops lane.** `git log` since 2026-05-20 over `src/lib/xero/`, `src/app/api/cron/`, `src/lib/health-checks.ts`, `src/lib/cron/` shows the last touches were Phase 69 (cron registration durability + heartbeats, #231) and Phase 67-01 (functional_currency capture, #214). Phase 70 (production data backfill / migration-debt cleanup) did not modify any cron route, the orchestrator, the token-manager, the Xero client, or the health checks. The findings above are pre-existing, not Phase-70 regressions.

(Note: REL-N1's dead health check predates Phase 53 and has survived every Xero-durability phase precisely because no test exercises `checkXero` against the real schema — `src/__tests__/` has zero references to `token_expires_at`.)
