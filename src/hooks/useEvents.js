import { useContext } from 'react'
import { EventsContext } from '../context/eventsContext'
export default function useEvents() {
  const context = useContext(EventsContext)
  if (!context) throw new Error('useEvents must be inside EventsProvider')
  return context
}
