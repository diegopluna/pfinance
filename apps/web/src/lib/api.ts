import { createApiClient } from '@pfinance/api-client'

// The web app's single client instance; cookies ride along on every call
// (cross-origin session).
export const api = createApiClient(import.meta.env.VITE_API_URL, {
  init: { credentials: 'include' },
})
