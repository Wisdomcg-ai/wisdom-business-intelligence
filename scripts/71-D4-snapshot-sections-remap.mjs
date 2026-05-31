#!/usr/bin/env node
/**
 * Phase 71-10 (D4) — Snapshot sections remap (numeric → named keys).
 *
 * One-off backfill for existing `monthly_report_snapshots` rows whose
 * `report_data.sections` was persisted as a numeric-keyed object
 * (`{"0": {...}, "1": {...}}`) — the legacy JS-array-as-JSONB shape — to
 * the new named-key shape introduced by 71-10 Task 1 (`{revenue: {...},
 * cost_of_sales: {...}, ...}`).
 *
 * Phase 70 methodology: TWO-MODE script. Default is dry-run; --apply
 * commits writes. Idempotent — re-running --apply on already-remapped rows
 * reports `0 need remap | N already named`. Service-role Supabase client
 * via env. Exits 0 on success; non-zero on infrastructure errors only.
 *
 * Detection (per-row):
 *   1. `report_data.sections` is an array         → REMAP (numeric keys when JSONB'd).
 *   2. `report_data.sections` is a numeric-keyed  → REMAP.
 *      object (every key matches /^\d+$/).
 *   3. `report_data.sections` is a named-key map  → SKIP (already done).
 *   4. `report_data.sections` is missing / null   → SKIP (nothing to remap).
 *
 * Vendor / category convention: mirrors
 * src/app/finances/monthly-report/utils/snapshot-serializer.ts. The TS file
 * is the source of truth; this script duplicates the map locally rather than
 * importing across the TS→.mjs boundary.
 *
 * Run:
 *   node scripts/71-D4-snapshot-sections-remap.mjs           # DRY RUN (default)
 *   node scripts/71-D4-snapshot-sections-remap.mjs --apply   # COMMIT WRITES
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })
config({ path: '.env' })

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
// Prefer new SUPABASE_SECRET_KEY (legacy SUPABASE_SERVICE_KEY disabled 2026-05-19).
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
if (!URL || !KEY) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local')
}

const APPLY = process.argv.includes('--apply')
const MODE = APPLY ? 'APPLY' : 'DRY-RUN'

// Duplicate of CATEGORY_KEY_MAP from
// src/app/finances/monthly-report/utils/snapshot-serializer.ts. If you change
// it there, change it here. (TS→mjs import would require a build step.)
const CATEGORY_KEY_MAP = {
  Revenue: 'revenue',
  'Cost of Sales': 'cost_of_sales',
  'Operating Expenses': 'operating_expenses',
  'Other Income': 'other_income',
  'Other Expenses': 'other_expenses',
}
const categoryToKey = (c) =>
  CATEGORY_KEY_MAP[c] ?? String(c ?? 'unknown').toLowerCase().replace(/\s+/g, '_')

const supabase = createClient(URL, KEY)

/**
 * @returns {{ needsRemap: boolean, kind: 'array' | 'numeric' | 'named' | 'mixed' | 'none' | 'invalid' }}
 */
function classifySections(sections) {
  if (sections == null) return { needsRemap: false, kind: 'none' }
  if (Array.isArray(sections)) return { needsRemap: true, kind: 'array' }
  if (typeof sections !== 'object') return { needsRemap: false, kind: 'invalid' }
  const keys = Object.keys(sections)
  if (keys.length === 0) return { needsRemap: false, kind: 'named' } // empty map is trivially named
  const numericKeys = keys.filter((k) => /^\d+$/.test(k))
  if (numericKeys.length === keys.length) return { needsRemap: true, kind: 'numeric' }
  if (numericKeys.length === 0) return { needsRemap: false, kind: 'named' }
  // Mixed numeric+named — surface as a warning, leave alone.
  return { needsRemap: false, kind: 'mixed' }
}

function remapSections(sections) {
  // Source of truth: convert to an array of section objects, then key by
  // categoryToKey(section.category). Works for both numeric-keyed object and
  // legacy actual-array shape.
  const arr = Array.isArray(sections) ? sections : Object.values(sections)
  const out = {}
  for (const sec of arr) {
    if (sec && typeof sec === 'object' && sec.category) {
      out[categoryToKey(sec.category)] = sec
    }
  }
  return out
}

async function main() {
  console.log(`[71-D4] Mode: ${MODE}`)
  console.log(`[71-D4] Source: ${URL}`)
  console.log('')

  const { data: rows, error } = await supabase
    .from('monthly_report_snapshots')
    .select('id, business_id, report_month, report_data')
    .order('report_month', { ascending: true })

  if (error) {
    console.error('[71-D4] FATAL fetch error:', error.message)
    process.exit(1)
  }

  console.log(`[71-D4] Loaded ${rows.length} snapshot rows`)
  console.log('')

  let needRemap = 0
  let alreadyNamed = 0
  let noSections = 0
  let mixed = 0
  let invalid = 0
  let applied = 0
  let failed = 0

  for (const row of rows) {
    const sections = row.report_data?.sections
    const { needsRemap, kind } = classifySections(sections)

    if (kind === 'none') {
      noSections++
      console.log(`  - id=${row.id} biz=${row.business_id} month=${row.report_month}: SKIP (no sections)`)
      continue
    }
    if (kind === 'invalid') {
      invalid++
      console.log(`  - id=${row.id} biz=${row.business_id} month=${row.report_month}: SKIP (invalid sections shape: ${typeof sections})`)
      continue
    }
    if (kind === 'mixed') {
      mixed++
      console.log(`  - id=${row.id} biz=${row.business_id} month=${row.report_month}: WARN MIXED (keys=${Object.keys(sections).join(',')}) — left alone, investigate manually`)
      continue
    }
    if (!needsRemap) {
      alreadyNamed++
      console.log(`  - id=${row.id} biz=${row.business_id} month=${row.report_month}: OK (already named: ${Object.keys(sections).join(', ')})`)
      continue
    }

    needRemap++
    const newSections = remapSections(sections)
    const beforeKeys = Array.isArray(sections) ? `array[${sections.length}]` : Object.keys(sections).join(',')
    const afterKeys = Object.keys(newSections).join(', ')
    console.log(`  - id=${row.id} biz=${row.business_id} month=${row.report_month}: REMAP ${beforeKeys} → ${afterKeys}`)

    if (APPLY) {
      const newReportData = { ...row.report_data, sections: newSections }
      const { error: upErr } = await supabase
        .from('monthly_report_snapshots')
        .update({ report_data: newReportData, updated_at: new Date().toISOString() })
        .eq('id', row.id)
      if (upErr) {
        console.error(`    FAILED: ${upErr.message}`)
        failed++
      } else {
        applied++
      }
    }
  }

  console.log('')
  console.log(`[71-D4] Summary:`)
  console.log(`  total           : ${rows.length}`)
  console.log(`  need remap      : ${needRemap}`)
  console.log(`  already named   : ${alreadyNamed}`)
  console.log(`  no sections     : ${noSections}`)
  console.log(`  mixed (skipped) : ${mixed}`)
  console.log(`  invalid (skipped): ${invalid}`)
  if (APPLY) {
    console.log(`  applied         : ${applied}`)
    console.log(`  failed          : ${failed}`)
    console.log('')
    console.log('[71-D4] APPLY complete.')
    if (failed > 0) process.exit(2)
  } else {
    console.log('')
    console.log('[71-D4] DRY-RUN complete. Re-run with --apply to commit.')
  }
}

main().catch((e) => {
  console.error('[71-D4] FATAL:', e)
  process.exit(1)
})
