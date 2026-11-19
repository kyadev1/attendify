import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { startServer } from '../src/server.js'
import { loadConfig } from '../src/config/env.js'
import { userClientFactory } from '../src/config/supabase.js'
import { createApiClient } from '../../src/services/apiClient.js'

const config = { port: 0, host: '127.0.0.1', origins: ['http://localhost:5173'] }
const event = { id: 'event-1', organizer_id: 'owner', status: 'published', title: 'Campus' }

async function fixture(t, options = {}) {
  const calls = []
  const createUserClient = token => ({
    auth: { getUser: async received => {
      assert.equal(token, received)
      return options.invalid ? { error: { status: 401 } } : { data: { user: { id: token } } }
    } },
    from(table) {
      const filters = []
      calls.push({ token, table, filters })
      return { select() { return this }, eq(key, value) { filters.push([key, value]); return this },
        async maybeSingle() {
          if (options.failure) throw new Error('PRIVATE database credentials')
          if (table === 'profiles') return { data: { id: token, role: options.role || 'student' } }
          return { data: options.missing ? null : { ...event, ...options.event }, error: options.dbError }
        } }
    },
  })
  const server = startServer(config, { createUserClient })
  await once(server, 'listening')
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections() }))
  return { calls, get: (path = '/api/events/event-1', headers = { Authorization: 'Bearer owner' }, method = 'GET') => fetch(`http://127.0.0.1:${server.address().port}${path}`, { headers, method }) }
}

test('startup and health do not query Supabase', async t => {
  const f = await fixture(t); const r = await f.get('/api/health', {})
  assert.equal(r.status, 200); assert.deepEqual(await r.json(), { data: { status: 'ok' } }); assert.equal(f.calls.length, 0)
})
test('student published read filters by verified profile and status', async t => {
  const f = await fixture(t); const r = await f.get()
  assert.equal(r.status, 200); assert.equal((await r.json()).data.title, 'Campus')
  assert.deepEqual(f.calls[0].filters, [['id', 'owner']]); assert.ok(f.calls[1].filters.some(x => x[0] === 'status' && x[1] === 'published'))
  assert.equal(r.headers.get('cache-control'), 'no-store')
})
test('organizer owned draft read and ownership filter', async t => {
  const f = await fixture(t, { role: 'organizer', event: { status: 'draft' } })
  assert.equal((await f.get()).status, 200); assert.ok(f.calls[1].filters.some(x => x[0] === 'organizer_id' && x[1] === 'owner'))
})
for (const [name, options, status] of [
  ['student cannot view draft', { event: { status: 'draft' } }, 404],
  ['organizer cannot view another owner', { role: 'organizer', event: { organizer_id: 'other' } }, 404],
  ['missing or RLS-hidden record', { missing: true }, 404],
  ['unrecognized role', { role: 'admin' }, 403],
  ['invalid token', { invalid: true }, 401],
  ['database permission denial', { dbError: { code: '42501' } }, 403],
  ['database outage', { dbError: { code: 'INTERNAL', message: 'secret' } }, 503],
  ['rejected request is sanitized', { failure: true }, 503],
]) test(name, async t => { const f = await fixture(t, options); const r = await f.get(); assert.equal(r.status, status); assert.doesNotMatch(await r.text(), /secret|PRIVATE/) })
test('missing/malformed tokens never query the database', async t => {
  const f = await fixture(t)
  for (const headers of [{}, { Authorization: 'Basic token' }, { Authorization: 'Bearer one,two' }]) assert.equal((await f.get(undefined, headers)).status, 401)
  assert.equal(f.calls.length, 0)
})
test('validation rejects filter injection and client role overrides', async t => {
  const f = await fixture(t)
  assert.equal((await f.get('/api/events/event-1?role=organizer')).status, 400)
  assert.equal((await f.get('/api/events/%20')).status, 400)
  assert.equal((await f.get('/api/events/event-1', {}, 'POST')).status, 405)
})
test('CORS allowlist, preflight and denied origins', async t => {
  const f = await fixture(t)
  const good = await f.get('/api/health', { Origin: config.origins[0] })
  assert.equal(good.headers.get('access-control-allow-origin'), config.origins[0])
  assert.equal((await f.get('/api/health', { Origin: 'https://evil.example' })).status, 403)
  assert.equal((await f.get('/api/events/event-1', { Origin: config.origins[0], 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' }, 'OPTIONS')).status, 204)
  assert.equal((await f.get('/api/events/event-1', { Origin: config.origins[0], 'Access-Control-Request-Method': 'POST' }, 'OPTIONS')).status, 403)
})
test('requests have independent identity', async t => {
  const f = await fixture(t)
  await Promise.all(['a', 'b'].map(id => f.get(undefined, { Authorization: `Bearer ${id}` })))
  assert.deepEqual(f.calls.filter(x => x.table === 'profiles').map(x => x.token).sort(), ['a', 'b'])
})
test('configuration refuses secret keys and wildcard origins', () => {
  const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', CORS_ORIGINS: config.origins[0] }
  assert.equal(loadConfig(env).port, 3001)
  for (const key of ['sb_secret_private', `x.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.x`]) assert.throws(() => loadConfig({ ...env, SUPABASE_PUBLISHABLE_KEY: key }))
  assert.throws(() => loadConfig({ ...env, CORS_ORIGINS: '*' }))
})
test('Supabase factory uses only public key, bearer token, and no persisted session', () => {
  const calls = []; const make = userClientFactory({ url: 'https://example.supabase.co', key: 'sb_publishable_test' }, (...args) => { calls.push(args); return {} })
  assert.notEqual(make('a'), make('b'))
  assert.equal(calls[0][1], 'sb_publishable_test'); assert.equal(calls[0][2].global.headers.Authorization, 'Bearer a')
  assert.equal(calls[0][2].auth.persistSession, false); assert.equal(calls[0][2].auth.autoRefreshToken, false)
})
function browserAuth() {
  let callback; let removed = false
  return { auth: { onAuthStateChange(fn) { callback = fn; return { data: { subscription: { unsubscribe() { removed = true } } } } }, async getSession() { return { data: { session: { access_token: 'token', user: { id: 'a' } } } } } }, change: (event, user) => callback(event, { user: { id: user } }), removed: () => removed }
}
test('frontend client attaches current token without cookies', async () => {
  const auth = browserAuth(); const api = createApiClient({ supabase: auth, baseUrl: 'http://localhost:3001', fetchImpl: async (url, options) => {
    assert.equal(url, 'http://localhost:3001/api/events/event-1'); assert.equal(options.headers.Authorization, 'Bearer token'); assert.equal(options.credentials, 'omit')
    return { ok: true, json: async () => ({ data: event }) }
  } })
  assert.deepEqual(await api.get('/api/events/event-1'), event); assert.ok(auth.removed())
})
for (const eventName of ['SIGNED_OUT', 'SIGNED_IN']) test(`frontend discards pending response on ${eventName}`, async () => {
  const auth = browserAuth(); const api = createApiClient({ supabase: auth, baseUrl: 'http://localhost:3001', fetchImpl: async () => {
    auth.change(eventName, 'b'); return { ok: true, json: async () => ({ data: event }) }
  } })
  await assert.rejects(api.get('/api/events/event-1'), { code: 'SESSION_CHANGED' }); assert.ok(auth.removed())
})
test('frontend sanitizes API/network errors and refuses absolute request URLs', async () => {
  const auth = browserAuth(); const api = createApiClient({ supabase: auth, baseUrl: 'http://localhost:3001', fetchImpl: async () => { throw new Error('PRIVATE') } })
  await assert.rejects(api.get('/api/events/event-1'), { code: 'NETWORK_ERROR' })
  await assert.rejects(api.get('https://evil.example/api/events'), { code: 'INVALID_REQUEST' })
})
test('frontend refuses a stale session returned during account switching', async () => {
  const auth = browserAuth()
  auth.auth.getSession = async () => { auth.change('SIGNED_IN', 'b'); return { data: { session: { user: { id: 'a' }, access_token: 'old' } } } }
  const api = createApiClient({ supabase: auth, baseUrl: 'http://localhost:3001', fetchImpl: () => assert.fail('must not send stale token') })
  await assert.rejects(api.get('/api/events/event-1'), { code: 'SESSION_CHANGED' })
})
test('frontend preserves same-account token refresh during a read', async () => {
  const auth = browserAuth()
  const api = createApiClient({ supabase: auth, baseUrl: 'http://localhost:3001', fetchImpl: async () => {
    auth.change('TOKEN_REFRESHED', 'a'); return { ok: true, json: async () => ({ data: event }) }
  } })
  assert.deepEqual(await api.get('/api/events/event-1'), event)
})
test('frontend rejects missing sessions and safe API errors', async () => {
  const auth = browserAuth()
  const api = createApiClient({ supabase: auth, baseUrl: 'http://localhost:3001', fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({ error: { code: 'FORBIDDEN', message: 'PRIVATE' } }) }) })
  await assert.rejects(api.get('/api/events/event-1'), error => error.code === 'FORBIDDEN' && !error.message.includes('PRIVATE'))
  auth.auth.getSession = async () => ({ data: { session: null } })
  await assert.rejects(api.get('/api/events/event-1'), { code: 'UNAUTHORIZED' })
})
