import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { call } from '@pfinance/api-client'
import { keys } from '@/lib/query-keys'

// The monthly Net Worth series (issue #17), server-derived like every chart
// aggregate (issue #1): the web app renders, it never sums. `through` stays
// undefined (the client omits it), so the server ends the series at the
// current month.
export function useNetWorth() {
  return useQuery({
    queryKey: keys.netWorth(),
    queryFn: () =>
      call(
        api.api['net-worth'].$get({ query: { through: undefined } }),
        'Failed to load net worth',
      ),
  })
}
