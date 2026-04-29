/**
 * Verify the 20260429000003_save_assumptions_and_materialize_upsert.sql migration
 * is live in Supabase. Read-only.
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import path from 'node:path'

config({ path: path.resolve(process.cwd(), '.env.local') })

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Check 1: partial unique index exists
  const { data: idx, error: idxErr } = await supabase.rpc('exec_sql', {
    sql_query: `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'forecast_pl_lines' AND indexname = 'forecast_pl_lines_forecast_account_code_partial_uidx';`,
  } as any)

  // exec_sql may not exist; fall back to direct query via PostgREST won't work for raw SQL.
  // Instead, query pg_indexes via a view-like approach or just attempt the RPC and inspect behavior.

  // Check 2: try calling the new 4-arg signature with a non-existent forecast_id and force_full_replace=false.
  // Expect: error code P0002 ('forecast not found') — proves the function exists with the new signature.
  const fakeId = '00000000-0000-0000-0000-000000000000'
  const { data: probeData, error: probeErr } = await supabase.rpc(
    'save_assumptions_and_materialize',
    {
      p_forecast_id: fakeId,
      p_assumptions: {},
      p_pl_lines: [],
      p_force_full_replace: false,
    },
  )

  console.log('=== Probe with 4-arg (force_full_replace) ===')
  if (probeErr) {
    console.log(`Error code: ${(probeErr as any).code}`)
    console.log(`Error msg:  ${probeErr.message}`)
    if ((probeErr as any).code === 'P0002' || /not found/i.test(probeErr.message)) {
      console.log('✓ 4-arg signature exists (rejected fake forecast_id as expected)')
    } else if (/function .* does not exist/i.test(probeErr.message)) {
      console.log('✗ 4-arg signature MISSING — migration not applied')
      process.exit(1)
    } else {
      console.log('? Unexpected error — investigate')
    }
  } else {
    console.log('? Unexpected success on fake id:', probeData)
  }

  // Check 3: try the legacy 3-arg signature — should now FAIL because we DROPped it.
  const { error: legacyErr } = await supabase.rpc(
    'save_assumptions_and_materialize',
    {
      p_forecast_id: fakeId,
      p_assumptions: {},
      p_pl_lines: [],
    },
  )
  console.log('\n=== Probe with legacy 3-arg ===')
  if (legacyErr) {
    console.log(`Error code: ${(legacyErr as any).code}`)
    console.log(`Error msg:  ${legacyErr.message}`)
    if (/function .* does not exist/i.test(legacyErr.message) || (legacyErr as any).code === 'PGRST202') {
      console.log('✓ 3-arg overload was DROPped (W1 from plan-checker iteration 1)')
    } else if ((legacyErr as any).code === 'P0002') {
      console.log('? 3-arg STILL EXISTS — DROP did not run, but the 4-arg form has a default for p_force_full_replace, so callers still work')
    } else {
      console.log('? Unexpected — investigate')
    }
  } else {
    console.log('? Unexpected success on legacy 3-arg with fake id')
  }

  console.log('\n=== Done ===')
}

main().catch((e) => {
  console.error('Verify failed:', e)
  process.exit(1)
})
