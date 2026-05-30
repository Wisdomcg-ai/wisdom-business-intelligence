#!/usr/bin/env tsx
/**
 * Phase 70 Plan 05 — B1: Envisage subscription_budgets cleanup.
 *
 * Two operations, Envisage-only:
 *   STEP A — Paypal dedupe (merge then delete):
 *     - Keep the more specific row ("Paypal Australia 1043714034893")
 *     - Delete the generic "Paypal" row
 *     - Merge any account_codes from the loser into the keeper first
 *     - Take the max of annual_budget across the pair (preserve any budget the
 *       generic row carried even if it's larger)
 *     - is_active = keeper.is_active OR loser.is_active
 *
 *   STEP B — account_codes backfill:
 *     - For every Envisage subscription_budgets row with empty account_codes
 *       (is_active=true AND (account_codes IS NULL OR account_codes = '{}')),
 *       infer codes by matching the vendor against the last 12 months of
 *       Xero BankTransactions (SPEND only) via createVendorKey from
 *       src/lib/utils/vendor-normalization.ts.
 *     - Per matched transaction line, bucket by AccountCode.
 *     - Take the top-N most-frequent codes (capped at 3 — avoids noise).
 *     - If 0 matches: surface as "unresolved (no PL activity matched)".
 *       Do NOT auto-fill. Matt reviews.
 *
 * Why xero_pl_lines / xero_pl_lines_wide_compat are NOT used here:
 *   xero_pl_lines holds per-(account, month) aggregates. It does NOT carry
 *   contact_name per line — vendor identity lives only in the source
 *   BankTransactions. The in-app subscription-detail route reads vendor data
 *   from live Xero BankTransactions (see
 *   src/app/api/monthly-report/subscription-detail/route.ts:204-213) for
 *   exactly this reason. We mirror that source so any code we infer here is
 *   the same code that would appear in the report's vendor breakdown.
 *
 * MODES:
 *   npx tsx scripts/70-05-B1-envisage-cleanup.ts
 *       → DRY RUN (default). Prints PAYPAL MERGE PLAN and ACCOUNT_CODES BACKFILL.
 *         No writes.
 *   npx tsx scripts/70-05-B1-envisage-cleanup.ts --apply
 *       → APPLY MODE. Executes the merge (UPDATE keeper + DELETE loser) AND
 *         per-row UPDATEs of account_codes. Per-step try/catch.
 *   npx tsx scripts/70-05-B1-envisage-cleanup.ts --skip-xero
 *       → Skip Xero API calls (testing). Step A still runs; Step B emits
 *         "skipped (xero disabled)" for every empty-codes row.
 *
 * INVARIANTS (do NOT relax without re-reading 70-05-PLAN.md):
 *   - ENVISAGE ONLY. Hardcoded businesses.id + business_profiles.id at top.
 *     JDS and IICT are handled in 70-06 / 70-07.
 *   - Single sanctioned DELETE: the generic Paypal row, only when the
 *     specific Paypal row exists AND there is exactly one of each. Anything
 *     else → log error, do nothing.
 *   - NEVER overwrite an account_codes value that is already non-empty.
 *     Matt's existing values win.
 *   - NEVER auto-fill account_codes if zero PL/BankTxn matches. Surface only.
 *   - NEVER call createVendorKey on a null/undefined vendor_name. Skip with WARN.
 *   - Cap account_codes at top-3 most frequent codes. >3 = noise.
 *   - Idempotent: a re-run after --apply produces zero mutations:
 *     "PAYPAL: already deduped" + "ACCOUNT_CODES: 0 rows pending".
 *
 * Run:
 *   npx tsx scripts/70-05-B1-envisage-cleanup.ts
 *   npx tsx scripts/70-05-B1-envisage-cleanup.ts --apply
 */

import { config } from 'dotenv'
import path from 'path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

config({ path: path.resolve(process.cwd(), '.env.local') })
config({ path: path.resolve(process.cwd(), '.env') })

import { createVendorKey, extractVendorName } from '@/lib/utils/vendor-normalization'
import { getValidAccessToken } from '@/lib/xero/token-manager'

// ── Hardcoded Envisage IDs (per 70-CONTEXT.md decisions block) ──────────────
const ENVISAGE_BUSINESSES_ID = '8c8c63b2-bdc4-4115-9375-8d0fd89acc00'
const ENVISAGE_PROFILES_ID = 'fa0a80e8-e58e-40aa-b34a-8db667d4b221'

// ── Env & flags ─────────────────────────────────────────────────────────────
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
if (!URL || !KEY) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local')
}

const APPLY = process.argv.includes('--apply')
const SKIP_XERO = process.argv.includes('--skip-xero')

// ── Color helpers (ANSI) ────────────────────────────────────────────────────
const C = {
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
}

// ── Types ───────────────────────────────────────────────────────────────────
interface SubscriptionRow {
  id: string
  business_id: string
  vendor_name: string
  vendor_key: string
  frequency: string
  monthly_budget: number | null
  annual_budget: number | null
  is_active: boolean
  renewal_month: number | null
  account_codes: string[] | null
}

interface XeroBankTxn {
  Contact?: { Name?: string }
  Reference?: string
  Date?: string
  LineItems?: Array<{ Description?: string; AccountCode?: string; LineAmount?: number }>
  Total?: number
}

interface BackfillRowResult {
  row: SubscriptionRow
  status: 'INFERRED' | 'UNRESOLVED' | 'SKIPPED_XERO' | 'SKIPPED_NULL_VENDOR' | 'ALREADY_SET'
  inferred_codes?: string[]
  match_count?: number
  per_code_counts?: Record<string, number>
  unresolved_reason?: string
}

// ── Supabase service-role client ────────────────────────────────────────────
const supabase: SupabaseClient = createClient(URL, KEY)

// ── Xero Date parser ────────────────────────────────────────────────────────
function parseXeroDate(xeroDate: string | undefined): Date | null {
  if (!xeroDate) return null
  const msMatch = String(xeroDate).match(/\/Date\((-?\d+)/)
  if (msMatch) {
    const ms = Number(msMatch[1])
    if (Number.isFinite(ms)) return new Date(ms)
    return null
  }
  const d = new Date(xeroDate)
  if (Number.isFinite(d.getTime())) return d
  return null
}

// ── Xero BankTransactions fetch ─────────────────────────────────────────────
async function fetchAllBankTransactions(
  accessToken: string,
  tenantId: string,
  sinceDate: Date,
): Promise<XeroBankTxn[]> {
  const all: XeroBankTxn[] = []
  const where = `Type=="SPEND" AND Date >= DateTime(${sinceDate.getUTCFullYear()},${sinceDate.getUTCMonth() + 1},${sinceDate.getUTCDate()})`
  let page = 1
  const MAX_PAGES = 50

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
      await new Promise((r) => setTimeout(r, 10_000))
      continue
    }
    if (res.status === 401 || res.status === 403) {
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
    if (items.length < 100) break
    page++
    await new Promise((r) => setTimeout(r, 300))
  }

  return all
}

// ── Build a per-vendorKey → per-accountCode → count index from txns ─────────
function buildVendorAccountIndex(txns: XeroBankTxn[]): Map<string, Map<string, number>> {
  const index = new Map<string, Map<string, number>>()
  const twelveMonthsAgo = new Date()
  twelveMonthsAgo.setUTCFullYear(twelveMonthsAgo.getUTCFullYear() - 1)

  for (const tx of txns) {
    const txDate = parseXeroDate(tx.Date)
    if (!txDate || txDate < twelveMonthsAgo) continue
    const contactName = tx.Contact?.Name || ''
    const lineItems = tx.LineItems || []
    for (const li of lineItems) {
      const accountCode = li.AccountCode
      if (!accountCode) continue
      const vendorName = extractVendorName(contactName, li.Description || tx.Reference || '')
      if (!vendorName) continue
      const vkey = createVendorKey(vendorName)
      if (!vkey) continue
      if (!index.has(vkey)) index.set(vkey, new Map())
      const perCode = index.get(vkey)!
      perCode.set(accountCode, (perCode.get(accountCode) || 0) + 1)
    }
  }

  return index
}

// ── Infer top-N account_codes for a vendor from the index ──────────────────
function inferAccountCodes(
  vendorName: string,
  index: Map<string, Map<string, number>>,
): { codes: string[]; matchCount: number; perCodeCounts: Record<string, number> } {
  const target = createVendorKey(vendorName)
  const perCode = index.get(target)
  if (!perCode || perCode.size === 0) {
    return { codes: [], matchCount: 0, perCodeCounts: {} }
  }

  const entries = Array.from(perCode.entries()).sort((a, b) => b[1] - a[1])
  const top = entries.slice(0, 3).map(([code]) => code)
  const total = entries.reduce((s, [, c]) => s + c, 0)
  const perCodeCounts: Record<string, number> = {}
  for (const [code, count] of entries) perCodeCounts[code] = count

  return { codes: top.sort(), matchCount: total, perCodeCounts }
}

// ── ────────────────────────────────────────────────────────────────────────
// ── STEP A: Paypal merge ───────────────────────────────────────────────────
// ── ────────────────────────────────────────────────────────────────────────
async function runPaypalMerge(): Promise<{
  alreadyDeduped: boolean
  keeper?: SubscriptionRow
  loser?: SubscriptionRow
  mergedAccountCodes?: string[]
  mergedMonthlyBudget?: number
  mergedAnnualBudget?: number
  mergedIsActive?: boolean
  error?: string
}> {
  console.log('')
  console.log(C.cyan('═══ PAYPAL MERGE PLAN ═══'))

  const { data: rowsRaw, error } = await supabase
    .from('subscription_budgets')
    .select('id, business_id, vendor_name, vendor_key, frequency, monthly_budget, annual_budget, is_active, renewal_month, account_codes')
    .eq('business_id', ENVISAGE_BUSINESSES_ID)
    .ilike('vendor_name', '%paypal%')

  if (error) {
    console.log(C.red(`✗ Failed to fetch Paypal rows: ${error.message}`))
    return { alreadyDeduped: false, error: error.message }
  }

  const rows = (rowsRaw || []) as SubscriptionRow[]
  console.log(`  Found ${rows.length} Paypal-matching row(s) for Envisage`)
  for (const r of rows) {
    console.log(C.dim(`    · id=${r.id}  vendor_name="${r.vendor_name}"  vendor_key="${r.vendor_key}"  monthly_budget=${r.monthly_budget}  is_active=${r.is_active}  codes=${JSON.stringify(r.account_codes || [])}`))
  }

  if (rows.length === 0) {
    console.log(C.green('  ✓ no Paypal rows — nothing to merge'))
    return { alreadyDeduped: true }
  }

  if (rows.length === 1) {
    // Already deduped (assumed previous run completed merge) — check it's the SPECIFIC one
    const lone = rows[0]
    const isGeneric = /^paypal$/i.test((lone.vendor_name || '').trim())
    if (isGeneric) {
      const msg = `Only the GENERIC Paypal row remains (id=${lone.id}). The specific row appears to be missing — manual review required.`
      console.log(C.red(`  ✗ ${msg}`))
      return { alreadyDeduped: false, error: msg }
    }
    console.log(C.green('  ✓ already deduped (one specific Paypal row remains)'))
    return { alreadyDeduped: true, keeper: lone }
  }

  // 2+ rows: identify specific (keeper) vs generic (loser)
  const specifics = rows.filter((r) => {
    const v = (r.vendor_name || '').trim()
    return /paypal\s+australia\b/i.test(v) || /\d{8,}/.test(v)
  })
  const generics = rows.filter((r) => {
    const v = (r.vendor_name || '').trim()
    return /^paypal$/i.test(v)
  })

  if (specifics.length !== 1 || generics.length !== 1) {
    const msg = `Paypal pattern not as expected — specific=${specifics.length}, generic=${generics.length}. Manual review required.`
    console.log(C.red(`  ✗ ${msg}`))
    return { alreadyDeduped: false, error: msg }
  }

  const keeper = specifics[0]
  const loser = generics[0]

  // Merge
  const mergedSet = new Set<string>([...(keeper.account_codes || []), ...(loser.account_codes || [])])
  const mergedAccountCodes = Array.from(mergedSet).sort()
  const mergedMonthlyBudget = Math.max(Number(keeper.monthly_budget || 0), Number(loser.monthly_budget || 0))
  const mergedAnnualBudget = Math.max(Number(keeper.annual_budget || 0), Number(loser.annual_budget || 0))
  const mergedIsActive = !!(keeper.is_active || loser.is_active)

  console.log('')
  console.log(C.green(`  KEEP   id=${keeper.id}  vendor="${keeper.vendor_name}"  monthly_budget=${keeper.monthly_budget}  codes=${JSON.stringify(keeper.account_codes || [])}`))
  console.log(C.red(`  DELETE id=${loser.id}  vendor="${loser.vendor_name}"   monthly_budget=${loser.monthly_budget}  codes=${JSON.stringify(loser.account_codes || [])}`))
  console.log(C.cyan(`  MERGED keeper will become: monthly_budget=${mergedMonthlyBudget} (max of pair)  codes=${JSON.stringify(mergedAccountCodes)}  is_active=${mergedIsActive}`))
  console.log(C.dim(`         (annual_budget is GENERATED column — recomputed by Postgres as monthly_budget * 12)`))

  if (!APPLY) {
    console.log(C.yellow('  (DRY RUN — no writes; re-run with --apply to commit)'))
    return {
      alreadyDeduped: false,
      keeper,
      loser,
      mergedAccountCodes,
      mergedMonthlyBudget,
      mergedAnnualBudget,
      mergedIsActive,
    }
  }

  // APPLY: UPDATE keeper THEN DELETE loser
  console.log('')
  console.log(C.bold('  Applying merge:'))
  try {
    const { error: updErr } = await supabase
      .from('subscription_budgets')
      .update({
        monthly_budget: mergedMonthlyBudget,
        account_codes: mergedAccountCodes,
        is_active: mergedIsActive,
        updated_at: new Date().toISOString(),
      })
      .eq('id', keeper.id)
    if (updErr) throw new Error(`UPDATE keeper → ${updErr.message}`)
    console.log(C.green(`  ✓ UPDATED keeper id=${keeper.id}`))
  } catch (err: any) {
    console.log(C.red(`  ✗ APPLY FAILED on keeper UPDATE: ${err.message}`))
    console.log(C.red('  ✗ Aborting STEP A — STEP B will still run (no Paypal mutation occurred)'))
    return { alreadyDeduped: false, error: err.message }
  }

  try {
    const { error: delErr } = await supabase
      .from('subscription_budgets')
      .delete()
      .eq('id', loser.id)
    if (delErr) throw new Error(`DELETE loser → ${delErr.message}`)
    console.log(C.green(`  ✓ DELETED loser id=${loser.id}`))
  } catch (err: any) {
    console.log(C.red(`  ✗ APPLY FAILED on loser DELETE: ${err.message}`))
    console.log(C.red(`  ✗ STATE IS PARTIALLY MERGED: keeper was UPDATED but loser was NOT deleted.`))
    console.log(C.red(`  ✗ MANUAL REVIEW REQUIRED — re-run --apply (idempotent guards will retry) or delete loser via SQL.`))
    return { alreadyDeduped: false, keeper, loser, mergedAccountCodes, mergedMonthlyBudget, mergedAnnualBudget, mergedIsActive, error: err.message }
  }

  return {
    alreadyDeduped: false,
    keeper,
    loser,
    mergedAccountCodes,
    mergedMonthlyBudget,
    mergedAnnualBudget,
    mergedIsActive,
  }
}

// ── ────────────────────────────────────────────────────────────────────────
// ── STEP B: account_codes backfill ─────────────────────────────────────────
// ── ────────────────────────────────────────────────────────────────────────
async function runAccountCodesBackfill(): Promise<{
  candidateCount: number
  results: BackfillRowResult[]
  written: number
  failures: Array<{ id: string; vendor: string; error: string }>
}> {
  console.log('')
  console.log(C.cyan('═══ ACCOUNT_CODES BACKFILL ═══'))

  // Fetch candidate rows: Envisage, active, empty account_codes
  const { data: rowsRaw, error: rowsErr } = await supabase
    .from('subscription_budgets')
    .select('id, business_id, vendor_name, vendor_key, frequency, monthly_budget, annual_budget, is_active, renewal_month, account_codes')
    .eq('business_id', ENVISAGE_BUSINESSES_ID)
    .eq('is_active', true)
    .order('vendor_name', { ascending: true })

  if (rowsErr) {
    console.log(C.red(`✗ Failed to fetch subscription_budgets: ${rowsErr.message}`))
    return { candidateCount: 0, results: [], written: 0, failures: [] }
  }

  const allActive = (rowsRaw || []) as SubscriptionRow[]
  const candidates = allActive.filter((r) => !r.account_codes || r.account_codes.length === 0)
  const alreadySet = allActive.filter((r) => r.account_codes && r.account_codes.length > 0)

  console.log(`  Active Envisage subs: ${allActive.length}`)
  console.log(`  Already have non-empty account_codes (untouched): ${alreadySet.length}`)
  console.log(`  Candidate rows (empty account_codes): ${candidates.length}`)

  if (candidates.length === 0) {
    console.log(C.green('  ✓ no rows pending — backfill complete'))
    return { candidateCount: 0, results: [], written: 0, failures: [] }
  }

  // Build vendor → account index from Xero
  let vendorIndex = new Map<string, Map<string, number>>()
  let xeroAvailable = false

  if (SKIP_XERO) {
    console.log(C.yellow('  ⚠ --skip-xero: skipping Xero fetch; every row will be SKIPPED_XERO'))
  } else {
    console.log('')
    console.log(C.dim('  ── Fetching Envisage Xero BankTransactions (last 12 months) ──'))

    const { data: connRaw, error: connErr } = await supabase
      .from('xero_connections')
      .select('id, business_id, tenant_id, tenant_name, is_active, expires_at')
      .eq('business_id', ENVISAGE_BUSINESSES_ID)
      .eq('is_active', true)

    if (connErr) {
      console.log(C.red(`  ✗ Failed to fetch xero_connections: ${connErr.message}`))
    } else {
      const connections = (connRaw || []) as Array<{
        id: string
        tenant_id: string
        tenant_name?: string
      }>
      if (connections.length === 0) {
        console.log(C.yellow(`  ⚠ no active xero_connections for Envisage — cannot infer codes`))
      } else {
        const twelveMonthsAgo = new Date()
        twelveMonthsAgo.setUTCFullYear(twelveMonthsAgo.getUTCFullYear() - 1)
        const aggregatedTxns: XeroBankTxn[] = []
        for (const conn of connections) {
          const tenantLabel = conn.tenant_name || conn.tenant_id
          console.log(C.dim(`  · fetching tenant="${tenantLabel}" (tid=${conn.tenant_id})`))
          let tokenResult: Awaited<ReturnType<typeof getValidAccessToken>>
          try {
            tokenResult = await getValidAccessToken({ id: conn.id }, supabase)
          } catch (tokenErr: any) {
            console.log(C.red(`    ✗ token error — ${tokenErr.message}`))
            continue
          }
          if (!tokenResult.success || !tokenResult.accessToken) {
            console.log(C.red(`    ✗ token unavailable — ${tokenResult.message || tokenResult.error || 'unknown'}`))
            continue
          }
          try {
            const txns = await fetchAllBankTransactions(tokenResult.accessToken, conn.tenant_id, twelveMonthsAgo)
            console.log(C.dim(`    fetched ${txns.length} SPEND tx`))
            aggregatedTxns.push(...txns)
            xeroAvailable = true
          } catch (fetchErr: any) {
            console.log(C.red(`    ✗ fetch error — ${fetchErr.message}`))
          }
        }
        if (xeroAvailable) {
          vendorIndex = buildVendorAccountIndex(aggregatedTxns)
          console.log(C.dim(`  · indexed ${vendorIndex.size} unique vendor keys`))
        }
      }
    }
  }

  // Per-row inference
  // Skip 'Unknown' vendor auto-fill per Matt 2026-05-31 — junk row with no
  // dominant pattern (372 tx spread across 34 different account codes); the
  // top-3 codes (404/473/492) account for <40% of activity, so auto-filling
  // would surface misleading variance. Leave empty; future cleanup will
  // deactivate or rename this row.
  const SKIP_AUTOFILL_VENDOR_NAMES = new Set(['Unknown'])

  console.log('')
  const results: BackfillRowResult[] = []
  for (const r of candidates) {
    if (!r.vendor_name) {
      console.log(C.yellow(`  ⚠ SKIP   id=${r.id}  (null vendor_name)`))
      results.push({ row: r, status: 'SKIPPED_NULL_VENDOR' })
      continue
    }
    if (SKIP_AUTOFILL_VENDOR_NAMES.has(r.vendor_name.trim())) {
      console.log(C.yellow(`  ⚠ SKIP   "${r.vendor_name}"  (excluded from auto-fill per Matt 2026-05-31 — junk row, no dominant pattern)`))
      results.push({ row: r, status: 'UNRESOLVED', unresolved_reason: 'excluded from auto-fill (junk vendor name, no dominant pattern)' })
      continue
    }
    if (SKIP_XERO || !xeroAvailable) {
      console.log(C.dim(`  · SKIP   "${r.vendor_name}"  (xero unavailable)`))
      results.push({ row: r, status: 'SKIPPED_XERO', unresolved_reason: 'xero data not available' })
      continue
    }
    let { codes, matchCount, perCodeCounts } = inferAccountCodes(r.vendor_name, vendorIndex)
    let fallbackNote = ''
    // PayPal post-merge codes inheritance per Matt 2026-05-31:
    // The keeper row's vendor_name is specific ("Paypal Australia 1043714034893")
    // which has no direct Xero BankTransaction matches because Xero contacts use
    // the generic "Paypal" name. When the keeper has zero matches AND its name
    // matches the Paypal-specific pattern, fall back to inferring from the
    // generic "Paypal" vendor_key so we inherit the loser's would-have-been
    // codes ([415, 440, 710]) into the surviving row.
    if (codes.length === 0) {
      const v = r.vendor_name.trim()
      const isPaypalSpecific = /paypal\s+australia\b/i.test(v) || (/paypal/i.test(v) && /\d{8,}/.test(v))
      if (isPaypalSpecific) {
        const fallback = inferAccountCodes('Paypal', vendorIndex)
        if (fallback.codes.length > 0) {
          codes = fallback.codes
          matchCount = fallback.matchCount
          perCodeCounts = fallback.perCodeCounts
          fallbackNote = ' [via generic "Paypal" fallback]'
        }
      }
    }
    if (codes.length === 0) {
      console.log(C.yellow(`  ⚠ UNRES  "${r.vendor_name}"  → no PL/BankTxn matches in last 12mo`))
      results.push({ row: r, status: 'UNRESOLVED', match_count: 0, unresolved_reason: 'no Xero BankTransaction matches in last 12mo' })
    } else {
      const breakdown = Object.entries(perCodeCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([code, count]) => `${code}×${count}`)
        .join(', ')
      console.log(C.green(`  ✓ INFER  "${r.vendor_name}"  → codes=${JSON.stringify(codes)}  (${matchCount} matches: ${breakdown})${fallbackNote}`))
      results.push({ row: r, status: 'INFERRED', inferred_codes: codes, match_count: matchCount, per_code_counts: perCodeCounts })
    }
  }

  // Apply pass
  console.log('')
  let written = 0
  const failures: Array<{ id: string; vendor: string; error: string }> = []
  const inferredCount = results.filter((r) => r.status === 'INFERRED').length
  const unresolvedCount = results.filter((r) => r.status === 'UNRESOLVED').length
  const skipXeroCount = results.filter((r) => r.status === 'SKIPPED_XERO').length
  const skipNullCount = results.filter((r) => r.status === 'SKIPPED_NULL_VENDOR').length

  if (APPLY) {
    console.log(C.bold(`  Applying account_codes updates (${inferredCount} INFERRED rows):`))
    for (const result of results) {
      if (result.status !== 'INFERRED' || !result.inferred_codes) continue
      try {
        const { error: updErr } = await supabase
          .from('subscription_budgets')
          .update({
            account_codes: result.inferred_codes,
            updated_at: new Date().toISOString(),
          })
          .eq('id', result.row.id)
          .or('account_codes.is.null,account_codes.eq.{}')  // safety guard: do not overwrite if filled in the meantime
        if (updErr) throw new Error(updErr.message)
        console.log(C.green(`  ✓ UPDATED "${result.row.vendor_name}" → codes=${JSON.stringify(result.inferred_codes)}`))
        written++
      } catch (err: any) {
        console.log(C.red(`  ✗ FAILED  "${result.row.vendor_name}" (${result.row.id}): ${err.message}`))
        failures.push({ id: result.row.id, vendor: result.row.vendor_name, error: err.message })
      }
    }
  } else {
    console.log(C.yellow(`  (DRY RUN — no writes; re-run with --apply to commit ${inferredCount} INFERRED rows)`))
  }

  // Summary
  console.log('')
  console.log(C.dim(`  Backfill totals: INFERRED=${inferredCount}  UNRESOLVED=${unresolvedCount}  SKIPPED_XERO=${skipXeroCount}  SKIPPED_NULL=${skipNullCount}`))

  return { candidateCount: candidates.length, results, written, failures }
}

// ── ────────────────────────────────────────────────────────────────────────
// ── MAIN ───────────────────────────────────────────────────────────────────
// ── ────────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log('='.repeat(72))
  console.log(C.bold('Phase 70 Plan 05 — B1: Envisage subscription_budgets cleanup'))
  console.log('='.repeat(72))
  if (APPLY) {
    console.log(C.red(C.bold('APPLY MODE — writes will commit to production Supabase')))
  } else {
    console.log(C.yellow(C.bold('DRY RUN — preview only, no writes (re-run with --apply to commit)')))
  }
  if (SKIP_XERO) {
    console.log(C.yellow('--skip-xero — Xero API calls bypassed; Step B will skip every row'))
  }
  console.log(`URL: ${URL}`)
  console.log(`Envisage businesses.id:        ${ENVISAGE_BUSINESSES_ID}`)
  console.log(`Envisage business_profiles.id: ${ENVISAGE_PROFILES_ID}`)
  console.log(`Started: ${new Date().toISOString()}`)

  // Snapshot row count BEFORE
  const { count: countBefore } = await supabase
    .from('subscription_budgets')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', ENVISAGE_BUSINESSES_ID)
  console.log(`Envisage subscription_budgets count BEFORE: ${countBefore ?? '?'}`)

  // STEP A
  const mergeResult = await runPaypalMerge()

  // STEP B
  const backfillResult = await runAccountCodesBackfill()

  // Snapshot row count AFTER
  const { count: countAfter } = await supabase
    .from('subscription_budgets')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', ENVISAGE_BUSINESSES_ID)

  console.log('')
  console.log('='.repeat(72))
  console.log(C.bold('Summary'))
  console.log('='.repeat(72))
  console.log(`Envisage subscription_budgets count BEFORE: ${countBefore ?? '?'}`)
  console.log(`Envisage subscription_budgets count AFTER:  ${countAfter ?? '?'}`)
  if (mergeResult.alreadyDeduped) {
    console.log(`Paypal merge: already deduped (no action)`)
  } else if (mergeResult.error) {
    console.log(C.red(`Paypal merge: ERROR — ${mergeResult.error}`))
  } else if (APPLY) {
    console.log(C.green(`Paypal merge: APPLIED (kept ${mergeResult.keeper?.id}, deleted ${mergeResult.loser?.id})`))
  } else {
    console.log(C.yellow(`Paypal merge: planned (kept ${mergeResult.keeper?.id}, would delete ${mergeResult.loser?.id})`))
  }

  const inferredCount = backfillResult.results.filter((r) => r.status === 'INFERRED').length
  const unresolvedCount = backfillResult.results.filter((r) => r.status === 'UNRESOLVED').length
  if (APPLY) {
    console.log(`account_codes backfill: ${backfillResult.written} rows UPDATED (${inferredCount} inferred, ${unresolvedCount} unresolved)`)
    if (backfillResult.failures.length > 0) {
      console.log(C.red(`  ${backfillResult.failures.length} failure(s):`))
      for (const f of backfillResult.failures) {
        console.log(C.red(`    - "${f.vendor}" (${f.id}): ${f.error}`))
      }
    }
  } else {
    console.log(`account_codes backfill: ${inferredCount} INFERRED + ${unresolvedCount} UNRESOLVED (dry-run; no writes)`)
  }

  console.log('')
  console.log(`Finished: ${new Date().toISOString()}`)

  if (APPLY && (mergeResult.error || backfillResult.failures.length > 0)) {
    process.exit(1)
  }
  if (APPLY) {
    console.log(C.green(C.bold(`✓ APPLY complete. Re-run without --apply to verify idempotency.`)))
  }
}

main().catch((err) => {
  console.error(C.red(C.bold(`✗ Unhandled error: ${err?.message || err}`)))
  if (err?.stack) console.error(C.dim(err.stack))
  process.exit(1)
})
