/**
 * Phase 44.2 Plan 44.2-06E Task 4 — 5-gate reconciliation harness.
 *
 * Parameterized over 3 tenants × 3 month-ends. Each (tenant, month) triggers
 * up to 4 automated gate assertions — Gate 5 is operator-captured manual
 * evidence in RECONCILIATION-EVIDENCE.md.
 *
 * Gates:
 *   1. Σ(monthly PL net profit) == FY-total PL net profit (oracle agreement)
 *   2. PL ↔ BS articulation: PL net profit == Δ(CYE + RE) between months
 *   3. TrialBalance balanced: Σ debits == Σ credits
 *   4. BS in balance: Net Assets == Equity
 *
 * Tolerance: $0.01 across all gates. Anything >$0.01 = hard failure with the
 * tenant + date + gate identifier in the error.
 *
 * Fixture-driven: tests skip with explicit capture commands if fixtures are
 * absent. Skips show up as TODOs in the test runner so it's obvious what
 * still needs to be captured before declaring 06E complete.
 *
 * Fixture naming convention:
 *   {tenantSlug}-bs-{YYYY-MM-DD}.json              (BS at month-end)
 *   {tenantSlug}-trialbalance-{YYYY-MM-DD}.json    (TB at month-end)
 *   {tenantSlug}-pl-fy-total-{fyEndDate}.json      (PL FY-total — gate 1 oracle)
 *   {tenantSlug}-pl-by-month-{fyEndDate}.json      (PL by-month, 12 cols — gates 1+2)
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { parsePLByMonth } from '@/lib/xero/pl-by-month-parser'
import { parsePLSinglePeriod } from '@/lib/xero/pl-single-period-parser'
import { parseBSSinglePeriod } from '@/lib/xero/bs-single-period-parser'
import { parseTrialBalance, trialBalanceTotals } from '@/lib/xero/trialbalance-parser'

// ─── Test parameterization ──────────────────────────────────────────────────

type Tenant = {
  /** Display name used in test output. */
  name: string
  /** Lowercased slug used in fixture filenames. */
  slug: string
  /** FY-end ISO date used to look up the per-FY PL fixtures. */
  fyEnd: string
  /** Tenant ID hint for the capture command (operator copies this verbatim). */
  tenantIdHint: string
  /** business_id hint for the capture command. */
  businessIdHint: string
}

const TENANTS: Tenant[] = [
  {
    name: 'JDS',
    slug: 'jds',
    fyEnd: '2026-06-30',
    tenantIdHint: '<jds-tenant-id>',
    businessIdHint: '900aa935-ae8c-4913-baf7-169260fa19ef',
  },
  {
    name: 'Envisage',
    slug: 'envisage',
    fyEnd: '2026-06-30',
    tenantIdHint: '<envisage-tenant-id>',
    businessIdHint: '<envisage-business-id>',
  },
  {
    name: 'IICT-HK',
    slug: 'iict-hk',
    fyEnd: '2026-12-31', // HK on calendar year
    tenantIdHint: '<iict-hk-tenant-id>',
    businessIdHint: '<iict-business-id>',
  },
]

const BALANCE_DATES = ['2026-02-28', '2026-03-31', '2026-04-30']

// ─── Fixture loading ────────────────────────────────────────────────────────

const FIXTURE_DIR = path.resolve(process.cwd(), 'src/__tests__/xero/fixtures')

function fixturePath(name: string): string {
  return path.join(FIXTURE_DIR, `${name}.json`)
}

function fixtureExists(name: string): boolean {
  return existsSync(fixturePath(name))
}

function loadFixture(name: string): any {
  const full = fixturePath(name)
  if (!existsSync(full)) {
    throw new Error(`Missing fixture: ${full}`)
  }
  return JSON.parse(readFileSync(full, 'utf-8'))
}

/**
 * Some fixtures (capture-bs / capture-trialbalance) wrap the response in
 * { _meta, response }. Others (capture-xero-fixture) write the raw response
 * at the top level. Normalize.
 */
function unwrapResponse(fixture: any): any {
  if (fixture && typeof fixture === 'object' && 'response' in fixture && '_meta' in fixture) {
    return fixture.response
  }
  return fixture
}

function captureCommand(t: Tenant, fixtureName: string, balanceDate?: string): string {
  if (fixtureName.includes('-bs-')) {
    return `npx tsx scripts/capture-bs-fixture.ts --business-id=${t.businessIdHint} --tenant-id=${t.tenantIdHint} --balance-date=${balanceDate} --label=${fixtureName}`
  }
  if (fixtureName.includes('-trialbalance-')) {
    return `npx tsx scripts/capture-trialbalance-fixture.ts --business-id=${t.businessIdHint} --tenant-id=${t.tenantIdHint} --balance-date=${balanceDate} --label=${fixtureName}`
  }
  if (fixtureName.includes('-pl-fy-total-') || fixtureName.includes('-pl-by-month-')) {
    return `npx tsx scripts/capture-xero-fixture.ts --business-id=${t.businessIdHint} --fy=<FY> --label=${t.slug}-pl-by-month-${t.fyEnd}  # writes both ${t.slug}-pl-by-month-${t.fyEnd}.json + ${t.slug}-pl-by-month-${t.fyEnd}-reconciler.json (rename or symlink to {tenant}-pl-fy-total-{date}.json)`
  }
  return `(no capture command registered for fixture pattern: ${fixtureName})`
}

// ─── Net-profit extraction ──────────────────────────────────────────────────

/**
 * Compute net profit from a parsed PL row set:
 *   net_profit = revenue + other_income - cogs - opex - other_expense
 *
 * All sign conventions follow the parser's existing AccountType taxonomy
 * (revenue/other_income are positive contributions; cogs/opex/other_expense
 * are positive amounts that subtract from the result).
 */
function netProfitOf(rows: Array<{ account_type: string; amount: number }>): number {
  let revenue = 0
  let cogs = 0
  let opex = 0
  let otherIncome = 0
  let otherExpense = 0
  for (const r of rows) {
    switch (r.account_type) {
      case 'revenue':
        revenue += r.amount
        break
      case 'cogs':
        cogs += r.amount
        break
      case 'opex':
        opex += r.amount
        break
      case 'other_income':
        otherIncome += r.amount
        break
      case 'other_expense':
        otherExpense += r.amount
        break
      default:
        break
    }
  }
  return revenue + otherIncome - cogs - opex - otherExpense
}

/**
 * Sum the BS earnings accounts (Current Year Earnings + Retained Earnings)
 * at a given balance_date. Used by gate 2 articulation: monthly PL net
 * profit MUST equal Δ(earnings) across the month.
 *
 * We match by name (case-insensitive substring) because account_id varies
 * per tenant and we don't want this gate to depend on a tenant-specific id
 * mapping. Both 'current year earnings' and 'retained earnings' are Xero
 * system account names with stable wording.
 */
function bsEarningsTotal(bsRows: Array<{ account_name: string; balance: number }>): number {
  let total = 0
  for (const r of bsRows) {
    const n = r.account_name.toLowerCase()
    if (
      n.includes('current year earnings') ||
      n.includes('retained earnings') ||
      n.includes('profit ~ loss earned this year') ||
      n.includes('profit / loss earned this year')
    ) {
      total += r.balance
    }
  }
  return total
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe.each(TENANTS)('Reconciliation gates — $name', (tenant) => {
  // ─── Gate 1 (FY-wide) ─────────────────────────────────────────────────────
  describe('Gate 1: Σ(monthly PL) == FY-total PL', () => {
    const byMonthFixture = `${tenant.slug}-pl-by-month-${tenant.fyEnd}`
    const fyTotalFixture = `${tenant.slug}-pl-fy-total-${tenant.fyEnd}`
    const havePair = fixtureExists(byMonthFixture) && fixtureExists(fyTotalFixture)

    if (!havePair) {
      it.todo(
        `[Gate 1] Capture missing PL fixtures for ${tenant.name} FY-end ${tenant.fyEnd}: ` +
          `expected ${byMonthFixture}.json + ${fyTotalFixture}.json. ` +
          `Run: ${captureCommand(tenant, byMonthFixture, tenant.fyEnd)}`,
      )
      return
    }

    it(`Σ(monthly net profit) == FY-total net profit (within $0.01)`, () => {
      const byMonth = parsePLByMonth(unwrapResponse(loadFixture(byMonthFixture)))
      const fyTotal = parsePLSinglePeriod(
        unwrapResponse(loadFixture(fyTotalFixture)),
        tenant.fyEnd,
        'accruals',
        'fixture-tenant',
      )
      // by-month parser emits per-period rows already.
      const monthlyNetProfit = netProfitOf(byMonth)
      const fyNetProfit = netProfitOf(fyTotal)
      const delta = Math.abs(monthlyNetProfit - fyNetProfit)
      expect(delta, `tenant=${tenant.name} fy=${tenant.fyEnd} monthly=${monthlyNetProfit.toFixed(2)} fy=${fyNetProfit.toFixed(2)} Δ=${delta.toFixed(2)}`).toBeLessThan(0.01)
    })
  })

  // ─── Per-balance-date gates 2/3/4 ─────────────────────────────────────────
  describe.each(BALANCE_DATES)('balance_date %s', (balanceDate) => {
    const bsFixture = `${tenant.slug}-bs-${balanceDate}`
    const tbFixture = `${tenant.slug}-trialbalance-${balanceDate}`

    // Gate 2 — PL ↔ BS articulation. Needs THIS month-end BS + PRIOR month-end BS + monthly PL net profit for the period.
    describe('Gate 2: PL ↔ BS articulation', () => {
      const priorIdx = BALANCE_DATES.indexOf(balanceDate) - 1
      if (priorIdx < 0) {
        it.todo(
          `[Gate 2] No prior month-end BS to articulate against (${balanceDate} is the earliest in scope). ` +
            `Either capture an earlier BS or accept that gate 2 only runs for ${BALANCE_DATES.slice(1).join(', ')}.`,
        )
        return
      }
      const priorDate = BALANCE_DATES[priorIdx]!
      const priorBSFixture = `${tenant.slug}-bs-${priorDate}`
      const byMonthFixture = `${tenant.slug}-pl-by-month-${tenant.fyEnd}`
      if (!fixtureExists(bsFixture) || !fixtureExists(priorBSFixture) || !fixtureExists(byMonthFixture)) {
        const missing = [
          !fixtureExists(bsFixture) && bsFixture,
          !fixtureExists(priorBSFixture) && priorBSFixture,
          !fixtureExists(byMonthFixture) && byMonthFixture,
        ]
          .filter(Boolean)
          .join(', ')
        it.todo(`[Gate 2] Missing fixtures for ${tenant.name} ${balanceDate}: ${missing}`)
        return
      }

      it(`PL net profit for ${balanceDate.slice(0, 7)} == Δ(CYE+RE) over month`, () => {
        const byMonth = parsePLByMonth(unwrapResponse(loadFixture(byMonthFixture)))
        // Filter by-month rows down to the month ending at `balanceDate` —
        // period_month is the MONTH KEY (YYYY-MM-01) for the period start.
        const monthKey = `${balanceDate.slice(0, 7)}-01`
        const monthRows = byMonth.filter((r) => r.period_month === monthKey)
        const monthNetProfit = netProfitOf(monthRows)
        const bsThis = parseBSSinglePeriod(unwrapResponse(loadFixture(bsFixture)), balanceDate, 'accruals', 'fixture-tenant')
        const bsPrior = parseBSSinglePeriod(unwrapResponse(loadFixture(priorBSFixture)), priorDate, 'accruals', 'fixture-tenant')
        const earningsDelta = bsEarningsTotal(bsThis) - bsEarningsTotal(bsPrior)
        const delta = Math.abs(monthNetProfit - earningsDelta)
        expect(delta, `tenant=${tenant.name} month=${balanceDate} pl=${monthNetProfit.toFixed(2)} bsΔ=${earningsDelta.toFixed(2)} Δ=${delta.toFixed(2)}`).toBeLessThan(0.01)
      })
    })

    // Gate 3 — TrialBalance balanced.
    describe('Gate 3: TrialBalance balanced', () => {
      if (!fixtureExists(tbFixture)) {
        it.todo(
          `[Gate 3] Missing TB fixture for ${tenant.name} ${balanceDate}: ${tbFixture}.json. ` +
            `Run: ${captureCommand(tenant, tbFixture, balanceDate)}`,
        )
        return
      }
      it(`Σ debit == Σ credit (within $0.01)`, () => {
        const tb = parseTrialBalance(unwrapResponse(loadFixture(tbFixture)))
        const totals = trialBalanceTotals(tb)
        expect(Math.abs(totals.delta), `tenant=${tenant.name} date=${balanceDate} debit=${totals.debit.toFixed(2)} credit=${totals.credit.toFixed(2)} Δ=${totals.delta.toFixed(2)}`).toBeLessThan(0.01)
      })
    })

    // Gate 4 — BS in balance.
    describe('Gate 4: Net Assets == Equity', () => {
      if (!fixtureExists(bsFixture)) {
        it.todo(
          `[Gate 4] Missing BS fixture for ${tenant.name} ${balanceDate}: ${bsFixture}.json. ` +
            `Run: ${captureCommand(tenant, bsFixture, balanceDate)}`,
        )
        return
      }
      it(`Σ(asset) − Σ(liability) == Σ(equity) (within $0.01)`, () => {
        const bs = parseBSSinglePeriod(unwrapResponse(loadFixture(bsFixture)), balanceDate, 'accruals', 'fixture-tenant')
        const assets = bs.filter((r) => r.account_type === 'asset').reduce((s, r) => s + r.balance, 0)
        const liabilities = bs.filter((r) => r.account_type === 'liability').reduce((s, r) => s + r.balance, 0)
        const equity = bs.filter((r) => r.account_type === 'equity').reduce((s, r) => s + r.balance, 0)
        const netAssets = assets - liabilities
        const delta = Math.abs(netAssets - equity)
        expect(delta, `tenant=${tenant.name} date=${balanceDate} assets=${assets.toFixed(2)} liabilities=${liabilities.toFixed(2)} netAssets=${netAssets.toFixed(2)} equity=${equity.toFixed(2)} Δ=${delta.toFixed(2)}`).toBeLessThan(0.01)
      })
    })
  })
})
