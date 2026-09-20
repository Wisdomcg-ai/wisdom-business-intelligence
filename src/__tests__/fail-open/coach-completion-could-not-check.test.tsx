/**
 * The coach engagement dashboard (ClientCompletionDashboard) — the render half
 * of the /api/coach/client-completion could-not-check fix. The route half is
 * pinned in src/app/api/coach/client-completion/__tests__/route.test.ts
 * (Groups K-P).
 *
 * Same family as PRES-09/10/11 (empty-states-vs-failures.test.tsx): a failed
 * lookup used to arrive as 'not_started' and render as a grey "Not Started"
 * dot, feed a "Xero not connected" alert, pull the client's completion % into
 * the red and, with no alerts left, earn the green all-clear tick. The route
 * now sends 'unknown'; these tests pin that the dashboard never draws it as
 * done, never as not started, and never lets it pass for "on track".
 */
import { describe, it, expect } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import {
  ClientCompletionDashboard,
  type ClientCompletion,
} from '@/components/coach/ClientCompletionDashboard'
import type { ModuleStatus } from '@/lib/coach/client-completion'

const ALL_MODULES = [
  'businessProfile', 'assessment', 'xeroConnected',
  'visionMission', 'swot', 'goals', 'onePagePlan', 'strategicInitiatives',
  'forecast', 'monthlyReport', 'cashflow', 'kpiDashboard',
  'weeklyReviews', 'quarterlyReview', 'issuesList', 'ideas', 'openLoops', 'stopDoing',
  'orgChart', 'accountability', 'valueProposition', 'processes', 'sessionNotes', 'messages',
]

function makeClient(
  overrides: Partial<ClientCompletion> & { modules?: Record<string, ModuleStatus> } = {}
): ClientCompletion {
  const base: ClientCompletion = {
    businessId: 'biz-1',
    businessName: 'Acme',
    ownerId: 'owner-1',
    modules: Object.fromEntries(ALL_MODULES.map((k) => [k, 'completed' as ModuleStatus])),
    engagement: {
      lastLogin: new Date().toISOString(),
      weeklyReviewStreak: 8,
      daysSinceSession: 3,
      openActions: 0,
      unreadMessages: 0,
      engagementScore: 95,
      unknown: [],
    },
    alerts: [],
    alertsComplete: true,
  }
  return {
    ...base,
    ...overrides,
    modules: { ...base.modules, ...overrides.modules },
    engagement: { ...base.engagement, ...overrides.engagement },
  }
}

const rowFor = (name: string) => {
  const row = screen.getByText(name).closest('tr')
  if (!row) throw new Error(`no row for ${name}`)
  return row
}

describe('an unchecked module is its own state', () => {
  it('is drawn as "Couldn\'t check" — never Completed, never Not Started', () => {
    render(<ClientCompletionDashboard clients={[makeClient({ modules: { xeroConnected: 'unknown' } })]} />)
    expect(screen.getByLabelText("Xero Connected - Couldn't check")).toBeTruthy()
    expect(screen.queryByLabelText('Xero Connected - Not Started')).toBeNull()
    expect(screen.queryByLabelText('Xero Connected - Completed')).toBeNull()
  })

  it('a genuinely not-started module still says Not Started', () => {
    render(<ClientCompletionDashboard clients={[makeClient({ modules: { xeroConnected: 'not_started' } })]} />)
    expect(screen.getByLabelText('Xero Connected - Not Started')).toBeTruthy()
    expect(screen.queryByLabelText("Xero Connected - Couldn't check")).toBeNull()
  })

  it('a module missing from the response is a missing answer, not Not Started', () => {
    const client = makeClient()
    delete client.modules.xeroConnected
    render(<ClientCompletionDashboard clients={[client]} />)
    expect(screen.getByLabelText("Xero Connected - Couldn't check")).toBeTruthy()
    expect(screen.queryByLabelText('Xero Connected - Not Started')).toBeNull()
  })

  it('the legend explains the mark', () => {
    render(<ClientCompletionDashboard clients={[makeClient()]} />)
    expect(screen.getByText("Couldn't check")).toBeTruthy()
  })
})

describe('the could-not-check notice', () => {
  it('names what could not be checked, and says it is not Not Started', () => {
    render(
      <ClientCompletionDashboard
        clients={[
          makeClient({
            modules: { xeroConnected: 'unknown', goals: 'unknown' },
            engagement: { ...makeClient().engagement, unknown: ['lastLogin'] },
          }),
        ]}
      />
    )
    const notice = screen.getByRole('status')
    expect(notice.textContent).toMatch(/Couldn't check Xero Connected, Goals, Last Login just now/)
    expect(notice.textContent).toMatch(/rather than Not Started/)
    expect(notice.textContent).toMatch(/raise no alerts/)
  })

  it('is absent when everything was checked', () => {
    render(<ClientCompletionDashboard clients={[makeClient({ modules: { xeroConnected: 'not_started' } })]} />)
    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe('no alerts is only an all-clear when every alert rule ran', () => {
  it('complete checks with no alerts keep the green tick', () => {
    render(<ClientCompletionDashboard clients={[makeClient()]} />)
    expect(within(rowFor('Acme')).getByLabelText('No alerts')).toBeTruthy()
  })

  it('incomplete checks with no alerts do NOT get the green tick', () => {
    render(
      <ClientCompletionDashboard
        clients={[makeClient({ modules: { xeroConnected: 'unknown' }, alertsComplete: false })]}
      />
    )
    const row = rowFor('Acme')
    expect(within(row).queryByLabelText('No alerts')).toBeNull()
    expect(within(row).getByLabelText("Alerts - Couldn't check")).toBeTruthy()
  })

  it('the On Track filter leaves out a client whose checks did not all run', () => {
    render(
      <ClientCompletionDashboard
        clients={[
          makeClient({ businessId: 'a', businessName: 'Checked Co' }),
          makeClient({
            businessId: 'b',
            businessName: 'Unchecked Co',
            modules: { xeroConnected: 'unknown' },
            alertsComplete: false,
          }),
        ]}
      />
    )
    fireEvent.change(screen.getByDisplayValue('All Clients'), { target: { value: 'on-track' } })
    expect(screen.getByText('Checked Co')).toBeTruthy()
    expect(screen.queryByText('Unchecked Co')).toBeNull()
  })

  it('real alerts still count and show, whatever else could not be checked', () => {
    render(
      <ClientCompletionDashboard
        clients={[makeClient({ alerts: ['No forecast'], alertsComplete: false, modules: { xeroConnected: 'unknown' } })]}
      />
    )
    expect(within(rowFor('Acme')).getByText('1')).toBeTruthy()
    expect(screen.getByText('Need Attention')).toBeTruthy()
  })
})

describe('numbers built on an unchecked module say so', () => {
  it('the completion % becomes a floor in amber, not a red grade', () => {
    // 12 completed of 24, 12 unchecked: 50% is the least it can be.
    const modules = Object.fromEntries(
      ALL_MODULES.map((k, i) => [k, (i < 12 ? 'completed' : 'unknown') as ModuleStatus])
    )
    render(<ClientCompletionDashboard clients={[makeClient({ modules, alertsComplete: false })]} />)
    const pct = within(rowFor('Acme')).getByText('≥50%')
    expect(pct.className).toContain('text-amber-600')
    expect(pct.className).not.toContain('text-red-600')
    expect(within(rowFor('Acme')).queryByText('50%')).toBeNull()
  })

  it('a fully checked client keeps its graded %', () => {
    render(<ClientCompletionDashboard clients={[makeClient()]} />)
    expect(within(rowFor('Acme')).getByText('100%').className).toContain('text-green-600')
  })

  it('an unscored client shows a question mark, not a red number', () => {
    render(
      <ClientCompletionDashboard
        clients={[
          makeClient({
            engagement: { ...makeClient().engagement, engagementScore: null, unknown: ['openActions'] },
            alertsComplete: false,
          }),
        ]}
      />
    )
    expect(within(rowFor('Acme')).getByLabelText("Engagement score - Couldn't check")).toBeTruthy()
    // One unscored client means there is no honest fleet average either.
    expect(screen.getByLabelText("Avg engagement - Couldn't check")).toBeTruthy()
  })

  it('the expanded row says "Couldn\'t check" rather than "Never" / "No sessions" / 0', () => {
    render(
      <ClientCompletionDashboard
        clients={[
          makeClient({
            engagement: {
              lastLogin: null,
              weeklyReviewStreak: 0,
              daysSinceSession: null,
              openActions: 0,
              unreadMessages: 0,
              engagementScore: null,
              unknown: ['lastLogin', 'weeklyReviewStreak', 'daysSinceSession', 'openActions'],
            },
            alertsComplete: false,
          }),
        ]}
      />
    )
    fireEvent.click(screen.getByText('Acme'))
    const details = screen.getByText('Engagement Details').parentElement as HTMLElement
    // Last Login, Weekly Streak, Days Since Session, Open Actions, Engagement Score
    expect(within(details).getAllByText("Couldn't check")).toHaveLength(5)
    expect(within(details).queryByText('Never')).toBeNull()
    expect(within(details).queryByText('No sessions')).toBeNull()
    expect(within(details).queryByText('0 weeks')).toBeNull()
  })
})
