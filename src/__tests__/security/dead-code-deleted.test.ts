/**
 * Phase 46 Plan 46-01 — regression tests for SEC-01 + SEC-06.
 *
 * Asserts that deleted dead-code files do not return, and that the
 * commented-out onboarding gate stays out of middleware.ts.
 *
 * If any assertion fails, the deletion has been reverted by mistake.
 */

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const repoRoot = path.resolve(__dirname, '../../..')

describe('SEC-01: dead /api/migrate routes stay deleted', () => {
  it('src/app/api/migrate/route.ts does not exist', () => {
    expect(fs.existsSync(path.join(repoRoot, 'src/app/api/migrate/route.ts'))).toBe(false)
  })

  it('src/app/api/migrate/opex-fields/route.ts does not exist', () => {
    expect(fs.existsSync(path.join(repoRoot, 'src/app/api/migrate/opex-fields/route.ts'))).toBe(false)
  })

  it('src/app/api/migrate/ directory does not exist', () => {
    expect(fs.existsSync(path.join(repoRoot, 'src/app/api/migrate'))).toBe(false)
  })
})

describe('SEC-06: dead onboarding-gate branch stays deleted from middleware', () => {
  const middleware = fs.readFileSync(path.join(repoRoot, 'src/middleware.ts'), 'utf8')

  it('does not contain "TEMPORARILY DISABLED" sentinel', () => {
    expect(middleware).not.toMatch(/TEMPORARILY DISABLED/)
  })

  it('does not contain "TODO: Re-enable" sentinel', () => {
    expect(middleware).not.toMatch(/TODO: Re-enable/)
  })

  it('does not contain "onboarding checks disabled" sentinel', () => {
    expect(middleware).not.toMatch(/onboarding checks disabled/)
  })

  it('PRESERVES coach/super_admin role bypass (system_roles lookup)', () => {
    // Regression: SEC-06 deletion must NOT remove the role bypass.
    expect(middleware).toMatch(/system_roles/)
    expect(middleware).toMatch(/coach.*super_admin|super_admin.*coach/s)
  })
})

describe('SEC-07 prep: unused src/lib/utils/logger.ts stays deleted', () => {
  it('src/lib/utils/logger.ts does not exist', () => {
    expect(fs.existsSync(path.join(repoRoot, 'src/lib/utils/logger.ts'))).toBe(false)
  })

  it('PRESERVES src/app/finances/forecast/utils/logger.ts (different file, in active use)', () => {
    expect(fs.existsSync(path.join(repoRoot, 'src/app/finances/forecast/utils/logger.ts'))).toBe(true)
  })
})
