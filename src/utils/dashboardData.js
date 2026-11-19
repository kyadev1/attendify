export function studentSummary(events, registrations, studentId, now) {
  const eventsById = new Map(events.map(event => [event.id, event]))
  const bookings = registrations.filter(r => r.studentId === studentId)
    .map(r => ({ ...r, event: eventsById.get(r.eventId) })).filter(r => r.event)
  return {
    total: bookings.length,
    attended: bookings.filter(r => r.attendedAt).length,
    upcoming: bookings.filter(r => new Date(r.event.startsAt) > new Date(now)).sort((a, b) => new Date(a.event.startsAt) - new Date(b.event.startsAt)),
    recent: [...bookings].sort((a, b) => new Date(b.registeredAt) - new Date(a.registeredAt)).slice(0, 5),
  }
}

export function organizerSummary(events, registrations, organizerId, now) {
  const owned = events.filter(e => e.organizerId === organizerId)
  const ownedIds = new Set(owned.map(event => event.id))
  const rows = registrations.filter(r => ownedIds.has(r.eventId))
  const attended = rows.filter(r => r.attendedAt)
  return {
    events: owned,
    registered: rows.length,
    attended: attended.length,
    rate: rows.length ? Math.round(attended.length / rows.length * 100) : 0,
    live: owned.filter(e => e.status === 'published' && new Date(e.startsAt) <= new Date(now) && new Date(e.endsAt) > new Date(now)),
    scans: [...attended].sort((a, b) => new Date(b.attendedAt) - new Date(a.attendedAt)).slice(0, 5),
  }
}

export function simulateScan(registrations, eventId, now) {
  const next = registrations.find(r => r.eventId === eventId && !r.attendedAt)
  if (!next) return registrations
  return registrations.map(r => r.id === next.id ? { ...r, attendedAt: now } : r)
}

export function formatDate(value) {
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' }).format(new Date(value))
}
