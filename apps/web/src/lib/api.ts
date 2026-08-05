import { hc } from 'hono/client'
import type { AppType } from '@pfinance/server'

// Typed RPC client over the server's chained route schema; cookies ride
// along on every call (cross-origin session).
export const api = hc<AppType>(import.meta.env.VITE_API_URL, {
  init: { credentials: 'include' },
})
