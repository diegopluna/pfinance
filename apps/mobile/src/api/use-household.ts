import { call } from '@pfinance/api-client'
import { isSupportedCurrency, type CurrencyCode } from '@pfinance/currency'
import { isDateFormat, type DateFormat } from '@pfinance/db/date-formats'
import { useCallback } from 'react'
import { apiFor } from './client'
import { useApiQuery, type ApiQuery } from './use-query'

type Me = Awaited<ReturnType<typeof fetchMe>>

const fetchMe = (apiUrl: string) =>
  call(apiFor(apiUrl).api.me.$get(), 'Could not load your Household.')

// The Household's presentation preferences, shared by every ledger screen
// (issue #78): the Currency every amount formats in (ADR 0002) and the date
// format every calendar date renders under (issue #31). Both guard against
// a Server newer than this build — formatting falls back rather than
// crashing a list (the web stance). null apiUrl skips the fetch: the screen
// is about to Redirect to the connect flow.
export function useHousehold(apiUrl: string | null): {
  me: ApiQuery<Me>
  currency: CurrencyCode
  dateFormat: DateFormat
} {
  const load = useCallback(() => fetchMe(apiUrl ?? ''), [apiUrl])
  const me = useApiQuery(apiUrl === null ? null : load)
  const currency: CurrencyCode =
    me.data !== null && isSupportedCurrency(me.data.household.currency)
      ? me.data.household.currency
      : 'USD'
  const dateFormat: DateFormat =
    me.data !== null && isDateFormat(me.data.household.dateFormat)
      ? me.data.household.dateFormat
      : 'system'
  return { me, currency, dateFormat }
}
