import { Router } from 'express'
import { getEvent } from './event.controller.js'

export function eventsRouter() {
  const router = Router()
  router.get('/:id', getEvent)
  return router
}
