import { eventScheduleFields, parseManilaDateTime } from './eventTime.js'

export function normalizeEvent(values, registered = 0, existing = null) {
  const title = values.title.trim(), category = values.category.trim(), location = values.location.trim(), description = values.description.trim()
  if (!title || !category || !location || !description) throw new Error('Complete all required fields.')
  const slots = Number(values.slots)
  if (!Number.isInteger(slots) || slots < 1) throw new Error('Capacity must be a whole number of at least 1.')
  if (slots < registered) throw new Error('Capacity cannot be less than existing registrations (' + registered + ').')
  const original = eventScheduleFields(existing)
  const date = values.date ?? original.date, time = values.time ?? original.time
  const endDate = values.endDate ?? original.endDate, endTime = values.endTime ?? original.endTime
  const start = parseManilaDateTime(date, time)
  const end = parseManilaDateTime(endDate, endTime, true)
  if (end <= start) throw Object.assign(new Error('End date and time must be after the start.'), { field: 'endTime' })
  // Retain the exact stored value (including sub-millisecond precision) when
  // the corresponding form time is unchanged. Never infer an edit duration.
  const startsAt = existing && start === Date.parse(existing.startsAt) ? existing.startsAt : new Date(start).toISOString()
  const endsAt = existing && end === Date.parse(existing.endsAt) ? existing.endsAt : new Date(end).toISOString()
  return { title, category, location, venue: location, description, date, time, endDate, endTime, slots, startsAt, endsAt }
}
