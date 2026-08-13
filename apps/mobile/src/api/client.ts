import { createApiClient, type ApiClient } from '@pfinance/api-client'
import { sessionCookie } from '@/auth/client'

// The typed RPC client for the connected Server (issue #78), replaying the
// secure-store session cookie as a header on every request — the transport
// the seam test in apps/server/test/integ.test.ts pins. The base URL is a
// runtime value (whichever Server the user connected), so this is a factory
// memoized on the URL, like auth/client.ts: the app holds one Server at a
// time, and a stable client keeps screen-level fetch callbacks stable.
let cached: { apiUrl: string; api: ApiClient } | null = null

export const apiFor = (apiUrl: string): ApiClient => {
  if (cached?.apiUrl !== apiUrl) {
    cached = {
      apiUrl,
      api: createApiClient(apiUrl, {
        headers: () => ({ cookie: sessionCookie(apiUrl) }),
      }),
    }
  }
  return cached.api
}
