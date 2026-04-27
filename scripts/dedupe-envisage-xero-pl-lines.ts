/**
 * One-off cleanup: dedupe xero_pl_lines for Envisage Australia.
 * Keeps the newest row per (business_id, account_code), deletes older duplicates.
 *
 * Surfaced 2026-04-27 — two sync-all runs (Apr 17 + Apr 26) collided, the
 * second's DELETE silently failed but its INSERT proceeded. Result: 89 rows
 * where ~47 unique accounts exist.
 *
 * Run with --dry-run first to preview.
 */
import { config } from 'dotenv'
import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { createClient } from '@supabase/supabase-js'

const DRY_RUN = process.argv.includes('--dry-run')

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )

  const bizId = '8c8c63b2-bdc4-4115-9375-8d0fd89acc00'
  const profileId = 'fa0a80e8-e58e-40aa-b34a-8db667d4b221'

  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE — will delete rows'}\n`)

  const { data: rows, error } = await supabase
    .from('xero_pl_lines')
    .select('id, account_name, account_code, business_id, updated_at, monthly_values')
    .in('business_id', [bizId, profileId])
    .order('updated_at', { ascending: false })
  if (error) throw error

  console.log(`Loaded ${rows?.length} rows for Envisage`)

  // Group by (business_id, account_code). NOTE: must use both because a code
  // could in theory exist for both ID forms. Treat undefined account_code rows
  // as their own group keyed by account_name.
  const groups = new Map<string, typeof rows>()
  for (const r of rows ?? []) {
    const key = r.account_code
      ? `${r.business_id}|code|${r.account_code}`
      : `${r.business_id}|name|${r.account_name}`
    const arr = groups.get(key) ?? []
    arr.push(r)
    groups.set(key, arr as any)
  }

  const toDelete: string[] = []
  let dupGroups = 0
  for (const [key, arr] of groups.entries()) {
    if ((arr ?? []).length <= 1) continue
    dupGroups++
    // already sorted desc by updated_at; index 0 is keeper
    const [keep, ...losers] = arr ?? []
    console.log(`\n  ${key}`)
    console.log(`    KEEP: id=${keep.id.substring(0,8)} updated=${keep.updated_at} months=${Object.keys(keep.monthly_values ?? {}).length}`)
    for (const l of losers) {
      console.log(`    DROP: id=${l.id.substring(0,8)} updated=${l.updated_at} months=${Object.keys(l.monthly_values ?? {}).length}`)
      toDelete.push(l.id)
    }
  }

  console.log(`\n=== Summary ===`)
  console.log(`Duplicate groups: ${dupGroups}`)
  console.log(`Rows to delete: ${toDelete.length}`)
  console.log(`Rows after cleanup: ${(rows?.length ?? 0) - toDelete.length}`)

  if (!DRY_RUN && toDelete.length > 0) {
    const { error: delErr, count } = await supabase
      .from('xero_pl_lines')
      .delete({ count: 'exact' })
      .in('id', toDelete)
    if (delErr) throw delErr
    console.log(`\n✓ Deleted ${count} rows`)
  } else if (DRY_RUN) {
    console.log('\n(dry-run — no changes made)')
  }
}
main().catch(e => { console.error(e); process.exit(1) })
