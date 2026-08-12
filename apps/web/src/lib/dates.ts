import type { DateFormat } from '@pfinance/db/date-formats'

// The ledger's dates are calendar date strings (YYYY-MM-DD, never a
// timestamp — CONTEXT.md), while Date-based APIs deal in Date objects.
// Every conversion here goes through local date parts only: toISOString or
// Date-string parsing would read the date as UTC midnight and shift it a day
// west of Greenwich.

export const parseCalendarDate = (value: string): Date | undefined => {
  const [year, month, day] = value.split('-').map(Number)
  // NaN parts (a malformed string) must yield undefined, not an Invalid
  // Date — Intl formatters throw on those where toLocaleDateString didn't.
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return undefined
  }
  return new Date(year, month - 1, day)
}

const pad = (value: number, length: number) => value.toString().padStart(length, '0')

export const toCalendarString = (date: Date): string =>
  `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1, 2)}-${pad(date.getDate(), 2)}`

const monthShort = (date: Date, locale?: string) =>
  new Intl.DateTimeFormat(locale, { month: 'short' }).format(date)

// A day-level date under the Household's date format (issue #31): 'system'
// defers wholly to the browser locale — exactly the pre-preference rendering
// — while the fixed formats pin the day/month/year order and let the month
// name follow the viewer's language. The locale parameter exists for tests
// (the formatAmount pattern); real callers pass the preference only.
export const formatDayDate = (date: Date, format: DateFormat, locale?: string): string => {
  switch (format) {
    case 'system':
      return date.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
    case 'dmy':
      return `${date.getDate()} ${monthShort(date, locale)} ${date.getFullYear()}`
    case 'mdy':
      return `${monthShort(date, locale)} ${date.getDate()}, ${date.getFullYear()}`
    case 'ymd':
      return toCalendarString(date)
  }
}

// The same preference over a calendar date string; a malformed string passes
// through untouched rather than throwing mid-render.
export const formatCalendarDate = (value: string, format: DateFormat, locale?: string): string => {
  const date = parseCalendarDate(value)
  return date === undefined ? value : formatDayDate(date, format, locale)
}

// A month-level label ("Archived Aug 2026", "Joined Aug 2026") under the
// same preference: 'system' defers to the browser locale, the fixed
// month-first formats read as "Aug 2026", and ymd keeps its ISO shape.
export const formatMonthYear = (date: Date, format: DateFormat, locale?: string): string => {
  switch (format) {
    case 'system':
      return date.toLocaleDateString(locale, { month: 'short', year: 'numeric' })
    case 'dmy':
    case 'mdy':
      return `${monthShort(date, locale)} ${date.getFullYear()}`
    case 'ymd':
      return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1, 2)}`
  }
}
