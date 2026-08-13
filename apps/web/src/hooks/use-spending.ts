import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { call } from '@pfinance/api-client'
import { keys } from '@/lib/query-keys'

// One month of Spending by Category (issue #18), server-computed like every
// chart aggregate (issue #1): the web app renders, it never sums. The month
// is part of the key, so switching months refetches while visited months
// stay cached.
export function useSpending(month: string) {
  return useQuery({
    queryKey: keys.spending(month),
    queryFn: () =>
      call(api.api['spending-by-category'].$get({ query: { month } }), 'Failed to load spending'),
  })
}
