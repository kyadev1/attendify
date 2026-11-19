// Local verification only. Never import into production request handlers.
export function tokenProblem(token, now = Date.now()) {
  try {
    if (typeof token !== 'string' || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) return 'MALFORMED_TOKEN'
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url'))
    if (!Number.isFinite(payload.exp)) return 'MALFORMED_TOKEN'
    return payload.exp * 1000 <= now ? 'EXPIRED_TOKEN' : null
  } catch { return 'MALFORMED_TOKEN' }
}

export function safeFailure(error) {
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return 'TIMEOUT'
  if (error instanceof TypeError || error?.name === 'AuthRetryableFetchError' || error?.status === 0) return 'TRANSPORT_FAILURE'
  if (error?.status === 429) return 'RATE_LIMITED'
  if (error?.status >= 500) return 'UPSTREAM_UNAVAILABLE'
  if (error?.code === 'invalid_credentials') return 'INVALID_CREDENTIALS'
  if (error?.code === 'email_not_confirmed') return 'EMAIL_NOT_CONFIRMED'
  if (error?.status === 401 || error?.status === 403) return 'AUTH_REJECTED'
  return 'REQUEST_FAILED'
}

export async function freshToken(config, email, password, fetchImpl = fetch) {
  // No SDK sign-in client: prevents SDK diagnostic logging of raw fetch errors.
  // Explicit opt-in caller only; refresh token is discarded, never persisted.
  const response = await fetchImpl(`${config.url}/auth/v1/token?grant_type=password`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
    headers: { apikey: config.key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const body = await response.json()
  if (!response.ok) throw { status: response.status, code: body.error_code || body.code }
  if (!body.access_token) throw { code: 'missing_session' }
  return body.access_token
}

export async function verifyAccount({ label, prefix, role, env, signIn, config, makeClient, record, identities, acquire = freshToken }) {
  let token = env[`${prefix}_TOKEN`]
  try {
    if (signIn) {
      const email = env[`${prefix}_EMAIL`]
      const password = env[`${prefix}_PASSWORD`]
      if (!email || !password) { record(label, 'UNVERIFIED', 'MISSING_CREDENTIALS: configure this designated account locally.'); return null }
      token = await acquire(config, email, password)
    }
    if (!token) { record(label, 'UNVERIFIED', 'MISSING_TOKEN: supply a session or opt in to fresh sign-in.'); return null }
    const problem = tokenProblem(token)
    if (problem) { record(label, 'UNVERIFIED', `${problem}: local format/expiry precheck only; not signature verification.`); return null }
    const db = makeClient(token)
    const auth = await db.auth.getUser(token)
    if (auth.error) throw auth.error
    const id = auth.data?.user?.id
    if (!id) { record(label, 'UNVERIFIED', 'AUTH_REJECTED: verified identity unavailable.'); return null }
    const profile = await db.from('profiles').select('id,role').eq('id', id).maybeSingle()
    if (profile.error) { record(label, 'UNVERIFIED', `PROFILE_READ_FAILED: ${safeFailure(profile.error)}.`); return null }
    if (!profile.data || profile.data.id !== id) { record(label, 'UNVERIFIED', 'PROFILE_UNAVAILABLE: matching profile not readable.'); return null }
    if (profile.data.role !== role) { record(label, 'UNVERIFIED', 'ROLE_MISMATCH: expected database-profile role not present.'); return null }
    if (identities.has(id)) { record(label, 'UNVERIFIED', 'DUPLICATE_IDENTITY: each fixture must be a distinct account.'); return null }
    identities.add(id)
    record(label, 'PASS', 'Real Auth identity and expected database-profile role verified; values suppressed.')
    return { db, token, id }
  } catch (error) { record(label, 'UNVERIFIED', `${safeFailure(error)}: fixture verification could not complete.`); return null }
}
