/**
 * The pages are Urban Road's layout, which carries an external-metric page and
 * a memo page the client has never used. Both printed as a grey "Data not
 * available" box on an otherwise empty A4 sheet in the August pack.
 */
import { describe, it, expect } from 'vitest'
import { pagesWithContent } from '../layout-pages'
import type { LayoutPage, WidgetType } from '../../types/pdf-layout'

const page = (id: string, ...types: WidgetType[]): LayoutPage => ({
  id,
  orientation: 'portrait',
  widgets: types.map((type, i) => ({
    id: `${id}-w${i}`, type, col: 0, row: 0, colSpan: 2, rowSpan: 3,
  })),
} as LayoutPage)

const LAYOUT: LayoutPage[] = [
  page('cover', 'cover_page'),
  page('summary', 'executive_summary'),
  page('metric', 'external_metric'),
  page('memo', 'memo'),
  page('bs', 'balance_sheet'),
]

/** What hasDataForWidget answers for this client, this month. */
const hasData = (type: WidgetType): boolean =>
  type !== 'external_metric' && type !== 'memo'

describe('pagesWithContent', () => {
  it('drops a page whose only widget has nothing to show', () => {
    expect(pagesWithContent(LAYOUT, hasData).map(p => p.id))
      .toEqual(['cover', 'summary', 'bs'])
  })

  it('keeps the balance sheet, which says its own reason on the page', () => {
    // hasDataForWidget returns TRUE for balance_sheet and money_flow precisely
    // so they can print "Xero refused" / "no comparison period" themselves.
    // Dropping them here would swallow all three of those states.
    const kept = pagesWithContent([page('bs', 'balance_sheet')], hasData)
    expect(kept.map(p => p.id)).toEqual(['bs'])
  })

  it('keeps a page where ONE of several widgets has data', () => {
    const mixed = [page('mixed', 'memo', 'executive_summary')]
    expect(pagesWithContent(mixed, hasData)).toHaveLength(1)
  })

  it('drops a page whose widgets ALL have nothing', () => {
    // Two pages, so the empty-result guard below is not what is being tested.
    const pages = [page('cover', 'cover_page'), page('both', 'memo', 'external_metric')]
    expect(pagesWithContent(pages, hasData).map(p => p.id)).toEqual(['cover'])
  })

  it('returns the layout untouched when nothing at all has data', () => {
    // A zero-page PDF is a worse failure than a pack of placeholders: the
    // coach can at least see what went wrong from the placeholders.
    const kept = pagesWithContent(LAYOUT, () => false)
    expect(kept.map(p => p.id)).toEqual(LAYOUT.map(p => p.id))
  })

  it('drops a page with no widgets at all', () => {
    const empty = { id: 'blank', orientation: 'portrait', widgets: [] } as unknown as LayoutPage
    expect(pagesWithContent([empty, page('cover', 'cover_page')], hasData).map(p => p.id))
      .toEqual(['cover'])
  })

  it('survives a page whose widgets array is missing', () => {
    const broken = { id: 'broken', orientation: 'portrait' } as unknown as LayoutPage
    expect(() => pagesWithContent([broken], hasData)).not.toThrow()
  })

  it('does not mutate the layout it was given', () => {
    const original = [...LAYOUT]
    pagesWithContent(LAYOUT, hasData)
    expect(LAYOUT).toEqual(original)
  })
})
