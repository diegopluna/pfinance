import { call } from '@pfinance/api-client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { connectedApi } from '@/api/client'
import { keys } from '@/api/query-keys'

// The Household's Categories. Archived ones still name existing rows, so
// the ledger loads the full vocabulary and filters for pickers itself.
export function useCategories(includeArchived: boolean) {
  const { api, enabled } = connectedApi()
  return useQuery({
    queryKey: keys.categories(includeArchived),
    queryFn: () =>
      call(
        api.api.categories.$get({ query: { includeArchived: includeArchived ? 'true' : 'false' } }),
        'Could not load your Categories.',
      ),
    enabled,
  })
}

// Name-only Category creation, from inside the quick-entry form (issue
// #80) — Category management proper stays on the web. The invalidation is
// awaited, so by the time `create` resolves the new Category is already in
// the list the form is rendering its chips from.
export function useCategoryMutations() {
  const { api } = connectedApi()
  const queryClient = useQueryClient()
  const create = useMutation({
    mutationFn: (name: string) =>
      call(api.api.categories.$post({ json: { name } }), 'Could not create the category.'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.categories() }),
  })
  return { create }
}
