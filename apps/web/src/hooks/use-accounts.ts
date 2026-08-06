import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

// The Household's Accounts with their server-derived Balances (ADR 0001) —
// shared query between the Accounts screen and the Dashboard so both read
// one cache entry per includeArchived flag and a mutation on either screen
// refreshes the other.
export function useAccounts(includeArchived: boolean) {
  return useQuery({
    queryKey: ['accounts', includeArchived],
    queryFn: async () => {
      const response = await api.api.accounts.$get({
        query: { includeArchived: includeArchived ? 'true' : 'false' },
      })
      if (!response.ok) {
        throw new Error('Failed to load accounts')
      }
      return response.json()
    },
  })
}
