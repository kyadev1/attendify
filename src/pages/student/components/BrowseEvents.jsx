import EventDataFeedback from '../../../components/EventDataFeedback/EventDataFeedback'
import useEventClock from '../../../hooks/useEventClock'
import { eventPhase } from '../../../utils/eventTime'
import mediaStyles from '../../../styles/EventMedia.module.css'
import { useRef, useState } from 'react'
import EventRegistration from './EventRegistration'
import useEvents from '../../../hooks/useEvents'
import { X, Search, ArrowRight, CalendarDays, Clock, MapPin, GraduationCap, Users, Laptop, Palette, Briefcase, Trophy, Ticket } from 'lucide-react'
import Button from '../../../components/Button/Button'
import styles from '../styles/BrowseEvents.module.css'
import communityImage from '../../../assets/Community.jpg'
import technologyImage from '../../../assets/Technology.jpg'
import careerImage from '../../../assets/Career.jpg'
import artsImage from '../../../assets/Arts.jpg'

const categoryImages = { Community: communityImage, Technology: technologyImage, Careers: careerImage, Arts: artsImage }
const categoryIcons = { Academic: GraduationCap, Technology: Laptop, Arts: Palette, Cultural: Palette, Careers: Briefcase, Sports: Trophy, Community: Users, Leadership: Users, Seminars: GraduationCap }
const dateLabel = value => new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' }).format(new Date(value))
const timeLabel = value => new Intl.DateTimeFormat('en-PH', { timeStyle: 'short', timeZone: 'Asia/Manila' }).format(new Date(value))

export default function BrowseEvents() {
  const { events, loading, error, hasLoaded, loadFailure, refreshEvents } = useEvents()
  const now = useEventClock(events)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')
  const [selectedId, setSelectedId] = useState(null)
  const dialog = useRef(null)
  const opener = useRef(null)
  const available = events.filter(e => e.status === 'published' && ['upcoming', 'ongoing'].includes(eventPhase(e, now)))
  const categories = ['All', ...new Set(available.map(e => e.category))]
  const visible = available.filter(e => e.title.toLowerCase().includes(query.trim().toLowerCase()) && (category === 'All' || category === e.category))
  const selected = events.find(e => e.id === selectedId)
  function openEvent(event, target) {
    opener.current = target
    setSelectedId(event.id)
    dialog.current.showModal()
  }
  return <div className={styles.page}>
    <header className={styles.header}><h1>Browse Events</h1><p>Discover and register for upcoming campus events.</p></header>
    <div className={styles.toolbar}>
      <label className={styles.searchLabel}>Search events<span className={styles.searchField}><Search size={18} aria-hidden="true" /><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by event title..." /></span></label>
      <label className={styles.categoryLabel}>Category<select value={category} onChange={e => setCategory(e.target.value)}>{categories.map(c => <option key={c} value={c}>{c === 'All' ? 'All categories' : c}</option>)}</select></label>
    </div>
    <EventDataFeedback loading={loading} error={error} failure={loadFailure} onRetry={refreshEvents} initial={!hasLoaded} />
    {(!loading || hasLoaded) && !error && <p role="status" className={styles.resultCount}><strong>{visible.length}</strong> event{visible.length === 1 ? '' : 's'} found</p>}
    {!(loading && !hasLoaded) && loadFailure?.kind !== 'authorization' && (visible.length ? <ul className={styles.grid}>{visible.map(event => {
      const CoverIcon = categoryIcons[event.category] || CalendarDays
      const tone = ['Technology', 'Academic', 'Seminars'].includes(event.category) ? styles.infoCover : ['Arts', 'Cultural', 'Careers'].includes(event.category) ? styles.neutralCover : styles.mintCover
      const status = event.isRegistered ? 'Registered' : event.slotsRemaining ? event.slotsRemaining + ' slots available' : 'Full'
      return <li key={event.id}><article className={styles.card}>
        {categoryImages[event.category] ? <div className={mediaStyles.media}><img className={mediaStyles.framedArtwork} src={categoryImages[event.category]} alt="" loading="lazy" decoding="async" /></div> : <div className={[styles.cover, tone].join(' ')} aria-hidden="true"><CoverIcon size={40} strokeWidth={1.5} /><span className={styles.coverLabel}>{event.category}</span></div>}
        <div className={styles.cardBody}><span className={styles.category}>{event.category}</span><h2>{event.title}</h2>
          <div className={styles.metadata}><p><CalendarDays size={16} aria-hidden="true" /><time dateTime={event.startsAt}>{dateLabel(event.startsAt)}</time></p><p><Clock size={16} aria-hidden="true" />{timeLabel(event.startsAt)} (Manila)</p><p><MapPin size={16} aria-hidden="true" /><span>{event.location}</span></p></div>
          <p className={styles.description}>{event.description}</p>
          <div className={styles.cardFooter}><span className={[styles.badge, event.isRegistered ? styles.registered : event.slotsRemaining ? styles.available : styles.full].join(' ')}><Ticket size={14} aria-hidden="true" />{status}</span><button type="button" className={styles.detailsButton} aria-haspopup="dialog" aria-label={'View details for ' + event.title} onClick={e => openEvent(event, e.currentTarget)}>View details<ArrowRight size={17} aria-hidden="true" /></button></div>
        </div>
      </article></li>
    })}</ul> : !loading && !error ? <section className={styles.empty}><Search size={30} aria-hidden="true" /><h2>No matching events</h2><p>Try another title or category.</p><Button variant="secondary" onClick={() => { setQuery(''); setCategory('All') }}>Clear filters</Button></section> : null)}
    <dialog ref={dialog} className={styles.modal} aria-labelledby="event-title" onClose={() => opener.current?.focus()}>
      <div className={styles.modalHeader}><button type="button" className={styles.closeButton} aria-label="Close event details" onClick={() => dialog.current.close()}><X size={20} aria-hidden="true" /></button></div><div className={styles.modalBody}>{selected && <EventRegistration key={selected.id} eventId={selected.id} inModal />}</div>
    </dialog>
  </div>
}
