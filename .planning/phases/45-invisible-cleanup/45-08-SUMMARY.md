---
phase: 45-invisible-cleanup
plan: 08
status: complete
date: 2026-05-03
---

# 45-08 — Delete orphaned database/migrations/ — Summary

## What shipped

Deleted 17 SQL files / 1,325 lines of legacy pre-Supabase migrations under `database/migrations/`. The empty `database/` parent directory was also removed.

## Verification

- `grep -rln "database/migrations"` across all .ts/.tsx/.js/.json/.yml = **0 references**
- `grep` for old migration filenames (`001_tables`, `add-assigned-to-column`, etc) outside the deleted directory = **0 references**
- `supabase/migrations/` uses timestamped filenames (e.g. `20260430000002_*`) and is the canonical migration source — confirmed by Phase 44.1 + 44.2 + 44.3 work, all of which wrote there

## CI gate note

The CI workflow's `paths:` filter doesn't include `database/**` (because there's nothing actively built from there). To trigger the 4 required status checks (lint, typecheck, vitest, build) so branch protection allows the merge, this SUMMARY.md was added — the `**.md` glob in the workflow's paths filter does include it.

## Phase 45 progress after merge

- ✅ CLEAN-01 (#56), CLEAN-04 + CLEAN-09 (#57), CLEAN-08 (this PR), CLEAN-03 + CLEAN-07 (#59)
- ✅ CLEAN-05 — already untracked (no-op)
- 🛑 CLEAN-02 — Urban Roads PDF relocated to `~/Desktop/wisdom-bi-private/` locally; archive directory deletion pending separate PR
- 🛑 CLEAN-06 — README rewrite pending operator review on tone
