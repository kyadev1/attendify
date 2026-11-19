export class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code }
}

export function databaseError(error) {
  if (error.code === '42501') return new ApiError(403, 'FORBIDDEN', 'Access denied.')
  if (error.code === 'PGRST301' || error.code === 'PGRST303') return new ApiError(401, 'UNAUTHORIZED', 'Please sign in again.')
  return new ApiError(503, 'UNAVAILABLE', 'The service is temporarily unavailable. Please try again.')
}

