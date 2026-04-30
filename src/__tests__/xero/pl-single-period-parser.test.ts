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
})
