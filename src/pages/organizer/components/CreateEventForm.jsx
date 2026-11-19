import { eventScheduleFields } from '../../../utils/eventTime'
import { eventFormError } from '../../../utils/eventRequestError'

import Modal from '../../../components/Modal/components/Modal'
import { formatDate } from '../../../utils/dashboardData'
import mediaStyles from '../../../styles/EventMedia.module.css'
import { lazy, Suspense, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  CalendarDays,
  Clock,
  MapPin,
  Users,
  Tag,
  Info,
  CircleCheck,
} from 'lucide-react'
import useEvents from '../../../hooks/useEvents'
import useAuth from '../../../hooks/useAuth'
import PageBoundary from '../../../routes/PageBoundary'
import Button from '../../../components/Button/Button'
import community from '../../../assets/Community.jpg'
import technology from '../../../assets/Technology.jpg'
import career from '../../../assets/Career.jpg'
import arts from '../../../assets/Arts.jpg'
import styles from '../styles/CreateEventForm.module.css'

const RegistrationFormBuilder = import.meta.env?.DEV && !import.meta.env?.PROD && import.meta.env?.VITE_ENABLE_FORM_BUILDER_PROTOTYPE === 'true'
  ? lazy(() => import('../../../features/registrationForms/components/RegistrationFormBuilder')) : null

const categories = [
  'Academic',
  'Sports',
  'Cultural',
  'Seminars',
  'Community',
  'Technology',
  'Leadership',
  'Arts',
  'Careers',
]

const images = {
  Community: community,
  Technology: technology,
  Careers: career,
  Arts: arts,
}

function getInitialValues(event) {
  return {
    title: event?.title || '',
    category: event?.category || '',
    ...eventScheduleFields(event),
    location: event?.location || '',
    slots: event?.slots ?? '',
    description: event?.description || '',
  }
}

export default function CreateEventForm({ event }) {
  const { saveEvent } = useEvents()
  const { user, sessionGeneration } = useAuth()
  const navigate = useNavigate()
  const submitRef = useRef(null)

  const [values, setValues] = useState(() =>
    getInitialValues(event)
  )

  const [createdEvent, setCreatedEvent] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [saving, setSaving] = useState(false)

  const isEditing = Boolean(event)

  async function submit(e) {
    e.preventDefault()

    if (saving) return

    setSaving(true)
    setMessage('')
    setError('')
    setFieldErrors({})

    try {
      const savedEvent = await saveEvent(
        { ...values },
        event?.id
      )

      if (isEditing) {
        setMessage('Event updated successfully!')
      } else {
        setCreatedEvent(savedEvent)
      }
    } catch (failure) {
      const errorMessage = eventFormError(failure)

      const missing = Object.keys(values).filter(
        key => !String(values[key]).trim()
      )

      if (failure?.field) {
        setFieldErrors({ [failure.field]: errorMessage })
      } else if (missing.length) {
        setFieldErrors(
          Object.fromEntries(
            missing.map(key => [
              key,
              'This field is required.',
            ])
          )
        )
      } else if (/capacity/i.test(errorMessage)) {
        setFieldErrors({
          slots: errorMessage,
        })
      } else if (/date|time/i.test(errorMessage)) {
        setFieldErrors({
          date: errorMessage,
        })
      } else {
        setError(errorMessage)
      }
    } finally {
      setSaving(false)
    }
  }

  function change(e) {
    const { name, value } = e.target

    setValues(previous => ({
      ...previous,
      [name]: value,
    }))

    setFieldErrors(previous => ({
      ...previous,
      [name]: '',
    }))

    setMessage('')
    setError('')
  }

  function props(name) {
    return {
      id: 'event-' + name,
      name,
      value: values[name],
      onChange: change,
      required: true,
      disabled: saving,
      'aria-invalid': Boolean(fieldErrors[name]),
      'aria-describedby': fieldErrors[name]
        ? 'error-' + name
        : undefined,
    }
  }

  function feedback(name) {
    if (!fieldErrors[name]) return null

    return (
      <p
        className={styles.error}
        id={'error-' + name}
      >
        {fieldErrors[name]}
      </p>
    )
  }

  return (
    <div className={styles.page}>
      <Link
        className={styles.back}
        to="/organizer/events"
      >
        <ArrowLeft size={17} aria-hidden="true" />
        Back to My Events
      </Link>

      <header className={styles.header}>
        <h1>
          {isEditing ? 'Edit Event' : 'Create Event'}
        </h1>

        <p>
          {isEditing
            ? 'Update the details of your campus event.'
            : 'Set up the details for your new campus event.'}
        </p>
      </header>

      <div className={styles.columns}>
        <form
          className={styles.form}
          onSubmit={submit}
          onInvalid={e => {
            const { name, validationMessage } = e.target

            if (!name) return

            setFieldErrors(previous => ({
              ...previous,
              [name]: validationMessage,
            }))
          }}
        >
          <h2>Event Details</h2>

          <div className={styles.field}>
            <label htmlFor="event-title">
              Event Title
            </label>

            <input
              {...props('title')}
              maxLength={160}
            />

            {feedback('title')}
          </div>

          <div className={styles.field}>
            <label htmlFor="event-category">
              Category
            </label>

            <select {...props('category')}>
              <option value="" disabled>
                Select a category
              </option>

              {categories.map(category => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>

            {feedback('category')}
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label htmlFor="event-date">
                Start Date
              </label>

              <input
                {...props('date')}
                type="date"
              />

              {feedback('date')}
            </div>

            <div className={styles.field}>
              <label htmlFor="event-time">
                Start Time
              </label>

              <input
                {...props('time')}
                type="time"
                step="0.001"
              />

              {feedback('time')}
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label htmlFor="event-endDate">End Date</label>
              <input {...props('endDate')} type="date" />
              {feedback('endDate')}
            </div>
            <div className={styles.field}>
              <label htmlFor="event-endTime">End Time</label>
              <input {...props('endTime')} type="time" step="0.001" />
              {feedback('endTime')}
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="event-location">
              Venue / Location
            </label>

            <input
              {...props('location')}
              maxLength={160}
            />

            {feedback('location')}
          </div>

          <div className={styles.field}>
            <label htmlFor="event-slots">
              Max Capacity / Slots
            </label>

            <input
              {...props('slots')}
              type="number"
              min="1"
              step="1"
            />

            {feedback('slots')}
          </div>

          <div className={styles.field}>
            <label htmlFor="event-description">
              Description
            </label>

            <textarea
              {...props('description')}
              rows={5}
              maxLength={3000}
            />

            {feedback('description')}

            <small className={styles.counter}>
              {values.description.length} / 3000
            </small>
          </div>

          <p className={styles.note}>
            <Info size={16} aria-hidden="true" />

            <span>
              All fields are required. Event times use
              Manila time (UTC+8). The end must be
              after the start. New events are published
              immediately.
            </span>
          </p>

          {error && (
            <p
              role="alert"
              className={styles.error}
            >
              {error}
            </p>
          )}

          <p
            className={styles.message}
            role="status"
          >
            {message}
          </p>

          <div className={styles.actions}>
            <Link
              className={styles.cancel}
              to="/organizer/events"
              aria-disabled={saving}
              onClick={e => {
                if (saving) e.preventDefault()
              }}
            >
              Cancel
            </Link>

            <Button
              ref={submitRef}
              className={styles.primary}
              type="submit"
              disabled={saving}
            >
              {saving
                ? 'Saving...'
                : isEditing
                  ? 'Save Changes'
                  : 'Create Event'}
            </Button>
          </div>
        </form>

        <aside
          className={styles.preview}
          aria-label="Live event preview"
        >
          <h2>Event Preview</h2>

          <article className={styles.previewCard}>
            {images[values.category] ? (
              <div className={mediaStyles.media}>
                <img
                  src={images[values.category]}
                  className={mediaStyles.framedArtwork}
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
              </div>
            ) : (
              <div className={styles.placeholder}>
                <CalendarDays
                  size={36}
                  aria-hidden="true"
                />
              </div>
            )}

            <div className={styles.previewBody}>
              <span className={styles.category}>
                <Tag size={13} aria-hidden="true" />

                {values.category || 'Category'}
              </span>

              <h3>
                {values.title.trim() ||
                  'Your Event Title'}
              </h3>

              <p>
                <CalendarDays
                  size={16}
                  aria-hidden="true"
                />

                {values.date || 'Start date'} / {values.endDate || 'End date'}
              </p>

              <p>
                <Clock
                  size={16}
                  aria-hidden="true"
                />

                {values.time || 'Start time'} / {values.endTime || 'End time'} (Manila)
              </p>

              <p>
                <MapPin
                  size={16}
                  aria-hidden="true"
                />

                <span>
                  {values.location.trim() ||
                    'Location'}
                </span>
              </p>

              <p className={styles.capacity}>
                <Users
                  size={16}
                  aria-hidden="true"
                />

                Capacity: {values.slots || '?'}
              </p>
            </div>
          </article>
        </aside>
      </div>

      {RegistrationFormBuilder && user?.role === 'organizer' && (!event || event.organizerId === user.id) && (
        <section className={styles.form} aria-labelledby="registration-questions-title">
          <h2 id="registration-questions-title">Registration Questions</h2>
          <p>Optional. Preview only — registration questions are not saved.</p>
          <p>Creating or saving the event saves Event Details only. Questions and preview answers are discarded when you leave or refresh this page.</p>
          <PageBoundary key={`${sessionGeneration}:${user.id}:${event?.id || 'new'}`}>
            <Suspense fallback={<p role="status">Loading registration questions preview...</p>}>
              <RegistrationFormBuilder eventId={event?.id || 'local-new-event'} embedded />
            </Suspense>
          </PageBoundary>
        </section>
      )}

      {createdEvent && (
        <Modal
          title="Event Created Successfully!"
          message="Your event has been saved to Supabase and is now available in My Events."
          icon={<CircleCheck size={32} />}
          returnFocusRef={submitRef}
          onClose={() => setCreatedEvent(null)}
          actions={
            <Button
              data-modal-focus
              onClick={() =>
                navigate('/organizer/events')
              }
            >
              View My Events
            </Button>
          }
        >
          <strong>{createdEvent.title}</strong>

          <p>{formatDate(createdEvent.startsAt)}</p>

          <p>{createdEvent.location}</p>
        </Modal>
      )}
    </div>
  )
}
