import test from 'node:test'
import assert from 'node:assert/strict'
import { mount, deferred, nodes } from './helpers/renderModule.mjs'

const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }
async function setup(role = 'student', profileResult) {
  const initial = deferred(), profile = deferred(), background = deferred()
  const timers = []
  let listener, reads = 0, signs = 0
  const user = { id: 'a', email: 'a@example.test' }
  const supabase = {
    auth: {
      onAuthStateChange(fn) { listener = fn; return { data: { subscription: { unsubscribe() {} } } } },
      getSession: () => initial.promise,
      async signInWithPassword() { signs++; listener('SIGNED_IN', { user }); return { data: { user } } },
      async signOut() { listener('SIGNED_OUT', null); return { error: null } },
    },
    from: () => ({ select() { return this }, eq() { return this }, single() { return ++reads === 1 ? profile.promise : background.promise } }),
  }
  const app = await mount('src/context/AuthContext.jsx', { effects: true, globals: { setTimeout: fn => timers.push(fn) }, modules: { '../services/supabase': { supabase } } })
  const value = () => app.render().props.value
  value(); app.flushEffects()
  const result = profileResult || { data: { id: 'a', full_name: 'A', role } }
  return { app, value, initial, profile, background, timers, result, supabase, signs: () => signs, emit: () => listener('TOKEN_REFRESHED', { user }) }
}

for (const role of ['student', 'organizer']) test(`${role}: first login settles readiness without waiting for auth listener restore`, async () => {
  const f = await setup(role)
  const operation = f.value().login({ email: 'a@example.test', password: 'password', role })
  await flush()
  assert.equal(f.value().loading, true)
  f.profile.resolve(f.result)
  await operation
  assert.equal(f.value().user.role, role)
  assert.equal(f.value().loading, false)
  f.initial.resolve({ data: { session: null } }); await flush()
  assert.equal(f.value().user.role, role)
})

test('late listener profile failure cannot undo successful explicit login', async t => {
  t.mock.method(console, 'error', () => {})
  const f = await setup()
  const operation = f.value().login({ email: 'a@example.test', password: 'password', role: 'student' })
  await flush(); f.emit(); f.timers.splice(0).forEach(fn => fn()); await flush()
  f.profile.resolve(f.result); await operation
  f.background.resolve({ error: new Error('temporary lookup failure') }); await flush()
  assert.equal(f.value().user?.id, 'a')
  assert.equal(f.value().loading, false)
})

for (const role of ['student', 'organizer']) test(`${role}: browser refresh waits for restored profile`, async () => {
  const f = await setup(role)
  f.initial.resolve({ data: { session: { user: { id: 'a', email: 'a@example.test' } } } })
  await flush(); assert.equal(f.value().loading, true)
  f.profile.resolve(f.result); await flush()
  assert.equal(f.value().user.role, role); assert.equal(f.value().loading, false)
})

for (const failure of [new Error('Invalid credentials'), new Error('Auth request failed')]) test(failure.message, async () => {
  const f = await setup()
  f.initial.resolve({ data: { session: null } }); await flush()
  f.supabase.auth.signInWithPassword = async () => ({ error: failure })
  await assert.rejects(f.value().login({ email: 'a@example.test', password: 'password', role: 'student' }), failure)
  assert.equal(f.value().user, null); assert.equal(f.value().loading, false)
})

test('delayed authentication does not publish a user early', async () => {
  const f = await setup(); const auth = deferred()
  const original = f.supabase.auth.signInWithPassword
  f.supabase.auth.signInWithPassword = async () => { await auth.promise; return original() }
  const operation = f.value().login({ email: 'a@example.test', password: 'password', role: 'student' })
  await flush(); assert.equal(f.value().user, null)
  auth.resolve(); await flush(); assert.equal(f.value().user, null)
  f.profile.resolve(f.result); await operation
  assert.equal(f.value().user.id, 'a'); assert.equal(f.value().loading, false)
})

for (const [name, result, message] of [
  ['missing profile', { data: null }, /profile not found/],
  ['unexpected role', { data: { role: 'organizer' } }, /student access/],
  ['profile network failure', { error: new Error('Network failed') }, /Network failed/],
]) test(`${name}: login fails and settles loading`, async () => {
  const f = await setup('student', result)
  const operation = f.value().login({ email: 'a@example.test', password: 'password', role: 'student' })
  await flush(); f.profile.resolve(result)
  await assert.rejects(operation, message)
  assert.equal(f.value().user, null)
  assert.equal(f.value().loading, false)
})

test('form blocks duplicate submits before React rerenders and waits for login completion', async () => {
  const pending = deferred(); let calls = 0
  const form = await mount('src/authentication/components/AuthForm.jsx', { globals: { FormData: class { *[Symbol.iterator]() { yield ['email', 'a@example.test']; yield ['password', 'password'] } }, requestAnimationFrame: fn => fn() } })
  Object.assign(form.auth, { user: null, loading: false, login: () => { calls++; return pending.promise } })
  const submit = nodes(form.render()).find(node => node.type === 'form').props.onSubmit
  const first = submit({ preventDefault() {}, currentTarget: {} })
  const second = submit({ preventDefault() {}, currentTarget: {} })
  assert.equal(calls, 1)
  form.auth.user = { id: 'a', role: 'student' }
  assert.notEqual(form.render().type, 'Navigate')
  pending.resolve(); await Promise.all([first, second])
  assert.equal(form.render().props.to, '/dashboard')
})
