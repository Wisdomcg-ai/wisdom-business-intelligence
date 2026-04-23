import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock the Resend SDK before importing the module under test.
// Use a class so `new Resend(apiKey)` works in the module under test.
const mockSend = vi.fn()
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: mockSend }
  },
}))

import { sendMonthlyReport } from '../send-report'

const baseParams = {
  to: 'client@example.com',
  fromEmail: 'mattmalouf@wisdomcg.com.au',
  fromName: 'Matt Malouf',
  replyToEmail: 'mattmalouf@wisdomcg.com.au',
  businessName: 'Urban Road',
  monthLabel: 'March 2026',
  clientGreetingName: 'Sarah',
  reportUrl: 'https://wisdombi.ai/reports/view/abc.def',
  pdfBuffer: Buffer.from('fake-pdf-content'),
  pdfFilename: 'urban-road-2026-03-report.pdf',
}

describe('sendMonthlyReport', () => {
  beforeEach(() => {
    vi.stubEnv('RESEND_API_KEY', 're_test_12345')
    mockSend.mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('Test 1: returns success result when Resend succeeds', async () => {
    mockSend.mockResolvedValueOnce({ data: { id: 'mid_abc' }, error: null })

    const result = await sendMonthlyReport(baseParams)

    expect(result).toEqual({
      success: true,
      id: 'mid_abc',
      statusCode: 200,
    })
  })

  it('Test 2: produces subject matching the {businessName} — {monthLabel} financial report format (D-08)', async () => {
    mockSend.mockResolvedValueOnce({ data: { id: 'mid' }, error: null })

    await sendMonthlyReport(baseParams)

    expect(mockSend).toHaveBeenCalledTimes(1)
    const call = mockSend.mock.calls[0][0]
    expect(call.subject).toBe('Urban Road — March 2026 financial report')
  })

  it('Test 3: builds from as "{fromName} <{fromEmail}>" (D-09)', async () => {
    mockSend.mockResolvedValueOnce({ data: { id: 'mid' }, error: null })

    await sendMonthlyReport(baseParams)

    const call = mockSend.mock.calls[0][0]
    expect(call.from).toBe('Matt Malouf <mattmalouf@wisdomcg.com.au>')
  })

  it('Test 4: passes replyToEmail through as replyTo (D-09)', async () => {
    mockSend.mockResolvedValueOnce({ data: { id: 'mid' }, error: null })

    await sendMonthlyReport({
      ...baseParams,
      replyToEmail: 'coach-two@wisdomcg.com.au',
    })

    const call = mockSend.mock.calls[0][0]
    expect(call.replyTo).toBe('coach-two@wisdomcg.com.au')
  })

  it('Test 5: sends to a single string recipient, never an array (D-10)', async () => {
    mockSend.mockResolvedValueOnce({ data: { id: 'mid' }, error: null })

    await sendMonthlyReport(baseParams)

    const call = mockSend.mock.calls[0][0]
    expect(typeof call.to).toBe('string')
    expect(Array.isArray(call.to)).toBe(false)
    expect(call.to).toBe('client@example.com')
  })

  it('Test 6: attaches the PDF as a Buffer (D-07)', async () => {
    mockSend.mockResolvedValueOnce({ data: { id: 'mid' }, error: null })

    await sendMonthlyReport(baseParams)

    const call = mockSend.mock.calls[0][0]
    expect(Array.isArray(call.attachments)).toBe(true)
    expect(call.attachments).toHaveLength(1)
    const [att] = call.attachments
    expect(att.filename).toBe('urban-road-2026-03-report.pdf')
    expect(Buffer.isBuffer(att.content)).toBe(true)
    expect(att.content.toString()).toBe('fake-pdf-content')
  })

  it('Test 7: HTML contains reportUrl + "View Report" CTA and NO numeric data (D-06)', async () => {
    mockSend.mockResolvedValueOnce({ data: { id: 'mid' }, error: null })

    await sendMonthlyReport(baseParams)

    const call = mockSend.mock.calls[0][0]
    const html = call.html as string
    expect(html).toContain(baseParams.reportUrl)
    expect(html).toContain('View Report')

    // Strip the reportUrl from the HTML, then assert no 5+ digit runs remain.
    // (The reportUrl is allowed to contain digits/hashes.)
    const htmlWithoutUrl = html.split(baseParams.reportUrl).join('')
    expect(htmlWithoutUrl).not.toMatch(/\d{5,}/)
  })

  it('Test 8: maps Resend error to failure result with errorCode + error message (D-11)', async () => {
    mockSend.mockResolvedValueOnce({
      data: null,
      error: {
        name: 'invalid_from_address',
        message: 'The from address is not verified',
      },
    })

    const result = await sendMonthlyReport(baseParams)

    expect(result.success).toBe(false)
    expect(result.errorCode).toBe('invalid_from_address')
    expect(result.error).toBe('The from address is not verified')
    expect(result.id).toBeUndefined()
  })

  it('Test 9: returns timedOut=true when the Resend call exceeds timeoutMs (D-12)', async () => {
    // Mock the send to a promise that never resolves in the test window.
    mockSend.mockReturnValueOnce(new Promise(() => {}))

    const start = Date.now()
    const result = await sendMonthlyReport({ ...baseParams, timeoutMs: 30 })
    const elapsed = Date.now() - start

    expect(result.success).toBe(false)
    expect(result.timedOut).toBe(true)
    expect(elapsed).toBeLessThan(1000)
  })

  it('Test 10: throws synchronously when RESEND_API_KEY is unset', async () => {
    vi.unstubAllEnvs()
    vi.stubEnv('RESEND_API_KEY', '')

    await expect(sendMonthlyReport(baseParams)).rejects.toThrow(
      /RESEND_API_KEY/i,
    )
  })
})
