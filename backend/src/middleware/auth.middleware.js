import { ApiError, databaseError } from '../utils/errors.js'

export function authenticate(createUserClient) {
  return async (req, res, next) => {
    const match = /^Bearer ([^\s,]+)$/i.exec(req.get('authorization') || '')
    if (!match || match[1].length > 8192) throw new ApiError(401, 'UNAUTHORIZED', 'A valid access token is required.')
    const db = createUserClient(match[1])
    const { data, error } = await db.auth.getUser(match[1])
    if (error && (error.status >= 500 || error.status === 429 || !error.status)) throw new ApiError(503, 'UNAVAILABLE', 'Authentication is temporarily unavailable.')
    if (error || !data?.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Please sign in again.')
    const profile = await db.from('profiles').select('id,role').eq('id', data.user.id).maybeSingle()
    if (profile.error) throw databaseError(profile.error)
    if (profile.data?.id !== data.user.id || !['student', 'organizer'].includes(profile.data?.role)) {
      throw new ApiError(403, 'FORBIDDEN', 'Account access is unavailable.')
    }
    req.account = { id: data.user.id, role: profile.data.role }
    req.db = db
    next()
  }
}
