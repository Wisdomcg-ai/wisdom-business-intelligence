/**
 * Phase 44.2 Plan 44.2-06B Task 4 — parsePLSinglePeriod tests.
 *
 * Validates:
 *   1. Happy path on JDS Jul 2025 fixture: emits long-format rows with
 *      explicit period_month + basis stamps, account_id is the AccountID
 *      GUID from Cells[0].Attributes.
 *   2. D-44.2-14 classification fix: a sub-section like
 *      "Software Development" (non-classifying) under "Less Cost of Sales"
 *      (classifying) leaves the inherited 'cogs' classification intact —
 *      "PK Costs" lands in cogs, NOT opex.
 *   3. FXGROUPID rows: emitted with a stable derived uuid-v5 account_id
 *      (deterministic across calls).
 *   4. Missing AccountID: emitted with a synthetic uuid-v5 account_id
 *      derived from tenant_id + account_name.
 *   5. SummaryRow exclusion: "Total Cost of Sales" not emitted.
 *   6. Empty Cells[1].Value (no transaction): amount=0.
 *   7. Negative amount in parens "(123.45)" → -123.45.
 */
import { describe, it, expect } from 'vitest'

const TENANT_A = '11111111-1111-1111-1111-111111111111'

function classifyAccountTypeOnly(report: any) {
  return report // no-op, helper placeholder for type narrowing
}
void classifyAccountTypeOnly

describe('parsePLSinglePeriod', () => {
  it('Test 1 — happy path: JDS-shape fixture emits rows with period_month + basis + AccountID', async () => {
    const { parsePLSinglePeriod } = await import('@/lib/xero/pl-single-period-parser')
    const fixture = {
      Reports: [
        {
          Rows: [
            {
              RowType: 'Header',
              Cells: [{ Value: '' }, { Value: '31 Jul 2025' }],
            },
            {
              RowType: 'Section',
              Title: 'Income',
              Rows: [
                {
                  RowType: 'Row',
                  Cells: [
                    {
                      Value: 'Sales - Hardware',
                      Attributes: [
                        { Id: 'account', Value: '8659dd53-4eec-469a-b5e2-9aefd38494a0' },
                      ],
                    },
                    { Value: '259550.88' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }
    const rows = parsePLSinglePeriod(fixture, '2025-07-01', 'accruals', TENANT_A)
    expect(rows.length).toBe(1)
    expect(rows[0]).toMatchObject({
      account_id: '8659dd53-4eec-469a-b5e2-9aefd38494a0',
      account_name: 'Sales - Hardware',
      account_type: 'revenue',
      period_month: '2025-07-01',
      basis: 'accruals',
      amount: 259550.88,
    })
  })

  it('Test 2 — D-44.2-14 classification fix: PK Costs inherits cogs, not opex', async () => {
    const { parsePLSinglePeriod } = await import('@/lib/xero/pl-single-period-parser')
    const fixture = {
      Reports: [
        {
          Rows: [
            {
              RowType: 'Header',
              Cells: [{ Value: '' }, { Value: '31 Jul 2025' }],
            },
            {
              RowType: 'Section',
              Title: 'Less Cost of Sales',
              Rows: [
                {
                  // Sub-section title that does NOT classify on its own. Pre-fix,
                  // this clobbered currentParentTitle and PK Costs was misclassified
                  // as 'opex'. Post-fix, it leaves the parent ('Less Cost of Sales',
                  // classifies → 'cogs') intact.
                  RowType: 'Section',
                  Title: 'Software Development',
                  Rows: [
                    {
                      RowType: 'Row',
                      Cells: [
                        {
                          Value: 'PK Costs',
                          Attributes: [
                            { Id: 'account', Value: 'aaaa9999-9999-9999-9999-aaaaaaaaaaaa' },
                          ],
                        },
                        { Value: '100.00' },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }
    const rows = parsePLSinglePeriod(fixture, '2025-07-01', 'accruals', TENANT_A)
    const pk = rows.find((r) => r.account_name === 'PK Costs')
    expect(pk).toBeTruthy()
    expect(pk!.account_type).toBe('cogs')
    expect(pk!.account_type).not.toBe('opex')
  })

  it('Test 3 — FXGROUPID row emits stable derived uuid-v5 account_id', async () => {
    const { parsePLSinglePeriod } = await import('@/lib/xero/pl-single-period-parser')
    const fixture = {
      Reports: [
        {
          Rows: [
            {
              RowType: 'Header',
              Cells: [{ Value: '' }, { Value: '31 Jul 2025' }],
            },
            {
              RowType: 'Section',
              Title: 'Income',
              Rows: [
                {
                  RowType: 'Row',
                  Cells: [
                    {
                      Value: 'FX Currency Adjustments',
                      Attributes: [{ Id: 'account', Value: 'FXGROUPID' }],
                    },
                    { Value: '500.00' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }
    const rows1 = parsePLSinglePeriod(fixture, '2025-07-01', 'accruals', TENANT_A)
    const rows2 = parsePLSinglePeriod(fixture, '2025-07-01', 'accruals', TENANT_A)
    expect(rows1.length).toBe(1)
    expect(rows1[0]!.account_id).toMatch(/^[0-9a-f-]{36}$/i)
    expect(rows1[0]!.account_id).toBe(rows2[0]!.account_id) // deterministic
    expect(rows1[0]!.account_name).toBe('FX Currency Adjustments')
    expect(rows1[0]!.account_type).toBe('revenue') // section it appears under
    expect(rows1[0]!.amount).toBe(500.0)
  })

  it('Test 4 — Missing AccountID: synthetic uuid-v5 from tenant_id + name (deterministic)', async () => {
    const { parsePLSinglePeriod } = await import('@/lib/xero/pl-single-period-parser')
    const fixture = {
      Reports: [
        {
          Rows: [
            {
              RowType: 'Header',
              Cells: [{ Value: '' }, { Value: '31 Jul 2025' }],
            },
            {
              RowType: 'Section',
              Title: 'Less Operating Expenses',
              Rows: [
                {
                  RowType: 'Row',
                  Cells: [
                    { Value: 'Suspense' }, // no Attributes
                    { Value: '50.00' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }
    const rows1 = parsePLSinglePeriod(fixture, '2025-07-01', 'accruals', TENANT_A)
    const rows2 = parsePLSinglePeriod(fixture, '2025-07-01', 'accruals', TENANT_A)
    expect(rows1[0]!.account_id).toMatch(/^[0-9a-f-]{36}$/i)
    expect(rows1[0]!.account_id).toBe(rows2[0]!.account_id) // deterministic
    expect(rows1[0]!.account_type).toBe('opex')
  })

  it('Test 5 — SummaryRow exclusion: "Total Cost of Sales" not emitted', async () => {
    const { parsePLSinglePeriod } = await import('@/lib/xero/pl-single-period-parser')
    const fixture = {
      Reports: [
        {
          Rows: [
            {
              RowType: 'Header',
              Cells: [{ Value: '' }, { Value: '31 Jul 2025' }],
            },
            {
              RowType: 'Section',
              Title: 'Less Cost of Sales',
              Rows: [
                {
                  RowType: 'Row',
                  Cells: [
                    {
                      Value: 'Materials',
                      Attributes: [
                        { Id: 'account', Value: 'aaaa1111-1111-1111-1111-aaaaaaaaaaaa' },
                      ],
                    },
                    { Value: '1000.00' },
                  ],
                },
                {
                  RowType: 'SummaryRow',
                  Cells: [{ Value: 'Total Cost of Sales' }, { Value: '1000.00' }],
                },
              ],
            },
          ],
        },
      ],
    }
    const rows = parsePLSinglePeriod(fixture, '2025-07-01', 'accruals', TENANT_A)
    expect(rows.length).toBe(1)
    expect(rows.find((r) => /total cost/i.test(r.account_name))).toBeUndefined()
  })

  it('Test 6 — Empty Cells[1].Value (no transaction in this month) → amount=0', async () => {
    const { parsePLSinglePeriod } = await import('@/lib/xero/pl-single-period-parser')
    const fixture = {
      Reports: [
        {
          Rows: [
            {
              RowType: 'Header',
              Cells: [{ Value: '' }, { Value: '31 Jul 2025' }],
            },
            {
              RowType: 'Section',
              Title: 'Income',
              Rows: [
                {
                  RowType: 'Row',
                  Cells: [
                    {
                      Value: 'Sales - Slow',
                      Attributes: [
                        { Id: 'account', Value: 'aaaa2222-2222-2222-2222-aaaaaaaaaaaa' },
                      ],
                    },
                    { Value: '' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }
    const rows = parsePLSinglePeriod(fixture, '2025-07-01', 'accruals', TENANT_A)
    expect(rows.length).toBe(1)
    expect(rows[0]!.amount).toBe(0)
  })

  it('Test 7 — Negative amount in parens "(123.45)" → -123.45', async () => {
    const { parsePLSinglePeriod } = await import('@/lib/xero/pl-single-period-parser')
    const fixture = {
      Reports: [
        {
          Rows: [
            {
              RowType: 'Header',
              Cells: [{ Value: '' }, { Value: '31 Jul 2025' }],
            },
            {
              RowType: 'Section',
              Title: 'Less Operating Expenses',
              Rows: [
                {
                  RowType: 'Row',
                  Cells: [
                    {
                      Value: 'Refund',
                      Attributes: [
                        { Id: 'account', Value: 'aaaa3333-3333-3333-3333-aaaaaaaaaaaa' },
                      ],
                    },
                    { Value: '(123.45)' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }
    const rows = parsePLSinglePeriod(fixture, '2025-07-01', 'accruals', TENANT_A)
    expect(rows[0]!.amount).toBe(-123.45)
  })

  it('Test 8 — every emitted row carries the explicit caller-supplied period_month + basis', async () => {
    const { parsePLSinglePeriod } = await import('@/lib/xero/pl-single-period-parser')
    const fixture = {
      Reports: [
        {
          Rows: [
            {
              RowType: 'Header',
              Cells: [{ Value: '' }, { Value: 'Some weird header Xero might emit' }],
            },
            {
              RowType: 'Section',
              Title: 'Income',
              Rows: [
                {
                  RowType: 'Row',
                  Cells: [
                    {
                      Value: 'Sales',
                      Attributes: [
                        { Id: 'account', Value: 'aaaa1111-1111-1111-1111-aaaaaaaaaaaa' },
                      ],
                    },
                    { Value: '100.00' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }
    const rows = parsePLSinglePeriod(fixture, '2025-12-01', 'cash', TENANT_A)
    expect(rows[0]!.period_month).toBe('2025-12-01') // NOT inferred from header
    expect(rows[0]!.basis).toBe('cash')
  })

  describe('forward-carry across flat sibling sub-sections (JDS custom layout)', () => {
    // Xero's standardLayout=false flattens user-defined sub-headers into
    // top-level Sections. JDS's response has e.g.
    //   "Less Operating Expenses"   (classifies → opex)
    //   "Admin Expenses"            (classifies → opex)
    //   "Advertising & Marketing"   (does NOT classify) ← rows would be dropped
    //   "Office Expenses"           (classifies → opex)
    // Without forward-carry the "Advertising & Marketing" rows had no
    // effective parent type and were dropped by walkSection's orphan guard.
    // Forward-carry inherits from the most recent classifying sibling.
    const flatFixture = {
      Reports: [
        {
          Rows: [
            {
              RowType: 'Section',
              Title: 'Less Operating Expenses',
              Rows: [
                { RowType: 'Row', Cells: [
                  { Value: 'Bank Charges', Attributes: [{ Id: 'account', Value: 'bbbbbbbb-1111-1111-1111-bbbbbbbbbbbb' }] },
                  { Value: '500.00' },
                ]},
              ],
            },
            {
              RowType: 'Section',
              Title: 'Admin Expenses', // contains "expense" — classifies opex
              Rows: [
                { RowType: 'Row', Cells: [
                  { Value: 'Accountancy Fees', Attributes: [{ Id: 'account', Value: 'cccccccc-2222-2222-2222-cccccccccccc' }] },
                  { Value: '1000.00' },
                ]},
              ],
            },
            {
              RowType: 'Section',
              Title: 'Advertising & Marketing', // does NOT classify
              Rows: [
                { RowType: 'Row', Cells: [
                  { Value: 'JDS Trade Show Exhibitions', Attributes: [{ Id: 'account', Value: 'dddddddd-3333-3333-3333-dddddddddddd' }] },
                  { Value: '90447.23' },
                ]},
                { RowType: 'Row', Cells: [
                  { Value: 'Advertising/Marketing', Attributes: [{ Id: 'account', Value: 'eeeeeeee-4444-4444-4444-eeeeeeeeeeee' }] },
                  { Value: '63871.70' },
                ]},
              ],
            },
            {
              RowType: 'Section',
              Title: 'Office Expenses',
              Rows: [
                { RowType: 'Row', Cells: [
                  { Value: 'Rent', Attributes: [{ Id: 'account', Value: 'ffffffff-5555-5555-5555-ffffffffffff' }] },
                  { Value: '5972.80' },
                ]},
              ],
            },
          ],
        },
      ],
    }

    it('captures rows under non-classifying sibling sub-sections', async () => {
      const { parsePLSinglePeriod } = await import('@/lib/xero/pl-single-period-parser')
      const rows = parsePLSinglePeriod(flatFixture, '2026-03-01', 'accruals', TENANT_A)
      const names = rows.map((r: any) => r.account_name).sort()
      expect(names).toContain('JDS Trade Show Exhibitions')
      expect(names).toContain('Advertising/Marketing')
      expect(rows.length).toBe(5) // 1 + 1 + 2 + 1
    })

    it('inherits opex from the most recent classifying sibling', async () => {
      const { parsePLSinglePeriod } = await import('@/lib/xero/pl-single-period-parser')
      const rows = parsePLSinglePeriod(flatFixture, '2026-03-01', 'accruals', TENANT_A)
      const tradeshow = rows.find((r: any) => r.account_name === 'JDS Trade Show Exhibitions')
      const advert = rows.find((r: any) => r.account_name === 'Advertising/Marketing')
      expect(tradeshow?.account_type).toBe('opex')
      expect(advert?.account_type).toBe('opex')
    })

    it('still classifies own-title sections correctly when title classifies', async () => {
      const { parsePLSinglePeriod } = await import('@/lib/xero/pl-single-period-parser')
      const rows = parsePLSinglePeriod(flatFixture, '2026-03-01', 'accruals', TENANT_A)
      const accountancy = rows.find((r: any) => r.account_name === 'Accountancy Fees')
      const rent = rows.find((r: any) => r.account_name === 'Rent')
      expect(accountancy?.account_type).toBe('opex')
      expect(rent?.account_type).toBe('opex')
    })

    it('forward-carry resets when a new classifying section is encountered', async () => {
      const { parsePLSinglePeriod } = await import('@/lib/xero/pl-single-period-parser')
      // Income → siblings inherit revenue. Less Cost of Sales → siblings inherit cogs.
      const orderingFixture = {
        Reports: [
          {
            Rows: [
              { RowType: 'Section', Title: 'Income', Rows: [
                { RowType: 'Row', Cells: [
                  { Value: 'Sales-Hardware', Attributes: [{ Id: 'account', Value: 'aaaaaaaa-0001-0001-0001-aaaaaaaaaaaa' }] },
                  { Value: '1000' },
                ]},
              ]},
              { RowType: 'Section', Title: 'Software Dept Income', Rows: [ // classifies (income)
                { RowType: 'Row', Cells: [
                  { Value: 'Sales-Software', Attributes: [{ Id: 'account', Value: 'aaaaaaaa-0002-0002-0002-aaaaaaaaaaaa' }] },
                  { Value: '500' },
                ]},
              ]},
              { RowType: 'Section', Title: 'Less Cost of Sales', Rows: [
                { RowType: 'Row', Cells: [
                  { Value: 'Purchases-Hardware', Attributes: [{ Id: 'account', Value: 'bbbbbbbb-0001-0001-0001-bbbbbbbbbbbb' }] },
                  { Value: '300' },
                ]},
              ]},
              { RowType: 'Section', Title: 'Software Development Dept', Rows: [ // does NOT classify → inherits cogs
                { RowType: 'Row', Cells: [
                  { Value: 'PK Costs', Attributes: [{ Id: 'account', Value: 'bbbbbbbb-0002-0002-0002-bbbbbbbbbbbb' }] },
                  { Value: '50' },
                ]},
              ]},
            ],
          },
        ],
      }
      const rows = parsePLSinglePeriod(orderingFixture, '2026-03-01', 'accruals', TENANT_A)
      const types = Object.fromEntries(rows.map((r: any) => [r.account_name, r.account_type]))
      expect(types['Sales-Hardware']).toBe('revenue')
      expect(types['Sales-Software']).toBe('revenue')
      expect(types['Purchases-Hardware']).toBe('cogs')
      expect(types['PK Costs']).toBe('cogs') // critical: forward-carry switched to cogs
    })

    it('parses the real JDS fixture and recovers expense accounts that were previously dropped', async () => {
      const { parsePLSinglePeriod } = await import('@/lib/xero/pl-single-period-parser')
      const fs = await import('node:fs')
      const path = await import('node:path')
      const fixturePath = path.resolve(
        __dirname,
        'fixtures/jds-recon-2026-04.json',
      )
      if (!fs.existsSync(fixturePath)) return // fixture optional in CI
      const raw = fs.readFileSync(fixturePath, 'utf8')
      const fixture = JSON.parse(raw)
      const rows = parsePLSinglePeriod(fixture, '2026-04-01', 'accruals', TENANT_A)
      const opexNames = new Set(
        rows.filter((r: any) => r.account_type === 'opex').map((r: any) => r.account_name),
      )
      // These are the high-value accounts that pre-fix were dropped because
      // they live under flat sibling sub-sections that don't classify.
      const mustHave = [
        'JDS Trade Show Exhibitions',
        'Advertising/Marketing',
        'Travelling Expenses',
      ]
      for (const name of mustHave) {
        expect(opexNames).toContain(name)
      }
    })
  })
})
