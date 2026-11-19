export class ApiClientError extends Error {
  constructor(code, message, status = 0) { super(message); this.code = code; this.status = status }
}

// Opt-in only: no existing service is migrated. The server verifies every token.
export function createApiClient({ supabase, baseUrl, fetchImpl = fetch }) {
  const target = new URL(baseUrl)
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password || target.search || target.hash || target.pathname !== '/') {
    throw new Error('API base URL must be an explicit HTTP(S) origin.')
  }
  return {
    async get(path, { signal, isCurrent = () => true } = {}) {
      if (!/^\/api\/[A-Za-z0-9/_-]+$/.test(path)) throw new ApiClientError('INVALID_REQUEST', 'Invalid API path.')
      let changed = false
      let initialUser
      const controller = new AbortController()
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT' || (event === 'SIGNED_IN' && !initialUser) || (initialUser && session?.user?.id !== initialUser)) {
          changed = true
          controller.abort()
        }
      })
      const current = () => {
        if (changed || !isCurrent()) throw new ApiClientError('SESSION_CHANGED', 'Your session changed. Please try again.')
      }
      try {
        current()
        if (signal?.aborted) throw new DOMException('Request cancelled.', 'AbortError')
        const { data, error } = await supabase.auth.getSession()
        current()
        if (error || !data?.session?.access_token) throw new ApiClientError('UNAUTHORIZED', 'Please sign in again.', 401)
        if (!data.session.user?.id || (data.session.expires_at && data.session.expires_at * 1000 <= Date.now())) {
          throw new ApiClientError('UNAUTHORIZED', 'Please sign in again.', 401)
        }
        initialUser = data.session.user.id
        const response = await fetchImpl(target.origin + path, {
          method: 'GET', credentials: 'omit', cache: 'no-store', redirect: 'error',
          headers: { Authorization: `Bearer ${data.session.access_token}` },
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000), ...(signal ? [signal] : [])]),
        })
        let result
        try { result = await response.json() } catch {
          current()
          if (response.ok) throw new ApiClientError('INVALID_RESPONSE', 'The API returned an invalid response.', response.status)
        }
        current()
        if (!response.ok) throw new ApiClientError(result?.error?.code || 'API_ERROR', response.status === 401 ? 'Please sign in again.' : 'The request could not be completed. Please try again.', response.status)
        return result.data
      } catch (error) {
        current()
        if (signal?.aborted) throw new DOMException('Request cancelled.', 'AbortError')
        if (error instanceof ApiClientError) throw error
        throw new ApiClientError('NETWORK_ERROR', 'Unable to reach the API. Please try again.')
      } finally { subscription.unsubscribe() }
    },
  }
}
