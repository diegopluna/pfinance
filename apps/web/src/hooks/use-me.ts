import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

// The signed-in caller's user, Household and role — shared query (same key)
// between the Shell and feature screens so it's fetched once per session.
export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const response = await api.api.me.$get()
      if (!response.ok) {
        throw new Error('Failed to load household')
      }
      return response.json()
    },
  })
}
