/**
 * The figures are Urban Road's, read from xero_pl_lines_wide_compat and matched
 * against Xero to the cent for Feb–Aug 2026. Total Income is the statement's
 * Revenue subtotal (it excludes the bank interest in 81000). August's Posters
 * COGS has NO row: the supplier had not billed, and Xero shows $0.
 */
import { describe, it, expect } from 'vitest'
import {
  parseRatioAnalysisConfig,
  requiredWindow,
  buildRatioTable,
  formatRatioCell,
  AVERAGE_NEEDS_EVERY_MONTH,
  AVERAGE_AMOUNT_NEEDS_EVERY_MONTH,
  type AccountActuals,
  type RatioAnalysisConfig,
  type RatioTable,
} from '../ratio-table'

const MONTHS = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08']

const byMonth = (values: (number | null)[]): Record<string, number> => {
  const out: Record<string, number> = {}
  values.forEach((v, i) => { if (v !== null) out[MONTHS[i]] = v })
  return out
}

function urbanRoad(overrides: Partial<AccountActuals> = {}): AccountActuals {
  return {
    months: MONTHS,
    first_synced_month: '2025-07',
    synced_at: '2026-09-14T04:00:00Z',
    accounts: {
      '55000': {
        name: 'Freight to Customer', account_type: 'cogs',
        values: byMonth([55555.67, 55843.27, 48706.89, 43142.27, 54145.63, 50307.5, 51102.0, 50924.95]),
      },
      '41700': {
        name: 'Posters (41700)', account_type: 'revenue',
        values: byMonth([62470.74, 47195.44, 39100.62, 44535.22, 61122.92, 68118.66, 56076.86, 66911.11]),
      },
      '51150': {
        name: 'Posters', account_type: 'cogs',
        values: byMonth([35542.73, 31391.68, 17628.85, 23354.36, 25669.84, 26335.76, 33710.98, null]),
      },
    },
    totals: {
      income: byMonth([478745.39, 398350.79, 430796.94, 419494.5, 508134.18, 569002.79, 495217.03, 527561.8]),
      cost_of_sales: {},
      gross_profit: {},
      operating_expenses: {},
    },
    ...overrides,
  }
}

const URBAN_ROAD_CONFIG = {
  months_shown: 3,
  trailing_averages: [6, 3],
  ratios: [
    { label: 'Freight % Income', numerator: { accounts: ['55000'] }, denominator: { total: 'income' } },
    { label: 'Posters COGS % of Posters income', numerator: { accounts: ['51150'] }, denominator: { accounts: ['41700'] } },
  ],
}

function parsed(raw: unknown): RatioAnalysisConfig {
  const result = parseRatioAnalysisConfig(raw)
  if (!result.ok) throw new Error(result.reason)
  return result.config
}

function table(actuals: AccountActuals, raw: unknown, index = 0, month = '2026-08'): RatioTable {
  const config = parsed(raw)
  return buildRatioTable(actuals, config.ratios[index], month, config)
}

const texts = (t: RatioTable, kind: string, window?: number): string[] => {
  const row = t.rows.find((r) => r.kind === kind && (window === undefined || r.window === window))
  if (!row) throw new Error(`no ${kind} row`)
  return row.cells.map((c) => formatRatioCell(row, c))
}

const reasonsOf = (t: RatioTable, kind: string, window?: number): string[] => {
  const row = t.rows.find((r) => r.kind === kind && (window === undefined || r.window === window))!
  return row.cells.map((c) => (c.kind === 'empty' ? c.reason : ''))
}

describe('parseRatioAnalysisConfig', () => {
  it('fills the defaults: three months, 6- and 3-month averages, amounts shown', () => {
    const config = parsed({
      ratios: [{ label: 'Freight % Income', numerator: { accounts: ['55000'] }, denominator: { total: 'income' } }],
    })
    expect(config.months_shown).toBe(3)
    expect(config.trailing_averages).toEqual([6, 3])
    expect(config.show_amounts).toBe(true)
  })

  it('accepts the codes the fleet really has — dots, dashes, one with a space', () => {
    const result = parseRatioAnalysisConfig({
      ratios: [{ label: 'x', numerator: { accounts: ['6380.30', '225-05', '400 03'] }, denominator: { total: 'gross_profit' } }],
    })
    expect(result.ok).toBe(true)
  })

  it.each([
    ['no config at all', undefined, 'ratios'],
    ['no ratios', { ratios: [] }, 'ratios'],
    ['five ratios', { ratios: Array(5).fill({ label: 'x', numerator: { total: 'income' }, denominator: { total: 'income' } }) }, 'ratios'],
    ['months_shown 0', { months_shown: 0, ratios: [{ label: 'x', numerator: { total: 'income' }, denominator: { total: 'income' } }] }, 'months_shown'],
    ['months_shown 7', { months_shown: 7, ratios: [{ label: 'x', numerator: { total: 'income' }, denominator: { total: 'income' } }] }, 'months_shown'],
    ['a 1-month average', { trailing_averages: [1], ratios: [{ label: 'x', numerator: { total: 'income' }, denominator: { total: 'income' } }] }, 'trailing_averages'],
    ['a 13-month average', { trailing_averages: [13], ratios: [{ label: 'x', numerator: { total: 'income' }, denominator: { total: 'income' } }] }, 'trailing_averages'],
    ['an unknown total', { ratios: [{ label: 'x', numerator: { total: 'revenue' }, denominator: { total: 'income' } }] }, 'ratios.0.numerator'],
    ['accounts AND total', { ratios: [{ label: 'x', numerator: { accounts: ['55000'], total: 'income' }, denominator: { total: 'income' } }] }, 'ratios.0.numerator'],
    ['a code with a comma', { ratios: [{ label: 'x', numerator: { accounts: ['55000,1'] }, denominator: { total: 'income' } }] }, 'ratios.0.numerator'],
    ['a blank label', { ratios: [{ label: ' ', numerator: { total: 'income' }, denominator: { total: 'income' } }] }, 'ratios.0.label'],
    ['a typo’d key', { trailing_average: [6], ratios: [{ label: 'x', numerator: { total: 'income' }, denominator: { total: 'income' } }] }, 'trailing_average'],
  ])('refuses %s, and says where', (_name, raw, where) => {
    const result = parseRatioAnalysisConfig(raw)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain(where)
  })
})

describe('requiredWindow', () => {
  it('is months_shown + the widest average − 1, with every code named', () => {
    expect(requiredWindow([parsed(URBAN_ROAD_CONFIG)])).toEqual({ months: 8, codes: ['41700', '51150', '55000'] })
  })

  it('takes the maximum across placements and honours a per-ratio override', () => {
    const narrow = parsed({
      months_shown: 2,
      ratios: [{ label: 'x', numerator: { accounts: ['1'] }, denominator: { total: 'income' }, trailing_averages: [] }],
    })
    expect(requiredWindow([narrow])).toEqual({ months: 2, codes: ['1'] })
    const wide = parsed({
      months_shown: 4,
      trailing_averages: [12],
      ratios: [{ label: 'y', numerator: { accounts: ['2'] }, denominator: { accounts: ['1'] } }],
    })
    expect(requiredWindow([narrow, wide])).toEqual({ months: 15, codes: ['1', '2'] })
  })
})

describe('the Urban Road August 2026 page', () => {
  it('runs newest on the left', () => {
    expect(table(urbanRoad(), URBAN_ROAD_CONFIG).months).toEqual(['2026-08', '2026-07', '2026-06'])
  })

  it('Freight % Income — every cell', () => {
    const t = table(urbanRoad(), URBAN_ROAD_CONFIG, 0)
    expect(texts(t, 'numerator')).toEqual(['50,925', '51,102', '50,308'])
    expect(texts(t, 'denominator')).toEqual(['527,562', '495,217', '569,003'])
    expect(texts(t, 'ratio')).toEqual(['9.65%', '10.32%', '8.84%'])
    // Windows Mar–Aug / Feb–Jul / Jan–Jun.
    expect(texts(t, 'average', 6)).toEqual(['10.18%', '10.90%', '11.12%'])
    // Windows Jun–Aug / May–Jul / Apr–Jun.
    expect(texts(t, 'average', 3)).toEqual(['9.60%', '9.94%', '9.93%'])
    expect(t.rows.map((r) => r.label)).toEqual([
      'Freight to Customer (55000)', 'Total Income', 'Freight % Income', '6-month avg %', '3-month avg %',
    ])
    expect(t.reasons).toEqual([])
  })

  it('Posters COGS % of Posters income — August is a dash with its reason, not 0%', () => {
    const t = table(urbanRoad(), URBAN_ROAD_CONFIG, 1)
    expect(texts(t, 'ratio')).toEqual(['—', '60.12%', '38.66%'])
    expect(reasonsOf(t, 'ratio')[0]).toBe('no amount posted to Posters (51150) for Aug 2026')
    expect(texts(t, 'numerator')).toEqual(['—', '33,711', '26,336'])
    // The denominator posted; only the numerator is missing.
    expect(texts(t, 'denominator')).toEqual(['66,911', '56,077', '68,119'])
    // Every August-containing average is a dash; June's windows end before it.
    expect(texts(t, 'average', 6)).toEqual(['—', '50.80%', '50.27%'])
    expect(texts(t, 'average', 3)).toEqual(['—', '46.92%', '44.37%'])
    // Xero named 41700 'Posters (41700)'; the code is not appended twice.
    expect(t.rows.filter((r) => r.kind !== 'average').map((r) => r.label)).toEqual([
      'Posters (51150)', 'Posters (41700)', 'Posters COGS % of Posters income',
    ])
    // The cell carries its window; the note under the block names the cause
    // and the rule, once each.
    expect(reasonsOf(t, 'average', 6)[0]).toBe('the 6-month average needs a ratio for every month from Mar 2026 to Aug 2026')
    expect(t.reasons).toEqual([
      'no amount posted to Posters (51150) for Aug 2026',
      AVERAGE_NEEDS_EVERY_MONTH,
    ])
  })
})

describe('the averaging method (proof against the reference pack)', () => {
  // The inputs the reference pack's author typed in at the time — income and
  // freight, back-solved to ±$3. The pack printed 9.60 / 10.35 / 10.56 and
  // 9.61 / 9.46 / 9.08. The mean of the monthly ratios over a window that
  // includes the column's month reproduces all six; the ratio of summed
  // amounts, or a window that stops the month before, does not.
  const typed: [number, number][] = [
    [478_099, 55_554], [395_394, 55_845], [430_037, 44_730], [418_537, 38_430],
    [508_437, 46_685], [567_254, 50_308], [495_217, 51_102], [527_562, 50_925],
  ]
  const actuals = urbanRoad({
    accounts: {
      '55000': { name: 'Freight to Customer', account_type: 'cogs', values: byMonth(typed.map(([, f]) => f)) },
    },
    totals: { income: byMonth(typed.map(([i]) => i)), cost_of_sales: {}, gross_profit: {}, operating_expenses: {} },
  })
  const config = { ...URBAN_ROAD_CONFIG, ratios: [URBAN_ROAD_CONFIG.ratios[0]] }

  it.each([
    [6, [9.6, 10.35, 10.56]],
    [3, [9.61, 9.46, 9.08]],
  ])('%s-month averages match the pack to 0.01pp', (window, printed) => {
    const t = table(actuals, config)
    const row = t.rows.find((r) => r.kind === 'average' && r.window === window)!
    row.cells.forEach((cell, i) => {
      expect(cell.kind).toBe('value')
      if (cell.kind === 'value') expect(Math.abs(cell.value - printed[i])).toBeLessThanOrEqual(0.01)
    })
  })

  it('the ratio of summed amounts would NOT have matched (the method is load-bearing)', () => {
    const span = typed.slice(2, 8)
    const pooled = (span.reduce((t, [, f]) => t + f, 0) / span.reduce((t, [i]) => t + i, 0)) * 100
    expect(Math.abs(pooled - 9.6)).toBeGreaterThan(0.01)
  })

  it('a window that stops the month before the column would NOT have matched either', () => {
    // Aug's 6-month window taken as Feb–Jul instead of Mar–Aug.
    const span = typed.slice(1, 7)
    const exclusive = span.reduce((t, [i, f]) => t + (f / i) * 100, 0) / span.length
    expect(Math.abs(exclusive - 9.6)).toBeGreaterThan(0.01)
  })
})

describe('empty cells say why', () => {
  it('an average with one missing month in its window is a dash, never an average of fewer months', () => {
    const actuals = urbanRoad()
    delete actuals.accounts['55000'].values['2026-04']
    const t = table(actuals, URBAN_ROAD_CONFIG, 0)
    // Aug's 6-month window is Mar–Aug, which contains April.
    expect(texts(t, 'average', 6)).toEqual(['—', '—', '—'])
    // Aug's and Jul's 3-month windows do not; Jun's (Apr–Jun) does.
    expect(texts(t, 'average', 3)).toEqual(['9.60%', '9.94%', '—'])
    expect(t.reasons).toContain('no amount posted to Freight to Customer (55000) for Apr 2026')
    expect(reasonsOf(t, 'average', 3)[2]).toBe('the 3-month average needs a ratio for every month from Apr 2026 to Jun 2026')
    expect(t.reasons).toEqual(['no amount posted to Freight to Customer (55000) for Apr 2026', AVERAGE_NEEDS_EVERY_MONTH])
  })

  it('a zero denominator is a dash', () => {
    const actuals = urbanRoad()
    actuals.totals.income['2026-07'] = 0
    const t = table(actuals, URBAN_ROAD_CONFIG, 0)
    expect(texts(t, 'ratio')).toEqual(['9.65%', '—', '8.84%'])
    expect(reasonsOf(t, 'ratio')[1]).toBe('Total Income was zero for Jul 2026')
  })

  it('a negative denominator is a dash; a negative numerator is a negative ratio', () => {
    const actuals = urbanRoad()
    actuals.totals.income['2026-07'] = -10
    actuals.accounts['55000'].values['2026-06'] = -5690.03
    const t = table(actuals, URBAN_ROAD_CONFIG, 0)
    expect(reasonsOf(t, 'ratio')[1]).toBe('Total Income was negative for Jul 2026')
    expect(texts(t, 'ratio')[2]).toBe('(1.00%)')
  })

  it('a code missing from the ledger is "account <code> not found" — never 0%', () => {
    const t = table(urbanRoad(), {
      ratios: [{ label: 'Typo', numerator: { accounts: ['55001'] }, denominator: { total: 'income' } }],
    })
    expect(texts(t, 'ratio')).toEqual(['—', '—', '—'])
    expect(t.reasons).toEqual(['account 55001 not found', AVERAGE_NEEDS_EVERY_MONTH])
  })

  it('a month before the first synced month is "not enough history"', () => {
    const actuals = urbanRoad({ first_synced_month: '2026-05' })
    const t = table(actuals, URBAN_ROAD_CONFIG, 0)
    expect(texts(t, 'ratio')).toEqual(['9.65%', '10.32%', '8.84%'])
    // Aug's 3-month window (Jun–Aug) is all synced; its 6-month one is not.
    expect(texts(t, 'average', 3)).toEqual(['9.60%', '9.94%', '—'])
    expect(texts(t, 'average', 6)).toEqual(['—', '—', '—'])
    expect(t.reasons).toContain('not enough history — synced from May 2026')
  })

  it('a per-ratio trailing_averages of [] drops that block’s averages', () => {
    const t = table(urbanRoad(), {
      ...URBAN_ROAD_CONFIG,
      ratios: [{ ...URBAN_ROAD_CONFIG.ratios[0], trailing_averages: [] }],
    })
    expect(t.rows.map((r) => r.kind)).toEqual(['numerator', 'denominator', 'ratio'])
    expect(t.averages).toEqual([])
  })

  it('show_amounts false prints the percentage rows only', () => {
    const t = table(urbanRoad(), { ...URBAN_ROAD_CONFIG, show_amounts: false })
    expect(t.rows.map((r) => r.kind)).toEqual(['ratio', 'average', 'average'])
  })
})

describe('a labelled operand', () => {
  it("names the dash by the row's label, so the note points at a line on the page", () => {
    const config = parsed({
      months_shown: 3,
      trailing_averages: [],
      ratios: [{
        label: "Poster's COGS % of Poster's Income",
        numerator: { accounts: ['51150'], label: "Poster's COGS" },
        denominator: { accounts: ['41700'], label: "Poster's Income" },
      }],
    })
    const t = buildRatioTable(urbanRoad(), config.ratios[0], '2026-08', config)
    expect(t.rows.map((r) => r.label)).toEqual(["Poster's COGS", "Poster's Income", "Poster's COGS % of Poster's Income"])
    expect(t.reasons).toEqual(["no amount posted to Poster's COGS (51150) for Aug 2026"])
  })
})

describe('the sheet layout (Calxa p8, "COGS Tables")', () => {
  // Urban Road's placement as the reference sheet sets it out: income above
  // freight, each average its own block with its dollars, and the sheet's
  // labels. The figures are the ledger's; where the sheet's typed-in March–May
  // freight was short the page is right and the sheet is not, but the one
  // window clear of those months ties it to the dollar.
  const SHEET = {
    months_shown: 3,
    trailing_averages: [6, 3],
    amounts_order: 'denominator_first',
    average_blocks: true,
    block_headings: false,
    table_style: 'grid',
    ratios: [
      { label: '% of Freight to Customer', numerator: { accounts: ['55000'], label: 'Freight to Customer' }, denominator: { total: 'income' } },
      {
        label: "% of Poster's COGS to Income",
        numerator: { accounts: ['51150'], label: "Poster's COGS" },
        denominator: { accounts: ['41700'], label: "Poster's Income" },
        trailing_averages: [],
      },
    ],
  }

  it('leaves every existing page as it was: the four settings default to the first layout', () => {
    expect(parsed(URBAN_ROAD_CONFIG)).toMatchObject({
      amounts_order: 'numerator_first',
      average_blocks: false,
      block_headings: true,
      table_style: 'pack',
    })
    expect(table(urbanRoad(), URBAN_ROAD_CONFIG, 0).rows.map((r) => r.kind)).toEqual([
      'numerator', 'denominator', 'ratio', 'average', 'average',
    ])
  })

  it.each([
    ['an unknown order', { amounts_order: 'income_first' }, 'amounts_order'],
    ['an unknown style', { table_style: 'sheet' }, 'table_style'],
    ['a string for a flag', { average_blocks: 'yes' }, 'average_blocks'],
  ])('refuses %s, and says where', (_name, extra, where) => {
    const result = parseRatioAnalysisConfig({ ...SHEET, ...extra })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain(where)
  })

  it('Freight — the denominator first, then a block per window, every cell', () => {
    const t = table(urbanRoad(), SHEET, 0)
    expect(t.rows.map((r) => [r.kind, r.label])).toEqual([
      ['denominator', 'Total Income'],
      ['numerator', 'Freight to Customer'],
      ['ratio', '% of Freight to Customer'],
      ['heading', 'Average for the last 6 months.'],
      ['average_denominator', 'Average Total Income'],
      ['average_numerator', 'Average Freight to Customer'],
      ['average', 'Average % of Freight to Customer'],
      ['heading', 'Average for the last 3 months.'],
      ['average_denominator', 'Average Total Income'],
      ['average_numerator', 'Average Freight to Customer'],
      ['average', 'Average % of Freight to Customer'],
    ])
    expect(texts(t, 'denominator')).toEqual(['527,562', '495,217', '569,003'])
    expect(texts(t, 'numerator')).toEqual(['50,925', '51,102', '50,308'])
    expect(texts(t, 'ratio')).toEqual(['9.65%', '10.32%', '8.84%'])
    // Mar–Aug / Feb–Jul / Jan–Jun: the mean of each month's amount.
    expect(texts(t, 'average_denominator', 6)).toEqual(['491,701', '470,166', '467,421'])
    expect(texts(t, 'average_numerator', 6)).toEqual(['49,722', '50,541', '51,284'])
    expect(texts(t, 'average', 6)).toEqual(['10.18%', '10.90%', '11.12%'])
    // Jun–Aug / May–Jul / Apr–Jun. August's 50,778 is the sheet's figure.
    expect(texts(t, 'average_denominator', 3)).toEqual(['530,594', '524,118', '498,877'])
    expect(texts(t, 'average_numerator', 3)).toEqual(['50,778', '51,852', '49,198'])
    expect(texts(t, 'average', 3)).toEqual(['9.60%', '9.94%', '9.93%'])
    expect(t.rows.find((r) => r.kind === 'heading')!.cells).toEqual([])
    expect(t.reasons).toEqual([])
  })

  it('the averaged dollars are means of the amounts — they do not divide into the average %', () => {
    const t = table(urbanRoad(), SHEET, 0)
    const aug = (kind: string) => (t.rows.find((r) => r.kind === kind && r.window === 6)!.cells[0] as { value: number }).value
    // 49,722 / 491,701 is 10.11%; the page prints 10.18%, the mean of the ratios.
    expect(((aug('average_numerator') / aug('average_denominator')) * 100).toFixed(2)).toBe('10.11')
    expect(aug('average').toFixed(2)).toBe('10.18')
  })

  it("Poster's — income first, August a dash with its reason, no averages", () => {
    const t = table(urbanRoad(), SHEET, 1)
    expect(t.rows.map((r) => r.label)).toEqual(["Poster's Income", "Poster's COGS", "% of Poster's COGS to Income"])
    expect(texts(t, 'denominator')).toEqual(['66,911', '56,077', '68,119'])
    expect(texts(t, 'numerator')).toEqual(['—', '33,711', '26,336'])
    expect(texts(t, 'ratio')).toEqual(['—', '60.12%', '38.66%'])
    expect(t.reasons).toEqual(["no amount posted to Poster's COGS (51150) for Aug 2026"])
  })

  it('an averaged amount needs every month of its window — independently of the other line', () => {
    const actuals = urbanRoad()
    delete actuals.accounts['55000'].values['2026-04']
    const t = table(actuals, SHEET, 0)
    expect(texts(t, 'average_numerator', 6)).toEqual(['—', '—', '—'])
    expect(texts(t, 'average_numerator', 3)).toEqual(['50,778', '51,852', '—'])
    // April's income did post, so every income average still prints.
    expect(texts(t, 'average_denominator', 6)).toEqual(['491,701', '470,166', '467,421'])
    expect(texts(t, 'average_denominator', 3)).toEqual(['530,594', '524,118', '498,877'])
    expect(reasonsOf(t, 'average_numerator', 3)[2]).toBe(
      'the 3-month average of Freight to Customer needs an amount for every month from Apr 2026 to Jun 2026',
    )
    // The unposted month is named once, then each rule once.
    expect(t.reasons).toEqual([
      'no amount posted to Freight to Customer (55000) for Apr 2026',
      AVERAGE_NEEDS_EVERY_MONTH,
      AVERAGE_AMOUNT_NEEDS_EVERY_MONTH,
    ])
  })

  it('show_amounts false keeps the blocks but prints only their percentages', () => {
    const t = table(urbanRoad(), { ...SHEET, show_amounts: false }, 0)
    expect(t.rows.map((r) => r.kind)).toEqual(['ratio', 'heading', 'average', 'heading', 'average'])
  })

  it('numerator_first keeps the numerator on top inside each block too', () => {
    const t = table(urbanRoad(), { ...SHEET, amounts_order: 'numerator_first' }, 0)
    expect(t.rows.slice(0, 7).map((r) => r.kind)).toEqual([
      'numerator', 'denominator', 'ratio', 'heading', 'average_numerator', 'average_denominator', 'average',
    ])
  })
})
