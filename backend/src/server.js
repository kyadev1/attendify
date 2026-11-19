import { pathToFileURL } from 'node:url'
import { createApp } from './app.js'
import { loadConfig } from './config/env.js'

export function startServer(config, dependencies) {
  const server = createApp(config, dependencies).listen(config.port, config.host)
  server.requestTimeout = 15000
  server.headersTimeout = 10000
  server.keepAliveTimeout = 5000
  return server
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const server = startServer(loadConfig())
    server.on('listening', () => console.info('Attendify API is listening.'))
    server.on('error', () => { console.error('API startup failed. Check server configuration and port availability.'); process.exitCode = 1 })
    let stopping = false
    const shutdown = () => {
      if (stopping) return
      stopping = true
      const deadline = setTimeout(() => { server.closeAllConnections(); process.exitCode = 1 }, 15000)
      deadline.unref()
      server.close(() => { clearTimeout(deadline) })
      server.closeIdleConnections()
    }
    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
  } catch {
    console.error('API configuration is invalid. See backend/.env.example; no secrets are logged.')
    process.exitCode = 1
  }
}
