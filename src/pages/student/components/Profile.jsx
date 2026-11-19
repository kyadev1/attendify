import { useRef, useState } from 'react'
import { UserRound, BadgeCheck, Pencil, Check, X, GraduationCap } from 'lucide-react'
import useAuth from '../../../hooks/useAuth'
import useEvents from '../../../hooks/useEvents'
import Button from '../../../components/Button/Button'
import styles from '../styles/Profile.module.css'

export default function Profile() {
  const { user } = useAuth()
  return <StudentProfile key={user.id} user={user} />
}

function StudentProfile({ user }) {
  const { registrations } = useEvents()
  const names = user.name.trim().split(/\s+/)
  const [profile, setProfile] = useState(() => ({ firstName: names[0] || '', lastName: names.slice(1).join(' '), email: user.email || '', program: user.id === 'student-demo' ? 'BS Information Technology' : '', year: user.id === 'student-demo' ? '3' : '' }))
  const [draft, setDraft] = useState(profile)
  const [editing, setEditing] = useState(false)
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')
  const firstField = useRef(null)
  const editButton = useRef(null)
  const form = useRef(null)
  const bookings = registrations.filter(r => r.studentId === user.id)
  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ')
  const initials = (profile.firstName[0] || '') + (profile.lastName[0] || '')
  const fields = [
    { name: 'firstName', label: 'First Name', autoComplete: 'given-name' },
    { name: 'lastName', label: 'Last Name', autoComplete: 'family-name' },
    { name: 'email', label: 'Email Address', type: 'email', autoComplete: 'email' },
    { name: 'studentId', label: 'Student ID' },
    { name: 'program', label: 'Program / Course' },
    { name: 'year', label: 'Year Level' },
  ]
  function begin() {
    setDraft({ ...profile }); setErrors({}); setMessage(''); setEditing(true)
    requestAnimationFrame(() => firstField.current?.focus())
  }
  function cancel() {
    setDraft({ ...profile }); setErrors({}); setEditing(false); setMessage('Changes cancelled.')
    requestAnimationFrame(() => editButton.current?.focus())
  }
  function save(event) {
    event.preventDefault()
    const clean = Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, value.trim()]))
    const nextErrors = {}
    for (const key of ['firstName', 'lastName', 'program']) if (!clean[key]) nextErrors[key] = 'This field is required.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean.email)) nextErrors.email = 'Enter a valid email address.'
    if (!['1', '2', '3', '4', '5', '6'].includes(clean.year)) nextErrors.year = 'Choose your year level.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) {
      setMessage('Please correct the highlighted fields.')
      requestAnimationFrame(() => form.current?.elements.namedItem(Object.keys(nextErrors)[0])?.focus())
      return
    }
    setProfile(clean); setDraft(clean); setEditing(false)
    setMessage('Profile updated for this visit. Changes reset when you leave or refresh this page; login details are unchanged.')
    requestAnimationFrame(() => editButton.current?.focus())
  }
  return <div className={styles.page}>
    <header className={styles.pageHeader}><h1>Profile</h1><p>Manage your personal information and account details.</p></header>
    <section className={styles.overview} aria-label="Student profile overview"><div className={styles.identity}><span className={styles.avatar} aria-hidden="true">{initials.toUpperCase() || <UserRound size={30} />}</span><div className={styles.identityText}><h2>{fullName}</h2><p>{user.id}</p><span className={styles.badge}><BadgeCheck size={15} aria-hidden="true" />Active Student</span></div></div><div className={styles.actions}>{editing ? <><Button variant="secondary" onClick={cancel}><X size={16} aria-hidden="true" />Cancel</Button><Button className={styles.primary} type="submit" form="profile-form"><Check size={16} aria-hidden="true" />Save Changes</Button></> : <button ref={editButton} className={styles.editButton} onClick={begin}><Pencil size={16} aria-hidden="true" />Edit Profile</button>}</div></section>
    <p role="status" className={styles.message}>{message}</p>
    <section className={styles.card} aria-labelledby="personal-title"><h2 id="personal-title"><UserRound size={21} aria-hidden="true" />Personal Information</h2><p className={styles.help}>Profile edits apply only while this page is open. Student ID and login credentials cannot be changed here.</p>
      <form id="profile-form" ref={form} onSubmit={save} noValidate className={styles.fields}>
        {fields.map(field => {
          const locked = field.name === 'studentId'
          const value = locked ? user.id : (editing ? draft : profile)[field.name]
          const invalid = editing && errors[field.name]
          return <div key={field.name} className={styles.field}><label htmlFor={'profile-' + field.name}>{field.label}{locked && <span className={styles.readOnlyLabel}>Read-only</span>}</label>
            {field.name === 'year' && editing ? <select id="profile-year" name="year" value={draft.year} onChange={e => setDraft({ ...draft, year: e.target.value })} required aria-invalid={Boolean(invalid)} aria-describedby={invalid ? 'error-year' : undefined}><option value="">Select year level</option>{['1','2','3','4','5','6'].map(y => <option key={y} value={y}>Year {y}</option>)}</select> : <input ref={field.name === 'firstName' ? firstField : undefined} id={'profile-' + field.name} name={field.name} type={field.type || 'text'} value={field.name === 'year' ? value ? 'Year ' + value : '' : value} readOnly={!editing || locked} required={!locked} maxLength={field.name === 'email' ? 254 : 120} autoComplete={field.autoComplete || 'off'} onChange={e => setDraft({ ...draft, [field.name]: e.target.value })} aria-invalid={Boolean(invalid)} aria-describedby={invalid ? 'error-' + field.name : undefined} />}
            {invalid && <p id={'error-' + field.name} className={styles.error}>{invalid}</p>}
          </div>
        })}
      </form>
    </section>
    <section className={styles.card} aria-labelledby="account-title"><h2 id="account-title"><GraduationCap size={22} aria-hidden="true" />Account Information</h2><dl className={styles.account}>{[['Account Type', 'Student'], ['Account Status', 'Active'], ['Member Since', user.id === 'student-demo' ? 'August 2026 (demo)' : 'Not available'], ['Total Registered Events', bookings.length], ['Total Attended Events', bookings.filter(r => r.attendedAt).length]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>
  </div>
}
