/**
 * D4 (22 Sep 2026 system diagnostic) — forecast_pl_lines is hard-delete only:
 * readers don't filter deleted_at, so a soft-deleted row is silently summed.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const DIR = resolve(process.cwd(), 'supabase/migrations')
const FILE = '20260922020000_forecast_pl_lines_hard_delete_only.sql'
const executable = (sql: string) => sql.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n')

describe('forecast_pl_lines hard-delete-only constraint', () => {
  it('adds CHECK (deleted_at IS NULL) on forecast_pl_lines', () => {
    const sql = executable(readFileSync(resolve(DIR, FILE), 'utf8'))
    expect(sql).toMatch(/alter\s+table\s+public\.forecast_pl_lines\s+add\s+constraint\s+forecast_pl_lines_hard_delete_only\s+check\s*\(\s*deleted_at\s+is\s+null\s*\)/i)
  })

  it('no later migration soft-deletes forecast_pl_lines', () => {
    for (const f of readdirSync(DIR).filter((n) => n.endsWith('.sql') && n > FILE)) {
      const sql = executable(readFileSync(resolve(DIR, f), 'utf8'))
      expect(sql, f).not.toMatch(/update\s+public\.forecast_pl_lines[\s\S]*?set[\s\S]*?deleted_at\s*=\s*(now|current_timestamp)/i)
      expect(sql, f).not.toMatch(/drop\s+constraint\s+(if\s+exists\s+)?forecast_pl_lines_hard_delete_only/i)
    }
  })

  it('the one historical soft delete was the 23 Aug repair migration (its rows were hard-deleted 22 Sep)', () => {
    // No app code or DB function sets deleted_at on this table (checked 22 Sep 2026);
    // the constraint validates because the repair's two rows are gone.
    const sql = readFileSync(resolve(DIR, '20260823002251_retire_null_code_zombie_forecast_lines.sql'), 'utf8')
    expect(sql).toMatch(/set\s+deleted_at\s*=\s*now\(\)/i)
  })
})
