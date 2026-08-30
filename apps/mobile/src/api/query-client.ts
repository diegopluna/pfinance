import AsyncStorage from '@react-native-async-storage/async-storage'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
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
        // Cached rows must outlive the persister's window or a restart
        // would garbage-collect what it just restored (issue #83).
        gcTime: OFFLINE_CACHE_MAX_AGE,
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

// Offline reads (issue #83, ADR 0007): the query cache persists to device
// storage so the last-known dashboards, Accounts and Transactions render
// with no connectivity — reads may serve from cache. Mutations are
// deliberately NEVER dehydrated: a persisted write replayed later could
// land on a Server whose apiVersion changed while the phone was offline,
// which is exactly the queue ADR 0007 forbids. Note also what is absent:
// no NetInfo/onlineManager wiring — with it, TanStack would PAUSE offline
// mutations into a silent retry queue; without it every write fires,
// fails fast, and speaks (api-client's ConnectionError).
export const OFFLINE_CACHE_MAX_AGE = 1000 * 60 * 60 * 24 * 14

export const queryPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'goblin-query-cache',
})

export const persistOptions = {
  persister: queryPersister,
  maxAge: OFFLINE_CACHE_MAX_AGE,
  dehydrateOptions: { shouldDehydrateMutation: () => false },
}

// React Query's focus tracking is written for a browser; on a phone the
// equivalent signal is the app returning to the foreground.
export const trackAppStateFocus = (): (() => void) => {
  const subscription = AppState.addEventListener('change', (status: AppStateStatus) => {
    focusManager.setFocused(status === 'active')
  })
  return () => subscription.remove()
}
