import { useEffect, useSyncExternalStore } from 'react'
import { eventClock } from '../utils/eventClock'

export default function useEventClock(events) {
  const now = useSyncExternalStore(eventClock.subscribe, eventClock.getSnapshot, eventClock.getSnapshot)
  const boundaries = events.flatMap(event => [Date.parse(event.startsAt), Date.parse(event.endsAt)])
    .filter(Number.isFinite).sort((a, b) => a - b).join(',')
  useEffect(() => eventClock.watch(boundaries ? boundaries.split(',').map(Number) : []), [boundaries])
  return now
}
