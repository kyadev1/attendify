import assert from 'node:assert/strict'
import { test } from 'node:test'
import { event, deferred, mount, nodes, text, button } from './helpers/renderModule.mjs'
import { eventRequestError } from '../src/utils/eventRequestError.js'

const deleteScreens = ['MyEvents', 'EventManagement']
for (const screen of deleteScreens) {
  async function setup() {
    const request = deferred()
    let calls = 0
    const app = await mount('src/pages/organizer/components/' + screen + '.jsx', { events: { deleteEvent: () => { calls++; return request.promise } } })
    button(app.render(), screen === 'MyEvents' ? 'Delete' : 'Delete Event').props.onClick()
    return { app, request, calls: () => calls }
  }
  test(screen + ': waits for confirmation, blocks rapid duplicate clicks, then succeeds', async () => {
    const { app, request, calls } = await setup()
    const confirm = button(app.render(), 'Confirm Delete')
    const first = confirm.props.onClick()
    await confirm.props.onClick() // Same pre-render handler: ref guard must work.
    assert.equal(calls(), 1)
    const pending = app.render()
    assert.equal(button(pending, 'Deleting...').props.disabled, true)
    assert.equal(button(pending, 'Cancel').props.disabled, true)
    assert.ok(!text(pending).includes('Event deleted successfully.'))
    assert.equal(app.navigations.length, 0)
    request.resolve()
    await first
    const settled = app.render()
    if (screen === 'MyEvents') assert.ok(text(settled).includes('Event deleted successfully.'))
    else assert.equal(app.navigations[0][0], '/organizer/events')
  })
  for (const failure of ['Network request failed', 'Request timed out', 'Permission denied']) {
    test(screen + ': handles ' + failure + ' and permits retry', async () => {
      const { app, request, calls } = await setup()
      const operation = button(app.render(), 'Confirm Delete').props.onClick()
      request.reject(new Error(failure))
      await operation // Must resolve: event handlers consume rejected requests.
      const tree = app.render()
      assert.ok(nodes(tree).some(node => node.props?.role === 'alert' && text(node) === eventRequestError(new Error(failure), 'delete').message))
      assert.ok(!text(tree).includes('Event deleted successfully.'))
      assert.equal(app.navigations.length, 0)
      assert.equal(button(tree, 'Confirm Delete').props.disabled, false)
      await button(tree, 'Confirm Delete').props.onClick()
      assert.equal(calls(), 2)
    })
  }
}
for (const role of ['student', 'organizer']) {
  async function setup() {
    const request = deferred()
    let calls = 0
    const app = await mount('src/components/Sidebar/components/Sidebar.jsx', { role, logout: () => { calls++; return request.promise } })
    button(app.render({ role }), 'Log Out').props.onClick()
    return { app, request, calls: () => calls, props: { role } }
  }
  function modal(tree) { return nodes(tree).find(node => node.type === 'Modal') }
  test(role + ': logout waits, blocks duplicates and closes only after success', async () => {
    const { app, request, calls, props } = await setup()
    const confirm = button(modal(app.render(props)).props.actions, 'Log Out')
    const first = confirm.props.onClick()
    await confirm.props.onClick()
    assert.equal(calls(), 1)
    let tree = app.render(props)
    assert.equal(button(tree, 'Logging out...').props.disabled, true)
    assert.equal(button(tree, 'Cancel').props.disabled, true)
    modal(tree).props.onClose()
    assert.ok(modal(app.render(props)))
    request.resolve()
    await first
    assert.equal(modal(app.render(props)), undefined)
  })
  test(role + ': failed logout remains open, shows error and enables retry', async () => {
    const { app, request, calls, props } = await setup()
    const operation = button(modal(app.render(props)).props.actions, 'Log Out').props.onClick()
    request.reject(new Error('Sign out unavailable'))
    await operation
    const dialog = modal(app.render(props))
    assert.ok(nodes(dialog).some(node => node.props?.role === 'alert' && text(node) === 'Sign out unavailable'))
    assert.equal(button(dialog.props.actions, 'Log Out').props.disabled, false)
    await button(dialog.props.actions, 'Log Out').props.onClick()
    assert.equal(calls(), 2)
  })
  test(role + ': cancelling confirmation does not sign out', async () => {
    const { app, calls, props } = await setup()
    button(modal(app.render(props)).props.actions, 'Cancel').props.onClick()
    assert.equal(modal(app.render(props)), undefined)
    assert.equal(calls(), 0)
  })
}
for (const failure of [false, true]) {
  test('EventsProvider: ' + (failure ? 'failed delete preserves data' : 'confirmed delete updates data'), async () => {
    const request = deferred()
    const app = await mount('src/context/EventsProvider.jsx', {
      initial: [[event], [], [], { [event.id]: 3 }],
      modules: {
        '../services/eventService': { fetchEvents() {}, createEvent() {}, updateEvent() {}, removeEvent: () => request.promise },
      },
    })
    const operation = app.render().props.value.deleteEvent(event.id)
    assert.equal(app.slots[0].eventsList.length, 1)
    assert.equal(app.slots[0].counts[event.id], 3)
    if (failure) {
      request.reject(new Error('Permission denied'))
      await assert.rejects(operation, /Permission denied/)
      assert.equal(app.slots[0].eventsList.length, 1)
      assert.equal(app.slots[0].counts[event.id], 3)
    } else {
      request.resolve()
      await operation
      assert.equal(app.slots[0].eventsList.length, 0)
      assert.equal(app.slots[0].counts[event.id], undefined)
    }
  })
  test('AuthProvider: ' + (failure ? 'failed logout retains user' : 'confirmed logout clears user'), async () => {
    const request = deferred()
    const signedIn = { id: 'organizer-1', role: 'organizer' }
    const app = await mount('src/context/AuthContext.jsx', { initial: [signedIn, false], modules: { '../services/supabase': { supabase: { auth: { signOut: () => request.promise } } } } })
    const operation = app.render().props.value.logout()
    assert.equal(app.slots[0], signedIn)
    request.resolve({ error: failure ? new Error('Sign out denied') : null })
    if (failure) {
      await assert.rejects(operation, /Sign out denied/)
      assert.equal(app.slots[0], signedIn)
    } else {
      await operation
      assert.equal(app.slots[0], null)
    }
  })
}
for (const result of [{ data: [{ id: event.id }], error: null }, { data: [], error: null }, { data: null, error: new Error('Permission denied') }]) {
  test('eventService: ' + (result.error ? 'rejects permission error' : result.data.length ? 'accepts confirmed deletion' : 'rejects zero deleted rows'), async () => {
    const app = await mount('src/services/eventService.js', { modules: { './supabase': { supabase: { from: table => {
      assert.equal(table, 'events')
      return { delete: () => ({ eq: (column, id) => {
        assert.equal(column, 'id'); assert.equal(id, event.id)
        return { select: async () => result }
      } }) }
    } } } } })
    const operation = app.exports.removeEvent(event.id)
    if (result.error || !result.data.length) await assert.rejects(operation)
    else await operation
  })
}

test('EventsProvider: student registration still updates bookings and refreshed capacity', async () => {
  const booking = { id: 'booking-1', eventId: event.id, studentId: 'student-1', status: 'registered' }
  const app = await mount('src/context/EventsProvider.jsx', {
    role: 'student', initial: [[event], [], [], {}],
    modules: {
      '../services/registrationService': {
        fetchRegistrations() {},
        registerForEvent: async id => { assert.equal(id, event.id); return booking },
        fetchRegistrationCounts: async () => ({ [event.id]: 1 }),
      },
    },
  })
  const saved = await app.render().props.value.registerEvent(event.id)
  assert.equal(saved.id, booking.id)
  const value = app.render().props.value
  assert.equal(value.registrations[0].id, booking.id)
  assert.equal(value.events[0].slotsRemaining, 19)
  assert.equal(value.events[0].isRegistered, true)
})

test('EventsProvider: organizer check-in still updates attendance after confirmation', async () => {
  const checked = { registrationId: 'booking-1', eventId: event.id, studentId: 'student-1', studentName: 'Student', attendedAt: '2026-11-10T01:10:00Z' }
  const app = await mount('src/context/EventsProvider.jsx', {
    initial: [[event], [], [], {}],
    modules: {
      '../utils/ticketData': { parseTicketPayload: () => ({ registrationId: 'booking-1', eventId: event.id, studentId: 'student-1' }) },
      '../services/attendanceService': {
        fetchVerifiedAttendanceRecords: async () => { throw new Error('Unexpected export in this test') },
        checkInTicket: async ticket => { assert.equal(ticket.registrationId, 'booking-1'); return checked },
        fetchAttendanceRecords: async () => [checked],
      },
    },
  })
  const result = await app.render().props.value.checkIn('isolated-ticket', event.id)
  assert.equal(result.type, 'success')
  const value = app.render().props.value
  assert.equal(value.attendanceList.length, 1)
  assert.equal(value.registrations[0].attendedAt, checked.attendedAt)
})

test('EventsProvider: unauthorized deletion never calls the database service', async () => {
  let calls = 0
  const app = await mount('src/context/EventsProvider.jsx', {
    role: 'student', initial: [[event], [], [], {}],
    modules: { '../services/eventService': { fetchEvents() {}, createEvent() {}, updateEvent() {}, removeEvent: async () => { calls++ } } },
  })
  await assert.rejects(app.render().props.value.deleteEvent(event.id), /Organizer access required/)
  assert.equal(calls, 0)
  assert.equal(app.slots[0].eventsList.length, 1)
})

test('Organizer event navigation retains edit, scanner, attendance and report routes', async () => {
  const app = await mount('src/pages/organizer/components/EventManagement.jsx')
  const targets = nodes(app.render()).filter(node => node.type === 'Link').map(node => node.props.to)
  for (const suffix of ['edit', 'scan', 'attendance', 'reports']) assert.ok(targets.includes('/organizer/events/' + event.id + '/' + suffix))
  assert.ok(targets.includes('/organizer/events'))
})
