# Wave 65-04 — ENFORCE cutover runbook

**Phase:** 65 section-permission API enforcement
**Plan:** 04 (env-var flip — code already supports both modes since 65-02)
**Status:** READY — awaiting Matt to execute the flip

---

## 1. Pre-flight checklist (one-time, before flipping)

- [x] 65-02 merged to `main` (PR #197, 2026-05-17)
- [x] 65-02 deployed to production (LOG_ONLY soak live since 2026-05-17)
- [x] Phase 66 confirmed zero legacy-key gaps in `business_users.section_permissions` (VERIFICATION.md PASSED 4/4, 2026-05-17)
- [x] 65-04 ENFORCE-mode integration tests pass locally and in CI (`npx vitest run src/app/api/*/section-permission-enforce.test.ts` — 9/9 green)
- [ ] Vercel production deploy is current (matches main HEAD): `vercel ls --prod | head -2` and confirm SHA
- [ ] `SECTION_PERMISSION_ENFORCE` is currently unset (or `false`) in Vercel prod: `vercel env ls --environment production | grep SECTION_PERMISSION_ENFORCE` — if missing entirely, that's fine; default is `false`
- [ ] Sentry production project has been spot-checked for `message:"section_permission_check" environment:production` events over the last 7 days — denied events all come from member accounts with `section_permissions.finances=false` (i.e. legitimate denies, not owners/coaches/admins). If ANY owner / coach / admin / super_admin appears in the deny list, STOP — the helper has a bug; do not flip.

## 2. Flip commands (exact)

Run in this order, in the repo root, on a terminal with `vercel` CLI logged into the WisdomBI Vercel org.

```bash
# 1. Set the env var on production
vercel env add SECTION_PERMISSION_ENFORCE production
# When prompted for value, enter: true
# When asked which environments, select: Production only
# When asked to encrypt, accept the default (yes).

# 2. Confirm it's set
vercel env ls --environment production | grep SECTION_PERMISSION_ENFORCE
# Expected: SECTION_PERMISSION_ENFORCE  Encrypted  Production

# 3. Trigger a production redeploy (env var changes do NOT take effect until redeploy)
vercel --prod
# Wait for the build to finish and the deploy to go live.

# 4. Note the deploy URL + timestamp
vercel ls --prod | head -2

# 5. Record the flip timestamp in the cutover record table below (UTC).
```

## 3. Post-flip verification (within 5–60 minutes)

1. **Sentry query** — open the production Sentry project and run:
   ```
   message:"section_permission_check" environment:production
   ```
   Filter to events newer than the flip timestamp.

2. **Expected outcomes** (within 5–60 minutes depending on traffic):
   - ✅ At least one event with tag `enforced: true` — confirms the new env var was read at module load on the live deployment.
   - ✅ Any `finances: false` member who calls a finance API now sees a 403 with body `{ error: 'Insufficient permissions', section: 'finances' }`.
   - ❌ ZERO `enforced: true` events from owners / coaches / admins / super_admins. Any such event is a bug — engage kill switch immediately.

3. **If NO `enforced: true` events appear within 60 minutes**:
   - Possible: no `finances: false` members hit any finance route in that window. Acceptable. Note this in the cutover record with reasoning ("only Matt + 1 client logged in during window; both are owners / super_admins").
   - Possible: env var didn't propagate. Verify with `vercel inspect <deploy-url>` and check the env at the build/runtime level. If unset, repeat step 1 of flip commands and redeploy.
   - Possible: build-time vs runtime env mismatch. Confirm `next build` picked up the new env value (rebuild required after env change — `vercel --prod` does this).

4. **Spot-check by impersonation** (optional, if a `finances: false` test member exists):
   - Log in as that member.
   - Attempt to GET `/api/forecast/<some-id>` or `/api/Xero/pl-summary?business_id=...&fiscal_year=2026` via browser devtools.
   - Expected: `403` with structured body. Sidebar UI already hides finance routes for these users, so they typically can't reach the API by normal navigation.

## 4. Kill switch (rollback to LOG_ONLY in under 5 minutes)

If legitimate users report 403s, or any owner/coach/admin shows up as denied, revert immediately:

```bash
# Fastest path: remove the env var (defaults back to false)
vercel env rm SECTION_PERMISSION_ENFORCE production
# Confirm with: y

# Redeploy to pick up the change
vercel --prod
```

**Alternative (faster if the previous prod build is still available)** — promote the prior deploy:
```bash
vercel ls --prod | head -5
# Pick the deploy URL from BEFORE this flip and promote it:
vercel promote <prior-deploy-url>
```

Promotion swaps the production alias instantly; no rebuild required.

After rollback:
- Record the rollback timestamp + reason in the cutover record table below.
- File a follow-up plan to investigate the helper bug before re-attempting the flip.

## 5. Code-level rollback (only if env-var rollback insufficient)

If for some reason the env-var rollback doesn't restore behavior (extremely unlikely given the locked module-load read), revert the 65-02 PR:

```bash
git revert <65-02-merge-sha>      # PR #197
git push origin main              # PR + merge through normal flow (main is protected)
# Wait for CI + auto-deploy, or run `vercel --prod`
```

This restores routes to pre-65-02 state (no helper calls, no Sentry logs, no 403s for any member).

## 6. Cutover record (fill in during execution)

| Step | Timestamp (UTC) | Result | Notes |
|------|-----------------|--------|-------|
| Pre-flight checklist passed | | | |
| Env var added | | | |
| Redeploy triggered | | | |
| Deploy went live | | | |
| First `enforced:true` Sentry event seen | | | (or "no traffic in window") |
| 60-minute watch ended | | | |
| Rollback executed? | | | (yes/no — fill timestamp + reason if yes) |

## 7. Sign-off

- Cutover executed by: Matt Malouf
- Final status: { COMPLETE | ROLLED_BACK | DEFERRED }
- Next step:
  - If COMPLETE → proceed to Wave 65-05 (PR risk assessment + phase close-out)
  - If ROLLED_BACK → open follow-up investigation plan, do NOT proceed to 65-05
  - If DEFERRED → record reason; cutover will be re-attempted on a later date
