import { ApiError } from '@pfinance/api-client'
import { router } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'

// Hand-rolled fetch state for the mobile read screens (issue #78), in the
// home screen's mold: cancelled flag, attempt counter for retry, and the
// 401 → sign-in redirect — the session is gone, expired (ADR 0005) or
// revoked from another device, while the Server connection is intact. The
// previous result holds while a re-run with new inputs is in flight, so a
// filtered list doesn't blink empty per keystroke (the web app's
// keepPreviousData stance).
//
// Callers must keep `load` referentially stable across renders (useCallback
// keyed on its inputs): the effect re-runs on its identity. null skips the
// fetch — the screen is about to Redirect (no stored Server), and hooks
// can't be behind that early return.

export interface ApiQuery<T> {
  data: T | null
  error: string | null
  loading: boolean
  retry: () => void
}

// The one failure treatment every authenticated request shares — reads and
// writes (issue #80's form) alike: a 401 redirects to sign-in and yields
// null (nothing to render — the session is gone, expired per ADR 0005 or
// revoked, while the Server connection is intact); anything else is the
// message for the screen's error line.
export const failureMessage = (failure: unknown): string | null => {
  if (failure instanceof ApiError && failure.status === 401) {
    router.replace('/sign-in')
    return null
  }
  return failure instanceof Error ? failure.message : 'Request failed'
}

export function useApiQuery<T>(load: (() => Promise<T>) | null): ApiQuery<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (load === null) return
    let cancelled = false
    setLoading(true)
    setError(null)
    load().then(
      (body) => {
        if (cancelled) return
        setData(body)
        setLoading(false)
      },
      (failure: unknown) => {
        if (cancelled) return
        const message = failureMessage(failure)
        if (message === null) return
        setError(message)
        setLoading(false)
      },
    )
    return () => {
      cancelled = true
    }
  }, [load, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  return { data, error, loading, retry }
}
