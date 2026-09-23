/**
 * Urban Road's fifteen contractors landed in `subscription_budgets` because it
 * is the only per-vendor budget store there is — and the forecast wizard's
 * Step 6, which reads every row for the business, listed all fifteen as
 * software subscriptions.
 */
import { describe, it, expect } from 'vitest'
import { isSubscriptionVendor, onlySubscriptionVendors } from '../vendor-scope'

/** monthly_report_settings.subscription_account_codes for Urban Road. */
const SUBS = ['63700', '63706', '63710', '64610']

describe('isSubscriptionVendor', () => {
  it('keeps a vendor billed to a subscription account', () => {
    expect(isSubscriptionVendor({ account_codes: ['63700'] }, SUBS)).toBe(true)
  })

  it('drops a contractor billed to the contractor account', () => {
    expect(isSubscriptionVendor({ account_codes: ['61400'] }, SUBS)).toBe(false)
  })

  it('keeps a vendor billed to BOTH — one subscription account is enough', () => {
    expect(isSubscriptionVendor({ account_codes: ['61400', '63700'] }, SUBS)).toBe(true)
  })

  it('keeps a row with no account codes — it cannot be shown to be out of scope', () => {
    // Somebody typed a budget for this vendor. Dropping it silently would be
    // worse than showing one too many.
    expect(isSubscriptionVendor({ account_codes: [] }, SUBS)).toBe(true)
    expect(isSubscriptionVendor({ account_codes: null }, SUBS)).toBe(true)
    expect(isSubscriptionVendor({}, SUBS)).toBe(true)
  })

  it('filters nothing for a client who has not said what a subscription is', () => {
    expect(isSubscriptionVendor({ account_codes: ['61400'] }, [])).toBe(true)
    expect(isSubscriptionVendor({ account_codes: ['61400'] }, null)).toBe(true)
    expect(isSubscriptionVendor({ account_codes: ['61400'] }, undefined)).toBe(true)
  })

  it('ignores whitespace and blanks on either side', () => {
    expect(isSubscriptionVendor({ account_codes: [' 63700 '] }, SUBS)).toBe(true)
    expect(isSubscriptionVendor({ account_codes: ['61400'] }, ['', '  '])).toBe(true)
  })
})

describe('onlySubscriptionVendors', () => {
  it('leaves the subscriptions and removes the contractors', () => {
    const rows = [
      { vendor_name: 'Shopify', account_codes: ['63700'] },
      { vendor_name: 'Ailene Alfonso', account_codes: ['61400'] },
      { vendor_name: 'Xero', account_codes: ['63700'] },
      { vendor_name: 'Mark Joseph Judaya', account_codes: ['61400'] },
    ]
    expect(onlySubscriptionVendors(rows, SUBS).map(r => r.vendor_name))
      .toEqual(['Shopify', 'Xero'])
  })

  it('does not mutate what it was given', () => {
    const rows = [{ account_codes: ['61400'] }]
    onlySubscriptionVendors(rows, SUBS)
    expect(rows).toHaveLength(1)
  })
})
