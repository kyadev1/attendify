import useAuth from '../../../hooks/useAuth'
import RegistrationFormBuilder from './RegistrationFormBuilder'

export default function FormBuilderPrototype() {
  const { user, sessionGeneration } = useAuth()
  // Remount on account/role changes; never carry local draft/preview answers over.
  return <RegistrationFormBuilder key={`${sessionGeneration}:${user?.id}:${user?.role}`} />
}
