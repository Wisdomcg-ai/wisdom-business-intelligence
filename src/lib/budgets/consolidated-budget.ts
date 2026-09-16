/**
 * The approved budget of a business with more than one Xero organisation.
 *
 * resolve-budget.ts answers "which version is in force for this month" for
 * ONE organisation and refuses versions from more than one, because summing
 * them needs two rules it did not have. This module is those two rules.
 *
 * 1. ALIGNMENT. A budget line names an account in the organisation it was
 *    imported for. Dragon Roofing and Easy Hail share 74 account codes and 26
 *    of them name different accounts — 477 is Dragon's "Wages and Salaries -
 *    Admin" and Easy Hail's "Wages and Salaries" — so a line is matched to THAT
 *    organisation's accounts first (its code, then the coach's mapping, then
 *    its name), and only then merged across organisations on account type and
 *    name, which is how the consolidation engine merges the actuals. Merging on
 *    the code alone would have put Easy Hail's 12,000 of wages budget on
 *    Dragon's admin wages; merging on the exact name alone is what left $44,922
 *    of Dragon's August budget on budget-only rows (DRG-20).
 *
 *    A business-level version (IICT's, held in one organisation's Calxa but
 *    budgeting the group) is matched against every organisation's accounts. A
 *    code that names different accounts in two of them identifies neither, and
 *    the line falls through to its name.
 *
 * 2. CURRENCY. Every version is summed in the presentation currency. A version
 *    in another currency (its recorded currency, else its organisation's) is
 *    translated at each month's average rate — the P&L rate — and REFUSED, with
 *    the months named, when a month it budgets has no stored rate. A version
 *    whose currency cannot be known, in a business whose organisations are not
 *    all in the presentation currency, is refused too. Never 1:1 (#401).
 *
 * The rest follows resolve-budget's rules, unchanged: only locked versions
 * count, a month is governed by the newest version effective by then, two
 * versions of one scope effective from the same month are refused for the
 * year. The multi-organisation refusals are their own: an organisation without
 * a version in force, or with one that carries no lines, for ANY month the year
 * is read for — the pack reads four windows out of one budget (report month,
 * year to date, annual total, next month) and a consolidated budget silently
 * missing one organisation in any of them is a $0 no reader can see — and a
 * business-level version in force alongside per-organisation ones (a double
 * count). A month NO organisation budgets is not a gap: that is a year the
 * budget starts partway through, exactly as for a single organisation.
 *
 * Never throws: a failed read is a refusal the page can state.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import * as Sentry from '@sentry/nextjs'
import { buildFuzzyLookup } from '@/lib/utils/account-matching'
import { accountAlignmentKey, deduplicateLines } from '@/lib/consolidation/account-alignment'
import { loadFxRates } from '@/lib/consolidation/fx'
import type { ConsolidationTenant, XeroPLLineLike } from '@/lib/consolidation/types'
import { describeMissingRates, type MissingRate } from '@/lib/monthly-report/consolidated-fx'
import { budgetLineKey, fetchAllBudgetLines, type NoBudgetReason } from './resolve-budget'

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/

type Bucket = 'revenue' | 'cogs' | 'opex' | 'other_income' | 'other_expense'
const BUCKETS = new Set<string>(['revenue', 'cogs', 'opex', 'other_income', 'other_expense'])
const BUCKET_FOR_CATEGORY: Record<string, Bucket> = {
  'revenue': 'revenue',
  'cost of sales': 'cogs',
  'operating expenses': 'opex',
  'other income': 'other_income',
  'other expenses': 'other_expense',
}

/** One account's budget, merged across organisations, in the presentation currency. */
export interface ApprovedBudgetLine {
  account_type: string
  account_name: string
  /**
   * The code only when every account merged into this row carries the same one
   * and no other row does. A code two accounts share identifies neither, and a
   * reader matching on it would hand one of them the other's budget — the rule
   * aggregate-xero-pl-rows applies to the actuals.
   */
  account_code: string | null
  monthly_values: Record<string, number>
}

/** A budget line before alignment: one account of one version, months summed. */
export interface AlignableBudgetLine {
  account_code: string | null
  account_name: string
  category: string | null
  account_type: string | null
  monthly_values: Record<string, number>
}

export interface TenantAccounts {
  tenant_id: string
  display_name: string
  accounts: ReadonlyArray<{ account_code?: string | null; account_name: string; account_type: string }>
}

export interface MappingLike {
  xero_account_name: string
  xero_account_code?: string | null
  forecast_pl_line_name?: string | null
}

export interface BudgetOnlyAccount {
  tenant_id: string | null
  account_code: string | null
  account_name: string
}

export interface AlignedApprovedBudget {
  consolidated: ApprovedBudgetLine[]
  /** Per organisation, when the versions are per organisation; null for a business-level version. */
  byTenant: Map<string, ApprovedBudgetLine[]> | null
  matches: { code: number; mapping: number; name: number; budget_only: number }
  /** Lines no account of their organisation answers to, kept as their own rows. */
  budgetOnly: BudgetOnlyAccount[]
}

function lineBucket(line: Pick<AlignableBudgetLine, 'account_type' | 'category'>): Bucket {
  const type = (line.account_type ?? '').toLowerCase().trim()
  if (BUCKETS.has(type)) return type as Bucket
  // A null category is Operating Expenses, as everywhere else the budget is read.
  return BUCKET_FOR_CATEGORY[(line.category ?? '').toLowerCase().trim()] ?? 'opex'
}

const normCode = (code: string | null | undefined) => (code ?? '').trim().toLowerCase()

/**
 * Match every line to an account of its own organisation, then merge across
 * organisations on account type and name. Pure.
 */
export function alignApprovedBudget(input: {
  scopes: ReadonlyArray<{ tenantId: string | null; lines: readonly AlignableBudgetLine[] }>
  tenants: readonly TenantAccounts[]
  mappings: readonly MappingLike[]
  fyMonths: readonly string[]
}): AlignedApprovedBudget {
  type Account = { account_code: string | null; account_name: string; account_type: string; key: string }
  const indexes = new Map<string, {
    byCode: Map<string, Account[]>
    byName: Map<string, Account>
    fuzzy: (name: string) => Account | undefined
  }>()
  for (const t of input.tenants) {
    const accounts: Account[] = t.accounts.map((a) => ({
      account_code: a.account_code ?? null,
      account_name: a.account_name,
      account_type: (a.account_type ?? '').toLowerCase().trim(),
      key: accountAlignmentKey({ account_type: a.account_type ?? '', account_name: a.account_name }),
    }))
    const byCode = new Map<string, Account[]>()
    const byName = new Map<string, Account>()
    for (const a of accounts) {
      const code = normCode(a.account_code)
      if (code) byCode.set(code, [...(byCode.get(code) ?? []), a])
      const lower = a.account_name.toLowerCase().trim()
      if (!byName.has(lower)) byName.set(lower, a)
    }
    indexes.set(t.tenant_id, { byCode, byName, fuzzy: buildFuzzyLookup(accounts, (a) => a.account_name) })
  }
  const pinnedByBudgetName = buildFuzzyLookup(
    input.mappings.filter((m) => (m.forecast_pl_line_name ?? '').trim() !== ''),
    (m) => m.forecast_pl_line_name as string,
  )

  /** One account, or none when the candidates disagree about which account it is. */
  const onlyOne = (hits: Account[]): Account | null => {
    const keys = new Set(hits.map((h) => h.key))
    return keys.size === 1 ? hits[0] : null
  }

  const merged = new Map<string, { line: ApprovedBudgetLine; codes: Set<string | null> }>()
  const perTenant = new Map<string, Map<string, ApprovedBudgetLine>>()
  const matches = { code: 0, mapping: 0, name: 0, budget_only: 0 }
  const budgetOnly: BudgetOnlyAccount[] = []
  const anyTenantScope = input.scopes.some((s) => s.tenantId !== null)

  const addTo = (bucket: Map<string, ApprovedBudgetLine>, key: string, name: string, type: string, code: string | null, months: Record<string, number>) => {
    let row = bucket.get(key)
    if (!row) {
      row = { account_type: type, account_name: name, account_code: code, monthly_values: {} }
      bucket.set(key, row)
    }
    for (const [m, v] of Object.entries(months)) row.monthly_values[m] = (row.monthly_values[m] ?? 0) + v
    return row
  }

  for (const scope of input.scopes) {
    const candidates = scope.tenantId === null
      ? input.tenants.map((t) => indexes.get(t.tenant_id)!).filter(Boolean)
      : [indexes.get(scope.tenantId)].filter((x): x is NonNullable<typeof x> => !!x)

    for (const line of scope.lines) {
      let account: Account | null = null
      let method: 'code' | 'mapping' | 'name' | null = null

      const code = normCode(line.account_code)
      if (code) {
        account = onlyOne(candidates.flatMap((c) => c.byCode.get(code) ?? []))
        if (account) method = 'code'
      }
      if (!account) {
        const pinned = pinnedByBudgetName(line.account_name)
        if (pinned) {
          const lower = pinned.xero_account_name.toLowerCase().trim()
          account = onlyOne(candidates.flatMap((c) => (c.byName.get(lower) ? [c.byName.get(lower)!] : [])))
          if (account) method = 'mapping'
        }
      }
      if (!account) {
        account = onlyOne(candidates.flatMap((c) => {
          const hit = c.fuzzy(line.account_name)
          return hit ? [hit] : []
        }))
        if (account) method = 'name'
      }

      const type = account ? account.account_type : lineBucket(line)
      const name = account ? account.account_name : line.account_name
      const codeOut = account ? account.account_code : (line.account_code ?? null)
      const key = accountAlignmentKey({ account_type: type, account_name: name })
      if (method) matches[method]++
      else {
        matches.budget_only++
        budgetOnly.push({ tenant_id: scope.tenantId, account_code: line.account_code ?? null, account_name: line.account_name })
      }

      const hit = merged.get(key)
      if (hit) {
        hit.codes.add(codeOut)
        for (const [m, v] of Object.entries(line.monthly_values)) hit.line.monthly_values[m] = (hit.line.monthly_values[m] ?? 0) + v
      } else {
        merged.set(key, {
          line: { account_type: type, account_name: name, account_code: null, monthly_values: { ...line.monthly_values } },
          codes: new Set([codeOut]),
        })
      }
      if (scope.tenantId !== null) {
        const bucket = perTenant.get(scope.tenantId) ?? new Map<string, ApprovedBudgetLine>()
        perTenant.set(scope.tenantId, bucket)
        addTo(bucket, key, name, type, codeOut, line.monthly_values)
      }
    }
  }

  const rowsPerCode = new Map<string, number>()
  for (const { codes } of merged.values()) {
    for (const c of codes) if (c) rowsPerCode.set(normCode(c), (rowsPerCode.get(normCode(c)) ?? 0) + 1)
  }
  const consolidated = [...merged.values()].map(({ line, codes }) => {
    const [only] = codes
    const keep = codes.size === 1 && !!only && rowsPerCode.get(normCode(only)) === 1
    return { ...line, account_code: keep ? only : null }
  })

  return {
    consolidated,
    byTenant: anyTenantScope
      ? new Map([...perTenant.entries()].map(([t, rows]) => [t, [...rows.values()]]))
      : null,
    matches,
    budgetOnly,
  }
}

// ─── The store ───────────────────────────────────────────────────────────────

export type ApprovedBudgetOutcome =
  | {
      status: 'resolved'
      /** 'business' — one version for the group; 'per_tenant' — one per organisation. */
      scope: 'business' | 'per_tenant'
      /** The version governing the report month for the first scope (provenance). */
      versionId: string
      /** Every version any month of the year was read from. */
      versionIds: string[]
      label: string | null
      consolidated: ApprovedBudgetLine[]
      byTenant: Map<string, ApprovedBudgetLine[]> | null
      alignment: AlignedApprovedBudget['matches']
      budgetOnly: BudgetOnlyAccount[]
      /** Versions translated into the presentation currency. */
      translated: Array<{ scope: string | null; currency_pair: string }>
      /** Versions for organisations outside the consolidation, not read. */
      excludedTenantVersions: string[]
    }
  | {
      status: 'refused'
      reason: NoBudgetReason
      /** The sentence's detail — which organisation, which months — or null. */
      detail: string | null
    }

interface VersionRow {
  id: string
  label: string | null
  effective_from: string
  version_number: number | null
  tenant_id: string | null
  currency: string | null
}

export interface ResolveApprovedBudgetForTenantsInput {
  /** businesses-space. */
  businessId: string
  fiscalYear: number | string
  /** 'YYYY-MM'. */
  reportMonth: string
  /** Every fiscal month, in order — each month gets the version in force for it. */
  fyMonths: readonly string[]
  /** The consolidation's organisations (active, included), as the engine loaded them. */
  tenants: readonly ConsolidationTenant[]
  /** Each organisation's accounts — the engine's deduplicated P&L lines, codes and names untranslated. */
  accountsByTenant: ReadonlyMap<string, readonly XeroPLLineLike[]>
  presentationCurrency: string
  /** Monthly average rates for a pair; defaults to fx_rates. */
  loadRates?: (pair: string, months: string[]) => Promise<Map<string, number>>
}

const refuse = (reason: NoBudgetReason, detail: string | null = null): ApprovedBudgetOutcome => ({ status: 'refused', reason, detail })

function monthLabel(month: string): string {
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const [y, m] = month.split('-')
  return `${names[Number(m) - 1] ?? m} ${y}`
}

function listNames(names: string[]): string {
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/**
 * The approved budget for a consolidation, given the organisations and accounts
 * the caller already holds. The consolidation engine calls this with what it
 * read; resolveConsolidatedApprovedBudget reads them first.
 */
export async function resolveApprovedBudgetForTenants(
  supabase: SupabaseClient,
  input: ResolveApprovedBudgetForTenantsInput,
): Promise<ApprovedBudgetOutcome> {
  const { businessId, fiscalYear, reportMonth, tenants, presentationCurrency } = input
  if (!MONTH_KEY.test(reportMonth || '')) return refuse('invalid_report_month')
  const fyMonths = input.fyMonths.filter((m) => MONTH_KEY.test(m))
  if (!fyMonths.includes(reportMonth)) return refuse('invalid_report_month')

  try {
    const { data: versionRows, error } = await supabase
      .from('budget_versions')
      .select('id, label, effective_from, version_number, tenant_id, currency')
      .eq('business_id', businessId)
      .eq('fiscal_year', fiscalYear)
      .not('locked_at', 'is', null)
      .order('effective_from', { ascending: false })
    if (error) return refuse('budget_read_failed')

    const included = new Set(tenants.map((t) => t.tenant_id))
    const all = ((versionRows ?? []) as VersionRow[]).filter((v) => typeof v.effective_from === 'string')
    // An organisation outside the consolidation has no actuals in it either;
    // its budget stays out for the same reason, and is named in the outcome.
    const excludedTenantVersions = all.filter((v) => v.tenant_id !== null && !included.has(v.tenant_id)).map((v) => v.id)
    const relevant = all.filter((v) => v.tenant_id === null || included.has(v.tenant_id))
    if (relevant.length === 0) return refuse('no_version_in_force')

    // ── Which version governs each month, per scope ───────────────────────────
    const scopes = new Map<string, VersionRow[]>() // '' = business-level
    for (const v of relevant) scopes.set(v.tenant_id ?? '', [...(scopes.get(v.tenant_id ?? '') ?? []), v])
    const governing = new Map<string, Map<string, VersionRow>>()
    for (const [scope, versions] of scopes) {
      const byMonth = new Map<string, VersionRow>()
      for (const month of fyMonths) {
        const eligible = versions
          .filter((v) => v.effective_from <= month)
          .sort((a, b) => b.effective_from.localeCompare(a.effective_from))
        if (eligible.length === 0) continue
        const tied = eligible.filter((v) => v.effective_from === eligible[0].effective_from)
        if (tied.length > 1) {
          Sentry.captureMessage('[Consolidated budget] More than one budget version in force — refusing to choose', {
            level: 'warning' as any,
            tags: { invariant: 'budget-multiple-versions-in-force' },
            extra: { business_id: businessId, fiscalYear, month, scope, ids: tied.map((v) => v.id) },
          } as any)
          return refuse('multiple_versions_in_force')
        }
        byMonth.set(month, eligible[0])
      }
      governing.set(scope, byMonth)
    }

    const business = governing.get('')
    const tenantScopes = [...governing.keys()].filter((k) => k !== '')
    if (business && business.size > 0 && tenantScopes.some((t) => [...governing.get(t)!.keys()].some((m) => business.has(m)))) {
      return refuse('mixed_budget_scopes')
    }

    const governsReportMonth = (scope: string) => governing.get(scope)?.has(reportMonth) ?? false
    const scopeKind: 'business' | 'per_tenant' | null = governsReportMonth('')
      ? 'business'
      : tenantScopes.some(governsReportMonth) ? 'per_tenant' : null
    if (!scopeKind) return refuse('version_not_yet_effective')

    const ordered = [...tenants].sort((a, b) => a.display_order - b.display_order)
    if (scopeKind === 'per_tenant') {
      const missing = ordered.filter((t) => !governsReportMonth(t.tenant_id))
      if (missing.length > 0) {
        return refuse(
          'tenant_without_budget',
          `${listNames(missing.map((t) => t.display_name))} ${missing.length === 1 ? 'has' : 'have'} no approved FY${fiscalYear} budget in force for ${monthLabel(reportMonth)}`,
        )
      }
      // And every OTHER month of the year, because the pack reads four windows
      // out of one budget — the report month, the year to date, the annual
      // total and next month. Two organisations imported a month apart get
      // different effective months (defaultEffectiveFrom moves past the
      // finalised months), and July would then print a group budget short by
      // one organisation in three columns out of four.
      //
      // A month NO organisation budgets is not a gap: that is a year the budget
      // starts partway through, which monthsCovered states, exactly as it does
      // for a single organisation.
      const partial = fyMonths.filter((m) => {
        const govern = ordered.filter((t) => governing.get(t.tenant_id)?.has(m)).length
        return govern > 0 && govern < ordered.length
      })
      if (partial.length > 0) {
        const who = ordered.filter((t) => partial.some((m) => !governing.get(t.tenant_id)?.has(m)))
        return refuse(
          'tenant_without_budget',
          `${listNames(who.map((t) => t.display_name))} ${who.length === 1 ? 'has' : 'have'} no approved FY${fiscalYear} budget for `
          + `${listNames(partial.slice(0, 3).map(monthLabel))}${partial.length > 3 ? ` and ${partial.length - 3} other month${partial.length - 3 === 1 ? '' : 's'}` : ''}, `
          + 'which the year-to-date and annual budget columns add up',
        )
      }
    }
    const usedScopes = scopeKind === 'business' ? [''] : ordered.map((t) => t.tenant_id)

    // ── Currency, per version ─────────────────────────────────────────────────
    const chosen = new Map<string, { version: VersionRow; scope: string }>()
    for (const scope of usedScopes) {
      for (const v of governing.get(scope)?.values() ?? []) chosen.set(v.id, { version: v, scope })
    }
    const allPresentation = tenants.every((t) => t.currency_known !== false && t.functional_currency.toUpperCase() === presentationCurrency.toUpperCase())
    const currencyOf = new Map<string, string>()
    for (const { version, scope } of chosen.values()) {
      const recorded = (version.currency ?? '').trim().toUpperCase()
      const tenant = scope ? tenants.find((t) => t.tenant_id === scope) : null
      const currency = recorded
        || (tenant ? (tenant.currency_known === false ? '' : tenant.functional_currency.toUpperCase()) : (allPresentation ? presentationCurrency.toUpperCase() : ''))
      if (!currency) {
        const whose = tenant ? `${tenant.display_name}'s` : 'the business-level'
        return refuse('budget_currency_unknown', `${whose} approved budget does not record its currency, and this business's organisations are not all in ${presentationCurrency}`)
      }
      currencyOf.set(version.id, currency)
    }

    const { rows, failed } = await fetchAllBudgetLines(supabase, [...chosen.keys()])
    if (failed) return refuse('budget_read_failed')

    const { data: mappingRows, error: mappingError } = await supabase
      .from('account_mappings')
      .select('xero_account_name, xero_account_code, forecast_pl_line_name')
      .eq('business_id', businessId)
    if (mappingError) return refuse('budget_read_failed')

    // ── Lines per scope, translated ───────────────────────────────────────────
    const loadRates = input.loadRates
      ?? ((pair: string, months: string[]) => loadFxRates(supabase as any, pair, 'monthly_average', months))
    const kept = rows.filter((r) => {
      const scope = chosen.get(r.budget_version_id)?.scope
      return scope !== undefined && governing.get(scope)?.get(r.month)?.id === r.budget_version_id
    })
    const ratesByVersion = new Map<string, Map<string, number>>()
    const missing: MissingRate[] = []
    const translated: Array<{ scope: string | null; currency_pair: string }> = []
    for (const [versionId, { scope }] of chosen) {
      const currency = currencyOf.get(versionId)!
      if (currency === presentationCurrency.toUpperCase()) continue
      const pair = `${currency}/${presentationCurrency.toUpperCase()}`
      const months = [...new Set(kept.filter((r) => r.budget_version_id === versionId && Number(r.amount) !== 0).map((r) => r.month))].sort()
      const rates = await loadRates(pair, months)
      for (const m of months) if (rates.get(m) === undefined) missing.push({ currency_pair: pair, period: m })
      ratesByVersion.set(versionId, rates)
      if (!translated.some((t) => t.currency_pair === pair && t.scope === (scope || null))) translated.push({ scope: scope || null, currency_pair: pair })
    }
    if (missing.length > 0) {
      const seen = new Set<string>()
      const unique = missing.filter((r) => (seen.has(`${r.currency_pair}${r.period}`) ? false : (seen.add(`${r.currency_pair}${r.period}`), true)))
      return refuse('budget_fx_rate_missing', describeMissingRates(unique))
    }

    const linesByScope = new Map<string, Map<string, AlignableBudgetLine>>()
    for (const row of kept) {
      const scope = chosen.get(row.budget_version_id)!.scope
      const byKey = linesByScope.get(scope) ?? new Map<string, AlignableBudgetLine>()
      linesByScope.set(scope, byKey)
      const key = budgetLineKey(row)
      let line = byKey.get(key)
      if (!line) {
        line = { account_code: row.account_code ?? null, account_name: row.account_name, category: row.category, account_type: row.account_type ?? null, monthly_values: {} }
        byKey.set(key, line)
      }
      const rate = ratesByVersion.get(row.budget_version_id)?.get(row.month) ?? 1
      line.monthly_values[row.month] = (line.monthly_values[row.month] ?? 0) + (Number(row.amount) || 0) * rate
    }
    if (linesByScope.size === 0) return refuse('version_has_no_lines')
    // A version in force that yields no line at all is a budget for nobody. On
    // the per-organisation branch that organisation's whole budget would be
    // zero inside a group total that looks complete, so it is treated as the
    // absence it is and named — the same refusal as having no version.
    if (scopeKind === 'per_tenant') {
      const silent = ordered.filter((t) => (linesByScope.get(t.tenant_id)?.size ?? 0) === 0)
      if (silent.length > 0) {
        return refuse(
          'tenant_without_budget',
          `${listNames(silent.map((t) => t.display_name))} ${silent.length === 1 ? 'has an approved FY' : 'have approved FY'}${fiscalYear} budget with no lines in it`,
        )
      }
    }

    const aligned = alignApprovedBudget({
      scopes: usedScopes.map((scope) => ({ tenantId: scope || null, lines: [...(linesByScope.get(scope)?.values() ?? [])] })),
      tenants: ordered.map((t) => ({ tenant_id: t.tenant_id, display_name: t.display_name, accounts: input.accountsByTenant.get(t.tenant_id) ?? [] })),
      mappings: (mappingRows ?? []) as MappingLike[],
      fyMonths,
    })
    if (aligned.consolidated.length === 0) return refuse('version_has_no_lines')

    // Provenance names the versions in force for the REPORT month — Dragon's
    // two are both "FY27 Budget", which is one label, not two.
    const anchor = governing.get(usedScopes[0])!.get(reportMonth)!
    const labels = [...new Set(usedScopes.map((s) => (governing.get(s)?.get(reportMonth)?.label ?? '').trim()).filter(Boolean))]

    return {
      status: 'resolved',
      scope: scopeKind,
      versionId: anchor.id,
      versionIds: [...chosen.keys()],
      label: labels.length > 0 ? labels.join(' / ') : null,
      consolidated: aligned.consolidated,
      byTenant: aligned.byTenant,
      alignment: aligned.matches,
      budgetOnly: aligned.budgetOnly,
      translated,
      excludedTenantVersions,
    }
  } catch (err) {
    Sentry.captureException(err, { tags: { invariant: 'consolidated-budget-read-failed' }, extra: { business_id: businessId, fiscalYear } } as any)
    return refuse('budget_read_failed')
  }
}

/**
 * The same, for a caller that holds nothing yet — the Full Year page, and the
 * pages that read the budget through resolveBudget. Reads the consolidation's
 * organisations and their P&L accounts the way the engine does, so both arrive
 * at the same account list.
 */
export async function resolveConsolidatedApprovedBudget(
  supabase: SupabaseClient,
  input: { businessId: string; fiscalYear: number | string; reportMonth: string; fyMonths: readonly string[]; presentationCurrency?: string },
): Promise<ApprovedBudgetOutcome> {
  try {
    // Imported here rather than at the top: the engine imports this module's
    // types, and a value import both ways is a cycle at load time.
    const { loadBusinessContext, loadTenantSnapshots } = await import('@/lib/consolidation/engine')
    const { business, tenants } = await loadBusinessContext(supabase, input.businessId)
    const snapshots = await loadTenantSnapshots(supabase, input.businessId, tenants)
    return await resolveApprovedBudgetForTenants(supabase, {
      businessId: input.businessId,
      fiscalYear: input.fiscalYear,
      reportMonth: input.reportMonth,
      fyMonths: input.fyMonths,
      tenants,
      accountsByTenant: new Map(snapshots.map((s) => [s.tenant.tenant_id, deduplicateLines(s.rawLines)])),
      presentationCurrency: input.presentationCurrency ?? business.presentation_currency,
    })
  } catch (err) {
    Sentry.captureException(err, { tags: { invariant: 'consolidated-budget-read-failed' }, extra: { business_id: input.businessId } } as any)
    return refuse('budget_read_failed')
  }
}
