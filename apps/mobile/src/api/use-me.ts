import { call } from '@pfinance/api-client'
import { isSupportedCurrency, type CurrencyCode } from '@pfinance/currency'
import { isDateFormat, type DateFormat } from '@pfinance/db/date-formats'
import { useQuery } from '@tanstack/react-query'
import { connectedApi } from '@/api/client'
import { keys } from '@/api/query-keys'

// The signed-in caller's user and Household — one cached query on one key,
// so every screen that needs the Currency shares one fetch rather than
// issuing its own (the web's stance, apps/web/src/hooks/use-me.ts).
export function useMe() {
  const { api, enabled } = connectedApi()
  return useQuery({
    queryKey: keys.me(),
    queryFn: () => call(api.api.me.$get(), 'Could not load your Household.'),
    enabled,
  })
}

// The Household's presentation preferences, for every ledger screen (issue
// #78): the Currency every amount formats in (ADR 0002) and the date format
// every calendar date renders under (issue #31). Both guard against a
// Server newer than this build — formatting falls back rather than crashing
// a list — and both hold their default while /api/me is in flight, so a
// screen paints immediately and settles when the preference arrives.
export function useHousehold(): {
  me: ReturnType<typeof useMe>
  currency: CurrencyCode
  dateFormat: DateFormat
} {
  const me = useMe()
  const household = me.data?.household
  return {
    me,
    currency:
      household !== undefined && isSupportedCurrency(household.currency)
        ? household.currency
        : 'USD',
    dateFormat:
      household !== undefined && isDateFormat(household.dateFormat)
        ? household.dateFormat
        : 'system',
  }
}
