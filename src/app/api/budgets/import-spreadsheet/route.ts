/**
 * POST /api/budgets/import-spreadsheet
 *
 * The budget a client is actually held to, from the coach's spreadsheet.
 * /api/budgets/import reads a budget out of Xero for one organisation; Dragon's
 * FY27 Budget is edited per organisation in Calxa and IICT's whole consolidated
 * budget sits in one Calxa version on accounts no Xero organisation has
 * (IICT-08, DRG-04 option a; decision 1).
 *
 *   mode=preview  reads the sheet and answers with every row's fate — matched,
 *                 budget-only, unmatched — the year's totals per section, and
 *                 the chart of accounts, so the coach can map a row (IICT's 210
 *                 → 200) or keep it budget-only. Writes nothing.
 *   mode=save     the same read, with the same choices, written as one LOCKED
 *                 version per organisation the sheet names (or one business-
 *                 level version), each with its lines.
 *
 * The rules the budget store already has, kept: never overwrite (a revision is
 * a new version_number, effective_from applies it prospectively), never a
 * second version of one scope at the same effective month, and nothing is
 * visible to the report until the lines have landed and the version is locked.
 * There is no idempotency key on an upload, so a re-post of the same sheet for
 * the same month is refused rather than stacked (DUPLICATE_IMPORT).
 *
 * The body is multipart, which withSchema's clone().json() cannot read — so the
 * wrapper's schema accepts anything and the handler validates the form's own
 * fields (the payroll-grid rule, #528).
 */
import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import * as Sentry from '@sentry/nextjs'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { verifyBusinessAccess } from '@/lib/utils/verify-business-access'
import { requireSectionPermission } from '@/lib/permissions/requireSectionPermission'
import { enforceSectionPermission } from '@/lib/permissions/sectionPermissionConfig'
import { resolveXeroConnections } from '@/lib/business/resolveXeroBusinessId'
import { loadAccountsCatalog, loadAccountActuals } from '@/lib/services/xero-budget-seed-data'
import { defaultEffectiveFrom } from '@/lib/budgets/import-xero-budget'
import {
  budgetLinesFromPreview, catalogEntryType, matchBudgetSheet, parseBudgetSheet,
  type CatalogEntry, type Cell, type ImportScope, type RowChoice, type ScopePreview,
} from '@/lib/budgets/budget-spreadsheet'
import { readBudgetSheetCells } from '@/lib/budgets/budget-sheet-file'
import { generateFiscalMonthKeys, DEFAULT_YEAR_START_MONTH } from '@/lib/utils/fiscal-year-utils'
import { withSchema } from '@/lib/api/with-schema'

export const dynamic = 'force-dynamic'

const ROUTE = 'budgets/import-spreadsheet'
/** A year of a chart of accounts is tens of kilobytes; ten megabytes is a wrong file. */
const MAX_BYTES = 10 * 1024 * 1024
/** PostgREST takes a big insert happily, but a bounded one fails in a way a coach can act on. */
const LINE_CHUNK = 500

const ChoiceSchema = z.union([
  z.object({ action: z.literal('map'), target_code: z.string().min(1) }),
  z.object({ action: z.literal('budget_only'), account_type: z.enum(['revenue', 'cogs', 'opex', 'other_income', 'other_expense']) }),
  z.object({ action: z.literal('skip') }),
])

const FieldsSchema = z.object({
  business_id: z.string().uuid(),
  fiscal_year: z.coerce.number().int().min(2000).max(2100),
  mode: z.enum(['preview', 'save']).default('preview'),
  /** 'business' for one version covering the group, a tenant id for one organisation, or absent when the sheet names organisations. */
  scope: z.string().optional(),
  /** Only for a business-level version: the currency its figures are in. */
  currency: z.string().regex(/^[A-Za-z]{3}$/).optional(),
  label: z.string().max(120).optional(),
  effective_from: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  choices: z.string().optional(),
})

async function postHandler(request: Request) {
  try {
    const authClient = await createRouteHandlerClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let form: FormData
    try {
      form = await request.formData()
    } catch {
      return NextResponse.json({ error: 'Send the spreadsheet as a form upload' }, { status: 400 })
    }

    const fields = FieldsSchema.safeParse({
      business_id: form.get('business_id'),
      fiscal_year: form.get('fiscal_year'),
      mode: form.get('mode') ?? undefined,
      scope: form.get('scope') ?? undefined,
      currency: form.get('currency') ?? undefined,
      label: form.get('label') ?? undefined,
      effective_from: form.get('effective_from') ?? undefined,
      choices: form.get('choices') ?? undefined,
    })
    if (!fields.success) {
      return NextResponse.json({ error: 'business_id, fiscal_year and mode are required', issues: fields.error.flatten() }, { status: 400 })
    }
    const { business_id: businessId, fiscal_year: fiscalYear, mode } = fields.data

    const verdict = await requireSectionPermission(authClient, user.id, businessId, 'finances')
    const blocked = enforceSectionPermission(verdict, 'finances', `api/${ROUTE}`, user.id, businessId)
    if (blocked) return blocked
    // The data client is service-role and bypasses RLS: this is the tenant gate.
    if (!(await verifyBusinessAccess(user.id, businessId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Duck-typed, not `instanceof File`: the file that comes back out of a
    // multipart body is the runtime's own File class, which is not always the
    // File this module closes over (Node's undici under test).
    const uploaded = form.get('file') as unknown as { name?: string; size?: number; arrayBuffer?: () => Promise<ArrayBuffer> } | null
    if (!uploaded || typeof uploaded.arrayBuffer !== 'function' || !uploaded.size) {
      return NextResponse.json({ error: 'Attach the budget spreadsheet (CSV or XLSX)' }, { status: 400 })
    }
    const file = uploaded as unknown as File
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is 10 MB`, code: 'file_too_large' }, { status: 400 })
    }

    let choices: Record<string, RowChoice> = {}
    if (fields.data.choices) {
      try {
        const parsed = z.record(z.string(), ChoiceSchema).safeParse(JSON.parse(fields.data.choices))
        if (!parsed.success) return NextResponse.json({ error: 'The row choices could not be read', issues: parsed.error.flatten() }, { status: 400 })
        choices = parsed.data as Record<string, RowChoice>
      } catch {
        return NextResponse.json({ error: 'The row choices could not be read' }, { status: 400 })
      }
    }

    const admin = createServiceRoleClient()

    // ── The business's organisations ─────────────────────────────────────────
    const { connections } = await resolveXeroConnections(admin, businessId)
    const orgs = (connections ?? []).filter((c: any) => c.is_active !== false)
    const { data: profile } = await admin
      .from('business_profiles')
      .select('fiscal_year_start')
      .eq('business_id', businessId)
      .maybeSingle()
    const fyMonths = generateFiscalMonthKeys(fiscalYear, profile?.fiscal_year_start ?? DEFAULT_YEAR_START_MONTH)

    // ── The sheet ────────────────────────────────────────────────────────────
    let cells: Cell[][]
    try {
      cells = await readBudgetSheetCells(file)
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'That file could not be read' }, { status: 400 })
    }
    const sheet = parseBudgetSheet(cells, fyMonths)

    // ── Which version(s) this sheet becomes ──────────────────────────────────
    const scopes: ImportScope[] = sheet.hasOrgColumn && !fields.data.scope
      ? orgs.map((c: any) => ({ tenantId: c.tenant_id, displayName: c.display_name || c.tenant_name || c.tenant_id, currency: (c.functional_currency || 'AUD').toUpperCase() }))
      : fields.data.scope && fields.data.scope !== 'business'
        ? orgs.filter((c: any) => c.tenant_id === fields.data.scope).map((c: any) => ({ tenantId: c.tenant_id, displayName: c.display_name || c.tenant_name || c.tenant_id, currency: (c.functional_currency || 'AUD').toUpperCase() }))
        : [{
            tenantId: null,
            displayName: 'Whole business',
            // Recorded on the version, so a cross-organisation sum can never add
            // one currency to another unnoticed. Defaults to the organisations'
            // own currency when they agree, and must be stated when they do not.
            currency: (fields.data.currency
              ?? (orgs.length > 0 && orgs.every((c: any) => (c.functional_currency || 'AUD') === (orgs[0].functional_currency || 'AUD')) ? (orgs[0].functional_currency || 'AUD') : '')).toUpperCase(),
          }]

    if (scopes.length === 0) {
      return NextResponse.json({ error: 'That Xero organisation is not connected to this business', code: 'unknown_organisation' }, { status: 400 })
    }
    if (scopes.length === 1 && scopes[0].tenantId === null && !scopes[0].currency) {
      return NextResponse.json(
        { error: 'This business’s Xero organisations are in different currencies, so a whole-business budget has to say which currency it is in', code: 'currency_required' },
        { status: 400 },
      )
    }

    // ── Every organisation's chart of accounts ───────────────────────────────
    const catalog: CatalogEntry[] = []
    for (const org of orgs) {
      const [accounts, actuals] = await Promise.all([
        loadAccountsCatalog(admin, org.tenant_id),
        loadAccountActuals(admin, org.tenant_id),
      ])
      const typeByCode = new Map(actuals.map((a) => [a.accountCode, a.accountType]))
      for (const a of accounts) {
        catalog.push({
          tenant_id: org.tenant_id,
          code: a.accountCode,
          name: a.accountName,
          type: catalogEntryType(a.xeroType, a.accountCode ? typeByCode.get(a.accountCode) ?? null : null),
          archived: (a.status ?? '').toUpperCase() === 'ARCHIVED',
        })
      }
    }

    const preview = matchBudgetSheet({
      sheet,
      scopes,
      catalog,
      choices,
      orgNames: Object.fromEntries(orgs.map((c: any) => [c.tenant_id, [c.display_name, c.tenant_name].filter(Boolean)])),
    })

    // ── What is already there ────────────────────────────────────────────────
    const { data: existingRows, error: existingError } = await admin
      .from('budget_versions')
      .select('id, tenant_id, label, effective_from, version_number, locked_at, notes')
      .eq('business_id', businessId)
      .eq('fiscal_year', fiscalYear)
    if (existingError) {
      return NextResponse.json({ error: `The budgets already imported could not be read: ${existingError.message}` }, { status: 500 })
    }
    const existing = (existingRows ?? []) as Array<{ id: string; tenant_id: string | null; label: string | null; effective_from: string | null; version_number: number | null; locked_at: string | null; notes: string | null }>

    const { data: finalised } = await admin
      .from('monthly_report_snapshots')
      .select('report_month')
      .eq('business_id', businessId)
      .eq('fiscal_year', fiscalYear)
      .neq('status', 'draft')
    const effectiveFrom = fields.data.effective_from
      ?? defaultEffectiveFrom(fyMonths, ((finalised ?? []) as Array<{ report_month: string }>).map((r) => r.report_month))

    const fingerprintOf = (scope: ScopePreview) =>
      createHash('sha256')
        .update(JSON.stringify([scope.scope ?? '', fiscalYear, budgetLinesFromPreview(scope, fyMonths)]))
        .digest('hex')
        .slice(0, 16)

    if (mode === 'preview') {
      return NextResponse.json({
        preview,
        accounts: catalog,
        effective_from: effectiveFrom,
        months: fyMonths,
        existing_versions: existing.map((v) => ({ id: v.id, tenant_id: v.tenant_id, label: v.label, effective_from: v.effective_from, version_number: v.version_number, locked: v.locked_at !== null })),
      })
    }

    // ── Save ─────────────────────────────────────────────────────────────────
    if (!preview.can_save) {
      return NextResponse.json({ error: preview.blocking.join(' '), code: 'PREVIEW_BLOCKED', blocking: preview.blocking }, { status: 400 })
    }

    const locked = existing.filter((v) => v.locked_at !== null)
    const savingBusinessLevel = scopes.some((s) => s.tenantId === null)
    // A business-level version and per-organisation versions in force together
    // would be counted twice; the resolver refuses that pair outright, so the
    // import refuses to create it (mixed_budget_scopes).
    if (savingBusinessLevel ? locked.some((v) => v.tenant_id !== null) : locked.some((v) => v.tenant_id === null)) {
      return NextResponse.json({
        error: savingBusinessLevel
          ? 'This business already has approved budgets for each Xero organisation this year. A whole-business budget on top of them would be counted twice.'
          : 'This business already has a whole-business approved budget this year. Per-organisation budgets on top of it would be counted twice.',
        code: 'MIXED_BUDGET_SCOPES',
      }, { status: 400 })
    }

    const saving = preview.scopes.filter((s) => scopes.some((x) => x.tenantId === s.scope))
    const clash = saving
      .map((s) => ({ scope: s, duplicate: locked.find((v) => (v.tenant_id ?? null) === s.scope && (v.effective_from === effectiveFrom || (v.notes ?? '').includes(fingerprintOf(s)))) }))
      .find((x) => x.duplicate)
    if (clash?.duplicate) {
      return NextResponse.json({
        error: `${clash.scope.display_name} already has an approved budget effective ${clash.duplicate.effective_from} (${clash.duplicate.label ?? 'imported'}). `
          + 'Import a revision from a later month, or say which month this one takes effect.',
        code: 'DUPLICATE_IMPORT',
        version_id: clash.duplicate.id,
      }, { status: 409 })
    }

    const versionRows = saving.map((s) => {
      const nextNumber = Math.max(0, ...existing.filter((v) => (v.tenant_id ?? null) === s.scope).map((v) => v.version_number ?? 0)) + 1
      const lines = budgetLinesFromPreview(s, fyMonths)
      const months = [...new Set(lines.map((l) => l.month))].sort()
      return {
        scope: s,
        lines,
        row: {
          business_id: businessId,
          tenant_id: s.scope,
          fiscal_year: fiscalYear,
          source: 'manual' as const,
          currency: s.currency || null,
          label: fields.data.label?.trim() || file.name.replace(/\.(csv|xlsx)$/i, '') || 'Imported budget',
          version_number: nextNumber,
          effective_from: effectiveFrom,
          locked_at: null,
          imported_by: user.id,
          months_covered: months.length,
          first_period: months[0] ?? null,
          last_period: months[months.length - 1] ?? null,
          notes: `Imported from ${file.name} · sheet ${fingerprintOf(s)}`,
        },
      }
    })

    const { data: inserted, error: versionError } = await admin
      .from('budget_versions')
      .insert(versionRows.map((v) => v.row))
      .select('id, tenant_id, version_number')
    if (versionError || !inserted || inserted.length !== versionRows.length) {
      Sentry.captureException(versionError ?? new Error('budget_versions insert returned no rows'), {
        tags: { route: ROUTE, invariant: 'budget_version_insert_failed' },
        extra: { business_id: businessId, fiscal_year: fiscalYear },
      } as any)
      return NextResponse.json({ error: `Could not create the budget version: ${versionError?.message ?? 'no rows'}` }, { status: 500 })
    }

    const idFor = new Map((inserted as Array<{ id: string; tenant_id: string | null }>).map((v) => [v.tenant_id ?? '', v.id]))
    const lineRows = versionRows.flatMap((v) =>
      v.lines.map((line) => ({
        budget_version_id: idFor.get(v.scope.scope ?? ''),
        business_id: businessId,
        tenant_id: v.scope.scope,
        account_code: line.account_code,
        account_name: line.account_name,
        category: line.category,
        account_type: line.account_type,
        month: line.month,
        amount: line.amount,
      })),
    )
    for (let from = 0; from < lineRows.length; from += LINE_CHUNK) {
      const { error: linesError } = await admin.from('budget_lines').insert(lineRows.slice(from, from + LINE_CHUNK))
      if (linesError) {
        // The versions stay unlocked, so the resolver never sees a half-written
        // import — and the operator is told rather than shown a success.
        Sentry.captureException(linesError, {
          tags: { route: ROUTE, invariant: 'budget_lines_insert_failed' },
          extra: { business_id: businessId, versionIds: [...idFor.values()] },
        } as any)
        return NextResponse.json({ error: `Could not write the budget lines: ${linesError.message}` }, { status: 500 })
      }
    }

    // One statement, so a two-organisation import is never half in force.
    const { error: lockError } = await admin
      .from('budget_versions')
      .update({ locked_at: new Date().toISOString() })
      .in('id', [...idFor.values()])
    if (lockError) {
      Sentry.captureException(lockError, {
        tags: { route: ROUTE, invariant: 'budget_version_lock_failed' },
        extra: { business_id: businessId, versionIds: [...idFor.values()] },
      } as any)
      return NextResponse.json({ error: `The budget was imported but could not be locked: ${lockError.message}` }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      effective_from: effectiveFrom,
      versions: versionRows.map((v) => ({
        id: idFor.get(v.scope.scope ?? ''),
        tenant_id: v.scope.scope,
        display_name: v.scope.display_name,
        label: v.row.label,
        version_number: v.row.version_number,
        effective_from: effectiveFrom,
        currency: v.row.currency,
        line_count: v.lines.length,
        months_covered: v.row.months_covered,
        budget_only: v.scope.rows.filter((r) => r.status === 'budget_only').map((r) => ({ account_code: r.account_code, account_name: r.account_name })),
        skipped: v.scope.rows.filter((r) => r.status === 'skipped').map((r) => ({ row: r.row, account_name: r.account_name })),
      })),
      // Importing is not a switch-over: the report reads the store only once a
      // coach sets budget_source, one client at a time, at a period boundary.
      note: 'Set the report’s budget source to the approved budget to use it.',
    })
  } catch (error) {
    Sentry.captureException(error, { tags: { route: ROUTE } } as any)
    return NextResponse.json({ error: 'Failed to import the budget' }, { status: 500 })
  }
}

export const POST = withSchema(ROUTE, z.any(), postHandler)
