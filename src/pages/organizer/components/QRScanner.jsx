
import {
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import {
  Link,
  useNavigate,
  useParams,
} from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  CameraOff,
  ScanLine,
  CircleCheck,
  TriangleAlert,
  CalendarDays,
} from 'lucide-react'

import useAuth from '../../../hooks/useAuth'
import useEvents from '../../../hooks/useEvents'
import Button from '../../../components/Button/Button'
import { formatDate } from '../../../utils/dashboardData'
import styles from '../styles/QRScanner.module.css'

export default function QRScanner() {
  const { id } = useParams()
  const { user } = useAuth()
  const { events, loading, error } = useEvents()
  const navigate = useNavigate()

  const owned = events.filter(
    event =>
      event.organizerId === user?.id &&
      event.status === 'published'
  )

  const selected = owned.find(
    event => event.id === id
  )

  if (loading) {
    return (
      <section className={styles.page}>
        <h1>QR Attendance Scanner</h1>
        <p role="status">
          Loading your events...
        </p>
      </section>
    )
  }

  if (error) {
    return (
      <section className={styles.page}>
        <h1>QR Attendance Scanner</h1>
        <p role="alert">{error}</p>
      </section>
    )
  }

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <Link
          className={styles.back}
          to={
            selected
              ? '/organizer/events/' + selected.id
              : '/organizer/events'
          }
        >
          <ArrowLeft
            size={16}
            aria-hidden="true"
          />
          {selected
            ? 'Back to Event'
            : 'Back to My Events'}
        </Link>

        <h1>QR Attendance Scanner</h1>

        <p>
          Scan student tickets for quick event
          check-in.
        </p>
      </header>

      <div className={styles.selectorCard}>
        <label className={styles.field}>
          Event

          <select
            value={selected?.id || ''}
            onChange={event => {
              if (event.target.value) {
                navigate(
                  '/organizer/events/' +
                    event.target.value +
                    '/scan'
                )
              }
            }}
          >
            <option value="" disabled>
              Select an event
            </option>

            {owned.map(event => (
              <option
                key={event.id}
                value={event.id}
              >
                {event.title}
              </option>
            ))}
          </select>
        </label>

        {selected && (
          <div className={styles.eventSummary}>
            <strong>{selected.title}</strong>

            <span>
              <CalendarDays
                size={16}
                aria-hidden="true"
              />

              {formatDate(selected.startsAt)}
            </span>
          </div>
        )}
      </div>

      {!owned.length && (
        <p>No published events available.</p>
      )}

      {selected ? (
        <ScannerSession
          key={selected.id}
          eventId={selected.id}
          eventTitle={selected.title}
        />
      ) : (
        <p>
          Select one of your published events
          to begin.
        </p>
      )}
    </section>
  )
}

function ScannerSession({
  eventId,
  eventTitle,
}) {
  const {
    checkIn,
    attendanceList,
  } = useEvents()

  const readerId = useId().replace(/:/g, '')

  const session = useRef(null)
  const timer = useRef(null)
  const cooldown = useRef(false)

  const [phase, setPhase] = useState('idle')
  const [cameraError, setCameraError] = useState('')
  const [feedback, setFeedback] = useState(null)

  // Clean up the camera when leaving the page.
  useEffect(() => {
    return () => {
      clearTimeout(timer.current)

      const active = session.current

      if (active) {
        active.cancelled = true
        void active.finish?.()
      }
    }
  }, [])

  async function start() {
    if (session.current) return

    const active = {
      cancelled: false,
    }

    session.current = active

    setPhase('starting')
    setCameraError('')
    setFeedback(null)

    let scanner
    let stopPromise

    active.finish = () => {
      if (!stopPromise) {
        stopPromise = (async () => {
          await active.started

          if (scanner?.isScanning) {
            await scanner.stop()
          }

          if (document.getElementById(readerId)) {
            scanner?.clear()
          }
        })().catch(() => {
          document
            .getElementById(readerId)
            ?.querySelectorAll('video')
            .forEach(video => {
              video.srcObject
                ?.getTracks()
                .forEach(track => track.stop())
            })
        })
      }

      return stopPromise
    }

    active.started = (async () => {
      try {
        if (
          !window.isSecureContext ||
          !navigator.mediaDevices?.getUserMedia
        ) {
          throw new Error(
            'Camera requires HTTPS or localhost ' +
              'and a supported browser.'
          )
        }

        const {
          Html5Qrcode,
          Html5QrcodeSupportedFormats,
        } = await import('html5-qrcode')

        if (active.cancelled) return

        scanner = new Html5Qrcode(
          readerId,
          {
            formatsToSupport: [
              Html5QrcodeSupportedFormats.QR_CODE,
            ],
            verbose: false,
          }
        )

        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10 },
          raw => {
            if (
              active.cancelled ||
              cooldown.current
            ) {
              return
            }

            // Prevent simultaneous scan requests.
            cooldown.current = true

            void (async () => {
              try {
                // Wait for Supabase to validate
                // and save the check-in.
                const result = await checkIn(
                  raw,
                  eventId
                )

                if (!active.cancelled) {
                  setFeedback(result)
                }
              } catch (error) {
                if (!active.cancelled) {
                  setFeedback({
                    type: 'error',
                    message:
                      error?.message ||
                      'QR check-in failed.',
                  })
                }
              } finally {
                clearTimeout(timer.current)

                timer.current = setTimeout(() => {
                  cooldown.current = false

                  if (!active.cancelled) {
                    setFeedback(null)
                  }
                }, 2500)
              }
            })()
          },
          () => {
            // Ignore ordinary frames
            // without a readable QR code.
          }
        )

        if (!active.cancelled) {
          setPhase('running')
        }
      } catch (error) {
        if (!active.cancelled) {
          setCameraError(
            'Unable to start camera. ' +
              'Allow camera permission, ' +
              'check that a camera is connected ' +
              'and not in use, then retry. ' +
              (error?.message || String(error))
          )

          setPhase('idle')
          session.current = null
        }
      }
    })()

    await active.started

    if (active.cancelled) {
      await active.finish()
    }
  }

  async function stop() {
    const active = session.current

    if (!active) return

    active.cancelled = true
    setPhase('stopping')

    await active.finish()

    session.current = null

    clearTimeout(timer.current)
    cooldown.current = false

    setFeedback(null)
    setPhase('idle')
  }

  const rows = attendanceList
    .filter(row => row.eventId === eventId)
    .sort(
      (a, b) =>
        new Date(b.attendedAt) -
        new Date(a.attendedAt)
    )

  const lastCheckIn = rows[0]

  const cameraLabel = {
    idle: 'Camera off',
    starting: 'Requesting camera access',
    running: 'Camera active',
    stopping: 'Stopping camera',
  }[phase]

  return (
    <>
      <div className={styles.columns}>
        <section
          className={styles.card}
          aria-labelledby="scanner-heading"
        >
          <div className={styles.sectionHeading}>
            <h2 id="scanner-heading">
              QR Scanner
            </h2>

            <p>
              Position the student's QR ticket
              inside the frame.
            </p>
          </div>

          <div className={styles.cameraFrame}>
            <div
              id={readerId}
              className={styles.viewport}
              aria-label="QR camera viewport"
            />

            {phase !== 'running' && (
              <div className={styles.placeholder}>
                <ScanLine
                  size={40}
                  aria-hidden="true"
                />

                <strong>
                  {phase === 'idle'
                    ? 'Camera is off'
                    : cameraLabel}
                </strong>

                <span>
                  {phase === 'idle'
                    ? 'Start the camera to scan a ticket'
                    : 'Please wait...'}
                </span>
              </div>
            )}

            {phase === 'running' && (
              <div
                className={styles.guide}
                aria-hidden="true"
              >
                <i />
                <i />
                <i />
                <i />
              </div>
            )}
          </div>

          <div className={styles.actions}>
            <Button
              onClick={start}
              disabled={phase !== 'idle'}
            >
              <Camera
                size={18}
                aria-hidden="true"
              />

              {phase === 'starting'
                ? 'Requesting camera...'
                : 'Start Camera'}
            </Button>

            <Button
              variant="secondary"
              onClick={stop}
              disabled={phase !== 'running'}
            >
              <CameraOff
                size={18}
                aria-hidden="true"
              />

              Stop Camera
            </Button>
          </div>

          <p
            role="status"
            className={[
              styles.cameraState,
              phase === 'running'
                ? styles.active
                : '',
            ].join(' ')}
          >
            <span
              className={styles.dot}
              aria-hidden="true"
            />

            {cameraLabel}
          </p>

          {cameraError && (
            <p
              role="alert"
              className={styles.error}
            >
              {cameraError}
            </p>
          )}
        </section>

        <section
          className={styles.card}
          aria-labelledby="status-heading"
        >
          <h2 id="status-heading">
            Check-in Status
          </h2>

          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className={[
              styles.feedback,
              feedback
                ? styles[feedback.type]
                : styles.ready,
            ].join(' ')}
          >
            {feedback ? (
              <>
                {feedback.type === 'success' ? (
                  <CircleCheck
                    size={22}
                    aria-hidden="true"
                  />
                ) : (
                  <TriangleAlert
                    size={22}
                    aria-hidden="true"
                  />
                )}

                <strong>
                  {feedback.type === 'success'
                    ? 'Check-in successful'
                    : feedback.message}
                </strong>

                {feedback.booking && (
                  <>
                    <p>
                      {feedback.booking.studentName}
                      {' ('}
                      {feedback.booking.studentId}
                      {')'}
                    </p>

                    <p>
                      {formatDate(
                        feedback.booking.attendedAt
                      )}
                    </p>
                  </>
                )}
              </>
            ) : (
              <>
                <ScanLine
                  size={22}
                  aria-hidden="true"
                />

                <strong>
                  {phase === 'running'
                    ? 'Scanner ready'
                    : cameraLabel}
                </strong>

                <p>
                  {phase === 'running'
                    ? 'Waiting for the next ticket'
                    : 'Start the camera to begin check-in.'}
                </p>
              </>
            )}
          </div>

          <dl className={styles.details}>
            <div>
              <dt>Event</dt>
              <dd>{eventTitle}</dd>
            </div>

            <div>
              <dt>Checked in</dt>

              <dd className={styles.count}>
                {rows.length}

                <span>
                  {' '}
                  student
                  {rows.length === 1 ? '' : 's'}
                </span>
              </dd>
            </div>

            <div>
              <dt>Last check-in</dt>

              <dd>
                {lastCheckIn ? (
                  <>
                    <strong>
                      {lastCheckIn.studentName}
                    </strong>

                    <span>
                      {lastCheckIn.studentId}
                    </span>

                    <time
                      dateTime={
                        lastCheckIn.attendedAt
                      }
                    >
                      {formatDate(
                        lastCheckIn.attendedAt
                      )}
                    </time>
                  </>
                ) : (
                  'No ticket scanned yet'
                )}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <section
        className={styles.card}
        aria-labelledby="recent-heading"
      >
        <div className={styles.recentHeader}>
          <h2 id="recent-heading">
            Recent Check-ins
          </h2>

          <span className={styles.badge}>
            {rows.length} checked in
          </span>
        </div>

        {rows.length ? (
          <ul className={styles.list}>
            {rows.map(row => (
              <li key={row.id}>
                <span
                  className={styles.avatar}
                  aria-hidden="true"
                >
                  {row.studentName
                    .trim()
                    .split(/\s+/)
                    .map(part => part[0])
                    .slice(0, 2)
                    .join('')}
                </span>

                <div className={styles.student}>
                  <strong>
                    {row.studentName}
                  </strong>

                  <span>
                    {row.studentId}
                  </span>
                </div>

                <div className={styles.scanInfo}>
                  <span className={styles.checked}>
                    <CircleCheck
                      size={15}
                      aria-hidden="true"
                    />
                    Checked in
                  </span>

                  <time dateTime={row.attendedAt}>
                    {formatDate(row.attendedAt)}
                  </time>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.empty}>
            No check-ins yet. Scanned student
            tickets will appear here.
          </p>
        )}

        <Link
          className={styles.recordsLink}
          to={
            '/organizer/events/' +
            eventId +
            '/attendance'
          }
        >
          View Attendance Records

          <ArrowRight
            size={16}
            aria-hidden="true"
          />
        </Link>
      </section>
    </>
  )
}
