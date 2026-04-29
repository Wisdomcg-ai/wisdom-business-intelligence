# Security Audit: WisdomBI Next.js 14 + Supabase BI Platform
**Date:** 2026-04-28  
**Audit Scope:** Production 9-month-old multi-tenant platform (154 tables, 41 SECURITY DEFINER functions)

---

## Score: 7/10
**Verdict:** Mature security posture with strong RLS/auth enforcement and encryption infrastructure. Critical: Xero token plaintext fallback risk requires immediate remediation; rate limiting non-distributed; encryption key management reliant on multiple env vars.

---

## Strengths

1. **Comprehensive RLS coverage** (file:`supabase/migrations/00000000000000_baseline_schema.sql:154`) — All 154 baseline tables + new tables (xero_balance_sheet_lines, cfo_email_log) have ENABLE ROW LEVEL SECURITY with dual policy coverage (authenticated + service_role + super_admin patterns).

2. **Multi-tenant isolation via dual-ID filters** (file:`src/lib/consolidation/engine.ts`) — Consolidation engine scopes queries by both `business_id` AND `tenant_id`; verified in xero_pl_lines, xero_balance_sheet_lines, financial_forecasts.

3. **Strong auth flow with session refresh** (file:`src/middleware.ts:80-138`) — Supabase SSR client handles token refresh; callback route validates PKCE code; open redirects prevented via safeNextPath (lines 6-10); `?next` parameter constrained to same-origin relative paths.

4. **Encryption at rest for OAuth tokens** (file:`src/lib/utils/encryption.ts`) — AES-256-GCM with authenticated tags (128-bit IV, auth tag); timing-safe HMAC comparison used (line 172-178); decrypt() supports graceful migration from plaintext.

5. **HMAC-signed report view tokens** (file:`src/lib/reports/report-token.ts:46-49`) — Timing-safe crypto.timingSafeEqual() prevents timing attacks; no expiry-in-token but relies on REPORT_LINK_SECRET rotation as kill-switch.

6. **Password reset rate limiting** (file:`src/app/api/auth/reset-password/route.ts:17-33`) — 3 requests per hour per IP via checkRateLimit(); email enumeration prevention (line 57-60: same response for user-not-found).

7. **Service-role key usage guarded** (file:`src/app/api/migrate/route.ts:10-26` and `/api/admin/clients/route.ts:38-58`) — Both migration endpoints verify super_admin role BEFORE creating service-role client; admin clients endpoint enforces auth + role check.

8. **SECURITY DEFINER functions hardened** (file:`supabase/migrations/00000000000000_baseline_schema.sql`) — `SET "search_path" TO ''` present on auth functions (auth_is_super_admin, auth_is_team_member_of) to prevent namespace spoofing.

9. **CSP + security headers in production** (file:`src/middleware.ts:213-251` and `next.config.js:45-106`) — HSTS (1 year, preload), X-Frame-Options: DENY, X-Content-Type-Options: nosniff, Referrer-Policy: strict-origin-when-cross-origin; CSP includes Stripe/Xero/OpenAI allowed origins.

10. **Cron endpoint authentication** (file:`src/app/api/cron/weekly-digest/route.ts:11-14` and `daily-health-report/route.ts:12-15`) — Both verify `Authorization: Bearer ${CRON_SECRET}` header before executing; requires external secret.

---

## Findings

### 🔴 CRITICAL

#### 1. **Xero Token Plaintext Fallback Risk**
**File:** `src/lib/utils/encryption.ts:79-83`  
**Evidence:**
```typescript
// If data appears to be encrypted (has our format)
if (!encryptedData.includes(':')) {
  // Data is not encrypted, return as-is (for migration purposes)
  return encryptedData
}
```
**Impact:** If a token in `xero_connections` table is NOT prefixed with encrypted format (iv:authTag:ciphertext), `decrypt()` returns it as plaintext without attempting decryption. Combined with database schema showing `access_token` and `refresh_token` columns store directly (file:`supabase/migrations/00000000000000_baseline_schema.sql:5549-5550`), this creates a migration window where plaintext tokens could exist and be transparently used. A backup leak or DB export would expose OAuth credentials unencrypted.

**Fix sketch:**
- Validate all existing tokens are encrypted before production; back-fill with encrypt() if needed.
- Remove plaintext fallback from decrypt() or add migration timestamp guard.
- Audit database export policies to prevent credential leakage in backups.
- Consider encrypting at column-level (pgcrypto) as defense-in-depth.

---

#### 2. **Encryption Key Reliant on Multiple Env Vars Without Clear Priority**
**File:** `src/lib/utils/encryption.ts:20-41`  
**Evidence:**
```typescript
const keyString = process.env.APP_SECRET_KEY
  || process.env.ENCRYPTION_KEY
  || process.env.SUPABASE_SERVICE_KEY
```
**Impact:** Code has 3 fallback env vars for encryption key. If APP_SECRET_KEY is not set and ENCRYPTION_KEY is missing, the service uses SUPABASE_SERVICE_KEY (a high-privilege credential). This could lead to key leakage or unexpected key rotation without notice if an admin changes SUPABASE_SERVICE_KEY. Also, if the key is a non-hex string, it uses PBKDF2 with hardcoded salt `'xero-tokens-salt-v1'` (line 40), which is predictable and could allow key recovery if the original secret is weak.

**Fix sketch:**
- Require exactly one of (APP_SECRET_KEY or ENCRYPTION_KEY) to be explicitly set; fail loudly if both missing.
- Generate and manage encryption key separately from OAuth/DB credentials.
- Document key rotation procedure (re-encrypt all tokens if key changes).
- Use random salt for PBKDF2 if needed, or forbid non-hex keys.

---

### 🟠 HIGH

#### 3. **Rate Limiting is In-Memory Only (Not Distributed)**
**File:** `src/lib/utils/rate-limiter.ts:23-24`  
**Evidence:**
```typescript
const rateLimitMap = new Map<string, RateLimitRecord>()
```
**Impact:** Rate limiting uses a simple in-memory Map. In production with multiple server instances (or serverless cold-starts), rate limits are NOT shared across processes. An attacker can hit 30 AI requests per hour per-server, then retry on a different server/container. This undermines protection against brute-force (password reset), cost abuse (AI), and DOS.

**Fix sketch:**
- Move rate limit state to Redis or Supabase (e.g., a rate_limits table with TTL).
- Or: Use a middleware like Vercel's built-in rate limiting (if on Vercel).
- Until then, document this as a known limitation in prod environments.

---

#### 4. **Team Invite Pagination Loop Can Leak Email Addresses**
**File:** `src/app/api/team/invite/route.ts:237-272`  
**Evidence:**
Accepts user input in `createAccount: true` path. If user creation fails with "already registered" error, code loops through Admin API pages (line 241-273) to find and add the existing user. The loop uses `page` variable (line 238) with no upper bound check initially, though a safety limit of 100 is later hardcoded (line 272).

The risk: If an admin iterates this loop for many emails, each failed lookup pagination could be observable. Additionally, if the Admin API leaks user enumeration data in error messages, this becomes a user enumeration vector.

**Fix sketch:**
- Check if user exists via direct Admin API lookup (if available) before pagination loop.
- Cap pagination at 10 pages max (1000 users); fail with "user not found" after that.
- Log failed lookups but don't enumerate users in error messages.

---

#### 5. **No Input Validation Framework (0 Zod Usage in 120 API Routes)**
**File:** All `/src/app/api/*/route.ts` files  
**Evidence:** Codebase includes `zod` v4.0.17 in package.json but zero imports of it across API code. Routes like `/api/admin/clients`, `/api/team/invite`, `/api/forecasts/export`, `/api/ai/advisor` manually parse JSON without schema validation.
```typescript
// Example from /api/team/invite/route.ts:42-53
const body = await request.json()
const {
  businessId,
  firstName,
  lastName,
  email,
  phone,
  position,
  role,
  sectionPermissions,
  createAccount = true
} = body
// No validation that businessId is a UUID, email is valid format, role is enum, etc.
```

**Impact:** Type safety is runtime-optional. If client sends `businessId: "not-a-uuid"` or `email: "not-an-email"`, code silently accepts it, leading to downstream DB errors or RLS bypass. No clear error messages to client.

**Fix sketch:**
- Create Zod schemas for each route's input.
- Wrap JSON parsing in try/catch; validate with schema.
- Return 400 with clear error messages if validation fails.
- Example: `const schema = z.object({ email: z.string().email(), businessId: z.string().uuid() })`

---

#### 6. **Admin Routes Lack Request Body Validation; Mutation Without Rollback**
**File:** `src/app/api/admin/clients/route.ts:438-489` (PATCH)  
**Evidence:** DELETE method (lines 493-598) recursively deletes 11 related tables in sequence (lines 530-557) without transaction. If deletion fails midway, partial deletion occurs.

**Impact:** Data inconsistency; orphaned records in other tables. For example, if `user_permissions` delete succeeds but `user_roles` delete fails, the user becomes permission-less but still exists in auth.

**Fix sketch:**
- Wrap multi-step deletes in a Supabase transaction (if supported) or implement compensation logic.
- Or: Use a soft-delete flag instead of hard delete; mark as `deleted_at`.
- Verify foreign key cascade is properly configured.

---

### 🟡 MEDIUM

#### 7. **Xero Token Refresh Race Condition Window**
**File:** `src/lib/xero/token-manager.ts:109-144`  
**Evidence:** Lock mechanism uses `token_refreshing_at` column as a distributed lock. Process A acquires lock, then sleeps 2s (line 114). If process A crashes before releasing lock (line 144), the lock remains set indefinitely.

**Impact:** Xero API calls timeout waiting for refresh that never completes; token expires.

**Fix sketch:**
- Add a lock timeout; consider lock stale if `token_refreshing_at` is > 30s old.
- Use Supabase advisory locks if available.
- Or: Implement a heartbeat to extend the lock.

---

#### 8. **CSRF Token Not Validated on State-Changing Requests**
**File:** `src/middleware.ts:23-31`  
**Evidence:** Middleware generates and sets CSRF token cookie (lines 24-31) but this token is **never validated** on POST/PATCH/DELETE routes. The token is set to `httpOnly: false` (line 26) so JS can read it, but no route validates it.

Routes like `/api/team/invite` (line 6: `csrfProtection(request)`) do check CSRF in a few places, but this is inconsistent. Most routes (e.g., `/api/admin/clients` POST) don't call it.

**Impact:** If a user visits a malicious site while logged into WisdomBI, a CSRF form could invite team members, change settings, or trigger migrations.

**Fix sketch:**
- Enforce CSRF check as middleware for all POST/PATCH/DELETE to /api routes.
- Or: Validate CSRF in each route that modifies state.
- Make CSRF token HttpOnly if SPA handles same-site only; document if client-accessible token is intentional.

---

#### 9. **Team Invite Email Credentials Exposed in HTML**
**File:** `src/app/api/team/invite/route.ts:421-469`  
**Evidence:** Generated password is embedded in plaintext in email HTML (line 448):
```html
<code style="...display: inline-block;">${generatedPassword}</code>
```

If user's email is compromised or email server logs are accessible, password is exposed. Also, email is transmitted over SMTP (not necessarily TLS).

**Impact:** Temporary password leakage if email infrastructure is not hardened.

**Fix sketch:**
- Send password via separate secure link / one-time code instead of plaintext.
- Or: Generate password-less magic link (email-based auth).
- Or: Require user to set password on first login (send no password in email).

---

#### 10. **No Rate Limiting on Key AI Endpoints Despite High Cost**
**File:** `src/app/api/ai/advisor/route.ts:14-30` and similar AI routes  
**Evidence:** AI routes use `RATE_LIMIT_CONFIGS.ai` (30 requests/hour per user), but this is in-memory and not enforced across instances (see Finding #3). Also, no cost tracking or quota alerts.

**Impact:** A malicious actor with a user account can exhaust AI budget by distributing requests across multiple server instances.

**Fix sketch:**
- Move to distributed rate limiter (Redis).
- Add usage tracking per user per month; alert admins at 80% of monthly budget.
- Implement hard cap per user per day.

---

#### 11. **Onboarding Check Temporarily Disabled**
**File:** `src/middleware.ts:173-201`  
**Evidence:** Code is commented out with TODO:
```typescript
// TEMPORARILY DISABLED: Onboarding checks removed to allow business plan access
// TODO: Re-enable once business plan development is complete
```

**Impact:** Clients can skip onboarding and access features before completing required steps (business profile, assessment).

**Fix sketch:**
- Remove TODO or set a target date for re-enablement.
- If business plan is feature-flagged, conditionally enable check only for non-beta users.

---

#### 12. **No Audit Logging for Sensitive Admin Operations**
**File:** `src/app/api/admin/clients/route.ts:119-220` and `/api/admin/reset-password/route.ts`  
**Evidence:** Admin creates users, changes passwords, deletes clients. Actions are logged to console (line 212: `console.log('[Admin Client Create]...')`) but not persisted to audit table.

**Impact:** No tamper-proof record of who performed what admin action. Hard to investigate unauthorized changes after they occur.

**Fix sketch:**
- Create audit_log table with columns: timestamp, admin_user_id, action, resource_type, resource_id, changes.
- Log all super_admin actions to this table.
- Display audit log in admin dashboard.

---

### 🟢 LOW

#### 13. **Unused Dependency with Known Vulnerability**
**File:** `package.json:33`  
**Evidence:** `axios` v1.11.0 is in dependencies but never imported in src code. Known CVE-2024-28849 (SSRF in axios).

**Fix sketch:**
- Remove axios from package.json if not used.
- Use native fetch() instead.

---

#### 14. **Error Messages May Leak Implementation Details**
**File:** `src/app/api/migrate/route.ts:89-100`  
**Evidence:** On migration error, response includes SQL queries:
```json
{
  "success": false,
  "error": "...",
  "sql": "ALTER TABLE forecast_pl_lines ADD COLUMN IF NOT EXISTS forecast_method JSONB..."
}
```

**Impact:** Leaks database schema to client; aids reconnaissance for attackers.

**Fix sketch:**
- Log full error + SQL to server logs only.
- Return generic "Migration failed" to client.

---

#### 15. **OAuth State Validation Uses Multiple Encoding Formats**
**File:** `src/lib/utils/encryption.ts:199-227`  
**Evidence:** verifySignedOAuthState tries base64url first, then falls back to base64 (lines 218-222). No error if both fail; silently returns null.

**Impact:** Weak validation; an attacker might craft payloads that parse in both formats.

**Fix sketch:**
- Enforce single encoding format (prefer base64url); fail if decoding fails rather than silently returning null.

---

## Halt-and-Ask Items

**None at 🔴 level that require immediate code-stopping halt.** However, **Finding #1 (Xero Token Plaintext Fallback)** should be prioritized:
- Verify no plaintext tokens currently exist in `xero_connections` table.
- If they do, immediately encrypt them and remove decrypt() plaintext fallback.
- This is live credential exposure if DB is breached.

---

## Summary by Area

| Area | Status | Notes |
|------|--------|-------|
| **Auth Flow** | ✅ Strong | PKCE, session refresh, open-redirect prevention working. |
| **RLS Coverage** | ✅ Complete | All 154 baseline + new tables have RLS; policies dual-authenticated & service_role. |
| **Multi-tenant Isolation** | ✅ Good | Consolidation engine, forecasts, xero queries filter both business_id & tenant_id. |
| **Service-Role Usage** | ✅ Guarded | Migrations, admin routes verify super_admin before service_role client creation. |
| **Input Validation** | ❌ Missing | 0 Zod usage across 120 routes; manual JSON parsing without schema validation. |
| **Xero Tokens** | ⚠️ Risk | AES-256-GCM encryption present but plaintext fallback + multi-env-var key management is risky. |
| **Rate Limiting** | ⚠️ Incomplete | In-memory only; won't scale across multiple instances. Implement Redis. |
| **CSP / Headers** | ✅ Good | HSTS, DENY framing, nosniff, CSP with explicit origins. Missing CSP nonce for inline scripts (but current CSP allows unsafe-inline). |
| **Cron Endpoints** | ✅ Protected | Bearer token validation on both /api/cron/* endpoints. |
| **Report Tokens** | ✅ Secure | Timing-safe HMAC-SHA256. |
| **SQL Injection** | ✅ No evidence | RPC calls use parameterized inputs (not string concat). |
| **XSS** | ✅ Low risk | No dangerouslySetInnerHTML; innerHTML uses only hardcoded entities. |
| **SSRF** | ✅ No evidence | No user-controlled URLs in fetch(). Axios unused. |
| **Open Redirects** | ✅ Prevented | safeNextPath guards redirect targets. |

---

## Recommendations (Priority Order)

1. **[P0]** Encrypt all plaintext Xero tokens in database; remove plaintext fallback from `decrypt()`.
2. **[P0]** Fix encryption key selection: require explicit APP_SECRET_KEY or ENCRYPTION_KEY; never fall back to SUPABASE_SERVICE_KEY.
3. **[P1]** Implement distributed rate limiting (Redis); don't rely on in-memory Map for multi-instance deploys.
4. **[P1]** Add Zod validation to all 120 API routes; start with /api/admin/*, /api/team/invite, /api/forecasts/*.
5. **[P1]** Enforce CSRF check as middleware for all state-changing requests.
6. **[P2]** Add audit logging for all super_admin actions.
7. **[P2]** Remove axios from package.json; document password-in-email risk and plan for magic link auth.
8. **[P3]** Re-enable onboarding checks or set explicit timeline for re-enablement.
9. **[P3]** Document known limitations (in-memory rate limit, plaintext fallback window during migration).

---

## Files Referenced (In Scope)

- `src/middleware.ts` — Auth flow, CSRF token, security headers
- `src/app/auth/callback/route.ts` — OAuth callback
- `src/app/api/admin/clients/route.ts` — Admin user creation, deletion
- `src/app/api/team/invite/route.ts` — Team member invite
- `src/app/api/migrate/route.ts`, `/api/migrate/opex-fields/route.ts` — Schema migrations
- `src/app/api/cron/weekly-digest/route.ts`, `daily-health-report/route.ts` — Cron endpoints
- `src/app/api/auth/reset-password/route.ts` — Password reset
- `src/app/api/ai/advisor/route.ts` — AI advisor endpoint
- `src/lib/utils/encryption.ts` — AES-256-GCM encryption/decryption
- `src/lib/utils/rate-limiter.ts` — In-memory rate limiting
- `src/lib/xero/token-manager.ts` — Xero OAuth token refresh
- `src/lib/reports/report-token.ts` — HMAC-signed report view tokens
- `src/lib/consolidation/engine.ts` — Multi-tenant consolidation
- `supabase/migrations/00000000000000_baseline_schema.sql` — RLS policies, 154 tables
- `supabase/migrations/20260420032941_consolidation_bs_translation.sql` — xero_balance_sheet_lines RLS
- `supabase/migrations/20260424_cfo_email_log.sql` — cfo_email_log RLS
- `next.config.js` — Security headers, CSP
- `package.json` — Dependencies (axios unused)

---

**Audit completed:** 2026-04-28  
**Auditor notes:** Platform has solid RLS and auth fundamentals; encryption infrastructure is present but has key management and fallback risks. Input validation framework is missing (Zod installed but unused). Rate limiting needs Redis backend for production scale. Team invite password disclosure and admin audit logging are secondary concerns.

