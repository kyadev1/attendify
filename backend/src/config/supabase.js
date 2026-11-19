import { createClient } from '@supabase/supabase-js'

// Each request gets its own client. Never store a user's token in a shared client.
export function userClientFactory(config, create = createClient) {
  return token => create(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      headers: { Authorization: `Bearer ${token}` },
      fetch: (url, options = {}) => fetch(url, { ...options, signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000) }),
    },
  })
}
