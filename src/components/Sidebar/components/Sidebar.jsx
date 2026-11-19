import { useRef, useState } from 'react'
import { LogOut, LayoutDashboard, CalendarDays, CalendarPlus, Search, TicketCheck, UserRound } from 'lucide-react'
import Modal from '../../Modal/components/Modal'
import Button from '../../Button/Button'
import useAuth from '../../../hooks/useAuth'
import attendifyLogo from '../../../assets/ttendify-logo-optimized.png'
import { Link, useLocation } from 'react-router-dom'
import styles from '../styles/Sidebar.module.css'

const navigation = {
  student: [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, matches: p => p === '/dashboard' },
    { to: '/browse', label: 'Browse Events', icon: Search, matches: p => p === '/browse' || p.startsWith('/events/') },
    { to: '/bookings', label: 'My Bookings', icon: TicketCheck, matches: p => p === '/bookings' || p.startsWith('/ticket/') },
    { to: '/profile', label: 'Profile', icon: UserRound, matches: p => p === '/profile' },
  ],
  organizer: [
    { to: '/organizer', label: 'Dashboard', icon: LayoutDashboard, matches: p => p === '/organizer' },
    { to: '/organizer/events', label: 'My Events', icon: CalendarDays, matches: p => p === '/organizer/events' || (p.startsWith('/organizer/events/') && p !== '/organizer/events/new') },
    { to: '/organizer/events/new', label: 'Create Event', icon: CalendarPlus, matches: p => p === '/organizer/events/new' },
  ],
}

export default function Sidebar({ role, isOpen, onNavigate }) {
  const { logout } = useAuth()
  const [confirmLogout, setConfirmLogout] = useState(false)
  const logoutRef = useRef(null)
  const logoutInFlight = useRef(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState('')
  function closeLogout() {
    if (logoutInFlight.current) return
    setConfirmLogout(false)
    setLogoutError('')
  }
  async function confirmSignOut() {
    if (logoutInFlight.current) return
    logoutInFlight.current = true
    setLoggingOut(true)
    setLogoutError('')
    try {
      await logout()
      setConfirmLogout(false)
    } catch (failure) {
      setLogoutError(failure?.message || 'Unable to log out. Please try again.')
    } finally {
      logoutInFlight.current = false
      setLoggingOut(false)
    }
  }
  const { pathname } = useLocation()
  const currentPath = pathname.replace(/\/+$/, '') || '/'
  return (
    <aside id="role-navigation" className={[styles.sidebar, isOpen ? styles.open : ''].join(' ')}>
      <div className={styles.top}>
      <Link className={styles.brand} to={role === 'organizer' ? '/organizer' : '/dashboard'} onClick={onNavigate}><img className={styles.logo} src={attendifyLogo} alt="Attendify" width="256" height="256" /></Link>
      <p className={styles.label}>{role} workspace</p>
      <nav className={styles.links} aria-label={role === 'student' ? 'Student navigation' : 'Organizer navigation'}>
        {navigation[role].map(({ to, label, matches, icon: Icon }) => {
          const active = matches(currentPath)
          return <Link key={to} to={to} onClick={onNavigate} className={[styles.link, active ? styles.active : ''].join(' ')} aria-current={active ? (currentPath === to ? 'page' : 'location') : undefined}>{Icon && <Icon className={styles.navIcon} size={20} aria-hidden="true" />}<span>{label}</span></Link>
        })}
      </nav>
      </div>
      <footer className={styles.footer}><button type="button" className={styles.logout} ref={logoutRef} disabled={loggingOut} onClick={() => { setLogoutError(''); setConfirmLogout(true) }}><LogOut className={styles.navIcon} size={20} aria-hidden="true" /><span>Log Out</span></button></footer>
      {confirmLogout && <Modal title="Log out of Attendify?" message="Are you sure you want to log out of your account?" icon={<LogOut size={28} />} returnFocusRef={logoutRef} onClose={closeLogout} actions={<><Button variant="secondary" data-modal-focus disabled={loggingOut} onClick={closeLogout}>Cancel</Button><Button disabled={loggingOut} aria-busy={loggingOut} onClick={confirmSignOut}>{loggingOut ? 'Logging out...' : 'Log Out'}</Button></>}>{logoutError && <p role="alert">{logoutError}</p>}</Modal>}
    </aside>
  )
}
