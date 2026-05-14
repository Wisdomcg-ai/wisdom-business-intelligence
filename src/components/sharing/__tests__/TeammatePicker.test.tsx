/**
 * Phase 61-05 — TeammatePicker tests.
 *
 * Coverage:
 *  - Renders teammate options from useBusinessTeammates (hook mocked).
 *  - Excludes the current user.
 *  - Search filters by name and email substring (case-insensitive).
 *  - Click toggles selection; onChange fires with the new array.
 *  - Empty list / loading states render expected text.
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { TeammatePicker } from '../TeammatePicker'

vi.mock('@/lib/hooks/useBusinessTeammates', () => ({
  useBusinessTeammates: vi.fn(),
}))

import { useBusinessTeammates } from '@/lib/hooks/useBusinessTeammates'

const mockUseBusinessTeammates = useBusinessTeammates as unknown as ReturnType<
  typeof vi.fn
>

const fakeTeammates = [
  { user_id: 'u-self', email: 'matt@wisdombi.ai', display_name: 'Matt Malouf', role: 'owner' },
  { user_id: 'u-coach', email: 'coach@wisdombi.ai', display_name: 'Coach Sam', role: 'coach' },
  { user_id: 'u-team1', email: 'alex@example.com', display_name: 'Alex Lee', role: 'team_member' },
  { user_id: 'u-team2', email: 'jamie@example.com', display_name: undefined, role: 'team_member' },
]

describe('TeammatePicker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseBusinessTeammates.mockReturnValue({
      teammates: fakeTeammates,
      isLoading: false,
      error: null,
    })
  })

  it('renders teammate options, excluding the current user', () => {
    render(
      <TeammatePicker
        businessId="biz-1"
        selectedUserIds={[]}
        onChange={() => {}}
        currentUserId="u-self"
      />
    )

    // Current user excluded
    expect(screen.queryByTestId('teammate-option-u-self')).toBeNull()
    // Others present
    expect(screen.getByTestId('teammate-option-u-coach')).toBeInTheDocument()
    expect(screen.getByTestId('teammate-option-u-team1')).toBeInTheDocument()
    expect(screen.getByTestId('teammate-option-u-team2')).toBeInTheDocument()
  })

  it('filters by display name substring (case-insensitive)', () => {
    render(
      <TeammatePicker
        businessId="biz-1"
        selectedUserIds={[]}
        onChange={() => {}}
        currentUserId="u-self"
      />
    )

    const search = screen.getByLabelText('Search teammates')
    fireEvent.change(search, { target: { value: 'aLex' } })

    expect(screen.getByTestId('teammate-option-u-team1')).toBeInTheDocument()
    expect(screen.queryByTestId('teammate-option-u-coach')).toBeNull()
    expect(screen.queryByTestId('teammate-option-u-team2')).toBeNull()
  })

  it('filters by email substring when display name is missing', () => {
    render(
      <TeammatePicker
        businessId="biz-1"
        selectedUserIds={[]}
        onChange={() => {}}
        currentUserId="u-self"
      />
    )

    const search = screen.getByLabelText('Search teammates')
    fireEvent.change(search, { target: { value: 'jamie' } })

    expect(screen.getByTestId('teammate-option-u-team2')).toBeInTheDocument()
    expect(screen.queryByTestId('teammate-option-u-coach')).toBeNull()
  })

  it('toggles selection on click and calls onChange with the new full array', () => {
    const handleChange = vi.fn()

    const { rerender } = render(
      <TeammatePicker
        businessId="biz-1"
        selectedUserIds={[]}
        onChange={handleChange}
        currentUserId="u-self"
      />
    )

    // Click to select u-coach
    const coachOption = screen.getByTestId('teammate-option-u-coach')
    const coachCheckbox = within(coachOption).getByRole('checkbox')
    fireEvent.click(coachCheckbox)
    expect(handleChange).toHaveBeenLastCalledWith(['u-coach'])

    // Now simulate parent applying that change and add team1
    rerender(
      <TeammatePicker
        businessId="biz-1"
        selectedUserIds={['u-coach']}
        onChange={handleChange}
        currentUserId="u-self"
      />
    )
    const team1Option = screen.getByTestId('teammate-option-u-team1')
    const team1Checkbox = within(team1Option).getByRole('checkbox')
    fireEvent.click(team1Checkbox)
    expect(handleChange).toHaveBeenLastCalledWith(['u-coach', 'u-team1'])

    // Toggle off coach
    rerender(
      <TeammatePicker
        businessId="biz-1"
        selectedUserIds={['u-coach', 'u-team1']}
        onChange={handleChange}
        currentUserId="u-self"
      />
    )
    const coachOption2 = screen.getByTestId('teammate-option-u-coach')
    const coachCheckbox2 = within(coachOption2).getByRole('checkbox')
    fireEvent.click(coachCheckbox2)
    expect(handleChange).toHaveBeenLastCalledWith(['u-team1'])
  })

  it('renders loading state when the hook is loading', () => {
    mockUseBusinessTeammates.mockReturnValue({
      teammates: [],
      isLoading: true,
      error: null,
    })
    render(
      <TeammatePicker
        businessId="biz-1"
        selectedUserIds={[]}
        onChange={() => {}}
        currentUserId="u-self"
      />
    )
    expect(screen.getByText(/Loading teammates/i)).toBeInTheDocument()
  })

  it('renders error message when hook returns error', () => {
    mockUseBusinessTeammates.mockReturnValue({
      teammates: [],
      isLoading: false,
      error: 'boom',
    })
    render(
      <TeammatePicker
        businessId="biz-1"
        selectedUserIds={[]}
        onChange={() => {}}
        currentUserId="u-self"
      />
    )
    expect(screen.getByRole('alert')).toHaveTextContent('boom')
  })

  it('renders empty-list copy when there are no teammates at all', () => {
    mockUseBusinessTeammates.mockReturnValue({
      teammates: [],
      isLoading: false,
      error: null,
    })
    render(
      <TeammatePicker
        businessId="biz-1"
        selectedUserIds={[]}
        onChange={() => {}}
        currentUserId="u-self"
      />
    )
    expect(
      screen.getByText(/No active teammates in this business yet/i)
    ).toBeInTheDocument()
  })
})
