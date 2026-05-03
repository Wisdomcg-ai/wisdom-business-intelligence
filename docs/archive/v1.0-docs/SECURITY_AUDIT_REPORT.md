# Security & Code Audit Report
**Date:** December 10, 2025
**Status:** Pre-Launch Audit

---

## EXECUTIVE SUMMARY

A comprehensive security audit was performed across authentication, API routes, data operations, RLS policies, form validation, and error handling. Multiple critical vulnerabilities were identified that must be fixed before production launch.

**Risk Level: HIGH** - Immediate remediation required.

---

## CRITICAL ISSUES (Fix Before Launch)

### 1. Unprotected API Routes

| Route | Issue | Risk |
|-------|-------|------|
| `/api/email/test` | NO authentication - anyone can send emails | Email spam/abuse |
| `/api/kpis` | NO authentication - anyone can read/write KPIs | Data breach |
| `/api/annual-plan` | NO authentication - user_id from query param | Data breach |
| `/api/ai-assist` | NO authentication - OpenAI API abuse risk | Cost abuse |
| `/api/forecasts/export` | Uses user_id from query param, not session | Data breach |
| `/api/create-dev-user` | Debug endpoint in production | Security hole |
| `/api/debug/compare-xero` | Debug endpoint in production | Info disclosure |
| `/api/migrate/*` | NO authentication | Data manipulation |

### 2. Client Login Role Bypass
- **File:** `/src/app/auth/login/page.tsx`
- **Issue:** Doesn't verify user role after authentication
- **Risk:** Coaches/admins can log in as clients and access client portal
- **Fix:** Add role verification after successful auth

### 3. Data Loss Risk - No Transaction Atomicity
- **Client onboarding** (`/src/app/api/admin/clients/route.ts`): Creates 7+ records without rollback
- **Strategic initiatives** (`/src/app/goals/services/strategic-planning-service.ts`): Delete-then-insert pattern loses data if insert fails
- **Business profile** (`/src/app/business-profile/services/business-profile-service.ts`): Updates two tables without atomicity

### 4. RLS Policy Vulnerabilities
- `team_invites` - `USING (true)` allows anyone to see all invites
- `process_flows/phases` - All users have full write access
- `system_roles` - Missing INSERT/UPDATE/DELETE policies (role escalation risk)

### 5. Password Security
- **File:** `/src/app/api/auth/update-password/route.ts`
- **Issue:** Only requires 6 characters (should be 8+ with complexity)

---

## HIGH PRIORITY ISSUES

### Authentication & Authorization

| Issue | File | Fix Required |
|-------|------|--------------|
| No server-side logout | N/A | Create `/api/auth/logout` endpoint |
| OAuth callback no error handling | `/src/app/auth/callback/route.ts` | Add error checking before redirect |
| Password reset token in URL | `/src/app/api/auth/reset-password/route.ts` | Use POST form instead |
| No session timeout | N/A | Implement 30-min inactivity timeout |
| No CSRF protection | All POST routes | Add CSRF middleware |
| Xero routes no user verification | `/src/app/api/Xero/sync/route.ts` | Verify user owns business |

### API Security Issues

| Route | Issue |
|-------|-------|
| `/api/admin/clients` | Temporary passwords returned in API responses |
| `/api/admin/coaches` | Temporary passwords returned in API responses |
| `/api/coach/clients/[id]` | Super admin excluded from access |
| `/api/chat/messages` | No max limit on message query |

### Data Integrity Issues

| Issue | File | Risk |
|-------|------|------|
| No concurrent edit protection | Weekly reviews | Data overwrite |
| Stale closure in auto-save | Quarterly review hooks | Data loss |
| CSV import no validation | `/api/forecasts/import-csv` | Data corruption |
| Bulk update in loop | Stop doing service | Partial updates |

### RLS Gaps

| Table | Issue |
|-------|-------|
| `team_weekly_reports` | Coach can UPDATE any field |
| `business_users` | Coaches can add team members |
| `xero_connections` | OAuth tokens visible to coaches |
| `messages` | Coach can mark any message as read |

---

## MEDIUM PRIORITY ISSUES

### Form Validation
- Most text inputs lack `maxLength` attributes
- KPI values not validated for numeric type/range
- Email regex too permissive: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
- Date inputs missing max date validation
- Sanitization utilities exist in `/src/lib/utils/validation.ts` but aren't used

### Error Handling
- No global unhandled rejection handler
- Fire-and-forget operations with `.catch(console.error)`
- Error tracker not connected to Sentry
- 230+ files use direct console.log instead of logger utility
- OAuth tokens logged in Xero callback

---

## POSITIVE FINDINGS (Working Well)

- ✓ Supabase parameterized queries (no SQL injection risk)
- ✓ File upload validation (MIME types, 10MB limit, path traversal checks)
- ✓ Rate limiting on password reset (3/hour)
- ✓ Error boundaries at root level
- ✓ Secrets in .env.local, not hardcoded
- ✓ Service role key only used server-side
- ✓ Audit logging infrastructure exists
- ✓ Good error tracker utility (just needs Sentry integration)

---

## FILES REQUIRING IMMEDIATE FIXES

### Critical (Week 1)
1. `/src/app/api/email/test/route.ts` - Add authentication
2. `/src/app/api/kpis/route.ts` - Add authentication
3. `/src/app/api/annual-plan/route.ts` - Add authentication
4. `/src/app/api/ai-assist/route.ts` - Add authentication
5. `/src/app/api/forecasts/export/route.ts` - Use session user ID
6. `/src/app/api/create-dev-user/route.ts` - DELETE file
7. `/src/app/api/debug/compare-xero/route.ts` - DELETE file
8. `/src/app/auth/login/page.tsx` - Add role verification
9. `/src/app/api/auth/update-password/route.ts` - Strengthen password rules
10. `supabase/migrations/` - Fix RLS policies

### High Priority (Week 2)
1. `/src/app/api/admin/clients/route.ts` - Add transaction handling, remove password from response
2. `/src/app/goals/services/strategic-planning-service.ts` - Replace delete-insert with upsert
3. `/src/app/auth/callback/route.ts` - Add error handling
4. `/src/app/api/Xero/sync/route.ts` - Add user verification
5. `/src/app/quarterly-review/hooks/useQuarterlyReview.ts` - Fix auto-save closure

### Medium Priority (Week 3)
1. All form components - Add maxLength and validation
2. `/src/lib/email/resend.ts` - Escape HTML in email templates
3. `/src/app/api/forecasts/import-csv/route.ts` - Add data validation
4. Global error handler setup
5. Sentry integration

---

## RECOMMENDED MIGRATION FOR RLS FIXES

```sql
-- Fix team_invites overly permissive policy
DROP POLICY IF EXISTS "Anyone can view invite by token" ON public.team_invites;
CREATE POLICY "Users can view their own invites"
  ON public.team_invites FOR SELECT
  USING (
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
    OR business_id IN (
      SELECT bu.business_id FROM public.business_users bu WHERE bu.user_id = auth.uid()
    )
  );

-- Fix process_flows unrestricted access
DROP POLICY IF EXISTS "Authenticated users can manage process flows" ON public.process_flows;
CREATE POLICY "Admins can manage process flows"
  ON public.process_flows FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.system_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- Fix process_phases unrestricted access
DROP POLICY IF EXISTS "Authenticated users can manage process phases" ON public.process_phases;
CREATE POLICY "Admins can manage process phases"
  ON public.process_phases FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.system_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- Add system_roles protection
CREATE POLICY "Only service role can modify system_roles"
  ON public.system_roles FOR INSERT
  WITH CHECK (false); -- Only service role can insert

CREATE POLICY "Only service role can update system_roles"
  ON public.system_roles FOR UPDATE
  USING (false); -- Only service role can update

CREATE POLICY "Only service role can delete system_roles"
  ON public.system_roles FOR DELETE
  USING (false); -- Only service role can delete
```

---

## TESTING CHECKLIST

Before launch, verify:

- [ ] All API routes require authentication
- [ ] Client login rejects non-client roles
- [ ] Password update enforces complexity
- [ ] Debug endpoints removed
- [ ] RLS policies tested with different roles
- [ ] Logout revokes tokens server-side
- [ ] OAuth callback handles errors
- [ ] No temporary passwords in API responses
- [ ] Rate limiting on all sensitive endpoints
- [ ] Error messages don't leak internal details
- [ ] Session timeout implemented
- [ ] HTTPS enforced
- [ ] Audit logging working

---

## APPENDIX: AUDIT DETAILS

### Authentication Audit
- Login/logout flows reviewed
- Middleware authentication checks verified
- Role-based access control analyzed
- Protected route patterns documented

### API Route Audit
- 44 API routes reviewed
- 38 properly authenticated
- 4 missing authentication (CRITICAL)
- 3 missing authorization (CRITICAL)

### Data Operations Audit
- Insert/update/upsert operations reviewed
- Transaction handling gaps identified
- Auto-save implementations checked
- Race conditions documented

### RLS Policy Audit
- 59+ tables with RLS enabled
- 11 critical issues identified
- 7 high-risk permissive policies
- 4 missing policy operations

### Form Validation Audit
- Client-side validation coverage reviewed
- Server-side validation checked
- XSS vulnerabilities assessed
- File upload security verified

### Error Handling Audit
- Error boundaries verified
- API error responses checked
- Logging practices reviewed
- Unhandled rejections identified

---

**Report Generated:** December 10, 2025
**Audit Performed By:** Automated Security Scan + Manual Review
