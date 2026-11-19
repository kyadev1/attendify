import { useRef, useState } from 'react'
import useAuth from '../../hooks/useAuth'
import { eventRequestError } from '../../utils/eventRequestError'
import Button from '../Button/Button'
import styles from './EventDataFeedback.module.css'

export default function EventDataFeedback({ loading, error, failure, onRetry, initial = false }) {
  const { sessionGeneration, isSessionCurrent } = useAuth()
  const inFlight = useRef(null)
  const [retry, setRetry] = useState(null)
  const current = retry?.generation === sessionGeneration ? retry : null
  const pending = loading || current?.pending
  const problem = current?.failure || (error ? failure || eventRequestError(error) : null)

  async function retryLoad() {
    if (!isSessionCurrent(sessionGeneration) || loading || inFlight.current?.generation === sessionGeneration) return
    const operation = { generation: sessionGeneration }
    inFlight.current = operation
    setRetry({ generation: sessionGeneration, pending: true })
    try {
      await onRetry()
      if (isSessionCurrent(sessionGeneration)) setRetry(null)
    } catch (failure) {
      if (isSessionCurrent(sessionGeneration)) {
        setRetry({ generation: sessionGeneration, failure: eventRequestError(failure) })
      }
    } finally {
      if (inFlight.current === operation) inFlight.current = null
    }
  }

  if (!problem && !pending) return null
  return <div className={styles.feedback}>
    {problem && <p role="alert">{!initial && problem.kind !== 'authorization' && 'Event information may be out of date. '}{problem.message}</p>}
    {pending && <p role="status">{initial ? 'Loading events...' : 'Refreshing events...'}</p>}
    {problem?.retryable && <Button variant="secondary" disabled={Boolean(pending)} onClick={retryLoad}>{pending ? 'Retrying...' : 'Try again'}</Button>}
  </div>
}
