/**
 * Phase 61-03 — dailyTasksService share/markComplete + is_owner + owner_display_name
 *
 * Verifies:
 *   - READ functions (getTodaysTasks, getAllTasks, getTodaysCompletedTasks, getArchivedTasks):
 *     - DROP `.eq('user_id', userId)` (RLS enforces visibility)
 *     - Map `is_owner` from row.user_id vs viewerId
 *     - Map `owner_display_name` from joined users row (or fallbacks)
 *   - `shareTask(id, mode, userIds?, overrideUserId?)`:
 *     - private / team / specific patches
 *     - defensive `.eq('user_id', userId)` filter
 *     - rejects specific mode with empty/undefined userIds
 *   - `markTaskComplete(id, completed)`:
 *     - calls supabase.rpc('mark_task_complete', { p_task_id, p_completed })
 *     - does NOT issue a direct from('daily_tasks').update(...)
 *   - Owner-only mutations (updateTaskStatus, updateTaskPriority, updateTaskDueDate,
 *     deleteTask, deleteArchivedTasks) RETAIN their `.eq('user_id', userId)` filter.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Chainable Supabase mock ────────────────────────────────────────────────

type FilterCall = { method: string; args: unknown[] }

interface MockState {
  // Per-table per-op response shape: { data, error }
  responses: Record<string, { data: unknown; error: unknown } | null>
  // Captured filter calls per table
  filterCalls: Record<string, FilterCall[]>
  // Captured update/delete/insert payloads per table
  payloads: Record<string, unknown[]>
  // Captured RPC calls
  rpcCalls: { name: string; args: unknown[] }[]
  rpcResponse: { data: unknown; error: unknown } | null
  // Spy for from()
  fromSpy: ReturnType<typeof vi.fn>
  authUser: { id: string } | null
  // Last operation per table (for response keying: 'select' | 'update' | 'insert' | 'delete')
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
  const recordFilter = (method: string) => (...args: unknown[]) => {
    if (!mockState.filterCalls[table]) mockState.filterCalls[table] = []
    mockState.filterCalls[table].push({ method, args })
    return chain
  }
  const passThrough = () => chain
  const terminal = () => {
    const key = `${table}:${mockState.lastOp[table] || 'select'}`
    const resp = mockState.responses[key] ?? mockState.responses[table] ?? { data: [], error: null }
    return Promise.resolve(resp)
  }

  chain.select = vi.fn((..._args: unknown[]) => {
    if (!mockState.lastOp[table]) mockState.lastOp[table] = 'select'
    return chain
  })
  chain.eq = vi.fn(recordFilter('eq'))
  chain.neq = vi.fn(recordFilter('neq'))
  chain.is = vi.fn(recordFilter('is'))
  chain.not = vi.fn(recordFilter('not'))
  chain.gte = vi.fn(recordFilter('gte'))
  chain.lt = vi.fn(recordFilter('lt'))
  chain.lte = vi.fn(recordFilter('lte'))
  chain.order = vi.fn(passThrough)
  chain.limit = vi.fn(passThrough)
  chain.single = vi.fn(() => terminal())
  chain.maybeSingle = vi.fn(() => terminal())
  chain.insert = vi.fn((payload: unknown) => {
    mockState.lastOp[table] = 'insert'
    if (!mockState.payloads[table]) mockState.payloads[table] = []
    mockState.payloads[table].push(payload)
    return chain
  })
  chain.update = vi.fn((payload: unknown) => {
    mockState.lastOp[table] = 'update'
    if (!mockState.payloads[table]) mockState.payloads[table] = []
    mockState.payloads[table].push(payload)
    return chain
  })
  chain.delete = vi.fn(() => {
    mockState.lastOp[table] = 'delete'
    return chain
  })
  // Allow `await` directly on the chain (for non-.single() queries)
  chain.then = (resolve: any, reject: any) => terminal().then(resolve, reject)
  return chain
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      mockState.fromSpy(table)
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

// ─── Import AFTER mock is set up ─────────────────────────────────────────────

import * as svc from '../dailyTasksService'

beforeEach(() => {
  resetMock()
})

// ─── Group A — READ broadening + is_owner + owner_display_name ──────────────

describe('Group A — READ broadening + is_owner + owner_display_name', () => {
  it('getTodaysTasks does NOT call .eq("user_id", ...) on daily_tasks', async () => {
    mockState.responses['daily_tasks:select'] = {
      data: [
        { id: 't1', user_id: 'u1', status: 'to-do', archived_at: null, owner: { first_name: 'Alice', last_name: 'A', email: 'alice@x.com' } },
      ],
      error: null,
    }
    await svc.getTodaysTasks()
    const calls = mockState.filterCalls['daily_tasks'] || []
    const userIdEq = calls.find((c) => c.method === 'eq' && c.args[0] === 'user_id')
    expect(userIdEq).toBeUndefined()
  })

  it('getTodaysTasks maps is_owner correctly for owner + recipient rows', async () => {
    mockState.responses['daily_tasks:select'] = {
      data: [
        { id: 't1', user_id: 'u1', status: 'to-do', archived_at: null, owner: { first_name: 'Alice', last_name: 'A', email: 'alice@x.com' } },
        { id: 't2', user_id: 'u2', status: 'to-do', archived_at: null, shared_with: ['u1'], owner: { first_name: 'Bob', last_name: 'B', email: 'bob@x.com' } },
      ],
      error: null,
    }
    const result = await svc.getTodaysTasks()
    expect(result).toHaveLength(2)
    const t1 = result.find((r: any) => r.id === 't1')!
    const t2 = result.find((r: any) => r.id === 't2')!
    expect((t1 as any).is_owner).toBe(true)
    expect((t2 as any).is_owner).toBe(false)
  })

  it('getTodaysTasks resolves owner_display_name "First Last" when both name parts present', async () => {
    mockState.responses['daily_tasks:select'] = {
      data: [
        { id: 't2', user_id: 'u2', status: 'to-do', archived_at: null, owner: { first_name: 'Bob', last_name: 'B', email: 'bob@x.com' } },
      ],
      error: null,
    }
    const result = await svc.getTodaysTasks()
    expect((result[0] as any).owner_display_name).toBe('Bob B')
  })

  it('getTodaysTasks falls back to email when name parts missing', async () => {
    mockState.responses['daily_tasks:select'] = {
      data: [
        { id: 't2', user_id: 'u2', status: 'to-do', archived_at: null, owner: { first_name: null, last_name: null, email: 'bob@x.com' } },
      ],
      error: null,
    }
    const result = await svc.getTodaysTasks()
    expect((result[0] as any).owner_display_name).toBe('bob@x.com')
  })

  it('getTodaysTasks falls back to "Team member" when join row is null', async () => {
    mockState.responses['daily_tasks:select'] = {
      data: [
        { id: 't2', user_id: 'u2', status: 'to-do', archived_at: null, owner: null },
      ],
      error: null,
    }
    const result = await svc.getTodaysTasks()
    expect((result[0] as any).owner_display_name).toBe('Team member')
  })

  it('getTodaysTasks keeps status and archived_at filters', async () => {
    mockState.responses['daily_tasks:select'] = { data: [], error: null }
    await svc.getTodaysTasks()
    const calls = mockState.filterCalls['daily_tasks'] || []
    const statusFilter = calls.find((c) => c.method === 'neq' && c.args[0] === 'status')
    const archivedFilter = calls.find((c) => c.method === 'is' && c.args[0] === 'archived_at')
    expect(statusFilter).toBeDefined()
    expect(archivedFilter).toBeDefined()
  })

  it('getAllTasks does NOT call .eq("user_id", ...) on daily_tasks', async () => {
    mockState.responses['daily_tasks:select'] = {
      data: [
        { id: 't1', user_id: 'u1', status: 'to-do', owner: { first_name: 'Alice', last_name: 'A', email: 'a@x.com' } },
      ],
      error: null,
    }
    await svc.getAllTasks()
    const calls = mockState.filterCalls['daily_tasks'] || []
    const userIdEq = calls.find((c) => c.method === 'eq' && c.args[0] === 'user_id')
    expect(userIdEq).toBeUndefined()
  })

  it('getAllTasks maps is_owner per row', async () => {
    mockState.responses['daily_tasks:select'] = {
      data: [
        { id: 't1', user_id: 'u1', status: 'to-do', owner: { first_name: 'Alice', last_name: 'A', email: 'a@x.com' } },
        { id: 't2', user_id: 'u2', status: 'to-do', shared_with: ['u1'], owner: { first_name: 'Bob', last_name: 'B', email: 'b@x.com' } },
      ],
      error: null,
    }
    const result = await svc.getAllTasks()
    expect((result[0] as any).is_owner).toBe(true)
    expect((result[1] as any).is_owner).toBe(false)
  })

  it('getTodaysCompletedTasks does NOT call .eq("user_id", ...) on daily_tasks', async () => {
    mockState.responses['daily_tasks:select'] = { data: [], error: null }
    await svc.getTodaysCompletedTasks()
    const calls = mockState.filterCalls['daily_tasks'] || []
    const userIdEq = calls.find((c) => c.method === 'eq' && c.args[0] === 'user_id')
    expect(userIdEq).toBeUndefined()
  })

  it('getArchivedTasks does NOT call .eq("user_id", ...) on daily_tasks', async () => {
    mockState.responses['daily_tasks:select'] = { data: [], error: null }
    await svc.getArchivedTasks()
    const calls = mockState.filterCalls['daily_tasks'] || []
    const userIdEq = calls.find((c) => c.method === 'eq' && c.args[0] === 'user_id')
    expect(userIdEq).toBeUndefined()
  })
})

// ─── Group B — shareTask ─────────────────────────────────────────────────────

describe('Group B — shareTask', () => {
  it('shareTask("t1", "private") sets shared_with_all=false, shared_with=[]', async () => {
    mockState.responses['daily_tasks:update'] = {
      data: { id: 't1', user_id: 'u1', shared_with_all: false, shared_with: [], owner: { first_name: 'Alice', last_name: 'A', email: 'a@x.com' } },
      error: null,
    }
    await svc.shareTask('t1', 'private')
    const payloads = mockState.payloads['daily_tasks'] || []
    expect(payloads).toHaveLength(1)
    const patch = payloads[0] as Record<string, unknown>
    expect(patch.shared_with_all).toBe(false)
    expect(patch.shared_with).toEqual([])
  })

  it('shareTask("t1", "team") sets shared_with_all=true, shared_with=[]', async () => {
    mockState.responses['daily_tasks:update'] = {
      data: { id: 't1', user_id: 'u1', shared_with_all: true, shared_with: [], owner: { first_name: 'Alice', last_name: 'A', email: 'a@x.com' } },
      error: null,
    }
    await svc.shareTask('t1', 'team')
    const patch = (mockState.payloads['daily_tasks'] || [])[0] as Record<string, unknown>
    expect(patch.shared_with_all).toBe(true)
    expect(patch.shared_with).toEqual([])
  })

  it('shareTask("t1", "specific", ["a","b"]) sets shared_with_all=false, shared_with=["a","b"]', async () => {
    mockState.responses['daily_tasks:update'] = {
      data: { id: 't1', user_id: 'u1', shared_with_all: false, shared_with: ['a', 'b'], owner: { first_name: 'Alice', last_name: 'A', email: 'a@x.com' } },
      error: null,
    }
    await svc.shareTask('t1', 'specific', ['a', 'b'])
    const patch = (mockState.payloads['daily_tasks'] || [])[0] as Record<string, unknown>
    expect(patch.shared_with_all).toBe(false)
    expect(patch.shared_with).toEqual(['a', 'b'])
  })

  it('shareTask defensively applies .eq("user_id", userId)', async () => {
    mockState.responses['daily_tasks:update'] = {
      data: { id: 't1', user_id: 'u1', owner: { first_name: 'Alice', last_name: 'A', email: 'a@x.com' } },
      error: null,
    }
    await svc.shareTask('t1', 'private')
    const calls = mockState.filterCalls['daily_tasks'] || []
    const userIdEq = calls.find((c) => c.method === 'eq' && c.args[0] === 'user_id')
    expect(userIdEq).toBeDefined()
    expect(userIdEq?.args[1]).toBe('u1')
  })

  it('shareTask("t1", "specific", []) returns null (validation)', async () => {
    const result = await svc.shareTask('t1', 'specific', [])
    expect(result).toBeNull()
    // Should NOT have called update at all
    expect(mockState.payloads['daily_tasks']).toBeUndefined()
  })

  it('shareTask("t1", "specific") (undefined userIds) returns null', async () => {
    const result = await svc.shareTask('t1', 'specific')
    expect(result).toBeNull()
    expect(mockState.payloads['daily_tasks']).toBeUndefined()
  })

  it('shareTask returns null when update errors', async () => {
    mockState.responses['daily_tasks:update'] = {
      data: null,
      error: { code: 'PGRST', message: 'boom' },
    }
    const result = await svc.shareTask('t1', 'private')
    expect(result).toBeNull()
  })
})

// ─── Group C — markTaskComplete ──────────────────────────────────────────────

describe('Group C — markTaskComplete (RPC)', () => {
  it('markTaskComplete(id, true) calls rpc with correct args', async () => {
    mockState.rpcResponse = {
      data: { id: 't1', user_id: 'u1', status: 'done', completed_at: '2026-05-14T00:00:00Z' },
      error: null,
    }
    await svc.markTaskComplete('t1', true)
    expect(mockState.rpcCalls).toHaveLength(1)
    expect(mockState.rpcCalls[0].name).toBe('mark_task_complete')
    expect(mockState.rpcCalls[0].args[0]).toEqual({ p_task_id: 't1', p_completed: true })
  })

  it('markTaskComplete(id, false) calls rpc with p_completed=false', async () => {
    mockState.rpcResponse = {
      data: { id: 't1', user_id: 'u1', status: 'to-do', completed_at: null },
      error: null,
    }
    await svc.markTaskComplete('t1', false)
    expect(mockState.rpcCalls[0].args[0]).toEqual({ p_task_id: 't1', p_completed: false })
  })

  it('markTaskComplete returns null when RPC errors', async () => {
    mockState.rpcResponse = { data: null, error: { code: 'PGRST', message: 'access denied' } }
    const result = await svc.markTaskComplete('t1', true)
    expect(result).toBeNull()
  })

  it('markTaskComplete does NOT issue from("daily_tasks").update(...)', async () => {
    mockState.rpcResponse = {
      data: { id: 't1', user_id: 'u1', status: 'done' },
      error: null,
    }
    await svc.markTaskComplete('t1', true)
    // from('daily_tasks') should never have been invoked
    const fromCalls = mockState.fromSpy.mock.calls.map((c) => c[0])
    expect(fromCalls).not.toContain('daily_tasks')
  })
})

// ─── Group D — Owner-only mutations retain user_id filter ────────────────────

describe('Group D — Owner-only mutations retained', () => {
  it('updateTaskStatus keeps .eq("user_id", userId)', async () => {
    mockState.responses['daily_tasks:update'] = { data: null, error: null }
    await svc.updateTaskStatus('t1', 'done')
    const calls = mockState.filterCalls['daily_tasks'] || []
    const userIdEq = calls.find((c) => c.method === 'eq' && c.args[0] === 'user_id')
    expect(userIdEq).toBeDefined()
  })

  it('updateTaskPriority keeps .eq("user_id", userId)', async () => {
    mockState.responses['daily_tasks:update'] = { data: null, error: null }
    await svc.updateTaskPriority('t1', 'critical')
    const calls = mockState.filterCalls['daily_tasks'] || []
    const userIdEq = calls.find((c) => c.method === 'eq' && c.args[0] === 'user_id')
    expect(userIdEq).toBeDefined()
  })

  it('updateTaskDueDate keeps .eq("user_id", userId)', async () => {
    mockState.responses['daily_tasks:update'] = { data: null, error: null }
    await svc.updateTaskDueDate('t1', 'today')
    const calls = mockState.filterCalls['daily_tasks'] || []
    const userIdEq = calls.find((c) => c.method === 'eq' && c.args[0] === 'user_id')
    expect(userIdEq).toBeDefined()
  })

  it('deleteTask keeps .eq("user_id", userId)', async () => {
    mockState.responses['daily_tasks:delete'] = { data: null, error: null }
    await svc.deleteTask('t1')
    const calls = mockState.filterCalls['daily_tasks'] || []
    const userIdEq = calls.find((c) => c.method === 'eq' && c.args[0] === 'user_id')
    expect(userIdEq).toBeDefined()
  })

  it('deleteArchivedTasks keeps .eq("user_id", userId)', async () => {
    mockState.responses['daily_tasks:delete'] = { data: null, error: null }
    await svc.deleteArchivedTasks()
    const calls = mockState.filterCalls['daily_tasks'] || []
    const userIdEq = calls.find((c) => c.method === 'eq' && c.args[0] === 'user_id')
    expect(userIdEq).toBeDefined()
  })
})
