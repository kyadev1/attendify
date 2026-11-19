// One shared timer regardless of how many pages/dialogs consume the clock.
// Dependencies are injectable for isolated tests; this store makes no requests.
export function createEventClock({ now = () => Date.now(), schedule = setTimeout, cancel = clearTimeout, windowTarget = globalThis.window, documentTarget = globalThis.document } = {}) {
  let snapshot = now()
  let timer
  const listeners = new Set()
  const watches = new Set()

  function arm() {
    if (timer !== undefined) cancel(timer)
    timer = undefined
    if (!listeners.size) return
    const current = now()
    let delay = 60_000
    for (const boundaries of watches) for (const boundary of boundaries) {
      if (boundary > current) delay = Math.min(delay, boundary - current)
    }
    timer = schedule(sample, Math.max(1, delay))
  }
  function sample() {
    const current = now()
    if (current !== snapshot) {
      snapshot = current
      for (const listener of listeners) listener()
    }
    arm()
  }
  function subscribe(listener) {
    listeners.add(listener)
    if (listeners.size === 1) {
      windowTarget?.addEventListener('focus', sample)
      documentTarget?.addEventListener('visibilitychange', sample)
    }
    sample()
    return () => {
      listeners.delete(listener)
      if (!listeners.size) {
        windowTarget?.removeEventListener('focus', sample)
        documentTarget?.removeEventListener('visibilitychange', sample)
      }
      arm()
    }
  }
  function watch(boundaries) {
    const entry = boundaries.filter(Number.isFinite)
    watches.add(entry)
    sample()
    return () => { watches.delete(entry); arm() }
  }
  return { subscribe, getSnapshot: () => snapshot, watch }
}

export const eventClock = createEventClock()
