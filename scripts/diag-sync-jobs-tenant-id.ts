/**
 * Phase 44.2-01 — sync_jobs.tenant_id NULL audit (D-44.2-05).
 *
 * Read-only diagnostic. Never mutates anything. Always exits 0.
 *
 * Output sections:
 *   1. Overall counts            — total rows, NULL count, empty-string count
 *   2. Per-business breakdown    — top 20 businesses by NULL count
 *   3. Backfill candidates       — for each NULL row, can we infer tenant_id
 *                                  from xero_connections? Categorise as
 *                                  BACKFILL CANDIDATE / PRUNE CANDIDATE / AMBIGUOUS
 *   4. Recommendation summary    — counts per category, suggested migration path
 *
 * Phase 44.2-02 will use this output to write the NOT NULL migration prologue.
 *
 * Honours both env-var spellings (SUPABASE_SERVICE_ROLE_KEY + SUPABASE_SERVICE_KEY)
 * per the 44.1-01 precedent. Resolves the dual-business-ID system when looking up
 * xero_connections (xero_connections.business_id may reference businesses.id OR
 * business_profiles.id).
 *
 * Usage:
 *   npx tsx scripts/diag-sync-jobs-tenant-id.ts
 */
import { config } from 'dotenv'
import path from 'node:path'
config({ path: path.resolve(process.cwd(), '.env.local') })

import { createClient } from '@supabase/supabase-js'

interface SyncJobRow {
  id: string
  business_id: string
  tenant_id: string | null
  status: string | null
  started_at: string | null
}

interface XeroConnRow {
  id: string
  business_id: string
  tenant_id: string
  tenant_name: string | null
  is_active: boolean | null
}

interface ProfileRow {
  id: string
  business_id: string
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error(
      '[diag-sync-jobs-tenant-id] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY in .env.local'
    )
    process.exit(0) // diagnostic, not a gate
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // ---------------------------------------------------------------------------
  // SECTION 1 — overall counts
  // ---------------------------------------------------------------------------
  // Page through sync_jobs to avoid the default 1000-row limit (44.1 precedent).
  const allJobs: SyncJobRow[] = []
  {
    const pageSize = 1000
    let from = 0
    while (true) {
      const { data, error } = await supabase
        .from('sync_jobs')
        .select('id, business_id, tenant_id, status, started_at')
        .order('started_at', { ascending: false })
        .range(from, from + pageSize - 1)
      if (error) {
        console.error('[diag-sync-jobs-tenant-id] sync_jobs read error:', error)
        process.exit(0)
      }
      if (!data || data.length === 0) break
      allJobs.push(...(data as SyncJobRow[]))
      if (data.length < pageSize) break
      from += pageSize
    }
  }

  const total = allJobs.length
  const nullTenant = allJobs.filter(j => j.tenant_id === null).length
  const emptyTenant = allJobs.filter(j => j.tenant_id === '').length
  const goodTenant = total - nullTenant - emptyTenant
  const pct = (n: number) => (total === 0 ? '0.0' : ((n / total) * 100).toFixed(1))

  console.log('=== SECTION 1 — overall counts ===')
  console.log(`Total sync_jobs rows: ${total}`)
  console.log(`NULL tenant_id: ${nullTenant} (${pct(nullTenant)}%)`)
  console.log(`Empty-string tenant_id: ${emptyTenant} (${pct(emptyTenant)}%)`)
  console.log(`Populated tenant_id: ${goodTenant} (${pct(goodTenant)}%)`)
  console.log('')

  // ---------------------------------------------------------------------------
  // SECTION 2 — per-business NULL breakdown (top 20 by NULL count desc)
  // ---------------------------------------------------------------------------
  interface BizStats {
    business_id: string
    total: number
    null_count: number
    latest_null_at: string | null
    latest_non_null_at: string | null
  }
  const byBiz = new Map<string, BizStats>()
  for (const j of allJobs) {
    let s = byBiz.get(j.business_id)
    if (!s) {
      s = {
        business_id: j.business_id,
        total: 0,
        null_count: 0,
        latest_null_at: null,
        latest_non_null_at: null,
      }
      byBiz.set(j.business_id, s)
    }
    s.total++
    if (j.tenant_id === null) {
      s.null_count++
      if (!s.latest_null_at || (j.started_at ?? '') > s.latest_null_at) {
        s.latest_null_at = j.started_at
      }
    } else {
      if (!s.latest_non_null_at || (j.started_at ?? '') > s.latest_non_null_at) {
        s.latest_non_null_at = j.started_at
      }
    }
  }

  const businessesWithNull = [...byBiz.values()]
    .filter(s => s.null_count > 0)
    .sort((a, b) => b.null_count - a.null_count)
    .slice(0, 20)

  console.log('=== SECTION 2 — per-business NULL breakdown (top 20) ===')
  if (businessesWithNull.length === 0) {
    console.log('(no NULL tenant_id rows found)')
  } else {
    console.log(
      'business_id'.padEnd(40) +
        ' total'.padStart(7) +
        '  null'.padStart(7) +
        '  latest_null_at'.padEnd(28) +
        '  latest_non_null_at'
    )
    for (const s of businessesWithNull) {
      console.log(
        s.business_id.padEnd(40) +
          String(s.total).padStart(7) +
          String(s.null_count).padStart(7) +
          '  ' +
          (s.latest_null_at ?? '(none)').padEnd(28) +
          '  ' +
          (s.latest_non_null_at ?? '(none)')
      )
    }
  }
  console.log('')

  // ---------------------------------------------------------------------------
  // SECTION 3 — backfill candidates
  //
  // For each business_id with NULL rows, look up active xero_connections
  // (resolving the dual-ID system: xero_connections.business_id may be
  // businesses.id or business_profiles.id).
  //
  // Categories:
  //   BACKFILL CANDIDATE   — exactly 1 active xero_connection (single tenant)
  //   PRUNE CANDIDATE      — 0 active connections (history with no audit value)
  //   AMBIGUOUS            — >1 active connections (consolidated entity)
  // ---------------------------------------------------------------------------
  const businessIdsWithNull = [...byBiz.values()].filter(s => s.null_count > 0).map(s => s.business_id)

  // Resolve dual-ID candidates per business
  const profilesById = new Map<string, ProfileRow>() // keyed by either businesses.id or business_profiles.id
  if (businessIdsWithNull.length > 0) {
    const { data: profiles } = await supabase
      .from('business_profiles')
      .select('id, business_id')
      .or(
        businessIdsWithNull
          .map(id => `business_id.eq.${id},id.eq.${id}`)
          .join(',')
      )
    for (const p of (profiles ?? []) as ProfileRow[]) {
      profilesById.set(p.id, p)
      profilesById.set(p.business_id, p)
    }
  }

  // Pull active xero_connections once
  const candidateConnIds = new Set<string>()
  for (const bid of businessIdsWithNull) {
    candidateConnIds.add(bid)
    const p = profilesById.get(bid)
    if (p) {
      candidateConnIds.add(p.id)
      candidateConnIds.add(p.business_id)
    }
  }
  let allConns: XeroConnRow[] = []
  if (candidateConnIds.size > 0) {
    const { data } = await supabase
      .from('xero_connections')
      .select('id, business_id, tenant_id, tenant_name, is_active')
      .in('business_id', [...candidateConnIds])
    allConns = (data ?? []) as XeroConnRow[]
  }

  // Categorisation logic:
  //   - "Active" tenants are the canonical backfill source (matches what the
  //     orchestrator queries today). But xero_connections.is_active flips to
  //     false during sync runs (observed 2026-04-28); a connection that exists
  //     at all is still authoritative for the tenant attribution of historical
  //     sync_jobs. So we consider ALL connections, with active ones preferred.
  //   - BACKFILL CANDIDATE: exactly one distinct tenant (active or inactive).
  //   - PRUNE CANDIDATE: no xero_connections at all for this business.
  //   - AMBIGUOUS: more than one distinct tenant (consolidated entity).
  type Category = 'BACKFILL CANDIDATE' | 'PRUNE CANDIDATE' | 'AMBIGUOUS'
  interface BackfillEntry {
    business_id: string
    null_rows: number
    category: Category
    tenant_id: string | null
    notes: string
  }
  const entries: BackfillEntry[] = []
  for (const s of [...byBiz.values()].filter(b => b.null_count > 0)) {
    const p = profilesById.get(s.business_id)
    const idsToCheck = new Set([s.business_id])
    if (p) {
      idsToCheck.add(p.id)
      idsToCheck.add(p.business_id)
    }
    const allBizConns = allConns.filter(c => idsToCheck.has(c.business_id))
    const activeBizConns = allBizConns.filter(c => c.is_active === true)
    const distinctActiveTenants = [...new Set(activeBizConns.map(c => c.tenant_id))]
    const distinctAllTenants = [...new Set(allBizConns.map(c => c.tenant_id))]

    // Prefer active tenants for the canonical decision, but fall back to
    // any-status tenants when active is empty — a connection that exists
    // is still authoritative for past syncs.
    const distinctTenants =
      distinctActiveTenants.length > 0 ? distinctActiveTenants : distinctAllTenants
    const tenantsAreActive = distinctActiveTenants.length > 0

    if (distinctTenants.length === 1) {
      const conn = (tenantsAreActive ? activeBizConns : allBizConns)[0]
      entries.push({
        business_id: s.business_id,
        null_rows: s.null_count,
        category: 'BACKFILL CANDIDATE',
        tenant_id: distinctTenants[0],
        notes: `single ${tenantsAreActive ? 'active' : 'inactive'} tenant (${conn?.tenant_name ?? 'unknown'})`,
      })
    } else if (distinctTenants.length === 0) {
      entries.push({
        business_id: s.business_id,
        null_rows: s.null_count,
        category: 'PRUNE CANDIDATE',
        tenant_id: null,
        notes: 'no xero_connections at all',
      })
    } else {
      entries.push({
        business_id: s.business_id,
        null_rows: s.null_count,
        category: 'AMBIGUOUS',
        tenant_id: null,
        notes: `${distinctTenants.length} distinct tenants (consolidated entity)`,
      })
    }
  }

  console.log('=== SECTION 3 — backfill candidates per business ===')
  if (entries.length === 0) {
    console.log('(no NULL tenant_id rows to categorise)')
  } else {
    for (const e of entries) {
      console.log(
        `${e.category}: business_id=${e.business_id} null_rows=${e.null_rows}` +
          (e.tenant_id ? ` tenant_id=${e.tenant_id}` : '') +
          ` (${e.notes})`
      )
    }
  }
  console.log('')

  // ---------------------------------------------------------------------------
  // SECTION 4 — recommendation summary
  // ---------------------------------------------------------------------------
  const backfillBusinesses = entries.filter(e => e.category === 'BACKFILL CANDIDATE')
  const pruneBusinesses = entries.filter(e => e.category === 'PRUNE CANDIDATE')
  const ambiguousBusinesses = entries.filter(e => e.category === 'AMBIGUOUS')
  const backfillRows = backfillBusinesses.reduce((n, e) => n + e.null_rows, 0)
  const pruneRows = pruneBusinesses.reduce((n, e) => n + e.null_rows, 0)
  const ambiguousRows = ambiguousBusinesses.reduce((n, e) => n + e.null_rows, 0)

  console.log('=== SECTION 4 — recommendation summary ===')
  console.log(`Total NULL rows:           ${nullTenant}`)
  console.log(`  Backfill-able:           ${backfillRows} (across ${backfillBusinesses.length} businesses)`)
  console.log(`  Prune-able:              ${pruneRows} (across ${pruneBusinesses.length} businesses)`)
  console.log(`  Ambiguous (multi-tenant):${ambiguousRows} (across ${ambiguousBusinesses.length} businesses)`)
  console.log('')

  let recommended: 'A' | 'B' | 'C'
  if (ambiguousRows > 0) {
    recommended = 'C'
  } else if (pruneRows > 0) {
    recommended = 'B'
  } else {
    recommended = 'A'
  }

  console.log('Recommended migration path:')
  if (recommended === 'A') {
    console.log('  Path A — Backfill-then-NOT-NULL:')
    console.log('    -- Dual-ID join: sync_jobs.business_id may be businesses.id OR business_profiles.id;')
    console.log('    -- xero_connections.business_id likewise. Resolve via business_profiles.')
    console.log('    UPDATE sync_jobs sj')
    console.log('       SET tenant_id = xc.tenant_id')
    console.log('      FROM xero_connections xc')
    console.log('      LEFT JOIN business_profiles bp')
    console.log('        ON bp.id = xc.business_id OR bp.business_id = xc.business_id')
    console.log('     WHERE sj.tenant_id IS NULL')
    console.log('       AND (')
    console.log('         xc.business_id = sj.business_id')
    console.log('         OR bp.id = sj.business_id')
    console.log('         OR bp.business_id = sj.business_id')
    console.log('       );')
    console.log('  -- Note: no is_active filter — xero_connections.is_active flips')
    console.log('  -- transiently during sync runs; the row\'s existence is what matters.')
  } else if (recommended === 'B') {
    console.log('  Path B — Backfill+prune-then-NOT-NULL (requires user approval to DELETE):')
    console.log('    -- step 1: backfill where unambiguous (any connection, active or not)')
    console.log('    --         Dual-ID join via business_profiles bridge.')
    console.log('    UPDATE sync_jobs sj')
    console.log('       SET tenant_id = xc.tenant_id')
    console.log('      FROM xero_connections xc')
    console.log('      LEFT JOIN business_profiles bp')
    console.log('        ON bp.id = xc.business_id OR bp.business_id = xc.business_id')
    console.log('     WHERE sj.tenant_id IS NULL')
    console.log('       AND (')
    console.log('         xc.business_id = sj.business_id')
    console.log('         OR bp.id = sj.business_id')
    console.log('         OR bp.business_id = sj.business_id')
    console.log('       );')
    console.log('    -- step 2: prune orphaned history (NEEDS USER APPROVAL)')
    console.log('    DELETE FROM sync_jobs sj')
    console.log('     WHERE sj.tenant_id IS NULL')
    console.log('       AND NOT EXISTS (')
    console.log('         SELECT 1 FROM xero_connections xc')
    console.log('         LEFT JOIN business_profiles bp')
    console.log('           ON bp.id = xc.business_id OR bp.business_id = xc.business_id')
    console.log('         WHERE xc.business_id = sj.business_id')
    console.log('            OR bp.id = sj.business_id')
    console.log('            OR bp.business_id = sj.business_id')
    console.log('       );')
  } else {
    console.log('  Path C — Default-empty-string-then-NOT-NULL (matches xero_pl_lines precedent):')
    console.log("    UPDATE sync_jobs SET tenant_id = '' WHERE tenant_id IS NULL;")
    console.log('  Empty-string is a flag for "tenant unknown, do not trust" (audit-trail honest).')
  }

  // Always exit 0 — diagnostic, not a gate.
  process.exit(0)
}

main().catch(err => {
  console.error('[diag-sync-jobs-tenant-id] Unhandled error:', err)
  process.exit(0)
})
