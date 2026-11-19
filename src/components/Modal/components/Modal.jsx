import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import styles from '../styles/Modal.module.css'

export default function Modal({ title, message, icon, children, actions, onClose, returnFocusRef, dismissible = true, classNames = {} }) {
  const dialogRef = useRef(null)
  const titleId = useId()
  const messageId = useId()
  useEffect(() => {
    const dialog = dialogRef.current
    const opener = returnFocusRef?.current || document.activeElement
    const scrollContainers = [document.documentElement, document.body, document.getElementById('main-content')].filter(Boolean)
    const original = scrollContainers.map(element => element.style.overflow)
    scrollContainers.forEach(element => { element.style.overflow = 'hidden' })
    dialog.showModal()
    dialog.querySelector('[data-modal-focus]')?.focus()
    return () => {
      dialog.close()
      scrollContainers.forEach((element, index) => { element.style.overflow = original[index] })
      if (opener?.isConnected) opener.focus({ preventScroll: true })
    }
  }, [returnFocusRef])
  const classes = name => [styles[name], classNames[name]].filter(Boolean).join(' ')
  return createPortal(<dialog ref={dialogRef} className={classes('modal')} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={messageId} tabIndex={-1}
    onKeyDown={e => {
      e.stopPropagation()
      if (e.key !== 'Tab') return
      const controls = [...e.currentTarget.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
        .filter(element => element.getClientRects().length && !element.closest('[inert]'))
      const first = controls[0], last = controls.at(-1)
      if (!first) { e.preventDefault(); e.currentTarget.focus(); return }
      if (e.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement))) {
        e.preventDefault(); last.focus()
      } else if (!e.shiftKey && (document.activeElement === last || !controls.includes(document.activeElement))) {
        e.preventDefault(); first.focus()
      }
    }}
    onCancel={e => { e.preventDefault(); if (dismissible) onClose?.() }}
    onClick={e => { if (dismissible && e.target === e.currentTarget) { const box = e.currentTarget.getBoundingClientRect(); if (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom) onClose?.() } }}>
    {dismissible && <button className={styles.close} type="button" aria-label="Close dialog" onClick={onClose}><X size={20} aria-hidden="true" /></button>}
    <div className={classes('icon')} aria-hidden="true">{icon}</div>
    <h2 id={titleId} className={classNames.title}>{title}</h2><p id={messageId} className={classes('message')}>{message}</p>
    {children && <div className={classes('summary')}>{children}</div>}
    <div className={classes('actions')}>{actions}</div>
  </dialog>, document.body)
}
