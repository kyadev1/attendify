
import { useEffect, useMemo, useRef, useState } from 'react'
import { downloadAttendanceReport, filterReportRows } from '../../../utils/exportAttendance'
import {
  Link,
  useNavigate,
  useParams,
} from 'react-router-dom'
import {
  ArrowLeft,
  Users,
  UserCheck,
  ChartNoAxesColumnIncreasing,
  Search,
  Download,
  QrCode,
  CircleCheck,
} from 'lucide-react'

import useAuth from '../../../hooks/useAuth'
import useEvents from '../../../hooks/useEvents'
import Button from '../../../components/Button/Button'
import styles from '../styles/AttendanceMonitor.module.css'

const dateFormatter = new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeZone: 'Asia/Manila',
  })
const dateLabel = value => dateFormatter.format(new Date(value))

const timeFormatter = new Intl.DateTimeFormat('en-PH', {
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  })
const timeLabel = value => timeFormatter.format(new Date(value))

export default function AttendanceMonitor({
  report = false,
}) {
  const { id } = useParams()
  const { user } = useAuth()

  const {
    events,
    registrations,
    attendanceList,
    loading,
    error,
  } = useEvents()

  const navigate = useNavigate()

  const owned = events.filter(
    event => event.organizerId === user?.id
  )

  const event = owned.find(
    item => item.id === id
  )

  if (loading) {
    return (
      <section className={styles.page}>
        <h1>
          {report
            ? 'Attendance Report'
            : 'Attendance Monitor'}
        </h1>

        <p role="status">
          Loading attendance records...
        </p>
      </section>
    )
  }

  if (error) {
    return (
      <section className={styles.page}>
        <h1>
          {report
            ? 'Attendance Report'
            : 'Attendance Monitor'}
        </h1>

        <p role="alert">{error}</p>
      </section>
    )
  }

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <Link
          className={styles.back}
          to="/organizer/events"
        >
          <ArrowLeft
            size={16}
            aria-hidden="true"
          />

          Back to My Events
        </Link>

        <h1>
          {report
            ? 'Attendance Report'
            : 'Attendance Monitor'}
        </h1>

        <p>
          Monitor registrations and check-ins
          for your events.
        </p>
      </header>

      <div className={styles.selectorCard}>
        <label className={styles.field}>
          Event

          <select
            value={event?.id || ''}
            onChange={change => {
              const eventId = change.target.value

              if (!eventId) return

              navigate(
                '/organizer/events/' +
                  eventId +
                  (report
                    ? '/reports'
                    : '/attendance')
              )
            }}
          >
            <option value="" disabled>
              Select an event
            </option>

            {owned.map(item => (
              <option
                key={item.id}
                value={item.id}
              >
                {item.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!owned.length ? (
        <p>
          No events yet.{' '}
          <Link to="/organizer/events/new">
            Create an event
          </Link>
        </p>
      ) : event ? (
        <EventAttendance
          key={user.id + ":" + event.id}
          event={event}
          registrations={registrations}
          attendanceList={attendanceList}
        />
      ) : (
        <p>
          This event is unavailable for your
          account. Select an event above.
        </p>
      )}
    </section>
  )
}

function EventAttendance({
  event,
  registrations,
  attendanceList,
}) {
  const { sessionGeneration, isSessionCurrent } = useAuth()
  const { loadAttendanceReport } = useEvents()
  const exportRequest = useRef(null)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  useEffect(() => () => exportRequest.current?.abort(), [])
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [message, setMessage] = useState('')
  const [page, setPage] = useState(0)

  // Real registrations from Supabase.
  const eventRegistrations = useMemo(() => registrations.filter(
    row =>
      row.eventId === event.id &&
      row.status === 'registered'
  ), [registrations, event.id])

  // Real check-ins from Supabase.
  const eventAttendance = useMemo(() => attendanceList.filter(
    row => row.eventId === event.id
  ), [attendanceList, event.id])

  const registered = eventRegistrations.length
  const checkedIn = eventAttendance.length

  const rate = registered
    ? Math.round(
        (checkedIn / registered) * 100
      )
    : 0

  const rows = useMemo(() => {
    const attendedByRegistration = new Map(
      eventAttendance.map(row => [row.registrationId, row.attendedAt])
    )

    return eventRegistrations.map(row => ({
      id: row.id,
      status: row.status,
      eventId: row.eventId,
      eventTitle: event.title,
      studentId: row.studentId,
      studentName: row.studentName || 'Student',
      registeredAt: row.registeredAt,
      attendedAt: attendedByRegistration.get(row.id) || row.attendedAt || null,
    }))
  }, [eventRegistrations, eventAttendance, event.title])

  const filteredRows = useMemo(() => filterReportRows(rows, event, query, status), [rows, event, query, status])
  const pageIndex = Math.min(page, Math.max(0, Math.ceil(filteredRows.length / 100) - 1))
  const visibleRows = filteredRows.slice(pageIndex * 100, (pageIndex + 1) * 100)

  async function exportReport() {
    if (exportRequest.current || !isSessionCurrent(sessionGeneration)) return
    const controller = new AbortController()
    exportRequest.current = controller
    const active = () => !controller.signal.aborted && isSessionCurrent(sessionGeneration)
    setExporting(true)
    setMessage('')
    setExportError('')
    try {
      const complete = await loadAttendanceReport(event.id, controller.signal)
      if (!active()) return
      const selected = filterReportRows(complete, event, query, status)
      await downloadAttendanceReport(selected, event.title, { signal: controller.signal, isCurrent: active })
      if (active()) setMessage('Prepared CSV with ' + selected.length + ' rows. Check your browser downloads.')
    } catch {
      if (active()) setExportError('Unable to prepare a complete report. No file was downloaded. Refresh and try again; if the problem continues, contact your administrator.')
    } finally {
      if (active()) setExporting(false)
      if (exportRequest.current === controller) exportRequest.current = null
    }
  }

  return (
    <>
      <dl className={styles.stats}>
        <div>
          <dt>
            <span className={styles.infoIcon}>
              <Users
                size={20}
                aria-hidden="true"
              />
            </span>

            Total Registered
          </dt>

          <dd>{registered}</dd>
          <p>Students registered</p>
        </div>

        <div>
          <dt>
            <span className={styles.successIcon}>
              <UserCheck
                size={20}
                aria-hidden="true"
              />
            </span>

            Total Checked-In
          </dt>

          <dd>{checkedIn}</dd>
          <p>Students attended</p>
        </div>

        <div>
          <dt>
            <span className={styles.successIcon}>
              <ChartNoAxesColumnIncreasing
                size={20}
                aria-hidden="true"
              />
            </span>

            Attendance Rate
          </dt>

          <dd>{rate}%</dd>

          <p>
            {checkedIn} of {registered} checked in
          </p>

          <progress
            className={styles.progress}
            value={rate}
            max="100"
            aria-label="Attendance rate"
          >
            {rate}%
          </progress>
        </div>
      </dl>

      <section
        className={styles.filterCard}
        aria-labelledby="filters-title"
      >
        <h2 id="filters-title">
          Filters
        </h2>

        <div className={styles.filters}>
          <label className={styles.field}>
            Search students

            <span className={styles.search}>
              <Search
                size={18}
                aria-hidden="true"
              />

              <input
                type="search"
                value={query}
                disabled={exporting}
                onChange={change => {
                  setQuery(change.target.value)
                  setPage(0)
                  setMessage('')
                }}
                placeholder="Search student name or ID..."
              />
            </span>
          </label>

          <label className={styles.field}>
            Status

            <select
              value={status}
              disabled={exporting}
              onChange={change => {
                setStatus(change.target.value)
                setPage(0)
                setMessage('')
              }}
            >
              <option value="all">
                All registrations
              </option>

              <option value="checked-in">
                Checked-In
              </option>

              <option value="pending">
                Not Checked-In
              </option>
            </select>
          </label>
        </div>

        <p
          role="status"
          className={styles.resultCount}
        >
          Showing{' '}
          <strong>
            {filteredRows.length}
          </strong>{' '}
          of {registered} students
        </p>

        <p className={styles.note}>
          Summary cards cover the entire event.
        </p>
      </section>

      {exportError && <p role="alert">{exportError}</p>}

      <section
        className={styles.records}
        aria-labelledby="records-title"
      >
        <header className={styles.recordsHeader}>
          <div>
            <h2 id="records-title">
              Attendance Records
            </h2>

            <p>{event.title}</p>
          </div>

          <div className={styles.actions}>
            <Button
              variant="secondary"
              onClick={exportReport}
              disabled={!filteredRows.length || exporting}
              aria-busy={exporting}
            >
              <Download
                size={17}
                aria-hidden="true"
              />

              {exporting ? 'Preparing CSV...' : 'Export CSV'}
            </Button>

            {event.status === 'published' && (
              <Link
                className={styles.scannerButton}
                to={
                  '/organizer/events/' +
                  event.id +
                  '/scan'
                }
              >
                <QrCode
                  size={18}
                  aria-hidden="true"
                />

                Open QR Scanner
              </Link>
            )}
          </div>
        </header>

        <p
          role="status"
          className={styles.message}
        >
          {message}
        </p>

        {filteredRows.length ? (
          <div className={styles.tableWrap}>
            <table
              role="table"
              aria-labelledby="records-title"
            >
              <thead role="rowgroup">
                <tr role="row">
                  <th scope="col">
                    Student
                  </th>

                  <th scope="col">
                    Student ID
                  </th>

                  <th scope="col">
                    Event
                  </th>

                  <th scope="col">
                    Check-in Time
                  </th>

                  <th scope="col">
                    Status
                  </th>
                </tr>
              </thead>

              <tbody role="rowgroup">
                {visibleRows.map(row => (
                  <tr
                    key={row.id}
                    role="row"
                  >
                    <th scope="row">
                      <div className={styles.student}>
                        <span
                          className={styles.avatar}
                          aria-hidden="true"
                        >
                          {row.studentName
                            .trim()
                            .split(/\s+/)
                            .slice(0, 2)
                            .map(part => part[0])
                            .join('')}
                        </span>

                        <span>
                          {row.studentName}
                        </span>
                      </div>
                    </th>

                    <td data-label="Student ID">
                      {row.studentId}
                    </td>

                    <td data-label="Event">
                      {row.eventTitle}
                    </td>

                    <td data-label="Check-in Time">
                      {row.attendedAt ? (
                        <time
                          className={styles.timestamp}
                          dateTime={row.attendedAt}
                        >
                          <span>
                            {dateLabel(
                              row.attendedAt
                            )}
                          </span>

                          <span>
                            {timeLabel(
                              row.attendedAt
                            )}
                          </span>
                        </time>
                      ) : (
                        <span
                          aria-label="Not checked in"
                        >
                          &mdash;
                        </span>
                      )}
                    </td>

                    <td data-label="Status">
                      <span
                        className={
                          row.attendedAt
                            ? styles.checkedIn
                            : styles.pending
                        }
                      >
                        {row.attendedAt && (
                          <CircleCheck
                            size={14}
                            aria-hidden="true"
                          />
                        )}

                        {row.attendedAt
                          ? 'Checked In'
                          : 'Not Checked In'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.empty}>
            <Search
              size={32}
              aria-hidden="true"
            />

            <h3>
              No attendance records found
            </h3>

            <p>
              {registered
                ? 'Try changing your search or status filter.'
                : 'No registrations for this event yet.'}
            </p>
          </div>
        )}

        <footer className={styles.footer}>
          {filteredRows.length > 100 && <nav className={styles.pagination} aria-label="Attendance records pages">
            <span role="status">Rows {pageIndex * 100 + 1}–{pageIndex * 100 + visibleRows.length} of {filteredRows.length}</span>
            <Button variant="secondary" disabled={pageIndex === 0} onClick={() => setPage(pageIndex - 1)}>Previous</Button>
            <Button variant="secondary" disabled={(pageIndex + 1) * 100 >= filteredRows.length} onClick={() => setPage(pageIndex + 1)}>Next</Button>
          </nav>}
          Times shown in Manila time.
          CSV exports the filtered records
          with full timestamps.
        </footer>
      </section>
    </>
  )
}
