#!/usr/bin/env tsx
/**
 * Phase 70 Plan 04 — A3: subscription_budgets.renewal_month backfill (cross-client).
 *
 * Populates `renewal_month` (1-12) for every `subscription_budgets` row where
 *   `frequency = 'annual' AND renewal_month IS NULL AND is_active = true`
 * by inferring the calendar month from the most recent matching Xero
 * BankTransaction (Type=SPEND) in the last 24 months.
 *
 * Vendor matching uses the SAME `createVendorKey` + `extractVendorName`
 * normalization as `src/app/api/monthly-report/subscription-detail/route.ts`
 * (imported directly — never reimplemented; the next-phase code-fixes B2
 * consolidation depends on this).
 *
 * MODES:
 *   npx tsx scripts/70-04-A3-subscription-renewal-month-backfill.ts
 *       → DRY RUN (default). Prints per-row MATCH / UNRES preview; no writes.
 *   npx tsx scripts/70-04-A3-subscription-renewal-month-backfill.ts --apply
 *       → APPLY MODE. Writes renewal_month for MATCH rows. UNRES rows are
 *         left NULL and dumped to
 *         `.planning/phases/70-.../70-04-unresolved-renewals.json`
 *         for the --enter-manual pass.
 *   npx tsx scripts/70-04-A3-subscription-renewal-month-backfill.ts --enter-manual
 *       → INTERACTIVE MANUAL ENTRY. Reads the unresolved JSON written by
 *         --apply, prompts stdin for each row, writes the user-entered values
 *         via the same UPDATE. Empty input or "skip" leaves the row NULL.
 *   npx tsx scripts/70-04-A3-subscription-renewal-month-backfill.ts --skip-xero
 *       → Skip Xero API calls entirely. Useful for testing the SQL side
 *         without consuming Xero API quota — every row falls into UNRES
 *         "(skip-xero mode)".
 *
 * Flags combine — `--apply --skip-xero` is valid but will only ever write
 * zero rows (because no MATCHes are produced); it's mainly useful to verify
 * the unresolved-list output path.
 *
 * IMPORTANT INVARIANTS (do NOT relax without re-reading 70-04-PLAN.md):
 *   - `renewal_month` already set: NEVER touched, even if our Xero analysis
 *     would propose a different month. Matt's existing values win.
 *   - `is_active = false`: out of scope. Skip.
 *   - `frequency != 'annual'`: monthly subs have no renewal_month concept.
 *   - 0 rows are ever deleted.
 *   - Idempotent: re-running APPLY after a successful pass produces 0 writes.
 *   - Xero token errors (401/expired) are SKIPPED, not crashed — rows are
 *     marked as "unresolved (token error)" so Phase 69 cron health gate (70-09)
 *     can be triaged independently.
 *
 * Run:
 *   npx tsx scripts/70-04-A3-subscription-renewal-month-backfill.ts
 *   npx tsx scripts/70-04-A3-subscription-renewal-month-backfill.ts --apply
 *   npx tsx scripts/70-04-A3-subscription-renewal-month-backfill.ts --enter-manual
 */

import { config } from 'dotenv'
import path from 'path'
import fs from 'fs'
import readline from 'readline'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

config({ path: path.resolve(process.cwd(), '.env.local') })
config({ path: path.resolve(process.cwd(), '.env') })

import { createVendorKey, extractVendorName } from '@/lib/utils/vendor-normalization'
import { getValidAccessToken } from '@/lib/xero/token-manager'

// ── Env & APPLY flag ────────────────────────────────────────────────────────
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
if (!URL || !KEY) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local')
}

const APPLY = process.argv.includes('--apply')
const SKIP_XERO = process.argv.includes('--skip-xero')
const ENTER_MANUAL = process.argv.includes('--enter-manual')

const PHASE_DIR = '.planning/phases/70-production-data-backfill-migration-debt-cleanup-for-month-end-reporting-clients'
const UNRESOLVED_PATH = path.resolve(process.cwd(), PHASE_DIR, '70-04-unresolved-renewals.json')

// ── Color helpers (ANSI) ────────────────────────────────────────────────────
const C = {
  red:    (s: string) => `\x1b[31m${s}\x1b[0m`,
  green:  (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan:   (s: string) => `\x1b[36m${s}\x1b[0m`,
  bold:   (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim:    (s: string) => `\x1b[2m${s}\x1b[0m`,
}

// ── Types ───────────────────────────────────────────────────────────────────
interface SubscriptionRow {
  id: string
  business_id: string
  vendor_name: string
  frequency: string
  monthly_budget: number | null
  annual_budget: number | null
  is_active: boolean
  renewal_month: number | null
}

interface XeroBankTxn {
  Contact?: { Name?: string }
  Reference?: string
  Date?: string  // Xero "/Date(1234567890+0000)/" or ISO
  LineItems?: Array<{ Description?: string; AccountCode?: string; LineAmount?: number }>
  Total?: number
}

interface PerRowResult {
  row: SubscriptionRow
  business_name: string
  tenant_id?: string
  status: 'MATCH' | 'UNRES_NO_TX' | 'UNRES_TOKEN' | 'UNRES_NO_CONNECTION' | 'UNRES_SKIP_XERO'
  inferred_month?: number
  matched_tx_date?: string
  matched_tx_amount?: number
  matched_tx_contact?: string
  unresolved_reason?: string
}

interface UnresolvedEntry {
  subscription_id: string
  business_id: string
  business_name: string
  vendor_name: string
  frequency: string
  monthly_budget: number | null
  annual_budget: number | null
  reason: string
}

// ── Supabase service-role client ────────────────────────────────────────────
const supabase: SupabaseClient = createClient(URL, KEY)

// ── Xero Date parser ────────────────────────────────────────────────────────
/**
 * Xero returns dates as either "/Date(1234567890000+0000)/" OR ISO strings
 * depending on endpoint version. Handle both. Returns null on garbage input.
 */
function parseXeroDate(xeroDate: string | undefined): Date | null {
  if (!xeroDate) return null
  // Microsoft JSON date format: /Date(1234567890000+0000)/ or /Date(1234567890000)/
  const msMatch = String(xeroDate).match(/\/Date\((-?\d+)/)
  if (msMatch) {
    const ms = Number(msMatch[1])
    if (Number.isFinite(ms)) return new Date(ms)
    return null
  }
  // ISO fallback
  const d = new Date(xeroDate)
  if (Number.isFinite(d.getTime())) return d
  return null
}

// ── Xero BankTransactions fetch with pagination ─────────────────────────────
async function fetchAllBankTransactions(
  accessToken: string,
  tenantId: string,
  sinceDate: Date,
): Promise<XeroBankTxn[]> {
  const all: XeroBankTxn[] = []
  // Xero `where` clause for SPEND-only transactions since the given date.
  const where = `Type=="SPEND" AND Date >= DateTime(${sinceDate.getUTCFullYear()},${sinceDate.getUTCMonth() + 1},${sinceDate.getUTCDate()})`
  let page = 1
  const MAX_PAGES = 50  // safety cap (100 per page → 5000 tx ceiling)

  while (page <= MAX_PAGES) {
    const url = `https://api.xero.com/api.xro/2.0/BankTransactions?where=${encodeURIComponent(where)}&page=${page}`
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'xero-tenant-id': tenantId,
        Accept: 'application/json',
      },
    })

    if (res.status === 429) {
      // Rate-limited — wait 10s and retry same page
      await new Promise((r) => setTimeout(r, 10_000))
      continue
    }
    if (res.status === 401 || res.status === 403) {
      // Authentication failure — let caller handle via thrown error
      const body = await res.text()
      const err = new Error(`Xero auth error (status ${res.status}): ${body.slice(0, 200)}`)
      ;(err as any).xeroAuthError = true
      throw err
    }
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Xero BankTransactions fetch failed (status ${res.status}): ${body.slice(0, 200)}`)
    }

    const data = await res.json()
    const items: XeroBankTxn[] = data.BankTransactions || []
    all.push(...items)
    if (items.length < 100) break  // last page
    page++
    // brief throttle between pages
    await new Promise((r) => setTimeout(r, 300))
  }

  return all
}

// ── Match a subscription_budgets row against a tenant's cached transactions ─
function matchVendorToTxns(
  vendorName: string,
  txns: XeroBankTxn[],
): { tx: XeroBankTxn; date: Date } | null {
  const targetKey = createVendorKey(vendorName)
  if (!targetKey) return null

  let bestTx: XeroBankTxn | null = null
  let bestDate: Date | null = null

  for (const tx of txns) {
    const contactName = tx.Contact?.Name || ''
    // Compute the candidate vendor name via the SAME route logic — for each
    // line item if present (so we honor PayPal/Stripe intermediary unwrapping).
    const lineItems = tx.LineItems || []
    const candidates: string[] = []
    if (lineItems.length > 0) {
      for (const li of lineItems) {
        const candidate = extractVendorName(contactName, li.Description || tx.Reference || '')
        if (candidate) candidates.push(candidate)
      }
    } else {
      candidates.push(extractVendorName(contactName, tx.Reference || ''))
    }

    let matched = false
    for (const cand of candidates) {
      if (createVendorKey(cand) === targetKey) {
        matched = true
        break
      }
    }
    if (!matched) continue

    const txDate = parseXeroDate(tx.Date)
    if (!txDate) continue

    if (!bestDate || txDate > bestDate) {
      bestDate = txDate
      bestTx = tx
    }
  }

  if (!bestTx || !bestDate) return null
  return { tx: bestTx, date: bestDate }
}

// ── Per-row UPDATE ─────────────────────────────────────────────────────────
async function writeRenewalMonth(rowId: string, renewalMonth: number): Promise<void> {
  const { error } = await supabase
    .from('subscription_budgets')
    .update({
      renewal_month: renewalMonth,
      updated_at: new Date().toISOString(),
    })
    .eq('id', rowId)
  if (error) {
    throw new Error(`UPDATE subscription_budgets ${rowId} → ${error.message}`)
  }
}

// ── ────────────────────────────────────────────────────────────────────────
// ── INTERACTIVE MANUAL-ENTRY MODE ──────────────────────────────────────────
// ── ────────────────────────────────────────────────────────────────────────
async function runEnterManual(): Promise<void> {
  console.log('='.repeat(72))
  console.log(C.bold('Phase 70 Plan 04 — A3 Renewal-Month MANUAL ENTRY'))
  console.log('='.repeat(72))

  if (!fs.existsSync(UNRESOLVED_PATH)) {
    console.error(C.red(`✗ No unresolved file at ${UNRESOLVED_PATH}`))
    console.error(C.dim('  Run --apply first to generate the seed file.'))
    process.exit(1)
  }

  const raw = fs.readFileSync(UNRESOLVED_PATH, 'utf-8')
  const entries: UnresolvedEntry[] = JSON.parse(raw)
  if (!Array.isArray(entries) || entries.length === 0) {
    console.log(C.green('✓ No unresolved rows. Nothing to enter.'))
    return
  }

  console.log(`Found ${entries.length} unresolved row(s). For each, enter renewal_month 1-12 or "skip".`)
  console.log(C.dim('(Empty input = skip.)'))
  console.log('')

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const ask = (q: string): Promise<string> =>
    new Promise((resolve) => rl.question(q, (a) => resolve(a)))

  let written = 0
  let skipped = 0
  const failures: Array<{ id: string; vendor: string; error: string }> = []
  const remaining: UnresolvedEntry[] = []

  for (const e of entries) {
    const cost = e.annual_budget != null
      ? `$${Number(e.annual_budget).toFixed(0)}/yr`
      : (e.monthly_budget != null ? `$${Number(e.monthly_budget).toFixed(0)}/mo` : 'no budget set')
    const reason = e.reason ? ` [${e.reason}]` : ''
    const ans = (await ask(`${e.business_name} / "${e.vendor_name}" (${e.frequency}, ${cost})${reason} — renewal_month (1-12, or "skip"): `)).trim()

    if (!ans || ans.toLowerCase() === 'skip') {
      console.log(C.dim(`  · skipped (left NULL)`))
      skipped++
      remaining.push(e)
      continue
    }

    const m = Number(ans)
    if (!Number.isInteger(m) || m < 1 || m > 12) {
      console.log(C.red(`  ✗ "${ans}" is not a valid month (1-12). Skipping.`))
      skipped++
      remaining.push(e)
      continue
    }

    try {
      await writeRenewalMonth(e.subscription_id, m)
      console.log(C.green(`  ✓ wrote renewal_month=${m}`))
      written++
    } catch (err: any) {
      console.log(C.red(`  ✗ FAILED: ${err.message}`))
      failures.push({ id: e.subscription_id, vendor: e.vendor_name, error: err.message })
      remaining.push(e)
    }
  }

  rl.close()

  // Re-write the unresolved file so a future --enter-manual pass only sees
  // the rows that are STILL unresolved (i.e. Matt's "skip" answers).
  fs.writeFileSync(UNRESOLVED_PATH, JSON.stringify(remaining, null, 2))

  console.log('')
  console.log('='.repeat(72))
  console.log(C.bold('Manual entry summary'))
  console.log('='.repeat(72))
  console.log(`Rows written: ${written}`)
  console.log(`Rows skipped (left NULL): ${skipped}`)
  console.log(`Failures: ${failures.length}`)
  if (failures.length > 0) {
    for (const f of failures) {
      console.log(C.red(`  - "${f.vendor}" (${f.id}): ${f.error}`))
    }
    process.exit(1)
  }
}

// ── ────────────────────────────────────────────────────────────────────────
// ── MAIN BACKFILL FLOW (DRY-RUN + --APPLY) ─────────────────────────────────
// ── ────────────────────────────────────────────────────────────────────────
async function runBackfill(): Promise<void> {
  console.log('='.repeat(72))
  console.log(C.bold('Phase 70 Plan 04 — A3 Subscription Renewal-Month Backfill'))
  console.log('='.repeat(72))
  if (APPLY) {
    console.log(C.red(C.bold('APPLY MODE — writes will commit to production Supabase')))
  } else {
    console.log(C.yellow(C.bold('DRY RUN — preview only, no writes (re-run with --apply to commit)')))
  }
  if (SKIP_XERO) {
    console.log(C.yellow('--skip-xero — Xero API calls bypassed; every row will UNRES'))
  }
  console.log(`URL: ${URL}`)
  console.log(`Started: ${new Date().toISOString()}`)
  console.log('')

  // ── (1) Fetch all candidate subscription_budgets rows ─────────────────────
  console.log(C.dim('── Fetching annual NULL-renewal_month subscription_budgets ──'))
  const { data: rowsRaw, error: rowsErr } = await supabase
    .from('subscription_budgets')
    .select('id, business_id, vendor_name, frequency, monthly_budget, annual_budget, is_active, renewal_month')
    .eq('frequency', 'annual')
    .eq('is_active', true)
    .is('renewal_month', null)

  if (rowsErr) {
    throw new Error(`Fetch subscription_budgets → ${rowsErr.message}`)
  }
  const rows: SubscriptionRow[] = (rowsRaw || []) as SubscriptionRow[]
  console.log(`  candidate rows: ${rows.length}  (frequency=annual AND is_active=true AND renewal_month IS NULL)`)
  if (rows.length === 0) {
    console.log(C.green('✓ Nothing to backfill — every annual+active row already has renewal_month set.'))
    console.log('')
    console.log('Summary')
    console.log('Resolved: 0 / 0   Unresolved: 0 / 0')
    return
  }

  // ── (2) Group rows by business_id for tenant-batched Xero fetches ─────────
  const byBusiness = new Map<string, SubscriptionRow[]>()
  for (const r of rows) {
    if (!byBusiness.has(r.business_id)) byBusiness.set(r.business_id, [])
    byBusiness.get(r.business_id)!.push(r)
  }

  // ── (3) Resolve business names for display ────────────────────────────────
  const businessIds = Array.from(byBusiness.keys())
  const { data: bizs } = await supabase
    .from('businesses')
    .select('id, name')
    .in('id', businessIds)
  const bizNameById = new Map<string, string>((bizs || []).map((b: any) => [b.id, b.name]))

  // ── (4) Per-business processing ───────────────────────────────────────────
  const allResults: PerRowResult[] = []
  const twoYearsAgo = new Date()
  twoYearsAgo.setUTCFullYear(twoYearsAgo.getUTCFullYear() - 2)

  for (const [businessId, businessRows] of byBusiness) {
    const businessName = bizNameById.get(businessId) || '(unknown)'
    console.log('')
    console.log(C.cyan('═'.repeat(70)))
    console.log(C.bold(`business="${businessName}" (bid=${businessId})`))
    console.log(`  rows to resolve: ${businessRows.length}`)

    // Fetch xero_connections for this business.
    const { data: connRaw, error: connErr } = await supabase
      .from('xero_connections')
      .select('id, business_id, tenant_id, tenant_name, is_active, expires_at')
      .eq('business_id', businessId)
      .eq('is_active', true)

    if (connErr) {
      console.log(C.red(`  ✗ Failed to fetch xero_connections: ${connErr.message}`))
      for (const r of businessRows) {
        allResults.push({
          row: r,
          business_name: businessName,
          status: 'UNRES_NO_CONNECTION',
          unresolved_reason: `connection fetch error: ${connErr.message}`,
        })
      }
      continue
    }

    const connections = (connRaw || []) as Array<{
      id: string
      business_id: string
      tenant_id: string
      tenant_name?: string
      is_active: boolean
      expires_at: string
    }>

    if (connections.length === 0) {
      console.log(C.yellow(`  ⚠ no active xero_connections — all ${businessRows.length} rows UNRES (no connection)`))
      for (const r of businessRows) {
        allResults.push({
          row: r,
          business_name: businessName,
          status: 'UNRES_NO_CONNECTION',
          unresolved_reason: 'no active xero_connections row',
        })
      }
      continue
    }

    if (SKIP_XERO) {
      console.log(C.dim(`  · --skip-xero: not querying Xero`))
      for (const r of businessRows) {
        allResults.push({
          row: r,
          business_name: businessName,
          status: 'UNRES_SKIP_XERO',
          unresolved_reason: '--skip-xero mode',
        })
      }
      continue
    }

    // ── Build the per-tenant cached transaction list ─────────────────────
    const txnsByTenant = new Map<string, XeroBankTxn[]>()
    for (const conn of connections) {
      const tenantLabel = conn.tenant_name || conn.tenant_id
      console.log(C.dim(`  · fetching Xero bank transactions for tenant="${tenantLabel}" (tid=${conn.tenant_id})`))

      // Acquire valid token via centralized manager (Phase 53 invariant).
      let tokenResult: Awaited<ReturnType<typeof getValidAccessToken>>
      try {
        tokenResult = await getValidAccessToken({ id: conn.id }, supabase)
      } catch (tokenErr: any) {
        console.log(C.red(`    ✗ Xero token unavailable for ${tenantLabel} — ${tokenErr.message} — skipping tenant`))
        // mark all rows from THIS business as token-error (but a sibling tenant
        // might succeed; we'll only flip per-row to UNRES_TOKEN if NO tenant resolved them)
        continue
      }
      if (!tokenResult.success || !tokenResult.accessToken) {
        console.log(C.red(`    ✗ Xero token unavailable for ${tenantLabel} — ${tokenResult.message || tokenResult.error || 'unknown'} — skipping tenant`))
        continue
      }

      try {
        const txns = await fetchAllBankTransactions(tokenResult.accessToken, conn.tenant_id, twoYearsAgo)
        console.log(C.dim(`    fetched ${txns.length} SPEND tx in last 24mo`))
        txnsByTenant.set(conn.tenant_id, txns)
      } catch (fetchErr: any) {
        if (fetchErr.xeroAuthError) {
          console.log(C.red(`    ✗ Xero auth error for ${tenantLabel} — ${fetchErr.message} — skipping tenant (Phase 69 cron health gate)`))
        } else {
          console.log(C.red(`    ✗ Xero fetch error for ${tenantLabel} — ${fetchErr.message} — skipping tenant`))
        }
        // skip this tenant — no txns cached
      }
    }

    if (txnsByTenant.size === 0) {
      // every tenant failed
      console.log(C.red(`  ✗ all tenants failed to return transactions — UNRES (token error) for all ${businessRows.length} rows`))
      for (const r of businessRows) {
        allResults.push({
          row: r,
          business_name: businessName,
          status: 'UNRES_TOKEN',
          unresolved_reason: 'all tenants returned token/fetch errors (see Phase 69 cron health)',
        })
      }
      continue
    }

    // ── Per-row match across the union of all cached tenants ─────────────
    for (const r of businessRows) {
      let best: { tx: XeroBankTxn; date: Date; tenantId: string } | null = null
      for (const [tenantId, txns] of txnsByTenant) {
        const m = matchVendorToTxns(r.vendor_name, txns)
        if (m) {
          if (!best || m.date > best.date) {
            best = { tx: m.tx, date: m.date, tenantId }
          }
        }
      }

      if (best) {
        const inferredMonth = best.date.getUTCMonth() + 1
        const amt = best.tx.LineItems?.reduce((s, li) => s + (li.LineAmount || 0), 0) || best.tx.Total || 0
        const dateStr = best.date.toISOString().slice(0, 10)
        console.log(C.green(`  ✓ MATCH    vendor="${r.vendor_name}"  →  renewal_month=${inferredMonth}  (matched tx ${dateStr} $${amt.toFixed(2)})`))
        allResults.push({
          row: r,
          business_name: businessName,
          tenant_id: best.tenantId,
          status: 'MATCH',
          inferred_month: inferredMonth,
          matched_tx_date: dateStr,
          matched_tx_amount: amt,
          matched_tx_contact: best.tx.Contact?.Name || '',
        })
      } else {
        console.log(C.yellow(`  ⚠ UNRES    vendor="${r.vendor_name}"  →  no Xero tx in last 24mo (needs manual entry)`))
        allResults.push({
          row: r,
          business_name: businessName,
          status: 'UNRES_NO_TX',
          unresolved_reason: 'no Xero SPEND transactions matched in last 24mo',
        })
      }
    }

    const resolvedHere = allResults.filter((x) => x.row.business_id === businessId && x.status === 'MATCH').length
    const unresHere    = allResults.filter((x) => x.row.business_id === businessId && x.status !== 'MATCH').length
    console.log(C.dim(`  Resolved: ${resolvedHere} / ${businessRows.length}   Unresolved: ${unresHere} / ${businessRows.length}`))
  }

  // ── (5) APPLY pass: write MATCH rows; persist UNRES list to JSON ──────────
  console.log('')
  console.log('═'.repeat(72))
  console.log(C.bold('Apply pass'))
  console.log('═'.repeat(72))

  const matches = allResults.filter((r) => r.status === 'MATCH')
  const unresolved = allResults.filter((r) => r.status !== 'MATCH')

  let written = 0
  const failures: Array<{ id: string; vendor: string; error: string }> = []

  if (APPLY) {
    for (const m of matches) {
      try {
        await writeRenewalMonth(m.row.id, m.inferred_month!)
        written++
        console.log(C.green(`  ✓ UPDATED  ${m.business_name} / "${m.row.vendor_name}"  →  renewal_month=${m.inferred_month}`))
      } catch (err: any) {
        console.log(C.red(`  ✗ FAILED   ${m.business_name} / "${m.row.vendor_name}": ${err.message}`))
        failures.push({ id: m.row.id, vendor: m.row.vendor_name, error: err.message })
      }
    }

    // Persist unresolved seed file for --enter-manual
    const unresolvedEntries: UnresolvedEntry[] = unresolved.map((u) => ({
      subscription_id: u.row.id,
      business_id: u.row.business_id,
      business_name: u.business_name,
      vendor_name: u.row.vendor_name,
      frequency: u.row.frequency,
      monthly_budget: u.row.monthly_budget,
      annual_budget: u.row.annual_budget,
      reason: u.unresolved_reason || '',
    }))

    fs.mkdirSync(path.dirname(UNRESOLVED_PATH), { recursive: true })
    fs.writeFileSync(UNRESOLVED_PATH, JSON.stringify(unresolvedEntries, null, 2))
    console.log('')
    console.log(C.dim(`Wrote ${unresolvedEntries.length} unresolved row(s) → ${UNRESOLVED_PATH}`))
    console.log(C.dim(`Run --enter-manual to enter values interactively.`))
  } else {
    console.log(C.yellow(`  (DRY RUN — no writes; re-run with --apply to commit ${matches.length} MATCH rows)`))
  }

  // ── (6) Final summary ─────────────────────────────────────────────────────
  console.log('')
  console.log('═'.repeat(72))
  console.log(C.bold('Summary'))
  console.log('═'.repeat(72))
  console.log(`Resolved: ${matches.length} / ${rows.length}   Unresolved: ${unresolved.length} / ${rows.length}`)
  if (APPLY) {
    console.log(`Rows UPDATED: ${written}`)
    console.log(`Failures: ${failures.length}`)
    if (failures.length > 0) {
      for (const f of failures) {
        console.log(C.red(`  - "${f.vendor}" (${f.id}): ${f.error}`))
      }
    }
  }

  // Per-business breakdown
  console.log('')
  console.log(C.dim('Per-business breakdown:'))
  for (const [bid, bizRows] of byBusiness) {
    const bizName = bizNameById.get(bid) || '(unknown)'
    const matchCount = allResults.filter((x) => x.row.business_id === bid && x.status === 'MATCH').length
    const unresCount = allResults.filter((x) => x.row.business_id === bid && x.status !== 'MATCH').length
    console.log(C.dim(`  ${bizName}: ${matchCount} match / ${unresCount} unres / ${bizRows.length} total`))
  }

  // Unresolved breakdown by reason category
  console.log('')
  console.log(C.dim('Unresolved by reason:'))
  const reasonCounts = new Map<string, number>()
  for (const u of unresolved) {
    reasonCounts.set(u.status, (reasonCounts.get(u.status) || 0) + 1)
  }
  for (const [reason, count] of reasonCounts) {
    console.log(C.dim(`  ${reason}: ${count}`))
  }

  console.log('')
  console.log(`Finished: ${new Date().toISOString()}`)

  if (APPLY && failures.length > 0) {
    console.error(C.red(C.bold(`✗ APPLY completed with ${failures.length} failure(s). Re-run dry-run to inspect.`)))
    process.exit(1)
  }

  if (APPLY) {
    console.log(C.green(C.bold(`✓ APPLY complete. Re-run without flags to verify idempotency ("Resolved: 0 / N" where N is remaining unresolved).`)))
    console.log(C.dim(`Next: npx tsx scripts/70-04-A3-subscription-renewal-month-backfill.ts --enter-manual`))
  }
}

// ── Entry point ─────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  if (ENTER_MANUAL) {
    await runEnterManual()
  } else {
    await runBackfill()
  }
}

main().catch((err) => {
  console.error(C.red(C.bold(`✗ Unhandled error: ${err?.message || err}`)))
  if (err?.stack) console.error(C.dim(err.stack))
  process.exit(1)
})
