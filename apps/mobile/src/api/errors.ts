import { ApiError } from '@pfinance/api-client'
import type { UseQueryResult } from '@tanstack/react-query'

// How a failed request reads on screen. The 401 case is not a message: the
// session is gone, expired (ADR 0005) or revoked from another device, and
// the query client is already navigating to sign-in (api/query-client.ts) —
// so there is nothing for the screen to say. Anything else is the Server's
// own message, on a connection that is otherwise intact.

export const isUnauthorized = (failure: unknown): boolean =>
  failure instanceof ApiError && failure.status === 401

export const errorMessage = (failure: unknown): string | null => {
  if (failure === null || failure === undefined || isUnauthorized(failure)) return null
  return failure instanceof Error ? failure.message : 'Request failed'
}

// A screen usually watches several queries at once and has room for one
// error line: the first failure is the one it shows, and retry re-runs only
// what actually failed.
export function queryFailure(queries: Pick<UseQueryResult, 'error' | 'refetch'>[]): {
  error: string | null
  retry: () => void
} {
  const failed = queries.filter((query) => query.error !== null)
  return {
    error:
      failed.map((query) => errorMessage(query.error)).find((message) => message !== null) ?? null,
    retry: () => {
      for (const query of failed) void query.refetch()
    },
  }
}
