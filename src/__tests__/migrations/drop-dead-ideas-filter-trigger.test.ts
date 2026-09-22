/**
 * B1 (22 Sep 2026 system diagnostic) — the trigger on ideas_filter read a
 * column the table doesn't have, so every evaluation save failed. Static
 * checks (CI has no live DB); the Supabase preview branch applies it.
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const DIR = resolve(process.cwd(), 'supabase/migrations')
const FILE = '20260922010000_drop_dead_ideas_filter_trigger.sql'

const executable = (sql: string) => sql.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n')

describe('drop the dead ideas_filter trigger', () => {
  it('drops the trigger and its function', () => {
    expect(existsSync(resolve(DIR, FILE))).toBe(true)
    const sql = executable(readFileSync(resolve(DIR, FILE), 'utf8'))
    expect(sql).toMatch(/drop\s+trigger\s+if\s+exists\s+ideas_filter_decision_trigger\s+on\s+public\.ideas_filter/i)
    expect(sql).toMatch(/drop\s+function\s+if\s+exists\s+public\.update_idea_status_on_filter\(\)/i)
  })

  it('the function really does reference a column ideas_filter lacks (why this is safe to drop)', () => {
    const baseline = readFileSync(resolve(DIR, '00000000000000_baseline_schema.sql'), 'utf8')
    const fn = baseline.slice(baseline.indexOf('FUNCTION "public"."update_idea_status_on_filter"'))
    expect(fn.slice(0, 600)).toMatch(/NEW\.filter_status/)
    const table = baseline.slice(baseline.indexOf('CREATE TABLE IF NOT EXISTS "public"."ideas_filter"'))
    const tableDef = table.slice(0, table.indexOf(');'))
    expect(tableDef).not.toMatch(/"filter_status"/)
    expect(tableDef).not.toMatch(/"status"/)
    expect(tableDef).toMatch(/"decision"/)
  })

  it('no later migration recreates the trigger', () => {
    const later = readdirSync(DIR).filter((f) => f.endsWith('.sql') && f > FILE)
    for (const f of later) {
      expect(executable(readFileSync(resolve(DIR, f), 'utf8'))).not.toMatch(/create\s+(or\s+replace\s+)?trigger\s+"?ideas_filter_decision_trigger/i)
    }
  })
})
