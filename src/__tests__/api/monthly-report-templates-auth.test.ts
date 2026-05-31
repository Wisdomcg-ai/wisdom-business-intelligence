/**
 * R24 (SEC-N1 / MNT-N1) — auth gate on /api/monthly-report/templates.
 *
 * The route's module-level Supabase client is service-role and bypasses RLS,
 * so before R24 any caller knowing a business_id could read or mutate another
 * tenant's report templates (cross-tenant IDOR). These tests lock the gate on
 * all four verbs:
 *   - unauthenticated  → 401, no DB work
 *   - no access        → 403, no DB work
 *   - authed + access  → proceeds to the data path (200)
 *
 * Mocks: @/lib/supabase/server (auth client), @/lib/utils/verify-business-access
 * (access decision), and @supabase/supabase-js (service-role client stub).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Auth-gate mocks ─────────────────────────────────────────────────────────

const mockGetUser = vi.fn(async () => ({
  data: { user: { id: 'user-1' } },
  error: null,
}));
vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}));

const mockVerifyBusinessAccess = vi.fn(async () => true);
vi.mock('@/lib/utils/verify-business-access', () => ({
  verifyBusinessAccess: (...args: any[]) => mockVerifyBusinessAccess(...args),
}));

// ─── Service-role client stub ────────────────────────────────────────────────
// Resolves every query chain to an empty success so the data path doesn't throw.
const mockFrom = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: mockFrom }),
}));

function makeChain(result: any = { data: [], error: null }) {
  const ctx: any = {};
  ctx.select = () => ctx;
  ctx.eq = () => ctx;
  ctx.neq = () => ctx;
  ctx.order = () => Promise.resolve(result);
  ctx.update = () => ctx;
  ctx.insert = () => ctx;
  ctx.delete = () => Promise.resolve({ error: null });
  ctx.single = async () => ({ data: { id: 'tpl-1' }, error: null });
  ctx.maybeSingle = async () => ({ data: { id: 'tpl-1' }, error: null });
  // `update(...).eq(...).eq(...)` is awaited directly in some paths.
  ctx.then = (resolve: any, reject: any) =>
    Promise.resolve({ data: null, error: null }).then(resolve, reject);
  return ctx;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getReq(qs = '?business_id=biz-1') {
  return new NextRequest(`http://test.local/api/monthly-report/templates${qs}`);
}
function bodyReq(body: any, method = 'POST') {
  return new NextRequest('http://test.local/api/monthly-report/templates', {
    method,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

const validPost = {
  business_id: 'biz-1',
  name: 'Default',
  sections: { a: true },
  column_settings: { x: 1 },
};

describe('R24 — /api/monthly-report/templates auth gate', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.local';
    process.env.SUPABASE_SERVICE_KEY = 'service-key';
    mockGetUser.mockReset();
    mockVerifyBusinessAccess.mockReset();
    mockFrom.mockReset();
    mockGetUser.mockImplementation(async () => ({
      data: { user: { id: 'user-1' } },
      error: null,
    }));
    mockVerifyBusinessAccess.mockImplementation(async () => true);
    mockFrom.mockImplementation(() => makeChain());
  });

  it('GET → 401 when unauthenticated, no DB access', async () => {
    mockGetUser.mockImplementation(async () => ({ data: { user: null }, error: null }));
    const { GET } = await import('@/app/api/monthly-report/templates/route');
    const res = await GET(getReq());
    expect(res.status).toBe(401);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('GET → 403 when user lacks access, no DB access', async () => {
    mockVerifyBusinessAccess.mockImplementation(async () => false);
    const { GET } = await import('@/app/api/monthly-report/templates/route');
    const res = await GET(getReq());
    expect(res.status).toBe(403);
    expect(mockVerifyBusinessAccess).toHaveBeenCalledWith('user-1', 'biz-1');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('GET → 200 when authed with access', async () => {
    const { GET } = await import('@/app/api/monthly-report/templates/route');
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    expect(mockFrom).toHaveBeenCalled();
  });

  it('POST → 403 when user lacks access', async () => {
    mockVerifyBusinessAccess.mockImplementation(async () => false);
    const { POST } = await import('@/app/api/monthly-report/templates/route');
    const res = await POST(bodyReq(validPost));
    expect(res.status).toBe(403);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('PUT → 403 when user lacks access', async () => {
    mockVerifyBusinessAccess.mockImplementation(async () => false);
    const { PUT } = await import('@/app/api/monthly-report/templates/route');
    const res = await PUT(bodyReq({ id: 'tpl-1', business_id: 'biz-1' }, 'PUT'));
    expect(res.status).toBe(403);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('DELETE → 403 when user lacks access', async () => {
    mockVerifyBusinessAccess.mockImplementation(async () => false);
    const { DELETE } = await import('@/app/api/monthly-report/templates/route');
    const res = await DELETE(getReq('?id=tpl-1&business_id=biz-1'));
    expect(res.status).toBe(403);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('verb-level 400 (missing business_id) short-circuits before the auth gate', async () => {
    const { GET } = await import('@/app/api/monthly-report/templates/route');
    const res = await GET(getReq(''));
    expect(res.status).toBe(400);
    expect(mockVerifyBusinessAccess).not.toHaveBeenCalled();
  });
});
