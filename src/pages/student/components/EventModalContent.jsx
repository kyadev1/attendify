
import { Link } from 'react-router-dom'
import {
  CalendarDays,
  Clock,
  MapPin,
  Building2,
  CircleCheck,
  Ticket,
} from 'lucide-react'
import Button from '../../../components/Button/Button'
import styles from '../styles/EventModalContent.module.css'

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

export default function EventModalContent({
  event,
  booking,
  closed,
  confirm,
  success,
  error,
  statusRef,
  submitting = false,
}) {
  const startDate = date(event.startsAt)
  const endDate = date(event.endsAt)

  const registered =
    event.slots - event.slotsRemaining

  const metadata = [
    {
      label: 'Date',
      text:
        startDate === endDate
          ? startDate
          : `${startDate} – ${endDate}`,
      Icon: CalendarDays,
    },
    {
      label: 'Time',
      text:
        `${time(event.startsAt)} – ` +
        time(event.endsAt),
      Icon: Clock,
    },
    {
      label: 'Location',
      text: event.location,
      Icon: MapPin,
    },
    {
      label: 'Organizer',
      text: event.organizerName,
      Icon: Building2,
    },
  ]

  return (
    <section className={styles.content}>
      <header className={styles.header}>
        <span className={styles.category}>
          {event.category}
        </span>

        <h2 id="event-title">{event.title}</h2>
        <p>{event.description}</p>
      </header>

      <div>
        <dl className={styles.metadata}>
          {metadata.map(
            ({ label, text, Icon }) => (
              <div
                key={label}
                className={styles.item}
              >
                <span className={styles.icon}>
                  <Icon
                    size={20}
                    aria-hidden="true"
                  />
                </span>

                <div>
                  <dt>{label}</dt>
                  <dd>{text}</dd>
                </div>
              </div>
            )
          )}
        </dl>

        <p className={styles.note}>
          Times shown in Manila time
        </p>
      </div>

      <section
        className={styles.availability}
        aria-label="Event availability"
      >
        <div className={styles.capacity}>
          <strong>
            {registered} / {event.slots} registered
          </strong>

          <span>
            {event.slotsRemaining} slots remaining
          </span>
        </div>

        <progress
          className={styles.progress}
          value={registered}
          max={event.slots || 1}
          aria-label={
            `${registered} of ${event.slots} ` +
            'places registered'
          }
        />
      </section>

      <div role="status">
        {booking && (
          <div
            className={styles.success}
            tabIndex={-1}
            ref={statusRef}
          >
            <CircleCheck
              size={24}
              aria-hidden="true"
            />

            <div>
              <strong>
                {success
                  ? 'Registration successful!'
                  : "You're registered for this event"}
              </strong>

              <p>Your digital ticket is ready.</p>
            </div>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}

      <div className={styles.actions}>
        {booking ? (
          <>
            <Link
              className={styles.primary}
              to={'/ticket/' + booking.id}
            >
              <Ticket
                size={18}
                aria-hidden="true"
              />
              View Digital Ticket
            </Link>

            <Link
              className={styles.secondary}
              to="/bookings"
            >
              My Bookings
            </Link>
          </>
        ) : (
          <Button
            className={styles.confirm}
            onClick={confirm}
            disabled={
              submitting ||
              closed ||
              event.slotsRemaining === 0
            }
          >
            {submitting
              ? 'Registering...'
              : closed
                ? 'Registration Closed'
                : event.slotsRemaining === 0
                  ? 'Event Full'
                  : 'Confirm Registration'}
          </Button>
        )}
      </div>
    </section>
  )
}
