/**
 * Balance-sheet mirror sync — ONE definition, two callers.
 *
 * Fetches the most recent month-end BalanceSheet reports for every active
 * Xero connection of a business, classifies each row against the chart of
 * accounts (catalog `xero_class` first, section title as fallback — PR #373),
 * and swaps the tenant's rows in `xero_balance_sheet_lines`.
 *
 * Extracted from `api/monthly-report/sync-xero/route.ts` so a cron can run it.
 * Until now this table was written ONLY when someone clicked "Sync" in the UI —
 * it was on no cron at all — so the daily `bs_equation` invariant was checking
 * data that refreshed on manual clicks, and the #373 parser fix sat dormant
 * (verified: zero rows written in the four days after it deployed). The route
 * and the cron now share this function, so their behaviour cannot drift.
 *
 * Callers own auth and enumeration:
 *   - the route authenticates the user and passes its already-fetched
 *     connections;
 *   - the cron gates on CRON_SECRET and enumerates every connected business.
 */
import * as Sentry from '@sentry/nextjs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getValidAccessToken } from '@/lib/xero/token-manager'
import { replaceTenantBSRows } from '@/app/api/monthly-report/sync-xero/bs-writer'
import {
  parseSingleMonthBSReport,
  mapXeroClassToType,
} from '@/app/api/monthly-report/sync-xero/report-parsers'

/** Last day of a month (1-based month), as YYYY-MM-DD. */
function lastDay(year: number, month: number): string {
  const d = new Date(year, month, 0)
  return d.toISOString().split('T')[0]
}

/** Month keys for the last N months, newest first. Includes the current
 *  (in-progress) month — its figures keep moving until the month closes, which
 *  is expected and why in-progress months never reconcile exactly. */
export function getBSMonthList(count: number): { key: string; toDate: string }[] {
  const now = new Date()
  const months: { key: string; toDate: string }[] = []
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const y = d.getFullYear()
    const m = d.getMonth() + 1
    months.push({ key: `${y}-${String(m).padStart(2, '0')}`, toDate: lastDay(y, m) })
  }
  return months
}

async function fetchSingleMonthBS(
  accessToken: string,
  tenantId: string,
  reportDate: string, // YYYY-MM-DD
): Promise<{ success: boolean; report?: any; error?: string; status?: number }> {
  const url = `https://api.xero.com/api.xro/2.0/Reports/BalanceSheet?date=${reportDate}&periods=1&timeframe=MONTH&standardLayout=true`
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'xero-tenant-id': tenantId,
      'Accept': 'application/json',
    },
  })
  if (!response.ok) {
    const errText = await response.text()
    return { success: false, error: errText, status: response.status }
  }
  const data = await response.json()
  return { success: true, report: data?.Reports?.[0] }
}

export interface BSMirrorSyncResult {
  syncedTenantIds: string[]
  perTenantErrors: { tenant_id: string; error: string }[]
  /** Months that failed to fetch and are therefore ABSENT from the stored grid.
   *  Reported separately from perTenantErrors because the tenant did sync — it
   *  just synced fewer months than it should have. */
  missedMonths: { tenant_id: string; month: string; reason: string }[]
  monthsPerTenant: number
}

/**
 * Sync the wide BS mirror for one business.
 *
 * @param businessId canonical `businesses.id` — `xero_balance_sheet_lines`'
 *   FK targets businesses(id), NOT business_profiles(id). Callers resolve
 *   before calling; passing a profile-space id here would violate the FK.
 * @param connections the business's ACTIVE xero_connections rows.
 * @param monthCount month-ends to fetch per tenant (default 3, matching the
 *   window this table has always stored).
 */
export async function syncBusinessBSMirror(
  supabaseAdmin: SupabaseClient,
  businessId: string,
  connections: any[],
  monthCount = 3,
): Promise<BSMirrorSyncResult> {
  const perTenantErrors: { tenant_id: string; error: string }[] = []
  const missedMonths: { tenant_id: string; month: string; reason: string }[] = []
  const syncedTenantIds: string[] = []
  const bsMonths = getBSMonthList(monthCount)

  for (const connection of connections) {
    const tenantId = connection.tenant_id
    const tenantLabel = connection.display_name || connection.tenant_name || tenantId
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[Sync Xero] === BS sync for tenant ${tenantLabel} (${tenantId}) ===`)
    }

    const tokenResult = await getValidAccessToken(connection, supabaseAdmin)
    if (!tokenResult.success || !tokenResult.accessToken) {
      perTenantErrors.push({ tenant_id: tenantId, error: `Token: ${tokenResult.message || tokenResult.error}` })
      continue // Skip this tenant, try the next
    }
    const accessToken = tokenResult.accessToken

    // Chart of accounts for THIS tenant, keyed by Xero account GUID. The BS
    // report carries that GUID on every data row, and xero_class is the
    // authoritative asset/liability/equity classification — layout-independent,
    // unlike the section titles a client can rename at will.
    const { data: catalogRows } = await supabaseAdmin
      .from('xero_accounts')
      .select('xero_account_id, xero_class')
      .eq('tenant_id', tenantId)
    const classByAccountId = new Map<string, string>()
    for (const a of catalogRows || []) {
      if (a.xero_account_id && a.xero_class) classByAccountId.set(a.xero_account_id, a.xero_class)
    }
    const classifyByAccountId = (accountId: string) =>
      mapXeroClassToType(classByAccountId.get(accountId))

    /** Rows we could classify by neither catalog nor section title. */
    const unclassifiedBS: { name: string; section: string; accountId: string | null }[] = []

    const tenantBSAccounts = new Map<string, {
      business_id: string
      tenant_id: string
      account_name: string
      account_code: string | null
      account_type: 'asset' | 'liability' | 'equity'
      section: string
      monthly_values: Record<string, number>
      updated_at: string
    }>()

    for (const month of bsMonths) {
      // Pacing — stay under Xero's 60/min limit
      await new Promise((r) => setTimeout(r, 500))
      const bsResult = await fetchSingleMonthBS(accessToken, tenantId, month.toDate)
      if (!bsResult.success) {
        Sentry.captureMessage(`[Sync Xero BS] ${tenantLabel} ${month.key}: ${bsResult.status} ${bsResult.error?.slice(0, 150)}`, 'warning' as any)
        // The swap below replaces the tenant's whole grid, so a month that
        // failed here is DELETED from the mirror rather than left as it was.
        // Record it: a transient 429 on one of three months must not be able to
        // shrink the stored balance sheet and still report a clean run.
        missedMonths.push({ tenant_id: tenantId, month: month.key, reason: `fetch ${bsResult.status ?? 'error'}` })
        continue
      }
      if (!bsResult.report) {
        missedMonths.push({ tenant_id: tenantId, month: month.key, reason: 'empty report' })
        continue
      }

      const bsAccounts = parseSingleMonthBSReport(bsResult.report, classifyByAccountId)
      for (const [name, data] of bsAccounts) {
        if (!data.account_type) {
          // Do NOT silently drop it — that is the defect this fix exists to end.
          if (!unclassifiedBS.some((u) => u.name === name)) {
            unclassifiedBS.push({ name, section: data.section, accountId: data.account_id })
          }
          continue
        }
        const existing = tenantBSAccounts.get(name) || {
          business_id: businessId,
          tenant_id: tenantId,
          account_name: name,
          account_code: null,
          account_type: data.account_type,
          section: data.section,
          monthly_values: {} as Record<string, number>,
          updated_at: new Date().toISOString(),
        }
        existing.monthly_values[month.key] = data.value
        tenantBSAccounts.set(name, existing)
      }
    }

    const tenantBSLines = Array.from(tenantBSAccounts.values()).filter(
      (l) => Object.keys(l.monthly_values).length > 0,
    )

    // A row we cannot classify means the stored balance sheet is INCOMPLETE, and
    // an incomplete balance sheet does not balance. Surfacing it is the whole
    // point: the previous parser discarded these silently, so 888 bank rows
    // vanished across 13 tenants and no real tenant's BS ever balanced.
    if (unclassifiedBS.length > 0) {
      Sentry.captureMessage(
        `[Sync Xero BS] ${tenantLabel}: ${unclassifiedBS.length} unclassified balance-sheet row(s) — stored BS will not balance`,
        {
          level: 'warning' as any,
          tags: { invariant: 'bs-unclassified-row' },
          extra: { tenantId, tenantLabel, rows: unclassifiedBS.slice(0, 25) },
        } as any,
      )
    }

    // Replace this tenant's BS rows atomically-enough (R25 / DM-N5).
    // delete + insert are scoped to the same id-space (businessId — the table
    // FK is businesses(id)); an empty fetch never wipes good rows; and a
    // failed insert restores the prior rows + surfaces as a tenant error
    // instead of silently returning success with an empty balance sheet.
    const bsSwap = await replaceTenantBSRows(supabaseAdmin, {
      businessId,
      tenantId,
      tenantLabel,
      newRows: tenantBSLines,
    })
    if (bsSwap.status === 'delete_failed' || bsSwap.status === 'insert_failed') {
      perTenantErrors.push({
        tenant_id: tenantId,
        error: `BS sync failed (${bsSwap.status}${bsSwap.status === 'insert_failed' ? `, restored=${bsSwap.restored ?? false}` : ''}): ${bsSwap.error ?? 'unknown'}`,
      })
    } else if (bsSwap.status === 'written' && process.env.NODE_ENV !== 'production') {
      console.log(`[Sync Xero BS] ${tenantLabel}: ${bsSwap.written} BS accounts (${bsMonths.length} months)`)
    }

    // Deliberately NOT stamping last_synced_at here. connection-health and the
    // daily health report read that column as the DATA freshness clock ("are the
    // numbers on screen current"), and this function syncs only the balance
    // sheet. The manual route bumps it because the same request also runs the
    // P&L orchestrator; if the daily BS-only cron bumped it, a tenant whose P&L
    // sync was broken would read as fresh — masking exactly the staleness those
    // checks exist to catch. The stamp lives with the caller that earns it.

    syncedTenantIds.push(tenantId)
  }

  return { syncedTenantIds, perTenantErrors, missedMonths, monthsPerTenant: bsMonths.length }
}
