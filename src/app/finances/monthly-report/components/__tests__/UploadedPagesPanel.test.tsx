/**
 * The External Data tab's uploaded-pages panel: nothing for a layout with no
 * uploaded page; could-not-check never shown as "not uploaded"; a refused
 * upload says why; an accepted one is listed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import UploadedPagesPanel from '../UploadedPagesPanel'
import type { PDFLayout } from '../../types/pdf-layout'

const BIZ = 'c6c741db-6c09-45be-974c-5e6ca2cadf84'
const layout = (withInsert: boolean): PDFLayout => ({
  version: 1,
  pages: [
    { id: 'p1', orientation: 'portrait', widgets: [{ id: 'cover', type: 'cover_page', col: 0, row: 0, colSpan: 2, rowSpan: 3 }] },
    ...(withInsert
      ? [{ id: 'p2', orientation: 'portrait' as const, widgets: [{ id: 'lumary', type: 'uploaded_insert' as const, col: 0, row: 0, colSpan: 2, rowSpan: 3, titleOverride: 'Income Analysis' }] }]
      : []),
  ],
})
const stored = { id: '0b7c1d9e-1111-4222-8333-444455556666', widget_id: 'lumary', filename: 'lumary-aug.pdf', page_count: 1, created_at: '2026-09-15T02:00:00Z' }

const mockFetch = vi.fn()
beforeEach(() => {
  mockFetch.mockReset()
  vi.stubGlobal('fetch', mockFetch)
})
afterEach(() => vi.unstubAllGlobals())

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }))

describe('UploadedPagesPanel', () => {
  it('a layout with no uploaded page renders nothing and asks nothing', () => {
    const { container } = render(<UploadedPagesPanel businessId={BIZ} reportMonth="2026-08" layout={layout(false)} canManage />)
    expect(container).toBeEmptyDOMElement()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('lists the placement as not uploaded for the month', async () => {
    mockFetch.mockImplementation(() => json({ success: true, status: 'ok', inserts: [] }))
    render(<UploadedPagesPanel businessId={BIZ} reportMonth="2026-08" layout={layout(true)} canManage />)
    expect(await screen.findByText('Not uploaded for August 2026 — the pack prints a notice in its place.')).toBeInTheDocument()
    expect(screen.getByText('Income Analysis')).toBeInTheDocument()
    expect(mockFetch).toHaveBeenCalledWith(`/api/monthly-report/inserts?business_id=${BIZ}&report_month=2026-08`)
  })

  it('before the migration: could-not-check with the reason — not "not uploaded"', async () => {
    mockFetch.mockImplementation(() => json({ success: true, status: 'unavailable', reason: "uploaded pages aren't set up in the database yet" }))
    render(<UploadedPagesPanel businessId={BIZ} reportMonth="2026-08" layout={layout(true)} canManage />)
    expect(await screen.findByText(/Couldn't check the uploaded pages: uploaded pages aren't set up/)).toBeInTheDocument()
    expect(screen.queryByText(/Not uploaded/)).toBeNull()
  })

  it('refuses a file that is not a PDF without sending it', async () => {
    mockFetch.mockImplementation(() => json({ success: true, status: 'ok', inserts: [] }))
    const user = userEvent.setup({ applyAccept: false })
    render(<UploadedPagesPanel businessId={BIZ} reportMonth="2026-08" layout={layout(true)} canManage />)
    const input = await screen.findByLabelText('Upload the PDF for Income Analysis')
    await user.upload(input, new File(['a,b'], 'lumary.csv', { type: 'text/csv' }))
    expect(await screen.findByText('The file must be a PDF.')).toBeInTheDocument()
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('uploads a PDF against the placement, shows the route\'s refusal in its words, and lists an accepted file', async () => {
    let listed: unknown[] = []
    const posts: FormData[] = []
    let refuse = true
    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posts.push(init.body as FormData)
        if (refuse) return json({ error: 'The upload was refused: the PDF is encrypted or password-protected.' }, 400)
        listed = [stored]
        return json({ success: true, insert: stored })
      }
      return json({ success: true, status: 'ok', inserts: listed })
    })
    const user = userEvent.setup()
    render(<UploadedPagesPanel businessId={BIZ} reportMonth="2026-08" layout={layout(true)} canManage />)
    const pdf = () => new File(['%PDF-1.7'], 'lumary-aug.pdf', { type: 'application/pdf' })

    await user.upload(await screen.findByLabelText('Upload the PDF for Income Analysis'), pdf())
    expect(await screen.findByText('The upload was refused: the PDF is encrypted or password-protected.')).toBeInTheDocument()
    expect(posts[0].get('widget_id')).toBe('lumary')
    expect(posts[0].get('report_month')).toBe('2026-08')
    expect(posts[0].get('business_id')).toBe(BIZ)

    refuse = false
    await user.upload(screen.getByLabelText('Upload the PDF for Income Analysis'), pdf())
    await waitFor(() => expect(screen.getByRole('link', { name: 'lumary-aug.pdf' })).toBeInTheDocument())
    expect(screen.getByRole('link', { name: 'lumary-aug.pdf' })).toHaveAttribute('href', `/api/monthly-report/inserts?business_id=${BIZ}&id=${stored.id}`)
    expect(screen.getByLabelText('Replace the PDF for Income Analysis')).toBeInTheDocument()
  })

  it('a client sees the list without the upload control', async () => {
    mockFetch.mockImplementation(() => json({ success: true, status: 'ok', inserts: [stored] }))
    render(<UploadedPagesPanel businessId={BIZ} reportMonth="2026-08" layout={layout(true)} canManage={false} />)
    const item = (await screen.findByText('Income Analysis')).closest('li') as HTMLElement
    expect(within(item).getByRole('link', { name: 'lumary-aug.pdf' })).toBeInTheDocument()
    expect(within(item).queryByLabelText(/PDF for Income Analysis/)).toBeNull()
  })
})
