import EventDataFeedback from '../../../components/EventDataFeedback/EventDataFeedback'
import { eventRequestError } from '../../../utils/eventRequestError'
import mediaStyles from '../../../styles/EventMedia.module.css'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import useAuth from '../../../hooks/useAuth'
import useEvents from '../../../hooks/useEvents'
import Button from '../../../components/Button/Button'
import { Plus, CalendarDays, Clock3, MapPin, Users, Pencil, Trash2, Search } from 'lucide-react'
import communityImage from '../../../assets/Community.jpg'
import technologyImage from '../../../assets/Technology.jpg'
import careerImage from '../../../assets/Career.jpg'
import artsImage from '../../../assets/Arts.jpg'
import styles from '../styles/MyEvents.module.css'

const images = { Community: communityImage, Technology: technologyImage, Careers: careerImage, Arts: artsImage }
const format = (value, options) => new Intl.DateTimeFormat('en-PH', { ...options, timeZone: 'Asia/Manila' }).format(new Date(value))
export default function MyEvents() {
  const { user } = useAuth()
  const { events, deleteEvent, registrations, loading, error, hasLoaded, loadFailure, refreshEvents } = useEvents()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [pending, setPending] = useState(null)
  const [message, setMessage] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const deleteInFlight = useRef(false)
  const owned = events.filter(e => e.organizerId === user.id)
  async function remove(id) {
    if (deleteInFlight.current) return
    deleteInFlight.current = true
    setDeleting(true)
    setMessage('')
    setDeleteError('')
    try {
      await deleteEvent(id)
      setPending(null)
      setMessage('Event deleted successfully.')
    } catch (error) {
      setDeleteError(eventRequestError(error, 'delete').message)
    } finally {
      deleteInFlight.current = false
      setDeleting(false)
    }
  }
  const visible = owned.filter(e => e.title.toLowerCase().includes(query.trim().toLowerCase()) && (status === 'all' || e.status === status))
  return <section className={styles.management}>
    <header className={styles.header}><div><h1>My Events</h1><p>Create, manage, and monitor your campus events.</p></div><Link className={styles.create} to="/organizer/events/new"><Plus size={18} aria-hidden="true" />Create Event</Link></header>
    <EventDataFeedback loading={loading} error={error} failure={loadFailure} onRetry={refreshEvents} initial={!hasLoaded} />
    {(!loading || hasLoaded) && !error && <dl className={styles.summary}>{[['Total Events', owned.length], ['Published', owned.filter(e => e.status === 'published').length], ['Draft', owned.filter(e => e.status === 'draft').length]].map(([label, count]) => <div key={label}><dt>{label}</dt><dd>{count}</dd></div>)}</dl>}
    <div className={styles.toolbar}><label>Search events<span className={styles.search}><Search size={17} aria-hidden="true" /><input type="search" disabled={deleting} placeholder="Search events..." value={query} onChange={e => { setQuery(e.target.value); setPending(null) }} /></span></label><label>Status<select disabled={deleting} value={status} onChange={e => { setStatus(e.target.value); setPending(null) }}><option value="all">All Status</option><option value="published">Published</option><option value="draft">Draft</option></select></label></div>
    <p role="status" className={styles.message}>{message || (!loading && !error ? visible.length + ' events shown' : '')}</p>
    {!(loading && !hasLoaded) && loadFailure?.kind !== 'authorization' && (visible.length ? <ul className={styles.grid}>{visible.map(event => {
      const count = registrations.filter(r => r.eventId === event.id).length
      const capacity = Number.isFinite(event.slots) && event.slots > 0 ? event.slots : 0
      return <li key={event.id}><article className={styles.eventCard}>
        {images[event.category] ? <div className={mediaStyles.media}><img className={mediaStyles.framedArtwork} src={images[event.category]} alt="" loading="lazy" /></div> : <div className={styles.placeholder} aria-label="Event illustration"><CalendarDays size={36} aria-hidden="true" /></div>}
        <div className={styles.content}><span className={event.status === 'published' ? styles.published : styles.draft}><span className={styles.dot} aria-hidden="true" />{event.status === 'published' ? 'Published' : event.status === 'draft' ? 'Draft' : event.status}</span><h2><Link className={styles.cardLink} to={'/organizer/events/' + event.id}>{event.title}</Link></h2>
          <div className={styles.metadata}><p><CalendarDays size={16} aria-hidden="true" />{format(event.startsAt, { dateStyle: 'medium' })}</p><p><Clock3 size={16} aria-hidden="true" />{format(event.startsAt, { timeStyle: 'short' })} (Manila)</p><p><MapPin size={16} aria-hidden="true" />{event.location}</p></div>
          <div className={styles.capacity}><p><Users size={16} aria-hidden="true" />Registrations<strong>{count} / {capacity}</strong></p><progress value={Math.min(count, capacity)} max={capacity || 1} aria-label={count + ' of ' + capacity + ' registered'} /></div>
          <div className={styles.cardActions}><Link className={styles.edit} to={'/organizer/events/' + event.id + '/edit'}><Pencil size={16} aria-hidden="true" />Edit Event</Link><span className={styles.deleteWrap} tabIndex={count > 0 ? 0 : undefined} aria-label={count > 0 ? 'Cannot delete an event with registrations.' : undefined}><button type="button" className={styles.delete} disabled={count > 0 || deleting} aria-describedby={count > 0 ? 'delete-help-' + event.id : undefined} onClick={() => { setDeleteError(''); setPending(event.id) }}><Trash2 size={16} aria-hidden="true" />Delete</button>{count > 0 && <span id={'delete-help-' + event.id} className={styles.tooltip} role="tooltip">Cannot delete an event with registrations.</span>}</span></div>
          {pending === event.id && <div className={styles.confirmation} aria-busy={deleting}><p>Delete this event?</p>{deleteError && <p role="alert">{deleteError}</p>}<div className={styles.actions}><Button variant="danger" disabled={deleting} onClick={() => remove(event.id)}>{deleting ? 'Deleting...' : 'Confirm Delete'}</Button><Button variant="secondary" disabled={deleting} onClick={() => { setPending(null); setDeleteError('') }}>Cancel</Button></div></div>}
        </div>
      </article></li>
    })}</ul> : !loading && !error ? <div className={styles.empty}><CalendarDays size={28} aria-hidden="true" /><h2>{owned.length ? 'No matching events' : 'No events yet'}</h2><p>{owned.length ? 'Try another title or status filter.' : 'Create your first campus event to get started.'}</p>{owned.length > 0 && <Button variant="secondary" onClick={() => { setQuery(''); setStatus('all') }}>Clear filters</Button>}</div> : null)}
  </section>
}
