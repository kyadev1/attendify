
import { supabase } from './supabase'
import { fetchRegistrationCounts } from './registrationService'
import { requireActiveRead } from './readAllPages'

export function mapAttendanceRecord(row) {
  return {
    id: row.registration_id,
    registrationId: row.registration_id,
    eventId: row.event_id,
    studentId: row.student_id,
    studentName: row.student_name || '',
    registeredAt: row.registered_at,
    attendedAt: row.checked_in_at,
    scannedAt: row.checked_in_at,
  }
}

export async function fetchAttendanceRecords(signal) {
  let query = supabase.rpc(
    'get_attendance_records'
  )

  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query

  if (error) throw error

  return (data || []).map(mapAttendanceRecord)
}

// The RPC's SQL/return type is unavailable, so do not assume .range() applies
// to its response. Verify the requested event against its aggregate count;
// refuse the export if a row cap, duplicate, or concurrent registration makes
// completeness uncertain. The RPC continues to enforce authorization.
export async function fetchVerifiedAttendanceRecords(eventId, { signal, isCurrent } = {}) {
  requireActiveRead(signal, isCurrent)
  const [records, counts] = await Promise.all([
    fetchAttendanceRecords(signal), fetchRegistrationCounts(signal),
  ])
  requireActiveRead(signal, isCurrent)
  const selected = records.filter(record => record.eventId === eventId)
  const expected = counts[eventId]
  const ids = new Set(selected.map(record => record.registrationId))
  if (!Number.isSafeInteger(expected) || expected < 0 || selected.length !== expected ||
      ids.size !== selected.length || selected.some(record => !record.registrationId)) {
    throw new Error('Unable to verify all registrations for this report. No partial report was downloaded. Refresh and try again; large reports may require database pagination support.')
  }
  return selected
}

export async function checkInTicket({
  registrationId,
  eventId,
  studentId,
}) {
  const { data, error } = await supabase.rpc(
    'check_in_ticket',
    {
      p_registration_id: registrationId,
      p_event_id: eventId,
      p_student_id: studentId,
    }
  )

  if (error) throw error

  const row = data?.[0]

  if (!row) {
    throw new Error(
      'The server did not confirm the check-in.'
    )
  }

  return mapAttendanceRecord({
    ...row,
    registered_at: null,
  })
}
