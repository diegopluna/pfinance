import type { DateFormat } from '@pfinance/db/date-formats'
import { useMe } from './use-me'

// The Household's date format preference (issue #31), for every screen that
// renders a calendar date. 'system' while /api/me is in flight, so dates
// paint immediately in the browser-locale default and settle once the
// preference arrives (useMe is one cached query — no extra fetch).
export function useDateFormat(): DateFormat {
  const { data: me } = useMe()
  return me?.household.dateFormat ?? 'system'
}
