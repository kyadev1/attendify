import assert from 'node:assert/strict'
import { test } from 'node:test'
import { startAttendanceSync } from '../src/utils/attendanceSync.js'
import { mount, deferred, event } from './helpers/renderModule.mjs'
const tick = () => new Promise(resolve => setTimeout(resolve, 0))
function scheduler(refresh = async () => true) {
  const host = new EventTarget(), page = new EventTarget(), network = { onLine: true }
  page.visibilityState = 'visible'
  const timers = new Map(), errors = []; let id = 0
  const stop = startAttendanceSync({ refresh, onError: value => errors.push(value), host, page, network,
    schedule: (fn, delay) => { timers.set(++id, { fn, delay }); return id }, cancel: key => timers.delete(key) })
  const fire = delay => { const entry = [...timers].find(([, task]) => task.delay === delay); assert.ok(entry, 'timer '+delay); timers.delete(entry[0]); entry[1].fn() }
  return { host, page, network, timers, errors, stop, fire }
}
test('polls at low frequency, debounces focus, and never overlaps reads', async () => {
  const request = deferred(); let calls = 0
  const s = scheduler(() => { calls++; return request.promise })
  s.host.dispatchEvent(new Event('focus')); s.host.dispatchEvent(new Event('focus'))
  assert.equal(s.timers.size, 1); s.fire(250)
  s.host.dispatchEvent(new Event('focus')); assert.equal(calls, 1)
  request.resolve(true); await tick(); s.fire(250); await tick()
  assert.equal(calls, 2); s.stop(); assert.equal(s.timers.size, 0)
})
test('hidden/offline tabs pause and reconnect refreshes without reload', async () => {
  const s = scheduler()
  s.page.visibilityState = 'hidden'; s.page.dispatchEvent(new Event('visibilitychange'))
  assert.equal(s.timers.size, 0)
  s.network.onLine = false; s.host.dispatchEvent(new Event('offline')); assert.match(s.errors.at(-1), /offline/)
  s.page.visibilityState = 'visible'; s.network.onLine = true; s.host.dispatchEvent(new Event('online'))
  s.fire(250); await tick(); assert.equal(s.errors.at(-1), ''); s.stop()
})
test('failed reads back off and recover; timeout aborts hung reads', async () => {
  let fail = true
  const s = scheduler(async () => { if (fail) throw Error('network'); return true })
  s.fire(15000); await tick(); assert.match(s.errors.at(-1), /delayed/)
  fail = false; s.fire(30000); await tick(); assert.equal(s.errors.at(-1), ''); s.stop()
  let signal
  const hung = scheduler(value => { signal = value; return new Promise(() => {}) })
  hung.fire(15000); hung.fire(20000); await tick()
  assert.equal(signal.aborted, true); assert.match(hung.errors.at(-1), /delayed/); hung.stop()
})
test('cleanup aborts pending reads and prevents late status/listener updates', async () => {
  const request = deferred(); let signal
  const s = scheduler(value => { signal = value; return request.promise })
  s.fire(15000); s.stop(); assert.equal(signal.aborted, true)
  request.reject(Error('old session')); await tick()
  s.host.dispatchEvent(new Event('online')); assert.equal(s.timers.size, 0); assert.equal(s.errors.length, 0)
})
async function provider(role = 'student') {
  let hook; const request = deferred()
  const booking = { id: 'r1', eventId: event.id, studentId: 'student-1', status: 'registered' }
  const record = { registrationId: 'r1', eventId: event.id, studentId: 'student-1', attendedAt: '2026-11-10T01:10:00Z' }
  const app = await mount('src/context/EventsProvider.jsx', { role, initial: [[event], [booking], [], {}, false], modules: {
    '../hooks/useRealtimeAttendance': { default: options => { hook = options } },
    '../services/eventService': { fetchEvents: async () => [event], createEvent: async () => {}, updateEvent: async () => {}, removeEvent: async () => {} },
    '../services/registrationService': { fetchRegistrations: async () => [booking], fetchRegistrationCounts: async () => ({ [event.id]: 1 }), registerForEvent: async () => booking },
    '../services/attendanceService': { fetchVerifiedAttendanceRecords: async () => { throw Error('Unexpected export in this test') }, fetchAttendanceRecords: () => request.promise, checkInTicket: async () => record },
  } })
  const value = () => app.render().props.value
  value()
  return { app, request, record, value, hook: () => hook }
}
for (const role of ['student', 'organizer']) test(role+' external attendance updates shared records/counts without page loading', async () => {
  const p = await provider(role); const run = p.hook().refresh(new AbortController().signal)
  assert.equal(p.value().loading, false); assert.equal(p.value().attendanceList.length, 0)
  p.request.resolve([p.record]); assert.equal(await run, true)
  assert.equal(p.value().attendanceList.length, 1)
  assert.equal(p.value().registrations[0].attendedAt, p.record.attendedAt)
  assert.equal(p.value().events[0].slotsRemaining, 19)
})
for (const mode of ['logout', 'switch', 'abort']) test('background snapshot rejected after '+mode, async () => {
  const p = await provider(); const controller = new AbortController()
  const run = p.hook().refresh(controller.signal)
  if (mode === 'abort') controller.abort()
  else p.app.setAuth(mode === 'logout' ? null : { id: 'student-2', role: 'student' })
  p.request.resolve([p.record]); assert.equal(await run, false)
  assert.equal(p.value().attendanceList.length, 0)
})
test('background failure retains data and initial page error can recover', async () => {
  const p = await provider(); const run = p.hook().refresh()
  p.request.reject(Error('permission denied')); await assert.rejects(run, /permission/)
  assert.equal(p.value().events.length, 1); assert.equal(p.value().error, '')
  p.hook().onError('delayed'); assert.equal(p.value().syncError, 'delayed')
  p.app.setAuth(null); p.value(); assert.equal(p.value().syncError, '')
})
test('normal token refresh preserves stable synchronization callbacks', async () => {
  const p = await provider(); const refresh = p.hook().refresh
  p.app.setAuth({ ...p.app.auth.user }, p.app.auth.sessionGeneration); p.value()
  assert.equal(p.hook().refresh, refresh)
})

test('newer background snapshot wins when responses resolve out of order', async () => {
  const p = await provider()
  const first = p.hook().refresh(), second = p.hook().refresh()
  p.request.resolve([p.record])
  assert.equal(await first, false); assert.equal(await second, true)
  assert.equal(p.value().attendanceList.length, 1)
})
test('confirmed local deletion supersedes a background snapshot', async () => {
  const p = await provider('organizer')
  const pending = p.hook().refresh()
  await p.value().deleteEvent(event.id)
  p.request.resolve([p.record]); assert.equal(await pending, false)
  assert.equal(p.value().events.length, 0)
})
test('manual refresh supersedes an older background snapshot', async () => {
  const p = await provider()
  const pending = p.hook().refresh()
  const manual = p.value().refreshEvents()
  p.request.resolve([p.record]); assert.equal(await pending, false); await manual
  assert.equal(p.value().attendanceList.length, 1); assert.equal(p.value().loading, false)
})
test('late failure from previous account does not publish an error', async () => {
  const p = await provider()
  const pending = p.hook().refresh()
  p.app.setAuth({ id: 'student-2', role: 'student' }); p.value()
  p.request.reject(Error('old permission failure'))
  assert.equal(await pending, false); assert.equal(p.value().syncError, '')
})

test('successful background snapshot clears an initial read error', async () => {
  const p = await provider(); p.app.slots[0].error = 'Initial network failure'
  const pending = p.hook().refresh(); p.request.resolve([p.record]); await pending
  assert.equal(p.value().error, ''); assert.equal(p.value().attendanceList.length, 1)
})
test('hook maintains one scheduler and cleans up on disable and Strict Mode replay', async () => {
  let active = 0, starts = 0
  const app = await mount('src/hooks/useRealtimeAttendance.js', { effects: true, modules: {
    '../utils/attendanceSync': { startAttendanceSync: () => { active++; starts++; return () => { active-- } } },
  } })
  const props = { enabled: true, refresh: () => {}, onError: () => {} }
  app.render(props); app.flushEffects(); assert.equal(active, 1)
  app.render(props); app.flushEffects(); assert.equal(starts, 1)
  app.replayEffects(); assert.equal(active, 1)
  app.render({ ...props, enabled: false }); app.flushEffects(); assert.equal(active, 0)
  app.unmount()
})
