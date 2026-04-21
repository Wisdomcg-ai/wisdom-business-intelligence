/**
 * Branded ID types — prevent the `user.id` vs `business.id` confusion that
 * caused the "saves to my business" bug.
 *
 * Both IDs are UUID strings at runtime, so `string` alone doesn't protect
 * against passing one where the other is expected. A branded type makes the
 * mistake a TypeScript error:
 *
 *     const uid: UserId = toUserId(user.id)
 *     const bid: BusinessId = toBusinessId(bizRow.id)
 *     writeSomething(uid)           // error: UserId not assignable to BusinessId
 *     writeSomething(bid)           // OK
 *
 * Migration path: introduce for new code now; retrofit the resolver and
 * context in a follow-up. Don't advertise partial coverage as "done" — the
 * brand only prevents bugs in code that uses the brand.
 */

// The `__brand` field is never populated — it exists only in the type system.
export type BusinessId = string & { readonly __brand: 'BusinessId' }
export type UserId = string & { readonly __brand: 'UserId' }
export type BusinessProfileId = string & { readonly __brand: 'BusinessProfileId' }

/** Construct a BusinessId. Use at the boundary where the value is known to
 *  come from `businesses.id` (DB row, URL param on a business-scoped route). */
export function toBusinessId(raw: string): BusinessId {
  return raw as BusinessId
}

/** Construct a UserId. Use at the boundary where the value is known to come
 *  from `auth.users.id` (Supabase session). */
export function toUserId(raw: string): UserId {
  return raw as UserId
}

/** Construct a BusinessProfileId. Distinct brand because business_profiles.id
 *  and businesses.id are different tables with different FKs, and the app has
 *  historically confused them. */
export function toBusinessProfileId(raw: string): BusinessProfileId {
  return raw as BusinessProfileId
}
