import { eventScheduleFields } from '../utils/eventTime'

import { supabase } from './supabase'
import { readAllPages } from './readAllPages'

export function mapEvent(row) {
  const { date, time, endDate, endTime } = eventScheduleFields({ startsAt: row.starts_at, endsAt: row.ends_at })

  return {
    id: row.id,
    organizerId: row.organizer_id,
    title: row.title,
    category: row.category,
    description: row.description,
    location: row.venue,
    venue: row.venue,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    date,
    time,
    endDate,
    endTime,
    slots: row.capacity,
    status: row.status,
    imageUrl: row.image_url,
  }
}

export async function fetchEvents(signal, { organizerId, isCurrent } = {}) {
  const rows = await readAllPages(options => {
    let query = supabase.from('events')
      .select('id,organizer_id,title,category,description,venue,starts_at,ends_at,capacity,status,image_url', options)
    // An explicit scope reduces reads; RLS remains the authorization boundary.
    if (organizerId) query = query.eq('organizer_id', organizerId)
    return query
  }, { signal, isCurrent })
  return rows.map(mapEvent).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.id.localeCompare(b.id))
}

export async function createEvent(values, organizerId) {
  const { data, error } = await supabase
    .from('events')
    .insert({
      organizer_id: organizerId,
      title: values.title,
      category: values.category,
      description: values.description,
      venue: values.location,
      starts_at: values.startsAt,
      ends_at: values.endsAt,
      capacity: values.slots,
      status: 'published',
    })
    .select()
    .single()

  if (error) throw error
  return mapEvent(data)
}

export async function updateEvent(eventId, values) {
  const { data, error } = await supabase
    .from('events')
    .update({
      title: values.title,
      category: values.category,
      description: values.description,
      venue: values.location,
      starts_at: values.startsAt,
      ends_at: values.endsAt,
      capacity: values.slots,
    })
    .eq('id', eventId)
    .select()
    .single()

  if (error) throw error
  return mapEvent(data)
}

export async function removeEvent(eventId) {
  const { data, error } = await supabase
    .from('events')
    .delete()
    .eq('id', eventId)
    .select('id')

  if (error) throw error

  if (!data?.length) {
    throw new Error(
      'Event could not be deleted. Check ownership or registrations.'
    )
  }
}
