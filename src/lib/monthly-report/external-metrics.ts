/**
 * WE.1 — external metrics: validation and tie-out for the one model behind
 * every hand-built insert (Hubstaff, HubSpot, Lumary, PMI inputs…).
 *
 * A series declares its shape once — dimension, measures, and the Xero account
 * its dollars must tie to. Values arrive through ONE write path with three
 * callers (the entry UI, CSV paste, and the client skills that already pull
 * these numbers monthly), all hitting the same validation here. Typed values
 * are what make the EXT-TIES check possible at all; a freeform grid would be
 * Google Sheets with extra steps.
 *
 * Pure functions — the route is a thin IO wrapper.
 */

export interface SeriesMeasure {
  key: string
  label: string
  /** 'currency' | 'number' | 'percent' | 'hours' — display only. */
  format?: string
}

export interface SeriesDefinition {
  series_key: string
  display_name: string
  dimension_label: string
  measures: SeriesMeasure[]
  reconciles_to_account_name?: string | null
  reconcile_measure_key?: string | null
  reconcile_tolerance?: number
}

export interface IncomingValue {
  dimension_value: string
  measure_key: string
  scenario: 'actual' | 'budget'
  value: number
}

export interface ValueValidation {
  valid: IncomingValue[]
  rejected: Array<{ row: unknown; reason: string }>
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

export function isValidPeriodMonth(month: unknown): month is string {
  return typeof month === 'string' && MONTH_RE.test(month)
}

/**
 * Validate a batch of incoming values against the series definition. Rejects
 * are named, never silent — a skill POSTing a typo'd measure key must hear
 * about it, not have the row vanish.
 */
export function validateValues(
  series: Pick<SeriesDefinition, 'measures'>,
  rows: unknown[],
): ValueValidation {
  const measureKeys = new Set(series.measures.map((m) => m.key))
  const valid: IncomingValue[] = []
  const rejected: ValueValidation['rejected'] = []

  for (const row of rows) {
    const r = row as Partial<IncomingValue> | null
    if (!r || typeof r !== 'object') {
      rejected.push({ row, reason: 'not an object' })
      continue
    }
    if (typeof r.dimension_value !== 'string' || r.dimension_value.trim() === '') {
      rejected.push({ row, reason: 'dimension_value missing' })
      continue
    }
    if (typeof r.measure_key !== 'string' || !measureKeys.has(r.measure_key)) {
      rejected.push({
        row,
        reason: `unknown measure_key '${String(r.measure_key)}' (series has: ${[...measureKeys].join(', ')})`,
      })
      continue
    }
    const scenario = r.scenario ?? 'actual'
    if (scenario !== 'actual' && scenario !== 'budget') {
      rejected.push({ row, reason: `scenario must be 'actual' or 'budget', got '${String(r.scenario)}'` })
      continue
    }
    if (typeof r.value !== 'number' || !Number.isFinite(r.value)) {
      rejected.push({ row, reason: 'value must be a finite number' })
      continue
    }
    valid.push({
      dimension_value: r.dimension_value.trim(),
      measure_key: r.measure_key,
      scenario,
      value: r.value,
    })
  }

  return { valid, rejected }
}

export interface ExternalTie {
  /** Σ of the reconcile measure's ACTUAL values for the month. */
  series_total: number
  /** The Xero account's actual for the month. */
  account_actual: number
  account_name: string
  delta: number
  within_tolerance: boolean
  /** False when either side is empty — render nothing, never a fake tick. */
  comparable: boolean
}

/**
 * EXT-TIES (warning-only, same three-state contract as PAY-TIES): the series'
 * reconcile-measure total vs the declared Xero account. Both sides empty or
 * either side zero → not comparable; the banner renders nothing.
 */
export function computeExternalTie(args: {
  seriesTotal: number
  accountActual: number
  accountName: string
  tolerance?: number
}): ExternalTie {
  const tolerance = args.tolerance ?? 1
  const delta = Math.round((args.accountActual - args.seriesTotal) * 100) / 100
  return {
    series_total: Math.round(args.seriesTotal * 100) / 100,
    account_actual: Math.round(args.accountActual * 100) / 100,
    account_name: args.accountName,
    delta,
    within_tolerance: Math.abs(delta) <= tolerance,
    comparable: args.seriesTotal !== 0 && args.accountActual !== 0,
  }
}

/** Sum the reconcile measure's actuals from stored value rows. */
export function sumReconcileMeasure(
  rows: ReadonlyArray<{ measure_key: string; scenario: string; value: number | string }>,
  reconcileMeasureKey: string,
): number {
  return rows
    .filter((r) => r.measure_key === reconcileMeasureKey && r.scenario === 'actual')
    .reduce((s, r) => s + Number(r.value ?? 0), 0)
}
