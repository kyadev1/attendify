import { useId, useRef, useState } from 'react'
import { FIELD_TYPES, LIMITS, hasChoices, updateQuestions, validateDefinition, validateAnswers } from '../model.js'
import styles from '../styles/RegistrationFormBuilder.module.css'

export default function RegistrationFormBuilder({ eventId = 'local-preview-event', embedded = false }) {
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState({})
  const [checked, setChecked] = useState(false)
  const [notice, setNotice] = useState('')
  const prefix = useId()
  const editor = useRef(null), preview = useRef(null)
  const form = { schemaVersion: 1, eventId, questions }
  const issues = validateDefinition(form)
  const answerIssues = checked ? validateAnswers(form, answers) : []
  function change(action) {
    setQuestions(previous => updateQuestions(previous, action))
    // Preview answers are disposable; edits must not keep answers for old types.
    setAnswers({}); setChecked(false)
    setNotice(action.type === 'move' ? 'Question order updated.' : action.type === 'remove' ? 'Question removed.' : 'Local draft updated; not saved.')
    if (action.type === 'remove' || action.type === 'removeChoice') editor.current?.focus()
  }
  const answer = (id, value) => { setAnswers(previous => ({ ...previous, [id]: value })); setChecked(false) }
  const Title = embedded ? 'h3' : 'h1'
  const Subheading = embedded ? 'h4' : 'h2'
  return <section className={styles.builder}>
    <header><Title>Registration form prototype</Title><p>Local preview only. Nothing is saved and no registration is created. Use fictional answers only.</p><p>Do not request passwords, government IDs, health details, or account information already held in the student profile.</p></header>
    <p role="status" aria-live="polite">{notice}</p>
    <div className={styles.columns}>
      <section aria-labelledby={`${prefix}-editor`}>
        <Subheading id={`${prefix}-editor`} ref={editor} tabIndex={-1}>Questions</Subheading>
        {!questions.length && <p>No custom questions. Normal event registration remains available without a form.</p>}
        {questions.map((q, index) => {
          const base = `${prefix}-${q.id}`
          const errors = issues.filter(issue => issue.path.startsWith(`questions.${index}.`))
          return <fieldset key={q.id} className={styles.card} aria-describedby={errors.length ? `${base}-errors` : undefined}>
            <legend>Question {index + 1}</legend>
            <label htmlFor={`${base}-title`}>Question title</label>
            <input id={`${base}-title`} value={q.title} maxLength={LIMITS.title} aria-invalid={errors.some(e => e.path.endsWith('.title'))} onChange={e => change({ type: 'title', id: q.id, value: e.target.value })} />
            <label htmlFor={`${base}-type`}>Field type</label>
            <select id={`${base}-type`} value={q.type} onChange={e => change({ type: 'fieldType', id: q.id, value: e.target.value })}>{Object.entries(FIELD_TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <label className={styles.check}><input type="checkbox" checked={q.required} onChange={e => change({ type: 'required', id: q.id, value: e.target.checked })} />Required</label>
            {hasChoices(q.type) && <div>
              {q.choices.map((choice, i) => <div className={styles.choice} key={choice.id}>
                <label htmlFor={`${base}-${choice.id}`}>Choice {i + 1}</label>
                <input id={`${base}-${choice.id}`} value={choice.label} maxLength={LIMITS.choice} onChange={e => change({ type: 'editChoice', id: q.id, choiceId: choice.id, value: e.target.value })} />
                <button type="button" aria-label={`Remove choice ${i + 1} from question ${index + 1}`} onClick={() => change({ type: 'removeChoice', id: q.id, choiceId: choice.id })}>Remove choice</button>
              </div>)}
              <button type="button" disabled={q.choices.length >= LIMITS.choices} onClick={() => change({ type: 'addChoice', id: q.id, choiceId: crypto.randomUUID() })}>Add choice</button>
            </div>}
            {errors.length > 0 && <ul id={`${base}-errors`} className={styles.error}>{errors.map((issue, i) => <li key={i}>{issue.message}</li>)}</ul>}
            <div className={styles.actions}>
              <button type="button" disabled={index === 0} aria-label={`Move question ${index + 1} up`} onClick={() => change({ type: 'move', id: q.id, direction: -1 })}>Move up</button>
              <button type="button" disabled={index === questions.length - 1} aria-label={`Move question ${index + 1} down`} onClick={() => change({ type: 'move', id: q.id, direction: 1 })}>Move down</button>
              <button type="button" aria-label={`Remove question ${index + 1}`} onClick={() => change({ type: 'remove', id: q.id })}>Remove question</button>
            </div>
          </fieldset>
        })}
        <button type="button" disabled={questions.length >= LIMITS.questions} onClick={() => change({ type: 'add', id: crypto.randomUUID() })}>Add question</button>
        <p>{questions.length} / {LIMITS.questions} questions</p>
      </section>
      <section aria-labelledby={`${prefix}-preview`}>
        <Subheading id={`${prefix}-preview`}>Student preview</Subheading>
        {issues.length ? <p role="status">Correct the question definitions to enable the preview.</p> : <form className={styles.card} noValidate onSubmit={e => { e.preventDefault(); setChecked(true); preview.current?.focus() }}>
          {!questions.length && <p>No additional questions.</p>}
          {questions.map(q => {
            const id = `${prefix}-preview-${q.id}`, error = answerIssues.find(issue => issue.path === q.id)
            const common = { id, 'aria-invalid': Boolean(error), 'aria-describedby': error ? `${id}-error` : undefined, required: q.required }
            return <div key={q.id} className={styles.field}>
              {['radio', 'checkbox'].includes(q.type) ? <fieldset aria-describedby={error ? `${id}-error` : undefined} aria-invalid={Boolean(error)}>
                <legend>{q.title} ({q.required ? 'Required' : 'Optional'})</legend>
                {q.choices.map(c => <label key={c.id} className={styles.check}>
                  <input type={q.type} name={id} value={c.id} checked={q.type === 'radio' ? answers[q.id] === c.id : (answers[q.id] || []).includes(c.id)} onChange={e => answer(q.id, q.type === 'radio' ? c.id : e.target.checked ? [...(answers[q.id] || []), c.id] : (answers[q.id] || []).filter(v => v !== c.id))} />{c.label}
                </label>)}
              </fieldset> : <>
                <label htmlFor={id}>{q.title} ({q.required ? 'Required' : 'Optional'})</label>
                {q.type === 'paragraph' ? <textarea {...common} maxLength={LIMITS.paragraph} value={answers[q.id] || ''} onChange={e => answer(q.id, e.target.value)} />
                  : q.type === 'dropdown' ? <select {...common} value={answers[q.id] || ''} onChange={e => answer(q.id, e.target.value)}><option value="">Choose an option</option>{q.choices.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
                    : <input {...common} maxLength={LIMITS.short} value={answers[q.id] || ''} onChange={e => answer(q.id, e.target.value)} />}
              </>}
              {error && <p id={`${id}-error`} className={styles.error}>{error.message}</p>}
            </div>
          })}
          <div className={styles.actions}><button type="submit">Check preview answers</button><button type="button" onClick={() => { setAnswers({}); setChecked(false) }}>Clear preview answers</button></div>
          <p ref={preview} tabIndex={-1} role="status">{checked ? answerIssues.length ? 'Review the highlighted answers.' : 'Preview answers are valid locally. Nothing was submitted or saved.' : 'Preview validation only; this does not register you.'}</p>
        </form>}
      </section>
    </div>
  </section>
}
