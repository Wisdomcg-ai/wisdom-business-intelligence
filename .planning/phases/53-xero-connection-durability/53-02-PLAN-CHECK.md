# 53-02 Plan Check

**Verdict:** FLAG — ship-eligible after 2 must-fix tightenings + 1 follow-up note.

## Goal-backward truth trace
9/10 truths covered. T5 (FE response shape preserved) and T8 (Test 2 allowlist semantics) are PARTIAL.

## Issues

### Issue #1 — FLAG (must-fix): reactivate `access_denied` status changes 500→401
- HEAD: any non-`invalid_grant` failure returned HTTP 500 / `error: 'refresh_failed'` (lines 140-144).
- Plan refactor maps `tokenResult.error === 'token_revoked'` → HTTP 401 / `error: 'token_expired'`. 53-03 categorizes `access_denied` as `'token_revoked'`.
- **Net effect**: `access_denied` flips from 500 to 401 — a behavioral improvement, but plan frames it as "preserved" (it's not).

**Fix:** add an explicit truth ("`token_revoked` and `token_expired_permanently` both return HTTP 401") + Task 2 step scanning `src/app/integrations/page.tsx` for `response.status === 500` branches that catch access_denied; document FE follow-up if any exist.

### Issue #2 — FLAG (must-fix): Test 2 mixes URL-substring count with refresh-implementation invariant
- Allowlist includes `middleware.ts` (CSP string, not a fetch) and `callback/route.ts` (authorization_code grant, different operation).
- The stated invariant is "exactly ONE call site for the `refresh_token` grant type" but the test greps the URL string only — doesn't verify grant type.

**Fix:**
1. Rename Test 2 invariant comment to "URL-substring count" (not "refresh-implementation count").
2. Add a **sharper second test** that greps for `grant_type=refresh_token` / `grant_type: 'refresh_token'` in `src/` and asserts exactly one match in `token-manager.ts`. ~5 lines.
3. Optional: restrict URL-substring test grep to `src/app/api/` + `src/lib/` so middleware drops out cleanly.

### Issue #3 — INFO (follow-up note, non-blocking): scripts/ blind spot
- `scripts/resync-envisage-now.ts:83` IS a real refresh duplicate — bypasses the lock, fetches identity.xero.com directly. If run concurrently with a user request, re-introduces the JDS rotation race.
- Plan correctly out-of-scopes it but Test 2 doesn't scan scripts/, so a future copy-paste pattern would not trip CI.

**Fix (non-blocking):** add paragraph in plan's summary calling out as future cleanup. Optionally extend Test 2 to scan scripts/ with explicit `KNOWN_DEPRECATED` allowlist.

## Verified working
- Pre-deletion audit: ZERO callers in src/, scripts/, vercel.json, public/.
- `getValidAccessToken({ id: connection.id })` call shape — correct (forces fresh re-fetch, closes race).
- 53-03 → 53-02 sequencing: `wave: 3, depends_on: [53-03]` — correct.
- vercel.json / Sentry / coach dashboard untouched.
- Callback (authorization_code) correctly excluded.
- 16 consumer routes untouched.
- No production gap from deletion.

## Recommendation
**FLAG** — ship-eligible after Issues #1 and #2 are addressed by executor inline (not blocking replan). Issue #3 documented as future cleanup.

**Inline executor instructions for these issues will be passed in the executor prompt.**
