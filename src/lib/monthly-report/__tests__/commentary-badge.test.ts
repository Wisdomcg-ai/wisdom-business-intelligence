import { describe, it, expect } from 'vitest'
import { commentaryBadge } from '../commentary-badge'

describe('commentaryBadge', () => {
  it('says nothing when the variance is nothing', () => {
    // The 21 rows on Urban Road's August pack that read "$0 over budget".
    expect(commentaryBadge(0, 'expense_over_budget_dollar')).toBeNull()
    expect(commentaryBadge(0.004)).toBeNull()
    expect(commentaryBadge(-0.4)).toBeNull()
  })

  it('names an expense overrun', () => {
    expect(commentaryBadge(-31029.3, 'expense_over_budget_dollar')).toEqual({
      text: '$31,029 over budget',
      tone: 'bad',
    })
  })

  it('does not call a revenue shortfall "over budget"', () => {
    expect(commentaryBadge(-9043, 'revenue_under_budget_dollar')).toEqual({
      text: '$9,043 under budget',
      tone: 'bad',
    })
  })

  it('shows a favourable expense as favourable, not as an alarm', () => {
    expect(commentaryBadge(4200, 'expense_favourable_significant')).toEqual({
      text: '$4,200 under budget',
      tone: 'good',
    })
  })

  it('calls a balance-sheet move a movement', () => {
    expect(commentaryBadge(-18400, 'bs_movement_dollar')).toEqual({
      text: '$18,400 movement',
      tone: 'neutral',
    })
  })

  it('reads the expense sign convention when a pre-71-04 row has no reason', () => {
    expect(commentaryBadge(-1200)).toEqual({ text: '$1,200 over budget', tone: 'bad' })
    expect(commentaryBadge(1200)).toEqual({ text: '$1,200 under budget', tone: 'good' })
  })
})
