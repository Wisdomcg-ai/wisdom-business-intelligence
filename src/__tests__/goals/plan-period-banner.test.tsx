import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PlanPeriodBanner } from '@/app/goals/components/PlanPeriodBanner'
import { PlanPeriodAdjustModal } from '@/app/goals/components/PlanPeriodAdjustModal'

describe('PlanPeriodBanner', () => {
  const defaultProps = {
    planStartDate: new Date(2026, 3, 1), // 2026-04-01
    planEndDate: new Date(2029, 5, 30), // 2029-06-30
    year1EndDate: new Date(2027, 5, 30), // 2027-06-30
    rationale:
      "You're within 2 months of your FY end. Year 1 spans the rest of this year plus the full next year (14 months total).",
    year1Months: 14,
    onAdjust: vi.fn(),
  }

  it('renders the formatted date range and Year 1 month count for an extended plan', () => {
    render(<PlanPeriodBanner {...defaultProps} />)
    // Banner shows "Apr 2026 → Jun 2029 · Year 1 is 14 months" — assert each piece
    // is present (the literal string includes the arrow which jsdom renders fine).
    expect(screen.getByText(/Apr 2026/)).toBeInTheDocument()
    expect(screen.getByText(/Jun 2029/)).toBeInTheDocument()
    expect(screen.getByText(/Year 1 is 14 months/)).toBeInTheDocument()
  })

  it('renders the rationale text', () => {
    render(<PlanPeriodBanner {...defaultProps} />)
    expect(screen.getByText(/within 2 months/)).toBeInTheDocument()
  })

  it('fires onAdjust when the Adjust button is clicked', () => {
    const onAdjust = vi.fn()
    render(<PlanPeriodBanner {...defaultProps} onAdjust={onAdjust} />)
    fireEvent.click(screen.getByRole('button', { name: /adjust/i }))
    expect(onAdjust).toHaveBeenCalledTimes(1)
  })

  it('renders standard period correctly (Year 1 is 12 months)', () => {
    render(
      <PlanPeriodBanner
        {...defaultProps}
        planStartDate={new Date(2026, 6, 1)} // 2026-07-01
        year1EndDate={new Date(2027, 5, 30)}
        year1Months={12}
      />
    )
    expect(screen.getByText(/Year 1 is 12 months/)).toBeInTheDocument()
    // Standard plan starts in Jul (FY)
    expect(screen.getByText(/Jul 2026/)).toBeInTheDocument()
  })

  it('renders the "Your Plan Period" header', () => {
    render(<PlanPeriodBanner {...defaultProps} />)
    expect(screen.getByText(/Your Plan Period/i)).toBeInTheDocument()
  })
})

describe('PlanPeriodAdjustModal', () => {
  const defaultProps = {
    initialPlanStart: new Date(2026, 3, 1), // 2026-04-01
    initialPlanEnd: new Date(2029, 5, 30), // 2029-06-30
    initialYear1End: new Date(2027, 5, 30), // 2027-06-30
    fiscalYearStart: 7,
    onClose: vi.fn(),
    onSave: vi.fn(),
  }

  it('renders three date inputs initialised from props', () => {
    render(<PlanPeriodAdjustModal {...defaultProps} />)
    // Three labels should be in the DOM
    expect(screen.getByText(/Plan start date/i)).toBeInTheDocument()
    expect(screen.getByText(/Year 1 end date/i)).toBeInTheDocument()
    expect(screen.getByText(/Year 3 end date/i)).toBeInTheDocument()
    // Initial values come through as ISO yyyy-mm-dd strings (UTC env).
    // Use querySelectorAll to grab the three date inputs by type.
    const inputs = document.querySelectorAll('input[type="date"]')
    expect(inputs.length).toBe(3)
    expect((inputs[0] as HTMLInputElement).value).toBe('2026-04-01')
    expect((inputs[1] as HTMLInputElement).value).toBe('2027-06-30')
    expect((inputs[2] as HTMLInputElement).value).toBe('2029-06-30')
  })

  it('shows in-range Year 1 months count by default (15 months for Apr 2026 → Jun 2027)', () => {
    render(<PlanPeriodAdjustModal {...defaultProps} />)
    // monthDiffInclusive(Apr 2026, Jun 2027) = (2027-2026)*12 + (5-3) + 1 = 15
    expect(screen.getByText(/Year 1 is 15 months/i)).toBeInTheDocument()
  })

  it('shows validation error and disables Save when Year 1 length goes outside [12, 15]', () => {
    render(<PlanPeriodAdjustModal {...defaultProps} />)
    const inputs = document.querySelectorAll('input[type="date"]')
    const year1Input = inputs[1] as HTMLInputElement
    // Push year1End to 2028-01-31 — way out of range (year1Months becomes ~22)
    fireEvent.change(year1Input, { target: { value: '2028-01-31' } })
    expect(screen.getByText(/must be between 12 and 15 months/i)).toBeInTheDocument()
    const saveBtn = screen.getByRole('button', { name: /^save$/i })
    expect(saveBtn).toBeDisabled()
  })

  it('does NOT call onSave when Save is clicked while out of range', () => {
    const onSave = vi.fn()
    render(<PlanPeriodAdjustModal {...defaultProps} onSave={onSave} />)
    const inputs = document.querySelectorAll('input[type="date"]')
    fireEvent.change(inputs[1], { target: { value: '2028-01-31' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    expect(onSave).not.toHaveBeenCalled()
  })

  it('fires onSave with current dates when Save is clicked in valid range', () => {
    const onSave = vi.fn()
    render(<PlanPeriodAdjustModal {...defaultProps} onSave={onSave} />)
    const saveBtn = screen.getByRole('button', { name: /^save$/i })
    expect(saveBtn).not.toBeDisabled()
    fireEvent.click(saveBtn)
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith({
      planStartDate: defaultProps.initialPlanStart,
      planEndDate: defaultProps.initialPlanEnd,
      year1EndDate: defaultProps.initialYear1End,
    })
  })

  it('fires onClose when Cancel is clicked', () => {
    const onClose = vi.fn()
    render(<PlanPeriodAdjustModal {...defaultProps} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Reset to suggestion overwrites date inputs without throwing', () => {
    render(<PlanPeriodAdjustModal {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /reset to suggestion/i }))
    // The modal still renders Save button after reset (sanity check)
    expect(screen.getByRole('button', { name: /^save$/i })).toBeInTheDocument()
  })

  it('renders the "current remainder" warning note', () => {
    render(<PlanPeriodAdjustModal {...defaultProps} />)
    expect(screen.getByText(/current remainder/i)).toBeInTheDocument()
  })
})
