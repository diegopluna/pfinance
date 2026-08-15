import { call, type ApiClient } from '@pfinance/api-client'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { InferRequestType } from 'hono/client'
import { connectedApi } from '@/api/client'
import { invalidateLedger, keys } from '@/api/query-keys'

type TransactionFields = InferRequestType<ApiClient['api']['transactions']['$post']>['json']
type TransactionQuery = InferRequestType<ApiClient['api']['transactions']['$get']>['query']

// The filtered Ledger (issue #78). The filters object is part of the key,
// so each combination caches separately and stepping back to a previous
// filter is instant; the previous list holds while a search keystroke
// refetches, so it never blinks empty per character.
export function useTransactions(filters: TransactionQuery) {
  const { api, enabled } = connectedApi()
  return useQuery({
    queryKey: keys.transactions(filters),
    queryFn: () =>
      call(api.api.transactions.$get({ query: filters }), 'Could not load your Transactions.'),
    placeholderData: keepPreviousData,
    enabled,
  })
}

// The Transaction write surface (issue #80). Every success runs the
// derived-ledger invalidation (api/query-keys.ts): Balances, Net Worth and
// both monthly views are sums over exactly these rows, and the home screen
// is where a save returns to.
export function useTransactionMutations() {
  const { api } = connectedApi()
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: ({ id, fields }: { id: string | null; fields: TransactionFields }) =>
      id === null
        ? call(api.api.transactions.$post({ json: fields }), 'Could not save the transaction.')
        : call(
            api.api.transactions[':id'].$patch({ param: { id }, json: fields }),
            'Could not save the transaction.',
          ),
    onSuccess: () => invalidateLedger(queryClient),
  })
  const remove = useMutation({
    mutationFn: (id: string) =>
      call(
        api.api.transactions[':id'].$delete({ param: { id } }),
        'Could not delete the transaction.',
      ),
    onSuccess: () => invalidateLedger(queryClient),
  })
  return { save, remove }
}
