/**
 * The Full Year tab prints the months the pack prints. For a client on the
 * budget store the pack's unclosed months are the approved budget; the tab kept
 * the wizard forecast, so Urban Road's September wages read 76,182 on the page
 * Matt reviews and 42,015 on the page the client receives.
 */
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import FullYearProjectionTable from '../FullYearProjectionTable'
import { urbanRoadFullYear, urbanRoadOnForecast } from '../../utils/__tests__/fixtures/urban-road-fy'
import type { FullYearReport } from '../../types'

/** The cells of the row whose label is `label`, label first. */
function row(container: HTMLElement, label: string): string[] {
  const tr = Array.from(container.querySelectorAll('tbody tr'))
    .find((r) => r.querySelector('td')?.textContent === label)
  expect(tr, `"${label}" row`).toBeTruthy()
  return Array.from(tr!.querySelectorAll('td')).map((td) => td.textContent ?? '')
}

describe('FullYearProjectionTable — the pack basis', () => {
  it('fills the unclosed months and Projected from the approved budget, as the pack does', () => {
    const { container } = render(<FullYearProjectionTable report={urbanRoadFullYear()} budgetSource="budget_version" />)
    const wages = row(container, 'Employ - Wages & Salaries')
    expect(wages.slice(3, 5)).toEqual(['$42,015', '$42,015'])
    expect(wages[13]).toBe('$564,223')
    expect(row(container, 'Contractors excl. Artists')[13]).toBe('$358,562')
    expect(row(container, 'Net Profit')[13]).toBe('$520,152')
    expect(container.textContent).toContain('Var vs Budget ($)')
    expect(container.textContent).not.toContain('Var vs Fcst')
  })

  it('prints the Operating Profit row the pack prints', () => {
    const { container } = render(<FullYearProjectionTable report={urbanRoadFullYear()} budgetSource="budget_version" />)
    expect(row(container, 'Operating Profit')[13]).toBe('$519,983')
  })

  it('keeps the forecast for a client on the forecast', () => {
    const { container } = render(<FullYearProjectionTable report={urbanRoadOnForecast()} />)
    expect(row(container, 'Employ - Wages & Salaries')[3]).toBe('$76,182')
  })

  it('does not call Projected "actuals to date" when the approved budget fills it and there is no forecast', () => {
    const fy: FullYearReport = { ...urbanRoadFullYear(), forecast_available: false }
    const { container } = render(<FullYearProjectionTable report={fy} budgetSource="budget_version" />)
    expect(container.textContent).not.toContain('Projected is actuals to date')
    expect(container.textContent).toContain('the months and Projected follow the approved budget')
    expect(row(container, 'Employ - Wages & Salaries')[3]).toBe('$42,015')
  })
})
