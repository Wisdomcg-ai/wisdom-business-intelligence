import { describe, it, expect } from 'vitest'
import {
  CURRENCY_PAIR_REGEX,
  ALLOWED_FUNCTIONAL_CURRENCIES,
  validateFxRatePayload,
  validateTenantPatchPayload,
} from './admin-guards'

describe('CURRENCY_PAIR_REGEX', () => {
  it('accepts well-formed pairs', () => {
    expect(CURRENCY_PAIR_REGEX.test('HKD/AUD')).toBe(true)
    expect(CURRENCY_PAIR_REGEX.test('USD/NZD')).toBe(true)
  })
  it('rejects lower-case, dashes, and missing slashes', () => {
    expect(CURRENCY_PAIR_REGEX.test('hkd/aud')).toBe(false)
    expect(CURRENCY_PAIR_REGEX.test('HKD-AUD')).toBe(false)
    expect(CURRENCY_PAIR_REGEX.test('HKDAUD')).toBe(false)
    expect(CURRENCY_PAIR_REGEX.test('HK/AUD')).toBe(false)
  })
})

describe('validateFxRatePayload', () => {
  const base = {
    currency_pair: 'HKD/AUD',
    rate_type: 'monthly_average',
    period: '2026-03-01',
    rate: 0.1925,
  }

  it('accepts a valid payload', () => {
    const r = validateFxRatePayload(base)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.rate).toBe(0.1925)
  })

  it('rejects missing fields', () => {
    expect(validateFxRatePayload({}).ok).toBe(false)
    expect(validateFxRatePayload({ ...base, currency_pair: '' }).ok).toBe(false)
  })

  it('rejects malformed currency_pair', () => {
    const r = validateFxRatePayload({ ...base, currency_pair: 'hkd/aud' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/XXX\/YYY/)
  })

  it('rejects invalid rate_type', () => {
    const r = validateFxRatePayload({ ...base, rate_type: 'daily' })
    expect(r.ok).toBe(false)
  })

  it('rejects non-positive or non-finite rate', () => {
    expect(validateFxRatePayload({ ...base, rate: 0 }).ok).toBe(false)
    expect(validateFxRatePayload({ ...base, rate: -1 }).ok).toBe(false)
    expect(validateFxRatePayload({ ...base, rate: Infinity }).ok).toBe(false)
    expect(validateFxRatePayload({ ...base, rate: 'x' }).ok).toBe(false)
  })

  it('rejects an unparseable period', () => {
    const r = validateFxRatePayload({ ...base, period: 'not-a-date' })
    expect(r.ok).toBe(false)
  })

  it('rejects non-object bodies', () => {
    expect(validateFxRatePayload(null).ok).toBe(false)
    expect(validateFxRatePayload('string').ok).toBe(false)
  })
})

describe('validateTenantPatchPayload', () => {
  it('accepts a single-field patch', () => {
    const r = validateTenantPatchPayload({ display_order: 2 })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.display_order).toBe(2)
  })

  it('accepts a multi-field patch', () => {
    const r = validateTenantPatchPayload({
      display_name: 'IICT Group Limited',
      display_order: 1,
      functional_currency: 'HKD',
      include_in_consolidation: true,
      is_active: true,
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.display_name).toBe('IICT Group Limited')
      expect(r.value.functional_currency).toBe('HKD')
    }
  })

  it('rejects an empty body', () => {
    const r = validateTenantPatchPayload({})
    expect(r.ok).toBe(false)
  })

  it('rejects unknown functional_currency', () => {
    const r = validateTenantPatchPayload({ functional_currency: 'JPY' })
    expect(r.ok).toBe(false)
  })

  it('rejects empty display_name', () => {
    const r = validateTenantPatchPayload({ display_name: '   ' })
    expect(r.ok).toBe(false)
  })

  it('rejects non-integer display_order', () => {
    const r = validateTenantPatchPayload({ display_order: 1.5 })
    expect(r.ok).toBe(false)
  })

  it('rejects non-boolean toggles', () => {
    expect(
      validateTenantPatchPayload({ include_in_consolidation: 'yes' }).ok,
    ).toBe(false)
    expect(validateTenantPatchPayload({ is_active: 1 }).ok).toBe(false)
  })

  it('trims display_name', () => {
    const r = validateTenantPatchPayload({ display_name: '  Dragon  ' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.display_name).toBe('Dragon')
  })

  it('rejects non-object bodies', () => {
    expect(validateTenantPatchPayload(null).ok).toBe(false)
    expect(validateTenantPatchPayload([]).ok).toBe(false)
  })

  it('expose all allowed functional currencies', () => {
    expect(ALLOWED_FUNCTIONAL_CURRENCIES).toContain('AUD')
    expect(ALLOWED_FUNCTIONAL_CURRENCIES).toContain('HKD')
    expect(ALLOWED_FUNCTIONAL_CURRENCIES).toContain('NZD')
  })
})
