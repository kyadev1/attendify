// Event phases use [start, end): an event is completed at its exact end time.
export function eventPhase(event, now) {
  const start = Date.parse(event.startsAt)
  const end = Date.parse(event.endsAt)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 'invalid'
  if (now < start) return 'upcoming'
  return now < end ? 'ongoing' : 'completed'
}

const manila = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, hourCycle: 'h23',
})

export function manilaDateTimeFields(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return { date: '', time: '' }
  const parts = Object.fromEntries(manila.formatToParts(new Date(value)).map(part => [part.type, part.value]))
  let time = parts.hour + ':' + parts.minute
  const fraction = parts.fractionalSecond.replace(/0+$/, '')
  if (parts.second !== '00' || fraction) time += ':' + parts.second + (fraction ? '.' + fraction : '')
  return { date: parts.year + '-' + parts.month + '-' + parts.day, time }
}

export function eventScheduleFields(event) {
  const start = manilaDateTimeFields(event?.startsAt)
  const end = manilaDateTimeFields(event?.endsAt)
  return { date: start.date, time: start.time, endDate: end.date, endTime: end.time }
}

export function parseManilaDateTime(date, time, end = false) {
  const dateField = end ? 'endDate' : 'date'
  const timeField = end ? 'endTime' : 'time'
  const fail = (message, field) => { throw Object.assign(new Error(message), { field }) }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) fail('Enter a valid ' + (end ? 'end' : 'start') + ' date.', dateField)
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?$/.test(time || '')) fail('Enter a valid ' + (end ? 'end' : 'start') + ' time.', timeField)
  const timestamp = Date.parse(date + 'T' + time + (time.length === 5 ? ':00' : '') + '+08:00')
  // Date.parse normalizes some impossible dates (for example February 30).
  if (!Number.isFinite(timestamp) || manilaDateTimeFields(new Date(timestamp).toISOString()).date !== date) {
    fail('Enter a valid ' + (end ? 'end' : 'start') + ' date.', dateField)
  }
  return timestamp
}
