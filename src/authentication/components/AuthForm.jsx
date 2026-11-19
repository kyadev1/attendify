
import { useRef, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import useAuth from '../../hooks/useAuth'
import Button from '../../components/Button/Button'
import AuthLayout from './AuthLayout'
import RegistrationSuccessModal from './RegistrationSuccessModal'
import styles from '../styles/AuthForm.module.css'

export default function AuthForm({
  mode = 'login',
  role = 'student',
}) {
  const { user, loading, login, register } = useAuth()
  const { state } = useLocation()

  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [registrationSuccess, setRegistrationSuccess] = useState(null)

  const errorRef = useRef(null)
  const submissionPending = useRef(false)

  const isRegister = mode === 'register'
  const isOrganizer = role === 'organizer'

  if (loading) {
    return <p role="status">Checking your session...</p>
  }

  // Keep the registration success modal visible
  // even if Supabase automatically signs in the user.
  if (user && !submitting && registrationSuccess === null) {
    const home =
      user.role === 'organizer'
        ? '/organizer'
        : '/dashboard'

    const from =
      typeof state?.from === 'string'
        ? state.from
        : ''

    const allowed =
      user.role === 'organizer'
        ? /^\/organizer(?:\/events(?:\/[^?#]*)?)?$/.test(from)
        : /^\/(?:dashboard|browse|bookings|profile|events\/[^/?#]+|ticket\/[^/?#]+)$/.test(from)

    return (
      <Navigate
        to={!isRegister && allowed ? from : home}
        replace
      />
    )
  }

  async function handleSubmit(event) {
    event.preventDefault()

    if (submissionPending.current || submitting || registrationSuccess !== null) {
      return
    }

    submissionPending.current = true
    setError('')
    setSubmitting(true)

    const values = Object.fromEntries(
      new FormData(event.currentTarget)
    )

    try {
      if (isRegister) {
        if (values.password !== values.confirmPassword) {
          throw new Error('Passwords do not match.')
        }

        // Public registration currently creates
        // student accounts only.
        const result = await register(values)

        setRegistrationSuccess({
          requiresConfirmation: result.requiresConfirmation,
        })
      } else {
        await login({
          ...values,
          role,
        })
      }
    } catch (failure) {
      setError(
        failure.message || 'Something went wrong.'
      )

      requestAnimationFrame(() => {
        errorRef.current?.focus()
      })
    } finally {
      submissionPending.current = false
      setSubmitting(false)
    }
  }

  const title = isRegister
    ? 'Create Student Account'
    : isOrganizer
      ? 'Organizer Login'
      : 'Student Login'

  const subtitle = isRegister
    ? 'Create your Attendify student account.'
    : isOrganizer
      ? 'Sign in to manage events and attendance.'
      : 'Sign in to access your Attendify account.'

  return (
    <>
      <AuthLayout
        title={title}
        subtitle={subtitle}
      >
        <form
          className={styles.form}
          onSubmit={handleSubmit}
        >
          {error && (
            <p
              ref={errorRef}
              tabIndex={-1}
              role="alert"
              className={styles.error}
            >
              {error}
            </p>
          )}

          {isRegister && (
            <div className={styles.field}>
              <label htmlFor="name">
                Full Name
              </label>

              <input
                id="name"
                name="name"
                autoComplete="name"
                required
                maxLength={100}
                disabled={submitting}
              />
            </div>
          )}

          <div className={styles.field}>
            <label htmlFor="email">
              Email Address
            </label>

            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              disabled={submitting}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="password">
              Password
            </label>

            <input
              id="password"
              name="password"
              type={
                showPassword
                  ? 'text'
                  : 'password'
              }
              autoComplete={
                isRegister
                  ? 'new-password'
                  : 'current-password'
              }
              minLength={
                isRegister ? 8 : undefined
              }
              required
              disabled={submitting}
              aria-describedby={
                isRegister
                  ? 'password-hint'
                  : undefined
              }
            />

            {isRegister && (
              <small id="password-hint">
                Use at least 8 characters.
              </small>
            )}
          </div>

          {isRegister && (
            <div className={styles.field}>
              <label htmlFor="confirm-password">
                Confirm Password
              </label>

              <input
                id="confirm-password"
                name="confirmPassword"
                type={
                  showPassword
                    ? 'text'
                    : 'password'
                }
                autoComplete="new-password"
                required
                disabled={submitting}
              />
            </div>
          )}

          <label className={styles.checkbox}>
            <input
              type="checkbox"
              checked={showPassword}
              onChange={event => {
                setShowPassword(
                  event.target.checked
                )
              }}
            />

            Show password{isRegister ? 's' : ''}
          </label>

          <Button
            type="submit"
            className={styles.submit}
            disabled={submitting}
          >
            {submitting
              ? 'Please wait...'
              : isRegister
                ? 'Create Account'
                : 'Log In'}
          </Button>
        </form>

        <div className={styles.links}>
          {isRegister ? (
            <Link to="/login">
              Already have an account? Log in
            </Link>
          ) : (
            <>
              {isOrganizer ? (
                <p>
                  Need an organizer account?
                  {' '}
                  Contact your system administrator.
                </p>
              ) : (
                <Link to="/register">
                  Create an Account
                </Link>
              )}

              <Link
                to={
                  isOrganizer
                    ? '/login'
                    : '/organizer/login'
                }
              >
                Switch to{' '}
                {isOrganizer
                  ? 'Student'
                  : 'Organizer'}{' '}
                Login
              </Link>
            </>
          )}
        </div>
      </AuthLayout>

      <RegistrationSuccessModal
        open={registrationSuccess !== null}
        requiresConfirmation={
          registrationSuccess?.requiresConfirmation ?? true
        }
      />
    </>
  )
}
