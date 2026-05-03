---
phase: 45-invisible-cleanup
plan: 02
status: complete
date: 2026-05-03
---

# 45-02 — Delete `_archive/`, `.archive/`, `supabase/archive/` directories — Summary

## What shipped

Deleted 3 archive directories totaling 295 files:
- `_archive/` — 162 files (image dumps, schema dumps, stray src/, supabase-migrations dump, vercel.json.bak, etc.)
- `.archive/` — 3 files (legacy diagram visualizer components and page.tsx)
- `supabase/archive/` — 130 files (seed scripts, pre-branching migrations, fix-up SQL)

## Urban Roads PDF relocation (operator action)

`_archive/Urban Roads Finance Report Jan 2026.pdf` was relocated to operator's local-private folder at `~/Desktop/wisdom-bi-private/Urban Roads Finance Report Jan 2026.pdf` BEFORE the deletion in this PR. File verified present at the new location pre-commit.

The PDF remains in git history (this commit removes the file from the working tree only). If full removal from history is required for confidentiality reasons, a separate `git filter-repo` operation would be needed.

## Verification

- `grep -rln "_archive/|.archive/|supabase/archive/"` across all .ts/.tsx/.js/.json/.yml/.md outside the deleted directories = **0 production-code references** (only `.claude/settings.local.json` which is a local Claude tool config, not application code)
- The 3 directories had no imports, no build dependencies, no migration runners pointing at them. They were genuinely orphaned.

## CI gate

This SUMMARY.md is included to ensure the PR triggers the 4 required status checks via the `**.md` glob in the workflow's `paths:` filter (the deleted SQL/PDF/etc files don't match the filter on their own).

## Phase 45 progress after merge

- ✅ CLEAN-01 (#56), CLEAN-04 + CLEAN-09 (#57), CLEAN-08 (#58), CLEAN-03 + CLEAN-07 (#59), CLEAN-02 (this PR)
- ✅ CLEAN-05 — already untracked (no-op)
- 🛑 CLEAN-06 — README rewrite pending operator review on tone (last remaining Phase 45 item)

After this merges, Phase 45 is **8 of 9 complete** — only the README rewrite remains.
