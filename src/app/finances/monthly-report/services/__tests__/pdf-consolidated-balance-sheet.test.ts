/**
 * The Balance Sheet page for a business Xero holds as several organisations —
 * the same placement, the same table, and what only a group's sheet carries:
 * the notes under the table (what was eliminated, how the HKD organisation was
 * translated) and the warning above it when a loan's two sides disagree.
 *
 * The sheets are built by lib/monthly-report/consolidated-balance-sheet.ts
 * from the IICT and Dragon mirror fixtures; that module is tested for the
 * figures. What is locked here is that the page prints them and what goes
 * with them.
 */
import { describe, it, expect } from 'vitest'
import { MonthlyReportPDFService } from '../monthly-report-pdf-service'
import { fixtureReport } from './pdf-pack-fixture'
import iict from '@/lib/monthly-report/__tests__/fixtures/iict-bs-mirror-2026-08.json'
import dragon from '@/lib/monthly-report/__tests__/fixtures/dragon-bs-mirror-2026-08.json'
import { buildConsolidatedBalanceSheet } from '@/lib/monthly-report/consolidated-balance-sheet'
import type { EliminationRule } from '@/lib/consolidation/types'
import type { BalanceSheetCompare, BalanceSheetData } from '../../types'

function built(fx: typeof iict | typeof dragon, compare: BalanceSheetCompare, rules: EliminationRule[] = []): BalanceSheetData {
  const result = buildConsolidatedBalanceSheet({
    businessId: fx.business_id,
    month: '2026-08',
    compare,
    fiscalYearStart: 7,
    organisations: fx.connections.map((c) => ({ tenant_id: c.tenant_id, name: c.name, functional_currency: c.functional_currency })),
    rows: fx.rows,
    accounts: fx.accounts,
    rates: 'fx_rates' in fx ? fx.fx_rates : [],
    rules,
  })
  if (!result.ok) throw new Error(result.reason)
  return result.data
}

function render(compare: BalanceSheetCompare, data: BalanceSheetData): any {
  const svc = new MonthlyReportPDFService(fixtureReport(), {
    sections: { ...fixtureReport().settings.sections, balance_sheet: true },
    balanceSheets: { [compare]: { data } },
    pdfLayout: {
      version: 1,
      pages: [
        {
          id: 'p1',
          orientation: 'portrait',
          widgets: [{ id: 'w1', type: 'balance_sheet', col: 0, row: 0, colSpan: 3, rowSpan: 3, config: { compare } }],
        },
      ],
    },
  })
  return svc.generate()
}

/** Every text run of the pack, page by page. */
function pageTexts(doc: any): string[][] {
  const out: string[][] = []
  for (let i = 1; i <= doc.internal.getNumberOfPages(); i++) {
    const ops = (doc.internal.pages[i] as string[]).join('\n').split('\n').map((o) => o.trim())
    out.push(ops.flatMap((op) => {
      // A wrapped note continues each line with T* before its run.
      const m = /^(?:T\* )?\((.*)\) Tj$/.exec(op)
      return m ? [m[1].replace(/\\([()])/g, '$1')] : []
    }))
  }
  return out
}

/** A row's printed cells: the label and the four figures after it. */
function row(texts: string[], label: string): string[] {
  const at = texts.indexOf(label)
  if (at < 0) throw new Error(`no row ${label}`)
  return texts.slice(at, at + 5)
}

const RUN_TEXT = (doc: any) => pageTexts(doc).flat().join(' ')

describe('the consolidated Balance Sheet page', () => {
  it('prints IICT’s year-on-year sheet with 31 Aug 2025 net assets of 1,101,808', () => {
    const doc = render('yoy', built(iict, 'yoy'))
    const texts = pageTexts(doc).flat()
    expect(row(texts, 'Net Assets')).toEqual(['Net Assets', '1,138,255', '1,101,808', '36,447', '3%'])
    expect(row(texts, 'Currency Translation Difference').slice(0, 3)).toEqual(['Currency Translation Difference', '(92,179)', '1,494'])
  })

  it('prints the translation note under the table, wrapped, and no HKD figure', () => {
    const doc = render('mom', built(iict, 'mom'))
    const text = RUN_TEXT(doc)
    expect(text).toContain('IICT Group Limited reports in HKD.')
    expect(text).toContain("is carried at the year's opening rate.")
    expect(text).not.toContain('1,237,809')
    // The note follows the table, never above it.
    const texts = pageTexts(doc).flat()
    expect(texts.findIndex((t) => t.startsWith('IICT Group Limited reports in HKD'))).toBeGreaterThan(texts.indexOf('Total Equity'))
  })

  it('prints Dragon’s eliminated loan as one line under the table, with assets of 1,562,415', () => {
    const loan: EliminationRule = {
      id: 'r1',
      business_id: dragon.business_id,
      rule_type: 'intercompany_loan',
      tenant_a_id: '42735fc3-21f2-4668-9783-93ce0f66f481',
      entity_a_account_code: '700',
      entity_a_account_name_pattern: null,
      tenant_b_id: '3b67e5b6-780c-4158-831c-82293f34ca04',
      entity_b_account_code: '906',
      entity_b_account_name_pattern: null,
      direction: 'bidirectional',
      description: 'loan',
      active: true,
    }
    const doc = render('mom', built(dragon, 'mom', [loan]))
    const texts = pageTexts(doc).flat()
    expect(row(texts, 'Total Asset').slice(0, 3)).toEqual(['Total Asset', '1,562,415', '1,711,072'])
    expect(row(texts, 'Net Assets').slice(0, 2)).toEqual(['Net Assets', '270,523'])
    expect(RUN_TEXT(doc)).toContain('Eliminated on consolidation: Loan Receivable - Easy Hail Claim Pty Ltd (Dragon Roofing Pty Ltd)')
  })

  it('warns above the table when a loan’s two sides disagree, and prints both in full', () => {
    const loan: EliminationRule = {
      id: 'r1',
      business_id: iict.business_id,
      rule_type: 'intercompany_loan',
      tenant_a_id: 'de943481-389d-4134-b0af-410f025f53c2',
      entity_a_account_code: '730',
      entity_a_account_name_pattern: null,
      tenant_b_id: '1d83c9a4-bf6d-448f-bb87-88e2684317bf',
      entity_b_account_code: '625',
      entity_b_account_name_pattern: null,
      direction: 'bidirectional',
      description: 'loan',
      active: true,
    }
    const doc = render('mom', built(iict, 'mom', [loan]))
    const texts = pageTexts(doc).flat()
    const warningAt = texts.findIndex((t) => t.startsWith('Not eliminated:'))
    expect(warningAt).toBeGreaterThanOrEqual(0)
    expect(warningAt).toBeLessThan(texts.indexOf('Asset'))
    expect(RUN_TEXT(doc)).toMatch(/68,211 apart at Aug 2026/)
    expect(row(texts, 'Loan - IICT (Aust) Pty Ltd').slice(0, 2)).toEqual(['Loan - IICT (Aust) Pty Ltd', '2,199,161'])
  })
})
