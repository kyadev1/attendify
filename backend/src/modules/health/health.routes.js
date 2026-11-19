import { Router } from 'express'

export function healthRouter() {
  const router = Router()
  router.get('/', (req, res) => res.json({ data: { status: 'ok' } }))
  return router
}
