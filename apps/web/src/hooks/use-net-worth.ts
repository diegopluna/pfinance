import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

// The monthly Net Worth series (issue #17), server-derived like every chart
// aggregate (issue #1): the web app renders, it never sums. `through` stays
// undefined (the client omits it), so the server ends the series at the
// current month.
export function useNetWorth() {
  return useQuery({
    queryKey: ['net-worth'],
    queryFn: async () => {
      const response = await api.api['net-worth'].$get({ query: { through: undefined } })
      if (!response.ok) {
        throw new Error('Failed to load net worth')
      }
      return response.json()
    },
  })
}
