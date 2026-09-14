/**
 * What applying a report template does to the settings — pure, so the page's
 * hook and scripts/preview-pack.ts apply a client's default template the same
 * way (the page applies it on load, before any export).
 */
import type { MonthlyReportSettings, ReportTemplate } from '../types'
import { DEFAULT_SECTIONS } from '../types'

export function settingsFromTemplate(template: ReportTemplate): Partial<MonthlyReportSettings> {
  return {
    sections: { ...DEFAULT_SECTIONS, ...template.sections },
    show_prior_year: template.column_settings?.show_prior_year ?? true,
    show_ytd: template.column_settings?.show_ytd ?? true,
    show_unspent_budget: template.column_settings?.show_unspent_budget ?? true,
    show_budget_next_month: template.column_settings?.show_budget_next_month ?? true,
    show_budget_annual_total: template.column_settings?.show_budget_annual_total ?? true,
    budget_forecast_id: template.budget_forecast_id ?? null,
    subscription_account_codes: template.subscription_account_codes ?? [],
    wages_account_names: template.wages_account_names ?? [],
    // WC.3 — only templates that CARRY a layout overwrite the business's
    // layout; a null/absent pdf_layout leaves the existing one untouched
    // (pre-WC.3 templates keep exactly their old behaviour).
    ...(template.pdf_layout ? { pdf_layout: template.pdf_layout } : {}),
  }
}

/** The page's on-load step: the default template, if there is one, over the stored settings. */
export function settingsWithDefaultTemplate(
  settings: MonthlyReportSettings,
  templates: ReportTemplate[],
): { settings: MonthlyReportSettings; template: ReportTemplate | null } {
  const template = templates.find((t) => t.is_default) ?? null
  return template ? { settings: { ...settings, ...settingsFromTemplate(template) }, template } : { settings, template }
}
