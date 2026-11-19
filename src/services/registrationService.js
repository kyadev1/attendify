
import { supabase } from './supabase'
import { readAllPages } from './readAllPages'

export function mapRegistration(row) {
  return {
    id: row.id,
    eventId: row.event_id,
    studentId: row.student_id,
    status: row.status,
    registeredAt: row.registered_at,
    attendedAt: null,
    studentName: '',
  }
}

export async function fetchRegistrations(signal, { studentId, isCurrent } = {}) {
  const rows = await readAllPages(options => {
    let query = supabase.from('registrations')
      .select('id,event_id,student_id,status,registered_at', options).eq('status', 'registered')
    if (studentId) query = query.eq('student_id', studentId)
    return query
  }, { signal, isCurrent })
  return rows.map(mapRegistration).sort((a, b) => Date.parse(b.registeredAt) - Date.parse(a.registeredAt) || a.id.localeCompare(b.id))
}

export async function fetchRegistrationCounts(signal) {
  let query = supabase.rpc(
    'get_event_registration_counts'
  )

  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query

  if (error) throw error

  return Object.fromEntries(
    (data || []).map(row => [
      row.event_id,
      Number(row.registration_count),
    ])
  )
}

export async function registerForEvent(eventId) {
  const { data, error } = await supabase.rpc(
    'register_for_event',
    { p_event_id: eventId }
  )

  if (error) throw error
  return mapRegistration(data)
}
