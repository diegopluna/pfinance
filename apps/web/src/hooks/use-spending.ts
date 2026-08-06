import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

// One month of Spending by Category (issue #18), server-computed like every
// chart aggregate (issue #1): the web app renders, it never sums. The month
// is part of the key, so switching months refetches while visited months
// stay cached.
export function useSpending(month: string) {
  return useQuery({
    queryKey: ['spending-by-category', month],
    queryFn: async () => {
      const response = await api.api['spending-by-category'].$get({ query: { month } })
      if (!response.ok) {
        throw new Error('Failed to load spending')
      }
      return response.json()
    },
  })
}
