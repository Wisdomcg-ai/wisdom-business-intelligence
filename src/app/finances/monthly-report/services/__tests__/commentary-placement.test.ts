/**
 * The commentary rules Calxa's Urban Road pack prints by, against August 2026.
 *
 * Figures are snapshot 074486a6's lines; the drafts are the ones stored on it
 * (supplier text as the route drafted it), split into facts and clause the way
 * the route now stores them. Four COGS accounts triggered nothing and so have
 * no stored draft; their entries here are what the route drafts for an
 * `account_activity` line.
 *
 * The judgement worth pinning twice: with no config at all, every block prints
 * exactly as it did before these rules existed.
 */
import { describe, it, expect } from 'vitest'
import {
  buildCommentaryBlock,
  buildCommentaryBullets,
  commentaryCoverageFromLayout,
  commentaryPlacementProblems,
  readCommentaryPlacement,
  resolveCommentaryPlacement,
  DEFAULT_COMMENTARY_PLACEMENT,
} from '../commentary-placement'
import { collectCommentaryTriggers } from '../../utils/commentary-triggers'
import type { GeneratedReport, ReportLine, VarianceCommentary, VarianceCommentaryEntry } from '../../types'
import type { PDFLayout } from '../../types/pdf-layout'

const l = (account_name: string, actual: number, budget: number): ReportLine => ({
  account_name,
  xero_account_name: account_name,
  is_budget_only: false,
  actual,
  budget,
  variance_amount: budget - actual,
  variance_percent: 0,
  ytd_actual: 0, ytd_budget: 0, ytd_variance_amount: 0, ytd_variance_percent: 0,
  unspent_budget: 0, budget_next_month: 0, budget_annual_total: 0, prior_year: null,
})

// Cost of Sales, August 2026, in the statement's order.
const COGS: ReportLine[] = [
  l('Antons Canvas', 156163.37, 172488),
  l('Art Import', 5042.36, 0),
  l('Art Supplies', 116.92, 0),
  l('Artist Commissions', 1474.46, 10710),
  l('Artwork Scanning', 0, 135),
  l('Australian Suppliers', 0, 226),
  l('Cushions & Decor', 7010.17, 1035),
  l('Customs,Duties & Shipping', 0, 0),
  l('Design images - No royalty', 36.62, 135),
  l('Freight to Customer', 50924.95, 45000),
  l('International Orders', 11641.59, 8235),
  l('Packaging', 0, 360),
  l('Posters', 0, 26037),
  l('Rugs', 326.48, 336),
]

// Operating Expenses that carry commentary, plus Wages (on budget, no entry).
const OPEX: ReportLine[] = [
  l('Contractors excl. Artists', 31029.3, 28375),
  l('Employ - Staff Amenities', 1240.81, 450),
  l('Employ - Wages & Salaries', 52519.25, 52519),
  l('IT Costs Software', 14725.73, 13697),
  l('Marketing Digital Ad Spend', 23143.86, 20000),
  l('Shopify Fees', 2623.08, 4000),
  l("T/E - Air Fares/Taxis - O'seas", 582.54, 0),
]

const drafted = (reason: VarianceCommentaryEntry['trigger_reason'], facts: string, clause: string | null, over: Partial<VarianceCommentaryEntry> = {}): VarianceCommentaryEntry => ({
  vendor_summary: [],
  coach_note: '',
  is_edited: false,
  trigger_reason: reason,
  draft_note: clause ? `${facts} - ${clause}` : facts,
  draft_facts: facts,
  draft_clause: clause,
  draft_warnings: [],
  ...over,
})

function augustCommentary(): VarianceCommentary {
  return {
    'Antons Canvas': drafted('account_activity', 'Antons Mouldings Pty Ltd ($155,938)', '29.6% of income against a 38.3% driver'),
    'Art Import': drafted('expense_over_budget_dollar', '', null),
    'Art Supplies': drafted('account_activity', 'Ebay ($80), Amazon ($37)', '0.0% of income'),
    'Artist Commissions': drafted('expense_favourable_significant', '1x Innovations Ab ($1,474)', '0.3% of income against a 2.4% driver'),
    'Cushions & Decor': drafted('expense_over_budget_dollar', 'Hangzhou Fenglian Textile Arts&crafts Co Ltd ($4,006), Hangzhou Sino Silk Technology ($1,242)', '1.3% of income against a 0.2% driver'),
    'Design images - No royalty': drafted('account_activity', 'Dreamstime.com ($37)', '0.0% of income against a 0.0% driver'),
    'Freight to Customer': drafted('expense_over_budget_dollar', 'Allied Express Transport Pty Ltd ($23,594), Team Global Express Pty Ltd ($11,629), Fed Ex ($7,195), +6 others ($8,508)', '9.7% of income against a 10.0% driver'),
    'International Orders': drafted('expense_over_budget_dollar', 'The Frame Workshop ($6,270), Lumaprints ($5,290), Others ($81)', '2.2% of income against a 1.8% driver'),
    Posters: drafted('expense_favourable_significant', '', null),
    Rugs: drafted('account_activity', 'Unitex International ($326)', '0.1% of income against a 0.1% driver'),
    'Contractors excl. Artists': drafted('expense_over_budget_dollar', 'Akshay Nirmal Proprietorship ($5,851), Mark Joseph Judaya ($5,549), Katrina Redondo ($2,797), +13 others ($16,832)', '5.9% of income against a 6.3% driver'),
    'Employ - Staff Amenities': drafted('expense_over_budget_dollar', 'Alcotraz ($918), Food ($323)', '0.2% of income against a 0.1% driver'),
    'IT Costs Software': drafted('expense_over_budget_dollar', 'Shopify ($4,261), Klaviyo Inc ($1,445), Reviews Io ($1,256), +16 others ($7,792)', '2.8% of income against a 3.0% driver'),
    'Marketing Digital Ad Spend': drafted('expense_over_budget_dollar', 'Google Workspace ($16,553), Facebook ($5,117), Pintrest ($1,474)', '4.4% of income against a 4.4% driver'),
    'Shopify Fees': drafted('expense_favourable_significant', 'Shopify ($2,635)', '0.5% of income against a 0.9% driver'),
    "T/E - Air Fares/Taxis - O'seas": drafted('expense_over_budget_dollar', 'Travel ($419), Uber ($164)', '0.1% of income against a 0.0% driver'),
  }
}

/** The three standing lines Calxa prints first under the expense table. */
const STANDING = [
  { label: 'Wages & Salaries', refer_to: 'Payroll Summary Page', target: 'Payroll' },
  { label: 'Contractors excl. Artists', refer_to: 'summary page', target: 'Contractor Analysis' },
  { label: 'IT Costs Software', refer_to: 'summary page', target: 'Subscription Analysis' },
]
const PACK_LABELS = ['Actual vs Budget', 'Subscription Analysis', 'Contractor Analysis', 'Payroll', 'Wages Analysis']

const COGS_CONFIG = {
  section: 'cogs',
  commentary: {
    placement: 'separate_page',
    coverage: 'all_with_activity',
    order: 'alphabetical',
    favourable: 'coach_only',
    ratio_clause: ['Antons Canvas', 'Freight to Customer'],
    coach_note: 'replace',
    body_size: 10,
  },
}
const EXPENSE_CONFIG = {
  section: 'expense',
  commentary: {
    order: 'largest_overspend',
    heading: 'COMMENTS',
    heading_underline: true,
    favourable: 'coach_only',
    ratio_clause: 'none',
    coach_note: 'replace',
  },
}

describe('resolveCommentaryPlacement', () => {
  it('no config, or config without commentary, is the block every pack has today', () => {
    expect(resolveCommentaryPlacement(undefined)).toEqual(DEFAULT_COMMENTARY_PLACEMENT)
    expect(resolveCommentaryPlacement({ section: 'cogs' })).toEqual(DEFAULT_COMMENTARY_PLACEMENT)
    expect(DEFAULT_COMMENTARY_PLACEMENT).toMatchObject({
      placement: 'inline', coverage: 'triggered', order: 'statement', heading: 'COMMENTARY',
      favourable: 'print', ratioClause: 'every_account', coachNote: 'append',
    })
  })

  it('reads the Urban Road placements', () => {
    expect(resolveCommentaryPlacement(COGS_CONFIG)).toMatchObject({
      placement: 'separate_page', coverage: 'all_with_activity', order: 'alphabetical',
      favourable: 'coach_only', ratioClause: ['Antons Canvas', 'Freight to Customer'], coachNote: 'replace', bodySize: 10,
    })
    expect(resolveCommentaryPlacement(EXPENSE_CONFIG)).toMatchObject({
      placement: 'inline', order: 'largest_overspend', heading: 'COMMENTS', headingUnderline: true, ratioClause: 'none',
    })
  })

  it('a bare string names the placement; anything unrecognised keeps the default', () => {
    expect(resolveCommentaryPlacement({ commentary: 'separate_page' }).placement).toBe('separate_page')
    expect(resolveCommentaryPlacement({ commentary: 'none' }).placement).toBe('none')
    const junk = resolveCommentaryPlacement({ commentary: { placement: 'sideways', order: 'random', body_size: 40, heading: '  ', coach_note: 'merge' } })
    expect(junk).toMatchObject({ placement: 'inline', order: 'statement', bodySize: null, heading: 'COMMENTARY', coachNote: 'append' })
    expect(resolveCommentaryPlacement({ commentary: ['separate_page'] })).toEqual(DEFAULT_COMMENTARY_PLACEMENT)
  })

  it('says why it printed the default: every value it could not read is a problem, by field', () => {
    // Applied by hand-written SQL, so a typo is the likely failure — and it
    // used to print today's block with nothing to say why.
    const read = readCommentaryPlacement({
      commentary: { placement: 'separate-page', ratio_clause: 'Antons Canvas', body_size: '10', coverge: 'all_with_activity' },
    })
    expect(read.placement).toEqual(DEFAULT_COMMENTARY_PLACEMENT)
    expect(read.problems.map((p) => p.field).sort()).toEqual(['body_size', 'coverge', 'placement', 'ratio_clause'])
    expect(read.problems.find((p) => p.field === 'placement')!.reason).toMatch(/inline, separate_page, none/)
    expect(readCommentaryPlacement({ commentary: { body_size: 16 } }).problems).toEqual([
      { field: 'body_size', value: 16, reason: expect.stringMatching(/between 6 and 14/) },
    ])
    expect(readCommentaryPlacement({ commentary: ['separate_page'] }).problems).toHaveLength(1)
    expect(readCommentaryPlacement({ commentary: 'separate-page' }).problems.map((p) => p.field)).toEqual(['commentary'])
    expect(readCommentaryPlacement({ commentary: { ratio_clause: ['Antons Canvas', 7] } }).problems.map((p) => p.field)).toEqual(['ratio_clause'])
  })

  it('a valid config, or none at all, has no problems', () => {
    expect(readCommentaryPlacement(undefined).problems).toEqual([])
    expect(readCommentaryPlacement({ section: 'cogs' }).problems).toEqual([])
    expect(readCommentaryPlacement(COGS_CONFIG).problems).toEqual([])
    expect(readCommentaryPlacement(EXPENSE_CONFIG).problems).toEqual([])
    expect(readCommentaryPlacement({ commentary: 'separate_page' }).problems).toEqual([])
  })

  it('a layout names the widget each problem sits on', () => {
    const lay = {
      version: 1,
      pages: [{ id: 'p', orientation: 'landscape', widgets: [
        { id: 'w-cogs', type: 'budget_vs_actual', col: 0, row: 0, colSpan: 3, rowSpan: 3, config: { section: 'cogs', commentary: { order: 'alpha' } } },
        { id: 'w-exp', type: 'budget_vs_actual', col: 0, row: 0, colSpan: 3, rowSpan: 3, config: EXPENSE_CONFIG },
      ] }],
    } as unknown as PDFLayout
    expect(commentaryPlacementProblems(lay)).toEqual([
      { widgetId: 'w-cogs', field: 'order', value: 'alpha', reason: expect.any(String) },
    ])
    expect(commentaryPlacementProblems(null)).toEqual([])
  })
})

describe('commentaryCoverageFromLayout', () => {
  const layout = (configs: Record<string, unknown>[]): PDFLayout => ({
    version: 1,
    pages: configs.map((config, i) => ({
      id: `p${i}`, orientation: 'landscape',
      widgets: [{ id: `w${i}`, type: 'budget_vs_actual', col: 0, row: 0, colSpan: 3, rowSpan: 3, config }],
    })),
  } as PDFLayout)

  it('Urban Road asks for every COGS account and nothing else', () => {
    expect(commentaryCoverageFromLayout(layout([{ section: 'income' }, COGS_CONFIG, EXPENSE_CONFIG]))).toEqual(['Cost of Sales'])
  })

  it('no layout, the stored Urban Road layout, or a placement with commentary off: nothing extra', () => {
    expect(commentaryCoverageFromLayout(null)).toEqual([])
    expect(commentaryCoverageFromLayout(layout([{ section: 'income' }, { section: 'cogs' }, { section: 'expense' }]))).toEqual([])
    expect(commentaryCoverageFromLayout(layout([{ section: 'cogs', commentary: { placement: 'none', coverage: 'all_with_activity' } }]))).toEqual([])
  })

  it('an income table cannot ask for income commentary it never prints', () => {
    expect(commentaryCoverageFromLayout(layout([{ section: 'income', commentary: { coverage: 'all_with_activity' } }]))).toEqual([])
  })
})

describe('collectCommentaryTriggers — every COGS account that moved', () => {
  const report = {
    sections: [
      { category: 'Cost of Sales', lines: COGS, subtotal: l('Total Cost of Sales', 232736.92, 264697) },
      { category: 'Operating Expenses', lines: OPEX, subtotal: l('Total Operating Expenses', 0, 0) },
    ],
  } as unknown as GeneratedReport

  it('asks for a draft on the four COGS accounts no threshold fired on', () => {
    const t = collectCommentaryTriggers(report, null, { allWithActivity: ['Cost of Sales'] })
    expect(t.activity_lines.map((x) => x.account_name)).toEqual(['Antons Canvas', 'Art Supplies', 'Design images - No royalty', 'Rugs'])
    expect(t.activity_lines.every((x) => x.trigger_reason === 'account_activity')).toBe(true)
    // With the triggered ones, Calxa's ten.
    const cogs = new Set(COGS.map((x) => x.account_name))
    const all = [...t.expense_lines, ...t.favourable_expense_lines, ...t.activity_lines]
      .map((x) => x.account_name).filter((n) => cogs.has(n)).sort((a, b) => a.localeCompare(b, 'en-AU'))
    expect(all).toEqual([
      'Antons Canvas', 'Art Import', 'Art Supplies', 'Artist Commissions', 'Cushions & Decor',
      'Design images - No royalty', 'Freight to Customer', 'International Orders', 'Posters', 'Rugs',
    ])
    // The expense section was not asked for, so nothing from it is added.
    expect(t.activity_lines.some((x) => !cogs.has(x.account_name))).toBe(false)
  })

  it('without the option the triggers are what they were', () => {
    const t = collectCommentaryTriggers(report, null)
    expect(t.activity_lines).toEqual([])
    expect(t.expense_lines.map((x) => x.account_name)).toContain('Freight to Customer')
  })
})

describe('buildCommentaryBullets — defaults', () => {
  it('prints what the block printed before: triggered accounts with a draft, statement order, clause kept, note appended', () => {
    const commentary = augustCommentary()
    // A pre-rules snapshot carries no activity entries; drop them to match.
    for (const k of ['Antons Canvas', 'Art Supplies', 'Design images - No royalty', 'Rugs']) delete commentary[k]
    commentary['International Orders'].coach_note = 'Lumaprints is the US fulfilment trial.'
    const bullets = buildCommentaryBullets({ lines: COGS, commentary, placement: DEFAULT_COMMENTARY_PLACEMENT })
    expect(bullets.map((b) => b.account)).toEqual(['Artist Commissions', 'Cushions & Decor', 'Freight to Customer', 'International Orders'])
    expect(bullets[0].body).toBe('1x Innovations Ab ($1,474) - 0.3% of income against a 2.4% driver')
    expect(bullets[3].body).toBe(
      'The Frame Workshop ($6,270), Lumaprints ($5,290), Others ($81) - 2.2% of income against a 1.8% driver — Lumaprints is the US fulfilment trial.',
    )
  })

  it('a withheld list still prints, and says why', () => {
    const commentary = augustCommentary()
    commentary['Freight to Customer'].draft_warnings = ['The suppliers quoted total $51,733 against an account that moved $50,925 this month.']
    const b = buildCommentaryBullets({ lines: COGS, commentary, placement: DEFAULT_COMMENTARY_PLACEMENT })
      .find((x) => x.account === 'Freight to Customer')!
    expect(b.body).toBe('Supplier detail withheld — the supplier list does not agree with this account this month.')
  })

  it('an activity entry never prints under a table that only comments on triggers', () => {
    const bullets = buildCommentaryBullets({ lines: COGS, commentary: augustCommentary(), placement: DEFAULT_COMMENTARY_PLACEMENT })
    expect(bullets.map((b) => b.account)).not.toContain('Antons Canvas')
    expect(bullets.map((b) => b.account)).not.toContain('Rugs')
  })
})

describe('buildCommentaryBullets — Calxa page 7 (COGS)', () => {
  const placement = resolveCommentaryPlacement(COGS_CONFIG)

  it('every account that moved, alphabetical; the empty drafts (journals, Posters) wait for the coach', () => {
    const bullets = buildCommentaryBullets({ lines: COGS, commentary: augustCommentary(), placement })
    expect(bullets.map((b) => b.account)).toEqual([
      'Antons Canvas', 'Art Supplies', 'Artist Commissions', 'Cushions & Decor',
      'Design images - No royalty', 'Freight to Customer', 'International Orders', 'Rugs',
    ])
  })

  it('the ratio clause only on Antons Canvas and Freight to Customer', () => {
    const byAccount = new Map(buildCommentaryBullets({ lines: COGS, commentary: augustCommentary(), placement }).map((b) => [b.account, b.body]))
    expect(byAccount.get('Antons Canvas')).toBe('Antons Mouldings Pty Ltd ($155,938) - 29.6% of income against a 38.3% driver')
    expect(byAccount.get('Freight to Customer')).toMatch(/ - 9\.7% of income against a 10\.0% driver$/)
    expect(byAccount.get('Rugs')).toBe('Unitex International ($326)')
    expect(byAccount.get('International Orders')).toBe('The Frame Workshop ($6,270), Lumaprints ($5,290), Others ($81)')
    // A favourable COGS account that moved is part of Calxa's list, coach-only or not.
    expect(byAccount.get('Artist Commissions')).toBe('1x Innovations Ab ($1,474)')
  })

  it('the coach text replaces the draft, and the draft stays stored beside it', () => {
    const commentary = augustCommentary()
    commentary.Posters.coach_note = 'No PMI invoice has been received yet for August 2026.'
    commentary['Artist Commissions'].coach_note = '1X Innovations AB - Royalty Q2 2026 ($1,474)'
    const bullets = buildCommentaryBullets({ lines: COGS, commentary, placement })
    const byAccount = new Map(bullets.map((b) => [b.account, b.body]))
    expect(byAccount.get('Artist Commissions')).toBe('1X Innovations AB - Royalty Q2 2026 ($1,474)')
    expect(byAccount.get('Posters')).toBe('No PMI invoice has been received yet for August 2026.')
    expect(bullets.map((b) => b.account).indexOf('Posters')).toBe(bullets.length - 2) // before Rugs
    expect(commentary['Artist Commissions'].draft_note).toContain('1x Innovations Ab ($1,474)')
  })

  it('an account that moved and has nothing to print is named, not silently left off the page', () => {
    // Art Import: $5,042, the largest COGS overspend, and an empty draft (its
    // cost arrives by journal, which has no supplier to quote). The page says
    // it lists every account that moved, so the coach has to hear about it.
    const commentary = augustCommentary()
    delete commentary.Rugs // never drafted: the route was asked before the layout wanted it
    const block = buildCommentaryBlock({ lines: COGS, commentary, placement })
    expect(block.bullets.map((b) => b.account)).not.toContain('Art Import')
    expect(block.uncommented).toEqual([
      { account: 'Art Import', actual: 5042.36, reason: 'no_draft' },
      { account: 'Rugs', actual: 326.48, reason: 'not_drafted' },
    ])
    // Posters did not move and is favourable: hidden on purpose, not a gap.
    expect(block.uncommented.map((g) => g.account)).not.toContain('Posters')
  })

  it('a coach note closes the gap', () => {
    const commentary = augustCommentary()
    commentary['Art Import'].coach_note = 'Frames imported by journal from the US order book.'
    expect(buildCommentaryBlock({ lines: COGS, commentary, placement }).uncommented).toEqual([])
  })

  it('a snapshot drafted before the halves were stored prints its draft whole', () => {
    const commentary = augustCommentary()
    delete commentary.Rugs.draft_facts
    const b = buildCommentaryBullets({ lines: COGS, commentary, placement }).find((x) => x.account === 'Rugs')!
    expect(b.body).toBe('Unitex International ($326) - 0.1% of income against a 0.1% driver')
  })

  it('the clause list matches an account code as well as a name', () => {
    const lines = COGS.map((x) => (x.account_name === 'Rugs' ? { ...x, account_code: '51400' } : x))
    const p = resolveCommentaryPlacement({ commentary: { coverage: 'all_with_activity', ratio_clause: ['51400'] } })
    const byAccount = new Map(buildCommentaryBullets({ lines, commentary: augustCommentary(), placement: p }).map((b) => [b.account, b.body]))
    expect(byAccount.get('Rugs')).toMatch(/ - 0\.1% of income/)
    expect(byAccount.get('Antons Canvas')).toBe('Antons Mouldings Pty Ltd ($155,938)')
  })
})

describe('vendor_cap — how many suppliers a bullet names', () => {
  // Freight to Customer, August 2026, as the route stores it: all nine carriers
  // on vendor_summary, and a draft capped at three. Calxa page 7 names all nine.
  const FREIGHT: [string, number][] = [
    ['Allied Express Transport Pty Ltd', 23594], ['Team Global Express Pty Ltd', 11629], ['Fed Ex', 7195],
    ['Tlc Always Moving', 3078], ['Aramex Melbourne', 2729], ['Aramex Gold Coast', 1117],
    ['Australia Post', 1039], ['Dhl', 282], ['Couriers Please', 263],
  ]
  const summaryOf = (rows: [string, number][]) => rows.map(([vendor, amount]) => ({ vendor, amount, transactions: [] }))
  const txn = (vendor: string, amount: number) => ({ date: '2026-08-11', vendor, context: null, amount, type: 'bank' as const })

  function withSuppliers(): VarianceCommentary {
    const c = augustCommentary()
    c['Freight to Customer'].vendor_summary = summaryOf(FREIGHT)
    c['International Orders'].vendor_summary = [
      ...summaryOf([['The Frame Workshop', 6270], ['Lumaprints', 5290]]),
      { vendor: 'Others', amount: 81, transactions: [txn('Prodigi.com', 81.4)] },
    ]
    c['Art Supplies'].vendor_summary = [{ vendor: 'Others', amount: 117, transactions: [txn('Ebay', 80), txn('Amazon', 36.92)] }]
    c['Art Supplies'].draft_facts = 'Others ($117)'
    c['Art Supplies'].draft_note = 'Others ($117) - 0.0% of income'
    return c
  }
  const bodies = (config: Record<string, unknown>, lines = COGS, commentary = withSuppliers()) =>
    new Map(buildCommentaryBullets({ lines, commentary, placement: resolveCommentaryPlacement(config) }).map((b) => [b.account, b.body]))

  it('reads a count, "all", or a map of account → cap; anything else is a problem and prints the stored draft', () => {
    expect(resolveCommentaryPlacement({ commentary: { vendor_cap: 'all' } }).vendorCap).toBe('all')
    expect(resolveCommentaryPlacement({ commentary: { vendor_cap: 5 } }).vendorCap).toBe(5)
    expect(resolveCommentaryPlacement({ commentary: { vendor_cap: { 'Freight to Customer': 'all', '51200': 4 } } }).vendorCap)
      .toEqual(expect.arrayContaining([{ account: 'Freight to Customer', cap: 'all' }, { account: '51200', cap: 4 }]))
    for (const bad of [0, 2.5, 'every', ['all']]) {
      const read = readCommentaryPlacement({ commentary: { vendor_cap: bad } })
      expect(read.placement.vendorCap).toBeNull()
      expect(read.problems.map((p) => p.field)).toEqual(['vendor_cap'])
    }
    const partial = readCommentaryPlacement({ commentary: { vendor_cap: { 'Freight to Customer': 'all', Rugs: 'lots' } } })
    expect(partial.placement.vendorCap).toEqual([{ account: 'Freight to Customer', cap: 'all' }])
    expect(partial.problems.map((p) => p.field)).toEqual(['vendor_cap'])
    expect(DEFAULT_COMMENTARY_PLACEMENT.vendorCap).toBeNull()
  })

  it('Freight to Customer: "all" names the nine carriers Calxa names, and keeps its clause', () => {
    const b = bodies({ ...COGS_CONFIG, commentary: { ...COGS_CONFIG.commentary, vendor_cap: { 'Freight to Customer': 'all' } } })
    expect(b.get('Freight to Customer')).toBe(
      'Allied Express Transport Pty Ltd ($23,594), Team Global Express Pty Ltd ($11,629), Fed Ex ($7,195), '
      + 'Tlc Always Moving ($3,078), Aramex Melbourne ($2,729), Aramex Gold Coast ($1,117), Australia Post ($1,039), '
      + 'Dhl ($282), Couriers Please ($263) - 9.7% of income against a 10.0% driver',
    )
    // Not listed: the stored draft, exactly.
    expect(b.get('International Orders')).toBe('The Frame Workshop ($6,270), Lumaprints ($5,290), Others ($81)')
  })

  it('"all" on the placement also names the suppliers inside "Others" — Prodigi, ebay and Amazon', () => {
    const b = bodies({ ...COGS_CONFIG, commentary: { ...COGS_CONFIG.commentary, vendor_cap: 'all' } })
    expect(b.get('International Orders')).toBe('The Frame Workshop ($6,270), Lumaprints ($5,290), Prodigi.com ($81)')
    expect(b.get('Art Supplies')).toBe('Ebay ($80), Amazon ($37)')
    expect(b.get('Freight to Customer')).toMatch(/^Allied Express .* Couriers Please \(\$263\) - 9\.7% of income/)
    // An entry with text and no stored suppliers cannot be redrawn, and prints as stored.
    expect(b.get('Antons Canvas')).toBe('Antons Mouldings Pty Ltd ($155,938) - 29.6% of income against a 38.3% driver')
    expect(b.get('Rugs')).toBe('Unitex International ($326)')
  })

  it('a remainder whose transactions do not add back to it stays "Others"', () => {
    const c = withSuppliers()
    c['International Orders'].vendor_summary[2].transactions = []
    const b = bodies({ commentary: { vendor_cap: 'all', coverage: 'all_with_activity', ratio_clause: 'none' } }, COGS, c)
    expect(b.get('International Orders')).toBe('The Frame Workshop ($6,270), Lumaprints ($5,290), Others ($81)')
  })

  it('a number caps every account in the block, and matches a code as well as a name', () => {
    const b = bodies({ commentary: { vendor_cap: 5, ratio_clause: 'none' } })
    expect(b.get('Freight to Customer')).toBe(
      'Allied Express Transport Pty Ltd ($23,594), Team Global Express Pty Ltd ($11,629), Fed Ex ($7,195), '
      + 'Tlc Always Moving ($3,078), Aramex Melbourne ($2,729), +4 others ($2,701)',
    )
    const lines = COGS.map((x) => (x.account_name === 'Freight to Customer' ? { ...x, account_code: '55000' } : x))
    expect(bodies({ commentary: { vendor_cap: { '55000': 8 }, ratio_clause: 'none' } }, lines).get('Freight to Customer'))
      .toMatch(/Dhl \(\$282\), Couriers Please \(\$263\)$/)
  })

  it('a withheld list is still withheld, and a replace-mode coach note still replaces', () => {
    const c = withSuppliers()
    c['Freight to Customer'].draft_warnings = ['The suppliers quoted total $51,733 against an account that moved $50,925 this month.']
    c['International Orders'].coach_note = 'Lumaprints is the US fulfilment trial.'
    const b = bodies({ ...COGS_CONFIG, commentary: { ...COGS_CONFIG.commentary, vendor_cap: 'all' } }, COGS, c)
    expect(b.get('Freight to Customer')).toBe('Supplier detail withheld — the supplier list does not agree with this account this month.')
    expect(b.get('International Orders')).toBe('Lumaprints is the US fulfilment trial.')
  })

  it('a cap that could not be applied is returned for the coach, not silently ignored', () => {
    // Urban Road's stored August entries predate draft_facts: "all" on the
    // placement did nothing, and nothing said so until the render was read
    // beside Calxa's.
    const c = withSuppliers()
    delete (c['Freight to Customer'] as Partial<VarianceCommentaryEntry>).draft_facts
    c['International Orders'].coach_note = 'Lumaprints is the US fulfilment trial.' // replace: the cap has nothing to act on
    c['Cushions & Decor'].draft_warnings = ['does not agree'] // withheld: nothing to cap
    const placement = resolveCommentaryPlacement({ ...COGS_CONFIG, commentary: { ...COGS_CONFIG.commentary, vendor_cap: 'all' } })
    const block = buildCommentaryBlock({ lines: COGS, commentary: c, placement })
    expect(block.capIgnored).toEqual([
      { account: 'Antons Canvas', reason: 'no_suppliers_stored' },
      { account: 'Artist Commissions', reason: 'no_suppliers_stored' },
      { account: 'Design images - No royalty', reason: 'no_suppliers_stored' },
      { account: 'Freight to Customer', reason: 'drafted_before_split' },
      { account: 'Rugs', reason: 'no_suppliers_stored' },
    ])
    // The bullet still prints, as stored — the report is beside it, not instead of it.
    expect(new Map(block.bullets.map((b) => [b.account, b.body])).get('Freight to Customer')).toMatch(/\+6 others \(\$8,508\)/)
    // No cap, nothing to report.
    expect(buildCommentaryBlock({ lines: COGS, commentary: c, placement: resolveCommentaryPlacement(COGS_CONFIG) }).capIgnored).toEqual([])
    // A cap on one account reports only that account.
    const one = resolveCommentaryPlacement({ commentary: { vendor_cap: { Rugs: 'all' }, coverage: 'all_with_activity' } })
    expect(buildCommentaryBlock({ lines: COGS, commentary: c, placement: one }).capIgnored).toEqual([{ account: 'Rugs', reason: 'no_suppliers_stored' }])
  })

  it('without vendor_cap the bullets are byte-for-byte the stored drafts', () => {
    const withCap = buildCommentaryBullets({ lines: COGS, commentary: withSuppliers(), placement: DEFAULT_COMMENTARY_PLACEMENT })
    const stored = buildCommentaryBullets({ lines: COGS, commentary: augustCommentary(), placement: DEFAULT_COMMENTARY_PLACEMENT })
    expect(withCap.filter((b) => b.account !== 'Art Supplies')).toEqual(stored.filter((b) => b.account !== 'Art Supplies'))
    expect(new Map(withCap.map((b) => [b.account, b.body])).get('Freight to Customer'))
      .toBe('Allied Express Transport Pty Ltd ($23,594), Team Global Express Pty Ltd ($11,629), Fed Ex ($7,195), +6 others ($8,508) - 9.7% of income against a 10.0% driver')
  })
})

describe('buildCommentaryBullets — Calxa pages 11-12 (expenses)', () => {
  const placement = resolveCommentaryPlacement(EXPENSE_CONFIG)

  it('standing lines first, then overspends largest first; no clause, no favourable bullet, no duplicate', () => {
    const bullets = buildCommentaryBullets({
      lines: OPEX, commentary: augustCommentary(), placement, standing: STANDING, packPageLabels: PACK_LABELS,
    })
    expect(bullets).toEqual([
      { account: 'Wages & Salaries', body: 'Refer to Payroll Summary Page' },
      { account: 'Contractors excl. Artists', body: 'Refer to summary page' },
      { account: 'IT Costs Software', body: 'Refer to summary page' },
      { account: 'Marketing Digital Ad Spend', body: 'Google Workspace ($16,553), Facebook ($5,117), Pintrest ($1,474)' },
      { account: 'Employ - Staff Amenities', body: 'Alcotraz ($918), Food ($323)' },
      { account: "T/E - Air Fares/Taxis - O'seas", body: 'Travel ($419), Uber ($164)' },
    ])
  })

  it('the favourable Shopify Fees bullet prints once the coach writes a note on it', () => {
    const commentary = augustCommentary()
    commentary['Shopify Fees'].coach_note = 'Plan downgraded in July.'
    const bullets = buildCommentaryBullets({ lines: OPEX, commentary, placement })
    expect(bullets.find((b) => b.account === 'Shopify Fees')?.body).toBe('Plan downgraded in July.')
  })

  it('a note on an account with a standing line joins the standing bullet rather than vanishing', () => {
    const commentary = augustCommentary()
    commentary['IT Costs Software'].coach_note = 'Two Figma seats cancelled.'
    const bullets = buildCommentaryBullets({ lines: OPEX, commentary, placement, standing: STANDING, packPageLabels: PACK_LABELS })
    expect(bullets.find((b) => b.account === 'IT Costs Software')?.body).toBe('Refer to summary page — Two Figma seats cancelled.')
    expect(bullets.filter((b) => b.account === 'IT Costs Software')).toHaveLength(1)
  })

  it('a standing line claims the accounts it names, not only the one its label spells', () => {
    // "Wages & Salaries" is Calxa's wording; the account is "Employ - Wages &
    // Salaries". In a month wages ran over, the label alone left both the
    // "Refer to" line and a supplier list for the same cost.
    const lines = OPEX.map((x) => (x.account_name === 'Employ - Wages & Salaries' ? { ...x, actual: 58000, variance_amount: 52519 - 58000, account_code: '61000' } : x))
    const commentary = augustCommentary()
    commentary['Employ - Wages & Salaries'] = drafted('expense_over_budget_dollar', 'Employment Hero ($58,000)', '11.0% of income against a 11.7% driver')
    const withAccounts = STANDING.map((s) => (s.label === 'Wages & Salaries' ? { ...s, accounts: ['Employ - Wages & Salaries'] } : s))
    const bullets = buildCommentaryBullets({ lines, commentary, placement, standing: withAccounts, packPageLabels: PACK_LABELS })
    expect(bullets.filter((b) => /Wages/.test(b.account))).toEqual([{ account: 'Wages & Salaries', body: 'Refer to Payroll Summary Page' }])
    // A code claims it too.
    const byCode = STANDING.map((s) => (s.label === 'Wages & Salaries' ? { ...s, accounts: ['61000'] } : s))
    expect(buildCommentaryBullets({ lines, commentary, placement, standing: byCode, packPageLabels: PACK_LABELS })
      .map((b) => b.account)).not.toContain('Employ - Wages & Salaries')
    // Without it the label matches nothing, and both print.
    expect(buildCommentaryBullets({ lines, commentary, placement, standing: STANDING, packPageLabels: PACK_LABELS })
      .map((b) => b.account)).toContain('Employ - Wages & Salaries')
  })

  it('a standing line whose page is not in this pack is flagged, not dropped', () => {
    const bullets = buildCommentaryBullets({
      lines: OPEX, commentary: augustCommentary(), placement, standing: STANDING,
      packPageLabels: PACK_LABELS.filter((p) => p !== 'Contractor Analysis'),
    })
    expect(bullets[1]).toEqual({ account: 'Contractors excl. Artists', body: 'Refer to summary page (page not in this pack)', flagged: true })
    expect(bullets[0].flagged).toBeUndefined()
  })

  it('with the default placement the favourable bullet and every clause still print', () => {
    const bullets = buildCommentaryBullets({ lines: OPEX, commentary: augustCommentary(), placement: DEFAULT_COMMENTARY_PLACEMENT })
    expect(bullets.map((b) => b.account)).toEqual(OPEX.filter((x) => x.account_name !== 'Employ - Wages & Salaries').map((x) => x.account_name))
    expect(bullets.find((b) => b.account === 'Shopify Fees')?.body).toBe('Shopify ($2,635) - 0.5% of income against a 0.9% driver')
  })
})
