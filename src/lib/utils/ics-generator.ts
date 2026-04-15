/**
 * Generate .ics calendar file content for a coaching session
 * Compatible with Google Calendar, Outlook, and Apple Calendar
 */

interface ICSEvent {
  title: string
  description?: string
  startDate: Date
  endDate: Date
  location?: string
  organizer?: { name: string; email: string }
  attendee?: { name: string; email: string }
}

function formatICSDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function escapeICSText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

export function generateICS(event: ICSEvent): string {
  const uid = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}@wisdombi.ai`
  const now = formatICSDate(new Date())

  let ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//WisdomBI//Coaching Session//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${formatICSDate(event.startDate)}`,
    `DTEND:${formatICSDate(event.endDate)}`,
    `SUMMARY:${escapeICSText(event.title)}`,
  ]

  if (event.description) {
    ics.push(`DESCRIPTION:${escapeICSText(event.description)}`)
  }

  if (event.location) {
    ics.push(`LOCATION:${escapeICSText(event.location)}`)
  }

  if (event.organizer) {
    ics.push(`ORGANIZER;CN=${escapeICSText(event.organizer.name)}:mailto:${event.organizer.email}`)
  }

  if (event.attendee) {
    ics.push(`ATTENDEE;CN=${escapeICSText(event.attendee.name)};RSVP=TRUE:mailto:${event.attendee.email}`)
  }

  // Add reminder 30 minutes before
  ics.push(
    'BEGIN:VALARM',
    'TRIGGER:-PT30M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeICSText(event.title)} starts in 30 minutes`,
    'END:VALARM'
  )

  ics.push('END:VEVENT', 'END:VCALENDAR')

  return ics.join('\r\n')
}

/**
 * Download an .ics file to the user's device
 */
export function downloadICS(event: ICSEvent, filename?: string): void {
  const icsContent = generateICS(event)
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename || `${event.title.replace(/\s+/g, '-').toLowerCase()}.ics`
  link.click()
  URL.revokeObjectURL(url)
}

/**
 * Generate a Google Calendar URL for adding an event
 */
export function getGoogleCalendarUrl(event: ICSEvent): string {
  const start = event.startDate.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const end = event.endDate.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${start}/${end}`,
    details: event.description || '',
    location: event.location || '',
  })

  return `https://calendar.google.com/calendar/render?${params.toString()}`
}
