import { ApiError } from '../../utils/errors.js'
import { findVisibleEvent } from './event.service.js'

export async function getEvent(req, res) {
  // Bound a single opaque identifier without assuming an unavailable SQL ID type.
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(req.params.id) || Object.keys(req.query).length) {
    throw new ApiError(400, 'INVALID_REQUEST', 'A valid event identifier is required; query parameters are not supported.')
  }
  const data = await findVisibleEvent(req.db, req.account, req.params.id)
  res.json({ data })
}
