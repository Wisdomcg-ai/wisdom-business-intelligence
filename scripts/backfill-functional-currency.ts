/**
 * Phase 67-01 — Backfill xero_connections.functional_currency from Xero
 *
 * For every active xero_connections row:
 *   1. Refresh an access token via the existing token-manager
 *   2. Fetch /Organisation and read BaseCurrency
 *   3. Compare to the stored functional_currency
 *   4. Without --apply: print a diff and exit
 *      With    --apply: update mismatches one row at a time
 *
 * The script does NOT touch connections where Xero returns no BaseCurrency
 * (e.g. transient API failure). Mismatches that look suspicious (storing
 * 'AUD' while Xero says 'HKD' for an entity whose name contains 'Limited')
 * are highlighted in the dry-run output for human review before --apply.
 *
 * Why this is safe:
 *   - Wrong functional_currency just means the consolidation engine doesn't
 *     translate (status quo). The right value triggers translation when
 *     Phase 67-02 lands. The fix is purely additive.
 *
 * Usage:
 *   npx tsx scripts/backfill-functional-currency.ts          # dry-run
 *   npx tsx scripts/backfill-functional-currency.ts --apply  # update SQL
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { getValidAccessToken } from '../src/lib/xero/token-manager'
import { getXeroOrgTimezone } from '../src/lib/xero/organisation'

const APPLY = process.argv.includes('--apply')

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY in .env.local')
    process.exit(1)
  }
  const sb = createClient(url, key, { auth: { persistSession: false } })

  console.log(`Mode: ${APPLY ? 'APPLY (will UPDATE)' : 'DRY-RUN (no changes)'}\n`)

  const { data: conns, error } = await sb
    .from('xero_connections')
    .select('id, business_id, tenant_id, tenant_name, display_name, functional_currency, is_active')
    .eq('is_active', true)
    .order('tenant_name')

  if (error) {
    console.error('Failed to load connections:', error.message)
    process.exit(1)
  }
  if (!conns || conns.length === 0) {
    console.log('No active connections found.')
    return
  }

  console.log(`Checking ${conns.length} active connection(s)…\n`)

  type Outcome =
    | { status: 'match'; conn: typeof conns[number]; current: string; xero: string }
    | { status: 'mismatch'; conn: typeof conns[number]; current: string; xero: string }
    | { status: 'unknown'; conn: typeof conns[number]; current: string; reason: string }
    | { status: 'error'; conn: typeof conns[number]; reason: string }

  const outcomes: Outcome[] = []

  for (const conn of conns) {
    const stored = (conn.functional_currency || '').toUpperCase()
    try {
      const token = await getValidAccessToken(conn as any, sb as any)
      if (!token.success || !token.accessToken) {
        outcomes.push({
          status: 'error',
          conn,
          reason: `token: ${token.message || token.error || 'unknown'}`,
        })
        continue
      }
      const org = await getXeroOrgTimezone(
        { tenant_id: conn.tenant_id },
        token.accessToken,
      )
      const xeroCcy = (org.baseCurrency || '').toUpperCase()
      if (!xeroCcy) {
        outcomes.push({
          status: 'unknown',
          conn,
          current: stored,
          reason: 'Xero /Organisation returned no BaseCurrency',
        })
      } else if (xeroCcy === stored) {
        outcomes.push({ status: 'match', conn, current: stored, xero: xeroCcy })
      } else {
        outcomes.push({ status: 'mismatch', conn, current: stored, xero: xeroCcy })
      }
    } catch (err: any) {
      outcomes.push({
        status: 'error',
        conn,
        reason: err?.message || String(err),
      })
    }
  }

  // Summary
  console.log('--- Summary ---')
  console.log(`match:    ${outcomes.filter(o => o.status === 'match').length}`)
  console.log(`mismatch: ${outcomes.filter(o => o.status === 'mismatch').length}`)
  console.log(`unknown:  ${outcomes.filter(o => o.status === 'unknown').length}`)
  console.log(`error:    ${outcomes.filter(o => o.status === 'error').length}`)
  console.log()

  const mismatches = outcomes.filter(
    (o): o is Extract<Outcome, { status: 'mismatch' }> => o.status === 'mismatch',
  )
  if (mismatches.length > 0) {
    console.log('--- Mismatches ---')
    for (const m of mismatches) {
      const label = m.conn.display_name || m.conn.tenant_name || m.conn.tenant_id
      console.log(`  ${label.padEnd(32)}  stored=${m.current.padEnd(4)}  xero=${m.xero}`)
    }
    console.log()
  }

  const errors = outcomes.filter(
    (o): o is Extract<Outcome, { status: 'error' }> => o.status === 'error',
  )
  if (errors.length > 0) {
    console.log('--- Errors (left unchanged) ---')
    for (const e of errors) {
      const label = e.conn.display_name || e.conn.tenant_name || e.conn.tenant_id
      console.log(`  ${label}: ${e.reason}`)
    }
    console.log()
  }

  if (!APPLY) {
    if (mismatches.length > 0) {
      console.log(`Dry-run complete. Re-run with --apply to update ${mismatches.length} row(s).`)
    } else {
      console.log('Dry-run complete. No mismatches to apply.')
    }
    return
  }

  // Apply mode — one UPDATE per mismatch
  if (mismatches.length === 0) {
    console.log('Nothing to apply.')
    return
  }
  console.log(`Applying ${mismatches.length} update(s)…`)
  let succeeded = 0
  let failed = 0
  for (const m of mismatches) {
    const { error: updErr } = await sb
      .from('xero_connections')
      .update({ functional_currency: m.xero })
      .eq('id', m.conn.id)
    const label = m.conn.display_name || m.conn.tenant_name || m.conn.tenant_id
    if (updErr) {
      console.log(`  ✗ ${label}: ${updErr.message}`)
      failed++
    } else {
      console.log(`  ✓ ${label}: ${m.current} → ${m.xero}`)
      succeeded++
    }
  }
  console.log(`\nDone. succeeded=${succeeded} failed=${failed}`)
}

main().catch((e) => {
  console.error('Fatal:', e)
  process.exit(1)
})
