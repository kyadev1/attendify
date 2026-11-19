export function attendanceTimestamp(value) {
  if (!value) return ''
  // Explicit offset and seconds keep the exported/displayed time unambiguous.
  return new Date(new Date(value).getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ') + ' +08:00'
}

export function attendanceRows(registrations, event, query = '', status = 'all') {
  if (!event) return []
  const search = query.trim().toLowerCase()
  return registrations.filter(r => r.eventId === event.id)
    .filter(r => !search || r.studentName.toLowerCase().includes(search) || r.studentId.toLowerCase().includes(search))
    .filter(r => status === 'all' || (status === 'checked-in' ? Boolean(r.attendedAt) : !r.attendedAt))
    .sort((a, b) => (new Date(b.attendedAt || 0) - new Date(a.attendedAt || 0)) || a.studentName.localeCompare(b.studentName))
    .map(r => ({ id: r.id, studentId: r.studentId, studentName: r.studentName, eventTitle: event.title, scannedAt: attendanceTimestamp(r.attendedAt), status: r.attendedAt ? 'Checked-In' : 'Not Checked-In' }))
}

function csvCell(value) {
  let text = String(value ?? '')
  // Prevent spreadsheet applications interpreting user-entered data as formulas.
  if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text
  return '"' + text.replaceAll('"', '""') + '"'
}

export function filterReportRows(registrations, event, query = '', status = 'all') {
  const search = query.trim().toLowerCase()
  return registrations.filter(row => row.eventId === event.id && row.status === 'registered')
    .map(row => ({ ...row, eventTitle: event.title, studentName: row.studentName || 'Student' }))
    .filter(row => (!search || row.studentName.toLowerCase().includes(search) || row.studentId.toLowerCase().includes(search)) &&
      (status === 'all' || (status === 'checked-in' ? Boolean(row.attendedAt) : !row.attendedAt)))
    .sort((a, b) => new Date(a.registeredAt) - new Date(b.registeredAt) || a.id.localeCompare(b.id))
}

function requireExportActive({ signal, isCurrent = () => true }) {
  if (signal?.aborted || !isCurrent()) throw Object.assign(new Error('Report cancelled.'), { name: 'AbortError' })
}

export async function buildAttendanceReportBlob(rows, { chunkSize = 500, yieldControl = () => new Promise(resolve => setTimeout(resolve, 0)), ...scope } = {}) {
  if (!Number.isInteger(chunkSize) || chunkSize < 1) throw new Error('Invalid CSV chunk size.')
  const chunks = ['\uFEFF' + ['Student Name', 'Student ID', 'Event', 'Registration Date', 'Check-in Time', 'Status'].map(csvCell).join(',')]
  // Yield between bounded chunks so a large CSV does not monopolize the UI.
  for (let start = 0; start < rows.length; start += chunkSize) {
    requireExportActive(scope)
    await yieldControl()
    requireExportActive(scope)
    chunks.push('\r\n' + rows.slice(start, start + chunkSize).map(row => [
      row.studentName, row.studentId, row.eventTitle, row.registeredAt || '', row.attendedAt || '',
      row.attendedAt ? 'Checked In' : 'Not Checked In',
    ].map(csvCell).join(',')).join('\r\n'))
  }
  requireExportActive(scope)
  return new Blob(chunks, { type: 'text/csv;charset=utf-8;' })
}

export async function downloadAttendanceReport(rows, eventTitle, scope = {}) {
  const blob = await buildAttendanceReportBlob(rows, scope)
  requireExportActive(scope)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  try {
    link.href = url
    link.download = eventTitle.replace(/[^a-z0-9-_]/gi, '_').slice(0, 80) + '_attendance.csv'
    document.body.appendChild(link)
    link.click()
  } finally {
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10000)
  }
}

export function buildAttendanceCsv(rows) {
  const headers = ['Student ID', 'Student Name', 'Event Title', 'Time Scanned (UTC+08:00)', 'Status']
  return '\uFEFF' + [headers, ...rows.map(r => [r.studentId, r.studentName, r.eventTitle, r.scannedAt, r.status])].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

export function downloadAttendance(rows, eventTitle) {
  const blob = new Blob([buildAttendanceCsv(rows)], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'Attendance_Report_' + (eventTitle.replace(/[^a-z0-9_-]+/gi, '_').slice(0, 80) || 'Event') + '.csv'
  document.body.appendChild(link)
  try { link.click() } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000) }
}
