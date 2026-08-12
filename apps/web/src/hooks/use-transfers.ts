import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { InferRequestType } from 'hono/client'
import { api } from '@/lib/api'
import { call } from '@/lib/api-call'
import { invalidateLedger } from '@/lib/query-keys'

type TransferFields = InferRequestType<typeof api.api.transfers.$post>['json']

// The Transfer write surface (issue #12): both legs move atomically
// server-side, so the same derived-ledger invalidation covers them. Reads
// happen through the Transactions list — a Transfer has no list of its own.
export function useTransferMutations() {
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: ({ id, fields }: { id: string | null; fields: TransferFields }) =>
      id === null
        ? call(api.api.transfers.$post({ json: fields }), 'Failed to save the transfer')
        : call(
            api.api.transfers[':id'].$patch({ param: { id }, json: fields }),
            'Failed to save the transfer',
          ),
    onSuccess: () => invalidateLedger(queryClient),
  })
  const remove = useMutation({
    mutationFn: (id: string) =>
      call(api.api.transfers[':id'].$delete({ param: { id } }), 'Failed to delete the transfer'),
    onSuccess: () => invalidateLedger(queryClient),
  })
  return { save, remove }
}
