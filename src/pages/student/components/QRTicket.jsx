import { useParams } from 'react-router-dom'
import DigitalTicket from './DigitalTicket'

export default function QRTicket() {
  const { regId } = useParams()
  return <DigitalTicket key={regId} />
}
