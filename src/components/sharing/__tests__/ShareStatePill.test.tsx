import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ShareStatePill } from '../ShareStatePill'

describe('ShareStatePill', () => {
  it('renders nothing when row is private', () => {
    const { container } = render(
      <ShareStatePill sharedWithAll={false} sharedWith={[]} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when shared_with is null', () => {
    const { container } = render(
      <ShareStatePill sharedWithAll={false} sharedWith={null} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders "Shared with team" when shared_with_all is true', () => {
    render(<ShareStatePill sharedWithAll={true} sharedWith={[]} />)
    expect(screen.getByTestId('share-state-pill-team')).toBeInTheDocument()
    expect(screen.getByText('Shared with team')).toBeInTheDocument()
  })

  it('renders "Shared with 1" when one specific recipient', () => {
    render(
      <ShareStatePill
        sharedWithAll={false}
        sharedWith={['00000000-0000-0000-0000-000000000001']}
      />,
    )
    expect(screen.getByTestId('share-state-pill-specific')).toBeInTheDocument()
    expect(screen.getByText('Shared with 1')).toBeInTheDocument()
    const pill = screen.getByTestId('share-state-pill-specific')
    expect(pill).toHaveAttribute('title', 'Shared with 1 person')
  })

  it('renders "Shared with N" when multiple specific recipients', () => {
    render(
      <ShareStatePill
        sharedWithAll={false}
        sharedWith={['u1', 'u2', 'u3']}
      />,
    )
    expect(screen.getByText('Shared with 3')).toBeInTheDocument()
    const pill = screen.getByTestId('share-state-pill-specific')
    expect(pill).toHaveAttribute('title', 'Shared with 3 people')
  })

  it('prefers team pill over specific when both are set', () => {
    render(
      <ShareStatePill
        sharedWithAll={true}
        sharedWith={['u1', 'u2']}
      />,
    )
    expect(screen.getByTestId('share-state-pill-team')).toBeInTheDocument()
    expect(screen.queryByTestId('share-state-pill-specific')).not.toBeInTheDocument()
  })
})
