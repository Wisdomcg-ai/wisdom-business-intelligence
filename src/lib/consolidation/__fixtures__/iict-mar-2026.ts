/**
 * IICT Consolidation — reference fixture for Mar 2026.
 *
 * Source: Matt's IICT Consolidated Finance Report March 2026 PDF.
 *
 * Three-entity group:
 *   1. IICT (Aust) Pty Ltd — functional currency AUD
 *   2. IICT Group Pty Ltd — functional currency AUD
 *   3. IICT Group Limited — functional currency HKD (Hong Kong-incorporated,
 *      confirmed by user 2026-04-18). Numbers in `iictHKPL.monthly_values`
 *      are raw HKD from the PDF (pre-translation).
 *
 * The engine (plan 00b) translates IICT Group Limited HKD → AUD at the
 * monthly_average rate stored in `HKD_AUD_MONTHLY`, then aggregates with
 * the two AUD members. Currency pair uses slash ('HKD/AUD') per PATTERNS.md.
 *
 * P&L-level intercompany transactions in March 2026 appear minimal per
 * CONTEXT.md § IICT elimination rules — inter-entity activity flows through
 * BS loan accounts which are an Iteration 34.1 concern, not 34.0.
 */

import type { XeroPLLineLike } from '../types'

/** 12 FY months July 2025 → June 2026 (AU financial year). */
export const FY_MONTHS = [
  '2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12',
  '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06',
] as const

/** Build a monthly_values map with the same value for every month. */
export function evenSpread(months: readonly string[], amount: number): Record<string, number> {
  const result: Record<string, number> = {}
  for (const m of months) result[m] = amount
  return result
}

// Hardcoded business IDs for fixture purposes — production uses
// resolveBusinessIds() to fetch real UUIDs from the businesses table.
export const IICT_AUST_BIZ = '00000000-0000-0000-0000-iictaust0aust'
export const IICT_GROUP_PTY_BIZ = '00000000-0000-0000-0000-iictgrp0ptyl'
export const IICT_HK_BIZ = '00000000-0000-0000-0000-iicthkltd00hk'

/**
 * IICT (Aust) Pty Ltd — AUD functional currency. Transcribed from PDF.
 *
 * Non-intercompany P&L rows — passes through consolidation unchanged.
 */
export const iictAustPL: XeroPLLineLike[] = [
  {
    business_id: IICT_AUST_BIZ,
    account_name: 'Revenue - Services',
    account_code: '200',
    account_type: 'revenue',
    section: 'Revenue',
    // TODO_MATT_CONFIRM: exact Mar 2026 services revenue on IICT Aust column
    monthly_values: { '2026-03': 0 },
  },
  {
    business_id: IICT_AUST_BIZ,
    account_name: 'Wages and Salaries',
    account_code: '477',
    account_type: 'opex',
    section: 'Operating Expenses',
    // TODO_MATT_CONFIRM: exact Mar 2026 wages on IICT Aust column
    monthly_values: { '2026-03': 0 },
  },
  // TODO_MATT_CONFIRM: add remaining anchored account rows when PDF re-read.
]

/**
 * IICT Group Pty Ltd — AUD functional currency. Holding/admin entity.
 */
export const iictGroupPtyLtdPL: XeroPLLineLike[] = [
  {
    business_id: IICT_GROUP_PTY_BIZ,
    account_name: 'Management Fees',
    account_code: '205',
    account_type: 'revenue',
    section: 'Revenue',
    // TODO_MATT_CONFIRM: exact Mar 2026 management fees on IICT Group Pty Ltd column
    monthly_values: { '2026-03': 0 },
  },
  {
    business_id: IICT_GROUP_PTY_BIZ,
    account_name: 'Administration Expenses',
    account_code: '401',
    account_type: 'opex',
    section: 'Operating Expenses',
    // TODO_MATT_CONFIRM: exact Mar 2026 admin expenses on IICT Group Pty Ltd column
    monthly_values: { '2026-03': 0 },
  },
]

/**
 * IICT Group Limited — HKD functional currency (Hong Kong-incorporated).
 *
 * IMPORTANT: monthly_values below are in HKD. The engine must translate
 * these at the HKD/AUD monthly_average rate for the reporting month BEFORE
 * aggregating into the consolidated total.
 */
export const iictHKPL: XeroPLLineLike[] = [
  {
    business_id: IICT_HK_BIZ,
    account_name: 'Revenue - HK Operations',
    account_code: '200',
    account_type: 'revenue',
    section: 'Revenue',
    // TODO_MATT_CONFIRM: exact Mar 2026 HK revenue (HKD) on IICT Group Limited column
    monthly_values: { '2026-03': 0 },
  },
  {
    business_id: IICT_HK_BIZ,
    account_name: 'HK Operating Costs',
    account_code: '420',
    account_type: 'opex',
    section: 'Operating Expenses',
    // TODO_MATT_CONFIRM: exact Mar 2026 HK operating costs (HKD)
    monthly_values: { '2026-03': 0 },
  },
]

/**
 * HKD/AUD monthly-average translation rates.
 *
 * Keys use the slash format 'HKD/AUD' everywhere in Phase 34 (per
 * PATTERNS.md § fx.ts + schema). Values are the rate that multiplies an
 * HKD amount to produce its AUD equivalent for the reporting month.
 *
 * Seed values below are indicative only — TODO_MATT_CONFIRM against the
 * exact rate used in the reference PDF. Downstream engine tests must
 * override these via dependency injection rather than assuming this table
 * is authoritative for production.
 */
export const HKD_AUD_MONTHLY: Record<string, number> = {
  '2026-03': 0.1925, // TODO_MATT_CONFIRM — monthly_average rate used in the Mar 2026 PDF (HKD/AUD)
  '2026-02': 0.1928, // TODO_MATT_CONFIRM
}

/**
 * Expected consolidated totals for Mar 2026 (AUD presentation currency).
 *
 * Key format: `${account_type}::${account_name.toLowerCase().trim()}`.
 *
 * Derivation (once TODO_MATT_CONFIRM values filled in):
 *   - AUD members (IICT Aust + IICT Group Pty Ltd) pass through.
 *   - HK member translated at HKD_AUD_MONTHLY['2026-03'] = 0.1925 before aggregation.
 *   - No P&L-level eliminations in March 2026 (intercompany activity is BS-level).
 */
export const iictExpectedConsolidated = {
  '2026-03': {
    // TODO_MATT_CONFIRM: fill in per-account consolidated AUD totals once
    // all three member PLs are transcribed and the HKD rate is confirmed.
    // Example shape:
    //   'revenue::revenue - services': <AUD sum>,
    //   'opex::wages and salaries': <AUD sum>,
  },
} as const

/**
 * Convenience — currency pair literal used by the FX loader.
 * Keeping this as a named export so tests and engine code can import one
 * constant rather than repeating the literal string.
 */
export const IICT_FX_PAIR: 'HKD/AUD' = 'HKD/AUD'
