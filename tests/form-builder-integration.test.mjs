import test from 'node:test'
import assert from 'node:assert/strict'
import { mount, nodes, text, event } from './helpers/renderModule.mjs'
import { eventScheduleFields } from '../src/utils/eventTime.js'
const enabled = { DEV: true, PROD: false, VITE_ENABLE_FORM_BUILDER_PROTOTYPE: 'true' }
async function setup(env = enabled, role = 'organizer', saveEvent = async () => event) {
  return mount('src/pages/organizer/components/CreateEventForm.jsx', { role, importMeta: { env }, events: { saveEvent }, modules: {
    '../../../utils/eventTime': { eventScheduleFields },
    '../../../features/registrationForms/components/RegistrationFormBuilder': { default: 'ActualBuilder' },
  } })
}
const builder = tree => nodes(tree).find(n => n.type?.lazyLoader)
for (const env of [{}, { DEV: true }, { ...enabled, VITE_ENABLE_FORM_BUILDER_PROTOTYPE: 'false' }, { ...enabled, PROD: true, DEV: false }]) {
  test('integration disabled for ' + JSON.stringify(env), async () => {
    const app = await setup(env); assert.equal(builder(app.render()), undefined)
    assert.ok(nodes(app.render()).some(n => n.type === 'form'))
  })
}
test('only Organizer with ownership sees questions', async () => {
  const student = await setup(enabled, 'student')
  assert.equal(builder(student.render()), undefined)
  const app = await setup()
  assert.equal(builder(app.render({ event: { ...event, organizerId: 'other' } })), undefined)
  assert.ok(builder(app.render({ event })))
})
for (const existing of [undefined, event]) test(`${existing ? 'Edit' : 'Create'} uses existing builder outside event form and excludes questions from save`, async () => {
  let captured
  const app = await setup(enabled, 'organizer', async (...args) => { captured = args; return event })
  const tree = app.render({ event: existing }), lazy = builder(tree)
  assert.equal((await lazy.type.lazyLoader()).default, 'ActualBuilder')
  assert.equal(lazy.props.eventId, existing?.id || 'local-new-event')
  assert.equal(lazy.props.embedded, true)
  assert.match(text(tree), /Preview only — registration questions are not saved/)
  const eventForm = nodes(tree).find(n => n.type === 'form')
  assert.equal(builder(eventForm), undefined)
  await eventForm.props.onSubmit({ preventDefault() {} })
  assert.deepEqual(Object.keys(captured[0]).sort(), ['title','category','date','time','endDate','endTime','location','slots','description'].sort())
  assert.equal(captured[1], existing?.id)
  assert.equal(builder(app.render({ event: existing })).props.eventId, lazy.props.eventId)
})
test('draft boundary changes on account generation and event changes but not ordinary rerenders', async () => {
  const app = await setup()
  const key = e => nodes(app.render({ event: e })).find(n => n.props?.children?.type === 'Suspense')?.key
  const before = key(event)
  assert.ok(before); assert.equal(key(event), before)
  assert.notEqual(key({ ...event, id: 'event-2' }), before)
  app.auth.sessionGeneration++
  assert.notEqual(key(event), before)
})
