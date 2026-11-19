// Explicit local-only manual verification. Never included in automated tests.
// Application tables are read-only. --sign-in explicitly permits Auth session creation.
import { verifyAccount, safeFailure } from './verification-accounts.js'
import { loadConfig } from '../src/config/env.js'
import { userClientFactory } from '../src/config/supabase.js'

const origin = 'http://127.0.0.1:3001'
const results = []
function record(check, result, detail) {
  results.push({ check, result, detail })
  // All arguments come from fixed labels/statuses, never remote messages/data.
  console.log(JSON.stringify({ check, result, detail }))
}
async function request(path, token) {
  const response = await fetch(origin + path, {
    method: 'GET', redirect: 'error', cache: 'no-store',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal: AbortSignal.timeout(15000),
  })
  const body = await response.json()
  return { status: response.status, body }
}
async function checkResponse(label, path, token, expected, validate) {
  try {
    const response = await request(path, token)
    const passed = response.status === expected && validate(response.body)
    record(label, passed ? 'PASS' : 'FAIL', `HTTP ${response.status}; expected ${expected}; response contract ${passed ? 'matched' : 'not confirmed'}`)
  } catch (error) { record(label, 'FAIL', `${safeFailure(error)}: API request or response parsing failed.`) }
}
const denied = body => !Object.hasOwn(body, 'data') && Object.keys(body).length === 1 &&
  body.error?.code === 'NOT_FOUND' && body.error?.message === 'Event not found or unavailable.' &&
  Object.keys(body.error).sort().join(',') === 'code,message'

async function run() {
  await checkResponse('health', '/api/health', null, 200, body => body.data?.status === 'ok')
  await checkResponse('missing token', '/api/events/verification-probe', null, 401,
    body => body.error?.code === 'UNAUTHORIZED' && !Object.hasOwn(body, 'data'))
  await checkResponse('rejected invalid token', '/api/events/verification-probe', 'invalid-verification-token', 401,
    body => body.error?.code === 'UNAUTHORIZED' && !Object.hasOwn(body, 'data'))

  const config = loadConfig()
  const makeClient = userClientFactory(config)
  const signIn = process.argv.includes('--sign-in')
  const identities = new Set()
  const account = (label, prefix, role) => verifyAccount({
    label, prefix, role, env: process.env, signIn, config, makeClient, record, identities,
  })
  const student = await account('student fixture', 'VERIFY_STUDENT', 'student')
  const organizer = await account('organizer fixture', 'VERIFY_ORGANIZER', 'organizer')
  const other = await account('other organizer fixture', 'VERIFY_OTHER_ORGANIZER', 'organizer')

  async function fixture(label, variable, witness, valid) {
    const id = process.env[variable]
    if (!id || !witness) { record(label, 'UNVERIFIED', `Requires ${variable} and its verified witness account.`); return null }
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) { record(label, 'UNVERIFIED', `Invalid ${variable} format.`); return null }
    try {
      const { data, error } = await witness.db.from('events').select('id,organizer_id,status').eq('id', id).maybeSingle()
      if (error) { record(label, 'UNVERIFIED', `${safeFailure(error)}: event fixture read failed.`); return null }
      if (!data || !valid(data)) { record(label, 'UNVERIFIED', 'Existing event and required visibility/ownership could not be established.'); return null }
      return data
    } catch (error) { record(label, 'UNVERIFIED', `${safeFailure(error)}: event fixture read failed.`); return null }
  }
  async function allowed(label, actor, row) {
    if (!actor || !row) { record(label, 'UNVERIFIED', 'Verified account/event fixture unavailable.'); return }
    await checkResponse(label, `/api/events/${encodeURIComponent(row.id)}`, actor.token, 200,
      body => body.data?.id === row.id && body.data?.organizer_id === row.organizer_id && body.data?.status === row.status)
  }
  async function forbidden(label, actor, row) {
    if (!actor || !row) { record(label, 'UNVERIFIED', 'Verified account/event fixture unavailable.'); return }
    await checkResponse(label, `/api/events/${encodeURIComponent(row.id)}`, actor.token, 404, denied)
    // No app visibility filter here: observe the deployed user's SELECT visibility.
    // A visible row does not automatically imply a policy defect: SQL intent is unavailable.
    try {
      const { data, error } = await actor.db.from('events').select('id').eq('id', row.id).maybeSingle()
      record(`${label}: direct RLS observation`, error || data ? 'UNVERIFIED' : 'PASS',
        error ? 'Direct read failed; policy cause not established.' : data ? 'Row visible directly; API restriction is stricter. Review policy intent.' : 'Known existing row not visible under this account.')
    } catch { record(`${label}: direct RLS observation`, 'UNVERIFIED', 'Direct read failed; details suppressed.') }
  }
  const published = await fixture('published event fixture', 'VERIFY_PUBLISHED_EVENT_ID', student, row => row.status === 'published')
  const owned = await fixture('owned event fixture', 'VERIFY_OWNED_EVENT_ID', organizer, row => row.organizer_id === organizer.id)
  const hidden = await fixture('hidden event fixture', 'VERIFY_HIDDEN_EVENT_ID', organizer,
    row => row.organizer_id === organizer.id && row.status !== 'published')
  const foreign = organizer && other && organizer.id !== other.id
    ? await fixture('foreign event fixture', 'VERIFY_FOREIGN_EVENT_ID', other, row => row.organizer_id === other.id)
    : null
  await allowed('student published event', student, published)
  await allowed('organizer owned event', organizer, owned)
  await forbidden('organizer foreign event', organizer, foreign)
  await forbidden('student hidden event', student, hidden)
  // The invalid-token check covers rejection; no expired session is manufactured.
}

try { await run() } catch { record('configuration/workflow', 'UNVERIFIED', 'Check local configuration; values and exception details suppressed.') }
const failed = results.filter(row => row.result === 'FAIL').length
const unverified = results.filter(row => row.result === 'UNVERIFIED').length
console.log(JSON.stringify({ summary: { failed, unverified, complete: failed === 0 && unverified === 0 } }))
process.exitCode = failed ? 1 : unverified ? 2 : 0
