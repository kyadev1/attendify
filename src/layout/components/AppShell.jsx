import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Navbar from '../../components/Navbar/components/Navbar'
import Sidebar from '../../components/Sidebar/components/Sidebar'
import useEvents from '../../hooks/useEvents'
import styles from '../styles/AppShell.module.css'

export default function AppShell({ role }) {
  const { syncError } = useEvents()
  const location = useLocation()
  const [openAt, setOpenAt] = useState(null)
  const toggleRef = useRef(null)
  const mainRef = useRef(null)
  const isOpen = openAt === location.key

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [location.pathname])

  function closeMenu(restoreFocus = false) {
    setOpenAt(null)
    if (restoreFocus) toggleRef.current?.focus()
  }

  function handleNavigate() {
    closeMenu()
    mainRef.current?.focus()
  }

  return (
    <div className={styles.shell} onKeyDown={(event) => {
      if (event.key === 'Escape' && isOpen) {
        event.preventDefault()
        closeMenu(true)
      }
    }}>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <Navbar role={role} isOpen={isOpen} toggleRef={toggleRef} onToggle={() => setOpenAt(isOpen ? null : location.key)} onNavigate={handleNavigate} />
      <div className={styles.body}>
        <Sidebar role={role} isOpen={isOpen} onNavigate={handleNavigate} />
        <main id="main-content" tabIndex={-1} ref={mainRef} className={styles.content}>
          <div className={styles.inner}>
            {syncError && <p className={styles.syncNotice} role="status">{syncError}</p>}
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
