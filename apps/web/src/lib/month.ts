// Calendar-month helpers shared by the chart surfaces. A month is its
// `YYYY-MM` string: lexicographic comparison is chronological, and the
// arithmetic is integer math on the string — no Date is ever built from
// ledger data, so no viewer timezone can shift a month boundary.

export const currentUtcMonth = () => new Date().toISOString().slice(0, 7)

export const addMonths = (month: string, delta: number): string => {
  const zeroBased = Number(month.slice(0, 4)) * 12 + (Number(month.slice(5, 7)) - 1) + delta
  const year = Math.floor(zeroBased / 12)
  const monthNumber = (zeroBased % 12) + 1
  return `${String(year).padStart(4, '0')}-${String(monthNumber).padStart(2, '0')}`
}

// `YYYY-MM` → a human month. The Date is built in UTC and formatted in UTC,
// so the label can never land in a neighboring month.
export const monthLabel = (month: string, style: 'tick' | 'full') => {
  const date = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1))
  return new Intl.DateTimeFormat(undefined, {
    month: style === 'tick' ? 'short' : 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}
