import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build, preview } from 'vite'
import { mount, nodes, text, button } from './helpers/renderModule.mjs'

const exportsByGroup = {
  './routes/authPages': ['Login', 'OrganizerLogin', 'Register'],
  './routes/studentPages': ['StudentLayout', 'StudentDashboard', 'BrowseEvents', 'EventDetails', 'MyBookings', 'Profile'],
  './routes/organizerPages': ['OrganizerLayout', 'OrganizerDashboard', 'MyEvents', 'CreateEditEvent', 'EventManagement'],
  './routes/attendancePages': ['AttendanceDashboard', 'Reports'],
  './pages/student/components/QRTicket': ['default'],
  './pages/organizer/components/QRScanner': ['default'],
}
const routes = [
  ['/login', 'Login', './routes/authPages'], ['/organizer/login', 'OrganizerLogin', './routes/authPages'], ['/register', 'Register', './routes/authPages'],
  ['/dashboard', 'StudentDashboard', './routes/studentPages'], ['/browse', 'BrowseEvents', './routes/studentPages'], ['/events/:id', 'EventDetails', './routes/studentPages'],
  ['/bookings', 'MyBookings', './routes/studentPages'], ['/ticket/:regId', 'default', './pages/student/components/QRTicket'], ['/profile', 'Profile', './routes/studentPages'],
  ['/organizer', 'OrganizerDashboard', './routes/organizerPages'], ['/organizer/events', 'MyEvents', './routes/organizerPages'], ['/organizer/events/new', 'CreateEditEvent', './routes/organizerPages'],
  ['/organizer/events/:id/edit', 'CreateEditEvent', './routes/organizerPages'], ['/organizer/events/:id', 'EventManagement', './routes/organizerPages'],
  ['/organizer/events/:id/scan', 'default', './pages/organizer/components/QRScanner'], ['/organizer/events/:id/attendance', 'AttendanceDashboard', './routes/attendancePages'], ['/organizer/events/:id/reports', 'Reports', './routes/attendancePages'],
]

test('all Student/Organizer/auth routes defer page imports behind accessible Suspense boundaries', async () => {
  const modules = Object.fromEntries(Object.entries(exportsByGroup).map(([group, names]) => [group, Object.fromEntries(names.map(name => [name, group + ':' + name]))]))
  const app = await mount('src/App.jsx', { modules })
  const tree = app.render(); assert.equal(app.dynamicImports.length, 0)
  for (const [path, name, group] of routes) {
    const route = nodes(tree).find(node => node.type === 'Route' && node.props.path === path)
    assert.ok(route, path)
    const element = route.props.element
    assert.ok(element.key, 'Each lazy page has its own recovery boundary')
    const suspense = nodes(element).find(node => node.type === 'Suspense')
    assert.equal(suspense.props.fallback.props.role, 'status')
    const lazy = nodes(element).find(node => node.type?.lazyLoader)
    const loaded = await lazy.type.lazyLoader()
    assert.equal(loaded.default, group + ':' + name)
    assert.equal(app.dynamicImports.at(-1), group)
  }
  const guards = nodes(tree).filter(node => node.type === 'Route' && node.props.element?.props.role)
  assert.deepEqual(guards.map(node => node.props.element.props.role), ['student', 'organizer'])
})
for (const role of ['student', 'organizer']) test(role+' guard preserves loading, signed-out redirect, role denial and direct-link access', async () => {
  const direct = role === 'student' ? '/ticket/direct-registration' : '/organizer/events/direct-event/attendance'
  const app = await mount('src/routes/ProtectedRoute.jsx', { role, modules: { 'react-router-dom': { Navigate: 'Navigate', Outlet: 'Outlet', useLocation: () => ({ pathname: direct }) } } })
  assert.equal(app.render({ role }).type, 'Outlet')
  app.auth.loading = true; assert.equal(app.render({ role }).props.role, 'status')
  app.auth.loading = false; app.setAuth(null)
  const denied = app.render({ role }); assert.equal(denied.type, 'Navigate'); assert.equal(denied.props.to, role === 'student' ? '/login' : '/organizer/login')
  assert.equal(denied.props.state.from, direct)
  app.setAuth({ id: 'wrong-role', role: role === 'student' ? 'organizer' : 'student' })
  assert.equal(app.render({ role }).props.to, role === 'student' ? '/organizer' : '/dashboard')
})
test('route download failures provide safe reload recovery', async () => {
  let reloads = 0
  const app = await mount('src/routes/PageBoundary.jsx', { globals: { window: { location: { reload: () => { reloads++ } } } } })
  const Boundary = app.exports.default, component = new Boundary({ children: 'Page' })
  assert.equal(component.render(), 'Page')
  component.state = Boundary.getDerivedStateFromError(Error('secret chunk path'))
  const tree = component.render(); assert.equal(tree.props.role, 'alert'); assert.doesNotMatch(text(tree), /secret/)
  button(tree, 'Reload page').props.onClick(); assert.equal(reloads, 1)
})
test('production entry excludes role pages, QR rendering and camera library; imports resolve and assets are optimized', async () => {
  const result = await build({ build: { write: false }, logLevel: 'silent' })
  const chunks = result.output.filter(item => item.type === 'chunk'), byFile = new Map(chunks.map(chunk => [chunk.fileName, chunk]))
  const initial = new Set()
  function visit(chunk) { if (!chunk || initial.has(chunk)) return; initial.add(chunk); chunk.imports.forEach(file => visit(byFile.get(file))) }
  visit(chunks.find(chunk => chunk.isEntry))
  const ids = [...initial].flatMap(chunk => Object.keys(chunk.modules))
  assert.ok(ids.every(id => !id.includes('/pages/') && !id.includes('/authentication/') && !id.includes('qrcode.react') && !id.includes('html5-qrcode')))
  assert.ok([...initial].reduce((sum, chunk) => sum + Buffer.byteLength(chunk.code), 0) < 550000)
  assert.ok(chunks.every(chunk => Buffer.byteLength(chunk.code) < 500000))
  assert.ok(chunks.length <= 16, 'Do not split each shared icon into a tiny chunk')
  assert.ok(chunks.some(chunk => Object.keys(chunk.modules).some(id => id.includes('html5-qrcode'))))
  const assets = result.output.filter(item => item.type === 'asset' && /\.(jpg|png)$/.test(item.fileName))
  assert.equal(assets.length, 6)
  assert.ok(assets.reduce((sum, asset) => sum + asset.source.length, 0) < 500000)
})
test('production preview serves the SPA shell for direct Student/Organizer URLs and refreshes', async () => {
  const server = await preview({ logLevel: 'silent', preview: { host: '127.0.0.1', port: 0, strictPort: true, open: false } })
  try {
    const { port } = server.httpServer.address()
    for (const [route] of routes) {
      const path = route.replace(':id', 'direct-event').replace(':regId', 'direct-registration')
      const response = await fetch('http://127.0.0.1:' + port + path)
      assert.equal(response.status, 200, path)
      assert.match(await response.text(), /<div id="root"><\/div>/)
    }
  } finally { await new Promise(resolve => server.httpServer.close(resolve)) }
})
