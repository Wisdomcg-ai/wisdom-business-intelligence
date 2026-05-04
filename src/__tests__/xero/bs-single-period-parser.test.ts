/**
 * Phase 44.2 Plan 44.2-06D Task 1 — parseBSSinglePeriod tests.
 *
 * BS twin of pl-single-period-parser.test.ts. Validates:
 *   1. Happy path: synthetic Xero BS fixture with Assets/Liabilities/Equity
 *      sections → emits rows with explicit balance_date + basis stamps,
 *      account_id is the AccountID GUID from Cells[0].Attributes.
 *   2. Section classification: rows under "Bank" / "Current Assets" /
 *      "Fixed Assets" → 'asset'. Rows under "Current Liabilities" /
 *      "Non-Current Liabilities" → 'liability'. Rows under "Equity" → 'equity'.
 *   3. Forward-carry across flat sibling sub-sections (the JDS-pattern that
 *      broke P&L pre-PR-#31). Sub-sections like "Cash and Cash Equivalents"
 *      sibling to "Bank" inherit 'asset' classification.
 *   4. System accounts preserved: "Retained Earnings" and "Current Year
 *      Earnings" appear under Equity → emitted with 'equity' type, NOT
 *      skipped as summary rows.
 *   5. SummaryRow exclusion: "Total Assets" / "Total Liabilities" /
 *      "Net Assets" / "Total Equity" rows are filtered.
 *   6. FXGROUPID handling: derive uuid-v5 same as P&L parser
 *      (deterministic across calls).
 *   7. Caller-supplied balance_date is stamped verbatim (not inferred from
 *      report header).
 *   8. Negative balance parsing: parens "(1,234.56)" → -1234.56.
 */
import { describe, it, expect } from 'vitest'

const TENANT_A = '11111111-1111-1111-1111-111111111111'

describe('parseBSSinglePeriod', () => {
  it('Test 1 — happy path: BS fixture emits rows with balance_date + basis + AccountID', async () => {
    const { parseBSSinglePeriod } = await import('@/lib/xero/bs-single-period-parser')
    const fixture = {
      Reports: [
        {
          Rows: [
            {
              RowType: 'Header',
              Cells: [{ Value: '' }, { Value: '30 Apr 2026' }],
            },
            {
              RowType: 'Section',
              Title: 'Assets',
              Rows: [
                {
                  RowType: 'Section',
                  Title: 'Bank',
                  Rows: [
                    {
                      RowType: 'Row',
                      Cells: [
                        {
                          Value: 'NAB Cheque',
                          Attributes: [
                            { Id: 'account', Value: 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa' },
                          ],
                        },
                        { Value: '12345.67' },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              RowType: 'Section',
              Title: 'Liabilities',
              Rows: [
                {
                  RowType: 'Section',
                  Title: 'Current Liabilities',
                  Rows: [
                    {
                      RowType: 'Row',
                      Cells: [
                        {
                          Value: 'Accounts Payable',
                          Attributes: [
                            { Id: 'account', Value: 'bbbbbbbb-2222-2222-2222-bbbbbbbbbbbb' },
                          ],
                        },
                        { Value: '5000.00' },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              RowType: 'Section',
              Title: 'Equity',
              Rows: [
                {
                  RowType: 'Row',
                  Cells: [
                    {
                      Value: 'Owner Equity',
                      Attributes: [
                        { Id: 'account', Value: 'cccccccc-3333-3333-3333-cccccccccccc' },
                      ],
                    },
                    { Value: '7345.67' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }
    const rows = parseBSSinglePeriod(fixture, '2026-04-30', 'accruals', TENANT_A)
    expect(rows.length).toBe(3)
    expect(rows[0]).toMatchObject({
      account_id: 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa',
      account_name: 'NAB Cheque',
      account_type: 'asset',
      section: 'Bank',
      balance_date: '2026-04-30',
      basis: 'accruals',
      balance: 12345.67,
    })
    const ap = rows.find((r) => r.account_name === 'Accounts Payable')
    expect(ap).toMatchObject({
      account_type: 'liability',
      section: 'Current Liabilities',
      balance: 5000.0,
    })
    const eq = rows.find((r) => r.account_name === 'Owner Equity')
    expect(eq).toMatchObject({
      account_type: 'equity',
      // Owner Equity is a direct child of "Equity" (top-level classifier),
      // so section is null (no sub-section context).
      section: null,
      balance: 7345.67,
    })
  })

  it('Test 2 — section classification: Bank / Current Assets / Fixed Assets → asset', async () => {
    const { parseBSSinglePeriod } = await import('@/lib/xero/bs-single-period-parser')
    const fixture = {
      Reports: [
        {
          Rows: [
            {
              RowType: 'Section',
              Title: 'Assets',
              Rows: [
                {
                  RowType: 'Section',
                  Title: 'Bank',
                  Rows: [
                    {
                      RowType: 'Row',
                      Cells: [
                        { Value: 'NAB', Attributes: [{ Id: 'account', Value: 'aaaa0001-0001-0001-0001-aaaaaaaaaaaa' }] },
                        { Value: '100' },
                      ],
                    },
                  ],
                },
                {
                  RowType: 'Section',
                  Title: 'Current Assets',
                  Rows: [
                    {
                      RowType: 'Row',
                      Cells: [
                        { Value: 'Inventory', Attributes: [{ Id: 'account', Value: 'aaaa0002-0002-0002-0002-aaaaaaaaaaaa' }] },
                        { Value: '200' },
                      ],
                    },
                  ],
                },
                {
                  RowType: 'Section',
                  Title: 'Fixed Assets',
                  Rows: [
                    {
                      RowType: 'Row',
                      Cells: [
                        { Value: 'Vehicles', Attributes: [{ Id: 'account', Value: 'aaaa0003-0003-0003-0003-aaaaaaaaaaaa' }] },
                        { Value: '300' },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              RowType: 'Section',
              Title: 'Liabilities',
              Rows: [
                {
                  RowType: 'Section',
                  Title: 'Current Liabilities',
                  Rows: [
                    {
                      RowType: 'Row',
                      Cells: [
                        { Value: 'GST Owing', Attributes: [{ Id: 'account', Value: 'bbbb0001-0001-0001-0001-bbbbbbbbbbbb' }] },
                        { Value: '400' },
                      ],
                    },
                  ],
                },
                {
                  RowType: 'Section',
                  Title: 'Non-Current Liabilities',
                  Rows: [
                    {
                      RowType: 'Row',
                      Cells: [
                        { Value: 'Bank Loan', Attributes: [{ Id: 'account', Value: 'bbbb0002-0002-0002-0002-bbbbbbbbbbbb' }] },
                        { Value: '500' },
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
    const rows = parseBSSinglePeriod(fixture, '2026-04-30', 'accruals', TENANT_A)
    const types = Object.fromEntries(rows.map((r) => [r.account_name, r.account_type]))
    expect(types['NAB']).toBe('asset')
    expect(types['Inventory']).toBe('asset')
    expect(types['Vehicles']).toBe('asset')
    expect(types['GST Owing']).toBe('liability')
    expect(types['Bank Loan']).toBe('liability')
    const sections = Object.fromEntries(rows.map((r) => [r.account_name, r.section]))
    expect(sections['NAB']).toBe('Bank')
    expect(sections['Inventory']).toBe('Current Assets')
    expect(sections['Vehicles']).toBe('Fixed Assets')
    expect(sections['GST Owing']).toBe('Current Liabilities')
    expect(sections['Bank Loan']).toBe('Non-Current Liabilities')
  })

  it('Test 3 — forward-carry across flat sibling sub-sections (JDS-pattern)', async () => {
    // Some tenants emit BS with custom layout=false where sub-sections like
    // "Cash and Cash Equivalents" appear as flat siblings to "Bank" rather
    // than nested under Assets. The forward-carry MUST inherit 'asset' from
    // the most recent classifying parent.
    const { parseBSSinglePeriod } = await import('@/lib/xero/bs-single-period-parser')
    const fixture = {
      Reports: [
        {
          Rows: [
            {
              RowType: 'Section',
              Title: 'Assets',
              Rows: [
                {
                  RowType: 'Section',
                  Title: 'Bank',
                  Rows: [
                    {
                      RowType: 'Row',
                      Cells: [
                        { Value: 'NAB Cheque', Attributes: [{ Id: 'account', Value: 'aaaa1111-1111-1111-1111-aaaaaaaaaaaa' }] },
                        { Value: '1000' },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              // Flat sibling — does NOT contain 'asset', 'liabilit', or
              // 'equity'. Without forward-carry, "Petty Cash" would be
              // dropped (orphan row).
              RowType: 'Section',
              Title: 'Cash and Cash Equivalents',
              Rows: [
                {
                  RowType: 'Row',
                  Cells: [
                    { Value: 'Petty Cash', Attributes: [{ Id: 'account', Value: 'aaaa2222-2222-2222-2222-aaaaaaaaaaaa' }] },
                    { Value: '50' },
                  ],
                },
              ],
            },
            {
              // New top-level classifier resets the chain to 'liability'.
              RowType: 'Section',
              Title: 'Liabilities',
              Rows: [
                {
                  RowType: 'Section',
                  Title: 'Current Liabilities',
                  Rows: [
                    {
                      RowType: 'Row',
                      Cells: [
                        { Value: 'GST Owing', Attributes: [{ Id: 'account', Value: 'bbbb1111-1111-1111-1111-bbbbbbbbbbbb' }] },
                        { Value: '200' },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              // Flat sibling under Liabilities — inherits 'liability'.
              RowType: 'Section',
              Title: 'Trade and Other Payables',
              Rows: [
                {
                  RowType: 'Row',
                  Cells: [
                    { Value: 'Sundry Creditors', Attributes: [{ Id: 'account', Value: 'bbbb2222-2222-2222-2222-bbbbbbbbbbbb' }] },
                    { Value: '300' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }
    const rows = parseBSSinglePeriod(fixture, '2026-04-30', 'accruals', TENANT_A)
    const types = Object.fromEntries(rows.map((r) => [r.account_name, r.account_type]))
    expect(types['NAB Cheque']).toBe('asset')
    expect(types['Petty Cash']).toBe('asset') // critical: forward-carry
    expect(types['GST Owing']).toBe('liability')
    expect(types['Sundry Creditors']).toBe('liability') // forward-carry switched to liability
    const sections = Object.fromEntries(rows.map((r) => [r.account_name, r.section]))
    expect(sections['Petty Cash']).toBe('Cash and Cash Equivalents')
    expect(sections['Sundry Creditors']).toBe('Trade and Other Payables')
  })

  it('Test 4 — system accounts (Retained Earnings, Current Year Earnings) preserved as equity', async () => {
    const { parseBSSinglePeriod } = await import('@/lib/xero/bs-single-period-parser')
    const fixture = {
      Reports: [
        {
          Rows: [
            {
              RowType: 'Section',
              Title: 'Equity',
              Rows: [
                {
                  RowType: 'Row',
                  Cells: [
                    {
                      Value: 'Retained Earnings',
                      Attributes: [{ Id: 'account', Value: 'cccc1111-1111-1111-1111-cccccccccccc' }],
                    },
                    { Value: '50000.00' },
                  ],
                },
                {
                  RowType: 'Row',
                  Cells: [
                    {
                      Value: 'Current Year Earnings',
                      Attributes: [{ Id: 'account', Value: 'cccc2222-2222-2222-2222-cccccccccccc' }],
                    },
                    { Value: '12345.67' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }
    const rows = parseBSSinglePeriod(fixture, '2026-04-30', 'accruals', TENANT_A)
    expect(rows.length).toBe(2)
    const re = rows.find((r) => r.account_name === 'Retained Earnings')
    const cye = rows.find((r) => r.account_name === 'Current Year Earnings')
    expect(re?.account_type).toBe('equity')
    expect(re?.balance).toBe(50000.0)
    expect(cye?.account_type).toBe('equity')
    expect(cye?.balance).toBe(12345.67)
  })

  it('Test 5 — SummaryRow exclusion: Total Assets / Total Liabilities / Net Assets / Total Equity filtered', async () => {
    const { parseBSSinglePeriod } = await import('@/lib/xero/bs-single-period-parser')
    const fixture = {
      Reports: [
        {
          Rows: [
            {
              RowType: 'Section',
              Title: 'Assets',
              Rows: [
                {
                  RowType: 'Section',
                  Title: 'Bank',
                  Rows: [
                    {
                      RowType: 'Row',
                      Cells: [
                        { Value: 'NAB', Attributes: [{ Id: 'account', Value: 'aaaa0001-0001-0001-0001-aaaaaaaaaaaa' }] },
                        { Value: '100' },
                      ],
                    },
                    { RowType: 'SummaryRow', Cells: [{ Value: 'Total Bank' }, { Value: '100' }] },
                  ],
                },
                { RowType: 'SummaryRow', Cells: [{ Value: 'Total Assets' }, { Value: '100' }] },
              ],
            },
            {
              RowType: 'Section',
              Title: 'Liabilities',
              Rows: [
                {
                  RowType: 'Section',
                  Title: 'Current Liabilities',
                  Rows: [
                    {
                      RowType: 'Row',
                      Cells: [
                        { Value: 'GST', Attributes: [{ Id: 'account', Value: 'bbbb0001-0001-0001-0001-bbbbbbbbbbbb' }] },
                        { Value: '40' },
                      ],
                    },
                    { RowType: 'SummaryRow', Cells: [{ Value: 'Total Current Liabilities' }, { Value: '40' }] },
                  ],
                },
                { RowType: 'SummaryRow', Cells: [{ Value: 'Total Liabilities' }, { Value: '40' }] },
              ],
            },
            { RowType: 'Section', Title: '', Rows: [
              { RowType: 'SummaryRow', Cells: [{ Value: 'Net Assets' }, { Value: '60' }] },
            ]},
            {
              RowType: 'Section',
              Title: 'Equity',
              Rows: [
                {
                  RowType: 'Row',
                  Cells: [
                    {
                      Value: 'Retained Earnings',
                      Attributes: [{ Id: 'account', Value: 'cccc0001-0001-0001-0001-cccccccccccc' }],
                    },
                    { Value: '60' },
                  ],
                },
                { RowType: 'SummaryRow', Cells: [{ Value: 'Total Equity' }, { Value: '60' }] },
              ],
            },
          ],
        },
      ],
    }
    const rows = parseBSSinglePeriod(fixture, '2026-04-30', 'accruals', TENANT_A)
    const names = rows.map((r) => r.account_name)
    expect(names).toEqual(['NAB', 'GST', 'Retained Earnings'])
    expect(names.find((n) => /^total\s/i.test(n))).toBeUndefined()
    expect(names.find((n) => /^net assets$/i.test(n))).toBeUndefined()
  })

  it('Test 6 — FXGROUPID row emits stable derived uuid-v5 account_id', async () => {
    const { parseBSSinglePeriod } = await import('@/lib/xero/bs-single-period-parser')
    const fixture = {
      Reports: [
        {
          Rows: [
            {
              RowType: 'Section',
              Title: 'Equity',
              Rows: [
                {
                  RowType: 'Row',
                  Cells: [
                    {
                      Value: 'Currency Revaluation Reserve',
                      Attributes: [{ Id: 'account', Value: 'FXGROUPID' }],
                    },
                    { Value: '1500.00' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }
    const rows1 = parseBSSinglePeriod(fixture, '2026-04-30', 'accruals', TENANT_A)
    const rows2 = parseBSSinglePeriod(fixture, '2026-04-30', 'accruals', TENANT_A)
    expect(rows1.length).toBe(1)
    expect(rows1[0]!.account_id).toMatch(/^[0-9a-f-]{36}$/i)
    expect(rows1[0]!.account_id).toBe(rows2[0]!.account_id) // deterministic
    expect(rows1[0]!.account_name).toBe('Currency Revaluation Reserve')
    expect(rows1[0]!.account_type).toBe('equity')
    expect(rows1[0]!.balance).toBe(1500.0)
  })

  it('Test 7 — caller-supplied balance_date is stamped verbatim (not inferred from header)', async () => {
    const { parseBSSinglePeriod } = await import('@/lib/xero/bs-single-period-parser')
    const fixture = {
      Reports: [
        {
          Rows: [
            // Header says "31 Jul 2025" but caller passes '2026-04-30' —
            // caller wins. (Header is informational; orchestrator stamps
            // the canonical as-of date.)
            {
              RowType: 'Header',
              Cells: [{ Value: '' }, { Value: '31 Jul 2025' }],
            },
            {
              RowType: 'Section',
              Title: 'Assets',
              Rows: [
                {
                  RowType: 'Section',
                  Title: 'Bank',
                  Rows: [
                    {
                      RowType: 'Row',
                      Cells: [
                        { Value: 'NAB', Attributes: [{ Id: 'account', Value: 'aaaa0001-0001-0001-0001-aaaaaaaaaaaa' }] },
                        { Value: '100' },
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
    const rows = parseBSSinglePeriod(fixture, '2026-04-30', 'cash', TENANT_A)
    expect(rows[0]!.balance_date).toBe('2026-04-30') // NOT '2025-07-31'
    expect(rows[0]!.basis).toBe('cash')
  })

  it('Test 8 — negative balance in parens "(1,234.56)" → -1234.56', async () => {
    const { parseBSSinglePeriod } = await import('@/lib/xero/bs-single-period-parser')
    const fixture = {
      Reports: [
        {
          Rows: [
            {
              RowType: 'Section',
              Title: 'Liabilities',
              Rows: [
                {
                  RowType: 'Section',
                  Title: 'Current Liabilities',
                  Rows: [
                    {
                      RowType: 'Row',
                      Cells: [
                        { Value: 'GST Refund Due', Attributes: [{ Id: 'account', Value: 'bbbb0001-0001-0001-0001-bbbbbbbbbbbb' }] },
                        { Value: '(1,234.56)' },
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
    const rows = parseBSSinglePeriod(fixture, '2026-04-30', 'accruals', TENANT_A)
    expect(rows[0]!.balance).toBe(-1234.56)
  })
})
