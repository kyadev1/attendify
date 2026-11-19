import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'vite'
import * as model from '../src/features/registrationForms/model.js'
import { mount, nodes, text, button } from './helpers/renderModule.mjs'

const question = (overrides = {}) => ({ id: 'q1', title: 'What would you like to learn?', type: 'short', required: false, choices: [], ...overrides })
const form = questions => ({ schemaVersion: 1, eventId: 'local-event', questions })
const choices = [{ id: 'a', label: 'First' }, { id: 'b', label: 'Second' }]
test('empty form supports normal registration; adding/editing questions preserves originals', () => {
  assert.deepEqual(model.validateDefinition(form([])), [])
  const original = []; const added = model.updateQuestions(original, { type: 'add', id: 'q1' })
  assert.equal(original.length, 0); assert.equal(added.length, 1)
  const edited = model.updateQuestions(added, { type: 'title', id: 'q1', value: 'A normal name: José 李' })
  assert.equal(added[0].title, ''); assert.deepEqual(model.validateDefinition(form(edited)), [])
})
test('types, choice editing/removal, and required toggle', () => {
  let q = [question()]
  for (const action of [
    { type: 'fieldType', value: 'dropdown' }, { type: 'addChoice', choiceId: 'a' },
    { type: 'editChoice', choiceId: 'a', value: 'First' }, { type: 'required', value: true },
  ]) q = model.updateQuestions(q, { ...action, id: 'q1' })
  assert.equal(q[0].choices[0].label, 'First'); assert.equal(q[0].required, true)
  q = model.updateQuestions(q, { type: 'removeChoice', id: 'q1', choiceId: 'a' }); assert.equal(q[0].choices.length, 0)
  q = model.updateQuestions(q, { type: 'fieldType', id: 'q1', value: 'paragraph' }); assert.deepEqual(q[0].choices, [])
})
test('stable ordering, boundary moves, and removal', () => {
  const initial = [question(), question({ id: 'q2' })]
  assert.equal(model.updateQuestions(initial, { type: 'move', id: 'q1', direction: -1 }), initial)
  const moved = model.updateQuestions(initial, { type: 'move', id: 'q1', direction: 1 })
  assert.deepEqual(moved.map(q => q.id), ['q2', 'q1']); assert.equal(moved[1], initial[0])
  assert.equal(model.updateQuestions(moved, { type: 'remove', id: 'q1' }).length, 1)
})
for (const [name, value] of [
  ['blank title', question({ title: ' ' })], ['long title', question({ title: 'x'.repeat(201) })],
  ['unsupported type', question({ type: 'file' })], ['invalid required', question({ required: 'yes' })],
  ['missing choices', question({ type: 'radio' })], ['duplicate labels', question({ type: 'dropdown', choices: [{ id: 'a', label: 'First' }, { id: 'b', label: ' first ' }] })],
  ['duplicate choice IDs', question({ type: 'checkbox', choices: [{ id: 'a', label: 'First' }, { id: 'a', label: 'Second' }] })],
  ['long choice', question({ type: 'radio', choices: [choices[0], { id: 'b', label: 'x'.repeat(101) }] })],
  ['invalid shape', null], ['text choices', question({ choices })],
]) test(`definition rejects ${name}`, () => assert.ok(model.validateDefinition(form([value])).length))
test('invalid definition containers and duplicate question IDs are rejected', () => {
  for (const invalid of [null, {}, { ...form([]), schemaVersion: 2 }, { ...form([]), eventId: '' }, form([question(), question()])]) assert.ok(model.validateDefinition(invalid).length)
})
test('question and option limits are enforced in model and validator', () => {
  const qs = Array.from({ length: 20 }, (_, i) => question({ id: `q${i}` }))
  assert.equal(model.updateQuestions(qs, { type: 'add', id: 'more' }), qs)
  assert.ok(model.validateDefinition(form([...qs, question({ id: 'extra' })])).length)
  const options = Array.from({ length: 20 }, (_, i) => ({ id: `c${i}`, label: `Choice ${i}` }))
  const q = question({ type: 'checkbox', choices: options })
  assert.equal(model.updateQuestions([q], { type: 'addChoice', id: q.id, choiceId: 'extra' })[0].choices.length, 20)
  assert.ok(model.validateDefinition(form([{ ...q, choices: [...options, { id: 'extra', label: 'Extra' }] }])).length)
})
for (const type of Object.keys(model.FIELD_TYPES)) test(`${type} answer validation`, () => {
  const q = question({ type, required: true, choices: model.hasChoices(type) ? choices : [] })
  const definition = form([q])
  assert.equal(model.validateAnswers(definition, {}).length, 1)
  const value = type === 'checkbox' ? ['a', 'b'] : model.hasChoices(type) ? 'a' : 'Normal text <script>literal</script>'
  assert.deepEqual(model.validateAnswers(definition, { q1: value }), [])
  assert.deepEqual(model.validateAnswers(form([{ ...q, required: false }]), {}), [])
  assert.ok(model.validateAnswers(definition, { q1: model.hasChoices(type) ? ['unknown'] : 'x'.repeat(2001) }).length)
})
test('unknown question, invalid types and duplicate answer selections rejected', () => {
  assert.ok(model.validateAnswers(form([question()]), { unknown: 'a' }).length)
  assert.ok(model.validateAnswers(form([question()]), { q1: [] }).length)
  assert.ok(model.validateAnswers(form([question({ type: 'checkbox', choices })]), { q1: ['a', 'a'] }).length)
  assert.ok(model.validateAnswers(form([question()]), null).length)
})
async function builder() {
  let sequence = 0
  return mount('src/features/registrationForms/components/RegistrationFormBuilder.jsx', { modules: { '../model.js': model }, globals: { crypto: { randomUUID: () => `id-${++sequence}` } } })
}
test('actual builder supports local editing, preview validation and labels without persistence', async () => {
  const app = await builder()
  assert.match(text(app.render()), /No custom questions/)
  button(app.render(), 'Add question').props.onClick()
  let tree = app.render()
  const title = nodes(tree).find(n => n.type === 'input' && n.props.id?.endsWith('-title'))
  assert.equal(title.props['aria-invalid'], true)
  title.props.onChange({ target: { value: '<img onerror=alert(1)>' } })
  tree = app.render()
  assert.match(text(tree), /<img onerror=alert\(1\)>/)
  assert.ok(!nodes(tree).some(n => n.props?.dangerouslySetInnerHTML))
  const required = nodes(tree).find(n => n.type === 'input' && n.props.type === 'checkbox')
  required.props.onChange({ target: { checked: true } })
  nodes(app.render()).find(n => n.type === 'form').props.onSubmit({ preventDefault() {} })
  tree = app.render(); assert.match(text(tree), /Please answer this required question/)
  const input = nodes(tree).find(n => n.type === 'input' && n.props.id?.includes('-preview-'))
  assert.equal(input.props['aria-invalid'], true)
  assert.ok(nodes(tree).some(n => n.type === 'label' && n.props.htmlFor === input.props.id))
  input.props.onChange({ target: { value: 'Fictional answer' } })
  nodes(app.render()).find(n => n.type === 'form').props.onSubmit({ preventDefault() {} })
  assert.match(text(app.render()), /Nothing was submitted or saved/)
  button(app.render(), 'Clear preview answers').props.onClick()
  assert.equal(nodes(app.render()).find(n => n.type === 'input' && n.props.id?.includes('-preview-')).props.value, '')
})
test('actual builder keyboard buttons reorder/remove questions and edit choices', async () => {
  const app = await builder()
  button(app.render(), 'Add question').props.onClick(); button(app.render(), 'Add question').props.onClick()
  let tree = app.render()
  assert.equal(nodes(tree).find(n => n.props?.['aria-label'] === 'Move question 1 up').props.disabled, true)
  nodes(tree).find(n => n.props?.['aria-label'] === 'Move question 1 down').props.onClick()
  tree = app.render()
  const type = nodes(tree).find(n => n.type === 'select')
  type.props.onChange({ target: { value: 'radio' } })
  button(app.render(), 'Add choice').props.onClick()
  assert.match(text(app.render()), /Choice 1/)
  button(app.render(), 'Remove choice').props.onClick()
  nodes(app.render()).find(n => n.props?.['aria-label'] === 'Remove question 1').props.onClick()
  assert.equal(nodes(app.render()).filter(n => n.type === 'legend' && /Question/.test(text(n))).length, 1)
})
test('prototype route is default-off, dev opt-in, and inside Organizer guard', async () => {
  for (const [env, expected] of [[{}, false], [{ DEV: true }, false], [{ DEV: true, VITE_ENABLE_FORM_BUILDER_PROTOTYPE: 'true' }, true], [{ DEV: false, PROD: true, VITE_ENABLE_FORM_BUILDER_PROTOTYPE: 'true' }, false]]) {
    const app = await mount('src/App.jsx', { importMeta: { env } })
    const tree = app.render(), guard = nodes(tree).find(n => n.type === 'Route' && n.props.element?.props.role === 'organizer')
    assert.equal(nodes(guard).some(n => n.props?.path === '/organizer/form-builder-preview'), expected)
  }
})
test('production build excludes builder even when feature flag is true', async () => {
  const result = await build({ logLevel: 'silent', define: { 'import.meta.env.VITE_ENABLE_FORM_BUILDER_PROTOTYPE': '"true"' }, build: { write: false } })
  assert.ok(result.output.filter(item => item.type === 'chunk').every(chunk => Object.keys(chunk.modules).every(id => !id.includes('/registrationForms/'))))
})
