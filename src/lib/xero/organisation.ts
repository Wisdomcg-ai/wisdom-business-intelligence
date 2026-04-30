/**
 * Phase 44.2 Plan 44.2-06B Task 2 — /Organisation timezone fetcher.
 *
 * Pulls GET /api.xro/2.0/Organisation once per tenant per sync and returns
 * the org's IANA timezone name (e.g. 'Australia/Sydney', 'Asia/Hong_Kong').
 *
 * Why: today's orchestrator computes FY boundaries using the server's local
 * Date(), not the Xero org's local time. For tenants in non-AEST zones (or
 * for AEST tenants when the Vercel host is UTC), this can shift the FY
 * rollover by a day at exactly the boundary — causing the by-month query
 * to start one calendar day off and miss the first day of FY revenue.
 *
 * Caller is expected to cache per-sync (one Map<tenant_id, IANA-name>).
 *
 * Reference: https://developer.xero.com/documentation/api/accounting/types#timezones
 */
import * as Sentry from '@sentry/nextjs'
import {
  fetchXeroWithRateLimit,
} from './xero-api-client'

// ─── Public types ───────────────────────────────────────────────────────────

export type XeroConnectionRef = {
  tenant_id: string
}

export type OrgTimezone = {
  timezone: string // IANA TZ name, e.g. 'Australia/Sydney'
  countryCode: string
}

// ─── Xero TZ → IANA mapping ─────────────────────────────────────────────────

/**
 * Xero's enumerated TimeZone strings → IANA TZ names.
 * Source: Xero Accounting API "Types" reference.
 *
 * Complete-enough table for the markets in the platform's customer base
 * (AU, NZ, US, UK, Europe, India, Japan, Hong Kong, China). Unknown codes
 * fall back to UTC with a Sentry warning so the operator can extend the
 * table without losing the sync.
 */
const XERO_TZ_TO_IANA: Record<string, string> = {
  // Australia
  AUSEASTERNSTANDARDTIME: 'Australia/Sydney',
  AUSCENTRALSTANDARDTIME: 'Australia/Adelaide',
  AUSWESTSTANDARDTIME: 'Australia/Perth',
  CENAUSTRALIASTANDARDTIME: 'Australia/Adelaide',
  EAUSTRALIASTANDARDTIME: 'Australia/Brisbane',
  TASMANIASTANDARDTIME: 'Australia/Hobart',
  // New Zealand
  NZSTANDARDTIME: 'Pacific/Auckland',
  NEWZEALANDSTANDARDTIME: 'Pacific/Auckland',
  // United States / North America
  EASTERNSTANDARDTIME: 'America/New_York',
  USEASTERNSTANDARDTIME: 'America/Indianapolis',
  CENTRALSTANDARDTIME: 'America/Chicago',
  MOUNTAINSTANDARDTIME: 'America/Denver',
  PACIFICSTANDARDTIME: 'America/Los_Angeles',
  USPACIFICSTANDARDTIME: 'America/Los_Angeles',
  CANADACENTRALSTANDARDTIME: 'America/Regina',
  // Europe / UK
  GMTSTANDARDTIME: 'Europe/London',
  GREENWICHSTANDARDTIME: 'Atlantic/Reykjavik',
  CENTRALEUROPEANSTANDARDTIME: 'Europe/Warsaw',
  EUROPEANCENTRALTIME: 'Europe/Paris',
  WEUROPESTANDARDTIME: 'Europe/Berlin',
  // Asia
  INDIASTANDARDTIME: 'Asia/Kolkata',
  JAPANSTANDARDTIME: 'Asia/Tokyo',
  HONGKONGSTANDARDTIME: 'Asia/Hong_Kong',
  CHINASTANDARDTIME: 'Asia/Shanghai',
  SINGAPORESTANDARDTIME: 'Asia/Singapore',
  // UTC
  UTC: 'UTC',
}

/**
 * Map a Xero `Timezone` string to an IANA TZ name.
 *
 * Returns 'UTC' for unknown codes (caller should emit a Sentry breadcrumb
 * so the table can be extended). Case-insensitive lookup.
 */
export function mapXeroTimezoneToIANA(xeroTimezone: string): string {
  if (!xeroTimezone) return 'UTC'
  const key = String(xeroTimezone).toUpperCase().replace(/\s/g, '')
  return XERO_TZ_TO_IANA[key] ?? 'UTC'
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Fetch the Xero organisation's local timezone (IANA form) and country code.
 *
 * @throws RateLimitDailyExceededError if Xero returns 429-daily.
 * @throws Error if the Organisation list is empty/missing.
 */
export async function getXeroOrgTimezone(
  connection: XeroConnectionRef,
  accessToken: string,
): Promise<OrgTimezone> {
  const url = 'https://api.xero.com/api.xro/2.0/Organisation'
  const res = await fetchXeroWithRateLimit(url, {
    accessToken,
    tenantId: connection.tenant_id,
  })

  const orgs = (res.json as any)?.Organisations
  if (!Array.isArray(orgs) || orgs.length === 0) {
    throw new Error(
      `xero /Organisation returned no organisations for tenant ${connection.tenant_id}`,
    )
  }
  const org = orgs[0]
  const xeroTz = String(org?.Timezone ?? '')
  const countryCode = String(org?.CountryCode ?? '')

  const iana = mapXeroTimezoneToIANA(xeroTz)
  if (iana === 'UTC' && xeroTz && xeroTz.toUpperCase() !== 'UTC') {
    try {
      Sentry.captureMessage(`Unknown Xero timezone code "${xeroTz}" for tenant ${connection.tenant_id} — falling back to UTC`, {
        level: 'warning',
        tags: {
          invariant: 'xero_org_timezone',
          tenant_id: connection.tenant_id,
          xero_timezone: xeroTz,
        },
      } as any)
    } catch {
      // Sentry failure must never abort the sync.
    }
  }

  return { timezone: iana, countryCode }
}
