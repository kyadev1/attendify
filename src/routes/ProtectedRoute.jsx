
import {
  Navigate,
  Outlet,
  useLocation,
} from 'react-router-dom'

import useAuth from '../hooks/useAuth'

const ROLE_HOME = {
  student: '/dashboard',
  organizer: '/organizer',
}

const ROLE_LOGIN = {
  student: '/login',
  organizer: '/organizer/login',
}

export default function ProtectedRoute({ role }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <main
        role="status"
        aria-live="polite"
        style={{
          display: 'grid',
          placeItems: 'center',
          minHeight: '50vh',
          padding: '24px',
        }}
      >
        <p>Loading your account...</p>
      </main>
    )
  }

  if (!user) {
    return (
      <Navigate
        to={ROLE_LOGIN[role] || '/login'}
        state={{
          from: location.pathname,
        }}
        replace
      />
    )
  }

  if (!ROLE_HOME[user.role]) {
    return (
      <main
        role="alert"
        style={{
          padding: '32px',
          textAlign: 'center',
        }}
      >
        <h1>Account Access Unavailable</h1>

        <p>
          Your account does not have a valid
          Attendify role. Please contact
          the administrator.
        </p>
      </main>
    )
  }

  if (user.role !== role) {
    return (
      <Navigate
        to={ROLE_HOME[user.role]}
        replace
      />
    )
  }

  return <Outlet />
}
