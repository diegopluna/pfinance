import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { call } from '@pfinance/api-client'
import { keys } from '@/lib/query-keys'

// The owner-only management surface (issue #6). The server answers 403 for
// non-owners; screens read that off ApiError.status (isForbidden) instead of
// half-rendering, so neither query retries.
export function useMembers() {
  return useQuery({
    queryKey: keys.members(),
    queryFn: () => call(api.api.members.$get(), 'Failed to load members'),
    retry: false,
  })
}

export function useInvites() {
  return useQuery({
    queryKey: keys.invites(),
    queryFn: () => call(api.api.invites.$get(), 'Failed to load invites'),
    retry: false,
  })
}

export function useMemberMutations() {
  const queryClient = useQueryClient()
  const createInvite = useMutation({
    mutationFn: () => call(api.api.invites.$post(), 'Failed to create invite'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.invites() }),
  })
  const revokeInvite = useMutation({
    mutationFn: (id: string) =>
      call(api.api.invites[':id'].$delete({ param: { id } }), 'Failed to revoke invite'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.invites() }),
  })
  const removeMember = useMutation({
    mutationFn: (id: string) =>
      call(api.api.members[':id'].$delete({ param: { id } }), 'Failed to remove member'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.members() }),
  })
  return { createInvite, revokeInvite, removeMember }
}
