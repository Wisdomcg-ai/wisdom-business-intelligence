/**
 * Force a fresh Path A Xero P&L + BS sync for a single client.
 *
 * Wraps src/lib/xero/sync-orchestrator.ts → syncBusinessXeroPL() so a sync
 * can be triggered from a developer machine without waiting for the
 * 2am cron or clicking through the UI. Useful for:
 *
 *   - Force-resyncing a client after their Xero chart of accounts changes.
 *   - Diagnosing a reconciliation gap (compare DB totals to Xero PDF).
 *   - Migrating pre-Path-A clients onto the modern sync orchestrator. The
 *     orchestrator's post-upsert stale-row sweep (PR #190) self-heals the
 *     SYNTH-AID duplicate-account-id class on the first run per tenant.
 *
 * Lookup paths (mutually exclusive — provide one):
 *   --name="<fragment>"     ILIKE-search businesses.name. Errors if 0 or 2+.
 *   --business-id=<uuid>    Pass through to syncBusinessXeroPL() verbatim.
 *
 * Flags:
 *   --dry-run               Resolve the business + connection but skip the
 *                           actual sync. Useful for verifying the right
 *                           record is selected before kicking a real sync.
 *
 * Usage examples:
 *   npx tsx scripts/resync-client.ts --name="Efficient Living"
 *   npx tsx scripts/resync-client.ts --business-id=4a659051-52c4-4eb3-972d-70cfbd6de1d4
 *   npx tsx scripts/resync-client.ts --name=Envisage --dry-run
 *
 * Requires .env.local to have:
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_KEY
 *   - APP_SECRET_KEY (derive via scripts/derive-app-secret-key.ts)
 *   - XERO_CLIENT_ID, XERO_CLIENT_SECRET (for token refresh)
 *
 * Exit codes:
 *   0 — success or dry-run completed.
 *   1 — ambiguous match, missing env, sync error.
 *   2 — no matching business found.
 */
import { config } from 'dotenv'
import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })

import { createClient } from '@supabase/supabase-js'
import { syncBusinessXeroPL } from '../src/lib/xero/sync-orchestrator'

interface CliArgs {
  name?: string
  businessId?: string
  dryRun: boolean
  help: boolean
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { dryRun: false, help: false }
  for (const a of argv.slice(2)) {
    if (a === '--help' || a === '-h') out.help = true
    else if (a === '--dry-run') out.dryRun = true
    else if (a.startsWith('--name=')) out.name = a.slice('--name='.length)
    else if (a.startsWith('--business-id=')) out.businessId = a.slice('--business-id='.length)
    else if (a.startsWith('--')) {
      console.error(`Unknown flag: ${a}`)
      out.help = true
    }
  }
  return out
}

function printHelp(): void {
  console.log(
    [
      'Usage: npx tsx scripts/resync-client.ts (--name=<fragment> | --business-id=<uuid>) [--dry-run]',
      '',
      'Force a fresh Path A Xero P&L + BS sync for one client.',
      '',
      'Flags:',
      '  --name=<fragment>       ILIKE-match against businesses.name',
      '  --business-id=<uuid>    Direct businesses.id (or business_profiles.id)',
      '  --dry-run               Resolve the connection but skip the sync',
      '  --help                  Show this message',
    ].join('\n'),
  )
}

async function resolveBusiness(
  supabase: any,
  args: CliArgs,
): Promise<{ id: string; name: string }> {
  if (args.businessId) {
    const { data, error } = await supabase
      .from('businesses')
      .select('id, name')
      .eq('id', args.businessId)
      .maybeSingle()
    if (error) {
      console.error('businesses lookup failed:', error.message)
      process.exit(1)
    }
    if (!data) {
      // The orchestrator's resolveBusinessProfileIds() can also accept a
      // business_profiles.id. We pass through unchanged and let the
      // orchestrator handle the dual-id resolution — but report what we
      // found for operator visibility.
      console.log(
        `Note: no row in businesses with id=${args.businessId}; passing through to orchestrator's dual-id resolver.`,
      )
      return { id: args.businessId, name: '(unknown — passing through)' }
    }
    return { id: (data as any).id, name: (data as any).name }
  }

  if (args.name) {
    const { data, error } = await supabase
      .from('businesses')
      .select('id, name')
      .ilike('name', `%${args.name}%`)
      .limit(5)
    if (error) {
      console.error('businesses lookup failed:', error.message)
      process.exit(1)
    }
    if (!data || data.length === 0) {
      console.error(`No business matched name LIKE '%${args.name}%'.`)
      process.exit(2)
    }
    if (data.length > 1) {
      console.error(`Ambiguous: ${data.length} businesses match '%${args.name}%':`)
      for (const b of data) console.error(`  - ${(b as any).name} (id=${(b as any).id})`)
      console.error('Re-run with --business-id=<uuid> to disambiguate.')
      process.exit(1)
    }
    return { id: (data[0] as any).id, name: (data[0] as any).name }
  }

  console.error('Must pass exactly one of --name=... or --business-id=...')
  process.exit(1)
}

async function main() {
  const args = parseArgs(process.argv)
  if (args.help) {
    printHelp()
    process.exit(0)
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!url || !serviceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY in .env.local')
    process.exit(1)
  }

  const supabase = createClient(url, serviceKey)
  const biz = await resolveBusiness(supabase, args)
  console.log(`Target: ${biz.name} (id=${biz.id})`)

  // Confirm an active Xero connection exists before kicking the sync —
  // syncBusinessXeroPL will surface a clear error anyway, but failing fast
  // here gives a tighter operator loop.
  const { data: conns } = await supabase
    .from('xero_connections')
    .select('id, tenant_name, tenant_id, is_active, last_synced_at')
    .eq('business_id', biz.id)
    .eq('is_active', true)
  if (!conns?.length) {
    // Try profile-side id (dual-id system). syncBusinessXeroPL handles
    // this internally, so don't error — just inform.
    console.log('No active xero_connections at this businesses.id — orchestrator will try profile-side lookup.')
  } else {
    for (const c of conns) {
      console.log(
        `  connection: ${(c as any).tenant_name} (tenant_id=${(c as any).tenant_id}, last_synced_at=${(c as any).last_synced_at ?? 'never'})`,
      )
    }
  }

  if (args.dryRun) {
    console.log('\n--dry-run set — skipping syncBusinessXeroPL()')
    process.exit(0)
  }

  console.log('\nTriggering syncBusinessXeroPL (Path A) …')
  const t0 = Date.now()
  const result = await syncBusinessXeroPL(biz.id)
  const secs = ((Date.now() - t0) / 1000).toFixed(1)

  console.log(`\nDone in ${secs}s.`)
  console.log('  status:            ', result.status)
  console.log('  rows_inserted:     ', result.rows_inserted)
  console.log('  rows_updated:      ', result.rows_updated)
  console.log('  xero_request_cnt:  ', result.xero_request_count)
  console.log('  reconciliation:    ', JSON.stringify(result.reconciliation))
  console.log('  coverage:          ', JSON.stringify(result.coverage))
  if (result.error) console.log('  error:             ', result.error)

  if (result.status === 'error') process.exit(1)
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
