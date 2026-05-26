import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { isLockTimeoutError, recoverFromLockTimeout } from '../lock-recovery'

describe('isLockTimeoutError', () => {
  it('returns true when err has isAcquireTimeout=true', () => {
    expect(isLockTimeoutError({ isAcquireTimeout: true })).toBe(true)
    expect(isLockTimeoutError(Object.assign(new Error('x'), { isAcquireTimeout: true }))).toBe(true)
  })

  it('returns false for ordinary errors', () => {
    expect(isLockTimeoutError(new Error('nope'))).toBe(false)
    expect(isLockTimeoutError({ isAcquireTimeout: false })).toBe(false)
    expect(isLockTimeoutError({})).toBe(false)
  })

  it('returns false for non-objects', () => {
    expect(isLockTimeoutError(null)).toBe(false)
    expect(isLockTimeoutError(undefined)).toBe(false)
    expect(isLockTimeoutError('isAcquireTimeout')).toBe(false)
    expect(isLockTimeoutError(42)).toBe(false)
  })

  it('rejects truthy-but-non-boolean isAcquireTimeout values', () => {
    // strictly === true; guards against shape collisions where some other
    // library puts a string/number in the field
    expect(isLockTimeoutError({ isAcquireTimeout: 1 })).toBe(false)
    expect(isLockTimeoutError({ isAcquireTimeout: 'yes' })).toBe(false)
  })
})

describe('recoverFromLockTimeout', () => {
  let reloadSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()

    // jsdom's window.location.reload is non-configurable, so we can't
    // defineProperty it directly. Stub the entire location object instead —
    // vi.stubGlobal handles the swap and restores it via vi.unstubAllGlobals.
    reloadSpy = vi.fn()
    vi.stubGlobal('location', {
      ...window.location,
      reload: reloadSpy,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('clears sb-* and supabase.* keys from localStorage; leaves others alone', async () => {
    window.localStorage.setItem('sb-abc-auth-token', 'stale')
    window.localStorage.setItem('supabase.session', 'stale')
    window.localStorage.setItem('unrelated-app-pref', 'keep me')

    await recoverFromLockTimeout()

    expect(window.localStorage.getItem('sb-abc-auth-token')).toBeNull()
    expect(window.localStorage.getItem('supabase.session')).toBeNull()
    expect(window.localStorage.getItem('unrelated-app-pref')).toBe('keep me')
  })

  it('clears sb-* keys from sessionStorage too', async () => {
    window.sessionStorage.setItem('sb-xyz', 'stale')
    window.sessionStorage.setItem('app-tab-id', 'keep me')

    await recoverFromLockTimeout()

    expect(window.sessionStorage.getItem('sb-xyz')).toBeNull()
    expect(window.sessionStorage.getItem('app-tab-id')).toBe('keep me')
  })

  it('triggers a page reload', async () => {
    await recoverFromLockTimeout()
    expect(reloadSpy).toHaveBeenCalledTimes(1)
  })

  it('still reloads even when storage throws (private mode simulation)', async () => {
    // Replace removeItem to throw — recovery must still complete + reload.
    const origRemove = Storage.prototype.removeItem
    Storage.prototype.removeItem = () => {
      throw new Error('storage disabled')
    }

    try {
      await recoverFromLockTimeout()
      expect(reloadSpy).toHaveBeenCalledTimes(1)
    } finally {
      Storage.prototype.removeItem = origRemove
    }
  })

  it('iterates localStorage in reverse so deletes do not skip entries', async () => {
    // Forward iteration with removeItem during the loop is the classic bug:
    // removing index 0 shifts index 1 down to 0, then i++ skips it. Reverse
    // iteration avoids this. Pin the behavior so a future refactor can't
    // silently break it.
    window.localStorage.setItem('sb-a', '1')
    window.localStorage.setItem('sb-b', '2')
    window.localStorage.setItem('sb-c', '3')

    await recoverFromLockTimeout()

    expect(window.localStorage.getItem('sb-a')).toBeNull()
    expect(window.localStorage.getItem('sb-b')).toBeNull()
    expect(window.localStorage.getItem('sb-c')).toBeNull()
  })
})
