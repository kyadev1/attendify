import EventDataFeedback from '../../../components/EventDataFeedback/EventDataFeedback'
import { Link, useParams } from 'react-router-dom'
import useAuth from '../../../hooks/useAuth'
import useEvents from '../../../hooks/useEvents'
import CreateEventForm from './CreateEventForm'

export default function CreateEditEvent() {
  const { id } = useParams()
  const { user, sessionGeneration } = useAuth()
  const { events, loading, error, hasLoaded, loadFailure, refreshEvents } = useEvents()
  const event = events.find(e => e.id === id && e.organizerId === user.id)
  const feedback = <EventDataFeedback loading={loading} error={error} failure={loadFailure} onRetry={refreshEvents} initial={!hasLoaded} />
  if (id && ((loading && (!hasLoaded || !event)) || (error && (!event || loadFailure?.kind === 'authorization')))) {
    return <section><h1>Edit Event</h1>{feedback}<Link to="/organizer/events">My Events</Link></section>
  }
  if (id && !event && events.some(e => e.id === id)) return <section><h1>Event access unavailable</h1><p role="alert">This event is not available for your account to manage.</p><Link to="/organizer/events">My Events</Link></section>
  if (id && !event) return <section><h1>Event not found</h1><p>This event does not exist or is not available to your account.</p><Link to="/organizer/events">My Events</Link></section>
  return <div>{feedback}<CreateEventForm key={sessionGeneration + ':' + (id || 'new')} event={event} /></div>
}
