/**
 * The forecast wizard used to rewrite 'no_sync' to 'verified'.
 *
 * Step 2 and Step 3 both did this when YTD actuals were present, reasoning that
 * telling a coach to "Connect Xero" while populated numbers sit on screen is
 * contradictory. The reasoning was sound; the premise was a bug. The sole
 * authenticated SELECT policy on sync_jobs compared the wrong id-space, so the
 * RLS-bound /api/Xero/pl-summary read returned zero rows for EVERY business and
 * every tenant resolved to 'no_sync' — which the suppression then turned green.
 *
 * Production state when this was found (16 Sep 2026), evaluating the tiers the
 * fixed policy will actually return: 13 tenants 'verified', 1 'failed', zero
 * 'no_sync'. So the suppression protected nothing real, and the one tenant it
 * did affect — Armstrong & Co, whose last sync failed on a Xero 403 — was being
 * shown to the coach as verified.
 *
 * These are static source assertions: the behaviour lives in two ~2,000-line
 * step components whose render path needs the whole wizard context, and the
 * failure mode that matters is textual — the rewrite creeping back in.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const STEPS = {
  'Step 2 (Prior Year)': 'src/app/finances/forecast/components/wizard-v4/steps/Step2PriorYear.tsx',
  'Step 3 (Revenue & COGS)': 'src/app/finances/forecast/components/wizard-v4/steps/Step3RevenueCOGS.tsx',
} as const

/** Source with `//` and `{/* … *\/}` comments stripped — the header of each
 *  banner block legitimately describes the removed suppression as prose. */
function executableSource(relPath: string): string {
  return readFileSync(resolve(process.cwd(), relPath), 'utf8')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n')
}

describe.each(Object.entries(STEPS))('%s', (_name, relPath) => {
  it("no longer rewrites a quality tier to 'verified'", () => {
    const src = executableSource(relPath)
    expect(
      /\?\s*'verified'/.test(src) || /:\s*'verified'\s*\}/.test(src),
      "a tier must be shown as measured — mapping it to 'verified' asserts a clean bill of health nobody checked",
    ).toBe(false)
  })

  it("does not special-case 'no_sync' before handing it to the banner", () => {
    const src = executableSource(relPath)
    expect(/dataQuality\s*===\s*'no_sync'/.test(src)).toBe(false)
  })

  it('passes the tier through to the banner untouched', () => {
    expect(executableSource(relPath)).toMatch(/quality=\{dataQuality\}/)
  })

  it('tells the banner when the check itself could not be run', () => {
    // Without this the step's seeded 'verified' renders as a clean bill of
    // health whenever the fetch fails — the PRES-07/08 fail-open, again.
    expect(executableSource(relPath)).toMatch(/checkFailed=\{/)
  })

  it('seeds the check-failed flag to false and flips it on a bad response', () => {
    const src = executableSource(relPath)
    expect(src).toMatch(/const \[qualityCheckFailed, setQualityCheckFailed\] = useState\(false\)/)
    // At minimum: the catch path, the non-2xx path, and the server's own flag.
    expect(src.match(/setQualityCheckFailed\(/g)?.length ?? 0).toBeGreaterThanOrEqual(3)
  })

  it('honours the server-side flag rather than inferring one', () => {
    expect(executableSource(relPath)).toMatch(/quality_check_failed/)
  })
})
