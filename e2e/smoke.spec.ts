import { test, expect } from '@playwright/test'

/**
 * Smoke tests — prove the Playwright infrastructure works and the app
 * builds/serves without crashing. Zero external dependencies (no DB seed,
 * no auth). These are the tests that run in CI as a baseline.
 */
test.describe('smoke', () => {
  test('homepage loads without unexpected console errors', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })

    await page.goto('/')
    await expect(page).toHaveTitle(/WisdomBi/)

    // Filter out known-benign preview-only errors
    const real = consoleErrors.filter(e =>
      !e.includes('vercel.live') &&
      !e.includes('_next-live/feedback') &&
      !e.includes('frame-src')
    )
    expect(real, `Unexpected console errors:\n${real.join('\n')}`).toEqual([])
  })

  test('auth login page renders', async ({ page }) => {
    await page.goto('/auth/login')
    await expect(page.getByRole('button', { name: /sign in|create account/i })).toBeVisible()
  })

  test('coach login page renders', async ({ page }) => {
    await page.goto('/coach/login')
    await expect(page.getByRole('heading', { name: /Coach Portal/i })).toBeVisible()
  })
})
