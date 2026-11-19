import useEventClock from '../../../hooks/useEventClock'
import { eventPhase } from '../../../utils/eventTime'

import { Link } from 'react-router-dom'
import {
  ArrowRight,
  CalendarDays,
  CircleCheck,
  Clock,
  MapPin,
  Ticket,
} from 'lucide-react'

import useAuth from '../../../hooks/useAuth'
import useEvents from '../../../hooks/useEvents'

import styles from '../styles/StudentDashboard.module.css'

const date = value =>
  new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeZone: 'Asia/Manila',
  }).format(new Date(value))

const time = value =>
  new Intl.DateTimeFormat('en-PH', {
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  }).format(new Date(value))

function Status({ attended }) {
  return (
    <span
      className={
        attended
          ? styles.attended
          : styles.registered
      }
    >
      {attended ? 'Attended' : 'Registered'}
    </span>
  )
}

export default function StudentDashboard() {
  const { user } = useAuth()

  const {
    events,
    registrations,
    loading,
    error,
  } = useEvents()

  const now = useEventClock(events)

  // Only registrations owned by this student.
  const myRegistrations = registrations.filter(
    registration =>
      registration.studentId === user?.id &&
      registration.status === 'registered'
  )

  // Match each registration with its event.
  const bookings = myRegistrations
    .map(registration => {
      const event = events.find(
        item => item.id === registration.eventId
      )

      return {
        ...registration,
        event,
      }
    })
    .filter(booking => Boolean(booking.event))

  // Upcoming events that the student registered for.
  const upcoming = bookings
    .filter(booking => booking.event.status === 'published' && eventPhase(booking.event, now) === 'upcoming')
    .sort(
      (a, b) =>
        new Date(a.event.startsAt) -
        new Date(b.event.startsAt)
    )

  // Count only confirmed attendance.
  const attended = myRegistrations.filter(
    registration => Boolean(registration.attendedAt)
  ).length

  // Most recent registrations.
  const recent = [...bookings]
    .sort(
      (a, b) =>
        new Date(b.registeredAt) -
        new Date(a.registeredAt)
    )
    .slice(0, 5)

  const metrics = [
    {
      label: 'Registrations',
      value: myRegistrations.length,
      text: 'Total registrations',
      Icon: Ticket,
      tone: styles.green,
    },
    {
      label: 'Upcoming Events',
      value: upcoming.length,
      text: 'Registered upcoming events',
      Icon: CalendarDays,
      tone: styles.blue,
    },
    {
      label: 'Attended Events',
      value: attended,
      text: 'Confirmed check-ins',
      Icon: CircleCheck,
      tone: styles.green,
    },
  ]

  if (loading) {
    return (
      <div className={styles.dashboard}>
        <header className={styles.header}>
          <h1>Student Dashboard</h1>

          <p role="status">
            Loading your dashboard...
          </p>
        </header>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.dashboard}>
        <header className={styles.header}>
          <h1>Student Dashboard</h1>

          <p role="alert">{error}</p>
        </header>
      </div>
    )
  }

  return (
    <div className={styles.dashboard}>
      {/* HEADER */}
      <header className={styles.header}>
        <div>
          <h1>Student Dashboard</h1>

          <p className={styles.welcome}>
            Welcome back,{' '}
            {user?.name ||
              user?.full_name ||
              'Student'}{' '}
            <span
              role="img"
              aria-label="waving hand"
            >
              👋
            </span>
          </p>

          <p className={styles.description}>
            Track your registrations and upcoming
            campus events.
          </p>
        </div>

        <Link
          className={styles.primaryButton}
          to="/browse"
        >
          <CalendarDays
            size={18}
            aria-hidden="true"
          />

          Browse Events
        </Link>
      </header>

      {/* DASHBOARD STATISTICS */}
      <dl className={styles.stats}>
        {metrics.map(
          ({
            label,
            value,
            text,
            Icon,
            tone,
          }) => (
            <div
              className={styles.statCard}
              key={label}
            >
              <dt>
                <span
                  className={[
                    styles.iconBox,
                    tone,
                  ].join(' ')}
                >
                  <Icon
                    size={22}
                    aria-hidden="true"
                  />
                </span>

                {label}
              </dt>

              <dd>
                <strong>{value}</strong>
                <span>{text}</span>
              </dd>
            </div>
          )
        )}
      </dl>

      {/* UPCOMING REGISTERED EVENTS */}
      <section
        className={styles.section}
        aria-labelledby="upcoming-title"
      >
        <div className={styles.sectionHeader}>
          <h2 id="upcoming-title">
            Upcoming Registered Events
          </h2>

          <Link
            className={styles.textAction}
            to="/bookings"
          >
            View all

            <ArrowRight
              size={16}
              aria-hidden="true"
            />
          </Link>
        </div>

        {upcoming.length ? (
          <ul className={styles.eventGrid}>
            {upcoming
              .slice(0, 2)
              .map(booking => (
                <li key={booking.id}>
                  <article
                    className={styles.eventCard}
                  >
                    <Status
                      attended={Boolean(
                        booking.attendedAt
                      )}
                    />

                    <h3>
                      <Link
                        to={
                          '/events/' +
                          booking.event.id
                        }
                      >
                        {booking.event.title}
                      </Link>
                    </h3>

                    <div
                      className={styles.eventInfo}
                    >
                      <p>
                        <CalendarDays
                          size={17}
                          aria-hidden="true"
                        />

                        <time
                          dateTime={
                            booking.event.startsAt
                          }
                        >
                          {date(
                            booking.event.startsAt
                          )}
                        </time>
                      </p>

                      <p>
                        <Clock
                          size={17}
                          aria-hidden="true"
                        />

                        {time(
                          booking.event.startsAt
                        )}{' '}
                        (Manila)
                      </p>

                      <p>
                        <MapPin
                          size={17}
                          aria-hidden="true"
                        />

                        {booking.event.location ||
                          booking.event.venue}
                      </p>
                    </div>

                    <Link
                      className={styles.ticketButton}
                      to={
                        '/ticket/' +
                        booking.id
                      }
                    >
                      <Ticket
                        size={18}
                        aria-hidden="true"
                      />

                      View Ticket
                    </Link>
                  </article>
                </li>
              ))}
          </ul>
        ) : (
          <div className={styles.empty}>
            <CalendarDays
              size={28}
              aria-hidden="true"
            />

            <h3>
              No upcoming registered events
            </h3>

            <p>
              Explore campus events and reserve
              your next spot.
            </p>

            <Link
              className={styles.textAction}
              to="/browse"
            >
              Browse Events

              <ArrowRight
                size={16}
                aria-hidden="true"
              />
            </Link>
          </div>
        )}
      </section>

      {/* RECENT REGISTRATIONS */}
      <section
        className={styles.recentPanel}
        aria-labelledby="recent-title"
      >
        <div className={styles.sectionHeader}>
          <h2 id="recent-title">
            Recent Registrations
          </h2>

          <Link
            className={styles.textAction}
            to="/bookings"
          >
            View all bookings

            <ArrowRight
              size={16}
              aria-hidden="true"
            />
          </Link>
        </div>

        {recent.length ? (
          <>
            {/* DESKTOP TABLE */}
            <table className={styles.table}>
              <caption className={styles.srOnly}>
                Your five most recent
                registrations
              </caption>

              <thead>
                <tr>
                  <th scope="col">
                    Event
                  </th>

                  <th scope="col">
                    Registration Date
                  </th>

                  <th scope="col">
                    Status
                  </th>

                  <th scope="col">
                    Action
                  </th>
                </tr>
              </thead>

              <tbody>
                {recent.map(booking => (
                  <tr key={booking.id}>
                    <th scope="row">
                      <Link
                        to={
                          '/events/' +
                          booking.event.id
                        }
                      >
                        {booking.event.title}
                      </Link>
                    </th>

                    <td>
                      <time
                        dateTime={
                          booking.registeredAt
                        }
                      >
                        {date(
                          booking.registeredAt
                        )}
                      </time>
                    </td>

                    <td>
                      <Status
                        attended={Boolean(
                          booking.attendedAt
                        )}
                      />
                    </td>

                    <td>
                      <Link
                        className={
                          styles.iconAction
                        }
                        to={
                          '/ticket/' +
                          booking.id
                        }
                        aria-label={
                          'View ticket for ' +
                          booking.event.title
                        }
                      >
                        <Ticket
                          size={18}
                          aria-hidden="true"
                        />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* MOBILE LIST */}
            <ul className={styles.mobileList}>
              {recent.map(booking => (
                <li key={booking.id}>
                  <h3>
                    <Link
                      to={
                        '/events/' +
                        booking.event.id
                      }
                    >
                      {booking.event.title}
                    </Link>
                  </h3>

                  <p>
                    Registered{' '}
                    <time
                      dateTime={
                        booking.registeredAt
                      }
                    >
                      {date(
                        booking.registeredAt
                      )}
                    </time>
                  </p>

                  <div
                    className={
                      styles.mobileActions
                    }
                  >
                    <Status
                      attended={Boolean(
                        booking.attendedAt
                      )}
                    />

                    <Link
                      className={
                        styles.iconAction
                      }
                      to={
                        '/ticket/' +
                        booking.id
                      }
                      aria-label={
                        'View ticket for ' +
                        booking.event.title
                      }
                    >
                      <Ticket
                        size={18}
                        aria-hidden="true"
                      />
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className={styles.empty}>
            <Ticket
              size={28}
              aria-hidden="true"
            />

            <p>
              No registrations yet.
              Your bookings will appear here.
            </p>
          </div>
        )}
      </section>
    </div>
  )
}
