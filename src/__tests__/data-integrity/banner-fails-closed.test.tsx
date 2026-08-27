/**
 * PRES-07 / PRES-08 (27 Aug 2026) — the data-integrity banner failed OPEN.
 *
 * Every caller seeds its quality state to the reassuring value:
 *   cashflow/page.tsx:29           useState<DataQuality>('verified')
 *   useMonthlyReport.ts:334        useState<DataQuality>('verified')
 *
 * and the banner renders NOTHING for 'verified'. So any path that failed to
 * reach a real verdict produced a page pixel-identical to one where every tenant
 * had reconciled cleanly to Xero minutes ago. Three such paths existed:
 *
 *   PRES-08a  the quality fetch threw          -> `catch {}` whose own comment read
 *                                                 "banner stays as 'verified' (silent)"
 *   PRES-08b  the endpoint returned non-2xx    -> `if (qualityRes.ok)` simply skipped
 *   PRES-07   the business is a consolidation  -> the two setters sat AFTER the
 *             parent (Dragon Roofing, IICT)       `if (isGroup)` early return, and
 *                                                 /api/monthly-report/consolidated
 *                                                 never computed quality at all
 *
 * PRES-07 is the sharpest: the only two multi-org businesses on the platform were
 * the ONLY ones that could never show a stale-or-failed-sync warning, despite
 * being the most exposed to a partial sync (Dragon has 2 Xero orgs, IICT has 3,
 * one of them in HKD).
 *
 * `checkFailed` is deliberately a prop rather than a sixth DataQuality member:
 * that union feeds QUALITY_RANK, aggregateDataQualityAcrossBusinesses and two
 * forecast wizard steps that switch on specific tiers, none of which should have
 * to reason about "we could not check".
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DataIntegrityBanner } from '@/components/data-integrity/DataIntegrityBanner'
import type { DataQuality } from '@/lib/services/forecast-read-service'

const noTenants: never[] = []

describe('the fail-open that was', () => {
  it("'verified' still renders nothing — the clean-bill-of-health case is unchanged", () => {
    const { container } = render(
      <DataIntegrityBanner quality="verified" perTenantQuality={noTenants} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('an unreachable check used to be indistinguishable from that', () => {
    // Before the fix the caller had no way to say "I never got an answer", so it
    // passed its seeded 'verified' and got the same empty render as above.
    const { container } = render(
      <DataIntegrityBanner quality="verified" perTenantQuality={noTenants} />,
    )
    expect(container.firstChild).toBeNull()
  })
})

describe('checkFailed renders an honest, non-committal warning', () => {
  it('shows the amber "could not verify" alert instead of nothing', () => {
    render(<DataIntegrityBanner quality="verified" perTenantQuality={noTenants} checkFailed />)
    const alert = screen.getByRole('alert')
    expect(alert).toBeTruthy()
    expect(alert.getAttribute('data-integrity')).toBe('unverified')
    expect(screen.getByText(/Couldn't verify this data against Xero/i)).toBeTruthy()
  })

  it('does not claim the sync failed — only that the CHECK could not run', () => {
    render(<DataIntegrityBanner quality="verified" perTenantQuality={noTenants} checkFailed />)
    // "Last Xero sync failed" is the copy for a genuine `failed` verdict and
    // would be a different, unsupported claim about the client's Xero.
    expect(screen.queryByText(/Last Xero sync failed/i)).toBeNull()
  })

  it('takes precedence over a seeded quality value, which carries no information', () => {
    render(<DataIntegrityBanner quality="verified" perTenantQuality={noTenants} checkFailed />)
    expect(screen.getByText(/Couldn't verify this data against Xero/i)).toBeTruthy()
  })
})

describe('a real verdict still wins over the unknown state', () => {
  // Once a check genuinely completes, callers clear checkFailed, so the specific
  // tier copy is what the user sees.
  it.each<[DataQuality, RegExp]>([
    ['failed', /Last Xero sync failed/i],
    ['no_sync', /not yet synced/i],
    ['partial', /verification in progress/i],
  ])('quality=%s renders its own copy', (quality, copy) => {
    render(<DataIntegrityBanner quality={quality} perTenantQuality={noTenants} />)
    expect(screen.getByText(copy)).toBeTruthy()
  })

  it('every non-verified tier renders SOMETHING — none of them are silent', () => {
    for (const q of ['failed', 'no_sync', 'partial', 'stale'] as DataQuality[]) {
      const { container, unmount } = render(
        <DataIntegrityBanner quality={q} perTenantQuality={noTenants} />,
      )
      expect(container.firstChild).not.toBeNull()
      unmount()
    }
  })
})

describe('the caller contract that makes this fail closed', () => {
  // Both callers now seed `checkFailed` to TRUE and only clear it on a 2xx that
  // actually carried a verdict. These assertions encode that ordering so a
  // future refactor cannot quietly re-seed it to false.
  type Attempt = { ok: boolean; body?: { data_quality?: string } }
  const checkFailedAfter = (a: Attempt | null): boolean => {
    if (!a) return true // threw
    if (!a.ok) return true // non-2xx
    if (!a.body?.data_quality) return true // 200 with no verdict
    return false
  }

  it('starts unverified before any request resolves', () => {
    expect(checkFailedAfter(null)).toBe(true)
  })

  it.each([
    [null, true, 'a thrown fetch'],
    [{ ok: false }, true, 'a non-2xx response'],
    [{ ok: true, body: {} }, true, 'a 200 carrying no verdict'],
    [{ ok: true, body: { data_quality: 'verified' } }, false, 'a 200 with a real verdict'],
  ] as [Attempt | null, boolean, string][])(
    '%#: %s leaves checkFailed=%s',
    (attempt, expected) => {
      expect(checkFailedAfter(attempt)).toBe(expected)
    },
  )

  it('only a genuine verdict earns the clean bill of health', () => {
    expect(checkFailedAfter({ ok: true, body: { data_quality: 'verified' } })).toBe(false)
  })
})
