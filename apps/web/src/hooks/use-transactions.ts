import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { InferRequestType } from 'hono/client'
import { api } from '@/lib/api'
import { call } from '@pfinance/api-client'
import { invalidateLedger, keys } from '@/lib/query-keys'

type TransactionFields = InferRequestType<typeof api.api.transactions.$post>['json']
type TransactionQuery = InferRequestType<typeof api.api.transactions.$get>['query']

// The filtered Transactions list. The filters object is part of the key, so
// each filter combination caches separately; the previous page holds while a
// filter keystroke refetches, so the list doesn't blink empty per character.
export function useTransactions(filters: TransactionQuery) {
  return useQuery({
    queryKey: keys.transactions(filters),
    queryFn: () =>
      call(api.api.transactions.$get({ query: filters }), 'Failed to load transactions'),
    placeholderData: keepPreviousData,
  })
}

// The Transaction write surface. Every success runs the derived-ledger
// invalidation (query-keys.ts): Balances are sums over these rows.
export function useTransactionMutations() {
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: ({ id, fields }: { id: string | null; fields: TransactionFields }) =>
      id === null
        ? call(api.api.transactions.$post({ json: fields }), 'Failed to save the transaction')
        : call(
            api.api.transactions[':id'].$patch({ param: { id }, json: fields }),
            'Failed to save the transaction',
          ),
    onSuccess: () => invalidateLedger(queryClient),
  })
  const remove = useMutation({
    mutationFn: (id: string) =>
      call(
        api.api.transactions[':id'].$delete({ param: { id } }),
        'Failed to delete the transaction',
      ),
    onSuccess: () => invalidateLedger(queryClient),
  })
  return { save, remove }
}
