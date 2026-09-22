/**
 * The pack mark setting: what the settings POST stores, and what the renderer
 * does with whatever the row holds.
 */
import { describe, it, expect } from 'vitest'
import { parsePackLogoSetting, resolvePackLogo, fitLogo, PACK_LOGO_MAX_CHARS } from '../pack-logo-setting'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC'
const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2Q=='

describe('parsePackLogoSetting — the writer', () => {
  it('stores the lockup, a PNG or a JPEG, and clears on null', () => {
    expect(parsePackLogoSetting({ kind: 'wisdombi' })).toEqual({ ok: true, value: { kind: 'wisdombi' } })
    expect(parsePackLogoSetting({ kind: 'custom', image: PNG, label: ' Wisdom W ' }))
      .toEqual({ ok: true, value: { kind: 'custom', image: PNG, label: 'Wisdom W' } })
    expect(parsePackLogoSetting({ kind: 'custom', image: JPEG })).toEqual({ ok: true, value: { kind: 'custom', image: JPEG, label: null } })
    expect(parsePackLogoSetting(null)).toEqual({ ok: true, value: null })
  })

  it('refuses what the PDF cannot draw, instead of storing it', () => {
    expect(parsePackLogoSetting({ kind: 'custom', image: 'data:image/gif;base64,R0lGOD==' }).ok).toBe(false)
    expect(parsePackLogoSetting({ kind: 'custom', image: 'https://example.com/w.png' }).ok).toBe(false)
    expect(parsePackLogoSetting({ kind: 'custom' }).ok).toBe(false)
    expect(parsePackLogoSetting({ kind: 'calxa' }).ok).toBe(false)
    expect(parsePackLogoSetting('wisdombi').ok).toBe(false)
    const huge = `data:image/png;base64,${'A'.repeat(PACK_LOGO_MAX_CHARS)}`
    expect(parsePackLogoSetting({ kind: 'custom', image: huge })).toEqual({ ok: false, error: expect.stringContaining('larger than') })
  })
})

describe('resolvePackLogo — the renderer', () => {
  it('nothing set is the lockup with nothing to report — every client today', () => {
    expect(resolvePackLogo(undefined)).toEqual({ kind: 'wisdombi', problem: null })
    expect(resolvePackLogo(null)).toEqual({ kind: 'wisdombi', problem: null })
    expect(resolvePackLogo({ kind: 'wisdombi' })).toEqual({ kind: 'wisdombi', problem: null })
  })

  it('a usable image, with the format jsPDF needs', () => {
    expect(resolvePackLogo({ kind: 'custom', image: PNG })).toEqual({ kind: 'custom', image: PNG, format: 'PNG' })
    expect(resolvePackLogo({ kind: 'custom', image: JPEG })).toEqual({ kind: 'custom', image: JPEG, format: 'JPEG' })
  })

  it('a row that was edited by hand into something unusable is the lockup, with the reason', () => {
    expect(resolvePackLogo({ kind: 'custom', image: 'oops' })).toEqual({ kind: 'wisdombi', problem: expect.stringContaining('not a base64 PNG or JPEG') })
    expect(resolvePackLogo({ kind: 'grey-w' })).toEqual({ kind: 'wisdombi', problem: expect.stringContaining("'grey-w'") })
    expect(resolvePackLogo('custom')).toEqual({ kind: 'wisdombi', problem: 'pack_logo is not an object' })
  })
})

describe('fitLogo', () => {
  it("fills Calxa's square with a square mark and keeps a wide or tall one's shape", () => {
    expect(fitLogo(135, 135, 35)).toEqual({ w: 35, h: 35 })
    expect(fitLogo(200, 100, 22)).toEqual({ w: 22, h: 11 })
    expect(fitLogo(100, 200, 22)).toEqual({ w: 11, h: 22 })
    expect(fitLogo(0, 100, 22)).toEqual({ w: 22, h: 22 })
  })
})
