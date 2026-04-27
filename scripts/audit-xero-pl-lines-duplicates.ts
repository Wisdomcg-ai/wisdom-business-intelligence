/**
 * Phase 44 — Wave 0 pre-migration audit (created by plan 44-01).
 *
 * Read-only audit of `xero_pl_lines` to surface duplicate rows BEFORE
 * Plan 44-02 ships its unique-constraint migration.
 *
 * Per CONTEXT D-09 Post-Research Clarification:
 *   The table migrates from WIDE format (one row per (business, tenant,
 *   account_code) with monthly_values JSONB) to LONG format (one row per
 *   (business, tenant, account_code, period_month)). The unique constraint
 *   in 44-02 will FAIL mid-deploy on any pre-existing duplicates.
 *
 * This script audits BOTH possible duplicate definitions:
 *   (a) Today's effective unique key (business_id, tenant_id, account_code)
 *       — duplicates here are remediation TARGETS for the dedup-then-migrate
 *       step in 44-02.
 *   (b) The future long-format key (business_id, tenant_id, account_code,
 *       period_month) — once monthly_values is exploded into rows, any
 *       account_code seen in two source rows for the same business+tenant
 *       collapses into duplicate (account, period_month) pairs.
 *
 * READ-ONLY. No DELETE, no UPDATE, no INSERT. Output is a markdown report
 * written next to the script + stdout summary. Exit 0 always.
 *
 * Generalises `scripts/dedupe-envisage-xero-pl-lines.ts` (one-off Envisage
 * remediation) across all connected businesses.
 *
 * Usage:
 *   npx tsx scripts/audit-xero-pl-lines-duplicates.ts
 */
import { config } from 'dotenv'
import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })

import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'fs'

interface XeroPlLineRow {
  id: string
  business_id: string
  tenant_id: string | null
  account_code: string | null
  account_name: string | null
  monthly_values: Record<string, unknown> | null
  updated_at: string
}

interface DuplicateGroup {
  business_id: string
  business_name: string
  tenant_id: string | null
  tenant_name: string | null
  account_code: string | null
  account_name: string | null
  row_count: number
  row_ids: string[]
}

function todayDateString(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

async function main() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY in .env.local')
    process.exit(1)
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  )

  console.log('=== Phase 44 Plan 44-01 — Pre-migration duplicate audit ===\n')
  console.log('Scope: scripts/audit-xero-pl-lines-duplicates.ts (read-only)')
  console.log(`Date: ${todayDateString()}\n`)

  // 1) Pull every xero_pl_lines row. Volume across all 18 businesses is small
  //    (a few thousand rows max in WIDE format) — single SELECT is fine.
  const { data: rows, error: rowsErr } = await supabase
    .from('xero_pl_lines')
    .select('id, business_id, tenant_id, account_code, account_name, monthly_values, updated_at')
    .order('updated_at', { ascending: false })

  if (rowsErr) {
    console.error('Failed to load xero_pl_lines:', rowsErr)
    process.exit(1)
  }

  const allRows = (rows ?? []) as XeroPlLineRow[]
  console.log(`Loaded ${allRows.length} total xero_pl_lines rows.\n`)

  // 2) Resolve business names so the report is readable.
  const uniqueBusinessIds = Array.from(new Set(allRows.map((r) => r.business_id))).filter(Boolean)
  const businessNameById = new Map<string, string>()
  if (uniqueBusinessIds.length > 0) {
    const { data: bizs } = await supabase
      .from('businesses')
      .select('id, name')
      .in('id', uniqueBusinessIds)
    for (const b of bizs ?? []) {
      businessNameById.set(b.id, b.name ?? '(unnamed)')
    }
    // Some xero_pl_lines rows are keyed by business_profiles.id (dual-ID
    // system). Resolve those too.
    const stillMissing = uniqueBusinessIds.filter((id) => !businessNameById.has(id))
    if (stillMissing.length > 0) {
      const { data: profiles } = await supabase
        .from('business_profiles')
        .select('id, business_name, business_id')
        .in('id', stillMissing)
      for (const p of profiles ?? []) {
        businessNameById.set(p.id, `${p.business_name ?? '(unnamed)'} (profile)`)
      }
    }
  }

  // 3) Resolve tenant names from xero_connections.
  const uniqueTenantIds = Array.from(
    new Set(allRows.map((r) => r.tenant_id).filter((t): t is string => Boolean(t)))
  )
  const tenantNameById = new Map<string, string>()
  if (uniqueTenantIds.length > 0) {
    const { data: conns } = await supabase
      .from('xero_connections')
      .select('tenant_id, tenant_name')
      .in('tenant_id', uniqueTenantIds)
    for (const c of conns ?? []) {
      if (c.tenant_id) {
        tenantNameById.set(c.tenant_id, c.tenant_name ?? '(unnamed-tenant)')
      }
    }
  }

  // 4) Audit (a): wide-format dupes by (business_id, tenant_id, account_code).
  //    null tenant_id and null account_code each get their own bucket so we
  //    don't conflate "missing" with "shared".
  const wideKey = (r: XeroPlLineRow) =>
    `${r.business_id}|${r.tenant_id ?? '<null>'}|${
      r.account_code ? `code:${r.account_code}` : `name:${r.account_name ?? '<unnamed>'}`
    }`

  const wideGroups = new Map<string, XeroPlLineRow[]>()
  for (const r of allRows) {
    const key = wideKey(r)
    const arr = wideGroups.get(key) ?? []
    arr.push(r)
    wideGroups.set(key, arr)
  }

  const wideDupes: DuplicateGroup[] = []
  for (const [, arr] of wideGroups.entries()) {
    if (arr.length <= 1) continue
    const sample = arr[0]
    wideDupes.push({
      business_id: sample.business_id,
      business_name: businessNameById.get(sample.business_id) ?? '(unknown business)',
      tenant_id: sample.tenant_id,
      tenant_name: sample.tenant_id ? tenantNameById.get(sample.tenant_id) ?? null : null,
      account_code: sample.account_code,
      account_name: sample.account_name,
      row_count: arr.length,
      row_ids: arr.map((r) => r.id),
    })
  }

  // 5) Audit (b): future long-format conflict — would the JSONB explosion
  //    produce duplicate (business, tenant, account_code, period_month) rows?
  //    For each WIDE row, enumerate its monthly_values keys; tally
  //    (business+tenant+account, period_month) pairs across rows.
  const longKey = (
    r: XeroPlLineRow,
    period: string
  ) =>
    `${r.business_id}|${r.tenant_id ?? '<null>'}|${
      r.account_code ? `code:${r.account_code}` : `name:${r.account_name ?? '<unnamed>'}`
    }|${period}`

  const longGroups = new Map<string, XeroPlLineRow[]>()
  for (const r of allRows) {
    const periods = r.monthly_values && typeof r.monthly_values === 'object'
      ? Object.keys(r.monthly_values)
      : []
    for (const period of periods) {
      const key = longKey(r, period)
      const arr = longGroups.get(key) ?? []
      arr.push(r)
      longGroups.set(key, arr)
    }
  }

  let longConflictPairs = 0
  const longConflictsByBusiness = new Map<string, number>()
  for (const [, arr] of longGroups.entries()) {
    if (arr.length <= 1) continue
    longConflictPairs++
    const bid = arr[0].business_id
    longConflictsByBusiness.set(bid, (longConflictsByBusiness.get(bid) ?? 0) + 1)
  }

  // 6) Per-business rollup for the report.
  const dupeCountsByBusiness = new Map<string, number>()
  for (const g of wideDupes) {
    dupeCountsByBusiness.set(
      g.business_id,
      (dupeCountsByBusiness.get(g.business_id) ?? 0) + 1
    )
  }

  // 7) Build the markdown report.
  const lines: string[] = []
  lines.push(`# Phase 44 Pre-Migration Duplicate Audit`)
  lines.push('')
  lines.push(`**Generated:** ${todayDateString()}`)
  lines.push(`**Script:** \`scripts/audit-xero-pl-lines-duplicates.ts\``)
  lines.push(`**Mode:** READ-ONLY (no rows modified)`)
  lines.push('')
  lines.push(`## Summary`)
  lines.push('')
  lines.push(`- Total \`xero_pl_lines\` rows scanned: **${allRows.length}**`)
  lines.push(`- Distinct businesses with rows: **${uniqueBusinessIds.length}**`)
  lines.push(`- Distinct tenants represented: **${uniqueTenantIds.length}**`)
  lines.push(
    `- Wide-format duplicate groups (\`business_id, tenant_id, account_code\`): **${wideDupes.length}**`
  )
  lines.push(
    `- Future long-format conflicts (\`business_id, tenant_id, account_code, period_month\`): **${longConflictPairs}**`
  )
  lines.push(`- Businesses requiring remediation before 44-02: **${dupeCountsByBusiness.size}**`)
  lines.push('')

  if (wideDupes.length === 0 && longConflictPairs === 0) {
    lines.push(`### Verdict: **CLEAR**`)
    lines.push('')
    lines.push(
      'No duplicates found at either grain. The unique-constraint migration in plan 44-02 will apply cleanly.'
    )
    lines.push('')
  } else {
    lines.push(`### Verdict: **REMEDIATION REQUIRED**`)
    lines.push('')
    lines.push(
      `Plan 44-02 must run a dedup pass BEFORE adding the \`UNIQUE (business_id, tenant_id, account_code, period_month)\` constraint, or the migration will fail with constraint-violation errors.`
    )
    lines.push('')
  }

  if (dupeCountsByBusiness.size > 0) {
    lines.push(`## Per-Business Rollup`)
    lines.push('')
    lines.push(`| Business | Wide-Dupe Groups | Long-Format Conflicts |`)
    lines.push(`|----------|------------------|----------------------|`)
    const businessIds = Array.from(dupeCountsByBusiness.keys()).sort(
      (a, b) =>
        (dupeCountsByBusiness.get(b) ?? 0) - (dupeCountsByBusiness.get(a) ?? 0)
    )
    for (const bid of businessIds) {
      const name = businessNameById.get(bid) ?? '(unknown)'
      lines.push(
        `| ${name} (\`${bid}\`) | ${dupeCountsByBusiness.get(bid) ?? 0} | ${longConflictsByBusiness.get(bid) ?? 0} |`
      )
    }
    lines.push('')
  }

  if (wideDupes.length > 0) {
    lines.push(`## Wide-Format Duplicate Groups`)
    lines.push('')
    lines.push(
      'Each row below is a \`(business_id, tenant_id, account_code)\` triple with more than one underlying \`xero_pl_lines\` row. The conflicting row IDs are listed for the dedup remediation step.'
    )
    lines.push('')
    for (const g of wideDupes) {
      lines.push(
        `### ${g.business_name} — ${g.tenant_name ?? '(no tenant)'} — ${g.account_code ?? '(no code)'} ${g.account_name ? `(${g.account_name})` : ''}`
      )
      lines.push('')
      lines.push(`- business_id: \`${g.business_id}\``)
      lines.push(`- tenant_id: \`${g.tenant_id ?? '<null>'}\``)
      lines.push(`- account_code: \`${g.account_code ?? '<null>'}\``)
      lines.push(`- row_count: ${g.row_count}`)
      lines.push(`- row_ids:`)
      for (const id of g.row_ids) {
        lines.push(`  - \`${id}\``)
      }
      lines.push('')
    }
  }

  lines.push(`## Notes`)
  lines.push('')
  lines.push(
    '- This script is read-only. To remediate, run a generalised version of `scripts/dedupe-envisage-xero-pl-lines.ts` per business listed above (keep newest, drop older), OR ship the dedup logic inline in the 44-02 migration.'
  )
  lines.push(
    '- The "Future long-format conflicts" count is a forecast: how many `(business, tenant, account, month)` pairs would collide once `monthly_values` is exploded into rows. A non-zero value here is the same data as the wide-format dupe count multiplied by the per-row month coverage.'
  )
  lines.push('')

  // 8) Write report + print summary.
  const reportPath = path.resolve(
    process.cwd(),
    `scripts/audit-xero-pl-lines-duplicates-report-${todayDateString()}.md`
  )
  writeFileSync(reportPath, lines.join('\n'), 'utf8')
  console.log(`Report written: ${reportPath}\n`)

  console.log(`Wide-format duplicate groups: ${wideDupes.length}`)
  console.log(`Future long-format conflicts: ${longConflictPairs}`)
  console.log(`Businesses requiring remediation: ${dupeCountsByBusiness.size}`)
  console.log('')
  console.log(
    `AUDIT COMPLETE: ${dupeCountsByBusiness.size} businesses with ${wideDupes.length} total duplicate groups; ${
      wideDupes.length === 0 && longConflictPairs === 0
        ? 'safe to apply 44-02 unique constraint.'
        : 'remediation required before unique constraint migration in 44-02.'
    }`
  )

  // Read-only audit; never fail the build.
  process.exit(0)
}

main().catch((e) => {
  console.error('Audit script error:', e)
  // Even on error, exit 0 — the audit's job is to surface state, not gate CI.
  // The error is logged to stderr for the operator to see.
  process.exit(0)
})
