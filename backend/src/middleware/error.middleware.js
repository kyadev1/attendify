import { ApiError } from '../utils/errors.js'

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error)
  if (error instanceof URIError) error = new ApiError(400, 'INVALID_REQUEST', 'Invalid request path.')
  const known = error instanceof ApiError
  res.status(known ? error.status : 503).json({ error: {
    code: known ? error.code : 'UNAVAILABLE',
    message: known ? error.message : 'The service is temporarily unavailable. Please try again.',
  } })
}
