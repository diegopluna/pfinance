import { call, type ApiClient } from '@pfinance/api-client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { InferRequestType } from 'hono/client'
import { connectedApi } from '@/api/client'
import { invalidateLedger } from '@/api/query-keys'

type TransferFields = InferRequestType<ApiClient['api']['transfers']['$post']>['json']

// The Transfer write surface (issue #81): both legs move atomically
// server-side, so the same derived-ledger invalidation covers them. Reads
// happen through the Transactions list — a Transfer has no list of its own,
// and a leg is only ever edited through its pair.
export function useTransferMutations() {
  const { api } = connectedApi()
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: ({ id, fields }: { id: string | null; fields: TransferFields }) =>
      id === null
        ? call(api.api.transfers.$post({ json: fields }), 'Could not save the transfer.')
        : call(
            api.api.transfers[':id'].$patch({ param: { id }, json: fields }),
            'Could not save the transfer.',
          ),
    onSuccess: () => invalidateLedger(queryClient),
  })
  const remove = useMutation({
    mutationFn: (id: string) =>
      call(api.api.transfers[':id'].$delete({ param: { id } }), 'Could not delete the transfer.'),
    onSuccess: () => invalidateLedger(queryClient),
  })
  return { save, remove }
}
