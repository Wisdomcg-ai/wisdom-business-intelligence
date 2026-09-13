/**
 * The Ratio Analysis settings panel's form state, and the only road between it
 * and a placed widget's `config` / `titleOverride`.
 *
 * #519 shipped the page and its schema but no way to fill it in: a coach who
 * dragged Ratio Analysis onto a page got "No ratios have been set up for this
 * page yet" and nothing in the editor could change that. This module is the
 * missing half. The React panel only renders this state and calls these
 * functions, so every rule below is tested without a DOM.
 *
 * THE ROUND-TRIP RULE. Opening the panel on a stored config and pressing Apply
 * with no edits writes back the stored config unchanged, with ONE stated
 * exception: the three page settings the schema defaults (months_shown,
 * trailing_averages, show_amounts) are always written out explicitly. A config
 * that omitted them is therefore written with the values parse was already
 * filling in, so the page prints the same. Everything else keeps its shape:
 *
 *   - key order is the schema's (months_shown, trailing_averages, show_amounts,
 *     ratios; label, numerator, denominator, trailing_averages; accounts|total,
 *     label), so a config the panel wrote re-saves byte-identical;
 *   - a ratio's own trailing_averages keeps its three meanings — ABSENT is "the
 *     page's averages", [] is "no averages" (Urban Road's Posters ratio), and
 *     any other list is kept as stored;
 *   - averages the panel has no checkbox for (a hand-written [9]) are kept, and
 *     so is the ORDER of the stored list — the page prints averages in the
 *     order given, and [6, 3] is how the reference pack reads;
 *   - account codes are kept whether or not the chart still has them — a code
 *     that was renamed away is shown as not found, never dropped;
 *   - blank display names and a blank title are OMITTED, not written as '' —
 *     the schema refuses an empty label, and the renderer already falls back;
 *   - keys this module does not model are carried through verbatim. The schema
 *     is strict, so such a config does not validate: the panel shows parse's
 *     reason and will not Apply it, rather than quietly deleting the key.
 *
 * Validation is parseRatioAnalysisConfig and nothing else — the rule the PDF
 * renderer applies. `describeReason` rewords its reason for a coach; it never
 * decides anything.
 */
import { STATEMENT_TOTALS, type LedgerAccount, type StatementTotal } from './account-actuals'
import { parseRatioAnalysisConfig, type RatioAnalysisConfig } from './ratio-table'

// ── State ────────────────────────────────────────────────────────────────────

export type OperandSide = 'numerator' | 'denominator'

export interface OperandForm {
  mode: 'accounts' | 'total'
  /**
   * Both choices are held, so flipping "a total" → "accounts" → "a total" does
   * not lose what was picked. Only the mode's key is written.
   */
  accounts: string[]
  total: StatementTotal
  /** '' = no display name; the page prints the account or total name. */
  label: string
  extra: Record<string, unknown>
}

export interface RatioForm {
  /** React list key. UI-only — never written into config (the schema is strict). */
  key: string
  label: string
  numerator: OperandForm
  denominator: OperandForm
  /** undefined = the page's averages; [] = none for this ratio; else as stored. */
  trailing: number[] | undefined
  extra: Record<string, unknown>
}

export interface RatioPageForm {
  /** titleOverride; '' = the default heading "Ratio Analysis". */
  title: string
  monthsShown: number
  trailing: number[]
  showAmounts: boolean
  ratios: RatioForm[]
  extra: Record<string, unknown>
}

export const MAX_RATIOS = 4
export const MAX_MONTHS_SHOWN = 6
/** The averages the panel offers as checkboxes. Others are kept, not offered. */
export const STANDARD_AVERAGES = [3, 6, 12] as const
/** What parse fills in for a page that does not say. */
const DEFAULT_MONTHS_SHOWN = 3
const DEFAULT_TRAILING = [6, 3]
const DEFAULT_SHOW_AMOUNTS = true

const PAGE_KEYS = new Set(['months_shown', 'trailing_averages', 'show_amounts', 'ratios'])
const RATIO_KEYS = new Set(['label', 'numerator', 'denominator', 'trailing_averages'])
const OPERAND_KEYS = new Set(['accounts', 'total', 'label'])

let keySeq = 0
const nextKey = () => `ratio-${++keySeq}`

function blankOperand(mode: OperandForm['mode'], total: StatementTotal = 'income'): OperandForm {
  return { mode, accounts: [], total, label: '', extra: {} }
}

/** A new ratio: something on top, Total Income underneath — the common case. */
export function blankRatio(): RatioForm {
  return {
    key: nextKey(),
    label: '',
    numerator: blankOperand('accounts'),
    denominator: blankOperand('total', 'income'),
    trailing: undefined,
    extra: {},
  }
}

/** A freshly placed page: the schema's defaults and one ratio to fill in. */
export function emptyRatioPageForm(): RatioPageForm {
  return {
    title: '',
    monthsShown: DEFAULT_MONTHS_SHOWN,
    trailing: [...DEFAULT_TRAILING],
    showAmounts: DEFAULT_SHOW_AMOUNTS,
    ratios: [blankRatio()],
    extra: {},
  }
}

// ── Config → form ────────────────────────────────────────────────────────────

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const isNumberList = (v: unknown): v is number[] => Array.isArray(v) && v.every((n) => typeof n === 'number')

function extrasOf(obj: Record<string, unknown>, known: Set<string>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) if (!known.has(k)) out[k] = v
  return out
}

export interface LoadedRatioPageForm {
  form: RatioPageForm
  /**
   * What had to change to read the stored config at all — a value of the wrong
   * type reset to its default, a ratio that was not an object. Shown in the
   * panel; empty for every config the panel itself wrote.
   */
  notes: string[]
}

function operandFromConfig(raw: unknown, where: string, notes: string[]): OperandForm {
  if (!isRecord(raw)) {
    if (raw !== undefined) notes.push(`${where} could not be read and was reset.`)
    return blankOperand('accounts')
  }
  const hasAccounts = Array.isArray(raw.accounts)
  const rawAccounts = hasAccounts ? (raw.accounts as unknown[]) : []
  if (rawAccounts.some((c) => typeof c !== 'string')) {
    notes.push(`${where} had an account code stored as a number; it is kept as text.`)
  }
  const accounts = rawAccounts.map((c) => String(c))
  const validTotal = (STATEMENT_TOTALS as readonly unknown[]).includes(raw.total)
  if (raw.total !== undefined && !validTotal) {
    notes.push(`${where} named a total this page does not know (${JSON.stringify(raw.total)}); it was reset to Total Income.`)
  }
  if (hasAccounts && raw.total !== undefined) {
    notes.push(`${where} named both accounts and a total; the accounts were kept.`)
  }
  return {
    mode: hasAccounts ? 'accounts' : raw.total !== undefined ? 'total' : 'accounts',
    accounts,
    total: validTotal ? (raw.total as StatementTotal) : 'income',
    label: typeof raw.label === 'string' ? raw.label : '',
    extra: extrasOf(raw, OPERAND_KEYS),
  }
}

/** Read a placed widget into the form. Tolerant: nothing stored is dropped silently. */
export function formFromWidget(config: unknown, titleOverride: string | undefined): LoadedRatioPageForm {
  const notes: string[] = []
  const form = emptyRatioPageForm()
  form.title = titleOverride ?? ''
  if (config === undefined || config === null) return { form, notes }
  if (!isRecord(config)) {
    notes.push('The stored settings could not be read; the page starts again from blank.')
    return { form, notes }
  }

  if (typeof config.months_shown === 'number') form.monthsShown = config.months_shown
  else if (config.months_shown !== undefined) notes.push(`Months shown could not be read and was reset to ${DEFAULT_MONTHS_SHOWN}.`)

  if (isNumberList(config.trailing_averages)) form.trailing = [...config.trailing_averages]
  else if (config.trailing_averages !== undefined) notes.push('The averages could not be read and were reset to 6- and 3-month.')

  if (typeof config.show_amounts === 'boolean') form.showAmounts = config.show_amounts
  else if (config.show_amounts !== undefined) notes.push('"Show the dollar amounts" could not be read and was reset to on.')

  if (Array.isArray(config.ratios)) {
    form.ratios = []
    config.ratios.forEach((raw, i) => {
      const where = `Ratio ${i + 1}`
      if (!isRecord(raw)) {
        notes.push(`${where} could not be read and was left out.`)
        return
      }
      let trailing: number[] | undefined
      if (isNumberList(raw.trailing_averages)) trailing = [...raw.trailing_averages]
      else if (raw.trailing_averages !== undefined) notes.push(`${where}'s averages could not be read; it now uses the page's averages.`)
      form.ratios.push({
        key: nextKey(),
        label: typeof raw.label === 'string' ? raw.label : '',
        numerator: operandFromConfig(raw.numerator, `${where}'s top line`, notes),
        denominator: operandFromConfig(raw.denominator, `${where}'s bottom line`, notes),
        trailing,
        extra: extrasOf(raw, RATIO_KEYS),
      })
    })
  } else if (config.ratios !== undefined) {
    notes.push('The stored ratios could not be read; the page starts with one blank ratio.')
  }

  form.extra = extrasOf(config, PAGE_KEYS)
  return { form, notes }
}

// ── Form → config ────────────────────────────────────────────────────────────

function operandToConfig(op: OperandForm): Record<string, unknown> {
  const out: Record<string, unknown> = op.mode === 'accounts' ? { accounts: [...op.accounts] } : { total: op.total }
  if (op.label.trim() !== '') out.label = op.label
  return { ...out, ...op.extra }
}

/** The config this form describes — valid or not. Validate before writing it. */
export function configFromForm(form: RatioPageForm): Record<string, unknown> {
  return {
    months_shown: form.monthsShown,
    trailing_averages: [...form.trailing],
    show_amounts: form.showAmounts,
    ratios: form.ratios.map((r) => {
      const out: Record<string, unknown> = {
        label: r.label,
        numerator: operandToConfig(r.numerator),
        denominator: operandToConfig(r.denominator),
      }
      if (r.trailing !== undefined) out.trailing_averages = [...r.trailing]
      return { ...out, ...r.extra }
    }),
    ...form.extra,
  }
}

export function titleFromForm(form: RatioPageForm): string | undefined {
  return form.title.trim() === '' ? undefined : form.title
}

export type RatioFormVerdict =
  | { ok: true; config: Record<string, unknown>; titleOverride: string | undefined; parsed: RatioAnalysisConfig }
  | { ok: false; reason: string }

/**
 * The page's own rule, applied to what Apply would write. On success `config`
 * is the form's config, NOT parse's output: parse trims and fills defaults, and
 * writing that back would break the round-trip rule above.
 */
export function validateRatioForm(form: RatioPageForm): RatioFormVerdict {
  const config = configFromForm(form)
  const parsed = parseRatioAnalysisConfig(config)
  if (!parsed.ok) return { ok: false, reason: parsed.reason }
  return { ok: true, config, titleOverride: titleFromForm(form), parsed: parsed.config }
}

// ── Plain English ────────────────────────────────────────────────────────────

const MESSAGE_REWORDS: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^Too small: expected string to have >=1 characters$/, () => 'is blank'],
  [/^Too big: expected string to have <=(\d+) characters$/, (m) => `is longer than ${m[1]} characters`],
  [/^Too small: expected array to have >=1 items$/, () => 'needs at least one'],
  [/^Too big: expected array to have <=(\d+) items$/, (m) => `can have at most ${m[1]}`],
  [/^Too big: expected number to be <=(\d+)$/, (m) => `can be at most ${m[1]}`],
  [/^Too small: expected number to be >=(\d+)$/, (m) => `must be at least ${m[1]}`],
  [/^Unrecognized keys?: (.+)$/, (m) => `includes a setting this page does not recognise (${m[1]})`],
]

function describePath(path: string): string {
  if (path === '') return 'The settings'
  const parts = path.split('.')
  const words: string[] = []
  let inOperand = false
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]
    const next = parts[i + 1]
    if (p === 'ratios' && next !== undefined && /^\d+$/.test(next)) {
      words.push(`Ratio ${Number(next) + 1}`)
      i++
    } else if (p === 'ratios') words.push('Ratios')
    else if (p === 'numerator') { words.push('top line'); inOperand = true }
    else if (p === 'denominator') { words.push('bottom line'); inOperand = true }
    else if (p === 'label') words.push(inOperand ? 'display name' : 'name')
    else if (p === 'accounts' && next !== undefined && /^\d+$/.test(next)) {
      words.push(`account ${Number(next) + 1}`)
      i++
    } else if (p === 'trailing_averages') words.push(words.length ? 'averages' : 'Averages')
    else if (p === 'months_shown') words.push('Months shown')
    else if (p === 'show_amounts') words.push('Show the dollar amounts')
    else if (/^\d+$/.test(p)) words.push(`#${Number(p) + 1}`)
    else words.push(p)
  }
  return words.join(' — ')
}

/**
 * parseRatioAnalysisConfig's reason, reworded for a coach: "ratios.0.label: Too
 * small: expected string to have >=1 characters" → "Ratio 1 — name is blank".
 * Presentation only; an unrecognised message passes through as parse wrote it.
 */
export function describeReason(reason: string): string {
  return reason
    .split('; ')
    .map((issue) => {
      // Parse writes "path: message", or a bare message for the page itself.
      // Zod's own messages start with a capital ("Too small: …"), paths do not.
      const m = issue.match(/^([a-z_][A-Za-z0-9_.]*): (.+)$/)
      const path = m ? m[1] : ''
      const message = m ? m[2] : issue
      const rewrite = MESSAGE_REWORDS.find(([re]) => re.test(message))
      const said = rewrite ? rewrite[1](message.match(rewrite[0])!) : message
      return `${describePath(path)} ${said}`
    })
    .join('; ')
}

// ── Edits (immutable) ────────────────────────────────────────────────────────

function mapRatio(form: RatioPageForm, index: number, fn: (r: RatioForm) => RatioForm): RatioPageForm {
  return { ...form, ratios: form.ratios.map((r, i) => (i === index ? fn(r) : r)) }
}

export function updateRatio(form: RatioPageForm, index: number, patch: Partial<Omit<RatioForm, 'key'>>): RatioPageForm {
  return mapRatio(form, index, (r) => ({ ...r, ...patch }))
}

export function updateOperand(
  form: RatioPageForm,
  index: number,
  side: OperandSide,
  patch: Partial<OperandForm>,
): RatioPageForm {
  return mapRatio(form, index, (r) => ({ ...r, [side]: { ...r[side], ...patch } }))
}

/** Tick or untick one account in a line. A code already there is never duplicated. */
export function toggleAccount(form: RatioPageForm, index: number, side: OperandSide, code: string, on: boolean): RatioPageForm {
  return mapRatio(form, index, (r) => {
    const has = r[side].accounts.includes(code)
    if (on === has) return r
    const accounts = on ? [...r[side].accounts, code] : r[side].accounts.filter((c) => c !== code)
    return { ...r, [side]: { ...r[side], accounts } }
  })
}

export function addRatio(form: RatioPageForm): RatioPageForm {
  if (form.ratios.length >= MAX_RATIOS) return form
  return { ...form, ratios: [...form.ratios, blankRatio()] }
}

export function removeRatio(form: RatioPageForm, index: number): RatioPageForm {
  return { ...form, ratios: form.ratios.filter((_, i) => i !== index) }
}

export function moveRatio(form: RatioPageForm, index: number, delta: -1 | 1): RatioPageForm {
  const to = index + delta
  if (to < 0 || to >= form.ratios.length) return form
  const ratios = [...form.ratios]
  ;[ratios[index], ratios[to]] = [ratios[to], ratios[index]]
  return { ...form, ratios }
}

/**
 * Tick or untick one average in a list. Unticking removes only that window;
 * ticking inserts it before the first narrower window, so the widest-first
 * order the reference pack prints ([6, 3]) is what ticking produces — and a
 * stored order the coach did not touch is left exactly as it was.
 */
export function withAverage(list: readonly number[], window: number, on: boolean): number[] {
  if (!on) return list.filter((w) => w !== window)
  if (list.includes(window)) return [...list]
  const at = list.findIndex((w) => w < window)
  return at === -1 ? [...list, window] : [...list.slice(0, at), window, ...list.slice(at)]
}

export function setPageAverage(form: RatioPageForm, window: number, on: boolean): RatioPageForm {
  return { ...form, trailing: withAverage(form.trailing, window, on) }
}

/** "No averages for this ratio": [] when ticked, back to the page's averages when not. */
export function setRatioNoAverages(form: RatioPageForm, index: number, on: boolean): RatioPageForm {
  return mapRatio(form, index, (r) => ({ ...r, trailing: on ? [] : undefined }))
}

/** Windows in a list that have no checkbox — shown as kept, so a [9] is not a mystery. */
export function otherAverages(list: readonly number[] | undefined): number[] {
  return (list ?? []).filter((w) => !(STANDARD_AVERAGES as readonly number[]).includes(w))
}

/** Remove what the panel carried through but does not recognise — a deliberate act. */
export function withoutUnrecognised(form: RatioPageForm): RatioPageForm {
  const clean = (op: OperandForm): OperandForm => ({ ...op, extra: {} })
  return {
    ...form,
    extra: {},
    ratios: form.ratios.map((r) => ({ ...r, extra: {}, numerator: clean(r.numerator), denominator: clean(r.denominator) })),
  }
}

export function hasUnrecognised(form: RatioPageForm): boolean {
  const any = (o: Record<string, unknown>) => Object.keys(o).length > 0
  return any(form.extra) || form.ratios.some((r) => any(r.extra) || any(r.numerator.extra) || any(r.denominator.extra))
}

// ── Accounts ─────────────────────────────────────────────────────────────────

export const BUCKET_GROUPS: { bucket: LedgerAccount['bucket']; label: string }[] = [
  { bucket: 'income', label: 'Income' },
  { bucket: 'cost_of_sales', label: 'Cost of Sales' },
  { bucket: 'operating_expenses', label: 'Operating Expenses' },
  { bucket: null, label: 'Other income and expenses' },
]

/** Case-insensitive match on code or name, keeping the list's code order. */
export function filterAccounts(accounts: readonly LedgerAccount[], query: string): LedgerAccount[] {
  const q = query.trim().toLowerCase()
  if (q === '') return [...accounts]
  return accounts.filter((a) => a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q))
}

/** How many ratios a placed widget's stored config holds — for the canvas card. */
export function ratioCount(config: unknown): number {
  return isRecord(config) && Array.isArray(config.ratios) ? config.ratios.length : 0
}
