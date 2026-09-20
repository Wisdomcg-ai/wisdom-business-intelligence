/**
 * The Bank Balances & Movement page (Calxa p17) — the placement, the table, the
 * notes under it, and the reason card a page that cannot be produced prints
 * instead of the figures.
 *
 * The figures are lib/monthly-report/bank-balances.ts's and are tested there.
 * What is locked here is that the page prints them, in the balance sheet's own
 * table, and that a refusal reaches the paper as a sentence rather than as a
 * blank page or a confident $0.
 */
import { describe, it, expect } from 'vitest'
import { MonthlyReportPDFService } from '../monthly-report-pdf-service'
import { fixtureReport } from './pdf-pack-fixture'
import iict from '@/lib/monthly-report/__tests__/fixtures/iict-bs-mirror-2026-08.json'
import dragon from '@/lib/monthly-report/__tests__/fixtures/dragon-bs-mirror-2026-08.json'
import { buildBankBalances } from '@/lib/monthly-report/bank-balances'
import type { BankBalancesData } from '../../types'

type Fixture = typeof iict | typeof dragon

function built(fx: Fixture): BankBalancesData {
  const result = buildBankBalances({
    businessId: fx.business_id,
    month: '2026-08',
    organisations: fx.connections.map((c) => ({ tenant_id: c.tenant_id, name: c.name, functional_currency: c.functional_currency })),
    rows: fx.rows,
    accounts: fx.accounts,
    rates: 'fx_rates' in fx ? fx.fx_rates : [],
    accountIds: [
      ...new Set(
        fx.accounts
          .filter((a) => a.bank_account_type === 'BANK' || a.bank_account_type === 'CREDITCARD' || /cash on hand/i.test(a.account_name))
          .map((a) => a.xero_account_id),
      ),
    ],
  })
  if (!result.ok) throw new Error(result.reason)
  return result.data
}

function render(bankBalances: { data: BankBalancesData | null; reason?: string }): any {
  const svc = new MonthlyReportPDFService(fixtureReport(), {
    bankBalances,
    pdfLayout: {
      version: 1,
      pages: [
        {
          id: 'p1',
          orientation: 'portrait',
          widgets: [{ id: 'w1', type: 'bank_balances', col: 0, row: 0, colSpan: 2, rowSpan: 3 }],
        },
      ],
    },
  })
  return svc.generate()
}

/** Every text run of the pack, in order. */
function texts(doc: any): string[] {
  const out: string[] = []
  for (let i = 1; i <= doc.internal.getNumberOfPages(); i++) {
    for (const op of (doc.internal.pages[i] as string[]).join('\n').split('\n').map((o) => o.trim())) {
      const m = /^(?:T\* )?\((.*)\) Tj$/.exec(op)
      if (m) out.push(m[1].replace(/\\([()])/g, '$1'))
    }
  }
  return out
}

/** A row's printed cells: the label and the four figures after it. */
function row(all: string[], label: string): string[] {
  const at = all.indexOf(label)
  if (at < 0) throw new Error(`no row ${label}`)
  return all.slice(at, at + 5)
}

describe('the Bank Balances & Movement page', () => {
  it('prints IICT’s three organisations, each with its own subtotal, and one Total Bank', () => {
    const all = texts(render({ data: built(iict) }))
    expect(all.some((t) => t.startsWith('Bank Balances & Movement'))).toBe(true)
    expect(row(all, 'Total Bank')).toEqual(['Total Bank', '226,608', '244,120', '(17,512)', '(7%)'])
    expect(row(all, 'Total IICT Group Limited').slice(0, 3)).toEqual(['Total IICT Group Limited', '220,209', '236,995'])
    // The heading and the subtotal of each organisation, in display order.
    expect(all.indexOf('IICT (Aust) Pty Ltd')).toBeLessThan(all.indexOf('IICT Group Limited'))
    // Translated, never added at one for one.
    expect(all).not.toContain('1,237,809')
  })

  it('prints the translation and credit-card notes under the table', () => {
    const all = texts(render({ data: built(iict) }))
    const note = all.findIndex((t) => t.startsWith('IICT Group Limited reports in HKD'))
    expect(note).toBeGreaterThan(all.indexOf('Total Bank'))
    expect(all.join(' ')).toContain('Credit cards are shown as negative assets')
  })

  it('prints Dragon’s two banks with the month’s movement', () => {
    const all = texts(render({ data: built(dragon) }))
    expect(row(all, 'Total Bank').slice(0, 4)).toEqual(['Total Bank', '288,449', '267,246', '21,203'])
  })

  it('prints the reason, not a blank page and not a zero, when the page cannot be produced', () => {
    const all = texts(render({ data: null, reason: 'no bank accounts have been chosen for this page — choose them in the report settings' }))
    // The em dash reaches the paper as WinAnsi 0x97, which this reader of the
    // raw content stream does not decode — hence the two halves.
    expect(all.join(' ')).toContain("This page couldn't be produced: no bank accounts have been chosen for this page")
    expect(all.join(' ')).toContain('choose them in the report settings.')
    expect(all).not.toContain('Total Bank')
    expect(all.some((t) => /^[\d(]/.test(t) && t !== 'Page 1 of 1')).toBe(false)
  })

  it('says so rather than vanishing when nothing was loaded at all', () => {
    const all = texts(render(undefined as never))
    expect(all.join(' ')).toContain("This page couldn't be produced: the bank balances could not be loaded.")
  })
})
