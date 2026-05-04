/**
 * Phase 44.2 Plan 44.2-06D Task 1 — single-period Balance Sheet parser.
 *
 * BS twin of pl-single-period-parser.ts. Per Calxa-via-Cowork Q1, Xero's
 * Reports/BalanceSheet endpoint has the same documented periods-parameter
 * bug as Reports/ProfitAndLoss. We avoid it the same way: one query per
 * as-of date, no periods parameter. Each query returns the canonical Xero
 * web BS for that point-in-time.
 *
 * Contract:
 *   - Caller knows the balance_date (it's the URL it requested via
 *     ?date=YYYY-MM-LAST). Parser stamps that value verbatim — does NOT
 *     re-derive it from the report's column header.
 *   - Caller specifies basis ('accruals' or 'cash') — stamped on every row.
 *   - account_id is the Xero AccountID GUID from Cells[0].Attributes.
 *     For FXGROUPID rows, derive a stable uuid-v5 keyed by tenant_id (so
 *     Currency Revaluation Reserve maps to the same id every sync). For
 *     rows missing Attributes, derive a stable uuid-v5 from
 *     tenant_id + account_name.
 *   - section field captures the immediate sub-section title (e.g. 'Bank',
 *     'Current Assets', 'Reserves') for richer queries downstream. Null
 *     for rows that are direct children of a top-level classifier (Assets,
 *     Liabilities, Equity).
 *
 * Classification rules (case-insensitive, section-title based):
 *   - title contains 'asset'    → 'asset'
 *   - title contains 'liabilit' → 'liability'
 *   - title contains 'equity'   → 'equity'
 *
 * Sub-sections (Bank, Current Assets, Fixed Assets, Inventory, Reserves,
 * etc.) DO NOT classify on their own — they inherit from the closest
 * preceding classifying ancestor. Forward-carry across flat siblings
 * (custom layouts where sub-headers appear at top level) is the same
 * fix the P&L parser applies for the JDS-pattern.
 *
 * Note on classifyByXeroType (accounts-catalog.ts):
 *   The orchestrator (Task 2 of this plan) will need a BS-specific
 *   catalog classifier. We add a sibling `classifyBSByXeroType` rather
 *   than extend `classifyByXeroType` because the latter returns
 *   `AccountType` (P&L union: revenue|cogs|opex|other_income|other_expense)
 *   and broadening its return type would force every existing P&L consumer
 *   to handle BS variants. Sibling keeps the type boundaries clean.
 *
 * Pure: same input → same output. No I/O, no clock.
 */
import { v5 as uuidv5 } from 'uuid'
import { parseAmount } from './pl-by-month-parser'

// ─── Public types ───────────────────────────────────────────────────────────

export type BSAccountType = 'asset' | 'liability' | 'equity'
export type Basis = 'accruals' | 'cash'

/**
 * Long-format BS row. Natural key downstream is
 * (business_id, tenant_id, account_id, balance_date).
 *   - account_id: required (Xero AccountID GUID OR derived uuid-v5)
 *   - account_code: NULL here; orchestrator fills from /Accounts catalog
 *   - basis: stamped explicitly per call
 *   - balance_date: stamped from caller-supplied YYYY-MM-DD
 *   - section: sub-section title (or null if direct child of top-level)
 *   - balance: positive magnitudes per Xero convention (assets +,
 *     liabilities +, equity +). Negatives only when a row genuinely is
 *     negative (e.g. a contra account or refund liability).
 */
export type ParsedBSRow = {
  account_id: string // uuid; never null
  account_code: string | null // always null at parse time; orchestrator fills
  account_name: string
  account_type: BSAccountType
  section: string | null
  balance_date: string // 'YYYY-MM-DD'
  balance: number
  basis: Basis
}

// ─── Constants — namespace UUIDs for deterministic synthesis ────────────────

/**
 * Reuse the same namespace UUIDs as pl-single-period-parser.ts so that
 * synthetic BS account_ids align with synthetic P&L account_ids when the
 * same logical account appears in both reports (rare but possible — e.g.
 * a tenant with FX Currency Adjustments hitting both P&L OtherIncome and
 * BS Currency Revaluation Reserve under the same FXGROUPID literal).
 *
 * DO NOT regenerate — every synthetic account_id will rotate and break
 * upserts.
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
 *
 * Mirrors deriveAccountId in pl-single-period-parser.ts; kept local here
 * to avoid a cross-module dependency on a private helper.
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

// ─── Section-title classification (BS-specific) ─────────────────────────────

/**
 * Classify a section title to a BS account_type. Returns non-null ONLY for
 * the exact top-level Xero standard-layout section titles:
 *   - "Assets"
 *   - "Liabilities"
 *   - "Equity"
 *
 * Sub-section titles like "Current Assets", "Fixed Assets",
 * "Current Liabilities", "Non-Current Liabilities" — which CONTAIN the
 * substring 'asset'/'liabilit' but are NOT top-level classifiers — return
 * null. They get treated as sub-sections and inherit type from the
 * classifying ancestor.
 *
 * This is the BS equivalent of D-44.2-14 in the P&L parser: only true
 * top-level titles classify and reset the chain. Sub-section titles
 * capture as `section` and inherit type.
 *
 * Why exact-match (not substring): substring on 'asset' would match
 * "Current Assets" and reset the section context to null mid-walk,
 * losing the sub-section attribution operators rely on for grouping.
 *
 * Note: forward-carry across flat sibling sub-sections (e.g.
 * "Cash and Cash Equivalents" sibling to "Bank") still works because
 * those titles also return null here, and the top-level walker carries
 * the most recent classifying type forward.
 */
function classifyBS(sectionTitle: string): BSAccountType | null {
  const t = sectionTitle.trim().toLowerCase()
  if (t === 'assets') return 'asset'
  if (t === 'liabilities') return 'liability'
  if (t === 'equity') return 'equity'
  return null
}

// ─── Summary-row exclusion ──────────────────────────────────────────────────

/**
 * BS-specific summary-row exclusions. These are computed totals, not real
 * chart-of-accounts entries. Includes Xero's standard total rows plus the
 * "Net Assets" computed line that sits between Liabilities and Equity.
 *
 * Note: "Total Bank" / "Total Current Assets" / "Total Current Liabilities"
 * etc. are also filtered via the prefix-match in walkSection (any name
 * starting with "total " is excluded), so we don't need to enumerate every
 * sub-total here.
 */
const SUMMARY_ROW_NAMES = new Set([
  'total assets',
  'total liabilities',
  'total equity',
  'net assets',
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
 * Walk a Section sub-tree and emit a ParsedBSRow per data Row.
 *
 * @param section            Current Section node.
 * @param inheritedType      BS account_type the parent already classified
 *                           to (or null at the top level of an unclassified
 *                           section).
 * @param inheritedSection   Sub-section title carried forward (or null if
 *                           the parent was a top-level classifier with no
 *                           sub-section context yet).
 * @param ctx                Caller-supplied stamps.
 */
function walkSection(
  section: XeroRow,
  inheritedType: BSAccountType | null,
  inheritedSection: string | null,
  ctx: {
    balanceDate: string
    basis: Basis
    tenantId: string
    out: ParsedBSRow[]
  },
): void {
  if (!Array.isArray(section.Rows)) return

  // Determine effective type + section for THIS section's children.
  // If this section's own title classifies (Assets/Liabilities/Equity),
  // it overrides the inherited type AND resets sub-section context (a
  // top-level classifier has no sub-section of its own).
  // Otherwise (sub-section title like Bank, Reserves, Current Assets):
  //   - keep inherited type
  //   - capture this title as the sub-section context
  const ownTitle = (section.Title ?? '').trim()
  const ownType = ownTitle ? classifyBS(ownTitle) : null

  let effectiveType: BSAccountType | null = inheritedType
  let effectiveSection: string | null = inheritedSection

  if (ownType) {
    effectiveType = ownType
    effectiveSection = null // entering a new top-level classifier — reset sub-section
  } else if (ownTitle) {
    effectiveSection = ownTitle // sub-section captured for richer queries
  }

  for (const node of section.Rows) {
    if (!node || typeof node !== 'object') continue
    if (node.RowType === 'Section') {
      walkSection(node, effectiveType, effectiveSection, ctx)
      continue
    }
    if (node.RowType !== 'Row') continue // skip Header / SummaryRow

    const cells = node.Cells
    if (!Array.isArray(cells) || cells.length === 0) continue

    const accountName = (cells[0]?.Value ?? '').trim()
    if (!accountName) continue

    // Filter Xero's computed summary rows. Hard-coded set covers the
    // top-level totals; the prefix check covers per-section sub-totals
    // ("Total Bank", "Total Current Assets", "Total Current Liabilities",
    // "Total Non-Current Liabilities", etc.).
    const lower = accountName.toLowerCase()
    if (SUMMARY_ROW_NAMES.has(lower)) continue
    if (lower.startsWith('total ')) continue

    if (effectiveType === null) continue // orphan row with no classifying ancestor

    let attrValue: string | undefined
    const attrs = cells[0]?.Attributes
    if (Array.isArray(attrs)) {
      const accAttr = attrs.find((a) => a?.Id === 'account')
      if (accAttr?.Value) attrValue = accAttr.Value
    }
    const accountId = deriveAccountId(attrValue, ctx.tenantId, accountName)

    // Single-period BS: the balance lives in Cells[1].Value (Cells[0] is
    // the row label / account name).
    const balance = parseAmount(cells[1]?.Value)

    ctx.out.push({
      account_id: accountId,
      account_code: null, // orchestrator fills from /Accounts catalog
      account_name: accountName,
      account_type: effectiveType,
      section: effectiveSection,
      balance_date: ctx.balanceDate,
      balance,
      basis: ctx.basis,
    })
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Parse a single-period (point-in-time) Reports/BalanceSheet response into
 * long-format rows. Caller supplies the canonical balance_date + basis.
 *
 * Top-level walk: forward-carry classification across flat sibling sections.
 * Some tenants emit BS with custom layouts where sub-headers (e.g.
 * "Cash and Cash Equivalents" sibling to "Bank") appear flat at the top
 * level. Without forward-carry, those rows would be dropped (orphan).
 * Forward-carry inherits from the most recent classifying sibling — the
 * same fix the P&L parser applies for the JDS-pattern.
 */
export function parseBSSinglePeriod(
  report: unknown,
  balanceDate: string,
  basis: Basis,
  tenantId: string,
): ParsedBSRow[] {
  const r = report as { Reports?: XeroReport[] } | null
  const top = r?.Reports?.[0]
  if (!top || !Array.isArray(top.Rows)) return []

  const out: ParsedBSRow[] = []

  // Forward-carry: track the most recent top-level classifier. New top-level
  // siblings without their own classifier inherit the carried type.
  let currentTopLevelType: BSAccountType | null = null
  let currentTopLevelSection: string | null = null

  for (const node of top.Rows) {
    if (node.RowType !== 'Section') continue

    const ownTitle = (node.Title ?? '').trim()
    const ownType = ownTitle ? classifyBS(ownTitle) : null

    let entryType: BSAccountType | null
    let entrySection: string | null

    if (ownType) {
      // Top-level classifier (Assets / Liabilities / Equity) — reset chain.
      currentTopLevelType = ownType
      currentTopLevelSection = null
      entryType = ownType
      entrySection = null
    } else if (ownTitle) {
      // Flat sibling sub-section — inherit type, capture as section.
      entryType = currentTopLevelType
      entrySection = ownTitle
      currentTopLevelSection = ownTitle
    } else {
      // Empty-titled wrapper section (e.g. the section that holds the
      // computed "Net Assets" SummaryRow). Inherit chain unchanged.
      entryType = currentTopLevelType
      entrySection = currentTopLevelSection
    }

    walkSection(node, entryType, entrySection, {
      balanceDate,
      basis,
      tenantId,
      out,
    })
  }

  return out
}
