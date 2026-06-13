# R1 — Business-ID Resolver Consolidation Plan

**Status:** SCOPING (read-only). No source/test changes made.
**Goal:** Collapse three overlapping business-ID resolvers into one canonical, role-aware, branded-type resolver. This is the #1 recurring production incident class.
**Canonical money id-space:** `business_profiles.id` (FK-enforced on `xero_pl_lines`, `xero_bs_lines`).
**Regression backstop (do NOT duplicate):**
- `src/__tests__/lib/resolve-business-id-characterization.test.ts` (pins `resolveBusinessId` + `resolveXeroBusinessId`)
- `src/__tests__/lib/verify-business-access-characterization.test.ts` (pins `verifyBusinessAccess` 4×2 matrix)
- plus cashflow / consolidation / RLS nets.

---

## 1. Semantic diff of the resolvers

There are in effect **four** id-handling functions, not three. All evidence below is against current file contents.

### A. `resolveBusinessIds` — `src/lib/utils/resolve-business-ids.ts` (role-BLIND, dominant)
- **Signature:** `(supabase, businessId: string) => Promise<{ bizId, profileId, all: string[] }>` (lines 23–26).
- **Returns:** BOTH id-spaces + an `all` array `[profileId, bizId]` built for `.in('business_id', ids.all)` money queries.
- **Role-awareness:** NONE. Takes any string, never sees the user or role.
- **Id-spaces emitted:** `businesses.id` (bizId) AND `business_profiles.id` (profileId).
- **Bug 1 — never-invalidated cache (line 21):** `const cache = new Map(...)`. Only `cache.get` (line 28) and `cache.set` (lines 44–45, 62–63) appear; there is **no `cache.delete`/`cache.clear` anywhere**. It is a **module-level singleton** (not per-request, despite the doc comment on line 9 claiming "cached per-request"). On a long-lived server process, a business that gets a `business_profiles` row *after* a first miss is permanently cached wrong (see Bug 2). Stale-comment hazard: the header sells per-request semantics that the code does not implement.
- **Bug 2 — input-echo fallback (lines 67–73):** when neither lookup hits, it returns `{ bizId: businessId, profileId: businessId, all: [businessId] }` — echoing the unresolved input as *both* ids. By design this makes read paths degrade to "no rows" rather than throw (documented in `assert-profile-id.ts`). It is **safe for reads, dangerous for writes** (a `businesses.id` or polluting user-auth id flows into `profileId`).
- **Caller dependence on quirks:** money reads depend on `.all` (`monthly-report/generate/route.ts:203,235,258`; `consolidation/engine.ts:207,351,400`; `forecast-read-service.ts:249,292,765`) and on `.bizId` for FX gating (`forecast-read-service.ts:224,248`). The echo-fallback is *relied on* as a graceful-degrade for orphan/unsynced businesses.

### B. `resolveXeroBusinessId` — `src/lib/utils/resolve-xero-business-id.ts` (Xero-connection only)
- **Signature:** `(supabase, businessId: string) => Promise<{ connectionBusinessId, connection: any | null }>` (lines 13–16).
- **Returns:** the id under which an **active `xero_connections` row** lives, plus that row (or `null`).
- **Role-awareness:** NONE.
- **Three lookup paths:** Try 1 direct on input (lines 21–32); Try 2 input is `businesses.id` → map via `business_profiles.business_id` (lines 34–56); Try 3 input IS `business_profiles.id` → look under parent `businesses.id` (lines 58–79). Picks newest active by `created_at DESC` (single-tenant legacy convenience; multi-tenant callers query `xero_connections` directly per the header).
- **Id-spaces emitted:** can return `businesses.id` OR `business_profiles.id` depending on which path hit — caller can't tell which without inspecting.
- **Quirk pinned by tests:** Try 2 no-connection returns `profile.id` (line 55); Try 3 no-connection returns `bizProfile.id` i.e. the *input* (line 78), NOT the parent. Final fallback echoes input (line 81). **No `assertNotUserId` guard** — a user UUID just fails every lookup and is echoed (characterization test lines 378–390).
- **Stale comment (lines 10–11):** claims legacy rows reference `business_profiles(id)` and newer rows reference `businesses(id)`; this drift is exactly what the data-cleanse (R14) addresses and the resolver papers over.

### C. `resolveBusinessId` — `src/lib/business/resolveBusinessId.ts` (role-AWARE — the intended winner)
- **Signature:** `(supabase, { userId, role, activeBusinessId }) => Promise<{ businessId: BusinessId | null, reason }>` (lines 69–79).
- **Returns:** a **branded `BusinessId`** (always `businesses.id` space) or `null`, plus a `reason` enum for UI empty-states (lines 39–46).
- **Role-awareness:** FULL. `activeBusinessId` short-circuits (lines 80–83); unauthenticated → null (84–86); non-`client` roles return `coach-no-client` WITHOUT guessing (87–90); client tries `business_users status='active'` then `businesses.owner_id` (92–116).
- **`assertNotUserId` guard (lines 53–67):** throws "INVARIANT VIOLATED" if a resolved id equals the user UUID — the explicit defense against the "saves to my business" bug, fired on every return path.
- **Id-space emitted:** `businesses.id` ONLY. **It does NOT emit `business_profiles.id`** and does NOT touch `xero_connections`. This is the core gap (see §3).
- **`BusinessRole` here is `'client' | 'coach' | 'admin'`** (line 24) — narrower than `verifyBusinessAccess`'s matrix, which also recognizes team-membership and `super_admin`.

### D. `verifyBusinessAccess` — `src/lib/utils/verify-business-access.ts` (access *check*, not resolver)
- **Signature:** `(userId, businessId) => Promise<boolean>`. Module-level non-injectable `supabaseAdmin` (lines 4–7).
- 4-way grant: owner/coach on `businesses` → dual-ID via `business_profiles` → `business_users` membership → `system_roles` super_admin.
- **Latent bug (pinned, lines 271–299 of its char test):** membership check has **no status filter** — a deactivated/pending member still grants. Out of R1 scope but the consolidation must not silently inherit/erase it.

### Branded types — `src/lib/types/ids.ts`
`BusinessId`, `UserId`, `BusinessProfileId` brands + `toBusinessId/toUserId/toBusinessProfileId` (lines 20–41). Adopted in only **2 files**: `BusinessContext.tsx`, `business/resolveBusinessId.ts`. Notably there is **no branded analogue for the `{bizId, profileId, all}` pair** the money paths need.

---

## 2. Caller inventory (grep-derived counts; representative files)

| Bucket | Resolver | Count | Representative files |
|---|---|---|---|
| **(a) Read-path money lookups** (need `business_profiles.id`) | `resolveBusinessIds` → `.all`/`.profileId` | ~25 of 45 | `monthly-report/generate/route.ts`, `monthly-report/consolidated*/route.ts`, `consolidation/engine.ts`, `consolidation/balance-sheet.ts`, `consolidation/cashflow.ts`, `forecast-read-service.ts`, `historical-pl-summary.ts`, `Xero/balance-sheet/route.ts`, `Xero/accounts/route.ts` |
| **(b) Access checks** | `verifyBusinessAccess` (+ `resolveBusinessId` for page context) | 20 (canonical) | `finances/*/page.tsx`, `quarterly-review/*`, `dashboard` hooks, `one-page-plan`, `settings/team` |
| **(c) Xero-connection lookups** | `resolveXeroBusinessId` | 9 | `Xero/callback`, `complete-connection`, `disconnect`, `employees`, `pl-summary`, `reactivate`, `status`, `sync` |
| **(d) Write paths** | `resolveBusinessIds` + `assertBusinessProfileId` guard | 1 wired | `xero/sync-orchestrator.ts:451` (R1b guard already shipped) |
| **(e) Echo-fallback / cache reliant** | `resolveBusinessIds` graceful-degrade | most of (a) | every `.in('business_id', ids.all)` site depends on echo-fallback returning "no rows" for orphans |

Notes: `resolveBusinessIds` = **45** non-test files (dominant). `resolveXeroBusinessId` = **9**. canonical `resolveBusinessId` = **20** (UI/page layer). `ids.ts` brands = **2**. A handful of the 45 are fixtures/tests (`consolidation/__fixtures__/*`, `*.test.ts`) — exclude from the migration surface.

---

## 3. Canonical target design

**Single resolver = `resolveBusinessId` (role-aware, branded, guarded) + `ids.ts` brands**, extended to emit the dual-id pair that money paths require.

What's missing today and must be added BEFORE it can absorb the other two:

1. **Profile-id emission (the big one).** `resolveBusinessId` returns only `businesses.id`. The 25 money-read callers need `business_profiles.id`. Add a sibling/companion that, given a resolved `BusinessId`, returns a **branded** `{ businessId: BusinessId, profileId: BusinessProfileId, all }` — i.e. fold `resolveBusinessIds`'s mapping *under* the role-aware front door, keeping the `.all` shape so the ~25 `.in()` sites change import only, not query logic.

2. **Xero-connection lookup — GENUINE GAP.** `resolveBusinessId` does **not** touch `xero_connections` at all; `resolveXeroBusinessId`'s entire job (3 paths + newest-active selection + new-connection FK-compat return) has **no equivalent** in the canonical resolver. This is **not** something the canonical resolver "secretly already does." It must be **kept as a distinct function** (rename/relocate to `lib/business/`), ideally layered to call the canonical `→profileId` mapping for its Try-2/Try-3 logic instead of re-implementing `business_profiles` lookups. Treat it as a sibling resolver in the same module family, NOT a merge target.

3. **Role vocabulary reconciliation.** Canonical `BusinessRole` (`client|coach|admin`) is narrower than the access matrix (team-member, super_admin). For pure *resolution* this is acceptable (resolution ≠ authorization); document that `verifyBusinessAccess` remains the authz gate and is out of R1's merge.

4. **Cache strategy.** The new path must NOT inherit the module-singleton never-invalidated `Map`. Either drop caching (lookups are single indexed PK/FK queries) or scope a cache to the request via the Supabase client instance. Dropping is safest for correctness; benchmark later.

---

## 4. Incremental cutover strategy (ordered, each shippable + green against the char net)

**Big-bang is forbidden — the echo-fallback masks polluted prod rows (see §5).** Sequence:

- **PR-0 (SAFEST FIRST SLICE — pure addition, zero call-site change):** add `resolveBusinessProfileIds()` to `src/lib/business/` that wraps the canonical `resolveBusinessId` and returns the **branded** `{ businessId, profileId, all }` triple, re-implementing the `resolve-business-ids.ts` mapping logic verbatim so behavior is identical. Ship behind no flag; nobody calls it yet. Add a thin characterization test asserting it matches `resolveBusinessIds` output for the resolvable cases. **Risk ≈ 0** (new file, no imports rewired).
- **PR-1:** migrate the 2–3 *consolidation read* callers (`consolidation/engine.ts`, `balance-sheet.ts`, `cashflow.ts`) to the new helper. These are covered by the consolidation golden-master net → instant regression signal.
- **PR-2:** migrate `forecast-read-service.ts` + `historical-pl-summary.ts` (cashflow/forecast nets cover them).
- **PR-3:** migrate the `monthly-report/*` route family.
- **PR-4:** add a **deprecation shim** — re-export `resolveBusinessIds` from its old path delegating to the new helper, with a `@deprecated` JSDoc, so any un-migrated/3rd-party call site keeps working. Keep echo-fallback in the shim until R14.
- **PR-5:** relocate/rename `resolveXeroBusinessId` into `lib/business/` as the sanctioned Xero-connection resolver; rewire its Try-2/Try-3 to call the new profile mapping. Its own 9 callers + char test gate it.
- **PR-6 (last):** flip cache off / request-scope it; verify no perf regression.

A **deprecation shim is mandatory** at PR-4 because 45 files import the old name; they cannot all move in one PR without re-introducing big-bang risk.

---

## 5. Risks & prod-data caveats

- **BIGGEST RISK — echo-fallback is load-bearing for polluted rows.** The lines 67–73 fallback currently lets money reads silently return "no rows" for businesses whose `business_id` is a wrong-id-class value (the pollution R14 will cleanse). If consolidation removes/strictens the fallback **before** R14, those businesses flip from "empty report" to "hard error" in prod. **R1 code must fork the clean path WITHOUT depending on the cleanse**: keep echo-fallback semantics inside the new helper/shim (reads still degrade to empty), and rely on the already-shipped `assertBusinessProfileId` (`sync-orchestrator.ts:451`) to keep *writes* strict. Do not couple R1's merge to R14's data fix.
- **Never-invalidated cache ordering hazard:** if PR-6 (cache flip) lands *before* the read migration, a business cached during the old code path could serve a stale pair to the new path. Order cache-flip LAST.
- **Xero-resolver is NOT mergeable into the canonical resolver** — re-confirmed: `resolveBusinessId` has zero `xero_connections` awareness. Forcing a merge would lose the newest-active-connection + new-connection-FK-compat behavior pinned by 9 char tests. Keep it a sibling.
- **Role-vocabulary mismatch:** do not let R1 silently widen/narrow authz. `verifyBusinessAccess` (and its pinned no-status-filter latent bug) is explicitly out of scope; R1 touches *resolution* only.
- **Singleton cache + serverless:** because the cache is module-level, behavior differs between a warm long-lived process and a cold serverless invocation — any test that "passes locally" may not reflect prod warm-cache state. Validate against the char net, not manual local runs.
