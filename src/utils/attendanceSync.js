// One scheduler per authenticated provider, never per attendance consumer.
export function startAttendanceSync({
  refresh, onError,
  host = window, page = document, network = navigator,
  schedule = setTimeout, cancel = clearTimeout,
  interval = 15000, timeout = 20000,
}) {
  let stopped = false
  let timer
  let controller
  let deadline
  let failures = 0
  let pending = false
  const available = () => page.visibilityState !== 'hidden' && network.onLine !== false
  function later(delay) {
    cancel(timer)
    if (!stopped && available()) timer = schedule(run, delay)
  }
  async function run() {
    if (stopped || controller || !available()) return
    controller = new AbortController()
    const active = controller
    try {
      const result = await Promise.race([
        refresh(active.signal),
        new Promise((_, reject) => {
          deadline = schedule(() => {
            active.abort()
            reject(new Error('Synchronization timed out.'))
          }, timeout)
        }),
      ])
      if (!stopped && result !== false) {
        failures = 0
        if (network.onLine !== false) onError('')
      }
    } catch {
      if (!stopped) {
        failures += 1
        onError('Attendance updates are delayed. Showing last available data; retrying automatically.')
      }
    } finally {
      cancel(deadline)
      active.abort()
      controller = null
      later(pending ? 250 : Math.min(interval * 2 ** failures, 120000))
      pending = false
    }
  }
  function wake() {
    cancel(timer)
    if (!available()) {
      if (network.onLine === false) onError('You are offline. Attendance may be out of date; updates resume when connected.')
      return
    }
    if (controller) pending = true
    else later(250)
  }
  host.addEventListener('focus', wake)
  host.addEventListener('online', wake)
  host.addEventListener('offline', wake)
  page.addEventListener('visibilitychange', wake)
  if (network.onLine === false) wake()
  else later(interval)
  return () => {
    stopped = true
    cancel(timer)
    cancel(deadline)
    controller?.abort()
    host.removeEventListener('focus', wake)
    host.removeEventListener('online', wake)
    host.removeEventListener('offline', wake)
    page.removeEventListener('visibilitychange', wake)
  }
}
