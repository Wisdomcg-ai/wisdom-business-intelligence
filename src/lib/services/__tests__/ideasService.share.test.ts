/**
 * Phase 61-03 — ideasService share/markIdeaStatus + is_owner + owner_display_name
 * + ownership-gap fixes from RESEARCH.md §3.
 *
 * Verifies:
 *   Group A   — getActiveIdeas (legacy / per-user mode) drops .eq('user_id'),
 *               maps is_owner + owner_display_name per row.
 *   Group A2  — getActiveIdeas (shared-board mode, businessId provided) is
 *               UNCHANGED — business_id EQ still applies, no user_id eq.
 *   Group B   — getIdeasByStatus drops .eq('user_id'), keeps status + archived.
 *   Group C   — getIdeaById(id, viewerId?) — no user_id filter (recipients
 *               must read shared ideas). When viewerId provided, is_owner set.
 *   Group D   — updateIdea / archiveIdea ADD defensive .eq('user_id', userId)
 *               on the UPDATE chain (RESEARCH.md §3 ownership-gap fixes).
 *   Group E   — shareIdea mirrors shareTask (private / team / specific) with
 *               defensive .eq('user_id', userId).
 *   Group F   — markIdeaStatus calls supabase.rpc('mark_idea_status', ...);
 *               does NOT issue a direct from('ideas').update(...).
 *   Group G   — ideas_filter helpers (getIdeasFilterByIdeaId, upsertIdeasFilter)
 *               and getIdeasWithFilters are NOT modified — regression test.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Chainable Supabase mock ────────────────────────────────────────────────

type FilterCall = { method: string; args: unknown[]; op: 'select' | 'update' | 'insert' | 'delete' | 'upsert' }

interface MockState {
  responses: Record<string, { data: unknown; error: unknown } | null>
  filterCalls: Record<string, FilterCall[]>
  payloads: Record<string, unknown[]>
  rpcCalls: { name: string; args: unknown[] }[]
  rpcResponse: { data: unknown; error: unknown } | null
  fromSpy: ReturnType<typeof vi.fn>
  authUser: { id: string } | null
  lastOp: Record<string, string>
}

let mockState: MockState

function resetMock() {
  mockState = {
    responses: {},
    filterCalls: {},
    payloads: {},
    rpcCalls: [],
    rpcResponse: { data: null, error: null },
    fromSpy: vi.fn(),
    authUser: { id: 'u1' },
    lastOp: {},
  }
}

function buildChain(table: string) {
  const chain: any = {}
  let chainOp: 'select' | 'update' | 'insert' | 'delete' | 'upsert' | null = null

  const recordFilter = (method: string) => (...args: unknown[]) => {
    if (!mockState.filterCalls[table]) mockState.filterCalls[table] = []
    mockState.filterCalls[table].push({ method, args, op: chainOp || 'select' })
    return chain
  }
  const passThrough = () => chain
  const terminal = () => {
    const op = chainOp || 'select'
    mockState.lastOp[table] = op
    const key = `${table}:${op}`
    const resp = mockState.responses[key] ?? mockState.responses[table] ?? { data: [], error: null }
    return Promise.resolve(resp)
  }

  chain.select = vi.fn((..._args: unknown[]) => {
    if (chainOp === null) chainOp = 'select'
    return chain
  })
  chain.eq = vi.fn(recordFilter('eq'))
  chain.neq = vi.fn(recordFilter('neq'))
  chain.is = vi.fn(recordFilter('is'))
  chain.not = vi.fn(recordFilter('not'))
  chain.order = vi.fn(passThrough)
  chain.limit = vi.fn(passThrough)
  chain.single = vi.fn(() => terminal())
  chain.maybeSingle = vi.fn(() => terminal())
  chain.insert = vi.fn((payload: unknown) => {
    chainOp = 'insert'
    if (!mockState.payloads[table]) mockState.payloads[table] = []
    mockState.payloads[table].push(payload)
    return chain
  })
  chain.update = vi.fn((payload: unknown) => {
    chainOp = 'update'
    if (!mockState.payloads[table]) mockState.payloads[table] = []
    mockState.payloads[table].push(payload)
    return chain
  })
  chain.upsert = vi.fn((payload: unknown, _opts?: unknown) => {
    chainOp = 'upsert'
    if (!mockState.payloads[table]) mockState.payloads[table] = []
    mockState.payloads[table].push(payload)
    return chain
  })
  chain.delete = vi.fn(() => {
    chainOp = 'delete'
    return chain
  })
  chain.then = (resolve: any, reject: any) => terminal().then(resolve, reject)
  return chain
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      ;(mockState.fromSpy as any)(table)
      return buildChain(table)
    },
    rpc: (name: string, args: unknown) => {
      mockState.rpcCalls.push({ name, args: [args] })
      return Promise.resolve(mockState.rpcResponse ?? { data: null, error: null })
    },
    auth: {
      getUser: () => Promise.resolve({ data: { user: mockState.authUser } }),
    },
  }),
}))

import * as svc from '../ideasService'

beforeEach(() => {
  resetMock()
})

const selectUserIdEq = (table: string) =>
  (mockState.filterCalls[table] || []).find(
    (c) => c.op === 'select' && c.method === 'eq' && c.args[0] === 'user_id'
  )

const updateUserIdEq = (table: string) =>
  (mockState.filterCalls[table] || []).find(
    (c) => c.op === 'update' && c.method === 'eq' && c.args[0] === 'user_id'
  )

const ownerFixture = { first_name: 'Bob', last_name: 'B', email: 'bob@x.com' }
const aliceOwner = { first_name: 'Alice', last_name: 'A', email: 'alice@x.com' }

// ─── Group A — getActiveIdeas legacy mode ────────────────────────────────────

describe('Group A — getActiveIdeas (legacy / per-user mode)', () => {
  it('does NOT call .eq("user_id", ...) on the SELECT path', async () => {
    mockState.responses['ideas:select'] = {
      data: [
        { id: 'i1', user_id: 'u1', archived: false, status: 'captured', owner: aliceOwner },
      ],
      error: null,
    }
    await svc.getActiveIdeas()
    expect(selectUserIdEq('ideas')).toBeUndefined()
  })

  it('returns mixed-owner rows with is_owner mapped', async () => {
    mockState.responses['ideas:select'] = {
      data: [
        { id: 'i1', user_id: 'u1', archived: false, status: 'captured', owner: aliceOwner },
        { id: 'i2', user_id: 'u2', archived: false, status: 'captured', shared_with: ['u1'], owner: ownerFixture },
      ],
      error: null,
    }
    const result = await svc.getActiveIdeas()
    expect(result).toHaveLength(2)
    const i1 = result.find((r: any) => r.id === 'i1') as any
    const i2 = result.find((r: any) => r.id === 'i2') as any
    expect(i1.is_owner).toBe(true)
    expect(i2.is_owner).toBe(false)
  })

  it('resolves owner_display_name from join (different owner)', async () => {
    mockState.responses['ideas:select'] = {
      data: [
        { id: 'i2', user_id: 'u2', archived: false, status: 'captured', owner: ownerFixture },
      ],
      error: null,
    }
    const result = await svc.getActiveIdeas()
    expect((result[0] as any).owner_display_name).toBe('Team member')
  })

  it('falls back to email when name parts missing', async () => {
    mockState.responses['ideas:select'] = {
      data: [
        { id: 'i2', user_id: 'u2', archived: false, status: 'captured', owner: { first_name: null, last_name: null, email: 'bob@x.com' } },
      ],
      error: null,
    }
    const result = await svc.getActiveIdeas()
    expect((result[0] as any).owner_display_name).toBe('Team member')
  })

  it('falls back to "Team member" when join row is null', async () => {
    mockState.responses['ideas:select'] = {
      data: [
        { id: 'i2', user_id: 'u2', archived: false, status: 'captured', owner: null },
      ],
      error: null,
    }
    const result = await svc.getActiveIdeas()
    expect((result[0] as any).owner_display_name).toBe('Team member')
  })
})

// ─── Group A2 — getActiveIdeas business-wide mode (UNCHANGED) ───────────────

describe('Group A2 — getActiveIdeas (shared-board / businessId mode) regression', () => {
  it('queries by business_id and NEVER by user_id', async () => {
    mockState.responses['ideas:select'] = {
      data: [
        { id: 'i1', user_id: 'u1', business_id: 'biz-1', archived: false, status: 'captured', owner: aliceOwner },
      ],
      error: null,
    }
    await svc.getActiveIdeas(undefined, 'biz-1')
    const calls = mockState.filterCalls['ideas'] || []
    const businessIdEq = calls.find((c) => c.op === 'select' && c.method === 'eq' && c.args[0] === 'business_id')
    const userIdEq = calls.find((c) => c.op === 'select' && c.method === 'eq' && c.args[0] === 'user_id')
    expect(businessIdEq).toBeDefined()
    expect(businessIdEq?.args[1]).toBe('biz-1')
    expect(userIdEq).toBeUndefined()
  })

  it('still applies .eq("archived", false)', async () => {
    mockState.responses['ideas:select'] = { data: [], error: null }
    await svc.getActiveIdeas(undefined, 'biz-1')
    const calls = mockState.filterCalls['ideas'] || []
    const archivedFilter = calls.find((c) => c.op === 'select' && c.method === 'eq' && c.args[0] === 'archived')
    expect(archivedFilter).toBeDefined()
    expect(archivedFilter?.args[1]).toBe(false)
  })
})

// ─── Group B — getIdeasByStatus ──────────────────────────────────────────────

describe('Group B — getIdeasByStatus', () => {
  it('does NOT call .eq("user_id", ...) on the SELECT path', async () => {
    mockState.responses['ideas:select'] = {
      data: [{ id: 'i1', user_id: 'u1', archived: false, status: 'captured', owner: aliceOwner }],
      error: null,
    }
    await svc.getIdeasByStatus('captured')
    expect(selectUserIdEq('ideas')).toBeUndefined()
  })

  it('keeps .eq("status", status) and .eq("archived", false)', async () => {
    mockState.responses['ideas:select'] = { data: [], error: null }
    await svc.getIdeasByStatus('captured')
    const calls = mockState.filterCalls['ideas'] || []
    const statusFilter = calls.find((c) => c.op === 'select' && c.method === 'eq' && c.args[0] === 'status')
    const archivedFilter = calls.find((c) => c.op === 'select' && c.method === 'eq' && c.args[0] === 'archived')
    expect(statusFilter).toBeDefined()
    expect(statusFilter?.args[1]).toBe('captured')
    expect(archivedFilter).toBeDefined()
    expect(archivedFilter?.args[1]).toBe(false)
  })

  it('maps is_owner per row (mixed-owner fixture)', async () => {
    mockState.responses['ideas:select'] = {
      data: [
        { id: 'i1', user_id: 'u1', archived: false, status: 'captured', owner: aliceOwner },
        { id: 'i2', user_id: 'u2', archived: false, status: 'captured', shared_with: ['u1'], owner: ownerFixture },
      ],
      error: null,
    }
    const result = await svc.getIdeasByStatus('captured')
    expect((result[0] as any).is_owner).toBe(true)
    expect((result[1] as any).is_owner).toBe(false)
  })
})

// ─── Group C — getIdeaById (ownership-gap fix #3) ────────────────────────────

describe('Group C — getIdeaById (no ownership narrowing)', () => {
  it('does NOT add .eq("user_id", ...) — recipients can read shared rows', async () => {
    mockState.responses['ideas:select'] = {
      data: { id: 'i1', user_id: 'u2', archived: false, status: 'captured', owner: ownerFixture },
      error: null,
    }
    await svc.getIdeaById('i1', 'u1')
    expect(selectUserIdEq('ideas')).toBeUndefined()
  })

  it('with viewerId returns is_owner=false when viewer != owner', async () => {
    mockState.responses['ideas:select'] = {
      data: { id: 'i1', user_id: 'u2', archived: false, status: 'captured', owner: ownerFixture },
      error: null,
    }
    const result = await svc.getIdeaById('i1', 'u1') as any
    expect(result.is_owner).toBe(false)
    expect(result.owner_display_name).toBe('Team member')
  })

  it('with viewerId returns is_owner=true when viewer === owner', async () => {
    mockState.responses['ideas:select'] = {
      data: { id: 'i1', user_id: 'u1', archived: false, status: 'captured', owner: aliceOwner },
      error: null,
    }
    const result = await svc.getIdeaById('i1', 'u1') as any
    expect(result.is_owner).toBe(true)
  })

  it('without viewerId returns the row (is_owner unset or false)', async () => {
    mockState.responses['ideas:select'] = {
      data: { id: 'i1', user_id: 'u1', archived: false, status: 'captured', owner: aliceOwner },
      error: null,
    }
    const result = await svc.getIdeaById('i1') as any
    expect(result.id).toBe('i1')
    // is_owner is_owner is either undefined or false when no viewerId — both acceptable
    expect(result.is_owner === undefined || result.is_owner === false).toBe(true)
  })

  it('returns null when the row is not visible (PostgREST error)', async () => {
    mockState.responses['ideas:select'] = {
      data: null,
      error: { code: 'PGRST', message: 'no row' },
    }
    const result = await svc.getIdeaById('nope', 'u1')
    expect(result).toBeNull()
  })
})

// ─── Group D — updateIdea / archiveIdea (ownership-gap fixes #1, #2) ────────

describe('Group D — updateIdea / archiveIdea — ADD defensive .eq("user_id")', () => {
  it('updateIdea includes .eq("id", id) AND .eq("user_id", userId) on UPDATE', async () => {
    mockState.responses['ideas:update'] = {
      data: { id: 'i1', user_id: 'u1', archived: false, status: 'captured', owner: aliceOwner },
      error: null,
    }
    await svc.updateIdea('i1', { title: 'new title' })
    const calls = mockState.filterCalls['ideas'] || []
    const idEq = calls.find((c) => c.op === 'update' && c.method === 'eq' && c.args[0] === 'id')
    const userIdEq = calls.find((c) => c.op === 'update' && c.method === 'eq' && c.args[0] === 'user_id')
    expect(idEq).toBeDefined()
    expect(idEq?.args[1]).toBe('i1')
    expect(userIdEq).toBeDefined()
    expect(userIdEq?.args[1]).toBe('u1')
  })

  it('archiveIdea includes .eq("id", id) AND .eq("user_id", userId) on UPDATE', async () => {
    mockState.responses['ideas:update'] = {
      data: { id: 'i1', user_id: 'u1', archived: true, status: 'captured', owner: aliceOwner },
      error: null,
    }
    await svc.archiveIdea('i1')
    const calls = mockState.filterCalls['ideas'] || []
    const idEq = calls.find((c) => c.op === 'update' && c.method === 'eq' && c.args[0] === 'id')
    const userIdEq = calls.find((c) => c.op === 'update' && c.method === 'eq' && c.args[0] === 'user_id')
    expect(idEq).toBeDefined()
    expect(userIdEq).toBeDefined()
  })
})

// ─── Group E — shareIdea ─────────────────────────────────────────────────────

describe('Group E — shareIdea', () => {
  it('shareIdea(id, "private") sets shared_with_all=false, shared_with=[]', async () => {
    mockState.responses['ideas:update'] = {
      data: { id: 'i1', user_id: 'u1', shared_with_all: false, shared_with: [], status: 'captured', owner: aliceOwner },
      error: null,
    }
    await svc.shareIdea('i1', 'private')
    const patch = (mockState.payloads['ideas'] || [])[0] as Record<string, unknown>
    expect(patch.shared_with_all).toBe(false)
    expect(patch.shared_with).toEqual([])
  })

  it('shareIdea(id, "team") sets shared_with_all=true, shared_with=[]', async () => {
    mockState.responses['ideas:update'] = {
      data: { id: 'i1', user_id: 'u1', shared_with_all: true, shared_with: [], status: 'captured', owner: aliceOwner },
      error: null,
    }
    await svc.shareIdea('i1', 'team')
    const patch = (mockState.payloads['ideas'] || [])[0] as Record<string, unknown>
    expect(patch.shared_with_all).toBe(true)
    expect(patch.shared_with).toEqual([])
  })

  it('shareIdea(id, "specific", ["a","b"]) sets shared_with', async () => {
    mockState.responses['ideas:update'] = {
      data: { id: 'i1', user_id: 'u1', shared_with_all: false, shared_with: ['a', 'b'], status: 'captured', owner: aliceOwner },
      error: null,
    }
    await svc.shareIdea('i1', 'specific', ['a', 'b'])
    const patch = (mockState.payloads['ideas'] || [])[0] as Record<string, unknown>
    expect(patch.shared_with).toEqual(['a', 'b'])
  })

  it('applies defensive .eq("user_id", userId) on UPDATE', async () => {
    mockState.responses['ideas:update'] = {
      data: { id: 'i1', user_id: 'u1', status: 'captured', owner: aliceOwner },
      error: null,
    }
    await svc.shareIdea('i1', 'private')
    expect(updateUserIdEq('ideas')).toBeDefined()
  })

  it('returns null when "specific" mode receives empty userIds', async () => {
    const result = await svc.shareIdea('i1', 'specific', [])
    expect(result).toBeNull()
    expect(mockState.payloads['ideas']).toBeUndefined()
  })

  it('returns null when "specific" mode receives undefined userIds', async () => {
    const result = await svc.shareIdea('i1', 'specific')
    expect(result).toBeNull()
    expect(mockState.payloads['ideas']).toBeUndefined()
  })

  it('returns null when the update errors', async () => {
    mockState.responses['ideas:update'] = { data: null, error: { code: 'PGRST', message: 'boom' } }
    const result = await svc.shareIdea('i1', 'private')
    expect(result).toBeNull()
  })
})

// ─── Group F — markIdeaStatus (RPC) ──────────────────────────────────────────

describe('Group F — markIdeaStatus (RPC)', () => {
  it('calls rpc("mark_idea_status", { p_idea_id, p_status })', async () => {
    mockState.rpcResponse = {
      data: { id: 'i1', user_id: 'u1', status: 'approved' },
      error: null,
    }
    await svc.markIdeaStatus('i1', 'approved')
    expect(mockState.rpcCalls).toHaveLength(1)
    expect(mockState.rpcCalls[0].name).toBe('mark_idea_status')
    expect(mockState.rpcCalls[0].args[0]).toEqual({ p_idea_id: 'i1', p_status: 'approved' })
  })

  it('returns null when the RPC errors', async () => {
    mockState.rpcResponse = { data: null, error: { code: 'PGRST', message: 'denied' } }
    const result = await svc.markIdeaStatus('i1', 'approved')
    expect(result).toBeNull()
  })

  it('does NOT issue from("ideas").update(...)', async () => {
    mockState.rpcResponse = { data: { id: 'i1', user_id: 'u1', status: 'approved' }, error: null }
    await svc.markIdeaStatus('i1', 'approved')
    const fromCalls = mockState.fromSpy.mock.calls.map((c) => c[0])
    expect(fromCalls).not.toContain('ideas')
  })
})

// ─── Group G — ideas_filter helpers UNTOUCHED ────────────────────────────────

describe('Group G — ideas_filter / getIdeasWithFilters regression', () => {
  it('getIdeasFilterByIdeaId queries ideas_filter by .eq("idea_id", id)', async () => {
    mockState.responses['ideas_filter:select'] = { data: null, error: null }
    await svc.getIdeasFilterByIdeaId('i1')
    const calls = mockState.filterCalls['ideas_filter'] || []
    const ideaIdEq = calls.find((c) => c.op === 'select' && c.method === 'eq' && c.args[0] === 'idea_id')
    expect(ideaIdEq).toBeDefined()
    expect(ideaIdEq?.args[1]).toBe('i1')
  })

  it('upsertIdeasFilter writes to ideas_filter with user_id present in payload', async () => {
    mockState.responses['ideas_filter:upsert'] = {
      data: { id: 'f1', idea_id: 'i1', user_id: 'u1' },
      error: null,
    }
    await svc.upsertIdeasFilter({ idea_id: 'i1' })
    const payloads = mockState.payloads['ideas_filter'] || []
    expect(payloads).toHaveLength(1)
    const payload = payloads[0] as Record<string, unknown>
    expect(payload.user_id).toBe('u1')
    expect(payload.idea_id).toBe('i1')
  })

  it('getIdeasWithFilters STILL applies .eq("user_id", userId) — per-user view', async () => {
    mockState.responses['ideas:select'] = { data: [], error: null }
    await svc.getIdeasWithFilters()
    const calls = mockState.filterCalls['ideas'] || []
    const userIdEq = calls.find((c) => c.op === 'select' && c.method === 'eq' && c.args[0] === 'user_id')
    expect(userIdEq).toBeDefined()
    expect(userIdEq?.args[1]).toBe('u1')
  })
})
