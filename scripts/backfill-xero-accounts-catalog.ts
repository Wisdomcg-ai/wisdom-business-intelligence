/**
 * Phase 44.2 Plan 06A — Wave 4 backfill script.
 *
 * One-shot backfill that runs AFTER migrations 20260430000001 + 20260430000002
 * and BEFORE migration 20260430000003 (the constraint cutover).
 *
 * Responsibilities, in order:
 *
 *   1. For every active xero_connections tenant: pull /api.xro/2.0/Accounts and
 *      UPSERT into xero_accounts catalog (chart of accounts, keyed by
 *      (business_id, xero_account_id)).
 *
 *   2. Backfill xero_pl_lines.account_id from existing GUID-bearing account_code.
 *      The current account_code field already holds the AccountID GUID for ~99%
 *      of rows (this is the parser-of-record per Phase 1 investigation §2.3).
 *      For the residual ~1% where account_code is a synthetic '_SYNTH_NAME:...'
 *      slug (rows where Xero returned no AccountID in the by-month response),
 *      generate a deterministic uuid-v5 from a stable Phase-44.2-06A namespace
 *      seeded by `business_id|tenant_id|account_name`. These rows get
 *      notes='SYNTH-AID: ...' for audit-trail preservation.
 *
 *   3. Repurpose xero_pl_lines.account_code with the user-facing Xero Code
 *      (200, 300, etc.) joined from xero_accounts via account_id GUID.
 *      Rows whose account_id has no matching xero_accounts entry (e.g. the
 *      synthetic AIDs from step 2) keep their existing account_code value —
 *      the script reports the count of such rows.
 *
 *   4. Print a per-step summary so the operator can sanity-check counts.
 *
 * Idempotency: re-running the script is safe.
 *   - Step 1 is an UPSERT (no duplicates).
 *   - Step 2 only updates rows where account_id IS NULL.
 *   - Step 3 overwrites account_code unconditionally but with the same value
 *     given the same xero_accounts catalog state.
 *
 * CLI:
 *   npx tsx scripts/backfill-xero-accounts-catalog.ts [--tenant-id=<uuid>] [--dry-run]
 *
 *   --tenant-id   Process only the connection matching this xero_connections.tenant_id.
 *                 Useful for debugging a single client.
 *   --dry-run     Pull /Accounts and report what WOULD change, but do not UPSERT
 *                 or UPDATE any DB row.
 *
 * Exit codes:
 *   0 — full success across all tenants.
 *   1 — one or more tenants failed to fetch /Accounts (other tenants may have
 *       succeeded; operator decides whether to re-run partial).
 *   2 — fatal init failure (missing env, unreadable connections list).
 */
import { config } from 'dotenv'
import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { v5 as uuidv5 } from 'uuid'
import { getValidAccessToken } from '@/lib/xero/token-manager'
import { resolveBusinessIds } from '@/lib/utils/resolve-business-ids'

// Stable Phase-44.2-06A namespace for synthetic AccountID derivation.
// Generated once and frozen here so re-runs produce identical UUIDs for the
// same (business_id, tenant_id, account_name) tuple. Do NOT change this value
// — it would orphan previously-backfilled rows from a re-run.
const SYNTH_AID_NAMESPACE = '8b9f0e4a-2d3c-5e7f-9a1b-44206a100001'

// CLI-friendly UUID GUID matcher (case-insensitive, dash-bounded).
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface CliArgs {
  tenantIdFilter?: string
  dryRun: boolean
  help: boolean
}

interface XeroAccount {
  AccountID: string
  Code?: string | null
  Name?: string
  Type?: string | null
  Class?: string | null
  Status?: string | null
  TaxType?: string | null
  Description?: string | null
  BankAccountType?: string | null
}

interface PerTenantStats {
  business_id: string
  tenant_id: string
  tenant_name: string | null
  accounts_fetched: number
  accounts_upserted: number
  pl_rows_backfilled_account_id: number
  pl_rows_synth_aid: number
  pl_rows_repurposed_account_code: number
  pl_rows_account_code_unchanged: number
  error?: string
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { dryRun: false, help: false }
  for (const a of argv) {
    if (a === '--help' || a === '-h') out.help = true
    else if (a === '--dry-run') out.dryRun = true
    else if (a.startsWith('--tenant-id=')) out.tenantIdFilter = a.slice('--tenant-id='.length)
  }
  return out
}

function printHelp() {
  console.log(`Phase 44.2 06A — backfill xero_accounts catalog + populate xero_pl_lines.account_id.

Usage:
  npx tsx scripts/backfill-xero-accounts-catalog.ts [options]

Options:
  --tenant-id=<uuid>  Process only this xero_connections.tenant_id (debugging).
  --dry-run           Pull /Accounts and print counts; do not UPSERT or UPDATE.
  --help, -h          This message.

Order of operations (same in dry-run; only writes are skipped):
  1. UPSERT xero_accounts (chart of accounts) for every active tenant.
  2. Backfill xero_pl_lines.account_id from GUID-bearing account_code,
     synth-AID for non-GUID rows.
  3. UPDATE xero_pl_lines.account_code from xero_accounts via account_id join.

Pre-requisite migrations (must already be applied):
  20260430000001_xero_pl_lines_account_id_basis.sql
  20260430000002_xero_pl_lines_business_id_fk.sql

Post-requisite migrations (run AFTER this script succeeds):
  20260430000003_xero_pl_lines_natural_key_account_id.sql
  20260430000004_xero_pl_lines_wide_compat_v2.sql
`)
}

function classifyAccount(xeroType: string | null | undefined): string {
  // Same mapping as src/app/api/Xero/chart-of-accounts-full/route.ts so the
  // catalog stays consistent regardless of whether it was populated by the
  // route or this backfill.
  const t = (xeroType || '').toUpperCase()
  if (t === 'BANK') return 'ASSET'
  if (t === 'CURRENT' || t === 'FIXED' || t === 'INVENTORY' ||
      t === 'NONCURRENT' || t === 'PREPAYMENT') return 'ASSET'
  if (t === 'CURRLIAB' || t === 'LIABILITY' || t === 'TERMLIAB') return 'LIABILITY'
  if (t === 'EQUITY') return 'EQUITY'
  if (t === 'REVENUE' || t === 'OTHERINCOME' || t === 'SALES') return 'REVENUE'
  if (t === 'EXPENSE' || t === 'OVERHEADS' || t === 'DIRECTCOSTS' ||
      t === 'DEPRECIATN' || t === 'OTHEREXPENSE') return 'EXPENSE'
  return 'OTHER'
}

async function fetchAccountsForTenant(
  accessToken: string,
  tenantId: string
): Promise<XeroAccount[]> {
  const res = await fetch('https://api.xero.com/api.xro/2.0/Accounts', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'xero-tenant-id': tenantId,
      Accept: 'application/json',
    },
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Xero /Accounts returned ${res.status}: ${errText.substring(0, 500)}`)
  }
  const json = await res.json()
  return (json?.Accounts ?? []) as XeroAccount[]
}

async function upsertAccountsCatalog(
  supabase: SupabaseClient,
  businessId: string,
  tenantId: string,
  accounts: XeroAccount[],
  dryRun: boolean
): Promise<number> {
  if (accounts.length === 0) return 0
  const rows = accounts.map(a => ({
    business_id: businessId,
    tenant_id: tenantId,
    xero_account_id: a.AccountID,
    account_code: a.Code ?? null,
    account_name: a.Name ?? '',
    xero_type: a.Type ?? null,
    xero_class: classifyAccount(a.Type),
    xero_status: a.Status ?? null,
    tax_type: a.TaxType ?? null,
    description: a.Description ?? null,
    bank_account_type: a.BankAccountType ?? null,
    last_synced_at: new Date().toISOString(),
  }))

  if (dryRun) return rows.length

  // Note: xero_accounts has a UNIQUE (business_id, tenant_id, xero_account_id)
  // constraint per baseline_schema.sql. Use that as the conflict target so we
  // get true per-tenant idempotency (a single business_id with multi-tenant
  // connections is a real case for consolidated entities).
  const { error } = await supabase
    .from('xero_accounts')
    .upsert(rows, { onConflict: 'business_id,tenant_id,xero_account_id' })

  if (error) {
    throw new Error(`xero_accounts upsert failed: ${error.message}`)
  }
  return rows.length
}

/**
 * Step 2: backfill xero_pl_lines.account_id for the given (business_id, tenant_id).
 * Returns { backfilled, synth_aid }.
 */
async function backfillAccountIds(
  supabase: SupabaseClient,
  businessId: string,
  tenantId: string,
  dryRun: boolean
): Promise<{ backfilled: number; synth_aid: number }> {
  // Resolve dual-ID: xero_connections.business_id may be either businesses.id
  // (legacy) or business_profiles.id; xero_pl_lines.business_id is always
  // business_profiles.id per orchestrator convention. Search across both.
  const ids = await resolveBusinessIds(supabase as any, businessId)
  // Paginate via .range() — PostgREST caps a single SELECT at 1000 rows.
  // Tenants like Efficient Living have 1800+ rows; without pagination the
  // backfill silently skips the tail.
  const PAGE_SIZE = 1000
  const rows: Array<{ id: string; account_code: string | null; account_name: string | null }> = []
  let from = 0
  while (true) {
    const { data: pageRows, error: selectErr } = await supabase
      .from('xero_pl_lines')
      .select('id, account_code, account_name')
      .in('business_id', ids.all)
      .eq('tenant_id', tenantId)
      .is('account_id', null)
      .range(from, from + PAGE_SIZE - 1)
    if (selectErr) {
      throw new Error(`xero_pl_lines select (account_id IS NULL) failed: ${selectErr.message}`)
    }
    if (!pageRows || pageRows.length === 0) break
    rows.push(...(pageRows as any))
    if (pageRows.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  if (rows.length === 0) return { backfilled: 0, synth_aid: 0 }

  let backfilled = 0
  let synthAid = 0

  // Build per-row update payloads. We can't bulk UPDATE with mixed sources in
  // one call via supabase-js, so this iterates. Volumes are bounded by the
  // P&L history (typically <50k rows total across all tenants), so per-row
  // updates here are fine for a one-shot backfill.
  for (const row of rows) {
    const code = (row.account_code ?? '').trim()
    let accountId: string
    let synthNote: string | null = null

    if (GUID_RE.test(code)) {
      accountId = code.toLowerCase()
    } else {
      // Synthetic AID: derive deterministically from (business_id, tenant_id, account_name).
      // Including business_id and tenant_id in the seed prevents cross-tenant collision
      // if two tenants happen to have an account with the same name.
      const seed = `${businessId}|${tenantId}|${(row.account_name ?? '').trim().toLowerCase()}`
      accountId = uuidv5(seed, SYNTH_AID_NAMESPACE)
      synthNote = `SYNTH-AID: account_id derived via uuid-v5 from account_name='${row.account_name ?? ''}' because original Xero AccountID was missing in the by-month response that wrote this row. Original account_code='${code}'.`
      synthAid++
    }

    if (!dryRun) {
      const update: Record<string, unknown> = { account_id: accountId }
      if (synthNote) update.notes = synthNote
      const { error: updErr } = await supabase
        .from('xero_pl_lines')
        .update(update)
        .eq('id', row.id)
      if (updErr) {
        throw new Error(`xero_pl_lines update (id=${row.id}) failed: ${updErr.message}`)
      }
    }
    backfilled++
  }

  return { backfilled, synth_aid: synthAid }
}

/**
 * Step 3: repurpose xero_pl_lines.account_code with the user-facing Xero Code
 * from xero_accounts. Returns { repurposed, unchanged }.
 *
 * Implementation: pull the catalog into memory once for this (business_id,
 * tenant_id), then iterate xero_pl_lines rows and update only those whose
 * resolved code differs from the current account_code. This avoids touching
 * ~99% of rows on a re-run (idempotency-friendly + cheap).
 */
async function repurposeAccountCodes(
  supabase: SupabaseClient,
  businessId: string,
  tenantId: string,
  dryRun: boolean
): Promise<{ repurposed: number; unchanged: number }> {
  // Resolve dual-ID for both catalog (xero_accounts) and P&L (xero_pl_lines)
  // queries. Catalog rows are keyed by xero_connections.business_id (whichever
  // form it stores); xero_pl_lines is keyed by orchestrator's profile_id.
  const ids = await resolveBusinessIds(supabase as any, businessId)

  // 1. Catalog snapshot keyed by xero_account_id (cast lower for case safety).
  const { data: catalog, error: catErr } = await supabase
    .from('xero_accounts')
    .select('xero_account_id, account_code')
    .in('business_id', ids.all)
    .eq('tenant_id', tenantId)
  if (catErr) {
    throw new Error(`xero_accounts select for repurpose failed: ${catErr.message}`)
  }
  const lookup = new Map<string, string | null>()
  for (const r of catalog ?? []) {
    if (r.xero_account_id) {
      lookup.set(String(r.xero_account_id).toLowerCase(), r.account_code ?? null)
    }
  }

  // 2. P&L rows for this tenant (now have account_id NOT NULL post-step-2).
  // Paginate to avoid PostgREST 1000-row cap (see backfillAccountIds for context).
  const PAGE_SIZE = 1000
  const plRows: Array<{ id: string; account_id: string | null; account_code: string | null }> = []
  let from = 0
  while (true) {
    const { data: page, error: plErr } = await supabase
      .from('xero_pl_lines')
      .select('id, account_id, account_code')
      .in('business_id', ids.all)
      .eq('tenant_id', tenantId)
      .not('account_id', 'is', null)
      .range(from, from + PAGE_SIZE - 1)
    if (plErr) {
      throw new Error(`xero_pl_lines select for repurpose failed: ${plErr.message}`)
    }
    if (!page || page.length === 0) break
    plRows.push(...(page as any))
    if (page.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  let repurposed = 0
  let unchanged = 0
  for (const row of plRows) {
    const aidKey = String(row.account_id).toLowerCase()
    const targetCode = lookup.get(aidKey)
    if (targetCode === undefined) {
      // No matching catalog row (e.g. SYNTH-AID rows) — leave as-is.
      unchanged++
      continue
    }
    const current = row.account_code ?? null
    if (current === targetCode) {
      unchanged++
      continue
    }
    if (!dryRun) {
      const { error: updErr } = await supabase
        .from('xero_pl_lines')
        .update({ account_code: targetCode })
        .eq('id', row.id)
      if (updErr) {
        throw new Error(`xero_pl_lines account_code update (id=${row.id}) failed: ${updErr.message}`)
      }
    }
    repurposed++
  }

  return { repurposed, unchanged }
}

async function processConnection(
  supabase: SupabaseClient,
  connection: {
    id: string
    business_id: string
    tenant_id: string
    tenant_name: string | null
  },
  dryRun: boolean
): Promise<PerTenantStats> {
  const stats: PerTenantStats = {
    business_id: connection.business_id,
    tenant_id: connection.tenant_id,
    tenant_name: connection.tenant_name,
    accounts_fetched: 0,
    accounts_upserted: 0,
    pl_rows_backfilled_account_id: 0,
    pl_rows_synth_aid: 0,
    pl_rows_repurposed_account_code: 0,
    pl_rows_account_code_unchanged: 0,
  }

  console.log(`\n[backfill] Tenant: ${connection.tenant_name ?? '(unnamed)'} (${connection.tenant_id})`)
  console.log(`[backfill]   business_id=${connection.business_id} connection.id=${connection.id}`)

  // Step 1: token + /Accounts.
  const tokenResult = await getValidAccessToken({ id: connection.id }, supabase as any)
  if (!tokenResult.success || !tokenResult.accessToken) {
    stats.error = `token refresh failed: ${tokenResult.error ?? tokenResult.message ?? 'unknown'}`
    console.error(`[backfill]   ERROR: ${stats.error}`)
    return stats
  }

  let accounts: XeroAccount[]
  try {
    accounts = await fetchAccountsForTenant(tokenResult.accessToken, connection.tenant_id)
  } catch (err) {
    stats.error = err instanceof Error ? err.message : String(err)
    console.error(`[backfill]   ERROR fetching /Accounts: ${stats.error}`)
    return stats
  }
  stats.accounts_fetched = accounts.length
  console.log(`[backfill]   /Accounts returned ${accounts.length} accounts`)

  // Step 2: upsert catalog.
  try {
    stats.accounts_upserted = await upsertAccountsCatalog(
      supabase,
      connection.business_id,
      connection.tenant_id,
      accounts,
      dryRun
    )
    console.log(`[backfill]   xero_accounts upsert${dryRun ? ' (dry-run)' : ''}: ${stats.accounts_upserted} rows`)
  } catch (err) {
    stats.error = err instanceof Error ? err.message : String(err)
    console.error(`[backfill]   ERROR upserting xero_accounts: ${stats.error}`)
    return stats
  }

  // Step 3: backfill account_id on xero_pl_lines.
  try {
    const r = await backfillAccountIds(supabase, connection.business_id, connection.tenant_id, dryRun)
    stats.pl_rows_backfilled_account_id = r.backfilled
    stats.pl_rows_synth_aid = r.synth_aid
    console.log(`[backfill]   xero_pl_lines.account_id backfill${dryRun ? ' (dry-run)' : ''}: ${r.backfilled} rows updated, ${r.synth_aid} synth-AID generated`)
  } catch (err) {
    stats.error = err instanceof Error ? err.message : String(err)
    console.error(`[backfill]   ERROR backfilling account_id: ${stats.error}`)
    return stats
  }

  // Step 4: repurpose account_code from catalog.
  try {
    const r = await repurposeAccountCodes(supabase, connection.business_id, connection.tenant_id, dryRun)
    stats.pl_rows_repurposed_account_code = r.repurposed
    stats.pl_rows_account_code_unchanged = r.unchanged
    console.log(`[backfill]   xero_pl_lines.account_code repurpose${dryRun ? ' (dry-run)' : ''}: ${r.repurposed} rows updated, ${r.unchanged} unchanged`)
  } catch (err) {
    stats.error = err instanceof Error ? err.message : String(err)
    console.error(`[backfill]   ERROR repurposing account_code: ${stats.error}`)
    return stats
  }

  return stats
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printHelp()
    process.exit(0)
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('[backfill] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY in .env.local')
    process.exit(2)
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  console.log(`[backfill] Phase 44.2 06A — xero_accounts catalog + xero_pl_lines.account_id backfill`)
  console.log(`[backfill] Mode: ${args.dryRun ? 'DRY-RUN (no writes)' : 'LIVE'}`)
  if (args.tenantIdFilter) {
    console.log(`[backfill] Filter: tenant_id=${args.tenantIdFilter}`)
  }

  // Load active connections.
  let q = supabase
    .from('xero_connections')
    .select('id, business_id, tenant_id, tenant_name, is_active')
    .order('updated_at', { ascending: false })
  if (args.tenantIdFilter) {
    q = q.eq('tenant_id', args.tenantIdFilter)
  }
  const { data: connections, error: connErr } = await q
  if (connErr) {
    console.error('[backfill] Failed to load xero_connections:', connErr.message)
    process.exit(2)
  }
  if (!connections || connections.length === 0) {
    console.error('[backfill] No active xero_connections found' + (args.tenantIdFilter ? ` for tenant_id=${args.tenantIdFilter}` : ''))
    process.exit(2)
  }
  console.log(`[backfill] Found ${connections.length} active connection(s)`)

  // Per-connection processing.
  const allStats: PerTenantStats[] = []
  let anyError = false
  for (const c of connections) {
    const s = await processConnection(supabase, c, args.dryRun)
    allStats.push(s)
    if (s.error) anyError = true
    // Polite delay between tenants to stay clear of Xero rate limits.
    await new Promise(r => setTimeout(r, 300))
  }

  // Orphan sweep — handle xero_pl_lines rows that have no matching xero_connections
  // entry at all. Pre-multi-tenant data with empty tenant_id falls into this bucket.
  // We can't pull /Accounts for these (no token), but we can still assign synthetic
  // uuid-v5 account_ids so migration 000003's NOT NULL constraint can land.
  console.log('\n[backfill] Orphan sweep — rows with account_id IS NULL and no matching xero_connections')
  const PAGE_SIZE = 1000
  let orphanRows: Array<{ id: string; business_id: string; tenant_id: string | null; account_code: string | null; account_name: string | null }> = []
  let from = 0
  while (true) {
    const { data: page, error: orphErr } = await supabase
      .from('xero_pl_lines')
      .select('id, business_id, tenant_id, account_code, account_name')
      .is('account_id', null)
      .range(from, from + PAGE_SIZE - 1)
    if (orphErr) {
      console.error('[backfill]   orphan sweep select failed:', orphErr.message)
      break
    }
    if (!page || page.length === 0) break
    orphanRows.push(...(page as any))
    if (page.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  console.log(`[backfill]   orphan sweep found ${orphanRows.length} row(s) with NULL account_id`)
  let orphanFixed = 0
  for (const row of orphanRows) {
    const code = (row.account_code ?? '').trim()
    let accountId: string
    let synthNote: string | null = null
    if (GUID_RE.test(code)) {
      accountId = code.toLowerCase()
    } else {
      const seed = `${row.business_id}|${row.tenant_id ?? ''}|${(row.account_name ?? '').trim().toLowerCase()}`
      accountId = uuidv5(seed, SYNTH_AID_NAMESPACE)
      synthNote = `SYNTH-AID: orphan-tenant cleanup, no xero_connections row at backfill time. Original account_code='${code}'.`
    }
    if (!args.dryRun) {
      const update: Record<string, unknown> = { account_id: accountId }
      if (synthNote) update.notes = synthNote
      const { error: updErr } = await supabase
        .from('xero_pl_lines')
        .update(update)
        .eq('id', row.id)
      if (updErr) {
        console.error(`[backfill]   orphan update failed for id=${row.id}: ${updErr.message}`)
        continue
      }
    }
    orphanFixed++
  }
  console.log(`[backfill]   orphan sweep ${args.dryRun ? '(dry-run) would update' : 'updated'}: ${orphanFixed}`)

  // Summary table.
  console.log('\n=== BACKFILL SUMMARY ===')
  const totals = {
    tenants: allStats.length,
    tenants_failed: allStats.filter(s => !!s.error).length,
    accounts_fetched: 0,
    accounts_upserted: 0,
    pl_rows_backfilled_account_id: 0,
    pl_rows_synth_aid: 0,
    pl_rows_repurposed_account_code: 0,
    pl_rows_account_code_unchanged: 0,
  }
  for (const s of allStats) {
    totals.accounts_fetched += s.accounts_fetched
    totals.accounts_upserted += s.accounts_upserted
    totals.pl_rows_backfilled_account_id += s.pl_rows_backfilled_account_id
    totals.pl_rows_synth_aid += s.pl_rows_synth_aid
    totals.pl_rows_repurposed_account_code += s.pl_rows_repurposed_account_code
    totals.pl_rows_account_code_unchanged += s.pl_rows_account_code_unchanged
    const flag = s.error ? 'FAIL' : 'ok'
    console.log(
      `  [${flag}] ${(s.tenant_name ?? '(unnamed)').padEnd(30)} ` +
      `accts=${s.accounts_fetched} upsert=${s.accounts_upserted} ` +
      `aid_backfilled=${s.pl_rows_backfilled_account_id} synth=${s.pl_rows_synth_aid} ` +
      `code_repurposed=${s.pl_rows_repurposed_account_code} unchanged=${s.pl_rows_account_code_unchanged}` +
      (s.error ? ` ERROR=${s.error}` : '')
    )
  }
  console.log('')
  console.log(`Tenants processed:                 ${totals.tenants}`)
  console.log(`Tenants failed:                    ${totals.tenants_failed}`)
  console.log(`Accounts fetched (total):          ${totals.accounts_fetched}`)
  console.log(`Accounts upserted to catalog:      ${totals.accounts_upserted}`)
  console.log(`xero_pl_lines.account_id backfill: ${totals.pl_rows_backfilled_account_id}`)
  console.log(`  of which synth-AID:              ${totals.pl_rows_synth_aid}`)
  console.log(`xero_pl_lines.account_code repurp: ${totals.pl_rows_repurposed_account_code}`)
  console.log(`xero_pl_lines.account_code unchang: ${totals.pl_rows_account_code_unchanged}`)
  console.log('')
  if (args.dryRun) {
    console.log('DRY-RUN: no DB writes performed. Re-run without --dry-run to apply.')
  } else {
    console.log('Backfill complete. Next step: apply migration 20260430000003.')
  }

  if (anyError) {
    console.error('\n[backfill] One or more tenants failed. Review errors above and re-run if appropriate.')
    process.exit(1)
  }
  process.exit(0)
}

main().catch(err => {
  console.error('[backfill] Unhandled error:', err)
  process.exit(2)
})
