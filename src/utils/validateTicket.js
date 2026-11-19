import { ticketReference } from './ticketData.js'
export function validateTicket(raw, eventId, registrations) {
  let payload
  try { payload = JSON.parse(raw) } catch { return { type: 'error', message: 'Invalid Ticket: unreadable payload.' } }
  if (!payload || !['studentId', 'eventId', 'ticketId'].every(key => typeof payload[key] === 'string' && payload[key])) return { type: 'error', message: 'Invalid Ticket: missing identifiers.' }
  if (payload.eventId !== eventId) return { type: 'error', message: 'Event Mismatch: select the correct event.' }
  const booking = registrations.find(r => r.eventId === eventId && r.studentId === payload.studentId && ticketReference(r.id) === payload.ticketId)
  if (!booking) return { type: 'error', message: 'Invalid Ticket: registration not found.' }
  if (booking.attendedAt) return { type: 'warning', message: 'Already Scanned / Duplicate Check-in', booking }
  return { type: 'success', booking }
}
