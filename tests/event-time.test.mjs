import assert from 'node:assert/strict'
import { test } from 'node:test'
import { eventPhase, eventScheduleFields, manilaDateTimeFields, parseManilaDateTime } from '../src/utils/eventTime.js'
import { normalizeEvent } from '../src/utils/eventForm.js'
import { createEventClock } from '../src/utils/eventClock.js'
import { event, mount, nodes, text, button } from './helpers/renderModule.mjs'

const start = Date.parse(event.startsAt), end = Date.parse(event.endsAt)
const values = { title: 'Campus Event', category: 'Academic', location: 'Hall', description: 'Details', slots: '20', date: '2026-11-10', time: '09:00', endDate: '2026-11-10', endTime: '11:00' }
const readInput = (tree, name) => nodes(tree).find(node => node.type === 'input' && node.props.name === name)
const booking = { id: 'booking-1', eventId: event.id, studentId: 'student-1', studentName: 'Student', status: 'registered', registeredAt: '2026-11-01T00:00:00Z', attendedAt: null }

for (const [time, phase] of [[start - 1, 'upcoming'], [start, 'ongoing'], [start + 1, 'ongoing'], [end - 1, 'ongoing'], [end, 'completed'], [end + 1, 'completed']]) {
  test('event phase at offset ' + (time - start) + ' is ' + phase, () => assert.equal(eventPhase(event, time), phase))
}
for (const change of [{ startsAt: 'invalid' }, { endsAt: event.startsAt }, { endsAt: '2026-11-09T01:00:00Z' }]) {
  test('invalid schedules cannot be classified as available: ' + JSON.stringify(change), () => assert.equal(eventPhase({ ...event, ...change }, start), 'invalid'))
}

test('Manila formatting handles UTC date rollover and preserves seconds', () => {
  assert.deepEqual(manilaDateTimeFields('2026-11-09T16:00:12.345Z'), { date: '2026-11-10', time: '00:00:12.345' })
  assert.deepEqual(manilaDateTimeFields('2026-11-09T16:00:00Z'), { date: '2026-11-10', time: '00:00' })
  assert.equal(parseManilaDateTime('2026-11-10', '00:00'), Date.parse('2026-11-09T16:00:00Z'))
})
test('create accepts an explicit valid start/end and overnight schedules', () => {
  const created = normalizeEvent(values)
  assert.equal(created.startsAt, event.startsAt.replace('Z', '.000Z'))
  assert.equal(created.endsAt, event.endsAt.replace('Z', '.000Z'))
  const overnight = normalizeEvent({ ...values, time: '23:30', endDate: '2026-11-11', endTime: '00:30' })
  assert.equal(Date.parse(overnight.endsAt) - Date.parse(overnight.startsAt), 60 * 60 * 1000)
})
for (const hours of [1, 2, 8]) {
  test('title-only edit preserves an existing ' + hours + '-hour schedule exactly', () => {
    const existing = { ...event, description: 'Details', endsAt: new Date(start + hours * 3_600_000).toISOString() }
    const edited = normalizeEvent({ ...values, ...eventScheduleFields(existing), title: 'Renamed event' }, 0, existing)
    assert.equal(edited.startsAt, existing.startsAt)
    assert.equal(edited.endsAt, existing.endsAt)
    assert.equal(edited.title, 'Renamed event')
  })
}
test('unchanged edit preserves exact stored precision and offset spelling', () => {
  const existing = { ...event, startsAt: '2026-11-10T09:00:12.123456+08:00', endsAt: '2026-11-10T17:00:13.456789+08:00' }
  const edited = normalizeEvent({ ...values, ...eventScheduleFields(existing) }, 0, existing)
  assert.equal(edited.startsAt, existing.startsAt)
  assert.equal(edited.endsAt, existing.endsAt)
})
test('an explicit schedule change is honored without inventing a duration', () => {
  const edited = normalizeEvent({ ...values, endTime: '17:00' }, 0, event)
  assert.equal(Date.parse(edited.endsAt) - Date.parse(edited.startsAt), 8 * 3_600_000)
})
test('older edit callers omitting new end fields retain the existing end', () => {
  const { endDate: _endDate, endTime: _endTime, ...oldFields } = values
  assert.equal(normalizeEvent(oldFields, 0, event).endsAt, event.endsAt)
})
for (const change of [
  { endTime: '09:00' }, { endTime: '08:59' }, { endDate: '2026-11-09' },
  { date: '2026-02-30' }, { date: '2025-02-29' }, { time: '24:00' },
  { endDate: '' }, { endTime: '' }, { endTime: '11:99' },
]) {
  test('rejects invalid schedule ' + JSON.stringify(change), () => assert.throws(() => normalizeEvent({ ...values, ...change })))
}
test('leap-day schedules remain valid', () => assert.ok(normalizeEvent({ ...values, date: '2028-02-29', endDate: '2028-02-29' }).endsAt))
test('capacity rules remain enforced', () => {
  assert.throws(() => normalizeEvent({ ...values, slots: '1.5' }), /Capacity/)
  assert.throws(() => normalizeEvent(values, 21), /existing registrations/)
})

function fakeClock(initial = start - 1) {
  let current = initial, sequence = 0
  const timers = new Map(), windowEvents = new Map(), documentEvents = new Map()
  const target = store => ({ addEventListener: (name, fn) => store.set(name, fn), removeEventListener: (name, fn) => { if (store.get(name) === fn) store.delete(name) } })
  const clock = createEventClock({
    now: () => current,
    schedule: (fn, delay) => { const id = ++sequence; timers.set(id, { fn, at: current + delay }); return id },
    cancel: id => timers.delete(id), windowTarget: target(windowEvents), documentTarget: target(documentEvents),
  })
  return {
    clock, timers, windowEvents, documentEvents,
    advance(to) {
      while (true) {
        const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0]
        if (!next || next[1].at > to) break
        timers.delete(next[0]); current = next[1].at; next[1].fn()
      }
      current = to
    },
    jump(to, type = 'focus') { current = to; (type === 'focus' ? windowEvents : documentEvents).get(type)?.() },
  }
}
test('shared clock fires at exact event boundaries without frequent polling', () => {
  const fake = fakeClock()
  const notifications = []
  const stop = fake.clock.subscribe(() => notifications.push(fake.clock.getSnapshot()))
  const unwatch = fake.clock.watch([start, end])
  assert.equal(fake.timers.size, 1)
  fake.advance(start)
  assert.equal(notifications.at(-1), start)
  assert.equal(eventPhase(event, fake.clock.getSnapshot()), 'ongoing')
  fake.advance(end)
  assert.equal(notifications.at(-1), end)
  assert.equal(eventPhase(event, fake.clock.getSnapshot()), 'completed')
  assert.ok(notifications.length <= 122, 'Two-hour session should tick about once per minute')
  unwatch(); stop()
  assert.equal(fake.timers.size, 0)
  assert.equal(fake.windowEvents.size, 0)
  assert.equal(fake.documentEvents.size, 0)
})
test('multiple subscribers share one timer; last unsubscribe cleans up', () => {
  const fake = fakeClock()
  const stopA = fake.clock.subscribe(() => {}), stopB = fake.clock.subscribe(() => {})
  const stopWatchA = fake.clock.watch([start]), stopWatchB = fake.clock.watch([end])
  assert.equal(fake.timers.size, 1)
  stopA(); stopWatchA()
  assert.equal(fake.timers.size, 1)
  stopB(); stopWatchB()
  assert.equal(fake.timers.size, 0)
})
test('focus and visibility recovery resample throttled timers and wall-clock changes', () => {
  const fake = fakeClock()
  const stop = fake.clock.subscribe(() => {})
  fake.jump(end)
  assert.equal(eventPhase(event, fake.clock.getSnapshot()), 'completed')
  fake.jump(start - 1, 'visibilitychange')
  assert.equal(eventPhase(event, fake.clock.getSnapshot()), 'upcoming')
  stop()
})
test('clock hook subscribes, crosses boundaries while mounted, and cleans up on replay/unmount', async () => {
  const fake = fakeClock()
  const app = await mount('src/hooks/useEventClock.js', { effects: true, modules: { '../utils/eventClock': { eventClock: fake.clock } } })
  assert.equal(app.render([event]), start - 1)
  app.flushEffects()
  fake.advance(start)
  assert.equal(app.render([event]), start)
  app.replayEffects()
  assert.equal(fake.timers.size, 1)
  fake.advance(end)
  assert.equal(app.render([event]), end)
  app.unmount()
  assert.equal(fake.timers.size, 0)
  assert.equal(fake.windowEvents.size, 0)
})

async function timedPage(name, role = 'student', extra = {}) {
  let now = start - 1
  const app = await mount('src/pages/' + role + '/components/' + name + '.jsx', {
    role, events: { events: [{ ...event, slotsRemaining: 20 }], registrations: [booking], attendanceList: [], loading: false, error: '', ...extra },
    modules: { '../../../hooks/useEventClock': { default: () => now }, '../../../utils/eventTime': { eventPhase, eventScheduleFields } },
  })
  return { app, setTime: time => { now = time } }
}
function metric(tree, label) {
  const card = nodes(tree).find(node => node.type === 'div' && [node.props.children].flat(Infinity).some(child => child?.type === 'dt' && text(child) === label))
  return nodes(card).find(node => node.type === 'strong')?.props.children
}
test('Student Dashboard upcoming count changes at the exact start while attendance totals stay intact', async () => {
  const { app, setTime } = await timedPage('StudentDashboard')
  assert.equal(metric(app.render(), 'Upcoming Events'), 1)
  setTime(start)
  assert.equal(metric(app.render(), 'Upcoming Events'), 0)
  setTime(end)
  assert.equal(metric(app.render(), 'Registrations'), 1)
})
test('Organizer Dashboard becomes live at start and stops being live at exact end', async () => {
  const { app, setTime } = await timedPage('OrganizerDashboard', 'organizer')
  const hasLive = () => nodes(app.render()).some(node => node.type === 'select' && node.props.id === 'live-event')
  assert.equal(hasLive(), false)
  setTime(start)
  assert.equal(hasLive(), true)
  setTime(end)
  assert.equal(hasLive(), false)
})
test('Browse Events includes upcoming/ongoing and excludes completed instead of using September mock date', async () => {
  const { app, setTime } = await timedPage('BrowseEvents')
  const cards = () => nodes(app.render()).filter(node => node.type === 'article')
  assert.equal(cards().length, 1)
  setTime(start)
  assert.equal(cards().length, 1)
  setTime(end)
  assert.equal(cards().length, 0)
})
test('registration presentation closes at exact end and modal shares the same rule', async () => {
  const { app, setTime } = await timedPage('EventRegistration', 'student', { registrations: [] })
  assert.equal(button(app.render({ eventId: event.id }), 'Confirm Registration').props.disabled, false)
  setTime(start)
  assert.equal(button(app.render({ eventId: event.id }), 'Confirm Registration').props.disabled, false)
  setTime(end)
  assert.equal(button(app.render({ eventId: event.id }), 'Registration Closed').props.disabled, true)
  assert.equal(app.render({ eventId: event.id, inModal: true }).props.closed, true)
})
test('My Bookings upcoming group updates with the same live clock', async () => {
  const { app, setTime } = await timedPage('MyBookings')
  assert.equal(metric(app.render(), 'Upcoming Events'), 1)
  setTime(start)
  assert.equal(metric(app.render(), 'Upcoming Events'), 0)
})

for (const hours of [1, 2, 8]) {
  test('edit form initializes both ends for a ' + hours + '-hour event and submits title without schedule changes', async () => {
    const existing = { ...event, description: 'Details', endsAt: new Date(start + hours * 3_600_000).toISOString() }
    let saved
    const app = await mount('src/pages/organizer/components/CreateEventForm.jsx', {
      events: { saveEvent: async (fields, id) => { assert.equal(id, existing.id); saved = normalizeEvent(fields, 0, existing); return { ...existing, ...saved } } },
      modules: { '../../../utils/eventTime': { eventScheduleFields } },
    })
    let tree = app.render({ event: existing })
    assert.equal(readInput(tree, 'endTime').props.value, hours === 1 ? '10:00' : hours === 2 ? '11:00' : '17:00')
    readInput(tree, 'title').props.onChange({ target: { name: 'title', value: 'Renamed from form' } })
    tree = app.render({ event: existing })
    await nodes(tree).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} })
    assert.equal(saved.title, 'Renamed from form')
    assert.equal(saved.startsAt, existing.startsAt)
    assert.equal(saved.endsAt, existing.endsAt)
  })
}
test('invalid end time stays in the form with a field error and no success modal', async () => {
  let calls = 0
  const existing = { ...event, description: 'Details' }
  const app = await mount('src/pages/organizer/components/CreateEventForm.jsx', {
    events: { saveEvent: async fields => { calls++; return normalizeEvent(fields, 0, existing) } },
    modules: { '../../../utils/eventTime': { eventScheduleFields } },
  })
  let tree = app.render({ event: existing })
  readInput(tree, 'endTime').props.onChange({ target: { name: 'endTime', value: '08:00' } })
  await nodes(app.render({ event: existing })).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} })
  tree = app.render({ event: existing })
  assert.equal(calls, 1)
  assert.equal(readInput(tree, 'endTime').props['aria-invalid'], true)
  assert.ok(text(tree).includes('End date and time must be after the start.'))
  assert.ok(!nodes(tree).some(node => node.type === 'Modal'))
})
test('service maps both ends to Manila and sends unchanged existing timestamps on title update', async () => {
  let payload
  const row = { id: event.id, organizer_id: event.organizerId, title: 'Renamed', category: 'Academic', venue: 'Hall', description: 'Details', capacity: 20, status: 'published', starts_at: event.startsAt, ends_at: new Date(start + 8 * 3_600_000).toISOString() }
  const app = await mount('src/services/eventService.js', { modules: {
    '../utils/eventTime': { eventScheduleFields },
    './supabase': { supabase: { from: () => ({ update: fields => { payload = fields; return { eq: () => ({ select: () => ({ single: async () => ({ data: row }) }) }) } } }) } },
  } })
  const existing = app.exports.mapEvent(row)
  assert.equal(existing.endTime, '17:00')
  const edited = normalizeEvent({ ...values, ...eventScheduleFields(existing), title: 'Renamed' }, 0, existing)
  await app.exports.updateEvent(existing.id, edited)
  assert.equal(payload.starts_at, row.starts_at)
  assert.equal(payload.ends_at, row.ends_at)
  assert.equal(payload.title, 'Renamed')
})

test('provider preserves existing end time for an unrelated edit and rejects invalid schedules before writes', async () => {
  const existing = { ...event, description: 'Details', endsAt: '2026-11-10T09:00:00Z' }
  let written, calls = 0
  const app = await mount('src/context/EventsProvider.jsx', {
    initial: [[existing], [], [], {}],
    modules: {
      '../utils/eventForm': { normalizeEvent },
      '../services/eventService': {
        fetchEvents() {}, createEvent() {}, removeEvent() {},
        updateEvent: async (id, details) => { calls++; written = details; return { ...existing, ...details, id } },
      },
    },
  })
  const { endDate: _endDate, endTime: _endTime, ...oldFields } = values
  await app.render().props.value.saveEvent({ ...oldFields, title: 'Title only' }, existing.id)
  assert.equal(written.endsAt, existing.endsAt)
  assert.equal(written.startsAt, existing.startsAt)
  await assert.rejects(app.render().props.value.saveEvent({ ...values, endTime: '08:00' }, existing.id), /after the start/)
  assert.equal(calls, 1, 'Invalid schedule must not reach updateEvent')
})

test('create form submits its explicit end fields and opens existing success modal', async () => {
  let saved
  const app = await mount('src/pages/organizer/components/CreateEventForm.jsx', {
    events: { saveEvent: async fields => { saved = normalizeEvent(fields); return { ...event, ...saved } } },
    modules: { '../../../utils/eventTime': { eventScheduleFields }, '../../../utils/dashboardData': { formatDate: timestamp => timestamp } },
  })
  for (const [name, value] of Object.entries(values)) {
    const field = nodes(app.render()).find(node => ['input', 'textarea', 'select'].includes(node.type) && node.props.name === name)
    assert.ok(field, name)
    field.props.onChange({ target: { name, value } })
  }
  await nodes(app.render()).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} })
  assert.equal(saved.startsAt, new Date(start).toISOString())
  assert.equal(saved.endsAt, new Date(end).toISOString())
  assert.ok(nodes(app.render()).some(node => node.type === 'Modal' && node.props.title === 'Event Created Successfully!'))
})

test('service creation preserves the explicitly selected duration in its existing database fields', async () => {
  let payload
  const details = normalizeEvent({ ...values, endTime: '17:00' })
  const app = await mount('src/services/eventService.js', { modules: {
    '../utils/eventTime': { eventScheduleFields },
    './supabase': { supabase: { from: () => ({ insert: fields => { payload = fields; return { select: () => ({ single: async () => ({ data: { ...fields, id: event.id } }) }) } } }) } },
  } })
  await app.exports.createEvent(details, event.organizerId)
  assert.equal(payload.starts_at, details.startsAt)
  assert.equal(payload.ends_at, details.endsAt)
  assert.equal(payload.status, 'published')
  assert.equal(Date.parse(payload.ends_at) - Date.parse(payload.starts_at), 8 * 3_600_000)
})

test('clock hook reschedules changed event boundaries and releases obsolete ones', async () => {
  const fake = fakeClock()
  const app = await mount('src/hooks/useEventClock.js', { effects: true, modules: { '../utils/eventClock': { eventClock: fake.clock } } })
  app.render([event]); app.flushEffects()
  const changed = { ...event, startsAt: new Date(start + 10_000).toISOString() }
  app.render([changed]); app.flushEffects()
  fake.advance(start)
  assert.equal(app.render([changed]), start - 1, 'Removed boundary should not cause an update')
  fake.advance(start + 10_000)
  assert.equal(app.render([changed]), start + 10_000)
  app.unmount()
  assert.equal(fake.timers.size, 0)
})
