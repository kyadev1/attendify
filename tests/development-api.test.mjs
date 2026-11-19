import test from 'node:test'
import assert from 'node:assert/strict'
import { createDevelopmentEventApi } from '../src/services/developmentEventApi.js'
import { createApiClient } from '../src/services/apiClient.js'

const env = { DEV: true, PROD: false, VITE_ENABLE_EXPRESS_EVENT_READ: 'true', VITE_API_BASE_URL: 'http://localhost:3001' }
function setup({ session = { access_token: 'test-token', user: { id: 'student-a' } }, fetchImpl } = {}) {
  let callback, calls = 0, removed = 0
  const supabase = { auth: {
    onAuthStateChange(fn) { callback = fn; return { data: { subscription: { unsubscribe() { removed++ } } } } },
    async getSession() { return { data: { session } } },
  } }
  const reader = createDevelopmentEventApi({ env, supabase, fetchImpl: async (...args) => { calls++; return fetchImpl ? fetchImpl(...args) : { ok: true, status: 200, json: async () => ({ data: { id: 'event-1', status: 'published' } }) } } })
  return { reader, supabase, emit: (event, id) => callback(event, { user: { id } }), calls: () => calls, removed: () => removed }
}
for (const settings of [{}, { DEV: true }, { ...env, VITE_ENABLE_EXPRESS_EVENT_READ: 'false' }, { ...env, DEV: false, PROD: true }, { ...env, PROD: true }]) {
  test(`disabled or production flag: ${JSON.stringify(settings)}`, async () => {
    const reader = createDevelopmentEventApi({ env: settings, supabase: {}, fetchImpl: () => assert.fail('no request') })
    assert.equal(reader.enabled, false)
    await assert.rejects(reader.getEvent('event-1'), { code: 'FEATURE_DISABLED' })
  })
}
test('Student development read uses current token, exact endpoint and one request', async () => {
  const f = setup({ fetchImpl: async (url, options) => {
    assert.equal(url, 'http://localhost:3001/api/events/event-1')
    assert.equal(options.headers.Authorization, 'Bearer test-token'); assert.equal(options.redirect, 'error')
    return { ok: true, json: async () => ({ data: { id: 'event-1' } }) }
  } })
  assert.equal((await f.reader.getEvent('event-1', { isCurrent: () => true })).id, 'event-1')
  assert.equal(f.calls(), 1); assert.equal(f.removed(), 1)
})
for (const status of [401, 403, 404, 500, 503]) test(`HTTP ${status} preserved without retry or fallback`, async () => {
  const f = setup({ fetchImpl: async () => ({ ok: false, status, json: async () => ({ error: { code: 'REJECTED', message: 'PRIVATE' } }) }) })
  await assert.rejects(f.reader.getEvent('event-1', { isCurrent: () => true }), e => e.status === status && !e.message.includes('PRIVATE'))
  assert.equal(f.calls(), 1); assert.equal(f.removed(), 1)
})
for (const session of [null, { user: { id: 'a' } }, { access_token: 'expired', user: { id: 'a' }, expires_at: 1 }]) test('missing or expired session sends no request', async () => {
  const f = setup({ session })
  await assert.rejects(f.reader.getEvent('event-1', { isCurrent: () => true }), { status: 401 })
  assert.equal(f.calls(), 0)
})
test('network failure is sanitized and not retried', async () => {
  const f = setup({ fetchImpl: async () => { throw new TypeError('PRIVATE') } })
  await assert.rejects(f.reader.getEvent('event-1', { isCurrent: () => true }), { code: 'NETWORK_ERROR' })
  assert.equal(f.calls(), 1)
})
test('non-JSON gateway error retains HTTP status', async () => {
  const f = setup({ fetchImpl: async () => ({ status: 503, ok: false, json: async () => { throw new SyntaxError() } }) })
  await assert.rejects(f.reader.getEvent('event-1', { isCurrent: () => true }), { status: 503 })
})
for (const change of ['account', 'role', 'logout']) test(`${change} change rejects stale response`, async () => {
  let current = true
  const f = setup({ fetchImpl: async () => {
    if (change === 'role') current = false
    else f.emit(change === 'logout' ? 'SIGNED_OUT' : 'SIGNED_IN', 'student-b')
    return { ok: true, json: async () => ({ data: { id: 'event-1' } }) }
  } })
  await assert.rejects(f.reader.getEvent('event-1', { isCurrent: () => current }), { code: 'SESSION_CHANGED' })
})
test('obsolete scope, cancellation and missing scope cannot start a read', async () => {
  const f = setup()
  await assert.rejects(f.reader.getEvent('event-1', { isCurrent: () => false }), { code: 'SESSION_CHANGED' })
  await assert.rejects(f.reader.getEvent('event-1'), { code: 'INVALID_REQUEST' })
  const controller = new AbortController(); controller.abort()
  await assert.rejects(f.reader.getEvent('event-1', { signal: controller.signal, isCurrent: () => true }), { name: 'AbortError' })
  assert.equal(f.calls(), 0)
})
test('API URL and event paths cannot redirect credentials to arbitrary destinations', async () => {
  assert.throws(() => createApiClient({ supabase: {}, baseUrl: 'https://user:password@example.test' }))
  const f = setup()
  await assert.rejects(f.reader.getEvent('../health', { isCurrent: () => true }), { code: 'INVALID_REQUEST' })
  assert.equal(f.calls(), 0)
})
