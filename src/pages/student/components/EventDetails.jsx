import { Link, useParams } from 'react-router-dom'
import EventRegistration from './EventRegistration'
import styles from '../styles/EventDetails.module.css'

export default function EventDetails() {
  const { id } = useParams()
  return <div className={styles.page}><Link to="/browse">Back to events</Link><EventRegistration key={id} eventId={id} /></div>
}
