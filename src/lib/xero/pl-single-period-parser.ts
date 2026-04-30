/**
 * Phase 44.2 Plan 44.2-06B Task 4 — single-period P&L parser.
 *
 * Replaces the structurally-broken by-month parser path. Empirical proof
 * (2026-04-29): single-period query for Jul 2025 returns Sales-Hardware
 * $259,550.88 — exactly matches the Xero web PDF — while the by-month
 * query returns $252,711.48 (off by $6,839.40, the JDS smoking-gun gap).
 *
 * Contract:
 *   - Caller knows the period_month (it's the URL it requested).
 *     Parser stamps that value verbatim — does NOT re-derive it from
 *     the report's column header.
 *   - Caller specifies basis ('accruals' or 'cash') — stamped on every row.
 *   - account_id is the Xero AccountID GUID from Cells[0].Attributes.
 *     For FXGROUPID rows, derive a stable uuid-v5. For rows missing
 *     Attributes, derive a stable uuid-v5 from tenant_id + account_name.
 *
 * Critical fixes vs the predecessor by-month parser:
 *   1. D-44.2-14 classification fix: currentParentTitle is updated
 *      ONLY when the section's own title classifies to a known top-level
 *      type. Sub-sections like "Software Development" don't clobber the
 *      inherited 'cogs' classification. PK Costs finally lands in cogs.
 *   2. FXGROUPID handling per Xero docs (multi-currency standard layout).
 *   3. Explicit caller-supplied period_month + basis (no implicit inference).
 *
 * Pure: same input → same output. No I/O, no clock.
 */
import { v5 as uuidv5 } from 'uuid'
import {
  parseAmount,
  classifyAccountType,
  titleClassifiesToKnownType,
  type AccountType,
} from './pl-by-month-parser'

// ─── Public types ───────────────────────────────────────────────────────────

export type Basis = 'accruals' | 'cash'

/**
 * Long-format row, post-06A schema:
 *   - account_id: required (Xero AccountID GUID OR derived uuid-v5)
 *   - account_code: NULL here; orchestrator fills from /Accounts catalog
 *   - basis: stamped explicitly per call
 *   - period_month: stamped from caller-supplied YYYY-MM-01
 */
export type ParsedPLRow = {
  account_id: string // uuid; never null
  account_code: string | null // always null at parse time; orchestrator fills
  account_name: string
  account_type: AccountType
  period_month: string // 'YYYY-MM-01'
  amount: number
  basis: Basis
}

// ─── Constants — namespace UUIDs for deterministic synthesis ────────────────

/**
 * Phase 44.2-06B namespace UUIDs for uuid-v5 derivation. Treated as
 * stable constants of the codebase — DO NOT regenerate, or every
 * synthetic account_id will rotate and break upserts.
 *
 * Generated once via uuidv4() and pinned here. They are arbitrary
 * but constant per RFC 4122.
 */
const FXGROUP_NAMESPACE = '6b2c6f2d-91e3-4f6c-9d1a-44f2c6f2e7a1'
const SYNTH_NAMESPACE = '7c3d7f3e-92f4-5f7d-ae2b-55f3c7f3f8b2'

// ─── Internal helpers ───────────────────────────────────────────────────────

function isUuidLike(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
}

/**
 * Derive a stable account_id for the parsed row.
 *   - Real Xero AccountID GUID  → return it verbatim.
 *   - 'FXGROUPID' literal       → uuid-v5 over `XERO-FXGROUP-${tenantId}` so
 *                                  the same tenant always maps to the same id.
 *   - Missing/unrecognized attr → uuid-v5 over `SYNTH-${tenantId}-${name}`.
 */
function deriveAccountId(
  rawAttrValue: string | undefined,
  tenantId: string,
  accountName: string,
): string {
  if (rawAttrValue && rawAttrValue !== 'FXGROUPID' && isUuidLike(rawAttrValue)) {
    return rawAttrValue
  }
  if (rawAttrValue === 'FXGROUPID') {
    return uuidv5(`XERO-FXGROUP-${tenantId}`, FXGROUP_NAMESPACE)
  }
  return uuidv5(`SYNTH-${tenantId}-${accountName}`, SYNTH_NAMESPACE)
}

// ─── Summary-row exclusion (mirror by-month parser) ─────────────────────────

const SUMMARY_ROW_NAMES = new Set([
  'gross profit',
  'net profit',
  'total income',
  'total revenue',
  'total cost of sales',
  'total direct costs',
  'total operating expenses',
  'total expenses',
  'total other income',
  'total other expenses',
  'operating profit',
])

// ─── Xero JSON shape (defensive) ────────────────────────────────────────────

type XeroAttribute = { Id?: string; Value?: string }
type XeroCell = { Value?: string; Attributes?: XeroAttribute[] }
type XeroRow = {
  RowType?: string
  Title?: string
  Cells?: XeroCell[]
  Rows?: XeroRow[]
}
type XeroReport = { Rows?: XeroRow[] }

/**
 * Walk a Section sub-tree and emit ParsedPLRow per data row.
 *
 * @param section            The current Section node.
 * @param inheritedClassify  Account-type the parent already classified to
 *                           (or null at the top level).
 * @param caller-supplied    period_month + basis + tenantId
 */
function walkSection(
  section: XeroRow,
  inheritedAccountType: AccountType | null,
  inheritedTitle: string | null,
  ctx: { periodMonth: string; basis: Basis; tenantId: string; out: ParsedPLRow[] },
): void {
  if (!Array.isArray(section.Rows)) return

  // D-44.2-14 fix: only update the carry-forward classification when the
  // section's own title classifies to a known type. Sub-sections like
  // "Software Development" (which classify via the default 'opex' fallback
  // when treated alone) don't clobber the inheritance.
  //
  // We achieve this by attempting to classify the title and only treating
  // it as a "real" top-level section when the title contains one of the
  // recognized substrings ("income", "revenue", "sales", "cost of sales",
  // "cogs", "direct cost", "operating expense", "expense", "other income",
  // "other expense"). For anything else, we keep inherited.
  const ownTitle = (section.Title ?? '').trim()
  let effectiveType: AccountType | null = inheritedAccountType
  let effectiveTitle: string | null = inheritedTitle
  if (ownTitle && titleClassifiesToKnownType(ownTitle)) {
    effectiveType = classifyAccountType(ownTitle)
    effectiveTitle = ownTitle
  }

  for (const node of section.Rows) {
    if (!node || typeof node !== 'object') continue
    if (node.RowType === 'Section') {
      walkSection(node, effectiveType, effectiveTitle, ctx)
      continue
    }
    if (node.RowType !== 'Row') continue // skip Header / SummaryRow
    const cells = node.Cells
    if (!Array.isArray(cells) || cells.length === 0) continue

    const accountName = (cells[0]?.Value ?? '').trim()
    if (!accountName) continue
    if (SUMMARY_ROW_NAMES.has(accountName.toLowerCase())) continue
    if (effectiveType === null) continue // orphan row with no classifying parent

    let attrValue: string | undefined
    const attrs = cells[0]?.Attributes
    if (Array.isArray(attrs)) {
      const accAttr = attrs.find((a) => a?.Id === 'account')
      if (accAttr?.Value) attrValue = accAttr.Value
    }
    const accountId = deriveAccountId(attrValue, ctx.tenantId, accountName)

    // Single-period response: amount lives in Cells[1].Value (Cells[0] is
    // the row label / account name).
    const amount = parseAmount(cells[1]?.Value)
    ctx.out.push({
      account_id: accountId,
      account_code: null, // orchestrator fills from /Accounts catalog
      account_name: accountName,
      account_type: effectiveType,
      period_month: ctx.periodMonth,
      amount,
      basis: ctx.basis,
    })
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Parse a single-period (one calendar month) Reports/ProfitAndLoss response
 * into long-format rows. Caller supplies the canonical period_month + basis.
 */
export function parsePLSinglePeriod(
  report: unknown,
  periodMonth: string,
  basis: Basis,
  tenantId: string,
): ParsedPLRow[] {
  const r = report as { Reports?: XeroReport[] } | null
  const top = r?.Reports?.[0]
  if (!top || !Array.isArray(top.Rows)) return []

  const out: ParsedPLRow[] = []

  // Forward-carry classification across top-level sibling sections. Xero's
  // custom layouts (standardLayout=false) flatten user-defined sub-headers
  // into top-level Sections — e.g. JDS returns "Less Operating Expenses",
  // "Admin Expenses", "Advertising & Marketing", "Office Expenses" as flat
  // siblings. Without forward-carry, "Advertising & Marketing" doesn't match
  // any classifier keyword and all rows under it get dropped.
  //
  // Note: this is a fallback. The orchestrator overrides account_type using
  // xero_accounts.xero_type (catalog) for any row whose account_id has a
  // catalog entry — that path is layout-independent. This forward-carry is
  // only the fallback for FXGROUPID / SYNTH-AID rows without catalog matches.
  let currentTopLevelType: AccountType | null = null
  for (const node of top.Rows) {
    if (node.RowType !== 'Section') continue
    const ownTitle = (node.Title ?? '').trim()
    if (ownTitle && titleClassifiesToKnownType(ownTitle)) {
      currentTopLevelType = classifyAccountType(ownTitle)
    }
    walkSection(
      node,
      currentTopLevelType,
      ownTitle || null,
      { periodMonth, basis, tenantId, out },
    )
  }
  return out
}

// Re-export AccountType for orchestrator convenience.
export type { AccountType } from './pl-by-month-parser'
