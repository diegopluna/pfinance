import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { InferRequestType } from 'hono/client'
import { api } from '@/lib/api'
import { call } from '@/lib/api-call'
import { keys } from '@/lib/query-keys'

type CategoryFields = InferRequestType<typeof api.api.categories.$post>['json']

// The Household's Category vocabulary (ADR 0003) — shared between the
// Categories screen (per showArchived flag) and the Transactions screen
// (archived included, so rows carrying a retired label still name it).
export function useCategories(includeArchived: boolean) {
  return useQuery({
    queryKey: keys.categories(includeArchived),
    queryFn: () =>
      call(
        api.api.categories.$get({ query: { includeArchived: includeArchived ? 'true' : 'false' } }),
        'Failed to load categories',
      ),
  })
}

export function useCategoryMutations() {
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: ({ id, fields }: { id: string | null; fields: CategoryFields }) =>
      id === null
        ? call(api.api.categories.$post({ json: fields }), 'Failed to save the category')
        : call(
            api.api.categories[':id'].$patch({ param: { id }, json: fields }),
            'Failed to save the category',
          ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.categories() }),
  })
  const setArchived = useMutation({
    mutationFn: ({ id, archive }: { id: string; archive: boolean }) => {
      const route = api.api.categories[':id']
      return archive
        ? call(route.archive.$post({ param: { id } }), 'Failed to update the category')
        : call(route.unarchive.$post({ param: { id } }), 'Failed to update the category')
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.categories() }),
  })
  return { save, setArchived }
}
