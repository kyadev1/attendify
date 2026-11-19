
import { Link } from 'react-router-dom'
import useAuth from '../../../hooks/useAuth'
import styles from '../styles/Navbar.module.css'

export default function Navbar({
  role,
  isOpen,
  onToggle,
  toggleRef,
  onNavigate,
}) {
  const { user } = useAuth()

  const displayName =
    user?.name?.trim() ||
    user?.full_name?.trim() ||
    user?.email ||
    (role === 'organizer' ? 'Organizer' : 'Student')

  return (
    <header className={styles.navbar}>
      <div className={styles.identity}>
        <button
          ref={toggleRef}
          type="button"
          className={styles.toggle}
          aria-expanded={isOpen}
          aria-controls="role-navigation"
          onClick={onToggle}
        >
          {isOpen ? 'Close menu' : 'Menu'}
        </button>

        <Link
          className={styles.brand}
          to={role === 'organizer' ? '/organizer' : '/dashboard'}
          onClick={onNavigate}
        >
          Attendify
        </Link>
      </div>

      <div className={styles.actions}>
        <span className={styles.role}>
          {displayName}
        </span>
      </div>
    </header>
  )
}
