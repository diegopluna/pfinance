// How old the cached read surfaces are (issue #83): the offline banner
// quotes the cache's own updated-at, so the age can never lie. A screen
// watches several queries; the honest age is the OLDEST one shown — the
// banner promises no row is staler than it says. Free of react-native
// imports so the workspace's node test runner covers it.

export const oldestUpdatedAt = (
  queries: { data: unknown; dataUpdatedAt: number }[],
): number | null => {
  const stamps = queries
    .filter((query) => query.data !== undefined && query.dataUpdatedAt > 0)
    .map((query) => query.dataUpdatedAt)
  return stamps.length === 0 ? null : Math.min(...stamps)
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

// "moments ago" / "5 min ago" / "2 h ago" / "3 days ago" — coarse on
// purpose: the banner answers "can I trust these numbers", not "when
// exactly did the last fetch land".
export const staleLabel = (updatedAt: number, now: number): string => {
  const age = Math.max(0, now - updatedAt)
  if (age < MINUTE) return 'moments ago'
  if (age < HOUR) return `${Math.floor(age / MINUTE)} min ago`
  if (age < DAY) return `${Math.floor(age / HOUR)} h ago`
  const days = Math.floor(age / DAY)
  return `${days} ${days === 1 ? 'day' : 'days'} ago`
}
