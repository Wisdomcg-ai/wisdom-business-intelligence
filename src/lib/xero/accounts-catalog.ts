/**
 * Phase 44.2 Plan 44.2-06B Task 3 — xero_accounts catalog refresh.
 *
 * Pulls GET /api.xro/2.0/Accounts once per tenant per sync, upserts every
 * Account into the xero_accounts catalog, and returns a Map keyed on the
 * Xero AccountID GUID for fast in-memory lookup during the orchestrator's
 * per-month parse pass.
 *
 * Why: today's xero_pl_lines.account_code is whatever the by-month parser
 * scraped from Cells[0].Attributes — which is the AccountID GUID, not the
 * user-facing Xero Code (200/300/400). 06A added a separate account_id
 * column so account_code can finally hold the friendly code. This module
 * is the bridge: feed it the per-month parser's account_id GUID, get back
 * the canonical Code from this Map, and write it to xero_pl_lines.
 *
 * Idempotency comes from the unique constraint on (business_id, tenant_id,
 * xero_account_id) — repeated calls upsert in place.
 */
import {
  fetchXeroWithRateLimit,
} from './xero-api-client'

// ─── Public types ───────────────────────────────────────────────────────────

export type XeroConnectionForCatalog = {
  id: string
  tenant_id: string
  business_id: string
}

export type CatalogEntry = {
  account_code: string | null
  account_name: string
  account_type: string
}

export type CatalogMap = Map<string, CatalogEntry>

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Map a Xero Account.Type to the high-level class used by our settings UI.
 * Mirrors src/app/api/Xero/chart-of-accounts-full/route.ts so the cached
 * xero_accounts.xero_class column stays consistent across both refresh
 * paths (manual COA refresh + sync orchestrator).
 */
function classifyXeroAccount(xeroType: string | undefined): string {
  const t = (xeroType ?? '').toUpperCase()
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

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Refresh the xero_accounts catalog for one tenant and return a per-account
 * Map for fast lookup during the orchestrator's per-month parse pass.
 *
 * @param supabase    Service-role client (admin).
 * @param connection  xero_connections row identifying the tenant.
 * @param accessToken Valid OAuth access token for that tenant.
 *
 * @returns Map<account_id, { account_code, account_name, account_type }>
 *
 * @throws RateLimitDailyExceededError if Xero returns 429-daily — caller
 *         must mark the tenant 'paused' and resume on next sync.
 */
export async function refreshXeroAccountsCatalog(
  supabase: any,
  connection: XeroConnectionForCatalog,
  accessToken: string,
): Promise<CatalogMap> {
  const url = 'https://api.xero.com/api.xro/2.0/Accounts'
  const res = await fetchXeroWithRateLimit(url, {
    accessToken,
    tenantId: connection.tenant_id,
  })

  const accounts = ((res.json as any)?.Accounts ?? []) as any[]
  const nowIso = new Date().toISOString()
  const map: CatalogMap = new Map()

  const rows = accounts.map((a: any) => {
    const accountId = String(a?.AccountID ?? '')
    const accountCode: string | null = a?.Code ?? null
    const accountName: string = a?.Name ?? ''
    const accountType: string = a?.Type ?? 'OTHER'
    map.set(accountId, {
      account_code: accountCode,
      account_name: accountName,
      account_type: accountType,
    })
    return {
      business_id: connection.business_id,
      tenant_id: connection.tenant_id,
      xero_account_id: accountId,
      account_code: accountCode,
      account_name: accountName,
      xero_type: accountType,
      xero_class: classifyXeroAccount(accountType),
      xero_status: a?.Status ?? null,
      tax_type: a?.TaxType ?? null,
      description: a?.Description ?? null,
      bank_account_type: accountType === 'BANK' ? (a?.BankAccountType ?? null) : null,
      last_synced_at: nowIso,
    }
  })

  if (rows.length === 0) return map

  const upsertResult = (await supabase
    .from('xero_accounts')
    .upsert(rows, {
      onConflict: 'business_id,tenant_id,xero_account_id',
      ignoreDuplicates: false,
    })) as any
  if (upsertResult?.error) {
    throw new Error(
      `xero_accounts upsert failed for tenant ${connection.tenant_id}: ${
        upsertResult.error.message ?? upsertResult.error.code ?? 'unknown'
      }`,
    )
  }

  return map
}
