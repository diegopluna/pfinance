import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { InferRequestType, InferResponseType } from 'hono/client'
import { api } from '@/lib/api'
import { call } from '@/lib/api-call'
import { invalidateLedger, keys } from '@/lib/query-keys'

type MappingFields = InferRequestType<(typeof api.api.imports)[':id']['preview']['$post']>['json']
type PreviewResponse = InferResponseType<(typeof api.api.imports)[':id']['preview']['$post'], 200>

// Import history, newest first.
export function useImports() {
  return useQuery({
    queryKey: keys.imports(),
    queryFn: () => call(api.api.imports.$get(), 'Failed to load imports'),
  })
}

// The preview runs on every mapping change — it also persists the mapping on
// the Import server-side, so confirm creates exactly what's on screen.
export function useImportPreview(importId: string | undefined, mapping: MappingFields | null) {
  return useQuery({
    queryKey: keys.importPreview(importId, mapping),
    enabled: importId !== undefined && mapping !== null,
    queryFn: (): Promise<PreviewResponse> => {
      if (importId === undefined || mapping === null) {
        throw new Error('No import selected')
      }
      return call(
        api.api.imports[':id'].preview.$post({ param: { id: importId }, json: mapping }),
        'Failed to preview the import',
      )
    },
  })
}

// The Import write surface. Confirm creates Transactions and the revert
// deletes them, so both run the derived-ledger invalidation on top of the
// Import history's own. Wizard state transitions stay at the call sites,
// passed per-mutate.
export function useImportMutations() {
  const queryClient = useQueryClient()
  const upload = useMutation({
    mutationFn: (fields: { accountId: string; fileName: string; csv: string }) =>
      call(api.api.imports.$post({ json: fields }), 'Failed to upload the file'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.imports() }),
  })
  // Resume a pending Import from the history: the single GET returns the
  // file's columns again, and the stored mapping (if any) beats the guess.
  const resume = useMutation({
    mutationFn: (id: string) =>
      call(api.api.imports[':id'].$get({ param: { id } }), 'Failed to load the import'),
  })
  const confirm = useMutation({
    mutationFn: (fields: { id: string; overrides: number[] }) =>
      call(
        api.api.imports[':id'].confirm.$post({
          param: { id: fields.id },
          json: { overrides: fields.overrides },
        }),
        'Failed to confirm the import',
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.imports() })
      await invalidateLedger(queryClient)
    },
  })
  const remove = useMutation({
    mutationFn: (id: string) =>
      call(api.api.imports[':id'].$delete({ param: { id } }), 'Failed to delete the import'),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.imports() })
      await invalidateLedger(queryClient)
    },
  })
  return { upload, resume, confirm, remove }
}
