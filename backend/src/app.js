import express from 'express'
import { authenticate } from './middleware/auth.middleware.js'
import { errorHandler } from './middleware/error.middleware.js'
import { eventsRouter } from './modules/events/event.routes.js'
import { healthRouter } from './modules/health/health.routes.js'
import { ApiError } from './utils/errors.js'
import { userClientFactory } from './config/supabase.js'

export function createApp(config, { createUserClient = userClientFactory(config) } = {}) {
  const app = express()
  app.disable('x-powered-by')
  app.disable('etag')
  app.use((req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' })
    res.vary('Origin')
    const origin = req.get('origin')
    if (origin && !config.origins.includes(origin)) throw new ApiError(403, 'ORIGIN_DENIED', 'Origin not allowed.')
    if (origin) res.set('Access-Control-Allow-Origin', origin)
    if (req.method === 'OPTIONS') {
      const headers = (req.get('access-control-request-headers') || '').toLowerCase().split(',').map(x => x.trim()).filter(Boolean)
      if (req.get('access-control-request-method') !== 'GET' || headers.some(x => !['authorization', 'content-type'].includes(x))) {
        throw new ApiError(403, 'ORIGIN_DENIED', 'Preflight request not allowed.')
      }
      res.set({ 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Allow-Headers': 'Authorization, Content-Type' })
      return res.sendStatus(204)
    }
    if (!['GET', 'HEAD'].includes(req.method)) throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Only read requests are supported.')
    next()
  })
  app.use('/api/health', healthRouter())
  app.use('/api/events', authenticate(createUserClient), eventsRouter())
  app.use(() => { throw new ApiError(404, 'NOT_FOUND', 'Endpoint not found.') })
  app.use(errorHandler)
  return app
}
