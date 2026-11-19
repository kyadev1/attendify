import { useEffect } from 'react'
import { startAttendanceSync } from '../utils/attendanceSync'

// Publications are unverified; use the existing authorized reads.
export default function useRealtimeAttendance({ enabled, refresh, onError }) {
  useEffect(() => {
    if (!enabled) return
    return startAttendanceSync({ refresh, onError })
  }, [enabled, refresh, onError])
}
