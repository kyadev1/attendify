import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { mount, nodes, text, button, deferred, event } from './helpers/renderModule.mjs'
import { eventRequestError, eventFormError } from '../src/utils/eventRequestError.js'
import { eventPhase, eventScheduleFields } from '../src/utils/eventTime.js'

const feedbackPath = 'src/components/EventDataFeedback/EventDataFeedback.jsx'
const feedbackImport = '../../../components/EventDataFeedback/EventDataFeedback'
const screens = [
  ['BrowseEvents', 'student'], ['MyEvents', 'organizer'], ['EventManagement', 'organizer'], ['CreateEditEvent', 'organizer'],
]
async function screen(name, role, events) {
  return mount('src/pages/' + role + '/components/' + name + '.jsx', { role, events, modules: {
    [feedbackImport]: { default: 'EventDataFeedback' },
    '../../../hooks/useEventClock': { default: () => Date.parse('2026-11-03T00:00:00Z') },
    '../../../utils/eventTime': { eventPhase },
    './CreateEventForm': { default: 'CreateEventForm' },
  } })
}
const feedback = tree => nodes(tree).find(node => node.type === 'EventDataFeedback')
for (const [name, role] of screens) {
  test(name + ': initial and slow requests display loading, never empty or not found', async () => {
    const data = { events: [], loading: true, hasLoaded: false }
    const app = await screen(name, role, data)
    for (let i = 0; i < 2; i++) {
      const tree = app.render()
      assert.equal(feedback(tree).props.loading, true)
      assert.doesNotMatch(text(tree), /not found|No events|No matching|0 events shown|0 events found/i)
      assert.equal(app.navigations.length, 0)
    }
    data.loading = false; data.hasLoaded = true; data.events = [event]
    const loaded = app.render()
    assert.equal(feedback(loaded).props.loading, false)
    assert.doesNotMatch(text(loaded), /not found/)
    if (name === 'CreateEditEvent') assert.ok(nodes(loaded).some(node => node.type === 'CreateEventForm'))
    else assert.match(text(loaded), /Campus Event/)
  })
  for (const failure of [new TypeError('Failed to fetch private-url'), { code: 'XX000', message: 'database secret SQL diagnostics' }, { code: '42501', message: 'private schema/table details' }]) {
    test(name + ': failed reads are distinct from empty/not found and never expose diagnostics: ' + (failure.code || 'network'), async () => {
      const data = { events: [], loading: false, hasLoaded: false, error: eventRequestError(failure).message, loadFailure: eventRequestError(failure) }
      const app = await screen(name, role, data), tree = app.render()
      assert.equal(feedback(tree).props.error, data.error)
      assert.equal(feedback(tree).props.failure.kind, data.loadFailure.kind)
      assert.doesNotMatch(text(tree), /not found|No events|No matching|secret|private/i)
      assert.equal(app.navigations.length, 0)
    })
  }
}
for (const name of ['BrowseEvents', 'MyEvents']) test(name + ': successful zero results show a genuine empty state', async () => {
  const app = await screen(name, name === 'BrowseEvents' ? 'student' : 'organizer', { events: [], loading: false, hasLoaded: true })
  assert.match(text(app.render()), name === 'BrowseEvents' ? /No matching events/ : /No events yet/)
})
for (const name of ['EventManagement', 'CreateEditEvent']) {
  test(name + ': direct navigation waits before declaring nonexistent event', async () => {
    const data = { events: [], loading: true, hasLoaded: false }, app = await screen(name, 'organizer', data)
    assert.doesNotMatch(text(app.render()), /not found/)
    data.loading = false; data.hasLoaded = true
    assert.match(text(app.render()), /Event not found/)
    assert.equal(app.navigations.length, 0)
  })
  test(name + ': foreign-owned event is denied without exposing its details', async () => {
    const app = await screen(name, 'organizer', { events: [{ ...event, organizerId: 'someone-else', title: 'Private Title' }] })
    const tree = app.render()
    assert.match(text(tree), /Event access unavailable/)
    assert.doesNotMatch(text(tree), /Private Title/)
    assert.ok(nodes(tree).some(node => node.props?.role === 'alert'))
  })
  test(name + ': authorization failure does not render cached restricted content', async () => {
    const app = await screen(name, 'organizer', { error: 'Access denied', loadFailure: eventRequestError({ status: 403 }), hasLoaded: true })
    assert.doesNotMatch(text(app.render()), /Campus Event/)
    assert.ok(feedback(app.render()))
  })
}

test('edit form remains at the same keyed position during refresh and recoverable failure', async () => {
  const data = { events: [event], loading: false, hasLoaded: true }, app = await screen('CreateEditEvent', 'organizer', data)
  const form = () => nodes(app.render()).find(node => node.type === 'CreateEventForm')
  const first = form()
  data.loading = true; assert.equal(form().key, first.key)
  data.loading = false; data.error = 'Temporary failure'; assert.equal(form().key, first.key)
  app.setAuth({ id: 'organizer-1', role: 'organizer' }); assert.notEqual(form().key, first.key, 'New session must reset local form state')
})

test('retry consumes rejection, blocks repeated clicks, and allows a later retry', async () => {
  const request = deferred(); let calls = 0
  const app = await mount(feedbackPath)
  const props = { initial: true, error: 'private error', onRetry: () => { calls++; return request.promise } }
  let tree = app.render(props)
  assert.ok(nodes(tree).some(node => node.props?.role === 'alert'))
  assert.doesNotMatch(text(tree), /private/)
  const trigger = button(tree, 'Try again')
  const first = trigger.props.onClick(); await trigger.props.onClick()
  assert.equal(calls, 1)
  assert.equal(button(app.render(props), 'Retrying...').props.disabled, true)
  request.reject(new TypeError('Failed to fetch secrets'))
  await first
  tree = app.render(props); assert.match(text(tree), /Check your connection/)
  await button(tree, 'Try again').props.onClick(); assert.equal(calls, 2)
})
test('loading retry is disabled; authorization failure has no misleading retry', async () => {
  const app = await mount(feedbackPath)
  const tree = app.render({ loading: true, initial: true })
  assert.ok(nodes(tree).some(node => node.props?.role === 'status' && /Loading events/.test(text(node))))
  const denied = app.render({ error: 'Denied', failure: eventRequestError({ status: 403 }) })
  assert.equal(nodes(denied).filter(node => node.type === 'Button').length, 0)
})
test('retry succeeds without navigation or full reload', async () => {
  const app = await mount(feedbackPath), props = { error: 'network', onRetry: async () => {} }
  await button(app.render(props), 'Try again').props.onClick()
  assert.equal(app.render({}), null)
  assert.equal(app.navigations.length, 0)
})
test('account changes hide late retry failures and reset duplicate guards', async () => {
  const pending = deferred(); const app = await mount(feedbackPath)
  const first = button(app.render({ error: 'failure', onRetry: () => pending.promise }), 'Try again').props.onClick()
  app.setAuth({ id: 'organizer-2', role: 'organizer' })
  assert.equal(app.render({}), null)
  pending.reject(Error('Old secret')); await first
  assert.equal(app.render({}), null)
  let calls = 0
  await button(app.render({ error: 'failure', onRetry: async () => { calls++ } }), 'Try again').props.onClick()
  assert.equal(calls, 1)
})

test('save failures retain every entered field and use safe accessible error feedback', async () => {
  const request = deferred()
  const app = await mount('src/pages/organizer/components/CreateEventForm.jsx', { events: { saveEvent: () => request.promise }, modules: {
    '../../../utils/eventTime': { eventScheduleFields },
  } })
  const values = { title: 'My unsaved title', category: 'Community', date: '2026-11-10', time: '09:00', endDate: '2026-11-10', endTime: '11:00', location: 'Hall', slots: '30', description: 'Unsaved description' }
  for (const [name, value] of Object.entries(values)) nodes(app.render()).find(node => node.props?.name === name).props.onChange({ target: { name, value } })
  const submit = nodes(app.render()).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} })
  request.reject({ code: 'XX000', message: 'SQL capacity/table password private-details' }); await submit
  const tree = app.render()
  for (const [name, value] of Object.entries(values)) assert.equal(nodes(tree).find(node => node.props?.name === name).props.value, value)
  assert.ok(nodes(tree).some(node => node.props?.role === 'alert' && /entries have been kept/.test(text(node))))
  assert.doesNotMatch(text(tree), /SQL|password|private-details/)
})
for (const failure of [new Error('Capacity must be a whole number of at least 1.'), { message: 'End date and time must be after the start.', field: 'endTime' }]) {
  test('existing validation messages remain available: ' + failure.message, () => assert.equal(eventFormError(failure), failure.message))
}

test('provider loading/read failures are sanitized and retain the successful-data marker', async () => {
  const requests = [deferred(), deferred(), deferred()]; let calls = 0
  const app = await mount('src/context/EventsProvider.jsx', { modules: {
    '../services/eventService': { fetchEvents: () => requests[calls++].promise, createEvent() {}, updateEvent() {}, removeEvent() {} },
    '../services/registrationService': { fetchRegistrations: async () => [], fetchRegistrationCounts: async () => ({}), registerForEvent() {} },
    '../services/attendanceService': { fetchVerifiedAttendanceRecords: async () => { throw Error('Unexpected export in this test') }, fetchAttendanceRecords: async () => [], checkInTicket() {} },
  } })
  const value = () => app.render().props.value
  const first = value().refreshEvents()
  assert.equal(value().hasLoaded, false); assert.equal(value().loading, true)
  requests[0].reject({ code: 'XX000', message: 'SQL secret' }); await first
  assert.equal(value().hasLoaded, false); assert.equal(value().loadFailure.kind, 'database'); assert.doesNotMatch(value().error, /SQL|secret/)
  const second = value().refreshEvents(); requests[1].resolve([event]); await second
  assert.equal(value().hasLoaded, true); assert.equal(value().error, ''); assert.equal(value().loadFailure, null)
  const third = value().refreshEvents(); requests[2].reject(new TypeError('Failed to fetch')); await third
  assert.equal(value().hasLoaded, true); assert.equal(value().events.length, 1); assert.equal(value().loadFailure.kind, 'network')
})

function dialogDom() {
  const root = { style: { overflow: 'auto' } }, body = { style: { overflow: '' } }, main = { style: { overflow: 'visible' } }
  const doc = { documentElement: root, body, getElementById: () => main }
  const control = () => ({ isConnected: true, focus() { doc.activeElement = this }, getClientRects: () => [1], closest: () => null })
  const opener = control(), first = control(), last = control(); doc.activeElement = opener
  const controls = [first, last]
  let shown = 0, closed = 0
  const dialog = { querySelector: () => first, querySelectorAll: () => controls, showModal() { shown++ }, close() { closed++ }, focus() { doc.activeElement = dialog }, getBoundingClientRect: () => ({ left: 20, right: 460, top: 20, bottom: 500 }) }
  return { doc, root, body, main, dialog, first, last, opener, controls, shown: () => shown, closed: () => closed }
}
async function modal(props = {}) {
  const dom = dialogDom(); let portalTarget
  const app = await mount('src/components/Modal/components/Modal.jsx', { effects: true, globals: { document: dom.doc }, modules: {
    'react-dom': { createPortal: (tree, target) => { portalTarget = target; return tree } },
  } })
  const tree = app.render({ title: 'Confirmation', message: 'Description', ...props })
  tree.props.ref.current = dom.dialog; app.flushEffects()
  return { app, tree, ...dom, portalTarget }
}
const keyEvent = (dom, key = 'Tab', shiftKey = false) => ({ key, shiftKey, currentTarget: dom.dialog, prevented: false, preventDefault() { this.prevented = true }, stopPropagation() {} })
test('shared modal uses native modal/top layer, focuses inside, locks scroll and restores focus/styles', async () => {
  const m = await modal()
  assert.equal(m.portalTarget, m.body); assert.equal(m.shown(), 1)
  assert.equal(m.doc.activeElement, m.first)
  for (const element of [m.root, m.body, m.main]) assert.equal(element.style.overflow, 'hidden')
  assert.equal(m.tree.props.role, 'dialog'); assert.equal(m.tree.props['aria-modal'], 'true')
  assert.ok(nodes(m.tree).find(node => node.props?.id === m.tree.props['aria-labelledby']))
  assert.ok(nodes(m.tree).find(node => node.props?.id === m.tree.props['aria-describedby']))
  m.app.replayEffects(); assert.equal(m.shown(), 2); assert.equal(m.closed(), 1)
  m.app.unmount(); assert.equal(m.closed(), 2); assert.equal(m.doc.activeElement, m.opener)
  assert.equal(m.root.style.overflow, 'auto'); assert.equal(m.body.style.overflow, ''); assert.equal(m.main.style.overflow, 'visible')
})
test('Tab and Shift+Tab contain focus, excluding hidden controls', async () => {
  const m = await modal()
  m.controls.push({ getClientRects: () => [], closest: () => null })
  m.doc.activeElement = m.last
  const tab = keyEvent(m); m.tree.props.onKeyDown(tab)
  assert.equal(tab.prevented, true); assert.equal(m.doc.activeElement, m.first)
  const back = keyEvent(m, 'Tab', true); m.tree.props.onKeyDown(back)
  assert.equal(back.prevented, true); assert.equal(m.doc.activeElement, m.last)
  m.controls.splice(0); const empty = keyEvent(m); m.tree.props.onKeyDown(empty)
  assert.equal(m.doc.activeElement, m.dialog); m.app.unmount()
})
for (const dismissible of [false, true]) test('Escape/backdrop follow intended dismissal: ' + dismissible, async () => {
  let closes = 0
  const m = await modal({ dismissible, onClose: () => { closes++ } })
  const escape = keyEvent(m, 'Escape'); m.tree.props.onCancel(escape); assert.equal(escape.prevented, true)
  m.tree.props.onClick({ target: m.dialog, currentTarget: m.dialog, clientX: 0, clientY: 0 })
  assert.equal(closes, dismissible ? 2 : 0)
  assert.equal(nodes(m.tree).filter(node => node.props?.['aria-label'] === 'Close dialog').length, dismissible ? 1 : 0)
  m.app.unmount()
})
for (const requiresConfirmation of [true, false]) test('registration success requires explicit continuation and preserves route/message: ' + requiresConfirmation, async () => {
  const app = await mount('src/authentication/components/RegistrationSuccessModal.jsx')
  assert.equal(app.render({ open: false }), null)
  const tree = app.render({ open: true, requiresConfirmation })
  assert.equal(tree.type, 'Modal'); assert.equal(tree.props.dismissible, false)
  assert.equal(tree.props.title, 'Registration Successful!')
  assert.match(tree.props.message, requiresConfirmation ? /check your email/ : /access your dashboard/)
  const action = button(tree, requiresConfirmation ? 'Go to Login' : 'Go to Dashboard')
  assert.ok('data-modal-focus' in action.props); action.props.onClick()
  assert.equal(app.navigations[0][0], requiresConfirmation ? '/login' : '/dashboard')
})
test('registration dialog CSS retains viewport scrolling and reduced-motion handling', async () => {
  const css = await readFile(new URL('../src/authentication/styles/RegistrationSuccessModal.module.css', import.meta.url), 'utf8')
  assert.match(css, /max-height:\s*calc\(100dvh - 2rem\)/)
  assert.match(css, /overflow-y:\s*auto/); assert.match(css, /overflow-wrap:\s*anywhere/)
  assert.match(css, /prefers-reduced-motion/)
})
