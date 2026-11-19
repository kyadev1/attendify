
import { useNavigate } from 'react-router-dom'
import Modal from '../../components/Modal/components/Modal'
import styles from '../styles/RegistrationSuccessModal.module.css'

export default function RegistrationSuccessModal({
  open,
  requiresConfirmation = true,
}) {
  const navigate = useNavigate()

  if (!open) return null

  return <Modal
    dismissible={false}
    title="Registration Successful!"
    message={requiresConfirmation
      ? 'Your Attendify account has been created. Please check your email and verify your account before logging in.'
      : 'Your Attendify account has been created successfully. You can now access your dashboard.'}
    classNames={{ modal: styles.modal, icon: styles.iconWrapper, title: styles.title, message: styles.description, summary: styles.notice, actions: styles.actions }}
    icon={<svg viewBox="0 0 24 24" width="38" height="38" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>}
    actions={<button type="button" data-modal-focus className={styles.button} onClick={() => navigate(
      requiresConfirmation ? '/login' : '/dashboard', { replace: true }
    )}>{requiresConfirmation ? 'Go to Login' : 'Go to Dashboard'}</button>}
  >
    {requiresConfirmation && 'Please check your inbox or spam folder for the verification email.'}
  </Modal>
}
