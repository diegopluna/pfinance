import type { DateFormat } from '@pfinance/db/date-formats'

// Day-level rendering of the ledger's calendar date strings under the
// Household's date format (issue #31), mirrored from apps/web/src/lib/dates.ts
// for the mobile list screens (issue #78) — the two apps must read the same
// preference the same way; promote to a shared package when a third caller
// appears. Every conversion goes through local date parts only: toISOString
// or Date-string parsing would read the date as UTC midnight and shift it a
// day west of Greenwich. Free of react-native imports so the workspace's
// node test runner covers it.

const parseCalendarDate = (value: string): Date | undefined => {
  const [year, month, day] = value.split('-').map(Number)
  // NaN parts (a malformed string) must yield undefined, not an Invalid
  // Date — Intl formatters throw on those where toLocaleDateString didn't.
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return undefined
  }
  return new Date(year, month - 1, day)
}

const pad = (value: number, length: number) => value.toString().padStart(length, '0')

const monthShort = (date: Date, locale?: string) =>
  new Intl.DateTimeFormat(locale, { month: 'short' }).format(date)

const formatDayDate = (date: Date, format: DateFormat, locale?: string): string => {
  switch (format) {
    case 'system':
      return date.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
    case 'dmy':
      return `${date.getDate()} ${monthShort(date, locale)} ${date.getFullYear()}`
    case 'mdy':
      return `${monthShort(date, locale)} ${date.getDate()}, ${date.getFullYear()}`
    case 'ymd':
      return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1, 2)}-${pad(date.getDate(), 2)}`
  }
}

// The Household preference over a calendar date string; a malformed string
// passes through untouched rather than throwing mid-render.
export const formatCalendarDate = (value: string, format: DateFormat, locale?: string): string => {
  const date = parseCalendarDate(value)
  return date === undefined ? value : formatDayDate(date, format, locale)
}
