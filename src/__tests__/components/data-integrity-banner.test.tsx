/**
 * Phase 44.2 Plan 44.2-09 — DataIntegrityBanner + DetailDrawer tests.
 *
 * 7 component-level tests cover render rules per quality enum + the drawer
 * open/close behavior. The mount-site smoke tests are deferred to a
 * follow-up — the parent wizard/dashboard components are 1000+ lines each
 * and require heavy mocking that adds little signal beyond the tsc-clean
 * + grep verification of `<DataIntegrityBanner` references.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DataIntegrityBanner } from '@/components/data-integrity/DataIntegrityBanner'
import type { PerTenantQuality } from '@/lib/services/forecast-read-service'

const NO_TENANTS: PerTenantQuality[] = []
const ONE_TENANT_PARTIAL: PerTenantQuality[] = [
  {
    tenant_id: 'tenant-A',
    data_quality: 'partial',
    last_sync_at: '2026-05-02T00:00:00Z',
    last_sync_status: 'partial',
    discrepancy_count: 3,
  },
]

describe('DataIntegrityBanner', () => {
  it("renders nothing when quality is 'verified'", () => {
    const { container } = render(
      <DataIntegrityBanner quality="verified" perTenantQuality={NO_TENANTS} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it("renders amber 'Data verification in progress' headline when quality is 'partial'", () => {
    render(
      <DataIntegrityBanner
        quality="partial"
        perTenantQuality={ONE_TENANT_PARTIAL}
        lastSyncAt={ONE_TENANT_PARTIAL[0]!.last_sync_at}
      />,
    )
    expect(screen.getByText('Data verification in progress')).toBeInTheDocument()
    const alert = screen.getByRole('alert')
    expect(alert.className).toMatch(/bg-amber-50/)
    expect(alert.dataset.quality).toBe('partial')
  })

  it("renders red banner with 'Last Xero sync failed' when quality is 'failed'", () => {
    render(
      <DataIntegrityBanner
        quality="failed"
        perTenantQuality={NO_TENANTS}
        lastSyncAt="2026-05-02T00:00:00Z"
      />,
    )
    expect(screen.getByText('Last Xero sync failed')).toBeInTheDocument()
    const alert = screen.getByRole('alert')
    expect(alert.className).toMatch(/bg-red-50/)
  })

  it("renders slate banner with 'Xero not yet synced' when quality is 'no_sync'", () => {
    render(<DataIntegrityBanner quality="no_sync" perTenantQuality={NO_TENANTS} />)
    expect(screen.getByText('Xero not yet synced for this business')).toBeInTheDocument()
    const alert = screen.getByRole('alert')
    expect(alert.className).toMatch(/bg-slate-50/)
  })

  it("renders yellow stale banner when quality is 'stale'", () => {
    render(
      <DataIntegrityBanner
        quality="stale"
        perTenantQuality={NO_TENANTS}
        lastSyncAt={new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString()}
      />,
    )
    const alert = screen.getByRole('alert')
    expect(alert.className).toMatch(/bg-yellow-50/)
    expect(screen.getByText(/Xero data hasn't refreshed/)).toBeInTheDocument()
  })

  it("opens the detail drawer when 'View detail' is clicked on a partial banner", () => {
    render(
      <DataIntegrityBanner
        quality="partial"
        perTenantQuality={ONE_TENANT_PARTIAL}
        lastSyncAt={ONE_TENANT_PARTIAL[0]!.last_sync_at}
      />,
    )
    // Drawer initially closed.
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByText('View detail'))
    // Drawer opens; per-tenant row visible.
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(dialog.textContent).toContain('tenant-A')
    expect(dialog.textContent).toContain('Discrepant accounts: 3')
  })

  it("calls onResync when 'Re-sync now' is clicked on a failed banner", () => {
    const onResync = vi.fn()
    render(
      <DataIntegrityBanner
        quality="failed"
        perTenantQuality={NO_TENANTS}
        lastSyncAt="2026-05-02T00:00:00Z"
        onResync={onResync}
      />,
    )
    fireEvent.click(screen.getByText('Re-sync now'))
    expect(onResync).toHaveBeenCalledTimes(1)
  })
})
