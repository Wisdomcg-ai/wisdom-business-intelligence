/**
 * The consent request in src/app/api/Xero/auth/route.ts — pinned as source
 * text because the route reads env at module load.
 *
 * Two facts are locked here:
 *   1. `accounting.budgets.read` IS requested (XERO-BUDGET-SEED-PLAN.md, PR 1).
 *   2. Scopes Xero will not grant this app stay OUT: the Finance API family and
 *      `accounting.reports.bankstatement.read` (Xero API support, 2 Sep 2026).
 *      Requesting a scope Xero refuses breaks consent for every org.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const ROUTE = path.join(process.cwd(), 'src/app/api/Xero/auth/route.ts')

function requestedScopes(): string[] {
  const src = fs.readFileSync(ROUTE, 'utf8')
  const block = src.match(/const SCOPES = \[([\s\S]*?)\]\.join\(' '\)/)
  if (!block) throw new Error('SCOPES array not found in auth route')
  return Array.from(block[1].matchAll(/^\s*'([^']+)'/gm)).map((m) => m[1])
}

describe('Xero consent request (auth route SCOPES)', () => {
  it('requests read-only budgets access for the forecast wizard seed', () => {
    expect(requestedScopes()).toContain('accounting.budgets.read')
  })
  it('does not request a write variant of budgets (none exists; keep least privilege)', () => {
    expect(requestedScopes().filter((s) => s.startsWith('accounting.budgets'))).toEqual(['accounting.budgets.read'])
  })
  it('never requests scopes Xero will not grant this app', () => {
    const scopes = requestedScopes()
    expect(scopes.some((s) => s.startsWith('finance.'))).toBe(false)
    expect(scopes).not.toContain('accounting.reports.bankstatement.read')
  })
  it('still carries the scopes the sync pipeline depends on', () => {
    const scopes = requestedScopes()
    for (const required of ['offline_access', 'accounting.reports.read', 'accounting.settings.read', 'accounting.transactions.read']) {
      expect(scopes).toContain(required)
    }
  })
})
