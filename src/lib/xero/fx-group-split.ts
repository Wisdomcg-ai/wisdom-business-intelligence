/**
 * FX account split — the pure decision.
 *
 * Xero's P&L (Reports/ProfitAndLoss, standardLayout=false) sends an org's three
 * system FX accounts as ONE row whose account attribute is the literal
 * "FXGROUPID". No P&L parameter breaks it out. Urban Road's merged row is
 * 238.61 for Jul-26 and 919.25 for Aug-26 — and Calxa's pack prints it as three
 * accounts: Bank Revaluations 77 / 97, Unrealised Currency Gains (124) / 484,
 * Realised Currency Gains 286 / 338. Because our merged row has no code, it
 * borrowed 62700 from its mapping and bound to that account's $2 budget, and
 * the Aug statement printed "2 / 919 / (917)" under a heading Calxa shows as
 * "2 / 0 / 2".
 *
 * Reports/TrialBalance?date=<month end> carries each account's calendar-month
 * movement (Debit/Credit), and in the committed IICT/JDS captures those
 * movements add up to the merged P&L row to the cent in 6 of 6 months. So,
 * per tenant-month: replace the merged row with the coded system-account rows
 * ONLY when they sum to it within $0.05. Otherwise keep the merged row — its
 * total is right, only its breakdown is missing.
 *
 * Rows are stored as the Trial Balance facts, unadjusted. Xero rounds per
 * account (Urban Road Mar-26: 368.44 across the three against 368.43 merged),
 * so the residual is RECORDED and never forced into a row. Never clamp.
 *
 * Pure: same input → same output. No I/O, no clock.
 */
import { classifyByXeroType, type CatalogMap } from './accounts-catalog'
import { fxGroupAccountId, type ParsedPLRow } from './pl-single-period-parser'
import type { ParsedTBRow } from './trialbalance-parser'

/** Account.SystemAccount values of the three FX accounts, in print order. */
export const FX_SYSTEM_ACCOUNTS = [
  'BANKCURRENCYGAIN',
  'UNREALISEDCURRENCYGAIN',
  'REALISEDCURRENCYGAIN',
] as const

/**
 * Same materiality as the P&L reconciler and the BS equation gate: Xero
 * disagrees with itself by cents on FX-revalued figures; every genuine defect
 * we have caught is thousands. `> 0.05` fails; exactly $0.05 passes.
 */
export const FX_SPLIT_MATERIALITY = 0.05

/** Types a merged row may carry for us to split it (expense side only). */
const EXPENSE_SIDE = new Set(['opex', 'other_expense', 'cogs'])

export type FxSplitKeptReason =
  /** The merged row sits on the revenue side, or a system account is not an expense type. */
  | 'section'
  /** The system accounts do not add up to the merged row within materiality. */
  | 'unreconciled'
  /** No FX system account in the catalog, or none of them in the Trial Balance. */
  | 'no_system_accounts'
  /**
   * More than one merged row in a month, or a coded FX account already on the
   * P&L as its own row — neither is a shape Xero is known to send.
   */
  | 'ambiguous'

export type FxSplitOutcome =
  /** The month has no merged row — nothing to do. */
  | { kind: 'none' }
  /** The merged row is exactly 0.00 — emit nothing, fetch nothing. */
  | { kind: 'zero'; merged: ParsedPLRow }
  | { kind: 'split'; merged: ParsedPLRow; rows: ParsedPLRow[]; residual: number }
  | { kind: 'kept'; merged: ParsedPLRow; reason: FxSplitKeptReason; delta?: number }

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function systemRank(systemAccount: string | null | undefined): number {
  const i = FX_SYSTEM_ACCOUNTS.indexOf((systemAccount ?? '') as (typeof FX_SYSTEM_ACCOUNTS)[number])
  return i
}

/**
 * The catalog account ids whose SystemAccount is one of the FX three, in print
 * order (Bank Revaluations, Unrealised, Realised).
 */
export function fxSystemAccountIds(catalog: CatalogMap): string[] {
  return Array.from(catalog.entries())
    .filter(([, e]) => systemRank(e.system_account) >= 0)
    .sort((a, b) => systemRank(a[1].system_account) - systemRank(b[1].system_account) || a[0].localeCompare(b[0]))
    .map(([id]) => id)
}

/** The month's merged FXGROUPID rows, recognised by identity, not name. */
export function mergedFxRows(plRows: readonly ParsedPLRow[], tenantId: string): ParsedPLRow[] {
  const id = fxGroupAccountId(tenantId)
  return plRows.filter((r) => r.account_id === id)
}

export function splitFxGroupMonth(input: {
  /** ONE month's accruals rows for ONE tenant, as parsePLSinglePeriod returned them. */
  plRows: readonly ParsedPLRow[]
  /** That month's Trial Balance movements (parseTrialBalanceMovements), same tenant. */
  tbMovements: readonly ParsedTBRow[]
  catalog: CatalogMap
  tenantId: string
  materiality?: number
}): FxSplitOutcome {
  const materiality = input.materiality ?? FX_SPLIT_MATERIALITY
  const merged = mergedFxRows(input.plRows, input.tenantId)
  if (merged.length === 0) return { kind: 'none' }
  const row = merged[0]!
  if (merged.length > 1) return { kind: 'kept', merged: row, reason: 'ambiguous' }
  if (round2(row.amount) === 0) return { kind: 'zero', merged: row }

  const fxIds = fxSystemAccountIds(input.catalog)
  if (fxIds.length === 0) return { kind: 'kept', merged: row, reason: 'no_system_accounts' }

  // A coded FX account that already has its own P&L row this month would be
  // emitted twice on the same (business, tenant, account_id, month, basis) —
  // and Postgres rejects the WHOLE upsert ("ON CONFLICT DO UPDATE command
  // cannot affect row a second time"), erroring the tenant. Xero groups these
  // accounts, so this is not expected; decided without a Trial Balance, so it
  // costs no request either.
  const fxIdSet = new Set(fxIds)
  if (input.plRows.some((r) => fxIdSet.has(r.account_id))) {
    return { kind: 'kept', merged: row, reason: 'ambiguous' }
  }

  // Revenue-side FX layouts are left alone rather than re-signed: an org that
  // drags the group into Other Income would need every coded row's sign
  // flipped to keep the total, and that is a guess about intent.
  const allExpense = fxIds.every((id) => {
    const t = classifyByXeroType(input.catalog.get(id)?.account_type)
    return t !== null && EXPENSE_SIDE.has(t)
  })
  if (!EXPENSE_SIDE.has(row.account_type) || !allExpense) {
    return { kind: 'kept', merged: row, reason: 'section' }
  }

  const movement = new Map<string, number>()
  let seen = false
  for (const tb of input.tbMovements) {
    if (!tb.account_id || !fxIdSet.has(tb.account_id)) continue
    seen = true
    movement.set(tb.account_id, (movement.get(tb.account_id) ?? 0) + (tb.debit - tb.credit))
  }
  if (!seen) return { kind: 'kept', merged: row, reason: 'no_system_accounts' }

  let sum = 0
  for (const v of movement.values()) sum += v
  const delta = round2(round2(sum) - round2(row.amount))
  if (Math.abs(delta) > materiality) {
    return { kind: 'kept', merged: row, reason: 'unreconciled', delta }
  }

  const rows: ParsedPLRow[] = []
  for (const id of fxIds) {
    const amount = round2(movement.get(id) ?? 0)
    // An account with no movement this month gets no row, exactly as the
    // single-period P&L omits a zero account.
    if (amount === 0) continue
    const entry = input.catalog.get(id)!
    rows.push({
      account_id: id,
      account_code: entry.account_code,
      account_name: entry.account_name,
      account_type: classifyByXeroType(entry.account_type) ?? row.account_type,
      period_month: row.period_month,
      amount,
      basis: row.basis,
    })
  }
  return { kind: 'split', merged: row, rows, residual: delta }
}
