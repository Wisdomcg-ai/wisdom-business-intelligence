/**
 * Applying a report template — pure, so the page (on load) and the preview
 * harness apply a client's default template identically.
 */
import { describe, it, expect } from 'vitest'
import { settingsFromTemplate, settingsWithDefaultTemplate } from '../template-settings'
import { DEFAULT_SECTIONS, type MonthlyReportSettings, type ReportTemplate } from '../../types'

const template = (over: Partial<ReportTemplate> = {}): ReportTemplate => ({
  id: 't1', business_id: 'b', name: 'Calxa pack', is_default: true,
  sections: { balance_sheet: true } as ReportTemplate['sections'],
  column_settings: { show_prior_year: false } as ReportTemplate['column_settings'],
  subscription_account_codes: ['63700'],
  ...over,
})

const settings = { business_id: 'b', pdf_layout: { pages: [{ widgets: [{ type: 'memo' }] }] }, contractor_account_codes: ['61400'] } as unknown as MonthlyReportSettings

describe('settingsFromTemplate', () => {
  it('fills sections and columns from the defaults', () => {
    const s = settingsFromTemplate(template())
    expect(s.sections).toEqual({ ...DEFAULT_SECTIONS, balance_sheet: true })
    expect(s.show_prior_year).toBe(false)
    expect(s.show_ytd).toBe(true)
    expect(s.wages_account_names).toEqual([])
    expect(s.budget_forecast_id).toBeNull()
  })

  it('touches the layout only when the template carries one (WC.3)', () => {
    expect('pdf_layout' in settingsFromTemplate(template())).toBe(false)
    const layout = { pages: [] } as unknown as ReportTemplate['pdf_layout']
    expect(settingsFromTemplate(template({ pdf_layout: layout })).pdf_layout).toBe(layout)
  })
})

describe('settingsWithDefaultTemplate', () => {
  it('lays the default template over the settings, keeping what templates do not manage', () => {
    const { settings: s, template: t } = settingsWithDefaultTemplate(settings, [template({ id: 'other', is_default: false }), template()])
    expect(t!.id).toBe('t1')
    expect(s.subscription_account_codes).toEqual(['63700'])
    expect((s as unknown as { contractor_account_codes: string[] }).contractor_account_codes).toEqual(['61400'])
    expect(s.pdf_layout).toBe(settings.pdf_layout)
  })

  it('leaves the settings alone with no default template', () => {
    expect(settingsWithDefaultTemplate(settings, [template({ is_default: false })])).toEqual({ settings, template: null })
  })
})
