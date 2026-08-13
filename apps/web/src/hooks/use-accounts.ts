import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { InferRequestType } from 'hono/client'
import { api } from '@/lib/api'
import { call } from '@pfinance/api-client'
import { keys } from '@/lib/query-keys'

type AccountFields = InferRequestType<typeof api.api.accounts.$post>['json']

// The Household's Accounts with their server-derived Balances (ADR 0001) —
// shared query between the Accounts screen, the Dashboard, and the ledger
// screens so all read one cache entry per includeArchived flag and a
// mutation on any screen refreshes the others.
export function useAccounts(includeArchived: boolean) {
  return useQuery({
    queryKey: keys.accounts(includeArchived),
    queryFn: () =>
      call(
        api.api.accounts.$get({ query: { includeArchived: includeArchived ? 'true' : 'false' } }),
        'Failed to load accounts',
      ),
  })
}

// The Account write surface: create-or-rename and the archive flip. Each is
// the mutation object itself, so dialogs keep reset()/isPending/error
// semantics; invalidation is owned here, UI side effects stay at call sites.
export function useAccountMutations() {
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: ({ id, fields }: { id: string | null; fields: AccountFields }) =>
      id === null
        ? call(api.api.accounts.$post({ json: fields }), 'Failed to save the account')
        : call(
            api.api.accounts[':id'].$patch({ param: { id }, json: fields }),
            'Failed to save the account',
          ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.accounts() }),
  })
  const setArchived = useMutation({
    mutationFn: ({ id, archive }: { id: string; archive: boolean }) => {
      const route = api.api.accounts[':id']
      return archive
        ? call(route.archive.$post({ param: { id } }), 'Failed to update the account')
        : call(route.unarchive.$post({ param: { id } }), 'Failed to update the account')
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.accounts() }),
  })
  return { save, setArchived }
}
