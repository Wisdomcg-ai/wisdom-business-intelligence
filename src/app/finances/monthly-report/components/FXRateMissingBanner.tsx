'use client'

/**
 * FXRateMissingBanner — amber warning rendered above the consolidated tables
 * when any non-AUD member's reporting month lacks an `fx_rates` entry.
 *
 * Contract (see plan 34-00e):
 * - Color: amber (bg-amber-50 / border-amber-200 / text-amber-800) — this is a
 *   recoverable warning, not an error. Red is reserved for unrecoverable errors
 *   (auth denied, engine crash). PATTERNS.md § FX Banner confirms the convention.
 * - Layout: group missing periods by currency_pair for readability — a single
 *   foreign member typically lacks a handful of recent months, and showing
 *   "HKD/AUD: 2026-03, 2026-04, 2026-05 — values shown untranslated" reads
 *   better than one line per month.
 * - CTA: "Enter FX rate →" button hands off to the caller's navigation (the
 *   monthly report page routes to `/admin/consolidation` via plan 00f).
 *
 * Silent 1:1 fallback is forbidden by design (RESEARCH.md § FX Pitfall 3).
 * Untranslated HKD values remain visible in their column; the banner tells
 * the user why they look "off".
 */

interface Props {
  missingRates: Array<{ currency_pair: string; period: string }>
  onAddRate?: () => void
}

export default function FXRateMissingBanner({ missingRates, onAddRate }: Props) {
  if (missingRates.length === 0) return null

  // Group by currency_pair so each pair gets one line listing its missing
  // periods, sorted chronologically.
  const byPair = new Map<string, string[]>()
  for (const r of missingRates) {
    const arr = byPair.get(r.currency_pair) ?? []
    arr.push(r.period)
    byPair.set(r.currency_pair, arr)
  }

  return (
    <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
      <p className="text-sm font-semibold text-amber-900">
        FX rate missing — translation incomplete
      </p>
      <ul className="mt-2 text-sm text-amber-800 space-y-1">
        {Array.from(byPair.entries()).map(([pair, months]) => (
          <li key={pair}>
            <strong>{pair}</strong>: {months.sort().join(', ')} — values shown
            untranslated. Add the rate to complete consolidation.
          </li>
        ))}
      </ul>
      {onAddRate && (
        <button
          onClick={onAddRate}
          className="mt-3 inline-flex items-center text-sm font-medium text-amber-900 underline hover:text-amber-950"
        >
          Enter FX rate →
        </button>
      )}
    </div>
  )
}
