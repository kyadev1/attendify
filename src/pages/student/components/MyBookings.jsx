import useEventClock from '../../../hooks/useEventClock'
import { eventPhase } from '../../../utils/eventTime'

import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarDays,
  Clock,
  MapPin,
  Ticket,
  CheckCircle,
  ArrowRight,
} from 'lucide-react'
import useAuth from '../../../hooks/useAuth'
import useEvents from '../../../hooks/useEvents'
import styles from '../styles/MyBookings.module.css'

const format = (value, options) =>
  new Intl.DateTimeFormat('en-PH', {
    ...options,
    timeZone: 'Asia/Manila',
  }).format(new Date(value))

export default function MyBookings() {
  const { user } = useAuth()
  const {
    events,
    registrations,
    loading,
    error,
  } = useEvents()

  const now = useEventClock(events)
  const [filter, setFilter] = useState('all')

  const bookings = registrations
    .filter(row => row.studentId === user?.id)
    .map(row => ({
      ...row,
      event: events.find(
        event => event.id === row.eventId
      ),
    }))
    .filter(row => row.event)

  const isUpcoming = row =>
    eventPhase(row.event, now) === 'upcoming'

  const attended = bookings.filter(
    row => Boolean(row.attendedAt)
  )

  const upcoming = bookings.filter(isUpcoming)

  const visible = bookings.filter(row => {
    if (filter === 'upcoming') {
      return isUpcoming(row)
    }

    if (filter === 'attended') {
      return Boolean(row.attendedAt)
    }

    return true
  })

  const groups =
    filter === 'all'
      ? [
          {
            title: 'Upcoming Events',
            rows: visible
              .filter(isUpcoming)
              .sort(
                (a, b) =>
                  new Date(a.event.startsAt) -
                  new Date(b.event.startsAt)
              ),
          },
          {
            title: 'Ongoing & Past Events',
            rows: visible
              .filter(row => !isUpcoming(row))
              .sort(
                (a, b) =>
                  new Date(b.event.startsAt) -
                  new Date(a.event.startsAt)
              ),
          },
        ]
      : [
          {
            title:
              filter === 'upcoming'
                ? 'Upcoming Events'
                : 'Attended Events',
            rows: [...visible].sort(
              (a, b) =>
                filter === 'upcoming'
                  ? new Date(a.event.startsAt) -
                    new Date(b.event.startsAt)
                  : new Date(b.event.startsAt) -
                    new Date(a.event.startsAt)
            ),
          },
        ]

  const metrics = [
    {
      label: 'Total Bookings',
      value: bookings.length,
      text: 'Your event registrations',
      Icon: Ticket,
    },
    {
      label: 'Upcoming Events',
      value: upcoming.length,
      text: 'Registered upcoming events',
      Icon: CalendarDays,
    },
    {
      label: 'Attended Events',
      value: attended.length,
      text: 'Events you checked in to',
      Icon: CheckCircle,
    },
  ]

  if (loading) {
    return <p role="status">Loading bookings...</p>
  }

  if (error) {
    return <p role="alert">{error}</p>
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>My Bookings</h1>
          <p>
            Manage your registered events and
            digital tickets.
          </p>
        </div>

        <Link
          className={styles.secondary}
          to="/browse"
        >
          Browse Events
          <ArrowRight
            size={16}
            aria-hidden="true"
          />
        </Link>
      </header>

      <dl className={styles.stats}>
        {metrics.map(
          ({ label, value, text, Icon }) => (
            <div
              key={label}
              className={styles.stat}
            >
              <dt>
                <span className={styles.iconBox}>
                  <Icon
                    size={21}
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

      <div
        className={styles.filters}
        role="group"
        aria-label="Filter bookings"
      >
        {[
          ['all', 'All Bookings'],
          ['upcoming', 'Upcoming'],
          ['attended', 'Attended'],
        ].map(([value, label]) => (
          <button
            type="button"
            key={value}
            aria-pressed={filter === value}
            className={
              filter === value
                ? styles.activeFilter
                : styles.filter
            }
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <p className={styles.count} role="status">
        Showing {visible.length} of {bookings.length}
        {' '}bookings
      </p>

      {groups
        .filter(group => group.rows.length)
        .map(group => (
          <section
            key={group.title}
            className={styles.section}
            aria-label={group.title}
          >
            <h2>{group.title}</h2>

            <ul className={styles.list}>
              {group.rows.map(row => (
                <li key={row.id}>
                  <article className={styles.card}>
                    <div
                      className={styles.dateBlock}
                      aria-hidden="true"
                    >
                      <span>
                        {format(
                          row.event.startsAt,
                          { month: 'short' }
                        )}
                      </span>

                      <strong>
                        {format(
                          row.event.startsAt,
                          { day: '2-digit' }
                        )}
                      </strong>
                    </div>

                    <div className={styles.details}>
                      <h3>
                        <Link
                          to={
                            '/events/' +
                            row.event.id
                          }
                        >
                          {row.event.title}
                        </Link>
                      </h3>

                      <div className={styles.metadata}>
                        <p>
                          <CalendarDays
                            size={16}
                            aria-hidden="true"
                          />
                          {format(
                            row.event.startsAt,
                            { dateStyle: 'medium' }
                          )}
                        </p>

                        <p>
                          <Clock
                            size={16}
                            aria-hidden="true"
                          />
                          {format(
                            row.event.startsAt,
                            { timeStyle: 'short' }
                          )} (Manila)
                        </p>

                        <p>
                          <MapPin
                            size={16}
                            aria-hidden="true"
                          />
                          {row.event.location}
                        </p>
                      </div>

                      <span className={styles.badge}>
                        {row.attendedAt && (
                          <CheckCircle
                            size={14}
                            aria-hidden="true"
                          />
                        )}
                        {row.attendedAt
                          ? 'Attended'
                          : 'Registered'}
                      </span>
                    </div>

                    <div className={styles.actions}>
                      <Link
                        className={styles.secondary}
                        to={
                          '/events/' +
                          row.event.id
                        }
                      >
                        View Event
                        <ArrowRight
                          size={16}
                          aria-hidden="true"
                        />
                      </Link>

                      <Link
                        className={styles.primary}
                        to={'/ticket/' + row.id}
                      >
                        <Ticket
                          size={17}
                          aria-hidden="true"
                        />
                        View Digital Ticket
                      </Link>
                    </div>
                  </article>
                </li>
              ))}
            </ul>
          </section>
        ))}

      {!visible.length && (
        <section className={styles.empty}>
          <Ticket
            size={30}
            aria-hidden="true"
          />

          <h2>
            {bookings.length
              ? filter === 'attended'
                ? 'No attended events yet'
                : 'No upcoming bookings'
              : 'No bookings yet'}
          </h2>

          <p>
            {bookings.length
              ? 'Choose another filter to see your registrations.'
              : 'Browse campus events to find your next activity.'}
          </p>

          <Link
            className={styles.secondary}
            to="/browse"
          >
            Browse Events
            <ArrowRight
              size={16}
              aria-hidden="true"
            />
          </Link>
        </section>
      )}
    </div>
  )
}
