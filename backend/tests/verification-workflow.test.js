import test from 'node:test'
import assert from 'node:assert/strict'
import { tokenProblem, safeFailure, freshToken, verifyAccount } from '../scripts/verification-accounts.js'

const token = `header.${Buffer.from(JSON.stringify({ exp: 9999999999 })).toString('base64url')}.signature`
function setup(overrides = {}) {
  const logs = []
  const options = {
    label: 'fixture', prefix: 'VERIFY_STUDENT', role: 'student', env: { VERIFY_STUDENT_TOKEN: token },
    signIn: false, config: {}, identities: new Set(), record: (...args) => logs.push(args),
    makeClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'student-id' } } }) },
      from: table => {
        assert.equal(table, 'profiles')
        return { select() { return this }, eq(key, id) { assert.equal(key, 'id'); assert.equal(id, 'student-id'); return this },
          maybeSingle: async () => ({ data: { id: 'student-id', role: 'student' } }) }
      } }), ...overrides,
  }
  return { options, logs }
}
test('JWT precheck distinguishes malformed, expired and plausible tokens', () => {
  assert.equal(tokenProblem('Bearer incorrect'), 'MALFORMED_TOKEN')
  assert.equal(tokenProblem('a.bad.c'), 'MALFORMED_TOKEN')
  assert.equal(tokenProblem(`h.${Buffer.from('{"exp":1}').toString('base64url')}.s`), 'EXPIRED_TOKEN')
  assert.equal(tokenProblem(token), null)
})
test('fresh-session acquisition sends credentials only to configured Auth and returns only access token', async () => {
  const actual = await freshToken({ url: 'https://example.supabase.co', key: 'public' }, 'private-email', 'private-password', async (url, options) => {
    assert.equal(url, 'https://example.supabase.co/auth/v1/token?grant_type=password')
    assert.equal(options.redirect, 'error')
    assert.deepEqual(JSON.parse(options.body), { email: 'private-email', password: 'private-password' })
    return { ok: true, json: async () => ({ access_token: token, refresh_token: 'never-return' }) }
  })
  assert.equal(actual, token)
})
test('fresh-session failures discard upstream message and session fields', async () => {
  await assert.rejects(freshToken({ url: 'https://example.supabase.co' }, 'email', 'password', async () => ({
    ok: false, status: 400, json: async () => ({ error_code: 'invalid_credentials', message: 'SECRET', access_token: 'SECRET' }),
  })), error => safeFailure(error) === 'INVALID_CREDENTIALS' && !JSON.stringify(error).includes('SECRET'))
})
test('without opt-in credentials are never used to sign in', async () => {
  const { options, logs } = setup({ env: { VERIFY_STUDENT_EMAIL: 'email', VERIFY_STUDENT_PASSWORD: 'password' }, acquire: () => assert.fail('unexpected login') })
  assert.equal(await verifyAccount(options), null)
  assert.match(logs[0][2], /MISSING_TOKEN/)
})
test('sign-in mode ignores old tokens and validates new identity and profile', async () => {
  const { options, logs } = setup({ signIn: true, env: { VERIFY_STUDENT_TOKEN: 'old', VERIFY_STUDENT_EMAIL: 'email', VERIFY_STUDENT_PASSWORD: 'password' },
    acquire: async (config, email, password) => { assert.equal(email, 'email'); assert.equal(password, 'password'); return token } })
  assert.equal((await verifyAccount(options)).id, 'student-id')
  assert.equal(logs[0][1], 'PASS')
  assert.ok(!JSON.stringify(logs).includes(token))
})
test('missing credentials cannot fall back to stale token', async () => {
  const { options, logs } = setup({ signIn: true })
  assert.equal(await verifyAccount(options), null); assert.match(logs[0][2], /MISSING_CREDENTIALS/)
})
test('role mismatch prevents account from becoming an event witness', async () => {
  const { options, logs } = setup({ role: 'organizer' })
  assert.equal(await verifyAccount(options), null); assert.match(logs[0][2], /ROLE_MISMATCH/)
})
test('duplicate identities are rejected across fixture accounts', async () => {
  const { options, logs } = setup()
  assert.ok(await verifyAccount(options))
  assert.equal(await verifyAccount(options), null); assert.match(logs[1][2], /DUPLICATE_IDENTITY/)
})
test('a plausible JWT alone never proves authorization', async () => {
  const { options, logs } = setup({ makeClient: () => ({ auth: { getUser: async () => ({ error: { status: 401, message: 'SECRET' } }) } }) })
  assert.equal(await verifyAccount(options), null); assert.match(logs[0][2], /AUTH_REJECTED/); assert.ok(!JSON.stringify(logs).includes('SECRET'))
})
test('expired token never reaches Auth or a database query', async () => {
  const { options, logs } = setup({ env: { VERIFY_STUDENT_TOKEN: `h.${Buffer.from('{"exp":1}').toString('base64url')}.s` }, makeClient: () => assert.fail('must not query') })
  assert.equal(await verifyAccount(options), null); assert.match(logs[0][2], /EXPIRED_TOKEN/)
})
test('unreadable profile is distinct from role mismatch', async () => {
  const { options, logs } = setup()
  const make = options.makeClient
  options.makeClient = () => { const db = make(); const from = db.from; db.from = table => { const query = from(table); query.maybeSingle = async () => ({ error: { status: 503, message: 'SECRET' } }); return query }; return db }
  assert.equal(await verifyAccount(options), null); assert.match(logs[0][2], /PROFILE_READ_FAILED: UPSTREAM_UNAVAILABLE/)
  assert.ok(!JSON.stringify(logs).includes('SECRET'))
})
for (const [error, expected] of [[new TypeError('SECRET'), 'TRANSPORT_FAILURE'], [{ name: 'TimeoutError' }, 'TIMEOUT'], [{ status: 429 }, 'RATE_LIMITED'], [{ status: 503 }, 'UPSTREAM_UNAVAILABLE']]) {
  test(`safe fixture diagnostic: ${expected}`, async () => {
    const { options, logs } = setup({ makeClient: () => { throw error } })
    assert.equal(await verifyAccount(options), null); assert.match(logs[0][2], new RegExp(expected)); assert.ok(!JSON.stringify(logs).includes('SECRET'))
  })
}
