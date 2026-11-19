import { lazy, Suspense } from 'react'
import PageBoundary from './routes/PageBoundary'
import { Routes, Route, Navigate, Link } from 'react-router-dom'
import ProtectedRoute from './routes/ProtectedRoute'

const FormBuilderPrototype = import.meta.env?.DEV && !import.meta.env?.PROD && import.meta.env?.VITE_ENABLE_FORM_BUILDER_PROTOTYPE === 'true'
  ? lazy(() => import('./features/registrationForms/components/FormBuilderPrototype')) : null

const Login = lazy(() => import('./routes/authPages').then(pages => ({ default: pages.Login })))
const OrganizerLogin = lazy(() => import('./routes/authPages').then(pages => ({ default: pages.OrganizerLogin })))
const Register = lazy(() => import('./routes/authPages').then(pages => ({ default: pages.Register })))
const StudentLayout = lazy(() => import('./routes/studentPages').then(pages => ({ default: pages.StudentLayout })))
const StudentDashboard = lazy(() => import('./routes/studentPages').then(pages => ({ default: pages.StudentDashboard })))
const BrowseEvents = lazy(() => import('./routes/studentPages').then(pages => ({ default: pages.BrowseEvents })))
const EventDetails = lazy(() => import('./routes/studentPages').then(pages => ({ default: pages.EventDetails })))
const MyBookings = lazy(() => import('./routes/studentPages').then(pages => ({ default: pages.MyBookings })))
const Profile = lazy(() => import('./routes/studentPages').then(pages => ({ default: pages.Profile })))
const OrganizerLayout = lazy(() => import('./routes/organizerPages').then(pages => ({ default: pages.OrganizerLayout })))
const OrganizerDashboard = lazy(() => import('./routes/organizerPages').then(pages => ({ default: pages.OrganizerDashboard })))
const MyEvents = lazy(() => import('./routes/organizerPages').then(pages => ({ default: pages.MyEvents })))
const CreateEditEvent = lazy(() => import('./routes/organizerPages').then(pages => ({ default: pages.CreateEditEvent })))
const EventManagement = lazy(() => import('./routes/organizerPages').then(pages => ({ default: pages.EventManagement })))
const AttendanceDashboard = lazy(() => import('./routes/attendancePages').then(pages => ({ default: pages.AttendanceDashboard })))
const Reports = lazy(() => import('./routes/attendancePages').then(pages => ({ default: pages.Reports })))
const QRTicket = lazy(() => import('./pages/student/components/QRTicket'))
const QRScanner = lazy(() => import('./pages/organizer/components/QRScanner'))

function page(Component, key) {
  return <PageBoundary key={key}><Suspense fallback={<p role="status" aria-live="polite" className="route-loading">Loading page...</p>}><Component /></Suspense></PageBoundary>
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={page(Login, 'Login')} />
      <Route path="/organizer/login" element={page(OrganizerLogin, 'OrganizerLogin')} />
      <Route path="/register" element={page(Register, 'Register')} />
      <Route element={<ProtectedRoute role="student" />}>
        <Route element={page(StudentLayout, 'StudentLayout')}>
          <Route path="/dashboard" element={page(StudentDashboard, 'StudentDashboard')} />
          <Route path="/browse" element={page(BrowseEvents, 'BrowseEvents')} />
          <Route path="/events/:id" element={page(EventDetails, 'EventDetails')} />
          <Route path="/bookings" element={page(MyBookings, 'MyBookings')} />
          <Route path="/ticket/:regId" element={page(QRTicket, 'QRTicket')} />
          <Route path="/profile" element={page(Profile, 'Profile')} />
        </Route>
      </Route>
      <Route element={<ProtectedRoute role="organizer" />}>
        {FormBuilderPrototype && <Route path="/organizer/form-builder-preview" element={page(FormBuilderPrototype, 'FormBuilderPrototype')} />}
        <Route element={page(OrganizerLayout, 'OrganizerLayout')}>
          <Route path="/organizer" element={page(OrganizerDashboard, 'OrganizerDashboard')} />
          <Route path="/organizer/events" element={page(MyEvents, 'MyEvents')} />
          <Route path="/organizer/events/new" element={page(CreateEditEvent, 'CreateEditEvent')} />
          <Route path="/organizer/events/:id/edit" element={page(CreateEditEvent, 'CreateEditEvent')} />
          <Route path="/organizer/events/:id" element={page(EventManagement, 'EventManagement')} />
          <Route path="/organizer/events/:id/scan" element={page(QRScanner, 'QRScanner')} />
          <Route path="/organizer/events/:id/attendance" element={page(AttendanceDashboard, 'AttendanceDashboard')} />
          <Route path="/organizer/events/:id/reports" element={page(Reports, 'Reports')} />
        </Route>
      </Route>
      <Route path="*" element={<main className="not-found"><h1>Page not found</h1><Link to="/">Return to login</Link></main>} />
    </Routes>
  )
}
