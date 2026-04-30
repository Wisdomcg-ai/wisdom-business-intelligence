/**
 * Phase 44.2 Plan 44.2-06B Task 3 — refreshXeroAccountsCatalog tests.
 *
 * Pulls /api.xro/2.0/Accounts via fetchXeroWithRateLimit, upserts each
 * Account into xero_accounts keyed on (business_id, tenant_id,
 * xero_account_id), and returns a Map<account_id, { account_code,
 * account_name, account_type }> for fast in-memory lookup during the
 * orchestrator's per-month parse pass.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}))

function makeAccountsResponse(accounts: any[]) {
  return new Response(
    JSON.stringify({ Accounts: accounts }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

type UpsertCall = { rows: any[]; opts: any }

function makeSupabaseStub() {
  const upsertCalls: UpsertCall[] = []
  const upsertedRows: any[] = []
  const stub: any = {
    from: (_table: string) => ({
      upsert: (rows: any[], opts: any) => {
        upsertCalls.push({ rows, opts })
        for (const r of rows) upsertedRows.push(r)
        return Promise.resolve({ data: rows, error: null })
      },
    }),
  }
  return { stub, upsertCalls, upsertedRows }
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.resetModules()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('refreshXeroAccountsCatalog', () => {
  it('happy path: 3 accounts upserted; returned Map has 3 entries', async () => {
    const accounts = [
      {
        AccountID: 'aaaa1111-1111-1111-1111-aaaaaaaaaaaa',
        Code: '200',
        Name: 'Sales',
        Type: 'REVENUE',
        Class: 'REVENUE',
        Status: 'ACTIVE',
        TaxType: 'OUTPUT',
        Description: 'Sales revenue',
      },
      {
        AccountID: 'bbbb2222-2222-2222-2222-bbbbbbbbbbbb',
        Code: '400',
        Name: 'Wages',
        Type: 'EXPENSE',
        Class: 'EXPENSE',
        Status: 'ACTIVE',
      },
      {
        AccountID: 'cccc3333-3333-3333-3333-cccccccccccc',
        Code: '090',
        Name: 'Business Bank Account',
        Type: 'BANK',
        Class: 'ASSET',
        Status: 'ACTIVE',
        BankAccountType: 'BANK',
      },
    ]
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(makeAccountsResponse(accounts))
    const { stub, upsertCalls, upsertedRows } = makeSupabaseStub()
    const { refreshXeroAccountsCatalog } = await import('@/lib/xero/accounts-catalog')

    const map = await refreshXeroAccountsCatalog(
      stub,
      {
        id: 'conn-1',
        tenant_id: 'tenant-A',
        business_id: 'biz-id-1',
      } as any,
      'tok',
    )

    expect(map.size).toBe(3)
    expect(map.get('aaaa1111-1111-1111-1111-aaaaaaaaaaaa')).toEqual({
      account_code: '200',
      account_name: 'Sales',
      account_type: 'REVENUE',
    })
    expect(map.get('bbbb2222-2222-2222-2222-bbbbbbbbbbbb')).toEqual({
      account_code: '400',
      account_name: 'Wages',
      account_type: 'EXPENSE',
    })
    expect(upsertCalls.length).toBe(1)
    expect(upsertCalls[0]!.opts.onConflict).toBe(
      'business_id,tenant_id,xero_account_id',
    )
    expect(upsertedRows.length).toBe(3)
    expect(upsertedRows[0]).toMatchObject({
      business_id: 'biz-id-1',
      tenant_id: 'tenant-A',
      xero_account_id: 'aaaa1111-1111-1111-1111-aaaaaaaaaaaa',
      account_code: '200',
      account_name: 'Sales',
    })
    // BANK row carries bank_account_type; non-BANK rows carry null.
    const bankRow = upsertedRows.find(
      (r) => r.xero_account_id === 'cccc3333-3333-3333-3333-cccccccccccc',
    )!
    expect(bankRow.bank_account_type).toBe('BANK')
    const wagesRow = upsertedRows.find(
      (r) => r.xero_account_id === 'bbbb2222-2222-2222-2222-bbbbbbbbbbbb',
    )!
    expect(wagesRow.bank_account_type).toBeNull()
  })

  it('idempotent: re-running with same data does not duplicate (relies on onConflict)', async () => {
    const accounts = [
      {
        AccountID: 'aaaa1111-1111-1111-1111-aaaaaaaaaaaa',
        Code: '200',
        Name: 'Sales',
        Type: 'REVENUE',
        Status: 'ACTIVE',
      },
    ]
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(makeAccountsResponse(accounts))
      .mockResolvedValueOnce(makeAccountsResponse(accounts))
    const { stub, upsertCalls } = makeSupabaseStub()
    const { refreshXeroAccountsCatalog } = await import('@/lib/xero/accounts-catalog')

    const m1 = await refreshXeroAccountsCatalog(
      stub,
      { id: 'conn-1', tenant_id: 'tenant-A', business_id: 'biz-id-1' } as any,
      'tok',
    )
    const m2 = await refreshXeroAccountsCatalog(
      stub,
      { id: 'conn-1', tenant_id: 'tenant-A', business_id: 'biz-id-1' } as any,
      'tok',
    )
    expect(m1.size).toBe(1)
    expect(m2.size).toBe(1)
    // Both calls use the same onConflict — idempotency guarantee comes from
    // the unique key, not the catalog code.
    expect(upsertCalls[0]!.opts.onConflict).toBe(
      upsertCalls[1]!.opts.onConflict,
    )
  })

  it('Account.Code missing → account_code stored as NULL', async () => {
    const accounts = [
      {
        AccountID: 'aaaa1111-1111-1111-1111-aaaaaaaaaaaa',
        Name: 'Suspense',
        Type: 'EXPENSE',
        Status: 'ACTIVE',
      },
    ]
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(makeAccountsResponse(accounts))
    const { stub, upsertedRows } = makeSupabaseStub()
    const { refreshXeroAccountsCatalog } = await import('@/lib/xero/accounts-catalog')

    const map = await refreshXeroAccountsCatalog(
      stub,
      { id: 'conn-1', tenant_id: 'tenant-A', business_id: 'biz-id-1' } as any,
      'tok',
    )
    expect(map.get('aaaa1111-1111-1111-1111-aaaaaaaaaaaa')!.account_code).toBeNull()
    expect(upsertedRows[0]!.account_code).toBeNull()
  })

  it('Type=BANK with BankAccountType: bank_account_type populated', async () => {
    const accounts = [
      {
        AccountID: 'cccc3333-3333-3333-3333-cccccccccccc',
        Code: '090',
        Name: 'CC',
        Type: 'BANK',
        Status: 'ACTIVE',
        BankAccountType: 'CREDITCARD',
      },
    ]
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(makeAccountsResponse(accounts))
    const { stub, upsertedRows } = makeSupabaseStub()
    const { refreshXeroAccountsCatalog } = await import('@/lib/xero/accounts-catalog')

    await refreshXeroAccountsCatalog(
      stub,
      { id: 'conn-1', tenant_id: 'tenant-A', business_id: 'biz-id-1' } as any,
      'tok',
    )
    expect(upsertedRows[0]!.bank_account_type).toBe('CREDITCARD')
  })

  it('429 daily → propagates RateLimitDailyExceededError', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({}), {
        status: 429,
        headers: { 'X-Rate-Limit-Problem': 'daily' },
      }),
    )
    const { stub } = makeSupabaseStub()
    const { refreshXeroAccountsCatalog } = await import('@/lib/xero/accounts-catalog')
    const { RateLimitDailyExceededError } = await import(
      '@/lib/xero/xero-api-client'
    )

    await expect(
      refreshXeroAccountsCatalog(
        stub,
        { id: 'conn-1', tenant_id: 'tenant-A', business_id: 'biz-id-1' } as any,
        'tok',
      ),
    ).rejects.toBeInstanceOf(RateLimitDailyExceededError)
  })
})

describe('classifyByXeroType', () => {
  // Layout-independent classifier — uses Xero's chart-of-accounts xero_type
  // as source of truth. Tested against the production xero_type distribution
  // observed across 18 tenants.
  it('maps SALES and REVENUE to revenue', async () => {
    const { classifyByXeroType } = await import('@/lib/xero/accounts-catalog')
    expect(classifyByXeroType('SALES')).toBe('revenue')
    expect(classifyByXeroType('REVENUE')).toBe('revenue')
  })

  it('maps OTHERINCOME to other_income', async () => {
    const { classifyByXeroType } = await import('@/lib/xero/accounts-catalog')
    expect(classifyByXeroType('OTHERINCOME')).toBe('other_income')
  })

  it('maps DIRECTCOSTS to cogs', async () => {
    const { classifyByXeroType } = await import('@/lib/xero/accounts-catalog')
    expect(classifyByXeroType('DIRECTCOSTS')).toBe('cogs')
  })

  it('maps EXPENSE/OVERHEADS/DEPRECIATN/SUPER/WAGES to opex', async () => {
    const { classifyByXeroType } = await import('@/lib/xero/accounts-catalog')
    expect(classifyByXeroType('EXPENSE')).toBe('opex')
    expect(classifyByXeroType('OVERHEADS')).toBe('opex')
    expect(classifyByXeroType('DEPRECIATN')).toBe('opex')
    expect(classifyByXeroType('SUPERANNUATIONEXPENSE')).toBe('opex')
    expect(classifyByXeroType('WAGESEXPENSE')).toBe('opex')
  })

  it('maps OTHEREXPENSE to other_expense', async () => {
    const { classifyByXeroType } = await import('@/lib/xero/accounts-catalog')
    expect(classifyByXeroType('OTHEREXPENSE')).toBe('other_expense')
  })

  it('returns null for non-P&L types (assets, liabilities, equity)', async () => {
    const { classifyByXeroType } = await import('@/lib/xero/accounts-catalog')
    for (const t of ['BANK', 'CURRENT', 'FIXED', 'INVENTORY', 'NONCURRENT', 'PREPAYMENT',
                     'CURRLIAB', 'LIABILITY', 'TERMLIAB', 'EQUITY']) {
      expect(classifyByXeroType(t)).toBeNull()
    }
  })

  it('returns null for null/undefined/unknown', async () => {
    const { classifyByXeroType } = await import('@/lib/xero/accounts-catalog')
    expect(classifyByXeroType(null)).toBeNull()
    expect(classifyByXeroType(undefined)).toBeNull()
    expect(classifyByXeroType('')).toBeNull()
    expect(classifyByXeroType('NONSENSE')).toBeNull()
  })

  it('is case-insensitive', async () => {
    const { classifyByXeroType } = await import('@/lib/xero/accounts-catalog')
    expect(classifyByXeroType('expense')).toBe('opex')
    expect(classifyByXeroType('Expense')).toBe('opex')
    expect(classifyByXeroType('directcosts')).toBe('cogs')
  })
})
