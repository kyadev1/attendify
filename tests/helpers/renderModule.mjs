import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { transformWithOxc } from 'vite'
import { eventRequestError, eventFormError } from '../../src/utils/eventRequestError.js'
import { readAllPages, requireActiveRead } from '../../src/services/readAllPages.js'

export const event = { id: 'event-1', organizerId: 'organizer-1', title: 'Campus Event', category: 'Academic', startsAt: '2026-11-10T01:00:00Z', endsAt: '2026-11-10T03:00:00Z', slots: 20, status: 'published', location: 'Hall' }
export function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const equalDeps = (left, right) => left && right && left.length === right.length && left.every((value, index) => Object.is(value, right[index]))

// Runs actual module handlers with isolated React hooks. Effects are opt-in so
// tests can control cleanup, remounts, auth boundaries, and deferred responses.
export async function mount(file, { role = 'organizer', events = {}, logout = async () => {}, modules = {}, initial = [], effects = false, globals = {}, importMeta = {} } = {}) {
  const source = await readFile(new URL('../../' + file, import.meta.url), 'utf8')
  const { code } = await transformWithOxc(source, file, { jsx: { runtime: 'automatic' } })
  let slots = file.endsWith('EventsProvider.jsx') && initial.length
    ? [{ owner: JSON.stringify([0, role + '-1', role]), eventsList: initial[0] || [], registrationRows: initial[1] || [], attendanceRecords: initial[2] || [], counts: initial[3] || {}, loading: initial[4] ?? true, error: initial[5] || '', hasLoaded: initial[4] === false, loadFailure: null }]
    : [...initial]
  let cursor = 0
  let childIdentity
  let deferUpdates = false
  const queuedUpdates = []
  const navigations = []
  const dynamicImports = []
  const auth = { user: { id: role + '-1', role, name: 'Test User' }, sessionGeneration: 0 }
  auth.isSessionCurrent = generation => auth.sessionGeneration === generation
  const jsx = (type, props, key) => ({ type, props, key })
  const react = {
    Component: class { constructor(props) { this.props = props } },
    lazy: loader => ({ lazyLoader: loader }),
    Suspense: 'Suspense',
    useId() { return react.useMemo(() => 'test-id-' + cursor, []) },
    useState(value) {
      const storage = slots, index = cursor++
      if (!(index in storage)) storage[index] = typeof value === 'function' ? value() : value
      return [storage[index], next => {
        const apply = () => { storage[index] = typeof next === 'function' ? next(storage[index]) : next }
        if (deferUpdates) queuedUpdates.push(apply)
        else apply()
      }]
    },
    useRef(value) {
      const index = cursor++
      if (!(index in slots)) slots[index] = { current: value }
      return slots[index]
    },
    useEffect(effect, deps) {
      const index = cursor++, old = slots[index]
      if (!effects) return
      if (!old || !equalDeps(old.deps, deps)) slots[index] = { effect, deps, cleanup: old?.cleanup, pending: true, effectHook: true }
    },
    useMemo(fn, deps) {
      const index = cursor++
      if (!slots[index] || !equalDeps(slots[index].deps, deps)) slots[index] = { value: fn(), deps }
      return slots[index].value
    },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps) },
    useSyncExternalStore(subscribe, getSnapshot) {
      const [, update] = react.useState(getSnapshot)
      react.useEffect(() => subscribe(() => update(getSnapshot())), [subscribe, getSnapshot])
      return getSnapshot()
    },
  }
  const context = vm.createContext({ console, setTimeout, clearTimeout, AbortController, ...globals })
  const module = new vm.SourceTextModule(code, { context, initializeImportMeta: meta => Object.assign(meta, importMeta), importModuleDynamically: async specifier => {
    dynamicImports.push(specifier)
    const exports = modules[specifier]
    if (!exports) throw new Error('No isolated dynamic module: ' + specifier)
    const dynamic = new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value)
    }, { context })
    await dynamic.link(() => {})
    await dynamic.evaluate()
    return dynamic
  } })
  await module.link(async specifier => {
    let exports
    if (specifier === 'react') exports = react
    else if (specifier === 'react/jsx-runtime') exports = { jsx, jsxs: jsx, Fragment: 'Fragment' }
    else if (specifier === 'react-router-dom' && !modules[specifier]) exports = { Routes: 'Routes', Route: 'Route', Navigate: 'Navigate', Outlet: 'Outlet', Link: 'Link', useLocation: () => ({ pathname: role === 'organizer' ? '/organizer/events' : '/dashboard' }), useNavigate: () => (...args) => navigations.push(args), useParams: () => ({ id: event.id }) }
    else if (specifier.endsWith('/useAuth')) exports = { default: () => ({ ...auth, logout }) }
    else if (specifier.endsWith('/useEvents')) exports = { default: () => ({ events: [event], registrations: [], loading: false, hasLoaded: true, error: '', loadFailure: null, ...events }) }
    else if (modules[specifier]) exports = modules[specifier]
    else if (specifier.endsWith('/eventRequestError')) exports = { eventRequestError, eventFormError }
    else if (specifier.endsWith('/readAllPages')) exports = { readAllPages, requireActiveRead }
    else if (specifier.endsWith('/useRealtimeAttendance')) exports = { default: () => {} }
    else if (specifier.endsWith('Context') || specifier.endsWith('authContext') || specifier.endsWith('eventsContext')) exports = { AuthContext: { Provider: 'Provider' }, EventsContext: { Provider: 'Provider' } }
    else if (specifier.endsWith('.css')) exports = { default: new Proxy({}, { get: (_, key) => key }) }
    else if (/\.(png|jpg|webp)$/.test(specifier)) exports = { default: specifier }
    else {
      const names = [...source.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g)]
        .filter(match => match[2] === specifier)
        .flatMap(match => match[1].split(',').map(name => name.trim()).filter(Boolean))
      exports = Object.fromEntries(names.map(name => [name, () => {}]))
      exports.default = specifier.includes('/Button') ? 'Button' : 'Modal'
    }
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value)
    }, { context })
  })
  await module.evaluate()
  function cleanup() {
    for (const slot of slots) if (slot?.effectHook) { slot.cleanup?.(); slot.cleanup = undefined }
  }
  return {
    get slots() { return slots }, navigations, dynamicImports, auth,
    setAuth(user, generation = auth.sessionGeneration + 1) { auth.user = user; auth.sessionGeneration = generation },
    render(props = {}) {
      cursor = 0
      let tree = module.namespace.default(props)
      if (typeof tree?.type === 'function') {
        if (childIdentity && (childIdentity.type !== tree.type || childIdentity.key !== tree.key)) {
          cleanup()
          slots = []
        }
        childIdentity = { type: tree.type, key: tree.key }
        cursor = 0
        tree = tree.type(tree.props)
      }
      return tree
    },
    renderComponent(component, props) {
      cursor = 0
      return component(props)
    },
    flushEffects() {
      for (const slot of slots) if (slot?.effectHook && slot.pending) {
        slot.cleanup?.()
        slot.cleanup = slot.effect()
        slot.pending = false
      }
    },
    replayEffects() {
      cleanup()
      for (const slot of slots) if (slot?.effectHook) slot.pending = true
      this.flushEffects()
    },
    deferUpdates() { deferUpdates = true },
    flushUpdates() { deferUpdates = false; for (const apply of queuedUpdates.splice(0)) apply() },
    unmount: cleanup,
    exports: module.namespace,
  }
}
export function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes)
  if (!tree || typeof tree !== 'object') return []
  return [tree, ...nodes(tree.props?.children), ...nodes(tree.props?.actions)]
}
export function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join('')
  if (tree == null || tree === false) return ''
  if (typeof tree !== 'object') return String(tree)
  return text(tree.props?.children)
}
export function button(tree, label) {
  const result = nodes(tree).find(node => ['Button', 'button'].includes(node.type) && text(node) === label)
  assert.ok(result, 'Missing button: ' + label)
  return result
}
