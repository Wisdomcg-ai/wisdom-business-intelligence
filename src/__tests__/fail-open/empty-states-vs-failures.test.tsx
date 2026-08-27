/**
 * PRES-09 / PRES-10 / PRES-11 (28 Aug 2026) — the quiet half of the fail-open family.
 *
 * These three don't render a green tick. They render a calm, confident EMPTY
 * STATE, which is worse in one specific way: an empty state is an instruction.
 * It tells the user something about their own data and hands them an action.
 * When the underlying fetch merely failed, that instruction is false and the
 * action is wasted or destructive of trust:
 *
 *   PRES-09  a failed /api/Xero/status  -> "Not connected to Xero" + [Connect Xero],
 *            rendered directly above a fully populated P&L built from Xero data
 *            already in the database. For a user who is "not a numbers person"
 *            that contradiction is unresolvable: is the report real or not?
 *            It also hid the "Sync P&L Data" button — the one action that helps.
 *
 *   PRES-10  a failed forecast lookup   -> "Set up a financial forecast with P&L
 *            lines" — telling a business that HAS a forecast to go build one.
 *
 *   PRES-11  a failed goals query       -> "No annual goals set" + [Set Your Goals],
 *            pointing a client at a wizard to re-enter targets that are sitting
 *            intact in the database.
 *
 * In all three the failure and the genuine-empty case were the same value
 * (null / [] / a falsy flag), so the UI could not tell them apart and chose the
 * confident reading. The fix is the same shape each time: keep the empty state
 * for genuinely empty, add a distinct "couldn't load" state for failure, and
 * never let a failure inherit the empty state's call to action.
 */
import { describe, it, expect, vi } from 'vitest'

// XeroConnectionBanner reads usePathname() to build its integrations link.
// There is no Next router in jsdom, so give it a stable client-route value.
vi.mock('next/navigation', () => ({
  usePathname: () => '/finances/monthly-report',
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}))
import { render, screen } from '@testing-library/react'
import XeroConnectionBanner from '@/app/finances/monthly-report/components/XeroConnectionBanner'
import GoalsCard from '@/app/dashboard/components/GoalsCard'
import CashflowTab from '@/app/finances/monthly-report/components/CashflowTab'
import { Target } from 'lucide-react'

const noop = () => {}

describe('PRES-09 — a failed status check is not "not connected"', () => {
  const base = {
    xeroConnection: null,
    isExpired: false,
    isLoading: false,
    isSyncing: false,
    onConnect: noop,
    onSync: noop,
    onManage: noop,
  }

  it('genuinely disconnected still says so, with the Connect action', () => {
    render(<XeroConnectionBanner {...base} />)
    expect(screen.getByText(/Not connected to Xero/i)).toBeTruthy()
    expect(screen.getByText(/Connect Xero/i)).toBeTruthy()
  })

  it('a failed check does NOT claim the client is disconnected', () => {
    render(<XeroConnectionBanner {...base} checkFailed />)
    expect(screen.queryByText(/Not connected to Xero/i)).toBeNull()
  })

  it('a failed check does NOT offer the misleading Connect action', () => {
    render(<XeroConnectionBanner {...base} checkFailed />)
    // Offering "Connect Xero" to an already-connected client is the specific
    // harm: it invites them to redo an OAuth flow they do not need.
    expect(screen.queryByText(/^Connect Xero$/i)).toBeNull()
  })

  it('says what is actually true — the check failed, the figures are last-known', () => {
    render(<XeroConnectionBanner {...base} checkFailed />)
    expect(screen.getByText(/Couldn't check the Xero connection/i)).toBeTruthy()
  })
})

describe('PRES-11 — a failed goals query is not "no goals set"', () => {
  const base = {
    title: 'Annual Goals',
    goals: null,
    icon: Target,
    emptyStateText: 'No annual goals set',
    emptyStateCta: 'Set Your Goals',
    emptyStateHref: '/goals?step=1',
  }

  it('a business that genuinely has no goals gets the empty state and its CTA', () => {
    render(<GoalsCard {...base} />)
    expect(screen.getByText('No annual goals set')).toBeTruthy()
    expect(screen.getByText('Set Your Goals')).toBeTruthy()
  })

  it('a failed load does NOT tell the client they have no goals', () => {
    render(<GoalsCard {...base} loadFailed />)
    expect(screen.queryByText('No annual goals set')).toBeNull()
  })

  it('a failed load does NOT send them to the goals wizard', () => {
    render(<GoalsCard {...base} loadFailed />)
    // Their targets are intact; re-entering them is wasted work at best.
    expect(screen.queryByText('Set Your Goals')).toBeNull()
  })

  it('reassures that the data is safe, since the client cannot tell', () => {
    render(<GoalsCard {...base} loadFailed />)
    expect(screen.getByText(/Couldn't load your goals/i)).toBeTruthy()
    expect(screen.getByText(/your targets are safe/i)).toBeTruthy()
  })
})

describe('PRES-10 — a failed forecast lookup is not "set one up"', () => {
  it('genuinely absent forecast still gets the setup instruction', () => {
    render(<CashflowTab data={null} isLoading={false} />)
    expect(screen.getByText(/Set up a financial forecast/i)).toBeTruthy()
  })

  it('a failed load does NOT tell a business with a forecast to build one', () => {
    render(
      <CashflowTab
        data={null}
        isLoading={false}
        error="Could not load your cashflow forecast. This is a system error, not a missing forecast — your data is unchanged."
      />,
    )
    expect(screen.queryByText(/Set up a financial forecast/i)).toBeNull()
    expect(screen.getByText(/not a missing forecast/i)).toBeTruthy()
  })

  it('the error branch is checked BEFORE the empty branch', () => {
    // Both conditions are true on a failure (data is null AND error is set), so
    // ordering is what makes this work. Pinning it stops a refactor reordering
    // them and silently restoring the false instruction.
    render(<CashflowTab data={null} isLoading={false} error="boom" />)
    expect(screen.getByText('boom')).toBeTruthy()
    expect(screen.queryByText(/Set up a financial forecast/i)).toBeNull()
  })
})

describe('the shared rule behind all three', () => {
  // Each site collapsed two meanings into one value. This is the predicate that
  // has to exist for the UI to tell them apart.
  type Outcome<T> = { value: T | null; failed: boolean }

  const render3 = <T,>(o: Outcome<T>) =>
    o.failed ? 'could-not-load' : o.value == null ? 'genuinely-empty' : 'has-data'

  it.each([
    [{ value: null, failed: true }, 'could-not-load'],
    [{ value: null, failed: false }, 'genuinely-empty'],
    [{ value: { any: 1 }, failed: false }, 'has-data'],
  ] as [Outcome<object>, string][])('%#: resolves to %s', (outcome, expected) => {
    expect(render3(outcome)).toBe(expected)
  })

  it('a failure never resolves to the empty state, whatever the value', () => {
    expect(render3({ value: null, failed: true })).not.toBe('genuinely-empty')
    expect(render3({ value: { any: 1 }, failed: true })).toBe('could-not-load')
  })
})
