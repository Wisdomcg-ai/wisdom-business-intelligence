/**
 * Whether a pack carries the cashflow at all — asked BEFORE anything is loaded.
 *
 * The export used to build the cashflow for every client and print its pages
 * whenever the build produced months, so sections.cashflow was a switch that
 * switched nothing. IICT, Dragon Roofing and (before it was turned on) Distinct
 * Directions all had it off, and all three packs printed cashflow pages —
 * Dragon's overstating the bank by $735,661 (DRG-45, DRG-46, IICT-52, DD-34).
 *
 * The rule, one place for the page, the PDF and the preview harness:
 *
 *   a saved layout in force  → the cash pages print where the layout places them.
 *                              Placing one IS opting in, whatever the flag says
 *                              — the coach put the page there.
 *   the legacy page order    → the cash pages print only when sections.cashflow
 *                              is on.
 *
 * The three cash charts (runway, cumulative net cash, working-capital gap)
 * have their own flags and their own placements, and read the same cashflow;
 * a pack that shows one of them still needs the cashflow loaded, even with the
 * cash pages off. They are not cash PAGES, so they do not open the gate for
 * the table and its chart.
 *
 * Pure.
 */
import type { ReportSections } from '@/app/finances/monthly-report/types'
import type { PDFLayout, WidgetType } from '@/app/finances/monthly-report/types/pdf-layout'

/** The two cash pages: the table and its stacked-bar chart. */
export const CASHFLOW_PAGE_WIDGETS: readonly WidgetType[] = ['cashflow_forecast_table', 'chart_cashflow_forecast']

/** Charts drawn from the same cashflow, each behind its own flag. */
export const CASHFLOW_CHART_WIDGETS: readonly WidgetType[] = ['chart_cash_runway', 'chart_cumulative_net_cash', 'chart_working_capital_gap']

type Sections = Partial<ReportSections> | null | undefined
type Layout = Pick<PDFLayout, 'pages'> | null | undefined

/**
 * Whether the saved layout is the one the PDF renders — the same test
 * MonthlyReportPDFService.generate() makes: at least one page with a widget.
 */
export function layoutInForce(layout: Layout): boolean {
  return Array.isArray(layout?.pages) && layout!.pages.some((p) => Array.isArray(p.widgets) && p.widgets.length > 0)
}

function layoutPlacesAny(layout: Layout, types: readonly WidgetType[]): boolean {
  return (layout?.pages ?? []).some((p) => Array.isArray(p.widgets) && p.widgets.some((w) => types.includes(w.type)))
}

/** Whether the pack prints the cashflow table and chart (or the reason in their place). */
export function packPrintsCashflowPages(sections: Sections, layout: Layout): boolean {
  if (layoutInForce(layout)) return layoutPlacesAny(layout, CASHFLOW_PAGE_WIDGETS)
  return sections?.cashflow === true
}

/** Whether the export should build the cashflow at all: the pages, or a chart that reads it. */
export function packLoadsCashflow(sections: Sections, layout: Layout): boolean {
  if (packPrintsCashflowPages(sections, layout)) return true
  if (layoutInForce(layout)) return layoutPlacesAny(layout, CASHFLOW_CHART_WIDGETS)
  return sections?.chart_cash_runway === true
    || sections?.chart_cumulative_net_cash === true
    || sections?.chart_working_capital_gap === true
}
