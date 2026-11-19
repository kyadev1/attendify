import assert from 'node:assert/strict'
import { test } from 'node:test'
import { event, deferred, mount } from './helpers/renderModule.mjs'
import { normalizeEvent } from '../src/utils/eventForm.js'
import { eventRequestError } from '../src/utils/eventRequestError.js'

const studentA = { id: 'student-1', role: 'student', name: 'Student A' }
const studentB = { id: 'student-2', role: 'student', name: 'Student B' }
const organizerA = { id: 'organizer-1', role: 'organizer', name: 'Organizer A' }
const organizerB = { id: 'organizer-2', role: 'organizer', name: 'Organizer B' }
const booking = { id: 'registration-a', eventId: event.id, studentId: studentA.id, status: 'registered' }
const attended = { registrationId: booking.id, eventId: event.id, studentId: studentA.id, studentName: studentA.name, attendedAt: '2026-11-10T01:10:00Z' }
const values = { title: 'Created by A', category: 'Academic', location: 'Hall', description: 'Campus event', date: '2026-11-10', time: '09:00', endDate: '2026-11-10', endTime: '11:00', slots: '20' }
const tick = () => new Promise(resolve => setTimeout(resolve, 0))
const value = app => app.render().props.value
function assertEmpty(app) {
  const current = value(app)
  assert.equal(current.events.length, 0)
  assert.equal(current.registrations.length, 0)
  assert.equal(current.attendanceList.length, 0)
  assert.equal(current.error, '')
}
async function provider({ role = 'student', service = {}, initial = [[event], [], [], {}], effects = false } = {}) {
  const queues = { events: [], registrations: [], counts: [], attendance: [] }
  const calls = { events: 0, registrations: 0, counts: 0, attendance: 0, create: 0, update: 0, remove: 0, register: 0, checkIn: 0 }
  const read = (key, fallback) => () => { calls[key]++; return queues[key].shift()?.promise || Promise.resolve(fallback) }
  const app = await mount('src/context/EventsProvider.jsx', {
    role, initial, effects,
    modules: {
      '../utils/eventForm': { normalizeEvent },
      '../utils/ticketData': { parseTicketPayload: () => ({ registrationId: booking.id, eventId: event.id, studentId: studentA.id }) },
      '../services/eventService': {
        fetchEvents: read('events', []),
        createEvent: async (...args) => { calls.create++; return service.create ? service.create(...args) : { ...event, id: 'created-a' } },
        updateEvent: async (...args) => { calls.update++; return service.update ? service.update(...args) : { ...event, title: values.title } },
        removeEvent: async (...args) => { calls.remove++; return service.remove?.(...args) },
      },
      '../services/registrationService': {
        fetchRegistrations: read('registrations', []),
        fetchRegistrationCounts: read('counts', {}),
        registerForEvent: async (...args) => { calls.register++; return service.register ? service.register(...args) : booking },
      },
      '../services/attendanceService': { fetchVerifiedAttendanceRecords: async () => { throw Error('Unexpected export in this test') },
        fetchAttendanceRecords: read('attendance', []),
        checkInTicket: async (...args) => { calls.checkIn++; return service.checkIn ? service.checkIn(...args) : attended },
      },
    },
  })
  function queue(key) { const request = deferred(); queues[key].push(request); return request }
  function snapshot() {
    const requests = Object.fromEntries(Object.keys(queues).map(key => [key, queue(key)]))
    return {
      requests,
      resolve({ events = [], registrations = [], counts = {}, attendance = [] } = {}) {
        requests.events.resolve(events); requests.registrations.resolve(registrations)
        requests.counts.resolve(counts); requests.attendance.resolve(attendance)
      },
    }
  }
  value(app)
  return { app, calls, queue, snapshot }
}

test('registration response from A cannot update B, even before B renders', async () => {
  const request = deferred()
  const { app, calls } = await provider({ service: { register: () => request.promise } })
  const operation = value(app).registerEvent(event.id)
  const oldStorage = app.slots
  app.setAuth(null)
  app.setAuth(studentB)
  request.resolve(booking)
  await assert.rejects(operation, /session has changed/)
  assert.equal(oldStorage[0].registrationRows.length, 0)
  assert.equal(calls.counts, 0, 'No follow-up read may run under the new account')
  assertEmpty(app)
})

for (const action of ['create', 'update', 'remove']) {
  test('organizer ' + action + ' response is ignored after account switch', async () => {
    const request = deferred()
    const { app } = await provider({ role: 'organizer', service: { [action]: () => request.promise } })
    const api = value(app)
    const operation = action === 'remove' ? api.deleteEvent(event.id) : api.saveEvent(values, action === 'update' ? event.id : undefined)
    app.setAuth(organizerB)
    assertEmpty(app)
    request.resolve({ ...event, title: 'A private event' })
    await assert.rejects(operation, /session has changed/)
    assertEmpty(app)
  })
}

test('check-in completion after logout returns no old booking and starts no follow-up read', async () => {
  const request = deferred()
  const { app, calls } = await provider({ role: 'organizer', service: { checkIn: () => request.promise } })
  const operation = value(app).checkIn('ticket', event.id)
  app.setAuth(null)
  assertEmpty(app)
  request.resolve(attended)
  const result = await operation
  assert.equal(result.type, 'error')
  assert.equal(result.booking, undefined)
  assert.match(result.message, /session has changed/)
  assert.equal(calls.attendance, 0)
  assertEmpty(app)
})

for (const fail of [false, true]) {
  test('registration count ' + (fail ? 'failure' : 'success') + ' cannot write to a later login', async () => {
    const { app, queue } = await provider()
    const counts = queue('counts')
    const operation = value(app).registerEvent(event.id)
    await tick()
    assert.equal(value(app).registrations.length, 1)
    app.setAuth(null)
    app.setAuth(studentB)
    assertEmpty(app)
    if (fail) counts.reject(new Error('Old count failure'))
    else counts.resolve({ [event.id]: 19 })
    await assert.rejects(operation, /session has changed/)
    assertEmpty(app)
  })
  test('attendance refresh ' + (fail ? 'failure' : 'success') + ' cannot write to a later login', async () => {
    const { app, queue } = await provider({ role: 'organizer' })
    const records = queue('attendance')
    const operation = value(app).checkIn('ticket', event.id)
    await tick()
    assert.equal(value(app).attendanceList.length, 1)
    app.setAuth(organizerB)
    assertEmpty(app)
    if (fail) records.reject(new Error('Old attendance failure'))
    else records.resolve([attended])
    const result = await operation
    assert.equal(result.type, 'error')
    assert.equal(result.booking, undefined)
    assertEmpty(app)
  })
}

for (const kind of ['register', 'create', 'update', 'remove', 'checkIn']) {
  test(kind + ' rejection after logout cannot publish old error or data', async () => {
    const request = deferred()
    const { app } = await provider({ role: kind === 'register' ? 'student' : 'organizer', service: { [kind]: () => request.promise } })
    const api = value(app)
    const operation = kind === 'register' ? api.registerEvent(event.id)
      : kind === 'checkIn' ? api.checkIn('ticket', event.id)
      : kind === 'remove' ? api.deleteEvent(event.id)
      : api.saveEvent(values, kind === 'update' ? event.id : undefined)
    app.setAuth(null)
    request.reject(new Error('Private server error for account A'))
    if (kind === 'checkIn') {
      const result = await operation
      assert.match(result.message, /session has changed/)
    } else await assert.rejects(operation, /session has changed/)
    assertEmpty(app)
  })
}

test('newer refresh wins when complete snapshots resolve out of order', async () => {
  const { app, snapshot } = await provider()
  const first = snapshot(), second = snapshot()
  const api = value(app)
  const older = api.refreshEvents(), newer = api.refreshEvents()
  second.resolve({ events: [{ ...event, title: 'Newest' }], registrations: [booking], counts: { [event.id]: 2 } })
  await newer
  first.resolve({ events: [{ ...event, title: 'Old' }], counts: { [event.id]: 18 } })
  await older
  assert.equal(value(app).events[0].title, 'Newest')
  assert.equal(value(app).events[0].slotsRemaining, 18)
  assert.equal(value(app).registrations.length, 1)
  assert.equal(value(app).loading, false)
})

test('stale refresh failure cannot clear the newer loading state or publish an error', async () => {
  const { app, snapshot } = await provider()
  const first = snapshot(), second = snapshot()
  const older = value(app).refreshEvents(), newer = value(app).refreshEvents()
  first.requests.events.reject(new Error('Old failure'))
  first.resolve()
  await older
  assert.equal(value(app).loading, true)
  assert.equal(value(app).error, '')
  assert.equal(value(app).loadFailure, null)
  second.resolve({ events: [event] })
  await newer
  assert.equal(value(app).loading, false)
})

test('old refresh completion cannot clear current-session errors or loading', async () => {
  const { app, snapshot } = await provider()
  const first = snapshot()
  const older = value(app).refreshEvents()
  app.setAuth(studentB)
  const second = snapshot()
  const newer = value(app).refreshEvents()
  second.requests.events.reject(new Error('B failed to load'))
  second.resolve()
  await newer
  first.resolve({ events: [event], registrations: [booking], attendance: [attended] })
  await older
  assert.equal(value(app).error, eventRequestError(new Error('B failed to load')).message)
  assert.equal(value(app).loadFailure.kind, 'database')
  assert.equal(value(app).hasLoaded, false)
  assert.equal(value(app).events.length, 0)
  assert.equal(value(app).loading, false)
})

test('old refresh cannot undo a confirmed registration', async () => {
  const { app, snapshot, queue } = await provider()
  const stale = snapshot()
  const refresh = value(app).refreshEvents()
  const currentCounts = queue('counts')
  currentCounts.resolve({ [event.id]: 1 })
  await value(app).registerEvent(event.id)
  const fresh = snapshot()
  fresh.resolve({ events: [event], registrations: [booking], counts: { [event.id]: 1 } })
  stale.resolve({ events: [event], registrations: [], counts: {} })
  await refresh
  assert.equal(value(app).registrations.length, 1)
  assert.equal(value(app).events[0].slotsRemaining, 19)
})

test('old refresh cannot resurrect a successfully deleted event', async () => {
  const { app, snapshot } = await provider({ role: 'organizer' })
  const stale = snapshot()
  const refresh = value(app).refreshEvents()
  await value(app).deleteEvent(event.id)
  const fresh = snapshot()
  fresh.resolve({ events: [] })
  stale.resolve({ events: [event] })
  await refresh
  assert.equal(value(app).events.length, 0)
})

test('older count read cannot replace a newer full refresh', async () => {
  const { app, queue, snapshot } = await provider()
  const oldCounts = queue('counts')
  const register = value(app).registerEvent(event.id)
  await tick()
  const fresh = snapshot()
  const refresh = value(app).refreshEvents()
  fresh.resolve({ events: [event], registrations: [booking], counts: { [event.id]: 5 } })
  await refresh
  oldCounts.resolve({ [event.id]: 1 })
  await register
  assert.equal(value(app).events[0].slotsRemaining, 15)
})

test('older attendance read cannot replace a newer check-in', async () => {
  const { app, queue } = await provider({ role: 'organizer' })
  const old = queue('attendance')
  const first = value(app).checkIn('ticket', event.id)
  await tick()
  const fresh = queue('attendance')
  const second = value(app).checkIn('ticket', event.id)
  await tick()
  const secondRecord = { ...attended, registrationId: 'registration-b', studentId: studentB.id }
  fresh.resolve([attended, secondRecord])
  await second
  old.resolve([attended])
  await first
  assert.equal(value(app).attendanceList.length, 2)
})

test('logout and rapid A/B/A switching clear cache before loading effects run', async () => {
  const { app, snapshot } = await provider()
  const data = snapshot()
  const loading = value(app).refreshEvents()
  data.resolve({ events: [event], registrations: [booking], counts: { [event.id]: 1 }, attendance: [attended] })
  await loading
  assert.equal(value(app).registrations.length, 1)
  for (const user of [null, studentB, null, studentA, studentB, organizerB, studentA]) {
    app.setAuth(user)
    assertEmpty(app)
    assert.equal(value(app).loadFailure, null)
    assert.equal(value(app).hasLoaded, false)
  }
})

test('logging back into the same account creates a distinct cache generation', async () => {
  const request = deferred()
  const { app } = await provider({ service: { register: () => request.promise } })
  const operation = value(app).registerEvent(event.id)
  app.setAuth(null)
  app.setAuth(studentA)
  assertEmpty(app)
  request.resolve(booking)
  await assert.rejects(operation, /session has changed/)
  assertEmpty(app)
})

test('callbacks retained by an old page cannot start new requests', async () => {
  const { app, calls } = await provider()
  const stale = value(app)
  app.setAuth(studentB)
  assertEmpty(app)
  await assert.rejects(stale.registerEvent(event.id), /session has changed/)
  await stale.refreshEvents()
  assert.equal(calls.register, 0)
  assert.equal(calls.events, 0)
})

for (const kind of ['create', 'update', 'remove']) {
  test('normal same-session ' + kind + ' preserves valid updates', async () => {
    const { app } = await provider({ role: 'organizer' })
    if (kind === 'remove') { await value(app).deleteEvent(event.id); assert.equal(value(app).events.length, 0) }
    else {
      const saved = await value(app).saveEvent(values, kind === 'update' ? event.id : undefined)
      assert.ok(value(app).events.some(row => row.id === saved.id))
      assert.equal(value(app).events.length, kind === 'create' ? 2 : 1)
    }
  })
}

test('effect cleanup prevents writes after unmount and Strict Mode replay discards the old load', async () => {
  const { app, snapshot } = await provider({ effects: true })
  const first = snapshot(), second = snapshot()
  app.flushEffects()
  app.replayEffects()
  second.resolve({ events: [{ ...event, title: 'Current effect' }] })
  await tick()
  first.resolve({ events: [{ ...event, title: 'Old effect' }] })
  await tick()
  assert.equal(value(app).events[0].title, 'Current effect')
  const pending = snapshot()
  const operation = value(app).refreshEvents()
  app.unmount()
  pending.resolve({ events: [{ ...event, title: 'After unmount' }] })
  await operation
  assert.equal(value(app).events[0].title, 'Current effect')
})

async function authProvider({ account = studentA, getSession, profile, signIn, signUp, signOut } = {}) {
  let listener
  const initialSession = { user: { id: account.id, email: 'a@example.test' } }
  const profiles = { [studentA.id]: studentA, [studentB.id]: studentB, [organizerA.id]: organizerA }
  let signOutCalls = 0
  const app = await mount('src/context/AuthContext.jsx', { effects: true, modules: {
    '../services/supabase': { supabase: {
      auth: {
        onAuthStateChange(callback) { listener = callback; return { data: { subscription: { unsubscribe() {} } } } },
        getSession: getSession || (async () => ({ data: { session: initialSession } })),
        signInWithPassword: signIn || (async () => { listener('SIGNED_IN', initialSession); return { data: { user: initialSession.user }, error: null } }),
        signUp: signUp || (async () => { listener('SIGNED_IN', initialSession); return { data: { session: initialSession }, error: null } }),
        signOut: async () => { signOutCalls++; return signOut ? signOut() : { error: null } },
      },
      from: () => ({ select: () => ({ eq: (_, id) => ({ single: async () => profile ? profile(id) : ({ data: { full_name: profiles[id].name, role: profiles[id].role } }) }) }) }),
    } },
  } })
  value(app); app.flushEffects(); await tick()
  return { app, emit: (event, user) => listener(event, user ? { user: { id: user.id, email: user.id + '@example.test' } } : null), signOutCalls: () => signOutCalls }
}

test('actual AuthContext invalidates old scope synchronously on logout and account switch', async () => {
  const { app, emit } = await authProvider()
  const a = value(app)
  assert.equal(a.user.id, studentA.id)
  emit('SIGNED_OUT', null)
  assert.equal(a.isSessionCurrent(a.sessionGeneration), false)
  assert.equal(value(app).user, null)
  emit('SIGNED_IN', studentB)
  assert.equal(value(app).user, null, 'A profile must not remain visible while B profile loads')
  await tick()
  const b = value(app)
  assert.equal(b.user.id, studentB.id)
  assert.ok(b.sessionGeneration > a.sessionGeneration)
})

test('actual AuthContext token refresh retains the same generation', async () => {
  const { app, emit } = await authProvider()
  const a = value(app)
  emit('TOKEN_REFRESHED', studentA)
  assert.equal(a.isSessionCurrent(a.sessionGeneration), true)
  await tick()
  assert.equal(value(app).sessionGeneration, a.sessionGeneration)
  assert.equal(value(app).user.id, studentA.id)
})

test('late initial getSession result cannot replace a newer signed-in account', async () => {
  const request = deferred()
  const { app, emit } = await authProvider({ getSession: () => request.promise })
  emit('SIGNED_IN', studentB)
  await tick()
  request.resolve({ data: { session: { user: { id: studentA.id } } } })
  await tick()
  assert.equal(value(app).user.id, studentB.id)
})

for (const kind of ['login', 'register']) {
  test('late ' + kind + ' profile cannot restore A or sign out B', async () => {
    const pending = deferred()
    let delay = false
    const { app, emit, signOutCalls } = await authProvider({ profile: async id => {
      if (delay && id === studentA.id) return pending.promise
      return { data: { full_name: id === studentA.id ? studentA.name : studentB.name, role: 'student' } }
    } })
    delay = true
    const api = value(app)
    const operation = kind === 'login'
      ? api.login({ email: 'a@example.test', password: 'test', role: 'student' })
      : api.register({ name: 'Student A', email: 'a@example.test', password: 'test-password' })
    await tick()
    emit('SIGNED_OUT', null)
    emit('SIGNED_IN', studentB)
    await tick()
    pending.resolve({ data: { full_name: studentA.name, role: 'student' } })
    await assert.rejects(operation, /session has changed/)
    await tick()
    assert.equal(value(app).user.id, studentB.id)
    assert.equal(signOutCalls(), 0)
  })
}

test('late successful logout response cannot clear a newer account', async () => {
  const request = deferred()
  const { app, emit } = await authProvider({ signOut: () => request.promise })
  const operation = value(app).logout()
  emit('SIGNED_OUT', null)
  emit('SIGNED_IN', studentB)
  await tick()
  request.resolve({ error: null })
  await operation
  assert.equal(value(app).user.id, studentB.id)
})

test('queued mutation updaters recheck the auth boundary before applying', async () => {
  const request = deferred()
  const { app, queue } = await provider({ service: { register: () => request.promise } })
  const currentCounts = queue('counts')
  const operation = value(app).registerEvent(event.id)
  const oldStorage = app.slots
  app.deferUpdates()
  request.resolve(booking)
  currentCounts.resolve({ [event.id]: 1 })
  await operation
  app.setAuth(studentB)
  app.flushUpdates()
  assert.equal(oldStorage[0].registrationRows.length, 0)
  assert.equal(oldStorage[0].counts[event.id], undefined)
  assertEmpty(app)
})

test('current-session token refresh preserves a pending mutation and cache', async () => {
  const request = deferred()
  const { app, queue } = await provider({ service: { register: () => request.promise } })
  const currentCounts = queue('counts')
  const operation = value(app).registerEvent(event.id)
  app.setAuth(studentA, app.auth.sessionGeneration)
  assert.equal(value(app).events.length, 1)
  request.resolve(booking)
  currentCounts.resolve({ [event.id]: 1 })
  await operation
  assert.equal(value(app).registrations.length, 1)
})

test('count refresh failure retains confirmed same-session registration exactly once', async t => {
  t.mock.method(console, 'error', () => {})
  const { app, queue } = await provider()
  const counts = queue('counts')
  const operation = value(app).registerEvent(event.id)
  counts.reject(new Error('Counts unavailable'))
  const result = await operation
  assert.equal(result.id, booking.id)
  assert.equal(value(app).registrations.length, 1)
  assert.equal(value(app).events[0].slotsRemaining, 19)
})

test('attendance refresh failure retains confirmed same-session check-in', async t => {
  t.mock.method(console, 'error', () => {})
  const { app, queue } = await provider({ role: 'organizer' })
  const records = queue('attendance')
  const operation = value(app).checkIn('ticket', event.id)
  records.reject(new Error('Records unavailable'))
  const result = await operation
  assert.equal(result.type, 'success')
  assert.equal(value(app).attendanceList.length, 1)
})

test('mutation during initial loading reloads the snapshot without losing unrelated events', async () => {
  const { app, snapshot } = await provider({ role: 'organizer', initial: [] })
  const stale = snapshot()
  const loading = value(app).refreshEvents()
  const saved = await value(app).saveEvent(values)
  const fresh = snapshot()
  stale.resolve({ events: [event] })
  await tick()
  assert.equal(value(app).loading, true)
  fresh.resolve({ events: [event, saved] })
  await loading
  assert.equal(value(app).events.length, 2)
  assert.equal(value(app).loading, false)
})

test('logout effect clears all cached records and finishes without fetching signed-out data', async () => {
  const { app, calls } = await provider({ effects: true, initial: [[event], [booking], [attended], { [event.id]: 1 }, false, 'Old error'] })
  app.setAuth(null)
  assertEmpty(app)
  app.flushEffects()
  assert.equal(value(app).loading, false)
  assert.equal(calls.events, 0)
  assert.equal(calls.registrations, 0)
  assert.equal(calls.attendance, 0)
})

test('late wrong-role login cleanup cannot clear a newly signed-in account', async () => {
  const signOut = deferred()
  const { app, emit } = await authProvider({ signOut: () => signOut.promise })
  const operation = value(app).login({ email: 'a@example.test', password: 'test', role: 'organizer' })
  await tick()
  emit('SIGNED_IN', studentB)
  await tick()
  signOut.resolve({ error: null })
  await assert.rejects(operation, /does not have organizer access/)
  assert.equal(value(app).user.id, studentB.id)
})

test('queued initial snapshot and later creation preserve unrelated records in dispatch order', async () => {
  const { app, snapshot } = await provider({ role: 'organizer', initial: [] })
  const fresh = snapshot()
  const loading = value(app).refreshEvents()
  app.deferUpdates()
  fresh.resolve({ events: [event], counts: { [event.id]: 5 } })
  await loading
  const created = await value(app).saveEvent(values)
  app.flushUpdates()
  assert.equal(value(app).events.length, 2)
  assert.ok(value(app).events.some(row => row.id === created.id))
  assert.equal(value(app).events.find(row => row.id === event.id).slotsRemaining, 15)
})

test('cache isolation preserves the provider subtree and auth-form children', async () => {
  const { app } = await provider()
  const form = { type: 'AuthForm', props: { inProgress: true } }
  const before = app.render({ children: form })
  app.setAuth(studentB)
  const after = app.render({ children: form })
  assert.equal(after.type, before.type)
  assert.equal(after.key, before.key)
  assert.equal(after.props.children, form)
  assert.equal(after.props.value.events.length, 0)
})

for (const account of [studentA, organizerA]) {
  test(account.role + ' login still returns the correct authenticated profile', async () => {
    const { app } = await authProvider({ account })
    const result = await value(app).login({ email: 'a@example.test', password: 'test', role: account.role })
    assert.equal(result.id, account.id)
    assert.equal(result.role, account.role)
    assert.equal(value(app).user.id, account.id)
    assert.equal(value(app).isSessionCurrent(value(app).sessionGeneration), true)
  })
}
