
export function ticketReference(registrationId) {
  return 'TKT-' + registrationId.toUpperCase()
}

export function ticketPayload(booking) {
  return JSON.stringify({
    studentId: booking.studentId,
    eventId: booking.eventId,
    ticketId: ticketReference(booking.id),
  })
}

export function parseTicketPayload(raw) {
  let ticket

  try {
    ticket = JSON.parse(raw)
  } catch {
    throw new Error('Invalid QR ticket format.')
  }

  if (
    !ticket ||
    typeof ticket !== 'object' ||
    Array.isArray(ticket)
  ) {
    throw new Error('Invalid QR ticket.')
  }

  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

  const {
    studentId,
    eventId,
    ticketId,
  } = ticket

  if (
    typeof studentId !== 'string' ||
    typeof eventId !== 'string' ||
    typeof ticketId !== 'string' ||
    !uuidPattern.test(studentId) ||
    !uuidPattern.test(eventId) ||
    !/^TKT-/i.test(ticketId)
  ) {
    throw new Error('Invalid ticket information.')
  }

  const registrationId = ticketId.slice(4)

  if (!uuidPattern.test(registrationId)) {
    throw new Error('Invalid ticket reference.')
  }

  return {
    registrationId: registrationId.toLowerCase(),
    studentId: studentId.toLowerCase(),
    eventId: eventId.toLowerCase(),
  }
}
