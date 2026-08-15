import { focusManager, MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { AppState, type AppStateStatus } from 'react-native'
import { isUnauthorized } from '@/api/errors'

// The app's one cache. Two policies live here rather than at any call site:
//
// **A 401 is a navigation, not an error.** The session is gone — expired
// (ADR 0005) or revoked from another device — while the Server connection
// is intact, so the app asks for credentials again instead of restarting
// the connect flow. It fires from both caches, so a stale session found by
// a background refetch and one found by a save land in the same place.
// Screens render nothing for it (api/errors.ts).
//
// **Retries stop at auth.** Repeating a request the Server just refused is
// only a delay in front of the sign-in screen; everything else gets two
// more attempts before a self-hosted Server is called unreachable.
const signInOnUnauthorized = (failure: unknown) => {
  if (isUnauthorized(failure)) router.replace('/sign-in')
}

export const createQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: (count, failure) => !isUnauthorized(failure) && count < 2,
        // A household checks its numbers, switches away, and comes back —
        // refetchOnWindowFocus needs the React Native bridge below to mean
        // anything, and with it the ledger is current on every return.
        refetchOnWindowFocus: true,
      },
      mutations: { retry: false },
    },
    queryCache: new QueryCache({ onError: signInOnUnauthorized }),
    mutationCache: new MutationCache({ onError: signInOnUnauthorized }),
  })

// React Query's focus tracking is written for a browser; on a phone the
// equivalent signal is the app returning to the foreground.
export const trackAppStateFocus = (): (() => void) => {
  const subscription = AppState.addEventListener('change', (status: AppStateStatus) => {
    focusManager.setFocused(status === 'active')
  })
  return () => subscription.remove()
}
