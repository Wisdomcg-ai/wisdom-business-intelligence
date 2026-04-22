/**
 * Type-level test for branded ID types. Success == `tsc --noEmit` exits 0.
 *
 * Each `@ts-expect-error` line claims "the next line IS a type error."
 * If we accidentally removed the brand, those lines would compile, the
 * directives would become "unused", and tsc would emit
 * "Unused '@ts-expect-error' directive" — failing the build.
 *
 * No runtime assertions — this file is a compile-time regression test only.
 */

import type { BusinessId, UserId, BusinessProfileId } from '../ids'
import { toBusinessId, toUserId, toBusinessProfileId } from '../ids'

// Positive cases — the happy path must compile
const bid: BusinessId = toBusinessId('biz-uuid')
const uid: UserId = toUserId('user-uuid')
const pid: BusinessProfileId = toBusinessProfileId('profile-uuid')

function needsBusiness(_id: BusinessId): void {}
function needsUser(_id: UserId): void {}
function needsProfile(_id: BusinessProfileId): void {}

needsBusiness(bid) // OK
needsUser(uid)     // OK
needsProfile(pid)  // OK

// Negative cases — the compiler MUST reject these.
// If any line below compiles cleanly, the brand is broken.

// @ts-expect-error raw string not assignable to BusinessId
needsBusiness('raw-string')

// @ts-expect-error UserId not assignable to BusinessId (the original "saves to my business" bug class)
needsBusiness(uid)

// @ts-expect-error BusinessId not assignable to UserId (brands are mutually exclusive)
needsUser(bid)

// @ts-expect-error BusinessProfileId not assignable to BusinessId (different tables)
needsBusiness(pid)

// @ts-expect-error BusinessId not assignable to BusinessProfileId
needsProfile(bid)

// @ts-expect-error raw string not assignable to UserId
needsUser('raw-string')

// Subtyping: branded IDs MAY be used where plain string is expected.
// This preserves compatibility with functions that haven't been branded yet.
function takesString(_s: string): void {}
takesString(bid) // OK — BusinessId extends string
takesString(uid) // OK
takesString(pid) // OK

export {}
