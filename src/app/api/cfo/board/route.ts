/**
 * GET /api/cfo/board?month=YYYY-MM — the CFO production board.
 *
 * Fleet-wide (every business with a Xero connection row, active or dead —
 * a dead connection is exactly what the board must surface, not hide).
 * NO financial figures by design: performance lives in the monthly report;
 * this page answers "where is every client in this month's report cycle,
 * and what's blocking me". Replaces /api/cfo/summaries.
 *
 * Coach-only surface on a service-role client → app-layer authz (role gate +
 * assigned_coach_id collection scoping; super_admin sees all).
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import * as Sentry from '@sentry/nextjs'
import { withQuerySchema } from '@/lib/api/with-schema'
import { getSupabaseSecretKey } from '@/lib/supabase/keys'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import {
  classifyXeroConnection,
  needsAttention,
  preferConnection,
  type XeroConnectionStatusRow,
} from '@/lib/xero/connection-status'
import { getLastSyncByTenant } from '@/lib/health-checks'
import {
  deriveStage,
  dueDateForMonth,
  daysOverdue,
  daysSince,
  summariseRecon,
  deriveSection,
  STALE_CODING_DAYS,
  type BoardSection,
} from '@/lib/cfo/board-logic'

export const dynamic = 'force-dynamic'

// Module-level service-role client (mirrors flag-client/route.ts)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  getSupabaseSecretKey()
)

const QuerySchema = z
  .object({
    month: z.string().optional(),
  })
  .passthrough()

type ConnectionRow = XeroConnectionStatusRow & { tenant_name?: string | null }

async function getHandler(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const month = searchParams.get('month') ?? ''
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: 'month=YYYY-MM is required' }, { status: 400 })
    }
    const periodMonth = `${month}-01`

    // Caller identity from the cookie-bound client; all data via service role.
    const authClient = await createRouteHandlerClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: roleRow } = await supabase
      .from('system_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle()
    const isSuperAdmin = roleRow?.role === 'super_admin'
    const isCoach = roleRow?.role === 'coach'
    if (!isSuperAdmin && !isCoach) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    let bizQuery = supabase.from('businesses').select('id, name, assigned_coach_id')
    if (!isSuperAdmin) {
      bizQuery = bizQuery.eq('assigned_coach_id', user.id)
    }
    const { data: businesses, error: bizError } = await bizQuery
    if (bizError) throw new Error(`businesses query failed: ${bizError.message}`)
    const allowedIds = (businesses ?? []).map(b => b.id)
    if (allowedIds.length === 0) {
      return NextResponse.json({ month, clients: [], hidden: [], stats: emptyStats() })
    }

    // Dual-ID expansion: connection rows carry business_id in EITHER id-space.
    const { data: profiles } = await supabase
      .from('business_profiles')
      .select('id, business_id')
      .in('business_id', allowedIds)
    const profileIdToBizId = new Map<string, string>()
    for (const p of profiles ?? []) profileIdToBizId.set(p.id, p.business_id)
    const allIdForms = [...allowedIds, ...(profiles ?? []).map(p => p.id)]

    // ALL connection rows, dead included — the board exists to surface them.
    const { data: connections, error: connError } = await supabase
      .from('xero_connections')
      .select('id, business_id, tenant_id, tenant_name, is_active, last_synced_at, updated_at, expires_at, created_at')
      .in('business_id', allIdForms)
      .order('updated_at', { ascending: false })
    if (connError) throw new Error(`connections query failed: ${connError.message}`)

    const connsByBiz = new Map<string, ConnectionRow[]>()
    for (const conn of (connections ?? []) as ConnectionRow[]) {
      const canonical = profileIdToBizId.get(conn.business_id) ?? conn.business_id
      const list = connsByBiz.get(canonical) ?? []
      list.push(conn)
      connsByBiz.set(canonical, list)
    }

    // Fleet = businesses with at least one connection row (locked decision).
    const fleetIds = allowedIds.filter(id => (connsByBiz.get(id) ?? []).length > 0)
    if (fleetIds.length === 0) {
      return NextResponse.json({ month, clients: [], hidden: [], stats: emptyStats() })
    }

    const [settingsRes, cycleRes, checksRes, bucketsRes, syncClock, accountStatusRes] = await Promise.all([
      supabase
        .from('monthly_report_settings')
        .select('business_id, report_due_day, bookkeeper_name, bookkeeper_email, hide_from_board')
        .in('business_id', fleetIds),
      supabase
        .from('cfo_report_status')
        .select('business_id, status, generated_at, approved_at, sent_at, discussed_at, manual_status_override')
        .eq('period_month', periodMonth)
        .in('business_id', fleetIds),
      supabase
        .from('reconciliation_checks')
        .select('business_id, tenant_id, status, checked_at, source, total_unreconciled_count, total_unreconciled_value, error_message')
        .in('business_id', fleetIds),
      supabase
        .from('reconciliation_snapshots')
        .select('business_id, tenant_id, month, unreconciled_count, unreconciled_value, currency, bank_account_name')
        .in('business_id', fleetIds),
      getLastSyncByTenant(supabase as never, 60),
      supabase
        .from('bank_account_status')
        .select('business_id, tenant_id, bank_account_id, bank_account_name, currency, short_code, last_coded_date, checked_at')
        .in('business_id', fleetIds),
    ])
    for (const [label, res] of [
      ['settings', settingsRes],
      ['cycle', cycleRes],
      ['checks', checksRes],
      ['buckets', bucketsRes],
      ['account_status', accountStatusRes],
    ] as const) {
      if ((res as { error: { message: string } | null }).error) {
        throw new Error(`${label} query failed: ${(res as any).error.message}`)
      }
    }

    const settingsByBiz = new Map((settingsRes.data ?? []).map(s => [s.business_id, s]))
    const cycleByBiz = new Map((cycleRes.data ?? []).map(c => [c.business_id, c]))
    const checksByBiz = groupBy(checksRes.data ?? [], r => r.business_id)
    const bucketsByBiz = groupBy(bucketsRes.data ?? [], r => r.business_id)
    const accountStatusByBiz = groupBy(accountStatusRes.data ?? [], r => r.business_id)

    const todayIso = new Date().toISOString()
    const now = Date.now()

    // Hidden clients drop out of sections and stats but are returned by name
    // so the page can offer a restore list — hide, never delete.
    const hidden = fleetIds
      .filter(id => settingsByBiz.get(id)?.hide_from_board === true)
      .map(id => ({
        business_id: id,
        business_name: (businesses ?? []).find(b => b.id === id)?.name ?? '(Unnamed)',
      }))
      .sort((a, b) => a.business_name.localeCompare(b.business_name))
    const visibleIds = fleetIds.filter(id => settingsByBiz.get(id)?.hide_from_board !== true)

    const clients = visibleIds.map(businessId => {
      const biz = (businesses ?? []).find(b => b.id === businessId)
      const conns = connsByBiz.get(businessId) ?? []
      const activeTenants = Array.from(
        new Set(conns.filter(c => c.is_active && c.tenant_id).map(c => c.tenant_id)),
      )

      // Representative connection: active beats more-recently-updated dead.
      let best: ConnectionRow | null = null
      for (const conn of conns) best = preferConnection(best as any, conn as any)
      const fromColumn = best?.last_synced_at ? new Date(best.last_synced_at).getTime() : 0
      const fromJobs = best?.tenant_id ? syncClock.byTenant.get(best.tenant_id) ?? 0 : 0
      const freshest = Math.max(fromColumn, fromJobs)
      const classification = classifyXeroConnection(
        best,
        { lastSyncMs: freshest > 0 ? freshest : null, lookupOk: syncClock.ok },
        now,
      )

      const settings = settingsByBiz.get(businessId)
      const cycle = cycleByBiz.get(businessId) ?? null
      const stage = deriveStage(cycle)
      const dueDate = dueDateForMonth(month, settings?.report_due_day ?? null)
      const overdue = daysOverdue(dueDate, todayIso)
      const recon = summariseRecon(
        checksByBiz.get(businessId) ?? [],
        bucketsByBiz.get(businessId) ?? [],
        activeTenants.length,
      )
      const section: BoardSection = deriveSection({
        stage,
        daysOverdue: overdue,
        connectionNeedsAttention: needsAttention(classification.status),
        reconState: recon.state,
      })

      return {
        business_id: businessId,
        business_name: biz?.name ?? '(Unnamed)',
        section,
        stage,
        cycle: {
          generated_at: cycle?.generated_at ?? null,
          approved_at: cycle?.approved_at ?? null,
          sent_at: cycle?.sent_at ?? null,
          discussed_at: cycle?.discussed_at ?? null,
          status: cycle?.status ?? null,
        },
        due_day: settings?.report_due_day ?? null,
        due_date: dueDate,
        days_overdue: overdue,
        connection: {
          status: classification.status,
          needs_attention: needsAttention(classification.status),
          last_sync_at: classification.lastSyncAt,
          tenant_count: activeTenants.length,
          tenant_names: conns
            .filter(c => c.is_active && c.tenant_name)
            .map(c => c.tenant_name),
        },
        recon,
        bookkeeper: {
          name: settings?.bookkeeper_name ?? null,
          email: settings?.bookkeeper_email ?? null,
        },
        // Per-account backlog hints + reconcile-screen deep links. The stale
        // flag is a SMELL (nothing coded recently), never the banner count.
        bank_accounts: (accountStatusByBiz.get(businessId) ?? [])
          .map(s => {
            const days = daysSince(s.last_coded_date, todayIso)
            return {
              bank_account_id: s.bank_account_id,
              name: s.bank_account_name,
              currency: s.currency,
              last_coded_date: s.last_coded_date,
              days_since_coded: days,
              stale: days !== null && days > STALE_CODING_DAYS,
              reconcile_url: s.short_code
                ? `https://go.xero.com/organisationlogin/default.aspx?shortcode=${encodeURIComponent(s.short_code)}&redirecturl=${encodeURIComponent(`/Bank/BankRec.aspx?accountID=${s.bank_account_id}`)}`
                : null,
            }
          })
          .sort((a, b) => (b.days_since_coded ?? -1) - (a.days_since_coded ?? -1)),
      }
    })

    // Urgency order inside the payload so the page can render top-to-bottom.
    const sectionRank: Record<BoardSection, number> = { overdue: 0, blocked: 1, in_progress: 2, sent: 3 }
    clients.sort((a, b) => {
      const d = sectionRank[a.section] - sectionRank[b.section]
      if (d !== 0) return d
      const oa = a.days_overdue ?? -1
      const ob = b.days_overdue ?? -1
      if (oa !== ob) return ob - oa
      return a.business_name.localeCompare(b.business_name)
    })

    const stats = {
      overdue: clients.filter(c => c.section === 'overdue').length,
      blocked: clients.filter(c => c.section === 'blocked').length,
      in_progress: clients.filter(c => c.section === 'in_progress').length,
      sent: clients.filter(c => c.section === 'sent').length,
      discussed: clients.filter(c => c.stage === 'discussed').length,
    }

    return NextResponse.json({ month, clients, hidden, stats })
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: 'cfo/board' },
      extra: { context: '[CFO Board] request failed' },
    } as any)
    return NextResponse.json({ error: 'Failed to load board' }, { status: 500 })
  }
}

function emptyStats() {
  return { overdue: 0, blocked: 0, in_progress: 0, sent: 0, discussed: 0 }
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const row of rows) {
    const k = key(row)
    const list = map.get(k) ?? []
    list.push(row)
    map.set(k, list)
  }
  return map
}

export const GET = withQuerySchema('cfo/board', QuerySchema, getHandler)
