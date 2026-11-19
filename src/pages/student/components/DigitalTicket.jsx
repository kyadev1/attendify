
import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  CircleCheck,
  CalendarDays,
  Clock,
  MapPin,
  UserRound,
  Download,
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'

import attendifyLogo from '../../../assets/ttendify-logo-optimized.png'
import useAuth from '../../../hooks/useAuth'
import useEvents from '../../../hooks/useEvents'
import Button from '../../../components/Button/Button'
import { formatDate } from '../../../utils/dashboardData'
import {
  ticketPayload,
  ticketReference,
} from '../../../utils/ticketData'
import styles from '../styles/DigitalTicket.module.css'

const formatManila = (value, options) =>
  new Intl.DateTimeFormat('en-PH', {
    ...options,
    timeZone: 'Asia/Manila',
  }).format(new Date(value))

export default function DigitalTicket() {
  const { regId } = useParams()
  const { user } = useAuth()

  const {
    events,
    registrations,
    loading,
    error,
  } = useEvents()

  const qrRef = useRef(null)

  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  // Find the registration belonging to this student.
  const booking = registrations.find(
    row =>
      row.id === regId &&
      row.studentId === user?.id &&
      row.status === 'registered'
  )

  // Find the event associated with the booking.
  const event = events.find(
    item => item.id === booking?.eventId
  )

  // Wait for Supabase data before checking the ticket.
  if (loading) {
    return (
      <section className={styles.page}>
        <h1>Digital Ticket</h1>
        <p role="status">Loading your ticket...</p>
      </section>
    )
  }

  if (error) {
    return (
      <section className={styles.page}>
        <h1>Unable to Load Ticket</h1>

        <p role="alert">{error}</p>

        <Link to="/bookings">
          Back to My Bookings
        </Link>
      </section>
    )
  }

  if (!booking || !event) {
    return (
      <section className={styles.page}>
        <h1>Ticket Not Found</h1>

        <p>
          This ticket is unavailable or does not
          belong to your account.
        </p>

        <Link to="/bookings">
          Back to My Bookings
        </Link>
      </section>
    )
  }

  const reference = ticketReference(booking.id)

  const status = booking.attendedAt
    ? 'Scanned / Checked-In'
    : 'Registered Ticket'

  const studentName =
    booking.studentName ||
    user?.name ||
    user?.full_name ||
    'Student'

  const studentId = booking.studentId

  const eventDate = formatManila(
    event.startsAt,
    { dateStyle: 'medium' }
  )

  const eventTime = formatManila(
    event.startsAt,
    { timeStyle: 'short' }
  )

  async function download() {
    if (saving) return

    setSaving(true)
    setMessage('')

    let imageUrl
    let fileUrl

    try {
      const svg = qrRef.current?.querySelector('svg')

      if (!svg) {
        throw new Error('QR code is not available.')
      }

      // Convert QR SVG into an image.
      const serialized = new XMLSerializer()
        .serializeToString(svg)

      const svgBlob = new Blob(
        [serialized],
        { type: 'image/svg+xml;charset=utf-8' }
      )

      imageUrl = URL.createObjectURL(svgBlob)

      const image = new Image()

      await new Promise((resolve, reject) => {
        image.onload = resolve
        image.onerror = reject
        image.src = imageUrl
      })

      // Create downloadable ticket canvas.
      const canvas = document.createElement('canvas')

      canvas.width = 1000
      canvas.height = 1600

      const context = canvas.getContext('2d')

      if (!context) {
        throw new Error('Canvas is unavailable.')
      }

      context.fillStyle = '#ffffff'
      context.fillRect(
        0,
        0,
        canvas.width,
        canvas.height
      )

      context.fillStyle = '#000000'
      context.textBaseline = 'top'

      let y = 60

      // Wrap long text within ticket width.
      function line(text, size = 26) {
        context.font = `${size}px sans-serif`

        let row = ''

        for (const character of String(text)) {
          if (
            row &&
            context.measureText(
              row + character
            ).width > 880
          ) {
            context.fillText(row, 60, y)
            y += size + 14
            row = ''
          }

          row += character
        }

        if (row) {
          context.fillText(row, 60, y)
          y += size + 20
        }
      }

      // Ticket information.
      line('Attendify - Digital Ticket', 36)

      y += 20

      line(event.title, 32)

      y += 10

      line(`Date: ${eventDate}`)
      line(`Time: ${eventTime} (Manila)`)
      line(`Venue: ${event.location || event.venue}`)

      y += 15

      line(`Student: ${studentName}`)
      line(`Student ID: ${studentId}`)

      y += 15

      line(`Reference: ${reference}`, 22)
      line(`Status: ${status}`, 24)

      y += 25

      // Draw QR code.
      context.drawImage(
        image,
        200,
        y,
        600,
        600
      )

      y += 640

      line(
        'Present this QR code at the event entrance.',
        22
      )

      // Export PNG.
      const blob = await new Promise(resolve => {
        canvas.toBlob(resolve, 'image/png')
      })

      if (!blob) {
        throw new Error('Ticket export failed.')
      }

      fileUrl = URL.createObjectURL(blob)

      const link = document.createElement('a')

      link.href = fileUrl
      link.download = `${reference}.png`

      document.body.appendChild(link)
      link.click()
      link.remove()

      setMessage(
        'Ticket downloaded successfully.'
      )
    } catch (failure) {
      console.error(
        'Ticket download error:',
        failure
      )

      setMessage(
        'Could not download your ticket. Please try again.'
      )
    } finally {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl)
      }

      if (fileUrl) {
        setTimeout(() => {
          URL.revokeObjectURL(fileUrl)
        }, 10000)
      }

      setSaving(false)
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <h1>Digital Ticket</h1>

        <p>
          Present this QR code at the event entrance.
        </p>
      </header>

      <article
        className={styles.ticket}
        aria-labelledby="ticket-event"
      >
        <div className={styles.upper}>
          <header className={styles.header}>
            <img
              className={styles.logo}
              src={attendifyLogo}
              alt="Attendify"
              width="256"
              height="256"
            />

            <span className={styles.badge}>
              <CircleCheck
                size={16}
                aria-hidden="true"
              />
              {status}
            </span>
          </header>

          <h2 id="ticket-event">
            {event.title}
          </h2>

          <div className={styles.metadata}>
            <p>
              <CalendarDays
                size={17}
                aria-hidden="true"
              />

              <time dateTime={event.startsAt}>
                {eventDate}
              </time>
            </p>

            <p>
              <Clock
                size={17}
                aria-hidden="true"
              />

              {eventTime} (Manila)
            </p>

            <p>
              <MapPin
                size={17}
                aria-hidden="true"
              />

              <span>
                {event.location || event.venue}
              </span>
            </p>
          </div>

          <section
            className={styles.scanSection}
            aria-label="Attendance QR code"
          >
            <div
              className={styles.qr}
              ref={qrRef}
            >
              <QRCodeSVG
                value={ticketPayload(booking)}
                size={320}
                level="M"
                marginSize={4}
                bgColor="#FFFFFF"
                fgColor="#000000"
                title={`QR ticket ${reference}`}
              />
            </div>

            <h3>Scan for attendance</h3>

            <p>
              Present this QR code to the event
              organizer.
            </p>

            <div className={styles.reference}>
              <span>Ticket Reference</span>

              <strong>{reference}</strong>
            </div>
          </section>
        </div>

        <section
          className={styles.holder}
          aria-labelledby="holder-title"
        >
          <span className={styles.holderIcon}>
            <UserRound
              size={22}
              aria-hidden="true"
            />
          </span>

          <div>
            <h3 id="holder-title">
              Ticket Holder
            </h3>

            <p className={styles.name}>
              {studentName}
            </p>

            <p className={styles.studentId}>
              Student ID: {studentId}
            </p>

            {booking.attendedAt && (
              <p className={styles.checkedIn}>
                Checked in:{' '}
                {formatDate(booking.attendedAt)}
              </p>
            )}
          </div>
        </section>
      </article>

      <div className={styles.actions}>
        <Button
          className={styles.download}
          disabled={saving}
          onClick={download}
        >
          <Download
            size={18}
            aria-hidden="true"
          />

          {saving
            ? 'Preparing ticket...'
            : 'Download Ticket (PNG)'}
        </Button>

        <Link
          className={styles.secondary}
          to="/bookings"
        >
          My Bookings
        </Link>
      </div>

      <p
        className={styles.message}
        role="status"
      >
        {message}
      </p>
    </div>
  )
}
