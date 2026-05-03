# Phase 46: Server-Side Hardening — Research

**Researched:** 2026-05-02
**Domain:** Internal-only security hardening (deletions, fail-closed cron, encryption-key strictness, structured logging, SQL function input-validation, env-var fail-loud)
**Confidence:** HIGH (every claim is grounded in file:line evidence from this checkout)

## Summary

8 SEC items, all verifiable against the current `feat/46-research-and-plan` checkout. Three items are essentially deletions (SEC-01, SEC-06 if "delete" path is chosen, the unused `logger.ts`). Three are tight, localised code changes (SEC-02, SEC-04, SEC-08) with explicit fail-loud semantics. SEC-03 is a one-shot script (no production code shipped). SEC-05 is a SQL migration touching 2 functions. SEC-07 is the only sweep — quantified below as **117 files touching `console.error` in `src/app/api/`** (audit estimated 28 service-role routes; the actual `console.error` footprint is larger).

The dependency rope (`SEC-03 → SEC-04` and `SEC-07 → Phase 47`) is real and confirmed by code reading. There is also a less obvious one: **the CI `build` job already injects placeholder env vars (see `.github/workflows/supabase-preview.yml:113-133`) but does not inject `APP_SECRET_KEY`, `ENCRYPTION_KEY`, or `CRON_SECRET`** — so a fail-loud at module-load on any of those will break `next build` in CI unless the workflow is updated as part of the same plan. This is the single most important coordination point and is called out repeatedly below.

**Primary recommendation:** Bundle by theme into 4 plans (deletions / cron + crypto / SQL / logging + config) — see decomposition section. Land SEC-03 (read-only verification) and SEC-07 (sweep, can be batched per-directory) first; gate SEC-04 on SEC-03's green report; ship SEC-08 last because it has the highest "did we update Vercel env vars?" coordination cost.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SEC-01 | Delete `/api/migrate/route.ts` and `/api/migrate/opex-fields/route.ts` | Confirmed: both call RPCs (`exec_sql`, `exec`) that have **zero matches** in `supabase/migrations/`; **zero importers** of the routes anywhere in `src/`. Pure deletion. |
| SEC-02 | Fix cron-secret fail-open in `Xero/sync-all` | Confirmed: current `GET` handler (lines 38-57) only enforces in `NODE_ENV === 'production'`. Pattern to copy: `cron/daily-health-report:13-15` (always-strict bearer compare). |
| SEC-03 | Validate plaintext-token migration window | One-shot script — no production code change. Validation: every row's `access_token` AND `refresh_token` contains `:`. |
| SEC-04 | Remove plaintext-fallback from `decrypt()`; require `APP_SECRET_KEY` | Confirmed: `encryption.ts:79-83` returns `encryptedData` if no `:`, and `:104-109` returns `encryptedData` on decryption failure (a **second** silent fallback the PHASE.md doesn't call out — see SEC-04 detail). Key chain at `:20-22` falls back to `SUPABASE_SERVICE_KEY`. |
| SEC-05 | Input validation on 2 SECURITY DEFINER functions | Confirmed: `create_quarterly_swot` at baseline schema:499 is called from real app code (`swot/page.tsx:203`, `quarterly-review/.../SwotUpdateStep.tsx` 3x); validation must accept legitimate `'1'..'4'`. `create_test_user` at :515 has no production callers. |
| SEC-06 | Decide onboarding gate at `middleware.ts:173-201` | Confirmed: 30 lines of commented-out checks; `ONBOARDING_ENFORCED` env var has **zero references** in the repo. |
| SEC-07 | Adopt `Sentry.captureException`; sweep `console.error` in api routes | Confirmed: `console.error` count in `src/app/api/`: **408 lines across 117 files** (out of 123 route files). `Sentry.captureException` count in `src/`: **18 lines across 8 files**. The audit's "2" was conservative; the orchestrator (Phase 44) already added several. |
| SEC-08 | Remove hardcoded fallback Sentry DSN; fail loud | Confirmed: hardcoded DSN at `sentry.client.config.ts:3`, `sentry.server.config.ts:3`, `sentry.edge.config.ts:3`. `instrumentation.ts:3-11` is the load entry-point — fail-loud belongs there or in the per-runtime config. |

---

## SEC-01: Delete `/api/migrate` routes

### Current state

`src/app/api/migrate/route.ts:37`
```ts
const { error: error1 } = await supabase.rpc('exec_sql', {
  sql_query: `ALTER TABLE forecast_pl_lines ADD COLUMN IF NOT EXISTS forecast_method JSONB DEFAULT NULL;`
})
```
`src/app/api/migrate/opex-fields/route.ts:35`
```ts
const { error } = await supabase.rpc('exec', {
  sql: `ALTER TABLE financial_forecasts ADD COLUMN IF NOT EXISTS cogs_percentage DECIMAL(5, 4), ...`
})
```

**Verification of dead-ness:**
- `grep -rn "exec_sql\|rpc.*exec" supabase/` → only the 3 lines above show up; **no migration creates either RPC**.
- `grep -rln "/api/migrate" src/` → no callers anywhere in code.
- The routes will currently 500 (Supabase returns "function not found") if invoked.

### Proposed fix

Delete both files entirely:
- `src/app/api/migrate/route.ts`
- `src/app/api/migrate/opex-fields/route.ts`
- The empty `src/app/api/migrate/opex-fields/` directory after deletion

No imports to update. The route directory `src/app/api/migrate/` becomes empty after removing both files; verify Next.js doesn't choke on it (deleting the directory itself is safe).

### Risks and mitigations

- **Risk:** `vercel.json` cron registration referencing one of these routes? — Check `vercel.json` for route entries before deletion. Quick `grep migrate vercel.json` will resolve.
- **Risk:** Documentation referencing the route. Cosmetic, not functional.
- **Rollback:** Trivial — `git revert` restores both files.

### Test approach

Add a minimal vitest assertion that the route file does not exist (e.g., `fs.existsSync('src/app/api/migrate/route.ts') === false`) — overkill but explicit. More useful: a Playwright assertion in nightly that `GET /api/migrate` returns 404. The success criterion in PHASE.md (curl returns 404 in prod) is the canonical post-deploy check.

---

## SEC-02: Cron-secret fail-closed in Xero sync-all

### Current state

`src/app/api/Xero/sync-all/route.ts:38-46` (the file is **86 lines total** — note PHASE.md cites lines 573-580 which don't exist; the route was rewritten in Phase 44 plan 44-05 to be a thin shim, see file header):
```ts
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (cronSecret && process.env.NODE_ENV === 'production' && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // ... falls through to runSyncForAllBusinesses if guard above did not fire
```

The guard is currently three-conditional: it only rejects if (a) `CRON_SECRET` is set AND (b) we're in production AND (c) auth header doesn't match. **If `CRON_SECRET` is unset in prod**, the guard is bypassed and the route runs unauthenticated.

### Reference pattern (the "right" fail-closed shape)

`src/app/api/cron/daily-health-report/route.ts:11-15` — the canonical pattern PHASE.md points at:
```ts
const authHeader = request.headers.get("authorization");
if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```
This **fails closed**: if `CRON_SECRET` is undefined, the comparison becomes `authHeader !== "Bearer undefined"` which any honest caller fails. Same shape used in `cron/weekly-digest:11-14`, `cron/sync-all-xero:30-32`, `cron/reconciliation-watch:41`.

**Edge case worth flagging:** The "Bearer undefined" sentinel is not perfectly safe — if an attacker happens to send `Authorization: Bearer undefined`, they pass. The hardened pattern is:
```ts
const cronSecret = process.env.CRON_SECRET
if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```
Recommend adopting the **`!cronSecret ||`** prefix in all 5 cron-using routes during this plan, not just `Xero/sync-all`. That is one of the audit's quietly significant generalisations.

### Proposed fix

In `src/app/api/Xero/sync-all/route.ts`, replace the GET handler's guard (lines 42-46) with:
```ts
const cronSecret = process.env.CRON_SECRET
const auth = request.headers.get('authorization')
if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
```
Drop the `process.env.NODE_ENV === 'production'` carve-out — dev/preview should set `CRON_SECRET` too (it already does in the cron-sync-all test setup, see `__tests__/api/cron-sync-all.test.ts:28`).

**Optional generalisation (recommend):** Apply the `!cronSecret ||` pattern to the other 4 cron routes (`daily-health-report`, `weekly-digest`, `sync-all-xero`, `reconciliation-watch`, `Xero/refresh-tokens`) so an unset `CRON_SECRET` env can never accidentally open all crons at once. `Xero/refresh-tokens:140-147` has the same fail-open shape as `Xero/sync-all` — worth fixing in the same PR.

### Risks and mitigations

- **Risk:** Local dev or coach manual testing breaks because devs don't have `CRON_SECRET` set locally. Mitigation: document in README that `CRON_SECRET=local` (or any string) must be in `.env.local`. The POST handler is unchanged and uses session auth, so manual coach triggers still work.
- **Risk:** Vitest tests that exercise these routes need `CRON_SECRET` set. The existing tests already set it in `beforeEach` (see `cron-sync-all.test.ts:28`). New `sync-all` GET tests must do the same. Existing `Xero/sync-all` tests (if any) need audit — `grep -rn "from '@/app/api/Xero/sync-all'" src/__tests__/` to confirm.
- **Rollback:** Trivial — single-file revert.

### Test approach

Mirror `__tests__/api/cron-sync-all.test.ts`: 4 cases — no auth → 401, wrong bearer → 401, valid auth → 200 + orchestrator called, **CRON_SECRET unset → 401** (this is the new case enabled by SEC-02 and is the regression test that proves fail-closed). The orchestrator can be mocked the same way the existing test does.

---

## SEC-03: Validate plaintext-token migration window

### Current state

No script exists. The risk surface is `xero_connections.access_token` and `xero_connections.refresh_token` — currently typed as text in the schema and written **encrypted** by `Xero/callback/route.ts:67-68` (`encrypt(tokens.access_token)`) and `Xero/refresh-tokens/route.ts` (the refresh path, similar pattern). The `decrypt()` function at `encryption.ts:80` has the plaintext fallback — meaning if any historical row was written before `encrypt()` was introduced, it round-trips without alarm.

### Proposed fix

A one-shot Node script (live in `scripts/verify-xero-token-encryption.ts` or similar) that:
1. Connects via `SUPABASE_SERVICE_ROLE_KEY` (read-only operation).
2. `SELECT id, business_id, tenant_id, length(access_token) AS at_len, position(':' in access_token) AS at_colon, length(refresh_token) AS rt_len, position(':' in refresh_token) AS rt_colon FROM xero_connections WHERE is_active = true;` — actually do this in JS via the supabase client to keep parity with the rest of `scripts/`.
3. For every row: assert `at_colon > 0 AND rt_colon > 0`.
4. **Stricter check (recommend):** Both tokens must split into exactly 3 parts (`iv:authTag:ciphertext`) — re-use `isEncrypted()` from `encryption.ts:115-134` which already checks "3 parts AND each is valid base64."
5. Report rows that fail; exit non-zero if any fail.

The SQL-form check (just `:` in both tokens) is the bare minimum the PHASE.md asks for. The `isEncrypted()` form is strictly safer because a token like `randomstring:foo` would pass the colon-only check but is not actually AES-GCM ciphertext. **Recommend the planner specify `isEncrypted()` validation, not just `:`-presence.**

### Risks and mitigations

- **Risk:** Inactive connections might have old plaintext tokens that nobody cares about. Decision needed: fail on inactive rows too (safe), or scope to `is_active = true` (faster to ship). Recommend **including inactive rows** — a leaked DB dump exposes them too.
- **Risk:** SEC-04 ships before SEC-03 reports green. Hard ordering in plan: SEC-03 must run + report 100% pass (in production) before SEC-04 lands. Add this as an explicit task acceptance criterion.
- **Rollback:** N/A — read-only script.

### Test approach

Unit test the script's checking logic with a fixture array of token strings (some valid `iv:tag:ct` shape, some plaintext, some malformed). Don't try to integration-test against a live DB in CI; that's manual / dev-machine territory. The success criterion is a captured stdout from running it against prod (paste into PR description).

---

## SEC-04: Remove plaintext fallback from `decrypt()`; require `APP_SECRET_KEY` strict

### Current state — TWO silent fallbacks, not one

`src/lib/utils/encryption.ts:74-110`:
```ts
export function decrypt(encryptedData: string): string {
  if (!encryptedData) return ''

  // FALLBACK 1 — line 80
  if (!encryptedData.includes(':')) {
    return encryptedData  // "Data is not encrypted, return as-is (for migration purposes)"
  }

  const parts = encryptedData.split(':')
  // FALLBACK 2 — line 88 (PHASE.md does NOT mention this one!)
  if (parts.length !== 3) {
    return encryptedData
  }

  try {
    // ... real decrypt path
  } catch (error) {
    // FALLBACK 3 — line 105
    console.error('Decryption failed, returning original data:', error)
    return encryptedData
  }
}
```

There are **three** fallbacks, not one. The PHASE.md specifies only the first. The planner needs to decide whether to remove all three (the right answer) or only fallback 1. The catch-and-return-plaintext at line 104-108 is arguably worse than the no-colon fallback because it actively logs the failure but keeps serving plaintext.

### Key-chain at `encryption.ts:20-22`
```ts
const keyString = process.env.APP_SECRET_KEY
  || process.env.ENCRYPTION_KEY
  || process.env.SUPABASE_SERVICE_KEY // Fallback - will derive key via PBKDF2
```

The `createHmacSignature` function at lines 148-153 uses the **same** chain (with `OAUTH_STATE_SECRET` interspersed) — if SEC-04 hardens `getEncryptionKey`, the planner should decide whether `createHmacSignature`'s chain is also hardened, or if a different policy applies (the OAuth state HMAC arguably has different rotation needs than data-at-rest encryption).

### Proposed fix

1. In `encryption.ts:20-26`, restrict the key chain:
   ```ts
   const keyString = process.env.APP_SECRET_KEY || process.env.ENCRYPTION_KEY
   if (!keyString) {
     throw new Error('APP_SECRET_KEY (or ENCRYPTION_KEY) must be set for encryption')
   }
   ```
   Drop the `SUPABASE_SERVICE_KEY` derivation entirely.
2. In `encryption.ts:74-110`, remove all three fallbacks:
   ```ts
   export function decrypt(encryptedData: string): string {
     if (!encryptedData) return ''
     const parts = encryptedData.split(':')
     if (parts.length !== 3) {
       throw new Error('decrypt: invalid token format (expected iv:authTag:ciphertext)')
     }
     const key = getEncryptionKey()
     const iv = Buffer.from(parts[0], 'base64')
     const authTag = Buffer.from(parts[1], 'base64')
     const ciphertext = parts[2]
     const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
     decipher.setAuthTag(authTag)
     let decrypted = decipher.update(ciphertext, 'base64', 'utf8')
     decrypted += decipher.final('utf8')
     return decrypted
   }
   ```
   Throwing instead of catch-and-fallback. Callers (`token-manager.ts:86-89` already wraps `decrypt()` in try/catch and surfaces a `Failed to decrypt tokens` error path) need a quick audit but should largely be unaffected — see existing pattern at `src/lib/xero/token-manager.ts:82-95`.
3. Decide on `createHmacSignature`'s key chain (lines 148-153). Recommend tightening to the same `APP_SECRET_KEY || OAUTH_STATE_SECRET || ENCRYPTION_KEY` (drop `SUPABASE_SERVICE_KEY`) — but flag this as a separate sub-task with its own rollback story since OAuth state HMACs in flight at deploy time would fail if the key effectively changes.

### Risks and mitigations — THIS IS THE HIGHEST-RISK ITEM

- **HIGHEST RISK:** If `APP_SECRET_KEY` (or `ENCRYPTION_KEY`) was never explicitly set in Vercel and the system has been running on the `SUPABASE_SERVICE_KEY` PBKDF2-derived key, **all existing encrypted tokens were encrypted with that derived key**. Removing the fallback means `getEncryptionKey()` returns a different key, and every `decrypt()` call against historical data will throw. **This is a one-way migration that must be planned around.**
  - **Mitigation step 1:** Before SEC-04 ships, manually verify in Vercel that `APP_SECRET_KEY` is set and equals (or is the hex form of) the value previously derived from `SUPABASE_SERVICE_KEY`. If not, set it to a value that makes existing tokens decryptable, OR re-encrypt all tokens with a new key in a maintenance window.
  - **Mitigation step 2:** Add a `scripts/verify-decrypt-roundtrip.ts` step that picks 1 row from `xero_connections`, decrypts both tokens, re-encrypts, asserts round-trip equality. Run against prod **before** the SEC-04 PR merges.
  - The PHASE.md success-criterion #5 ("production boot fails fast if `APP_SECRET_KEY` is missing") is necessary but not sufficient — the more important check is "production decrypt of an existing token still succeeds with the new key chain."
- **Risk:** CI build fails because `next build` page-data collection loads route handlers that call `getEncryptionKey()` at module init. **CI workflow currently does not set `APP_SECRET_KEY` or `ENCRYPTION_KEY` (verified at `.github/workflows/supabase-preview.yml:113-133`).** The plan must add `APP_SECRET_KEY: 'placeholder-key-32-chars-for-build'` to the build job env block in the same PR. Otherwise the build job goes red.
- **Risk:** Removing fallback 3 (the catch block) means a transient decrypt failure (e.g., partial data corruption) now throws instead of silently returning the ciphertext. Callers need to handle. `token-manager.ts:82-95` already has try/catch — verify, don't assume.
- **Rollback:** Reverting the code is fine, but if you've also rotated the encryption key in production env vars at the same time, you cannot revert without restoring the old key. **Recommend:** ship SEC-04 in two PRs — PR 1 changes only the code (still accepts `SUPABASE_SERVICE_KEY` fallback); PR 2 a week later removes the SUPABASE_SERVICE_KEY fallback after Vercel env vars have been confirmed set.

### Test approach

Unit tests in `src/__tests__/utils/encryption.test.ts` (file does not exist yet — flag for Wave 0):
- `decrypt('plaintext-no-colon')` throws (regression for fallback 1).
- `decrypt('one:two')` throws (fallback 2).
- `decrypt('valid:base64:butbroken')` throws on auth-tag mismatch (fallback 3).
- Round-trip: `decrypt(encrypt('hello world')) === 'hello world'`.
- `getEncryptionKey()` throws when neither `APP_SECRET_KEY` nor `ENCRYPTION_KEY` is set (regression for SUPABASE_SERVICE_KEY fallback).

These need `process.env` mutation in `beforeEach`; pattern matches `__tests__/api/cron-sync-all.test.ts:25-39`.

---

## SEC-05: Input validation on SECURITY DEFINER SQL functions

### Current state

`supabase/migrations/00000000000000_baseline_schema.sql:499-509` — `create_quarterly_swot`:
```sql
CREATE OR REPLACE FUNCTION "public"."create_quarterly_swot"("p_user_id" "uuid", "p_quarter" "text", "p_year" integer) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE v_swot_id UUID;
BEGIN
  INSERT INTO public.swot_analyses (user_id, business_id, quarter, year, type, status, created_by)
  VALUES (p_user_id, p_user_id, p_quarter::INTEGER, p_year, 'quarterly', 'draft', auth.uid())
  RETURNING id INTO v_swot_id;
  RETURN v_swot_id;
END; $$;
```
Note: `p_quarter` is `text`, cast to `INTEGER` inline. A non-numeric value throws a SQL error (loud), but `'7'` or `'-1'` is silently accepted.

`supabase/migrations/00000000000000_baseline_schema.sql:515-530` — `create_test_user`:
```sql
CREATE OR REPLACE FUNCTION "public"."create_test_user"("p_email" "text", "p_role" "text" DEFAULT 'client'::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE v_user_id UUID;
BEGIN
  v_user_id := gen_random_uuid();
  INSERT INTO public.system_roles (user_id, role) VALUES (v_user_id, p_role);
  RETURN v_user_id;
END;
$$;
```
Both are granted to `anon, authenticated, service_role` (lines 13394-13402).

**Real-world callers** (verified by `grep -rn "create_quarterly_swot" src/`):
- `src/app/swot/page.tsx:203` — `p_quarter: String(currentQuarter.quarter)` (so `currentQuarter.quarter` is a number 1-4 from JS)
- `src/app/quarterly-review/components/steps/SwotUpdateStep.tsx:250, 397, 486` — three call sites
- `create_test_user` has **zero** callers in `src/` or `scripts/`. Likely only invoked manually from psql by a developer.

### Proposed fix

A new migration `supabase/migrations/{timestamp}_sec05_validate_security_definer_inputs.sql`:
```sql
CREATE OR REPLACE FUNCTION "public"."create_quarterly_swot"("p_user_id" "uuid", "p_quarter" "text", "p_year" integer) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_swot_id UUID;
  v_quarter_int INTEGER;
BEGIN
  -- SEC-05: validate quarter is 1..4
  v_quarter_int := p_quarter::INTEGER;
  IF v_quarter_int < 1 OR v_quarter_int > 4 THEN
    RAISE EXCEPTION 'create_quarterly_swot: p_quarter must be 1..4 (got %)', p_quarter;
  END IF;
  -- SEC-05: validate p_year is plausible (avoid year-9999 bombs)
  IF p_year < 2020 OR p_year > 2100 THEN
    RAISE EXCEPTION 'create_quarterly_swot: p_year must be 2020..2100 (got %)', p_year;
  END IF;

  INSERT INTO public.swot_analyses (user_id, business_id, quarter, year, type, status, created_by)
  VALUES (p_user_id, p_user_id, v_quarter_int, p_year, 'quarterly', 'draft', auth.uid())
  RETURNING id INTO v_swot_id;
  RETURN v_swot_id;
END; $$;

CREATE OR REPLACE FUNCTION "public"."create_test_user"("p_email" "text", "p_role" "text" DEFAULT 'client'::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE v_user_id UUID;
BEGIN
  -- SEC-05: enforce known role list
  IF p_role NOT IN ('client', 'coach', 'super_admin') THEN
    RAISE EXCEPTION 'create_test_user: p_role must be one of client/coach/super_admin (got %)', p_role;
  END IF;
  v_user_id := gen_random_uuid();
  INSERT INTO public.system_roles (user_id, role) VALUES (v_user_id, p_role);
  RETURN v_user_id;
END;
$$;
```

The role list `('client', 'coach', 'super_admin')` should be cross-checked against `system_roles.role` column constraints — if there's a CHECK constraint defining the canonical list, mirror it. If `system_roles.role` is freeform text, the planner should add the CHECK constraint in the same migration.

### Risks and mitigations

- **Risk:** A legitimate caller passes `p_quarter: '0'` (zero-indexed by mistake) or relies on inline cast accepting `'01'`. Sweep callers (5 known: `swot/page.tsx`, 4 in `SwotUpdateStep.tsx`) and grep for non-1-4 values. Quick tests confirm all current calls pass `String(quarter)` where `quarter` is sourced from a quarter-index 1-4.
- **Risk:** `create_test_user` is granted to `anon` (line 13400). If it's truly only for dev/test, also revoke `anon` and `authenticated` access in the same migration: `REVOKE ALL ON FUNCTION "public"."create_test_user" FROM "anon", "authenticated";`. Flag for planner.
- **Rollback:** Migration can be reverted by a follow-up migration that re-applies the original function bodies. Standard Supabase migration rollback story.

### Test approach

Two SQL-level smoke tests against the preview branch:
1. `SELECT create_quarterly_swot('00000000-0000-0000-0000-000000000000', '7', 2025);` → expect `EXCEPTION` with message containing `must be 1..4`.
2. `SELECT create_test_user('test@example.com', 'malicious_role');` → expect `EXCEPTION` with message containing `must be one of`.
3. Happy path: `SELECT create_quarterly_swot(<valid uuid>, '2', 2025);` → returns a UUID.

These can run as part of the Supabase preview-branch CI hook (already exists per `.github/workflows/supabase-preview.yml`), or as a manual `psql -f` against the preview after migration apply. No vitest equivalent.

---

## SEC-06: Decide onboarding gate

### Current state

`src/middleware.ts:173-201`:
```ts
// TEMPORARILY DISABLED: Onboarding checks removed to allow business plan access
// TODO: Re-enable once business plan development is complete

// // STEP 1: Check if business profile is completed (clients only)
// const { data: businessProfile, error: profileError } = await supabase
//   .from('business_profiles')
//   .select('profile_completed')
//   .eq('user_id', user.id)
//   .maybeSingle()
// // ... 25 more lines of commented logic ...
// // Allow access to all routes - onboarding checks disabled
```

The TODO is undated. `ONBOARDING_ENFORCED` is referenced **nowhere** in the repo (`grep -rn ONBOARDING_ENFORCED src/` returns empty).

### Proposed fix — TWO options, planner picks one

**Option A — Delete the dead branch.** Remove lines 173-202 entirely; remove the surrounding `try/catch` if it has no other body; verify the surrounding `if (user)` block still does useful work (it sets `roleData?.role` early-return for coaches/super_admins, lines 161-170, which is actively used and must stay).

**Option B — Re-enable behind env flag.** Wrap the (un-commented) original block:
```ts
if (process.env.ONBOARDING_ENFORCED === 'true') {
  // STEP 1: Check business profile completed
  const { data: businessProfile } = await supabase
    .from('business_profiles')
    .select('profile_completed')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!businessProfile || !businessProfile.profile_completed) {
    return NextResponse.redirect(new URL('/business-profile', request.url))
  }
  // STEP 2: Check assessment completed (similar)
}
```
And add `ONBOARDING_ENFORCED=false` (or simply unset) to all environments by default. Document in `.env.example` and a CHANGELOG.

**Recommendation:** Option A. The audit found that it's been disabled for at least the duration of "business plan development," which is no longer the active concern. The middleware-bypass-for-coaches-and-super-admins logic above (lines 161-170) is the right model — clients hit the dashboard without a redirect-to-onboarding gate, and the `/business-profile` and `/assessment` flows still exist in the app for users who choose to complete them. **Confirm with Matt before the planner picks.** Until confirmed, the planner should default to A and call out as a discretion item.

### Risks and mitigations

- **Risk (Option A):** A future requirement re-introduces onboarding enforcement and someone has to re-derive it from git history. Mitigation: document the deletion in CODEBASE-AUDIT and reference the commented version in git.
- **Risk (Option B):** Setting `ONBOARDING_ENFORCED=true` in prod blocks every existing client who never completed assessment. Mitigation: ship the flag but keep it `false` in prod; backfill `business_profiles.profile_completed=true` for existing clients before flipping.
- **Rollback:** Either option is one-file revert.

### Test approach

Option A: vitest assertion that `src/middleware.ts` does not contain the literal string `TEMPORARILY DISABLED` or `TODO: Re-enable` (regression). Option B: integration test that `ONBOARDING_ENFORCED=true` + an authenticated client without `business_profiles.profile_completed` → middleware redirects to `/business-profile`.

---

## SEC-07: Adopt Sentry-first structured logging; sweep `console.error`

### Current state — **the actual numbers**

```
$ grep -rn "console\.error" src/app/api/ | wc -l
408                ← total console.error LINES in api routes
$ grep -rln "console\.error" src/app/api/ | wc -l
117                ← total api FILES with console.error
$ find src/app/api -name "route.ts" | wc -l
123                ← total api route files
$ grep -rn "console\.error" src/ | wc -l
1302               ← console.error LINES across all of src/
$ grep -rn "console\." src/ | wc -l
1983               ← all console.* LINES across src/
$ grep -rn "Sentry.captureException" src/ | wc -l
18                 ← existing Sentry.captureException LINES
$ grep -rln "Sentry.captureException" src/
8 files            ← see breakdown below
```

The audit's claim of "2 Sentry calls vs 2,012 console calls" is stale — Phase 44 work added captures in `cron/sync-all-xero/route.ts:49`, `lib/xero/sync-orchestrator.ts`, `services/forecast-read-service.ts`, etc. Files using `Sentry.captureException` today:
- `src/app/sentry-example-page/page.tsx`
- `src/app/api/cron/reconciliation-watch/route.ts`
- `src/app/api/cron/sync-all-xero/route.ts`
- `src/app/finances/forecast/utils/logger.ts` (page-level forecast logger)
- `src/__tests__/services/forecast-read-service.test.ts` (test asserting it)
- `src/lib/xero/sync-orchestrator.ts`
- `src/lib/business/resolveBusinessId.ts`
- `src/lib/services/forecast-read-service.ts`

So there is already a **partial pattern** to follow. SEC-07's job is to bring the other 117 api route files into line.

### Existing `src/lib/utils/logger.ts`

The file exists (118 lines, full content read above) but `grep -rln "from '@/lib/utils/logger'" src/` returns **zero importers**. PHASE.md says "Delete the unused `src/lib/utils/logger.ts` if not adopted" — the recommendation is to delete it because:
- It's a console-wrapping logger, not a Sentry shim. SEC-07 picks Sentry as the production sink, which makes the logger.ts pattern dead-on-arrival.
- There's a separate `src/app/finances/forecast/utils/logger.ts` already in use for forecast-specific debugging. That one is page-scoped and can stay.

### Proposed fix — define the rule precisely

The sweep needs an explicit rule the planner can convert to task acceptance criteria. Recommended rule:

> **In `src/app/api/**/route.ts`** (and helpers under `src/lib/` when reached):
> 1. Every `console.error('[Tag] message:', errorObject)` becomes:
>    ```ts
>    Sentry.captureException(errorObject, { tags: { route: 'tag-or-slug' } } as any)
>    ```
>    (mirroring the pattern at `cron/sync-all-xero:49-51`).
> 2. `console.warn` and `console.info` calls in api routes are removed entirely (they're already noise; if needed, use `Sentry.captureMessage(msg, 'warning')`).
> 3. `console.log` calls in api routes are removed unless wrapped in `if (process.env.NODE_ENV !== 'production')`.
> 4. `console.log` calls inside `if (process.env.NODE_ENV !== 'production')` (or equivalent dev-guard) blocks **stay**. None found in api routes today (`grep` returned empty for that pattern in `src/app/api/`); pre-existing dev-guarded logs are scoped to `src/app/finances/forecast/utils/logger.ts`, `src/components/ErrorBoundary.tsx:73`, `src/lib/utils/error-tracking.ts:25`. Verify before stripping.
> 5. Delete `src/lib/utils/logger.ts` (zero importers; superseded by Sentry).

Decision needed for planner: **batch the sweep by directory** (e.g., `api/admin/*`, `api/forecast/*`, `api/cron/*`) — each as its own task with its own commit — or one giant sweep PR. Recommend per-directory: 117 files is not one human review.

### Risks and mitigations

- **Risk:** A real production bug surfaces only via console output, and after the sweep nobody sees it. Mitigation: the audit already established Sentry is wired and working (`Sentry.captureException` in 8 places today). Pick one route, deploy, watch Sentry pick up an injected error, then sweep the rest.
- **Risk:** The 117 routes have varied error-handling shapes. Some `console.error` calls are inside successful flows (e.g., `[Cashflow Settings] GET error:` at line 88 of `forecast/cashflow/settings/route.ts` — fired and the route then returns the error to the client). Blindly substituting can change error semantics if `Sentry.captureException` happens to throw (it doesn't, but the planner should test).
- **Risk:** Bulk find-and-replace catches `console.error` calls inside test files (`src/__tests__/**`) and rewrites them, breaking tests. Restrict the sweep to `src/app/api/**` and `src/lib/**` only.
- **Rollback:** Per-directory commits make reverts surgical. A single sweep PR is harder to revert cleanly.

### Test approach — quantitative gates per task

Each per-directory sweep task gets an acceptance criterion of the form:
- Before: `grep -rln "console\.error" src/app/api/admin/ | wc -l` = N
- After: same `wc -l` = 0 (or near-zero with documented exceptions)
- Vitest: existing tests still pass (mocking `Sentry.captureException` per the existing pattern in `__tests__/api/cron-sync-all.test.ts:20-23`).

For the entire phase: PHASE.md success criterion #4 ("Sentry.captureException count climbs from 2 to 28+") is the post-deploy validation; the per-task gate is the in-PR enforcement.

---

## SEC-08: Remove hardcoded Sentry DSN fallback; fail loud

### Current state

`sentry.client.config.ts:3`:
```ts
const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || "https://5f617384407d5579ae786ca49693fb1f@o4510784570916864.ingest.us.sentry.io/4510789719162880";
```
Same hardcoded DSN at `sentry.server.config.ts:3` and `sentry.edge.config.ts:3` (server/edge variants try `SENTRY_DSN || NEXT_PUBLIC_SENTRY_DSN || hardcoded`).

The hardcoded DSN is an actual valid DSN — committed to git, visible in the repo. That's a separate concern (DSNs are not secret per se, but committing one lets anyone POST events into your Sentry project).

`src/instrumentation.ts:1-13` is the load entry-point that imports the configs.

### Proposed fix

In each of the three Sentry config files, replace the fallback with a fail-loud:
```ts
const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN
if (process.env.NODE_ENV === 'production' && !SENTRY_DSN) {
  throw new Error('NEXT_PUBLIC_SENTRY_DSN must be set in production')
}
Sentry.init({ dsn: SENTRY_DSN, /* ... */ })
```
(Server and edge variants check `SENTRY_DSN || NEXT_PUBLIC_SENTRY_DSN` per the original logic.)

In dev, `SENTRY_DSN` undefined is fine — `Sentry.init({ dsn: undefined })` is a no-op; the SDK initialises but never sends.

**Where the throw fires:** Module-load time of the Sentry config files, which happens via `instrumentation.ts:5` (`await import('../sentry.server.config')`). If the throw fires, Next.js' `instrumentation.register()` throws, the server fails to start, and Vercel's deployment health check fails. **Test this carefully on a preview deploy before main.**

### Risks and mitigations

- **Risk:** CI build sets `NEXT_PUBLIC_SENTRY_DSN: 'https://example@sentry.io/0'` (verified at `supabase-preview.yml:117`) so the build job is fine. **However**, the `next build` does NOT set `SENTRY_DSN` (only `NEXT_PUBLIC_SENTRY_DSN`). If you fail loud on `SENTRY_DSN` in the server config, the CI build job goes red. Update the workflow env block to set both.
- **Risk:** Vercel preview deploys without `NEXT_PUBLIC_SENTRY_DSN` set will fail to boot. Verify Vercel env vars per-environment before merging — the env var must be set in **Production, Preview, and Development** scopes in Vercel project settings.
- **Risk:** If you remove the hardcoded DSN that's been receiving prod errors, and Vercel's prod env var has a DIFFERENT DSN set (or none), errors will stop reaching your Sentry project. Verify Vercel's value matches the hardcoded one (and rotate the DSN after this lands if you want to invalidate the committed one).
- **Rollback:** Single-file revert per config file. Easy.

### Test approach

Cannot easily unit-test module-load throws (vitest module mocking is complex for instrumentation files). Integration test: spin up `next start` with `NEXT_PUBLIC_SENTRY_DSN` unset and `NODE_ENV=production` → assert non-zero exit. This is more of a deploy-smoke than a CI test. Add a vitest assertion that the literal hardcoded DSN does not appear anywhere in `sentry.*.config.ts` (regression).

---

## Cross-cutting: decomposition recommendation

The 8 SEC items split cleanly along risk and review-effort lines. Recommend **4 plans**:

| Plan | Items | Rationale |
|------|-------|-----------|
| **46-01: Deletions and dead code** | SEC-01, SEC-06, delete `lib/utils/logger.ts` | All deletions, low review cost, no runtime risk. Single short PR. ~1 day. |
| **46-02: Cron and crypto hardening** | SEC-02, SEC-03, SEC-04 | Tightly coupled (SEC-04 gated on SEC-03 green). Same domain (auth/secrets). Highest risk, deserves a dedicated focused review. ~2-3 days incl. SEC-04 split into two PRs as discussed. |
| **46-03: SECURITY DEFINER input validation** | SEC-05 | Single migration, isolated. Could be one task but the migration needs `psql` smoke-test against preview branch which deserves explicit acceptance criteria. ~0.5 day. |
| **46-04: Structured logging sweep** | SEC-07, SEC-08 | SEC-07 is the heavy-lifting work (117 files); SEC-08 is the natural finalizer that "now that we use Sentry, fail loud if DSN is missing." Multiple per-directory PRs under one plan. ~3-4 days. |

Why not 1 plan with 8 tasks (Phase 45 pattern)? SEC-04 and SEC-07 each warrant their own focused review window. Bundling them into one plan obscures the risk gradient — a reviewer skimming a single 8-task plan will miss the "this PR rotates an encryption key chain" buried among deletions.

Why not 8 plans? SEC-03 and SEC-04 are genuinely a single work unit (verify-then-tighten). Splitting them is busywork. SEC-01, SEC-06, and `logger.ts` deletion are all "delete dead code" — bundling them lets one PR do them in 30 minutes.

The planner can deviate; this is the read.

## Cross-cutting: CI implications

**Required-check matrix vs. SEC items:**

| SEC | migration-check | lint | typecheck | vitest | build |
|-----|-----------------|------|-----------|--------|-------|
| SEC-01 | — | passes | passes | passes (no test changes) | passes |
| SEC-02 | — | passes | passes | needs new tests for fail-closed | passes |
| SEC-03 | — | passes | passes | passes | passes (script not in build path) |
| SEC-04 | — | passes | passes | needs encryption.test.ts | **may fail** — `next build` page-data collection calls `getEncryptionKey()` if any module-init code path runs `decrypt()`. Fix: add `APP_SECRET_KEY: 'placeholder-32-bytes-of-padding!'` to build job env at workflow lines 113-133. |
| SEC-05 | passes (migration filename) | — | — | — | — |
| SEC-06 | — | passes | passes | possible — middleware test if any | passes |
| SEC-07 | — | passes (no new lint rules) | passes | needs Sentry mocks (already pattern-existing) | passes |
| SEC-08 | — | passes | passes | passes | **may fail** — `next build` does not set `SENTRY_DSN` (only `NEXT_PUBLIC_SENTRY_DSN`). Fix: add `SENTRY_DSN: 'https://example@sentry.io/0'` next to the existing line at workflow:117. |

**Workflow env-var changes needed in this phase** (consolidated):
```yaml
# .github/workflows/supabase-preview.yml — build job env block
NEXT_PUBLIC_SENTRY_DSN: 'https://example@sentry.io/0'      # existing
SENTRY_DSN: 'https://example@sentry.io/0'                  # ADD for SEC-08
SENTRY_AUTH_TOKEN: ''                                       # existing
NEXT_PUBLIC_SUPABASE_URL: 'https://placeholder.supabase.co' # existing
NEXT_PUBLIC_SUPABASE_ANON_KEY: 'placeholder-anon-key'      # existing
SUPABASE_SERVICE_KEY: 'placeholder-service-key'            # existing
SUPABASE_SERVICE_ROLE_KEY: 'placeholder-service-role-key'  # existing
APP_SECRET_KEY: '0000000000000000000000000000000000000000000000000000000000000000'  # ADD for SEC-04 (64 hex chars = 32 bytes)
RESEND_API_KEY: 're_placeholder'                           # existing
OPENAI_API_KEY: 'sk-placeholder'                           # existing
CRON_SECRET: 'ci-placeholder'                              # consider ADD if any module-init reads it
```

The two ADDs (`SENTRY_DSN`, `APP_SECRET_KEY`) are non-negotiable if SEC-04 and SEC-08 ship the strict variants. Bundle the workflow edit into the same PR as the code change so CI doesn't go red mid-phase.

## Cross-cutting: Sentry test mocks

There is **no global Sentry mock** in `vitest.setup.ts` (the setup file is `src/__tests__/setup.ts` and contains only `import '@testing-library/jest-dom'`). Per-test-file mocking is the established pattern, used in 9 files (verified by grep above). The pattern:
```ts
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
  // add others as needed
}))
```
**Recommendation for SEC-07's planner:** When swapping `console.error` for `Sentry.captureException` in a route, the corresponding test (if it exists) needs the same mock added. The planner should NOT add a global Sentry mock to `setup.ts` — that would silently break the existing tests at `__tests__/services/forecast-read-service.test.ts` which assert specific call shapes (lines 311, 349, 608, 654 use `(Sentry.captureException as any).mock.calls`).

**Tests that currently mock `console.error` and would need to migrate:** quick `grep -rn "console.error" src/__tests__/` returns nothing — no test asserts `console.error` was called. So the migration is one-way and clean. Good.

## Cross-cutting: rollback per SEC

| SEC | One-way? | Rollback story |
|-----|----------|---------------|
| SEC-01 | No | `git revert`. Files come back. |
| SEC-02 | No | `git revert`. The fail-closed becomes fail-open again. |
| SEC-03 | No | Read-only script; nothing to roll back. |
| SEC-04 | **YES if combined with env-var rotation** | If `APP_SECRET_KEY` is rotated AT THE SAME TIME the fallback is removed, you cannot revert without restoring the old key. **Mitigation:** ship in two PRs — code change first (still works with old derived key), env-var tightening a week later. |
| SEC-05 | No | Migration revert via follow-up migration restoring original function bodies. |
| SEC-06 | No | `git revert` brings back the commented-out block. (Option B is also revertable — env var defaults to off.) |
| SEC-07 | No | Per-directory PR boundaries make revert surgical. The `Sentry.captureException` calls don't damage anything if reverted; you just lose the captures. |
| SEC-08 | No (with caveat) | `git revert` restores the hardcoded DSN. **Caveat:** if you also rotated the prod DSN to invalidate the committed-to-git one, the revert restores the now-invalid DSN and Sentry stops receiving events. Suggest: do not rotate the DSN in the same PR. |

**Pattern:** SEC-04 and SEC-08 share the "code-change is reversible, env-var rotation is not" trap. Plan both with explicit "do not rotate the secret in the same PR" notes.

## Plan-ready signals

Five bullets the planner can lift verbatim into plan body:

1. **SEC-04 must ship as two PRs.** PR 1: harden `decrypt()` (remove all 3 fallbacks) and document `APP_SECRET_KEY` requirement. PR 2 (≥1 week later, after Vercel env confirmed): remove `SUPABASE_SERVICE_KEY` from `getEncryptionKey()`'s chain. Reason: the current production system may be running on the PBKDF2-derived `SUPABASE_SERVICE_KEY` — collapsing both into one PR is a one-way migration.

2. **SEC-03 is a hard precondition for SEC-04.** Script must run against production and report 100% of `xero_connections` rows have `iv:authTag:ciphertext`-shaped tokens (use `isEncrypted()` from `encryption.ts:115`, not just `:`-presence). Capture the script output in the SEC-04 PR description.

3. **CI workflow must be edited in the same PR as SEC-04 and SEC-08** to add `APP_SECRET_KEY` and `SENTRY_DSN` placeholders to the `build` job env block at `.github/workflows/supabase-preview.yml:113-133`. Otherwise the build check goes red.

4. **SEC-07 is a per-directory sweep, not one PR.** Recommended batches: `api/admin/`, `api/Xero/`, `api/forecast/`, `api/forecasts/`, `api/cfo/`, `api/cron/`, `api/team/`, `api/coach/`, the rest. Each batch: `Sentry.captureException` mock added to corresponding test file (no global mock — would break `forecast-read-service.test.ts`'s call-shape assertions).

5. **SEC-02 should generalise to all 5 cron-using routes.** The fail-closed pattern is `if (!cronSecret || authHeader !== 'Bearer ' + cronSecret)`. Apply to `Xero/sync-all`, `Xero/refresh-tokens` (also fail-open today, see line 142-147), `cron/daily-health-report`, `cron/weekly-digest`, `cron/sync-all-xero`, `cron/reconciliation-watch`. Adds defence-in-depth at no design cost; the alternative is leaving 4 other routes one env-var-removal away from the same vulnerability.

## Sources

### Primary (HIGH confidence)
- All `src/` and `supabase/` files cited above — read directly from this checkout
- `.github/workflows/supabase-preview.yml` — read directly
- `vitest.config.ts`, `src/__tests__/setup.ts`, `src/instrumentation.ts` — read directly
- `.planning/audit-2026-04-28/security.md` — internal audit document, read directly
- `.planning/REQUIREMENTS.md` — canonical SEC-01..08 list, read directly

### Secondary (MEDIUM confidence)
- N/A — no external library docs needed; this phase is entirely about patterns and code already in the repo

### Tertiary (LOW confidence)
- N/A

## Metadata

**Confidence breakdown:**
- SEC-01: HIGH — verified zero RPCs and zero importers
- SEC-02: HIGH — read both routes and the reference pattern in cron/daily-health-report
- SEC-03: HIGH on shape, MEDIUM on policy (active-only vs. all-rows decision)
- SEC-04: HIGH on the 3-fallbacks finding (PHASE.md only called out 1 of 3); HIGH on the "this is highest risk" assessment because of the implicit key migration
- SEC-05: HIGH — read both function bodies and counted callers
- SEC-06: HIGH on technical state, MEDIUM on which option to pick (needs Matt input)
- SEC-07: HIGH — counted lines and files explicitly
- SEC-08: HIGH — read all 3 config files and the workflow env block

**Research date:** 2026-05-02
**Valid until:** 2026-06-02 (30 days; the codebase moves fast — re-verify counts before SEC-07 sweep starts if more than a week has passed)
