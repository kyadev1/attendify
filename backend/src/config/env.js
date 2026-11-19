export function loadConfig(env = process.env) {
  const url = new URL(env.SUPABASE_URL || 'invalid')
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Invalid SUPABASE_URL configuration.')
  const key = env.SUPABASE_PUBLISHABLE_KEY || ''
  let publicKey = key.startsWith('sb_publishable_')
  if (!publicKey) {
    try { publicKey = JSON.parse(Buffer.from(key.split('.')[1], 'base64url')).role === 'anon' } catch { /* Not a legacy anonymous key. */ }
  }
  if (!publicKey) throw new Error('A Supabase publishable or legacy anon key is required. Privileged keys are forbidden.')
  const origins = (env.CORS_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean)
  if (!origins.length || origins.some(origin => {
    try { const parsed = new URL(origin); return !['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin } catch { return true }
  })) throw new Error('CORS_ORIGINS must contain explicit HTTP(S) origins.')
  const port = Number(env.PORT || 3001)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT.')
  return { url: url.origin, key, origins, port, host: env.HOST || '127.0.0.1' }
}
