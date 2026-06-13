# inLIFE Pulse — Fork Readiness & Cutover Plan

**Status:** the fork GATE IS MET. Phases 0/A/B/C/D are complete and live; the repo
now equals fully-remediated prod (C-32/R21/R15 reconciled in #284). A fork built
from this repo inherits a clean, validated, role-correct, brand-decoupled spine.

This is the ordered cutover. The fork is a **separate repo + separate Supabase
project + separate Vercel project**, starting with **clean/empty data** (it skips
Phase C's prod-only data cleanse entirely).

---

## 0. What the fork inherits vs. skips
**Inherits (from the repo):** all app code (Phases A/B/D), `baseline_schema.sql` +
ALL incremental migrations — including `20260602030000` (C-32), `20260602040000`
(R21), `20260602050000` (R15 deprecate). So the fork's DB build lands in the
**cleaned** state (mask gone, self-branch gone, dead tables renamed `deprecated_*`).
**Skips:** the `r14_*` data-cleanse migrations (prod-only, applied via
apply_migration, never in the repo) and the `r14_cleanse_backup` /
`data_cleanse_quarantine` infra tables — the fork has no polluted data to cleanse.

---

## 1. Repo
1. Create the inLIFE Pulse repo (fresh repo, copy of this tree at current `main`).
2. **Do NOT carry these** (WisdomBI-prod-only, must stay untracked — never commit):
   `scripts/audit-dual-id-*.mjs`, `scripts/onboard-fit2shine.mjs`,
   `scripts/reassess-fit2shine.mjs`, `.planning/codebase/R1-CONSOLIDATION-PLAN.md`,
   `.planning/codebase/MIGRATION-DRIFT-RECONCILIATION.md`. (`.planning/*` is
   WisdomBI's remediation history — optional to carry; not needed by the fork.)
3. **Fix the stale `.env.example`** before forking (see §6) — it lists 14 vars but
   the app needs ~37; a fork wired from it would be missing critical secrets.
4. Keep `engines.node: "20.x"` (the reproducible, build-OOM-safe pin from #285).

## 2. Branding (R7 — env-only, no code edits)
`src/lib/config/brand.ts` reads everything from env with WisdomBI **defaults**, so
the fork rebrands purely by SETTING these (else it silently shows WisdomBI):
`NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_TITLE`, `NEXT_PUBLIC_APP_DESCRIPTION`,
`NEXT_PUBLIC_BRAND_LOGO_URL`, `NEXT_PUBLIC_FAVICON_PATH`,
`NEXT_PUBLIC_SUPPORT_EMAIL`, `NEXT_PUBLIC_LEGAL_ENTITY`, `NEXT_PUBLIC_LEGAL_ABN`,
`NEXT_PUBLIC_LEGAL_TRADING_AS`, `NEXT_PUBLIC_DEFAULT_APP_URL`, `NEXT_PUBLIC_APP_URL`.
Also brand colors (`BRAND_COLORS` in brand.ts — set or edit for inLIFE Pulse) and
the favicon/logo assets in `public/`.

## 3. Supabase (new project)
1. Create a new Supabase project for inLIFE Pulse (note its region/ref).
2. Apply the schema: `supabase db reset` (or push) runs `baseline + all migrations`
   → produces the cleaned schema (verified by #284's Supabase Preview).
3. The fork starts EMPTY — no tenants, no Xero connections, no forecasts.
4. (Optional) drop the `deprecated_*` tables in the fork immediately — it never had
   data in them; or wait for the shared hard-drop migration.
5. Wire the auth settings (redirect URLs, email templates) to the inLIFE Pulse domain.

## 4. Integrations (each needs a fresh account/app for the fork)
- **Xero**: new Xero OAuth app → `XERO_CLIENT_ID` / `XERO_CLIENT_SECRET`; redirect
  URI = the fork's `/api/Xero/callback`. (R20 note: you can create the fork with a
  lowercase `/api/xero` dir from day one — see §7.)
- **Resend**: verify the inLIFE Pulse sending domain → `RESEND_API_KEY`; set
  `SENDER_EMAIL` / `SENDER_FROM` / `REPORT_FROM_EMAIL` / `REPORT_FROM_NAME`.
- **Upstash Redis** (rate limiter, R11): provision via the new Vercel project's
  Marketplace → injects `KV_REST_API_URL` / `KV_REST_API_TOKEN` (the code reads
  either KV_ or UPSTASH_ names). Until provisioned, the limiter runs in-memory.
- **Sentry**: new project → `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`.
- **AI**: `ANTHROPIC_API_KEY` (CFO assistant), `OPENAI_API_KEY`.
- **OpenExchangeRates** (FX): `OPENEXCHANGERATES_APP_ID`.

## 5. Vercel (new project)
1. New Vercel project linked to the inLIFE Pulse repo.
2. Node version: `engines: "20.x"` is honored (builds clean; avoids the Node-24 OOM).
3. Set ALL env vars (§6) for Production + Preview.
4. Generate FRESH secrets (don't reuse WisdomBI's): `ENCRYPTION_KEY`,
   `APP_SECRET_KEY`, `OAUTH_STATE_SECRET`, `REPORT_LINK_SECRET`, `CRON_SECRET`
   (e.g. `openssl rand -hex 32`).
5. Leave `ZOD_ENFORCE_ROUTES` EMPTY initially (observe mode), like WisdomBI.
6. Deploy; confirm the production build goes Ready on Node 20.x.

## 6. Complete env-var checklist (~37; the stale .env.example has only 14)
**Supabase:** NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
(or NEXT_PUBLIC_SUPABASE_ANON_KEY), SUPABASE_SECRET_KEY (or
SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SERVICE_KEY).
**Branding (§2):** the NEXT_PUBLIC_* brand vars.
**Xero:** XERO_CLIENT_ID, XERO_CLIENT_SECRET, NEXT_PUBLIC_XERO_API_URL.
**Email:** RESEND_API_KEY, SENDER_EMAIL, SENDER_FROM, REPORT_FROM_EMAIL, REPORT_FROM_NAME.
**AI:** ANTHROPIC_API_KEY, OPENAI_API_KEY.
**Rate limit:** KV_REST_API_URL, KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL/TOKEN).
**FX:** OPENEXCHANGERATES_APP_ID.
**Secrets (generate fresh):** ENCRYPTION_KEY, APP_SECRET_KEY, OAUTH_STATE_SECRET,
REPORT_LINK_SECRET, CRON_SECRET.
**Sentry:** SENTRY_DSN, NEXT_PUBLIC_SENTRY_DSN.
**Admin/demo:** ADMIN_EMAIL, DEMO_CLIENT_EMAIL, DEMO_CLIENT_PASSWORD (set a strong
one — R36/MNT-N9; the fork has no hardcoded default if you set the env).
**Feature flags (defaults are safe):** ZOD_ENFORCE_ROUTES (empty), SECTION_PERMISSION_ENFORCE,
FORECAST_INVARIANTS_STRICT, FORECAST_FX_VIA_ENGINE_DISABLE.
**Vercel auto-provides:** NODE_ENV, VERCEL_ENV, VERCEL_GIT_COMMIT_SHA, NEXT_RUNTIME.

## 7. Do these CLEANLY in the fork (near-zero risk in a fresh repo)
The deferred Phase D items are SAFER post-fork (no legacy data/tokens to break):
- **R18** — unify the 3 encryption-key env names + drop the PBKDF2 fallback. Trivial
  in the fork (no existing encrypted Xero tokens to invalidate).
- **R19** — collapse the two forecasts tables / 3 wizard versions / `wide_compat`
  to one canonical path. The fork's tables start empty → no data migration risk.
- **R20** — create the routes dir as lowercase `/api/xero` from the start (no
  150-caller rename, no case-sensitive prod risk).
- **R36 demo-password** — set DEMO_CLIENT_PASSWORD; no literal needed.

## 8. Verification (fork is "working")
- [ ] `npm ci && npm run build` clean on Node 20.x; full `vitest` green (timezone flake aside).
- [ ] Supabase: `baseline + migrations` applied; schema has NO mask, NO self-branch,
      tables `deprecated_*` (or dropped). `auth_get_accessible_business_ids_text()`
      has no `auth.uid()::TEXT`; `auth_can_manage_business()` has no self-branch.
- [ ] Sign-up → create a business → Xero OAuth connect → sync → see a P&L/BS.
- [ ] Branding shows inLIFE Pulse (not WisdomBI) everywhere; emails send from the new sender.
- [ ] Rate limiter on Upstash (or in-memory fallback) confirmed.

---

## WisdomBI-side items that DON'T block the fork (track separately)
- 47-06 Zod enforce flip (bake to ~2026-06-15, then evidence-gated).
- R15 hard-drop of the `deprecated_*` tables + the code cleanup (trim
  `types/database.ts`, RLS-comments test) — after the bake.
- Review: 83 quarantined rows + 2 flagged FF orphans in WisdomBI prod.
- R33 CSRF observed rollout (optional defense-in-depth).
