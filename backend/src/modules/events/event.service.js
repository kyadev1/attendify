import { ApiError, databaseError } from '../../utils/errors.js'

export const EVENT_COLUMNS = 'id,organizer_id,title,category,description,venue,starts_at,ends_at,capacity,status,image_url'

export async function findVisibleEvent(db, account, id) {
  let query = db.from('events').select(EVENT_COLUMNS).eq('id', id)
  query = account.role === 'organizer'
    ? query.eq('organizer_id', account.id) : query.eq('status', 'published')
  const { data, error } = await query.maybeSingle()
  if (error?.code === '22P02') throw new ApiError(400, 'INVALID_REQUEST', 'Invalid event identifier.')
  if (error) throw databaseError(error)
  // Defense in depth, in addition to query filters and RLS.
  if (!data || (account.role === 'organizer' ? data.organizer_id !== account.id : data.status !== 'published')) {
    throw new ApiError(404, 'NOT_FOUND', 'Event not found or unavailable.')
  }
  return Object.fromEntries(EVENT_COLUMNS.split(',').map(key => [key, data[key]]))
}
