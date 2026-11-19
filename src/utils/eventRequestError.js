// Only these public messages may cross the database/UI boundary. Never render
// Supabase details, SQL diagnostics, or arbitrary exception messages here.
export function eventRequestError(failure, action = 'load') {
  const verb = action === 'save' ? 'save' : action === 'delete' ? 'delete' : 'load'
  const code = String(failure?.code || '')
  const status = failure?.status
  const message = failure?.message || ''
  if (['42501', 'PGRST301', 'PGRST302', 'PGRST303'].includes(code) ||
      status === 401 || status === 403 || /permission denied|not authorized|unauthorized|jwt expired/i.test(message)) {
    return { kind: 'authorization', retryable: false, message: 'Your account does not have permission to access this event data. Please sign in with an authorized account.' }
  }
  if (failure?.name === 'AbortError' || failure?.name === 'TypeError' ||
      /network|failed to fetch|fetch failed|timeout|timed out|offline/i.test(message)) {
    return { kind: 'network', retryable: true, message: verb === 'load'
      ? 'Unable to load events. Check your connection and try again.'
      : `Unable to ${verb} the event. Check your connection and try again.${verb === 'save' ? ' Your entries have been kept.' : ''}` }
  }
  return { kind: 'database', retryable: true, message: verb === 'load'
    ? 'Unable to load events right now. Please try again.'
    : `Unable to ${verb} the event right now. Please try again.${verb === 'save' ? ' Your entries have been kept.' : ''}` }
}

// Preserve existing client validation feedback without displaying arbitrary
// server messages that happen to mention a date, capacity, or form field.
export function eventFormError(failure) {
  const message = failure?.message || ''
  if (/^(Complete all required fields\.|Capacity must be a whole number of at least 1\.|Capacity cannot be less than existing registrations \(\d+\)\.|Enter a valid (start|end) (date|time)\.|End date and time must be after the start\.)$/.test(message)) return message
  return eventRequestError(failure, 'save').message
}
