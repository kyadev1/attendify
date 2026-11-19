import EventDataFeedback from '../../../components/EventDataFeedback/EventDataFeedback'
import { eventRequestError } from '../../../utils/eventRequestError'
import mediaStyles from '../../../styles/EventMedia.module.css'
import { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarDays, Clock, MapPin, Pencil, ScanLine, Users, Download, CircleCheck, Ticket, Trash2 } from 'lucide-react'
import useAuth from '../../../hooks/useAuth'
import useEvents from '../../../hooks/useEvents'
import Button from '../../../components/Button/Button'
import community from '../../../assets/Community.jpg'
import technology from '../../../assets/Technology.jpg'
import career from '../../../assets/Career.jpg'
import arts from '../../../assets/Arts.jpg'
import styles from '../styles/EventManagement.module.css'

const images = { Community: community, Technology: technology, Careers: career, Arts: arts }
const format = (value, options) => new Intl.DateTimeFormat('en-PH', { ...options, timeZone: 'Asia/Manila' }).format(new Date(value))
export default function EventManagement() {
  const { id } = useParams()
  return <EventView key={id} id={id} />
}
function EventView({ id }) {
  const { user } = useAuth()
  const { events, registrations, deleteEvent, loading, error: loadError, hasLoaded, loadFailure, refreshEvents } = useEvents()
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const deleteInFlight = useRef(false)
  const event = events.find(e => e.id === id && e.organizerId === user.id)
  const feedback = <EventDataFeedback loading={loading} error={loadError} failure={loadFailure} onRetry={refreshEvents} initial={!hasLoaded} />
  if ((loading && (!hasLoaded || !event)) || (loadError && (!event || loadFailure?.kind === 'authorization'))) {
    return <section className={styles.page}><h1>Event Details</h1>{feedback}<Link to="/organizer/events">Back to My Events</Link></section>
  }
  if (!event && events.some(e => e.id === id)) return <section className={styles.page}><h1>Event access unavailable</h1><p role="alert">This event is not available for your account to manage.</p><Link to="/organizer/events">Back to My Events</Link></section>
  if (!event) return <section className={styles.page}><h1>Event not found</h1><p>This event does not exist or is not available to your account.</p><Link to="/organizer/events">Back to My Events</Link></section>
  const rows = registrations.filter(r => r.eventId === id)
  const registered = rows.length
  const attended = rows.filter(r => r.attendedAt).length
  const capacity = Number.isFinite(event.slots) ? Math.max(0, event.slots) : 0
  const available = Math.max(0, capacity - registered)
  const startDate = format(event.startsAt, { dateStyle: 'medium' })
  const endDate = format(event.endsAt, { dateStyle: 'medium' })
  const date = startDate === endDate ? startDate : startDate + ' ? ' + endDate
  const time = format(event.startsAt, { timeStyle: 'short' }) + ' ? ' + format(event.endsAt, { timeStyle: 'short' })
  const status = event.status === 'published' ? 'Published' : event.status === 'draft' ? 'Draft' : event.status
  async function remove() {
    if (deleteInFlight.current) return
    deleteInFlight.current = true
    setDeleting(true)
    setError('')
    try {
      await deleteEvent(id)
      navigate('/organizer/events', { replace: true })
    } catch (failure) {
      setError(eventRequestError(failure, 'delete').message)
    } finally {
      deleteInFlight.current = false
      setDeleting(false)
    }
  }
  return <div className={styles.page}>
    {feedback}
    <Link className={styles.back} to="/organizer/events"><ArrowLeft size={17} aria-hidden="true" />Back to My Events</Link>
    <section className={styles.hero}>{images[event.category] ? <div className={[mediaStyles.media, mediaStyles.detailMedia].join(' ')}><img className={mediaStyles.framedArtwork} src={images[event.category]} alt="" /></div> : <div className={styles.placeholder}><CalendarDays size={42} aria-hidden="true" /></div>}<div className={styles.heroBody}><span className={event.status === 'published' ? styles.published : styles.draft}>{status}</span><h1>{event.title}</h1><p className={styles.description}>{event.description}</p><div className={styles.meta}><span><CalendarDays size={17} aria-hidden="true" />{date}</span><span><Clock size={17} aria-hidden="true" />{time}</span><span><MapPin size={17} aria-hidden="true" />{event.location}</span></div></div></section>
    <dl className={styles.stats}>{[[Users, 'Registered', registered], [CircleCheck, 'Attended', attended], [Ticket, 'Available Slots', available], [CalendarDays, 'Capacity', capacity]].map(([Icon, label, value]) => <div key={label}><dt><Icon size={18} aria-hidden="true" />{label}</dt><dd>{value}</dd></div>)}</dl>
    <div className={styles.columns}><section className={styles.panel}><h2>Event Information</h2><dl className={styles.facts}>{[['Date', date], ['Time', time + ' (Manila)'], ['Location', event.location], ['Category', event.category], ['Status', status], ['Capacity', capacity]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section><section className={styles.panel}><h2>Quick Actions</h2><div className={styles.quickActions}>{[[Pencil, 'Edit Event', 'edit'], [ScanLine, 'Open QR Scanner', 'scan'], [Users, 'Attendance Records', 'attendance'], [Download, 'Export Attendance Report', 'reports']].map(([Icon, label, route]) => <Link key={route} to={'/organizer/events/' + id + '/' + route}><Icon size={18} aria-hidden="true" />{label}</Link>)}</div></section></div>
    <section className={styles.panel}><h2>Attendance Overview</h2><dl className={styles.attendance}>{[['Registered students', registered], ['Attended students', attended], ['Not Checked In', registered - attended]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p className={styles.description}>{attended} of {registered} checked in</p><progress className={styles.progress} value={attended} max={registered || 1} aria-label={attended + ' of ' + registered + ' checked in'} /></section>
    <section className={styles.panel}><h2>Danger Zone</h2>{registered > 0 && <p id="delete-restriction" className={styles.description}>This event cannot be deleted while it has registrations.</p>}<div><Button variant="danger" disabled={registered > 0 || deleting} aria-describedby={registered > 0 ? 'delete-restriction' : undefined} onClick={() => { setError(''); setConfirming(true) }}><Trash2 size={16} aria-hidden="true" />Delete Event</Button></div>{confirming && <div className={styles.confirm} aria-busy={deleting}><p>Delete this event?</p><div><Button variant="danger" disabled={deleting} onClick={remove}>{deleting ? 'Deleting...' : 'Confirm Delete'}</Button><Button variant="secondary" disabled={deleting} onClick={() => { setConfirming(false); setError('') }}>Cancel</Button></div></div>}{error && <p role="alert">{error}</p>}</section>
  </div>
}
