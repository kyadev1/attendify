import useEventClock from '../../../hooks/useEventClock'
import { eventPhase } from '../../../utils/eventTime'

import EventModalContent from './EventModalContent'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import useAuth from '../../../hooks/useAuth'
import useEvents from '../../../hooks/useEvents'
import { formatDate } from '../../../utils/dashboardData'
import Button from '../../../components/Button/Button'
import styles from '../styles/EventDetails.module.css'

export default function EventRegistration({
  eventId,
  inModal = false,
}) {
  const { user } = useAuth()
  const {
    events,
    registrations,
    registerEvent,
    loading,
    error: loadError,
  } = useEvents()

  const now = useEventClock(events)
  const statusRef = useRef(null)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const event = events.find(
    item =>
      item.id === eventId &&
      item.status === 'published'
  )

  const booking = registrations.find(
    row =>
      row.eventId === eventId &&
      row.studentId === user?.id
  )

  const Heading = inModal ? 'h2' : 'h1'

  if (loading) {
    return <p role="status">Loading event...</p>
  }

  if (loadError) {
    return <p role="alert">{loadError}</p>
  }

  if (!event) {
    return (
      <section className={styles.details}>
        <Heading id="event-title">
          Event not found
        </Heading>
        <p>This event is unavailable.</p>
        <Link to="/browse">Browse events</Link>
      </section>
    )
  }

  const closed = !['upcoming', 'ongoing'].includes(eventPhase(event, now))

  async function confirm() {
    if (submitting || booking) return

    setSubmitting(true)
    setError('')
    setSuccess(false)

    try {
      await registerEvent(event.id)
      setSuccess(true)

      if (inModal) {
        requestAnimationFrame(() => {
          statusRef.current?.focus()
        })
      }
    } catch (failure) {
      setError(
        failure?.message ||
          'Registration failed. Please try again.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (inModal) {
    return (
      <EventModalContent
        event={event}
        booking={booking}
        closed={closed}
        confirm={confirm}
        success={success}
        error={error}
        statusRef={statusRef}
        submitting={submitting}
      />
    )
  }

  return (
    <section className={styles.details}>
      <Heading id="event-title">
        {event.title}
      </Heading>

      <p>{event.description}</p>

      <dl className={styles.facts}>
        <div>
          <dt>Category</dt>
          <dd>{event.category}</dd>
        </div>

        <div>
          <dt>Starts (Manila)</dt>
          <dd>{formatDate(event.startsAt)}</dd>
        </div>

        <div>
          <dt>Ends (Manila)</dt>
          <dd>{formatDate(event.endsAt)}</dd>
        </div>

        <div>
          <dt>Location</dt>
          <dd>{event.location}</dd>
        </div>

        <div>
          <dt>Organizer</dt>
          <dd>{event.organizerName}</dd>
        </div>

        <div>
          <dt>Available slots</dt>
          <dd>
            {event.slotsRemaining} of {event.slots}
          </dd>
        </div>
      </dl>

      <Button
        onClick={confirm}
        disabled={
          submitting ||
          Boolean(booking) ||
          closed ||
          event.slotsRemaining === 0
        }
      >
        {submitting
          ? 'Registering...'
          : booking
            ? 'Already Registered'
            : closed
              ? 'Registration Closed'
              : event.slotsRemaining === 0
                ? 'Event Full'
                : 'Confirm Registration'}
      </Button>

      <div role="status">
        {success && (
          <p className={styles.success}>
            Registration successful!
            Your booking has been saved.
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}

      {booking && (
        <div className={styles.actions}>
          <Link
            className={styles.ticketLink}
            to={'/ticket/' + booking.id}
          >
            View Digital Ticket
          </Link>

          <Link to="/bookings">
            My Bookings
          </Link>
        </div>
      )}
    </section>
  )
}
