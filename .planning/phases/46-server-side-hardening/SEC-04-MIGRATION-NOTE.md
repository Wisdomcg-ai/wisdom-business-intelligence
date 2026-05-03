# SEC-04 — Encryption Key Hardening: 2-PR Migration Plan

**Owner:** Phase 46 / Matt
**Created:** 2026-05-02
**Status:** PR 1 (this plan, 46-02) in flight; PR 2 (plan 46-04) gated on the verification below

## Why split into two PRs

Per RESEARCH.md SEC-04 highest-risk callout: the production system may be running on the PBKDF2-derived key from `SUPABASE_SERVICE_KEY` (the third fallback in `getEncryptionKey()`'s chain at `src/lib/utils/encryption.ts:20-22`). If we remove that fallback in the same PR that removes `decrypt()`'s plaintext-tolerance, AND `APP_SECRET_KEY` was not previously set, every existing encrypted token in `xero_connections` becomes undecryptable in one deploy.

Splitting the work across two PRs (with operator verification in between) lets us confirm `APP_SECRET_KEY` is set to a value that decrypts existing tokens before locking the strict key chain in.

## What plan 46-02 (this plan) ships

- **SEC-02** cron-auth fail-closed (decoupled from the crypto work; ships independently)
  - `src/app/api/Xero/sync-all/route.ts` — `!cronSecret || ...` guard
  - `src/app/api/Xero/refresh-tokens/route.ts` — same pattern (defence-in-depth, same fail-open shape per RESEARCH.md)
  - `src/__tests__/api/xero-sync-all-cron-auth.test.ts` — 4 regression tests
  - `.env.example` — documents `CRON_SECRET=local-dev-secret` for devs
- **SEC-03** verifier script `scripts/verify-xero-tokens-encrypted.ts`
- **SEC-04 PART 1**:
  - Adds `APP_SECRET_KEY` placeholder to `.github/workflows/supabase-preview.yml` build env (so plan 46-04's stricter `getEncryptionKey()` does not break CI)
  - Operator sets `APP_SECRET_KEY` in Vercel Production + Preview
  - Operator runs SEC-03 verifier against prod, captures output
- **Does NOT** modify `src/lib/utils/encryption.ts`. All 3 fallbacks still in place.

## What plan 46-04 will ship (gated)

- **SEC-04 PART 2**:
  - Removes fallback 1: the `if (!encryptedData.includes(':'))` plaintext-return at `src/lib/utils/encryption.ts:80-83`
  - Removes fallback 2: the `if (parts.length !== 3) return encryptedData` at `:86-89`
  - Removes fallback 3: the `catch (error) { ... return encryptedData }` at `:104-109` (RESEARCH.md identified this as a third silent fallback PHASE.md missed)
  - Removes `SUPABASE_SERVICE_KEY` from `getEncryptionKey()`'s chain at `:20-22` (key chain becomes `APP_SECRET_KEY || ENCRYPTION_KEY` — throws if neither is set)
  - **Decision deferred to plan 46-04:** whether to also tighten `createHmacSignature`'s key chain at `:148-153`. RESEARCH.md SEC-04 flagged this as a separate sub-task — OAuth state HMACs in flight at deploy time would fail if the key effectively changes. Plan 46-04 should make this an explicit task and decide based on operator preference.
- **SEC-07** (logging sweep) and **SEC-08** (Sentry DSN fail-loud) ship in the same plan because they're cross-cutting code-and-config edits in the same area.

## Preconditions for plan 46-04 to merge

All MUST be true:

- [ ] **`APP_SECRET_KEY` set in Vercel Production scope** — verified via `vercel env ls production` or Vercel dashboard
- [ ] **`APP_SECRET_KEY` set in Vercel Preview scope** — same (`vercel env ls preview`)
- [ ] **SEC-03 verifier last-ran against prod returned `failures: 0`** — JSON report attached to plan 46-04 PR description, dated within 7 days of merge
- [ ] **Round-trip smoke test** — pick 1 row from prod `xero_connections`, decrypt both tokens with `APP_SECRET_KEY`, re-encrypt, assert byte-identical to the stored value (or at least both decrypt to the same plaintext as before). RESEARCH.md SEC-04 mitigation step 2 — recommend `scripts/verify-decrypt-roundtrip.ts` as part of plan 46-04 Task 1.
- [ ] **Plan 46-02 has been merged for ≥ 7 days** — gives time for the env-var migration to propagate and any prod issues to surface (Sentry quiet, no Xero sync regressions, no auth complaints from coaches)

## The 7-day cooling period — rationale

Why 7 days specifically:

1. **Vercel env-var propagation** — env-var changes apply on the next deploy, but cached preview deployments can carry the old environment for a few hours. 7 days guarantees several full deploy cycles.
2. **Xero token refresh cadence** — `refresh-tokens` runs every ~15 minutes; over 7 days that's >600 refresh cycles per active connection. If the new `APP_SECRET_KEY` cannot decrypt an existing token, the failure surfaces in Sentry within the first refresh window — but giving 7 days exposes any edge case (e.g., an inactive connection re-activated mid-week, an OAuth-state HMAC validating an in-flight signup).
3. **Operator availability** — gives Matt a working week to notice and roll back without emergency weekend pages.
4. **Sentry signal-to-noise floor** — the 24-hour Sentry retention window means "no errors today" is weak signal; 7 days of clean data is strong signal.

## Rollback story

### Plan 46-02 (this PR) — trivial rollback

- `git revert` the merge commit. The SEC-02 cron fix becomes fail-open again; the verifier script remains harmless; the CI workflow placeholder is removed. No data migration required.
- The `APP_SECRET_KEY` env var stays set in Vercel — that has no behavioural effect in 46-02 because `encryption.ts` still prefers it via the existing fallback chain (`APP_SECRET_KEY || ENCRYPTION_KEY || SUPABASE_SERVICE_KEY`).

### Plan 46-04 (PR 2) — conditional rollback

- **If `APP_SECRET_KEY` was NOT rotated in the same window:** trivial `git revert` of the code change. The fallback chain returns to the prior behaviour (PBKDF2-derived from `SUPABASE_SERVICE_KEY` if `APP_SECRET_KEY` is unset).
- **If `APP_SECRET_KEY` WAS rotated in the same window:** non-trivial — any tokens encrypted with the new key during the window need to be re-encrypted with the old key (or purged and re-OAuthed). **Mitigation: do NOT rotate `APP_SECRET_KEY` in the same window as plan 46-04 ships** — keep the env-var change isolated from the code change.

### Worst case

Operator sets `APP_SECRET_KEY` to a value that does NOT decrypt existing tokens (e.g., a fresh random key instead of the hex-encoded form of the existing PBKDF2 derivation). Symptoms appear immediately — every Xero sync starts failing with decryption errors. Recovery:

1. Revert the env-var change in Vercel.
2. Re-deploy (or wait for the next deploy cycle).
3. The fallback chain returns to PBKDF2-derived from `SUPABASE_SERVICE_KEY` and existing tokens decrypt again.
4. Investigate the correct value for `APP_SECRET_KEY` offline before re-attempting.

This worst case ONLY exists in plan 46-02's window. Once plan 46-04 ships and the fallback is gone, a wrong `APP_SECRET_KEY` cannot be silently recovered — the route throws.

## Sign-off

- [ ] Matt confirms preconditions met before plan 46-04 PR is opened
