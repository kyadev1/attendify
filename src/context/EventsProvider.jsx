
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { EventsContext } from './eventsContext'
import useAuth from '../hooks/useAuth'
import useRealtimeAttendance from '../hooks/useRealtimeAttendance'
import { eventRequestError } from '../utils/eventRequestError'
import { normalizeEvent } from '../utils/eventForm'

import {
  fetchEvents,
  createEvent,
  updateEvent,
  removeEvent,
} from '../services/eventService'

import {
  fetchRegistrations,
  fetchRegistrationCounts,
  registerForEvent,
} from '../services/registrationService'

import {
  fetchAttendanceRecords,
  checkInTicket,
  fetchVerifiedAttendanceRecords,
} from '../services/attendanceService'

import {
  parseTicketPayload,
} from '../utils/ticketData'

function emptySessionData(owner) {
  return {
    owner,
    eventsList: [],
    registrationRows: [],
    attendanceRecords: [],
    counts: {},
    loading: true,
    error: '',
    syncError: '',
    hasLoaded: false,
    loadFailure: null,
  }
}

export default function EventsProvider({ children }) {
  const { user, sessionGeneration, isSessionCurrent } = useAuth()
  const owner = JSON.stringify([sessionGeneration, user?.id, user?.role])
  const [cache, setCache] = useState(() => emptySessionData(owner))

  // Reset this provider's state during an account change, before children can
  // render old records. Keep the subtree mounted so auth forms retain state.
  let data = cache
  if (cache.owner !== owner) {
    data = emptySessionData(owner)
    setCache(data)
  }
  const { eventsList, registrationRows, attendanceRecords, counts, loading, error } = data

  // Every queued field update belongs to one account generation. Checking the
  // cache owner here also rejects updates queued before an account rerender.
  const setters = useMemo(() => Object.fromEntries(
    ['eventsList', 'registrationRows', 'attendanceRecords', 'counts', 'loading', 'error', 'hasLoaded', 'loadFailure'].map(field => [
      field,
      update => setCache(previous => {
        if (previous.owner !== owner || !isSessionCurrent(sessionGeneration)) return previous
        return {
          ...previous,
          [field]: typeof update === 'function' ? update(previous[field]) : update,
        }
      }),
    ])
  ), [owner, sessionGeneration, isSessionCurrent])
  const {
    eventsList: setEventsList,
    registrationRows: setRegistrationRows,
    attendanceRecords: setAttendanceRecords,
    counts: setCounts,
    loading: setLoading,
    error: setError,
    hasLoaded: setHasLoaded,
    loadFailure: setLoadFailure,
  } = setters

  const lifetime = useMemo(() => ({ current: { active: true, owner } }), [owner])
  const requestVersion = useRef(0)
  const fullReadPending = useRef(false)
  const fullReadController = useRef(null)
  const eventSnapshot = useRef(null)
  const syncVersion = useRef(0)
  const mutationRevision = useRef(0)
  const countReadVersion = useRef(0)
  const attendanceReadVersion = useRef(0)

  const isCurrent = useCallback(scope => (
    scope.active && scope.owner === owner && isSessionCurrent(sessionGeneration)
  ), [isSessionCurrent, sessionGeneration, owner])

  function requireCurrent(scope) {
    if (!isCurrent(scope)) {
      throw new Error('Your session has changed. Please try again.')
    }
  }

  // Check again inside queued React updaters, as well as after each await.
  function commit(scope, setter, update) {
    if (!isCurrent(scope)) return
    setter(previous => isCurrent(scope) ? update(previous) : previous)
  }

  function mutationCommitted() {
    mutationRevision.current += 1
    countReadVersion.current += 1
    attendanceReadVersion.current += 1
    eventSnapshot.current = null
  }

  const loadData = useCallback(async function loadSnapshot() {
    const scope = lifetime.current
    if (!isCurrent(scope)) return
    const version = ++requestVersion.current
    const revision = mutationRevision.current
    const countVersion = ++countReadVersion.current
    const attendanceVersion = ++attendanceReadVersion.current
    fullReadPending.current = true
    setLoading(true)
    setError('')
    setLoadFailure(null)

    if (!user?.id) {
      fullReadPending.current = false
      setLoading(false)
      return
    }

    const latest = () => isCurrent(scope) && version === requestVersion.current
    fullReadController.current?.abort()
    const controller = new AbortController()
    fullReadController.current = controller
    const options = { isCurrent: latest, organizerId: user.role === 'organizer' ? user.id : undefined, studentId: user.id }
    try {
      const [eventRows, bookingRows, countRows, records] = await Promise.all([
        fetchEvents(controller.signal, options),
        user.role === 'student' ? fetchRegistrations(controller.signal, options) : [],
        fetchRegistrationCounts(controller.signal),
        fetchAttendanceRecords(controller.signal),
      ])
      // A snapshot begun before a successful mutation must not undo it.
      if (!latest()) return
      if (revision !== mutationRevision.current) {
        // A creation can finish during the initial load. Reload its obsolete
        // snapshot so unrelated existing records are not left missing.
        await loadSnapshot()
        return
      }
      // Keep dispatch order within this session: a later mutation updater must
      // receive this accepted snapshot rather than an empty pre-load cache.
      setEventsList(previous => isCurrent(scope) ? eventRows : previous)
      setRegistrationRows(previous => isCurrent(scope) ? bookingRows : previous)
      if (countVersion === countReadVersion.current) {
        setCounts(previous => isCurrent(scope) ? countRows : previous)
      }
      if (attendanceVersion === attendanceReadVersion.current) {
        setAttendanceRecords(previous => isCurrent(scope) ? records : previous)
      }
      setHasLoaded(previous => isCurrent(scope) ? true : previous)
      eventSnapshot.current = { owner, rows: eventRows, readAt: Date.now() }
    } catch (failure) {
      if (latest() && revision !== mutationRevision.current) {
        await loadSnapshot()
      } else if (latest()) {
        const problem = eventRequestError(failure)
        setError(previous => latest() && revision === mutationRevision.current
          ? problem.message : previous)
        setLoadFailure(previous => latest() && revision === mutationRevision.current ? problem : previous)
      }
    } finally {
      controller.abort()
      if (latest()) {
        fullReadPending.current = false
        setLoading(previous => latest() ? false : previous)
      }
    }
  }, [isCurrent, lifetime, user?.id, user?.role, owner, setEventsList, setRegistrationRows, setCounts, setAttendanceRecords, setLoading, setError, setHasLoaded, setLoadFailure])

  useEffect(() => {
    // Strict Mode may replay setup after cleanup; never reactivate an old scope.
    if (!lifetime.current.active) lifetime.current = { active: true, owner }
    void loadData()
    const scope = lifetime.current
    return () => {
      scope.active = false
      fullReadController.current?.abort()
      eventSnapshot.current = null
      requestVersion.current += 1
    }
  }, [loadData, lifetime, owner])

  // Atomic background snapshots keep the scanner mounted and retain good data
  // on failures. Existing full refreshes and confirmed mutations take priority.
  const refreshAttendance = useCallback(async (signal) => {
    const scope = lifetime.current
    if (!user?.id || !isCurrent(scope) || fullReadPending.current) return false
    const version = ++syncVersion.current
    const request = requestVersion.current
    const revision = mutationRevision.current
    const countVersion = countReadVersion.current
    const attendanceVersion = attendanceReadVersion.current
    const current = () => isCurrent(scope) && !signal?.aborted &&
      version === syncVersion.current && request === requestVersion.current &&
      revision === mutationRevision.current && countVersion === countReadVersion.current &&
      attendanceVersion === attendanceReadVersion.current
    // Event descriptions/schedules change less often than attendance. Keep a
    // session-owned cache for at most a minute; mutations invalidate it.
    const cachedEvents = eventSnapshot.current
    const useCachedEvents = cachedEvents?.owner === owner && Date.now() - cachedEvents.readAt < 60000
    const options = { isCurrent: current, organizerId: user.role === 'organizer' ? user.id : undefined, studentId: user.id }
    try {
      const [eventsList, registrationRows, counts, attendanceRecords] = await Promise.all([
        useCachedEvents ? cachedEvents.rows : fetchEvents(signal, options),
        user.role === 'student' ? fetchRegistrations(signal, options) : [],
        fetchRegistrationCounts(signal), fetchAttendanceRecords(signal),
      ])
      if (!current()) return false
      countReadVersion.current += 1
      attendanceReadVersion.current += 1
      if (!useCachedEvents) eventSnapshot.current = { owner, rows: eventsList, readAt: Date.now() }
      setCache(previous => previous.owner === owner && isCurrent(scope) ? {
        ...previous, eventsList, registrationRows, counts, attendanceRecords,
        error: '', syncError: '', hasLoaded: true, loadFailure: null,
      } : previous)
      return true
    } catch (failure) {
      if (!current()) return false
      throw failure
    }
  }, [isCurrent, lifetime, owner, user?.id, user?.role])

  const reportSyncError = useCallback(message => {
    const scope = lifetime.current
    setCache(previous => previous.owner === owner && isCurrent(scope)
      ? { ...previous, syncError: message } : previous)
  }, [isCurrent, lifetime, owner])

  useRealtimeAttendance({
    enabled: Boolean(user?.id) && !loading,
    refresh: refreshAttendance,
    onError: reportSyncError,
  })

  // Organizer sees registrations from the
  // authorized attendance-records RPC.
  // Student sees only their own registrations.
  const registrations = useMemo(() => {
    const recordsById = new Map(
      attendanceRecords.map(row => [
        row.registrationId,
        row,
      ])
    )

    if (user?.role === 'organizer') {
      return attendanceRecords.map(row => ({
        id: row.registrationId,
        eventId: row.eventId,
        studentId: row.studentId,
        studentName: row.studentName,
        status: 'registered',
        registeredAt: row.registeredAt,
        attendedAt: row.attendedAt,
        scannedAt: row.attendedAt,
      }))
    }

    return registrationRows.map(row => {
      const record = recordsById.get(row.id)

      return {
        ...row,
        studentName:
          record?.studentName ||
          row.studentName ||
          user?.name ||
          user?.full_name ||
          '',
        attendedAt: record?.attendedAt || null,
        scannedAt: record?.attendedAt || null,
      }
    })
  }, [
    registrationRows,
    attendanceRecords,
    user?.role,
    user?.name,
    user?.full_name,
  ])

  // Only successfully checked-in registrations.
  const attendanceList = useMemo(() => {
    return attendanceRecords
      .filter(row => Boolean(row.attendedAt))
      .map(row => ({
        ...row,
        id: row.registrationId,
      }))
  }, [attendanceRecords])

  const events = useMemo(() => {
    const registeredEventIds = new Set(registrations.filter(row => row.studentId === user?.id).map(row => row.eventId))
    return eventsList.map(event => {
      const registered = counts[event.id] || 0

      return {
        ...event,
        organizerName:
          event.organizerName || 'Event Organizer',
        slotsRemaining: Math.max(
          0,
          event.slots - registered
        ),
        isRegistered: registeredEventIds.has(event.id),
      }
    })
  }, [
    eventsList,
    counts,
    registrations,
    user?.id,
  ])

  async function saveEvent(values, eventId) {
    const scope = lifetime.current
    requireCurrent(scope)
    if (user?.role !== 'organizer') {
      throw new Error('Organizer access required.')
    }

    const existing = eventId
      ? eventsList.find(
          event =>
            event.id === eventId &&
            event.organizerId === user.id
        )
      : null

    if (eventId && !existing) {
      throw new Error(
        'Event not found for your account.'
      )
    }

    const details = normalizeEvent(
      values,
      eventId ? counts[eventId] || 0 : 0,
      existing
    )

    let saved
    try {
      saved = eventId
        ? await updateEvent(eventId, details)
        : await createEvent(details, user.id)
    } catch (failure) {
      requireCurrent(scope)
      throw failure
    }
    requireCurrent(scope)
    mutationCommitted()

    commit(scope, setEventsList, previous =>
      eventId
        ? previous.map(row =>
            row.id === eventId ? saved : row
          )
        : [...previous, saved]
    )

    return saved
  }

  async function loadAttendanceReport(eventId, signal) {
    const scope = lifetime.current
    requireCurrent(scope)
    if (user?.role !== 'organizer' || !eventsList.some(event => event.id === eventId && event.organizerId === user.id)) {
      throw new Error('This event is not available for your account to manage.')
    }
    const records = await fetchVerifiedAttendanceRecords(eventId, { signal, isCurrent: () => isCurrent(scope) })
    requireCurrent(scope)
    return records.map(row => ({
      ...row, id: row.registrationId, status: 'registered',
    }))
  }

  async function deleteEvent(eventId) {
    const scope = lifetime.current
    requireCurrent(scope)
    if (user?.role !== 'organizer') {
      throw new Error('Organizer access required.')
    }

    const owned = eventsList.some(
      event =>
        event.id === eventId &&
        event.organizerId === user.id
    )

    if (!owned) {
      throw new Error(
        'Event not found for your account.'
      )
    }

    try {
      await removeEvent(eventId)
    } catch (failure) {
      requireCurrent(scope)
      throw failure
    }
    requireCurrent(scope)
    mutationCommitted()

    commit(scope, setEventsList, previous =>
      previous.filter(row => row.id !== eventId)
    )

    commit(scope, setCounts, previous => {
      const next = { ...previous }
      delete next[eventId]
      return next
    })
  }

  async function registerEvent(eventId) {
    const scope = lifetime.current
    requireCurrent(scope)
    if (user?.role !== 'student') throw new Error('Student access required.')

    let booking
    try {
      booking = await registerForEvent(eventId)
    } catch (failure) {
      requireCurrent(scope)
      throw failure
    }
    requireCurrent(scope)
    mutationCommitted()
    commit(scope, setRegistrationRows, previous => [
      booking, ...previous.filter(row => row.id !== booking.id),
    ])
    // Apply this confirmed registration once. Failed/superseded count reads
    // retain it instead of incrementing an unrelated or newer snapshot.
    commit(scope, setCounts, previous => ({
      ...previous, [eventId]: (previous[eventId] || 0) + 1,
    }))
    const revision = mutationRevision.current
    const version = ++countReadVersion.current
    try {
      const updatedCounts = await fetchRegistrationCounts()
      requireCurrent(scope)
      if (version === countReadVersion.current && revision === mutationRevision.current) {
        commit(scope, setCounts, () => updatedCounts)
      }
    } catch (failure) {
      requireCurrent(scope)
      if (version === countReadVersion.current && revision === mutationRevision.current) {
        console.error('Unable to refresh registration counts:', failure)
      }
    }
    requireCurrent(scope)
    return booking
  }

  async function checkIn(raw, eventId) {
    const scope = lifetime.current
    if (!isCurrent(scope)) return { type: 'error', message: 'Your session has changed. Please try again.' }
    if (user?.role !== 'organizer') {
      return {
        type: 'error',
        message: 'Organizer access required.',
      }
    }

    try {
      // Parse the QR code locally.
      // This is only format validation.
      const ticket = parseTicketPayload(raw)

      if (ticket.eventId !== eventId) {
        throw new Error(
          'This ticket belongs to a different event.'
        )
      }

      // Supabase performs the real authorization,
      // registration validation, and duplicate check.
      const checked = await checkInTicket(ticket)
      requireCurrent(scope)
      mutationCommitted()

      // The database check-in has succeeded.
      // Update local state immediately.
      commit(scope, setAttendanceRecords, previous => {
        const existing = previous.find(
          row =>
            row.registrationId ===
            checked.registrationId
        )

        const merged = {
          ...existing,
          ...checked,
          registeredAt:
            existing?.registeredAt ||
            checked.registeredAt,
        }

        return [
          merged,
          ...previous.filter(
            row =>
              row.registrationId !==
              checked.registrationId
          ),
        ]
      })

      // Refresh complete attendance records
      // without changing the successful result
      // if the refresh request fails.
      const revision = mutationRevision.current
      const version = ++attendanceReadVersion.current
      try {
        const records = await fetchAttendanceRecords()
        requireCurrent(scope)
        if (version === attendanceReadVersion.current && revision === mutationRevision.current) {
          commit(scope, setAttendanceRecords, () => records)
        }
      } catch (refreshError) {
        requireCurrent(scope)
        if (version === attendanceReadVersion.current && revision === mutationRevision.current) console.error(
          'Attendance refresh failed:',
          refreshError
        )
      }

      requireCurrent(scope)
      return {
        type: 'success',
        message: 'Check-in successful.',
        booking: {
          ...checked,
          attendedAt: checked.attendedAt,
        },
      }
    } catch (failure) {
      return {
        type: 'error',
        message:
          !isCurrent(scope) ? 'Your session has changed. Please try again.' : failure?.message || 'Check-in failed.',
      }
    }
  }

  return (
    <EventsContext.Provider
      value={{
        events,
        registrations,
        attendanceList,
        loading,
        error,
        hasLoaded: data.hasLoaded,
        loadFailure: data.loadFailure,
        refreshEvents: loadData,
        syncError: data.syncError,
        saveEvent,
        deleteEvent,
        registerEvent,
        checkIn,
        loadAttendanceReport,
      }}
    >
      {children}
    </EventsContext.Provider>
  )
}
