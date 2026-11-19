import useEventClock from '../../../hooks/useEventClock'
import { eventPhase } from '../../../utils/eventTime'

import {
  CalendarDays,
  Users,
  CircleCheck,
  TrendingUp,
  ScanLine,
  Clock,
  Info,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import useAuth from '../../../hooks/useAuth'
import useEvents from '../../../hooks/useEvents'
import { formatDate } from '../../../utils/dashboardData'

import styles from '../styles/OrganizerDashboard.module.css'

export default function OrganizerDashboard() {
  const { user } = useAuth()

  const {
    events,
    registrations,
    attendanceList,
    loading,
    error,
  } = useEvents()

  const [selectedId, setSelectedId] = useState('')

  // Only events owned by the logged-in organizer.
  const myEvents = events.filter(
    event => event.organizerId === user?.id
  )

  const eventIds = new Set(
    myEvents.map(event => event.id)
  )

  // Real registration records from Supabase.
  const myRegistrations = registrations.filter(
    registration =>
      eventIds.has(registration.eventId) &&
      registration.status === 'registered'
  )

  // Real QR attendance records from Supabase.
  const myAttendance = attendanceList.filter(
    record => eventIds.has(record.eventId)
  )

  const totalEvents = myEvents.length
  const totalRegistered = myRegistrations.length
  const totalAttended = myAttendance.length

  const attendanceRate = totalRegistered
    ? Math.round(
        (totalAttended / totalRegistered) * 100
      )
    : 0

  const now = useEventClock(events)

  const ongoingEvents = myEvents.filter(event => event.status === 'published' && eventPhase(event, now) === 'ongoing')

  const liveId = ongoingEvents.some(
    event => event.id === selectedId
  )
    ? selectedId
    : ongoingEvents[0]?.id

  const selectedEvent = ongoingEvents.find(
    event => event.id === liveId
  )

  const pending = myRegistrations.filter(
    registration =>
      registration.eventId === liveId &&
      !registration.attendedAt
  )

  const recentAttendance = [...myAttendance]
    .sort(
      (a, b) =>
        new Date(b.attendedAt) -
        new Date(a.attendedAt)
    )
    .slice(0, 5)

  const metrics = [
    {
      label: 'My Events',
      value: totalEvents,
      text: 'Total events',
      Icon: CalendarDays,
    },
    {
      label: 'Registrations',
      value: totalRegistered,
      text: 'Event registrations',
      Icon: Users,
    },
    {
      label: 'Attended',
      value: totalAttended,
      text: 'Checked-in registrations',
      Icon: CircleCheck,
    },
    {
      label: 'Attendance Rate',
      value: attendanceRate + '%',
      text: 'Overall attendance',
      Icon: TrendingUp,
    },
  ]

  if (loading) {
    return (
      <div className={styles.dashboard}>
        <header className={styles.header}>
          <h1>Organizer Dashboard</h1>
          <p role="status">
            Loading dashboard data...
          </p>
        </header>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.dashboard}>
        <header className={styles.header}>
          <h1>Organizer Dashboard</h1>
          <p role="alert">{error}</p>
        </header>
      </div>
    )
  }

  return (
    <div className={styles.dashboard}>
      {/* DASHBOARD HEADER */}
      <header className={styles.header}>
        <h1>Organizer Dashboard</h1>

        <p>
          Manage your events, registrations,
          and attendance.
        </p>
      </header>

      {/* DASHBOARD STATISTICS */}
      <dl className={styles.stats}>
        {metrics.map(
          ({ label, value, text, Icon }) => (
            <div
              className={styles.card}
              key={label}
            >
              <dt>
                <span className={styles.iconBox}>
                  <Icon
                    size={20}
                    aria-hidden="true"
                  />
                </span>

                <span>{label}</span>

                {label === 'Attendance Rate' && (
                  <span className={styles.info}>
                    <button
                      type="button"
                      aria-label="About attendance rate"
                      aria-describedby="rate-help"
                    >
                      <Info
                        size={15}
                        aria-hidden="true"
                      />
                    </button>

                    <span
                      id="rate-help"
                      role="tooltip"
                      className={styles.tooltip}
                    >
                      Checked-in registrations
                      divided by all registrations
                      across your events, including
                      upcoming events.
                    </span>
                  </span>
                )}
              </dt>

              <dd>
                <strong>{value}</strong>
                <span>{text}</span>
              </dd>
            </div>
          )
        )}
      </dl>

      <div className={styles.mainGrid}>
        {/* LIVE CHECK-IN */}
        <section className={styles.panel}>
          <h2>
            <ScanLine
              size={21}
              aria-hidden="true"
            />
            Live Check-in
          </h2>

          {ongoingEvents.length ? (
            <>
              <div className={styles.selector}>
                <label htmlFor="live-event">
                  Ongoing Event
                </label>

                <select
                  id="live-event"
                  value={liveId || ''}
                  onChange={event => {
                    setSelectedId(
                      event.target.value
                    )
                  }}
                >
                  {ongoingEvents.map(event => (
                    <option
                      key={event.id}
                      value={event.id}
                    >
                      {event.title}
                    </option>
                  ))}
                </select>
              </div>

              <p className={styles.pending}>
                <Clock
                  size={18}
                  aria-hidden="true"
                />

                <span>
                  <strong>
                    {pending.length}
                  </strong>{' '}
                  students awaiting check-in
                </span>
              </p>

              <div className={styles.actions}>
                <Link
                  className={styles.scanButton}
                  to={`/organizer/events/${selectedEvent.id}/scan`}
                >
                  <ScanLine
                    size={18}
                    aria-hidden="true"
                  />
                  <span>Open QR Scanner</span>
                </Link>

                <Link
                  className={styles.attendanceButton}
                  to={`/organizer/events/${selectedEvent.id}/attendance`}
                >
                  <Users
                    size={18}
                    aria-hidden="true"
                  />
                  <span>View Attendance</span>
                </Link>
              </div>
            </>
          ) : (
            <p className={styles.empty}>
              No ongoing events right now.
              Open a published event from
              My Events to access its QR scanner.
            </p>
          )}
        </section>

        {/* RECENT ATTENDANCE */}
        <section className={styles.panel}>
          <h2>
            <CircleCheck
              size={21}
              aria-hidden="true"
            />
            Recent Attendance
          </h2>

          {recentAttendance.length ? (
            <ul className={styles.feed}>
              {recentAttendance.map(record => {
                const relatedEvent =
                  myEvents.find(
                    event =>
                      event.id ===
                      record.eventId
                  )

                const studentName =
                  record.studentName ||
                  'Student'

                const initials = studentName
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map(part => part[0])
                  .join('')

                return (
                  <li
                    key={
                      record.registrationId ||
                      record.id
                    }
                  >
                    <span
                      className={styles.avatar}
                      aria-hidden="true"
                    >
                      {initials}
                    </span>

                    <div className={styles.person}>
                      <strong>
                        {studentName}
                      </strong>

                      <p>
                        {relatedEvent?.title ||
                          'Event'}
                      </p>
                    </div>

                    <div className={styles.scanMeta}>
                      <time
                        dateTime={
                          record.attendedAt
                        }
                        title={formatDate(
                          record.attendedAt
                        )}
                      >
                        {new Intl.DateTimeFormat(
                          'en-PH',
                          {
                            timeStyle: 'short',
                            timeZone:
                              'Asia/Manila',
                          }
                        ).format(
                          new Date(
                            record.attendedAt
                          )
                        )}
                      </time>

                      <CircleCheck
                        size={16}
                        aria-label="Checked in"
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className={styles.empty}>
              No attendance recorded yet.
            </p>
          )}
        </section>
      </div>

      {/* EVENT OVERVIEW */}
      <section className={styles.panel}>
        <h2>Event Overview</h2>

        {myEvents.length ? (
          <div
            className={styles.tableWrap}
            tabIndex={0}
            role="region"
            aria-label="Event analytics"
          >
            <table>
              <thead>
                <tr>
                  <th scope="col">
                    Event
                  </th>
                  <th scope="col">
                    Status
                  </th>
                  <th scope="col">
                    Registered
                  </th>
                  <th scope="col">
                    Attended
                  </th>
                </tr>
              </thead>

              <tbody>
                {myEvents.map(event => {
                  const eventRegistrations =
                    myRegistrations.filter(
                      registration =>
                        registration.eventId ===
                        event.id
                    )

                  const eventAttendance =
                    myAttendance.filter(
                      record =>
                        record.eventId ===
                        event.id
                    )

                  return (
                    <tr key={event.id}>
                      <th scope="row">
                        <Link
                          to={
                            '/organizer/events/' +
                            event.id
                          }
                        >
                          {event.title}
                        </Link>
                      </th>

                      <td>
                        <span
                          className={
                            event.status ===
                            'published'
                              ? styles.published
                              : styles.draft
                          }
                        >
                          <span
                            className={styles.dot}
                            aria-hidden="true"
                          />

                          {event.status ===
                          'published'
                            ? 'Published'
                            : event.status ===
                                'draft'
                              ? 'Draft'
                              : event.status}
                        </span>
                      </td>

                      <td>
                        {
                          eventRegistrations.length
                        }
                      </td>

                      <td>
                        {
                          eventAttendance.length
                        }
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={styles.empty}>
            No events yet.{' '}
            <Link to="/organizer/events/new">
              Create an event
            </Link>
          </p>
        )}
      </section>
    </div>
  )
}
