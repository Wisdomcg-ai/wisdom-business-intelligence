/**
 * How a placed Actual vs Budget table prints its commentary.
 *
 * One rule used to cover every commentary block in every pack: the accounts a
 * variance trigger fired on, in statement order, under a 9pt "COMMENTARY"
 * heading directly beneath the table, each bullet ending in a ratio clause and
 * any coach note tacked on after a dash. Calxa's Urban Road pack does none of
 * that on its COGS page and only some of it on its expenses page:
 *
 *   p7  COMMENTARY on a portrait page of its own, a bullet for EVERY cost of
 *       sales account that moved in the month, alphabetical, a ratio on two of
 *       the ten (Antons Canvas, Freight to Customer) and none on the rest;
 *   p11 COMMENTS, bold and underlined, under the expense table: the standing
 *       "Refer to …" lines first, then the overspends largest first, no ratio
 *       clause anywhere and no bullet for a favourable variance.
 *
 * Every one of those is a property of how ONE page reads, so it lives on the
 * placement (widget.config.commentary), the same way variance_percent does,
 * and needs no migration applied by hand before a pack can use it. Absent — or
 * anything unrecognised — is exactly today's block, for every client that has
 * not asked for anything else; an unrecognised value is also reported, by field
 * (readCommentaryPlacement), to the preview harness and the pre-flight panel.
 *
 *   { "section": "cogs",
 *     "commentary": {
 *       "placement": "separate_page",          inline | separate_page | none
 *       "coverage": "all_with_activity",       triggered | all_with_activity
 *       "order": "alphabetical",               statement | alphabetical | largest_overspend
 *       "heading": "COMMENTARY",
 *       "heading_underline": false,
 *       "body_size": 10,
 *       "favourable": "coach_only",            print | coach_only
 *       "ratio_clause": ["Antons Canvas", "55000"],   every_account | none | [names or codes]
 *       "vendor_cap": { "Freight to Customer": "all" },   N | all | { name or code: N | all }
 *       "coach_note": "replace"                append | replace
 *     } }
 *
 * `commentary: "separate_page"` (a bare string) is shorthand for the placement.
 */
import type {
  ReportCategory,
  ReportLine,
  StandingCommentaryLine,
  VarianceCommentary,
  VarianceCommentaryEntry,
} from '../types'
import type { PDFLayout } from '../types/pdf-layout'
import { resolveSectionFilter } from './section-table-config'
import { annotateStandingLines } from '../utils/standing-commentary'
import { buildDraftNote, DEFAULT_TOP_N, type DraftVendor } from '@/lib/monthly-report/commentary-draft'
import { createVendorKey } from '@/lib/utils/vendor-normalization'

export type CommentaryPlacementMode = 'inline' | 'separate_page' | 'none'
export type CommentaryCoverage = 'triggered' | 'all_with_activity'
export type CommentaryOrder = 'statement' | 'alphabetical' | 'largest_overspend'

/** How many suppliers a bullet names: a positive whole number, or every one. */
export type VendorCap = number | 'all'

export interface CommentaryPlacement {
  placement: CommentaryPlacementMode
  coverage: CommentaryCoverage
  order: CommentaryOrder
  heading: string
  headingUnderline: boolean
  /** Null = the size the block has always printed at where it sits. */
  bodySize: number | null
  favourable: 'print' | 'coach_only'
  /** 'every_account', 'none', or the names/codes of the accounts that keep it. */
  ratioClause: 'every_account' | 'none' | readonly string[]
  /**
   * Null = the draft as the route stored it (DEFAULT_TOP_N suppliers, then
   * "+N others"). A cap for every account in the block, or per account by name
   * or code — an account not listed keeps the stored draft.
   */
  vendorCap: VendorCap | readonly { account: string; cap: VendorCap }[] | null
  coachNote: 'append' | 'replace'
}

export const DEFAULT_COMMENTARY_PLACEMENT: CommentaryPlacement = {
  placement: 'inline',
  coverage: 'triggered',
  order: 'statement',
  heading: 'COMMENTARY',
  headingUnderline: false,
  bodySize: null,
  favourable: 'print',
  ratioClause: 'every_account',
  vendorCap: null,
  coachNote: 'append',
}

/** The categories a commentary block is ever drawn for. */
export const COMMENTARY_CATEGORIES: readonly ReportCategory[] = ['Cost of Sales', 'Operating Expenses', 'Other Expenses']

/**
 * One value in a commentary config the pack could not read, and so printed the
 * default in place of. The config is applied by hand-written SQL, where a typo
 * ("separate-page", body_size "10") is the likely failure; without this it
 * printed today's block and nobody learned why.
 */
export interface CommentaryPlacementProblem {
  field: string
  value: unknown
  reason: string
}

const MODES = ['inline', 'separate_page', 'none'] as const
const COVERAGES = ['triggered', 'all_with_activity'] as const
const ORDERS = ['statement', 'alphabetical', 'largest_overspend'] as const
const FAVOURABLES = ['print', 'coach_only'] as const
const COACH_NOTES = ['append', 'replace'] as const
const KNOWN_FIELDS = new Set([
  'placement', 'coverage', 'order', 'heading', 'heading_underline', 'body_size', 'favourable', 'ratio_clause', 'vendor_cap', 'coach_note',
])

const isCap = (v: unknown): v is VendorCap =>
  v === 'all' || (typeof v === 'number' && Number.isInteger(v) && v >= 1)

export function readCommentaryPlacement(
  config: Record<string, unknown> | undefined,
): { placement: CommentaryPlacement; problems: CommentaryPlacementProblem[] } {
  const raw = config?.commentary
  const d = DEFAULT_COMMENTARY_PLACEMENT
  const problems: CommentaryPlacementProblem[] = []

  const oneOf = <T extends string>(field: string, value: unknown, allowed: readonly T[], fallback: T): T => {
    if (value === undefined) return fallback
    if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as T
    problems.push({ field, value, reason: `expected one of ${allowed.join(', ')}; printed ${fallback}` })
    return fallback
  }

  if (raw === undefined || raw === null) return { placement: d, problems }
  if (typeof raw === 'string') {
    return { placement: { ...d, placement: oneOf('commentary', raw, MODES, d.placement) }, problems }
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    problems.push({ field: 'commentary', value: raw, reason: 'expected an object of commentary settings, or one of inline, separate_page, none; printed the default block' })
    return { placement: d, problems }
  }
  const c = raw as Record<string, unknown>

  for (const key of Object.keys(c)) {
    if (!KNOWN_FIELDS.has(key)) problems.push({ field: key, value: c[key], reason: `not a commentary setting (known: ${[...KNOWN_FIELDS].join(', ')}); ignored` })
  }

  let ratioClause: CommentaryPlacement['ratioClause'] = d.ratioClause
  if (c.ratio_clause === undefined) {
    // absent: the default
  } else if (c.ratio_clause === 'none' || c.ratio_clause === 'every_account') {
    ratioClause = c.ratio_clause
  } else if (Array.isArray(c.ratio_clause)) {
    // A list, even an empty one, is a choice: [] keeps the clause on nothing.
    const names = c.ratio_clause.filter((a): a is string => typeof a === 'string' && a.trim() !== '')
    if (names.length !== c.ratio_clause.length) {
      problems.push({ field: 'ratio_clause', value: c.ratio_clause, reason: 'every entry must be a non-blank account name or code; the others were ignored' })
    }
    ratioClause = names.map((a) => a.trim())
  } else {
    // A bare account name is the likely typo, and reading it as 'every_account'
    // would print the clause on exactly the accounts it was meant to leave bare.
    problems.push({ field: 'ratio_clause', value: c.ratio_clause, reason: 'expected every_account, none, or a list of account names or codes; printed every_account' })
  }

  // A cap that is not a count is a typo. Reading it as "all" could print
  // eighty customer names into a client pack; reading it as nothing prints the
  // draft the coach has already seen in the editor.
  let vendorCap: CommentaryPlacement['vendorCap'] = d.vendorCap
  if (c.vendor_cap !== undefined && c.vendor_cap !== null) {
    if (isCap(c.vendor_cap)) {
      vendorCap = c.vendor_cap
    } else if (typeof c.vendor_cap === 'object' && !Array.isArray(c.vendor_cap)) {
      const entries = Object.entries(c.vendor_cap as Record<string, unknown>)
      const good = entries.filter(([k, v]) => k.trim() !== '' && isCap(v))
      if (good.length !== entries.length) {
        problems.push({ field: 'vendor_cap', value: c.vendor_cap, reason: 'every entry must map an account name or code to a whole number of suppliers (1 or more) or "all"; the others were ignored' })
      }
      vendorCap = good.map(([k, v]) => ({ account: k.trim(), cap: v as VendorCap }))
    } else {
      problems.push({ field: 'vendor_cap', value: c.vendor_cap, reason: `expected a whole number of suppliers, "all", or an object of account → cap; printed the stored draft (${DEFAULT_TOP_N} suppliers)` })
    }
  }

  // A size outside what a page can carry is a typo, not a request: the block
  // keeps its own size rather than printing 2pt or 40pt text into a pack.
  let size: number | null = null
  if (c.body_size !== undefined && c.body_size !== null) {
    if (typeof c.body_size === 'number' && c.body_size >= 6 && c.body_size <= 14) size = c.body_size
    else problems.push({ field: 'body_size', value: c.body_size, reason: 'expected a number between 6 and 14 (points); printed the block at its own size' })
  }

  let heading = d.heading
  if (c.heading !== undefined) {
    if (typeof c.heading === 'string' && c.heading.trim() !== '') heading = c.heading.trim()
    else problems.push({ field: 'heading', value: c.heading, reason: `expected non-blank text; printed ${d.heading}` })
  }

  if (c.heading_underline !== undefined && typeof c.heading_underline !== 'boolean') {
    problems.push({ field: 'heading_underline', value: c.heading_underline, reason: 'expected true or false; printed no underline' })
  }

  return {
    placement: {
      placement: oneOf('placement', c.placement, MODES, d.placement),
      coverage: oneOf('coverage', c.coverage, COVERAGES, d.coverage),
      order: oneOf('order', c.order, ORDERS, d.order),
      heading,
      headingUnderline: c.heading_underline === true,
      bodySize: size,
      favourable: oneOf('favourable', c.favourable, FAVOURABLES, d.favourable),
      ratioClause,
      vendorCap,
      coachNote: oneOf('coach_note', c.coach_note, COACH_NOTES, d.coachNote),
    },
    problems,
  }
}

export function resolveCommentaryPlacement(config: Record<string, unknown> | undefined): CommentaryPlacement {
  return readCommentaryPlacement(config).placement
}

/**
 * Every commentary setting in a layout the pack could not read, by widget —
 * for the preview harness's warnings and the pre-flight panel. The pack still
 * prints the default for each; this is how the coach finds out it did.
 */
export function commentaryPlacementProblems(
  layout: PDFLayout | null | undefined,
): (CommentaryPlacementProblem & { widgetId: string })[] {
  const out: (CommentaryPlacementProblem & { widgetId: string })[] = []
  for (const page of layout?.pages ?? []) {
    for (const w of Array.isArray(page.widgets) ? page.widgets : []) {
      if (w.type !== 'budget_vs_actual') continue
      for (const p of readCommentaryPlacement(w.config).problems) out.push({ widgetId: w.id, ...p })
    }
  }
  return out
}

/** One line of text per problem, the way the harness and the panel print them. */
export function describeCommentaryPlacementProblem(p: CommentaryPlacementProblem & { widgetId?: string }): string {
  return `${p.widgetId ? `${p.widgetId} ` : ''}commentary.${p.field} ${JSON.stringify(p.value)}: ${p.reason}`
}

/**
 * The categories whose commentary must cover every account that moved.
 *
 * Read by the page before it asks the commentary route for drafts: an account
 * that triggered nothing has no draft to print, so the page has to ask for it.
 * The union over every placement — a category covered in full anywhere is
 * drafted in full, and a placement that only wants its triggered accounts
 * filters the rest out when it prints.
 */
export function commentaryCoverageFromLayout(layout: PDFLayout | null | undefined): ReportCategory[] {
  const out = new Set<ReportCategory>()
  for (const page of layout?.pages ?? []) {
    for (const w of Array.isArray(page.widgets) ? page.widgets : []) {
      if (w.type !== 'budget_vs_actual') continue
      const p = resolveCommentaryPlacement(w.config)
      if (p.placement === 'none' || p.coverage !== 'all_with_activity') continue
      const filter = resolveSectionFilter(w.config) ?? COMMENTARY_CATEGORIES
      for (const c of filter) if (COMMENTARY_CATEGORIES.includes(c)) out.add(c)
    }
  }
  return [...out]
}

/** Whole cents: a residue of a rounding is not activity. */
export function hasActivity(actual: number): boolean {
  return Number.isFinite(actual) && Math.round(actual * 100) !== 0
}

export interface CommentaryBullet {
  account: string
  body: string
  /**
   * The body is a warning the coach has to act on (a standing line pointing at
   * a page this pack does not carry). Drawn in red, never dropped.
   */
  flagged?: boolean
}

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Whether this placement keeps the ratio clause on this account. */
function keepsClause(line: ReportLine, rule: CommentaryPlacement['ratioClause']): boolean {
  if (rule === 'every_account') return true
  if (rule === 'none') return false
  const names = new Set([norm(line.account_name), norm(line.xero_account_name)].filter(Boolean))
  return rule.some((r) => (line.account_code && r === line.account_code) || names.has(norm(r)))
}

/** The supplier cap this placement sets on this account, or null for the stored draft. */
function capFor(line: ReportLine, rule: CommentaryPlacement['vendorCap']): VendorCap | null {
  if (rule === null) return null
  if (!Array.isArray(rule)) return rule as VendorCap
  const names = new Set([norm(line.account_name), norm(line.xero_account_name)].filter(Boolean))
  const hit = (rule as readonly { account: string; cap: VendorCap }[])
    .find((r) => (line.account_code && r.account === line.account_code) || names.has(norm(r.account)))
  return hit ? hit.cap : null
}

/**
 * The "Others" remainder, back into the suppliers it was made of.
 *
 * "all" means every supplier, and the remainder is suppliers under $100 rolled
 * together (summariseVendors). Calxa names them — "Art Supplies | ebay ($80),
 * Amazon ($37)" — and their transactions ride along on the stored entry, so
 * they can be named without asking Xero again. Grouped and rounded the way
 * summariseVendors grouped and rounded them; if they do not add back to the
 * remainder's own amount (a snapshot stored without its transactions), the
 * remainder stays as it was rather than print names that do not foot.
 */
function expandOthers(vendors: readonly DraftVendor[], summary: VarianceCommentaryEntry['vendor_summary']): DraftVendor[] {
  const out: DraftVendor[] = []
  for (const [i, v] of vendors.entries()) {
    const txns = summary[i]?.transactions ?? []
    if (v.vendor !== 'Others' || txns.length === 0) { out.push(v); continue }
    const byKey = new Map<string, DraftVendor>()
    for (const t of txns) {
      const key = createVendorKey(t.vendor)
      const got = byKey.get(key)
      if (got) got.amount += t.amount
      else byKey.set(key, { vendor: t.vendor, amount: t.amount })
    }
    const named = [...byKey.values()].map((n) => ({ ...n, amount: Math.round(n.amount) })).filter((n) => n.amount !== 0)
    if (named.reduce((s, n) => s + n.amount, 0) === v.amount) out.push(...named)
    else out.push(v)
  }
  return out
}

/**
 * The supplier list redrawn at this placement's cap, from the suppliers stored
 * on the entry. Null when there is nothing to redraw from — commentary that
 * carries text but no suppliers (a hand-written or pre-vendor-summary entry) —
 * and the stored text prints instead.
 */
function cappedFacts(entry: VarianceCommentaryEntry, line: ReportLine, cap: VendorCap): string | null {
  const summary = entry.vendor_summary ?? []
  if (summary.length === 0) return null
  const vendors: DraftVendor[] = summary.map((v) => {
    const extra = v as { converted?: boolean; sourceCurrency?: string }
    return { vendor: v.vendor, amount: v.amount, converted: extra.converted, sourceCurrency: extra.sourceCurrency }
  })
  return buildDraftNote({
    accountName: line.account_name,
    vendors: cap === 'all' ? expandOthers(vendors, summary) : vendors,
    accountActual: line.actual,
    clause: null,
    topN: cap === 'all' ? Infinity : cap,
  }).facts
}

/**
 * The facts half of one bullet, before any coach note.
 *
 * `draft_note` has always carried the ratio clause welded to the supplier list.
 * The route now also stores the two halves apart (draft_facts, draft_clause),
 * so a placement can print the list without the clause. A snapshot drafted
 * before that has only the welded string, and prints it whole — the clause
 * cannot be taken off text that was never stored in pieces, and guessing where
 * it starts is how a supplier named "- 5% Off" would lose half its name.
 */
function factsFor(entry: VarianceCommentaryEntry, line: ReportLine, placement: CommentaryPlacement): string {
  if ((entry.draft_warnings?.length ?? 0) > 0) {
    // Suppressed outright: a pack must not quote a list we already know is
    // wrong. See addBudgetVsActualDetail for the Urban Road case.
    return 'Supplier detail withheld — the supplier list does not agree with this account this month.'
  }
  const whole = entry.draft_note ?? ''
  if (typeof entry.draft_facts !== 'string') return whole
  const keep = keepsClause(line, placement.ratioClause)

  // A cap other than the draft's own redraws the supplier list from the stored
  // suppliers, and puts the stored clause back after it. Calxa names all nine
  // carriers on Urban Road's Freight to Customer where the draft stops at three
  // and "+6 others ($8,508)". Done here rather than in the route because the
  // cap is a property of how one page reads, like the clause: the stored draft
  // stays the editor's three-supplier line, and no Regenerate is needed.
  const cap = capFor(line, placement.vendorCap)
  const redrawn = cap === null ? null : cappedFacts(entry, line, cap)
  if (redrawn !== null) {
    // As buildDraftNote: a clause with no suppliers under it is not commentary.
    return keep && entry.draft_clause && redrawn ? `${redrawn} - ${entry.draft_clause}` : redrawn
  }

  return keep ? whole : entry.draft_facts
}

function bodyFor(entry: VarianceCommentaryEntry, line: ReportLine, placement: CommentaryPlacement): string {
  const note = (entry.coach_note ?? '').trim()
  // Replace: the coach's text stands on its own. The generated draft is still
  // stored beside it, untouched, so clearing the note brings the draft back.
  if (placement.coachNote === 'replace' && note) return note
  const facts = factsFor(entry, line, placement)
  return note ? `${facts}${facts ? ' — ' : ''}${note}` : facts
}

/**
 * An account a block should have commented on and printed nothing for.
 *
 *   no_draft     the entry is there, but the draft is empty and the coach has
 *                not written a note (Art Import in August: $5,042 by journal,
 *                with no supplier to quote)
 *   not_drafted  a block that lists every account that moved has no entry for
 *                this one at all — the drafts were made before the layout
 *                asked for it, and a Regenerate would draft it
 *
 * The pack still prints no bullet for either: an empty bullet asserts the
 * account was commented on and then says nothing. But a page that claims to
 * list every account that moved and quietly lists fewer collapses "could not
 * draft" into "nothing to say", so the gap is returned for the coach to see.
 */
export interface CommentaryGap {
  account: string
  actual: number
  reason: 'no_draft' | 'not_drafted'
}

/**
 * An account whose bullet printed the stored draft although the placement set
 * a vendor_cap on it.
 *
 *   drafted_before_split  the entry predates draft_facts, so the supplier list
 *                         cannot be taken off the clause it is welded to — a
 *                         Regenerate stores the halves apart
 *   no_suppliers_stored   the entry has text but no vendor_summary to redraw
 *                         the list from (a hand-set or pre-vendor-summary draft)
 *
 * The bullet still prints, as stored. Without this, a cap that did nothing
 * looked exactly like a cap that had nothing to add: Urban Road's August
 * entries predate draft_facts, and "all" on its COGS page was a silent no-op.
 */
export interface CommentaryCapIgnored {
  account: string
  reason: 'drafted_before_split' | 'no_suppliers_stored'
}

type StandingClaimLine =Pick<ReportLine, 'account_name'> & Partial<Pick<ReportLine, 'xero_account_name' | 'account_code'>>

/**
 * Whether a standing line speaks for this account: its label names it, or one
 * of its `accounts` does, by name or code. The label is the client's wording
 * ("Wages & Salaries") and is often not the account's name ("Employ - Wages &
 * Salaries"), so matching the label alone left a supplier bullet printing under
 * the "Refer to" line for the same cost in any month wages ran over.
 */
export function standingLineClaims(standing: Pick<StandingCommentaryLine, 'label' | 'accounts'>, line: StandingClaimLine): boolean {
  const names = new Set([norm(line.account_name), norm(line.xero_account_name)].filter(Boolean))
  if (names.has(norm(standing.label))) return true
  return (standing.accounts ?? []).some((a) =>
    typeof a === 'string' && a.trim() !== '' &&
    ((line.account_code && a.trim() === line.account_code) || names.has(norm(a))))
}

/**
 * The bullets one commentary block prints, in the order it prints them, and
 * the accounts it should have commented on and could not (see CommentaryGap).
 *
 * Pure, so the rules can be pinned with a pack's own figures without drawing a
 * page. `standing` is passed only to the block that hosts the standing lines.
 */
export function buildCommentaryBlock(input: {
  lines: readonly ReportLine[]
  commentary: VarianceCommentary | undefined
  placement: CommentaryPlacement
  standing?: readonly StandingCommentaryLine[]
  packPageLabels?: readonly string[]
}): { bullets: CommentaryBullet[]; uncommented: CommentaryGap[]; capIgnored: CommentaryCapIgnored[] } {
  const { lines, commentary, placement } = input

  // Standing lines first, as ordinary bullets in the same list: "Wages &
  // Salaries | Refer to Payroll Summary Page". They used to print after the
  // commentary as a separate amber list whose y was taken from the table's
  // bottom, so it overprinted the bullets it followed.
  const standing = annotateStandingLines(input.standing ?? [], input.packPageLabels ?? [])
  const claimed = new Map<string, string[]>()
  const uncommented: CommentaryGap[] = []
  const capIgnored: CommentaryCapIgnored[] = []

  const variance: { bullet: CommentaryBullet; line: ReportLine; index: number }[] = []
  lines.forEach((line, index) => {
    const entry = commentary?.[line.account_name]
    const own = standing.find((s) => standingLineClaims(s, line))
    const listsEveryMove = placement.coverage === 'all_with_activity' && hasActivity(line.actual)
    if (!entry) {
      if (listsEveryMove && !own) uncommented.push({ account: line.account_name, actual: line.actual, reason: 'not_drafted' })
      return
    }
    const note = (entry.coach_note ?? '').trim()

    // An account with a standing line of its own ("IT Costs Software | Refer
    // to summary page") is commented on by that line, not by a supplier list
    // that repeats the page it refers to. A note the coach wrote on it still
    // prints, on the standing bullet — a coach's sentence is never dropped.
    if (own) {
      if (note) claimed.set(norm(own.label), [...(claimed.get(norm(own.label)) ?? []), note])
      return
    }

    if (placement.coverage === 'triggered' && entry.trigger_reason === 'account_activity' && !note) return
    // A favourable variance is good news the coach may want to know about and
    // the client pack may not want to spend a bullet on. With a note, the coach
    // has decided it is worth saying.
    if (
      placement.favourable === 'coach_only' &&
      entry.trigger_reason === 'expense_favourable_significant' &&
      !note &&
      !listsEveryMove
    ) return

    // An empty bullet asserts that the account was commented on and then says
    // nothing. A suppressed list still prints, and says why it is missing.
    const hasDraft = !!(entry.draft_note ?? '').trim()
    const suppressed = (entry.draft_warnings?.length ?? 0) > 0
    const body = hasDraft || suppressed || note ? bodyFor(entry, line, placement) : ''
    if (!body.trim()) {
      uncommented.push({ account: line.account_name, actual: line.actual, reason: 'no_draft' })
      return
    }
    variance.push({ bullet: { account: line.account_name, body }, line, index })

    // Only where the cap had a list to act on and did not: a withheld list is
    // not printed, and a replace-mode note stands in for the draft entirely.
    const cap = capFor(line, placement.vendorCap)
    if (cap !== null && hasDraft && !suppressed && !(placement.coachNote === 'replace' && note)) {
      if (typeof entry.draft_facts !== 'string') capIgnored.push({ account: line.account_name, reason: 'drafted_before_split' })
      else if ((entry.vendor_summary ?? []).length === 0) capIgnored.push({ account: line.account_name, reason: 'no_suppliers_stored' })
    }
  })

  if (placement.order === 'alphabetical') {
    variance.sort((a, b) => a.bullet.account.localeCompare(b.bullet.account, 'en-AU') || a.index - b.index)
  } else if (placement.order === 'largest_overspend') {
    // variance_amount is budget - actual on a cost line: the most negative is
    // the largest overspend. Anything not overspent keeps statement order after.
    variance.sort((a, b) => {
      const va = Math.min(a.line.variance_amount, 0)
      const vb = Math.min(b.line.variance_amount, 0)
      return va - vb || a.index - b.index
    })
  }

  const standingBullets: CommentaryBullet[] = standing.map((s) => {
    const refer = s.refer_to ? `Refer to ${s.refer_to}` : ''
    const notes = claimed.get(norm(s.label)) ?? []
    const text = [refer, ...notes].filter(Boolean).join(' — ')
    return s.in_pack || !s.refer_to
      ? { account: s.label, body: text }
      : { account: s.label, body: `${text} (page not in this pack)`, flagged: true }
  })

  return { bullets: [...standingBullets, ...variance.map((v) => v.bullet)], uncommented, capIgnored }
}

/** The bullets alone — see buildCommentaryBlock. */
export function buildCommentaryBullets(input: Parameters<typeof buildCommentaryBlock>[0]): CommentaryBullet[] {
  return buildCommentaryBlock(input).bullets
}
