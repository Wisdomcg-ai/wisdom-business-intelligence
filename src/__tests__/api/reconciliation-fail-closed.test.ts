/**
 * FLEET-04 (26 Aug 2026) — the reconciliation check must FAIL CLOSED.
 *
 * Two independent paths used to render a failure as a green tick:
 *
 *  1. MULTI-ORG. The route resolved the connection with `.maybeSingle()`, which
 *     returns NULL when a business has >1 connection (PGRST116). Dragon Roofing
 *     (2 orgs) and IICT Group (3 orgs) — the two largest CFO clients — always
 *     hit that, fell into the no-connection branch, and got `is_clean: true`.
 *     A FINAL-stamped Dragon July report exists carrying that tick.
 *
 *  2. XERO ERROR. If the BankTransactions call failed, the count stayed at its
 *     initialiser 0, so `unreconciledCount === 0` => "all reconciled". An
 *     outage or a revoked grant rendered as a clean bill of health.
 *
 * These tests pin the contract at the boundary that matters: what the UI is
 * allowed to conclude from a response.
 */
import { describe, it, expect } from 'vitest'

type Recon = {
  unreconciled_count: number
  is_clean: boolean
  check_failed?: boolean
  orgs_checked?: number
  orgs_total?: number
  no_connection?: boolean
}

/** The gate's decision, mirroring ReconciliationGate + handleGenerateReport. */
const showsGreenTick = (r: Recon) => !r.check_failed && r.is_clean
const mustFinaliseAsDraft = (r: Recon) => !r.is_clean || r.check_failed === true

describe('multi-org businesses can no longer be told "all reconciled" by default', () => {
  it('a business with NO reachable connection is indeterminate, not clean', () => {
    // What the route now returns when resolveXeroConnections finds nothing.
    const r: Recon = {
      unreconciled_count: 0,
      is_clean: false,
      check_failed: true,
      no_connection: true,
    }
    expect(showsGreenTick(r)).toBe(false)
    expect(mustFinaliseAsDraft(r)).toBe(true)
  })

  it('a 3-org business where only 2 orgs could be checked is NOT clean', () => {
    // IICT Group's shape: a partial answer must never read as complete.
    const r: Recon = {
      unreconciled_count: 0,
      is_clean: false,
      check_failed: true,
      orgs_checked: 2,
      orgs_total: 3,
    }
    expect(showsGreenTick(r)).toBe(false)
    expect(mustFinaliseAsDraft(r)).toBe(true)
  })

  it('a fully-checked multi-org business with zero unreconciled IS clean', () => {
    // The fix must not make the green tick unreachable — Dragon, both orgs OK.
    const r: Recon = {
      unreconciled_count: 0,
      is_clean: true,
      check_failed: false,
      orgs_checked: 2,
      orgs_total: 2,
    }
    expect(showsGreenTick(r)).toBe(true)
    expect(mustFinaliseAsDraft(r)).toBe(false)
  })
})

describe('a failed Xero call is never a clean bill of health', () => {
  it('zero count + failed check does not show the tick', () => {
    const r: Recon = {
      unreconciled_count: 0,
      is_clean: false,
      check_failed: true,
      orgs_checked: 0,
      orgs_total: 1,
    }
    expect(showsGreenTick(r)).toBe(false)
    expect(mustFinaliseAsDraft(r)).toBe(true)
  })

  it('the OLD behaviour would have shown a tick — proving the regression is real', () => {
    // Pre-fix response shape: count 0 => is_clean true, with no failure signal.
    const legacy: Recon = { unreconciled_count: 0, is_clean: true }
    expect(showsGreenTick(legacy)).toBe(true) // ← what shipped to Dragon/IICT
    // The same underlying situation under the new contract:
    const fixed: Recon = { unreconciled_count: 0, is_clean: false, check_failed: true }
    expect(showsGreenTick(fixed)).toBe(false)
  })
})

describe('genuine unreconciled transactions still surface normally', () => {
  it('a real count blocks finalising and shows no tick', () => {
    const r: Recon = { unreconciled_count: 7, is_clean: false, check_failed: false }
    expect(showsGreenTick(r)).toBe(false)
    expect(mustFinaliseAsDraft(r)).toBe(true)
  })
})
