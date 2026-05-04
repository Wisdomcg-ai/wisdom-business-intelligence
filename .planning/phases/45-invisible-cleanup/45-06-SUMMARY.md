---
phase: 45-invisible-cleanup
plan: 06
status: complete
date: 2026-05-03
---

# 45-06 — README rewrite — Summary

## What shipped

Replaced the default `create-next-app` boilerplate `README.md` (37 lines) with a project-specific internal-onboarding doc (~140 lines) covering:

- **What the project is** — 1-paragraph framing (internal coaching platform; Xero source-of-truth)
- **Tech stack** — Next.js 14, Supabase, TypeScript, Tailwind, Vitest, Playwright, Sentry, xero-node
- **Prerequisites** — Node 20+, npm, Supabase CLI, sandbox accounts
- **First-time setup** — clone → install → `.env.local` → `npm run dev`
- **Common workflows** — `dev`, `build`, `lint`, `test`, `analyze`, `verify` plus the reconciliation verifier from Phase 44.2
- **Project structure** — annotated tree of `src/`, `supabase/`, `.planning/`, `scripts/`, `docs/`
- **GSD workflow** — 7-step ceremony pointer for new contributors
- **Key invariants** — Xero source-of-truth, `data_quality` flag, per-tenant first-class, branded IDs, single canonical migration source
- **Where to ask** — Matt's email + `CLAUDE.md` pointer

## Tone

Internal-onboarding (per operator preference): short, factual, no marketing fluff. Assumes reader is an engineer (or Claude) coming to the codebase fresh. No screenshots. No Vercel deploy promotion (we're not a starter template).

## Phase 45 progress after merge

**9 of 9 complete.** All CLEAN-* items shipped:

- ✅ CLEAN-01 (#56), CLEAN-02 (#61), CLEAN-03 (#59), CLEAN-04 (#57), CLEAN-05 (no-op), CLEAN-06 (this PR), CLEAN-07 (#59), CLEAN-08 (#58), CLEAN-09 (#57)

**Phase 45 fully closed after this PR merges.** Next eligible v1.1 milestone phase: **Phase 46 (Server-Side Hardening).**
