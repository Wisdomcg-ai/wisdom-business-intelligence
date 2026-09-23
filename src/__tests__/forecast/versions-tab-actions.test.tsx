/**
 * Versions tab: viewing a version and making it active are two different
 * actions with two different labels.
 */
import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import VersionsTab from '@/app/finances/forecast/components/VersionsTab'
import type { FinancialForecast } from '@/app/finances/forecast/types'

const version = (over: Partial<FinancialForecast>): FinancialForecast => ({
  id: 'v', name: 'V', fiscal_year: 2027, is_active: false, is_completed: true, version_number: 1,
  created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-07T00:00:00Z',
  ...over,
} as unknown as FinancialForecast)

const ACTIVE = version({ id: 'a', name: 'FY2027 Forecast (from Xero budget)', is_active: true })
const OTHER = version({ id: 'b', name: 'FY2027 Forecast (Sep 2026)', is_active: false })

describe('VersionsTab actions', () => {
  it('offers "View this version" on non-current versions and "Set as active" only on non-active ones', () => {
    const onSelectVersion = vi.fn()
    const onSetActive = vi.fn(async () => {})
    render(
      <VersionsTab versions={[ACTIVE, OTHER]} currentVersion={ACTIVE} onSelectVersion={onSelectVersion} onSetActive={onSetActive} onSaveAsNew={vi.fn()} onOverwrite={vi.fn()} />,
    )
    expect(screen.queryByText(/Switch to this version/)).toBeNull()
    expect(screen.getAllByRole('button', { name: /View this version/ })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: /Set as active/ })).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: /View this version/ }))
    expect(onSelectVersion).toHaveBeenCalledWith(OTHER)
    expect(onSetActive).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /Set as active/ }))
    expect(onSetActive).toHaveBeenCalledWith(OTHER)
  })

  it('shows "Activating…" while the activation is in flight', async () => {
    let release: () => void = () => {}
    const onSetActive = vi.fn(() => new Promise<void>((r) => { release = r }))
    render(
      <VersionsTab versions={[ACTIVE, OTHER]} currentVersion={ACTIVE} onSelectVersion={vi.fn()} onSetActive={onSetActive} onSaveAsNew={vi.fn()} onOverwrite={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Set as active/ }))
    expect(await screen.findByRole('button', { name: /Activating/ })).toBeDisabled()
    release()
    await waitFor(() => expect(screen.getByRole('button', { name: /Set as active/ })).toBeEnabled())
  })

  it('without an onSetActive handler there is no activate button, and the active version never shows one', () => {
    render(
      <VersionsTab versions={[ACTIVE, OTHER]} currentVersion={OTHER} onSelectVersion={vi.fn()} onSaveAsNew={vi.fn()} onOverwrite={vi.fn()} />,
    )
    expect(screen.queryByRole('button', { name: /Set as active/ })).toBeNull()
    // Viewing OTHER: the active version is the non-current one → it gets "View this version".
    expect(screen.getAllByRole('button', { name: /View this version/ })).toHaveLength(1)
  })

  it('a locked version cannot be set active', () => {
    const locked = version({ id: 'c', name: 'Locked FY27', is_active: false, is_locked: true })
    render(
      <VersionsTab versions={[ACTIVE, locked]} currentVersion={ACTIVE} onSelectVersion={vi.fn()} onSetActive={vi.fn(async () => {})} onSaveAsNew={vi.fn()} onOverwrite={vi.fn()} />,
    )
    expect(screen.queryByRole('button', { name: /Set as active/ })).toBeNull()
  })
})
