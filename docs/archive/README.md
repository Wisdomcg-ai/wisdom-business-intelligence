# Archive

Historical docs and root-level files that aren't part of the active codebase but are preserved here for reference instead of deleted outright.

## Contents

- **`root-cruft/`** — files that used to live at the repo root and are no longer in active use (executed plans, AWS SAM remnants, HTML mockups, an old eslint flat config). Per Phase 45 CLEAN-03.
- **`v1.0-docs/`** — executed plans, audit reports, status snapshots, and dated client feedback from the v1.0 milestone. Architecture docs that are still evergreen reference were left in `docs/`. Per Phase 45 CLEAN-07.

## How to recover something

```bash
git mv docs/archive/<subfolder>/<file> <original-location>
```

Or just open the file in place — they're still in the repo, just out of the main view.

## How to actually delete (later)

If after a few months nothing here is referenced, the whole archive can be deleted in one PR:
```bash
git rm -r docs/archive
```
Git history preserves the contents either way.
