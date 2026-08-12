import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { InferRequestType } from 'hono/client'
import { api } from '@/lib/api'
import { call } from '@/lib/api-call'
import { keys } from '@/lib/query-keys'

type HouseholdPatch = InferRequestType<typeof api.api.household.$patch>['json']

// The signed-in caller's user, Household and role — shared query (same key)
// between the Shell and feature screens so it's fetched once per session.
export function useMe() {
  return useQuery({
    queryKey: keys.me(),
    queryFn: () => call(api.api.me.$get(), 'Failed to load household'),
  })
}

// Household preference writes. They live on /api/me, which every screen
// already watches — invalidating it re-renders everything that reads the
// preference (e.g. every calendar date after a dateFormat change).
export function useHouseholdMutations() {
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: (json: HouseholdPatch) =>
      call(api.api.household.$patch({ json }), 'Failed to save the date format'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.me() }),
  })
  return { save }
}
