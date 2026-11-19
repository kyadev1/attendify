import { ApiClientError, createApiClient } from './apiClient.js'

// Prepared adapter only. No production page/provider imports this module.
export function createDevelopmentEventApi({ supabase, env = import.meta.env, fetchImpl = fetch }) {
  const enabled = env?.DEV === true && env?.PROD !== true && env?.VITE_ENABLE_EXPRESS_EVENT_READ === 'true'
  // Disabled mode must not require a configured backend or construct its client.
  const client = enabled ? createApiClient({ supabase, baseUrl: env.VITE_API_BASE_URL, fetchImpl }) : null
  return {
    enabled,
    async getEvent(id, { signal, isCurrent } = {}) {
      if (!client) throw new ApiClientError('FEATURE_DISABLED', 'Development API event reads are disabled.')
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(id) || typeof isCurrent !== 'function') {
        throw new ApiClientError('INVALID_REQUEST', 'An event identifier and current-account scope are required.')
      }
      // Caller must capture account generation AND role/lifetime, just like
      // EventsProvider. Never cache results across scopes or bypass API errors.
      const row = await client.get(`/api/events/${id}`, { signal, isCurrent })
      if (!row || row.id !== id) throw new ApiClientError('INVALID_RESPONSE', 'The API returned an invalid event.')
      return row
    },
  }
}
