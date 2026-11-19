
import { useCallback, useEffect, useRef, useState } from 'react'
import { AuthContext } from './authContext'
import { supabase } from '../services/supabase'

function formatUser(authUser, profile) {
  return {
    id: authUser.id,
    name: profile.full_name,
    email: authUser.email,
    role: profile.role,
  }
}

async function loadProfile(authUser) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('id', authUser.id)
    .single()

  if (error) throw error
  if (!data) throw new Error('User profile not found.')

  return formatUser(authUser, data)
}

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const requestId = useRef(0)
  const currentSession = useRef({ userId: null, generation: 0 })
  const [sessionGeneration, setSessionGeneration] = useState(0)

  // Change the generation synchronously at the auth boundary, before profile
  // loading or React rendering can let an old request publish its result.
  function trackSession(authUser) {
    const userId = authUser?.id || null
    if (currentSession.current.userId === userId) return
    const generation = currentSession.current.generation + 1
    currentSession.current = { userId, generation }
    setSessionGeneration(generation)
    setUser(null)
    setLoading(Boolean(userId))
  }

  const isSessionCurrent = useCallback(generation => (
    currentSession.current.generation === generation
  ), [])

  function finishSignOut(generation) {
    if (currentSession.current.userId && !isSessionCurrent(generation)) return
    trackSession(null)
    setUser(null)
  }

  useEffect(() => {
    let active = true

    async function restoreSession(session, id) {
      if (!active || id !== requestId.current) return
      try {
        const profile = session?.user
          ? await loadProfile(session.user)
          : null

        if (active && id === requestId.current) {
          setUser(profile)
        }
      } catch (error) {
        console.error('Session restoration failed:', error)
        if (active && id === requestId.current) {
          setUser(null)
        }
      } finally {
        if (active && id === requestId.current) {
          setLoading(false)
        }
      }
    }

    const { data: { subscription } } =
      supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'INITIAL_SESSION') return

        const id = ++requestId.current
        trackSession(session?.user)

        // Avoid calling other Supabase APIs directly
        // inside the auth state callback.
        setTimeout(() => {
          if (active) restoreSession(session, id)
        }, 0)
      })

    const id = ++requestId.current

    supabase.auth.getSession()
      .then(({ data, error }) => {
        if (error) throw error
        if (!active || id !== requestId.current) return
        trackSession(data.session?.user)
        return restoreSession(data.session, id)
      })
      .catch(error => {
        console.error('Unable to restore session:', error)
        if (active && id === requestId.current) {
          setUser(null)
          setLoading(false)
        }
      })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  async function login({ email, password, role }) {
    const startingGeneration = currentSession.current.generation
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (error) throw error
    if (currentSession.current.userId !== data.user.id) {
      if (!isSessionCurrent(startingGeneration)) throw new Error('Your session has changed. Please try again.')
      trackSession(data.user)
    }
    const generation = currentSession.current.generation
    // Explicit login owns profile readiness. Supersede initialization and the
    // SIGNED_IN listener's concurrent profile request, not the account guard.
    requestId.current += 1

    try {
      const profile = await loadProfile(data.user)
      if (!isSessionCurrent(generation)) throw new Error('Your session has changed. Please try again.')

      if (profile.role !== role) {
        throw new Error(
          `This account does not have ${role} access.`
        )
      }

      requestId.current += 1
      setUser(profile)
      setLoading(false)
      return profile
    } catch (error) {
      // A failed old login must never sign out a newer account.
      if (!isSessionCurrent(generation)) throw error
      requestId.current += 1
      await supabase.auth.signOut()
      finishSignOut(generation)
      if (!currentSession.current.userId || isSessionCurrent(generation)) setLoading(false)
      throw error
    }
  }

  async function register({ name, email, password }) {
    const fullName = name.trim().replace(/\s+/g, ' ')

    if (!fullName || fullName.length > 100) {
      throw new Error('Full name must be 1–100 characters.')
    }

    if (password.length < 8) {
      throw new Error('Password must have at least 8 characters.')
    }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: fullName },
      },
    })

    if (error) throw error

    // With email confirmation enabled, session is normally null.
    if (data.session?.user) {
      // Supabase's auth callback establishes the generation before this read.
      const generation = currentSession.current.generation
      if (currentSession.current.userId !== data.session.user.id) throw new Error('Your session has changed. Please try again.')
      const profile = await loadProfile(data.session.user)
      if (!isSessionCurrent(generation)) throw new Error('Your session has changed. Please try again.')
      setUser(profile)
    }

    return {
      requiresConfirmation: !data.session,
    }
  }

  async function logout() {
    const generation = currentSession.current.generation
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    finishSignOut(generation)
  }

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      sessionGeneration,
      isSessionCurrent,
      login,
      register,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  )
}
