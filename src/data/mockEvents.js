// Fixed reference date keeps the dashboard demo repeatable.
export const mockNow = '2026-09-20T10:00:00+08:00'
export const mockEvents = [
  { id: 'welcome-fair', organizerId: 'organizer-demo', title: 'Campus Welcome Fair', startsAt: '2026-09-20T09:00:00+08:00', endsAt: '2026-09-20T17:00:00+08:00', venue: 'University Gym', status: 'published' },
  { id: 'tech-talk', organizerId: 'organizer-demo', title: 'Student Tech Talk', startsAt: '2026-09-25T13:00:00+08:00', endsAt: '2026-09-25T16:00:00+08:00', venue: 'Auditorium', status: 'published' },
  { id: 'leadership', organizerId: 'organizer-demo', title: 'Leadership Workshop', startsAt: '2026-09-15T09:00:00+08:00', endsAt: '2026-09-15T12:00:00+08:00', venue: 'Conference Room', status: 'published' },
  { id: 'arts-night', organizerId: 'organizer-demo', title: 'Campus Arts Night', startsAt: '2026-10-02T18:00:00+08:00', endsAt: '2026-10-02T21:00:00+08:00', venue: 'Open Grounds', status: 'draft' },
  { id: 'career-day', organizerId: 'organizer-demo', title: 'Campus Career Day', startsAt: '2026-09-28T09:00:00+08:00', endsAt: '2026-09-28T15:00:00+08:00', venue: 'Main Hall', status: 'published' },
  { id: 'photo-walk', organizerId: 'organizer-demo', title: 'Campus Photo Walk', startsAt: '2026-09-27T08:00:00+08:00', endsAt: '2026-09-27T11:00:00+08:00', venue: 'Campus Garden', status: 'published' },
].map((event, index) => ({
  ...event,
  organizerName: 'Campus Student Affairs',
  category: ['Community', 'Technology', 'Leadership', 'Arts', 'Careers', 'Arts'][index],
  date: event.startsAt.slice(0, 10),
  time: event.startsAt.slice(11, 16),
  location: event.venue,
  description: [
    'Meet student organizations and explore campus activities at the welcome fair.',
    'Learn about student technology projects and join a discussion with campus developers.',
    'Practice communication and teamwork through guided leadership activities.',
    'Celebrate campus creativity through performances and exhibits.',
    'Meet employers, explore internships, and learn how to prepare for your first interview.',
    'Explore photography around campus with fellow students. Bring your own camera or phone.',
  ][index],
  slots: [50, 30, 20, 40, 2, 0][index], // Total capacity; remaining slots are derived from registrations.
  isRegistered: false, // Replaced with the signed-in student?s status in the context.
}))
