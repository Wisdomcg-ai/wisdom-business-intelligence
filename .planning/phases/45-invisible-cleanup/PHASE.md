# Phase 45: Invisible Cleanup

**Milestone:** v1.1 — Codebase Hardening
**Status:** Not started
**Source:** `CODEBASE-AUDIT.md` Top-10 #9, Section H (Redundancy/Dead Code), written 2026-04-28

## Goal

Delete what no one references. ~192 files / 2.1 MB / ~6,000 LOC removed without behaviour change. Reduce the surface every future audit, IDE search, and dependency upgrade has to reason about.

## Why now

- Every dead wizard, dead archive directory, and dead config file is a future maintainer trap.
- `axios` ships with 2 known HIGH CVEs and has zero `from 'axios'` imports across `src/` (audit Section G).
- Done after Phase 44 (CI enforcing) so deletes are validated by `next build` + `tsc --noEmit` + `vitest run` automatically — if a delete breaks something, CI catches it before merge.

## Dependencies

- **Phase 44 (Test Gate & CI Hardening).** CI must be enforcing before deletes happen — that's how we prove "nothing references this" rather than relying on grep alone.

## Blast Radius

**Zero — pure deletion of unreferenced code, archives, and dependencies.** Each deletion validated by typecheck + lint + build + vitest on the PR. No client-facing behaviour change. The Urban Roads PDF (`_archive/Urban Roads Finance Report Jan 2026.pdf`) gets relocated to client-secure storage *before* the archive directory is removed.

## Requirements (1:1 from REQUIREMENTS.md)

- **CLEAN-01** — Delete `src/app/finances/forecast/components/wizard-v3/` and `wizard-steps/` (zero importers, ~4,400 LOC).
- **CLEAN-02** — Delete `_archive/`, `.archive/`, `supabase/archive/` directories. Move `_archive/Urban Roads Finance Report Jan 2026.pdf` to client-secure storage first.
- **CLEAN-03** — Delete root-level cruft: `dwa_resources.html`, `mockup-step4-actuals.html`, `check_spm_kpis.mjs`, `packaged.yaml`, `template.yml` (AWS SAM remnants), `eslint.config.mjs` (dead flat config), the four root-level `*_PLAN.md` / `UI_UX_*.md` files.
- **CLEAN-04** — Remove `axios` from `package.json` (0 imports in `src/`, 2 known HIGH CVEs).
- **CLEAN-05** — Untrack committed `tsconfig.tsbuildinfo` (`git rm --cached`); already in `.gitignore`.
- **CLEAN-06** — Rewrite root `README.md` to project-specific onboarding (currently default `create-next-app` boilerplate).
- **CLEAN-07** — Move stale `docs/*.md` files (executed plans from v1.0) to `docs/archive/` — preserve history, lose noise.
- **CLEAN-08** — Delete `database/migrations/` after confirming `supabase/migrations/` is canonical.
- **CLEAN-09** — Add `@next/bundle-analyzer` script to `package.json` so future bundle work is measurable.

## Success Criteria (observable)

1. **`grep -rln "wizard-v3\|wizard-steps" src/` returns 0 results** and `npm run build` succeeds — i.e. deletes verified by build, not just grep. (Validates CLEAN-01.)
2. **`ls _archive .archive supabase/archive 2>/dev/null` returns nothing**, and a Supabase storage object exists for the relocated Urban Roads PDF (path documented in the PR). (Validates CLEAN-02.)
3. **`npm ls axios` returns "(empty)"** and `git ls-files | grep tsconfig.tsbuildinfo` returns nothing. (Validates CLEAN-04, CLEAN-05.)
4. **The root `README.md` describes how to clone, install, and run WisdomBI locally** (Supabase keys, Xero sandbox, `npm run dev`) — i.e. a new contributor could onboard from it. (Validates CLEAN-06.)
5. **`npm run analyze` (or equivalent script) produces a bundle-analyzer HTML report** so future bundle-size work has a measurable baseline. (Validates CLEAN-09.)

## Evidence in audit

- `find src/app/finances/forecast/components/wizard-v3 src/app/finances/forecast/components/wizard-steps -exec wc -l` totals 4,424 LOC; zero importers (audit Top-10 #9).
- `grep -rn "from 'axios'" src/` returns 0 matches; `axios` HIGH CVEs flagged in audit Section G.
- Root-level cruft files enumerated in audit Section H.
- `tsconfig.tsbuildinfo` tracked in git despite `.gitignore` entry (audit Section H).

## Out of scope for this phase

- Refactoring or extracting any of the 6 god-files >2,000 LOC (deferred to v1.2 — touch when next changing the feature).
- Migrating the 86 client-rendered pages to RSC (deferred).
- Major dependency upgrades (Next 14→16, React 18→19, Anthropic SDK 0.39→0.91 — separate milestone).
- Structured logging adoption (that's Phase 46 SEC-07).

## Plans

TBD — to be drafted at `/gsd-plan-phase 45`.
