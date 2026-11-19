export const LIMITS = Object.freeze({ questions: 20, choices: 20, title: 200, choice: 100, short: 250, paragraph: 2000 })
export const FIELD_TYPES = Object.freeze({ short: 'Short Text', paragraph: 'Paragraph', dropdown: 'Dropdown / Single Choice', radio: 'Multiple Choice (one answer)', checkbox: 'Checkbox / Multiple Selection' })
export const hasChoices = type => ['dropdown', 'radio', 'checkbox'].includes(type)
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max
const validId = id => text(id, 100) && !['__proto__', 'constructor', 'prototype'].includes(id)

export function validateDefinition(form) {
  const issues = []
  const add = (path, message) => issues.push({ path, message })
  if (!object(form) || form.schemaVersion !== 1 || !text(form.eventId, 100)) add('form', 'A version 1 definition and event identifier are required.')
  if (!Array.isArray(form?.questions) || form.questions.length > LIMITS.questions) {
    add('form', `Use at most ${LIMITS.questions} questions.`)
    return issues
  }
  const ids = new Set()
  form.questions.forEach((q, index) => {
    const path = `questions.${index}`
    if (!object(q)) { add(path, 'Invalid question definition.'); return }
    if (!validId(q.id) || ids.has(q.id)) add(`${path}.id`, 'Question identifiers must be valid and unique.')
    ids.add(q.id)
    if (!text(q.title, LIMITS.title)) add(`${path}.title`, `Enter a question title of 1–${LIMITS.title} characters.`)
    if (!Object.hasOwn(FIELD_TYPES, q.type)) add(`${path}.type`, 'Select a supported question type.')
    if (typeof q.required !== 'boolean') add(`${path}.required`, 'Required must be true or false.')
    if (!Array.isArray(q.choices)) { add(`${path}.choices`, 'Choices must be an array.'); return }
    if (!hasChoices(q.type) && q.choices.length) add(`${path}.choices`, 'Text questions cannot have choices.')
    if (hasChoices(q.type) && (q.choices.length < 2 || q.choices.length > LIMITS.choices)) add(`${path}.choices`, `Provide 2–${LIMITS.choices} choices.`)
    const labels = new Set(), choiceIds = new Set()
    q.choices.forEach(c => {
      if (!object(c) || !validId(c.id) || choiceIds.has(c.id)) add(`${path}.choices`, 'Choice identifiers must be valid and unique.')
      if (!text(c?.label, LIMITS.choice)) add(`${path}.choices`, `Choice labels must contain 1–${LIMITS.choice} characters.`)
      const label = typeof c?.label === 'string' ? c.label.trim().normalize('NFKC').toLocaleLowerCase('en') : ''
      if (labels.has(label)) add(`${path}.choices`, 'Choice labels must not be duplicated.')
      labels.add(label); choiceIds.add(c?.id)
    })
  })
  return issues
}

export function validateAnswers(form, answers) {
  if (validateDefinition(form).length) return [{ path: 'form', message: 'Correct the form definition before testing answers.' }]
  if (!object(answers)) return [{ path: 'form', message: 'Answers must be an object.' }]
  const issues = [], ids = new Set(form.questions.map(q => q.id))
  for (const id of Object.keys(answers)) if (!ids.has(id)) issues.push({ path: 'form', message: 'An answer refers to an unknown question.' })
  for (const q of form.questions) {
    const value = Object.hasOwn(answers, q.id) ? answers[q.id] : undefined
    const blank = value === undefined || (q.type === 'checkbox' ? Array.isArray(value) && !value.length : typeof value === 'string' && !value.trim())
    const add = message => issues.push({ path: q.id, message })
    if (blank) { if (q.required) add('Please answer this required question.'); continue }
    if (q.type === 'checkbox') {
      if (!Array.isArray(value) || value.length > q.choices.length || new Set(value).size !== value.length || value.some(id => !q.choices.some(c => c.id === id))) add('Choose only the listed options, without duplicates.')
    } else if (hasChoices(q.type)) {
      if (typeof value !== 'string' || !q.choices.some(c => c.id === value)) add('Choose one of the listed options.')
    } else if (typeof value !== 'string' || value.length > LIMITS[q.type]) add(`Use at most ${LIMITS[q.type]} characters.`)
  }
  return issues
}

// Pure local editor operations. Order is the array order; IDs never change on move.
export function updateQuestions(questions, action) {
  if (action.type === 'add') return questions.length >= LIMITS.questions ? questions : [...questions, { id: action.id, title: '', type: 'short', required: false, choices: [] }]
  const index = questions.findIndex(q => q.id === action.id)
  if (index < 0) return questions
  if (action.type === 'remove') return questions.filter(q => q.id !== action.id)
  if (action.type === 'move') {
    const target = index + action.direction
    if (![-1, 1].includes(action.direction) || target < 0 || target >= questions.length) return questions
    const next = [...questions]; [next[index], next[target]] = [next[target], next[index]]; return next
  }
  return questions.map(q => {
    if (q.id !== action.id) return q
    switch (action.type) {
      case 'title': return { ...q, title: action.value }
      case 'required': return { ...q, required: action.value }
      case 'fieldType': return Object.hasOwn(FIELD_TYPES, action.value) ? { ...q, type: action.value, choices: hasChoices(action.value) ? q.choices : [] } : q
      case 'addChoice': return !hasChoices(q.type) || q.choices.length >= LIMITS.choices ? q : { ...q, choices: [...q.choices, { id: action.choiceId, label: '' }] }
      case 'editChoice': return { ...q, choices: q.choices.map(c => c.id === action.choiceId ? { ...c, label: action.value } : c) }
      case 'removeChoice': return { ...q, choices: q.choices.filter(c => c.id !== action.choiceId) }
      default: return q
    }
  })
}
