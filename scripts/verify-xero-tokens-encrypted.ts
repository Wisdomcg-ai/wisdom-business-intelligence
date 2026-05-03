/**
 * Phase 46 Plan 46-02 — SEC-03 verifier.
 *
 * Asserts every xero_connections row's access_token AND refresh_token
 * is in iv:authTag:ciphertext shape (uses isEncrypted from
 * src/lib/utils/encryption.ts — 3-part base64 check, not just colon-presence).
 *
 * Run BEFORE plan 46-04 lands (which removes the plaintext fallback
 * from decrypt()). If any row fails, plan 46-04 cannot ship until
 * the row is re-encrypted or the connection is purged.
 *
 * Includes inactive rows (per RESEARCH.md SEC-03 risk mitigation): a
 * leaked DB dump exposes inactive tokens too.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/verify-xero-tokens-encrypted.ts
 *
 * Exits 0 if all rows pass; non-zero with a row report if any fail.
 */

import { createClient } from '@supabase/supabase-js'
import { isEncrypted } from '../src/lib/utils/encryption'

interface FailureRow {
  id: string
  business_id: string
  tenant_id: string
  tenant_name: string | null
  is_active: boolean
  field: 'access_token' | 'refresh_token'
  reason: string
}

async function main() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set')
    process.exit(2)
  }

  const supabase = createClient(url, key)
  const { data, error } = await supabase
    .from('xero_connections')
    .select('id, business_id, tenant_id, tenant_name, is_active, access_token, refresh_token')

  if (error) {
    console.error('xero_connections fetch failed:', error.message)
    process.exit(2)
  }

  const total = data?.length ?? 0
  const failures: FailureRow[] = []

  for (const row of data ?? []) {
    for (const field of ['access_token', 'refresh_token'] as const) {
      const value = (row as any)[field] as string | null
      if (!value) {
        failures.push({
          id: row.id,
          business_id: row.business_id,
          tenant_id: row.tenant_id,
          tenant_name: row.tenant_name,
          is_active: row.is_active,
          field,
          reason: 'null or empty',
        })
        continue
      }
      if (!isEncrypted(value)) {
        failures.push({
          id: row.id,
          business_id: row.business_id,
          tenant_id: row.tenant_id,
          tenant_name: row.tenant_name,
          is_active: row.is_active,
          field,
          reason: `not iv:authTag:ciphertext shape (length=${value.length}, parts=${value.split(':').length})`,
        })
      }
    }
  }

  const report = {
    ran_at: new Date().toISOString(),
    rows_checked: total,
    failures: failures.length,
    failure_detail: failures,
  }

  console.log(JSON.stringify(report, null, 2))
  process.exit(failures.length === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('verifier crashed:', err)
  process.exit(2)
})
