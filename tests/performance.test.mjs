import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readAllPages } from '../src/services/readAllPages.js'
import { eventScheduleFields } from '../src/utils/eventTime.js'
import { normalizeEvent } from '../src/utils/eventForm.js'
import { filterReportRows, buildAttendanceReportBlob } from '../src/utils/exportAttendance.js'
import { studentSummary, organizerSummary } from '../src/utils/dashboardData.js'
import { mount, deferred, event, nodes, text, button } from './helpers/renderModule.mjs'

function table(rows, { cap = 500, failAt = 0, mutate } = {}) {
  const calls = []
  return { calls, query() {
    let cursor = '', limit = 500; const filters = []
    const query = {
      select(columns, options) { this.columns = columns; this.exact = options?.count === 'exact'; return this },
      eq(column, value) { filters.push([column, value]); return this },
      order(column, options) { assert.equal(column, 'id'); assert.equal(options.ascending, true); return this },
      limit(value) { limit = value; return this },
      gt(column, value) { assert.equal(column, 'id'); cursor = value; return this },
      abortSignal(signal) { this.signal = signal; return this },
      then(resolve, reject) {
        const index = calls.length + 1
        calls.push({ cursor, filters, columns: this.columns, signal: this.signal })
        if (failAt === index) return Promise.reject(Error('Database failure')).then(resolve, reject)
        const matching = rows.filter(row => row.id > cursor && filters.every(([key, value]) => row[key] === value))
          .sort((a, b) => a.id.localeCompare(b.id))
        const data = matching.slice(0, Math.min(limit, cap))
        mutate?.(index, rows)
        return Promise.resolve({ data, error: null, count: this.exact ? matching.length : null }).then(resolve, reject)
      },
    }
    return query
  } }
}
const largeRows = count => Array.from({ length: count }, (_, index) => ({ id: 'id-' + String(index).padStart(6, '0') }))
for (const count of [0, 1, 499, 500, 501, 1205]) test('keyset pagination returns all '+count+' records without duplicates', async () => {
  const source = largeRows(count), db = table(source, { cap: 137 })
  const rows = await readAllPages(() => db.query())
  assert.deepEqual(rows, source)
  assert.equal(new Set(rows.map(row => row.id)).size, count)
  assert.equal(db.calls.length, Math.ceil(count / 137) + 1)
})
test('deleting earlier rows between pages cannot shift or skip remaining IDs', async () => {
  const source = largeRows(1100), expected = [...source]
  const db = table(source, { mutate: (page, rows) => { if (page === 1) rows.splice(0, 100) } })
  assert.deepEqual(await readAllPages(() => db.query()), expected)
})
test('exact count avoids a terminal empty request without assuming the server page cap', async () => {
  const source = largeRows(1205), db = table(source, { cap: 137 })
  const rows = await readAllPages(options => db.query().select('id', options))
  assert.deepEqual(rows, source); assert.equal(db.calls.length, 9)
})
test('inconsistent exact counts reject an incomplete traversal', async () => {
  let call = 0
  await assert.rejects(readAllPages(() => ({ order() { return this }, limit() { return this }, gt() { return this },
    then(resolve) { call++; return Promise.resolve({ data: call === 1 ? [{ id: 'a' }] : [], count: call === 1 ? 2 : null, error: null }).then(resolve) },
  })), /dataset changed/)
})
test('failed later page returns no partial result and a fresh retry is complete', async () => {
  const source = largeRows(1200), failed = table(source, { failAt: 2 })
  await assert.rejects(readAllPages(() => failed.query()), /Database failure/)
  const retry = table(source)
  assert.equal((await readAllPages(() => retry.query())).length, 1200)
})
for (const data of [[{ id: 'z' }, { id: 'a' }], [{ id: 'a' }, { id: 'a' }], [{ id: null }]]) test('invalid or duplicate page order fails explicitly: '+JSON.stringify(data), async () => {
  await assert.rejects(readAllPages(() => ({ order() { return this }, limit() { return Promise.resolve({ data, error: null }) } })), /pagination order/)
})
test('aborted or old-session pagination cannot issue later reads', async () => {
  for (const change of ['abort', 'account']) {
    const controller = new AbortController(), pending = deferred(); let current = true, calls = 0
    const request = readAllPages(() => { calls++; return { order() { return this }, limit() { return this }, abortSignal() { return pending.promise } } }, { signal: controller.signal, isCurrent: () => current })
    if (change === 'abort') controller.abort(); else current = false
    pending.resolve({ data: largeRows(500), error: null })
    await assert.rejects(request, { name: 'AbortError' }); assert.equal(calls, 1)
  }
})

test('event service requests only owned columns/records and retains chronological ordering', async () => {
  const rows = largeRows(1205).map((row, index) => ({ ...row, organizer_id: index % 2 ? 'other' : 'organizer-1', title: 'Event', starts_at: '2026-11-'+(10 + index % 9)+'T01:00:00Z', ends_at: '2026-11-30T03:00:00Z', capacity: 10 }))
  const db = table(rows, { cap: 113 })
  const app = await mount('src/services/eventService.js', { modules: {
    './supabase': { supabase: { from: name => { assert.equal(name, 'events'); return db.query() } } },
    '../utils/eventTime': { eventScheduleFields },
  } })
  const result = await app.exports.fetchEvents(undefined, { organizerId: 'organizer-1' })
  assert.equal(result.length, 603); assert.ok(result.every(row => row.organizerId === 'organizer-1'))
  assert.ok(result.every((row, i) => !i || Date.parse(row.startsAt) >= Date.parse(result[i-1].startsAt)))
  assert.ok(db.calls.every(call => call.columns !== '*' && call.filters.some(([key]) => key === 'organizer_id')))
})
test('registration service pages the active student scope without including other accounts', async () => {
  const rows = largeRows(1501).map((row, index) => ({ ...row, student_id: index % 2 ? 'other' : 'student-1', status: 'registered', registered_at: '2026-11-01T00:00:00Z' }))
  const db = table(rows, { cap: 99 })
  const app = await mount('src/services/registrationService.js', { modules: { './supabase': { supabase: { from: () => db.query() } } } })
  const result = await app.exports.fetchRegistrations(undefined, { studentId: 'student-1' })
  assert.equal(result.length, 751); assert.ok(result.every(row => row.studentId === 'student-1'))
  assert.ok(db.calls.every(call => call.filters.length === 2))
})

const reportRecord = (index, eventId = event.id) => ({ registration_id: 'r-'+index, event_id: eventId, student_id: 's-'+index, student_name: 'Student '+index, registered_at: '2026-11-01T02:03:04Z', checked_in_at: index % 2 ? '2026-11-10T01:02:03Z' : null })
async function attendanceService(records, counts) {
  return mount('src/services/attendanceService.js', { modules: {
    './supabase': { supabase: { rpc: name => { assert.equal(name, 'get_attendance_records'); return Promise.resolve({ data: records, error: null }) } } },
    './registrationService': { fetchRegistrationCounts: async () => counts },
  } })
}
test('verified attendance report is event scoped and complete above the default row cap', async () => {
  const records = Array.from({ length: 1205 }, (_, i) => reportRecord(i)).concat(reportRecord('other', 'foreign-event'))
  const app = await attendanceService(records, { [event.id]: 1205 })
  const result = await app.exports.fetchVerifiedAttendanceRecords(event.id)
  assert.equal(result.length, 1205); assert.ok(result.every(row => row.eventId === event.id))
})
for (const kind of ['truncated', 'duplicate', 'missing-count']) test('report refuses uncertain RPC completeness: '+kind, async () => {
  const records = kind === 'duplicate' ? [reportRecord(1), reportRecord(1)] : [reportRecord(1)]
  const app = await attendanceService(records, kind === 'missing-count' ? {} : { [event.id]: 2 })
  await assert.rejects(app.exports.fetchVerifiedAttendanceRecords(event.id), /No partial report was downloaded/)
})
test('a session switch during verified report reads rejects the old result', async () => {
  let current = true
  const app = await attendanceService([reportRecord(1)], { [event.id]: 1 })
  const pending = app.exports.fetchVerifiedAttendanceRecords(event.id, { isCurrent: () => current })
  current = false; await assert.rejects(pending, { name: 'AbortError' })
})

const registrations = count => Array.from({ length: count }, (_, index) => ({ id: 'r-'+index, eventId: event.id, studentId: 's-'+index, studentName: 'Student '+index, status: 'registered', registeredAt: '2026-11-01T02:03:04Z', attendedAt: index % 2 ? '2026-11-10T01:02:03Z' : null }))
test('large CSV yields between chunks and includes all matching records and full timestamps', async () => {
  let yields = 0
  const rows = filterReportRows(registrations(5005), event)
  const blob = await buildAttendanceReportBlob(rows, { yieldControl: async () => { yields++ } })
  const csv = await blob.text()
  assert.equal(csv.split('\r\n').length, 5006); assert.equal(yields, 11)
  assert.ok(csv.includes('2026-11-01T02:03:04Z')); assert.ok(csv.includes('2026-11-10T01:02:03Z'))
  assert.ok(csv.includes('"Checked In"')); assert.ok(csv.includes('"Not Checked In"'))
})
test('CSV preserves six-column format, quoting, line breaks and formula protection', async () => {
  const rows = [{ ...registrations(1)[0], eventTitle: 'Campus, "Fair"', studentName: '=HYPERLINK("bad")', studentId: '\tunsafe' }]
  const csv = await (await buildAttendanceReportBlob(rows)).text()
  assert.match(csv, /"Student Name","Student ID","Event","Registration Date","Check-in Time","Status"/)
  assert.ok(csv.includes('"\'=HYPERLINK(""bad"")"')); assert.ok(csv.includes('"\'\tunsafe"')); assert.ok(csv.includes('"Campus, ""Fair"""'))
  for (const value of ['+formula', '-formula', '@formula', '  =formula', '\ntext', '\rtext']) {
    const result = await (await buildAttendanceReportBlob([{ ...rows[0], studentName: value }])).text()
    assert.ok(result.includes('"\''+value+'"'))
  }
})
test('report filters exclude foreign events and preserve name/ID/status selection', () => {
  const rows = registrations(20).concat({ ...registrations(1)[0], eventId: 'foreign', studentName: 'Student 1' })
  const result = filterReportRows(rows, event, 'student 1', 'checked-in')
  assert.equal(result.length, 6); assert.ok(result.every(row => row.attendedAt && row.eventId === event.id))
})
test('large CSV stops on account change or cancellation before preparing a download', async () => {
  const controller = new AbortController(); let yields = 0
  await assert.rejects(buildAttendanceReportBlob(filterReportRows(registrations(1001), event), { signal: controller.signal, yieldControl: async () => { if (++yields === 2) controller.abort() } }), { name: 'AbortError' })
  assert.equal(yields, 2)
})

test('dashboard lookups retain correct statistics across large mixed-role datasets', () => {
  const events = Array.from({ length: 2000 }, (_, i) => ({ ...event, id: 'e-'+i, organizerId: i % 2 ? 'other' : 'organizer-1' }))
  const rows = Array.from({ length: 10000 }, (_, i) => ({ ...registrations(1)[0], id: 'r-'+i, eventId: 'e-'+(i % 2000), studentId: 'student-1', attendedAt: i % 2 ? null : '2026-11-10T01:02:03Z' }))
  const student = studentSummary(events, rows, 'student-1', '2026-11-03T00:00:00Z')
  const organizer = organizerSummary(events, rows, 'organizer-1', '2026-11-03T00:00:00Z')
  assert.equal(student.total, 10000); assert.equal(student.attended, 5000)
  assert.equal(organizer.registered, 5000); assert.equal(organizer.attended, 5000); assert.equal(organizer.rate, 100)
})

async function provider(role) {
  let sync, clock = 100000, owned = true
  const calls = { events: 0, registrations: 0, counts: 0, attendance: 0 }
  const app = await mount('src/context/EventsProvider.jsx', { role, globals: { Date: class extends Date { static now() { return clock } } }, modules: {
    '../hooks/useRealtimeAttendance': { default: options => { sync = options } },
    '../utils/eventForm': { normalizeEvent },
    '../services/eventService': {
      fetchEvents: async (signal, options) => { calls.events++; assert.equal(typeof options.isCurrent, 'function'); return owned ? [event] : [] },
      createEvent: async values => ({ ...event, ...values }), updateEvent: async () => event, removeEvent: async () => {},
    },
    '../services/registrationService': { fetchRegistrations: async () => { calls.registrations++; return [] }, fetchRegistrationCounts: async () => { calls.counts++; return {} }, registerForEvent: async () => registrations(1)[0] },
    '../services/attendanceService': { fetchAttendanceRecords: async () => { calls.attendance++; return [] }, checkInTicket: async () => {}, fetchVerifiedAttendanceRecords: async () => [] },
  } })
  const value = () => app.render().props.value; value()
  return { app, calls, value, sync: () => sync, advance: time => { clock += time }, disown: () => { owned = false } }
}
for (const role of ['student', 'organizer']) test(role+' polls attendance/counts while reusing one-minute event cache', async () => {
  const p = await provider(role)
  await p.value().refreshEvents()
  for (let i = 0; i < 4; i++) { p.advance(15000); await p.sync().refresh() }
  assert.equal(p.calls.attendance, 5); assert.equal(p.calls.counts, 5)
  assert.equal(p.calls.events, 2)
  assert.equal(p.calls.registrations, role === 'student' ? 5 : 0)
})
test('mutations invalidate the event cache and account changes cannot reuse it', async () => {
  const p = await provider('organizer'); await p.value().refreshEvents()
  await p.value().deleteEvent(event.id); p.disown(); await p.sync().refresh()
  assert.equal(p.calls.events, 2); assert.equal(p.value().events.length, 0)
  p.app.setAuth({ id: 'organizer-2', role: 'organizer' }); p.value(); await p.sync().refresh()
  assert.equal(p.calls.events, 3)
})
test('report provider rejects unauthorized events before making report reads', async () => {
  const p = await provider('organizer'); await p.value().refreshEvents()
  await assert.rejects(p.value().loadAttendanceReport('foreign-event'), /not available/)
})

async function monitor({ count = 205, load, download = async () => {} } = {}) {
  const rows = registrations(count)
  const app = await mount('src/pages/organizer/components/AttendanceMonitor.jsx', { effects: true, events: {
    registrations: rows, attendanceList: [], loadAttendanceReport: load || (async () => rows),
  }, modules: { '../../../utils/exportAttendance': { filterReportRows, downloadAttendanceReport: download } } })
  const child = nodes(app.render()).find(node => typeof node.type === 'function' && node.props?.event)
  const render = () => app.renderComponent(child.type, child.props)
  render(); app.flushEffects()
  return { app, render }
}
test('monitor limits DOM rows, but export retrieves every matching row with duplicate-click protection', async () => {
  const request = deferred(); let calls = 0, exported
  const p = await monitor({ load: () => { calls++; return request.promise }, download: async rows => { exported = rows } })
  const bodyRows = tree => nodes(tree).find(node => node.type === 'tbody').props.children
  assert.equal(bodyRows(p.render()).length, 100)
  button(p.render(), 'Next').props.onClick(); assert.equal(bodyRows(p.render()).length, 100)
  button(p.render(), 'Next').props.onClick(); assert.equal(bodyRows(p.render()).length, 5)
  const trigger = button(p.render(), 'Export CSV'); const first = trigger.props.onClick(); await trigger.props.onClick()
  assert.equal(calls, 1); assert.equal(button(p.render(), 'Preparing CSV...').props.disabled, true)
  request.resolve(registrations(1205)); await first
  assert.equal(exported.length, 1205); assert.match(text(p.render()), /Prepared CSV with 1205 rows/)
  assert.equal(button(p.render(), 'Export CSV').props.disabled, false)
})
test('export uses selected name/status filters over the fresh complete roster', async () => {
  let exported
  const p = await monitor({ download: async rows => { exported = rows } })
  nodes(p.render()).find(node => node.type === 'input' && node.props.type === 'search').props.onChange({ target: { value: 'Student 1' } })
  nodes(p.render()).find(node => node.type === 'select').props.onChange({ target: { value: 'checked-in' } })
  await button(p.render(), 'Export CSV').props.onClick()
  assert.deepEqual(exported.map(row => row.id), filterReportRows(registrations(205), event, 'Student 1', 'checked-in').map(row => row.id))
})
test('failed or incomplete export announces failure without reporting success', async () => {
  let downloads = 0
  const p = await monitor({ load: async () => { throw Error('incomplete RPC') }, download: async () => { downloads++ } })
  await button(p.render(), 'Export CSV').props.onClick()
  assert.equal(downloads, 0); assert.ok(nodes(p.render()).some(node => node.props?.role === 'alert'))
  assert.doesNotMatch(text(p.render()), /Prepared CSV/)
})
test('account switch or monitor unmount cancels a pending export without a download', async () => {
  for (const action of ['switch', 'unmount']) {
    const request = deferred(); let downloads = 0
    const p = await monitor({ load: () => request.promise, download: async () => { downloads++ } })
    const pending = button(p.render(), 'Export CSV').props.onClick()
    if (action === 'switch') p.app.setAuth({ id: 'organizer-2', role: 'organizer' }); else p.app.unmount()
    request.resolve(registrations(205)); await pending
    assert.equal(downloads, 0)
  }
})
