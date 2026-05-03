/**
 * Phase 49 Plan 01 DB-05 — Migration filename hygiene.
 *
 * Asserts every file in supabase/migrations/ matches the project's canonical
 * `YYYYMMDDHHMMSS_<snake_case>.sql` form (14-digit timestamp). The all-zeros
 * baseline file (00000000000000_baseline_schema.sql) is allowed.
 *
 * Pure filesystem check — no DB required, runs in CI placeholder mode unlike
 * db-01 / db-02 which need a live preview branch.
 *
 * RED state (before Task 3):
 *   - 20260424_cfo_email_log.sql                    (8 digits — fails)
 *   - 20260427_unique_active_forecast_per_fy.sql    (8 digits — fails)
 *
 * GREEN state (after Task 3 git-mvs them to 14-digit form): zero violators.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const VALID = /^[0-9]{14}_[a-z0-9_]+\.sql$/

describe('DB-05: migration filename hygiene (YYYYMMDDHHMMSS_*.sql)', () => {
  const dir = path.resolve(__dirname, '../../../supabase/migrations')
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql'))

  it('migrations directory is non-empty (sanity check)', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  for (const f of files) {
    it(`${f} matches YYYYMMDDHHMMSS_<name>.sql`, () => {
      expect(f).toMatch(VALID)
    })
  }
})
