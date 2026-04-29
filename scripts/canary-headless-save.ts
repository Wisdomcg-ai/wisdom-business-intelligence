/**
 * Headless save — replicates `src/app/api/forecast-wizard-v4/generate/route.ts:160-231`
 * by reading existing assumptions, running the converter, and calling the RPC.
 *
 * Semantically identical to a wizard save's data path. Bypasses the HTTP route's
 * auth gate by using the service role client.
 *
 * Usage:
 *   npx tsx scripts/canary-headless-save.ts --forecast-id=<uuid>
 *
 * Returns 0 on RPC success (computed_at + lines_count printed).
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import path from 'node:path'
import { convertAssumptionsToPLLines } from '@/app/finances/forecast/services/assumptions-to-pl-lines'

config({ path: path.resolve(process.cwd(), '.env.local') })

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const s = a.replace(/^--/, '')
    const i = s.indexOf('=')
    return i === -1 ? [s, 'true'] : [s.slice(0, i), s.slice(i + 1)]
  }),
)

async function main() {
  const forecastId = args['forecast-id']
  if (!forecastId) {
    console.error('Usage: npx tsx scripts/canary-headless-save.ts --forecast-id=<uuid>')
    process.exit(1)
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  console.log(`[HEADLESS] Loading forecast ${forecastId}...`)
  const { data: forecast, error: fcErr } = await supabase
    .from('financial_forecasts')
    .select(
      'id, business_id, fiscal_year, forecast_start_month, forecast_end_month, forecast_duration, assumptions',
    )
    .eq('id', forecastId)
    .single()

  if (fcErr || !forecast) {
    console.error('Failed to load forecast:', fcErr)
    process.exit(1)
  }

  console.log(`[HEADLESS] forecast_start_month: ${forecast.forecast_start_month}`)
  console.log(`[HEADLESS] forecast_end_month: ${forecast.forecast_end_month}`)
  console.log(`[HEADLESS] forecast_duration: ${forecast.forecast_duration}`)

  console.log(`[HEADLESS] Reading existing forecast_pl_lines (for converter merge)...`)
  const { data: existingPLLines, error: elErr } = await supabase
    .from('forecast_pl_lines')
    .select('*')
    .eq('forecast_id', forecastId)
    .order('sort_order', { ascending: true })

  if (elErr) {
    console.error('Failed to load existingLines:', elErr)
    process.exit(1)
  }

  console.log(`[HEADLESS] existingLines count: ${existingPLLines?.length ?? 0}`)

  console.log(`[HEADLESS] Running convertAssumptionsToPLLines...`)
  const generatedLines = convertAssumptionsToPLLines({
    assumptions: forecast.assumptions as any,
    forecastStartMonth: forecast.forecast_start_month as string,
    forecastEndMonth: forecast.forecast_end_month as string,
    fiscalYear: forecast.fiscal_year as number,
    forecastDuration: (forecast.forecast_duration as number) || 1,
    existingLines: (existingPLLines as any) || [],
  })

  console.log(`[HEADLESS] generatedLines count: ${generatedLines.length}`)

  // Shape per generate/route.ts:193-202
  const rpcPLLines = generatedLines.map((line, i) => ({
    account_name: line.account_name,
    account_code: line.account_code ?? null,
    category: line.category,
    subcategory: line.subcategory ?? null,
    sort_order: line.sort_order ?? i,
    actual_months: line.actual_months || {},
    forecast_months: line.forecast_months || {},
    is_from_xero: line.is_from_xero || false,
  }))

  // Sanity check: if any rpcPLLines have null account_code, the new partial unique index
  // will reject the upsert. We DO NOT want to send those.
  const nullCodes = rpcPLLines.filter((l) => !l.account_code).length
  if (nullCodes > 0) {
    console.warn(`[HEADLESS] WARNING: ${nullCodes} rows have null account_code. The migration backfilled DB rows, but the converter outputs new lines without account_codes from assumptions. The RPC will likely fail on conflict.`)
    console.warn(`[HEADLESS] Account names with null codes:`)
    for (const l of rpcPLLines.filter((l) => !l.account_code)) {
      console.warn(`  - "${l.account_name}" (category=${l.category})`)
    }
  }

  console.log(`[HEADLESS] Calling save_assumptions_and_materialize RPC...`)
  const { data: rpcResult, error: rpcError } = await supabase.rpc(
    'save_assumptions_and_materialize',
    {
      p_forecast_id: forecastId,
      p_assumptions: forecast.assumptions,
      p_pl_lines: rpcPLLines,
      p_force_full_replace: false,
    },
  )

  if (rpcError) {
    console.error(`[HEADLESS] RPC failed:`, rpcError)
    process.exit(1)
  }

  console.log(`[HEADLESS] RPC SUCCESS. Result:`, rpcResult)
}

main().catch((e) => {
  console.error('[HEADLESS] Uncaught:', e)
  process.exit(1)
})
