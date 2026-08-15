import { createApiClient, type ApiClient } from '@pfinance/api-client'
import { sessionCookie } from '@/auth/client'
import { storedServerUrl } from '@/connect/store'

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

// What the query hooks talk to. The web's client is a module singleton
// because its origin is the page's; here the Server is a runtime value, so
// every hook resolves it at call time and reports whether there is one at
// all. `enabled: false` is the honest state between sign-out and the
// redirect that follows it — there is no Server to ask.
export const connectedApi = (): { api: ApiClient; enabled: boolean } => {
  const apiUrl = storedServerUrl()
  return { api: apiFor(apiUrl ?? ''), enabled: apiUrl !== null }
}
