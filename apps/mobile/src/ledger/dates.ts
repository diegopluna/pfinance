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

// The device's local calendar date — what the period presets count back
// from. Local parts, never toISOString: UTC would name tomorrow's date all
// evening east of Greenwich.
export const todayCalendarString = (): string => {
  const now = new Date()
  return `${pad(now.getFullYear(), 4)}-${pad(now.getMonth() + 1, 2)}-${pad(now.getDate(), 2)}`
}

// The real calendar's month lengths, shared with the filter presets
// (filters.ts) — one copy of the leap rule per app.
export const daysInMonth = (year: number, month: number): number => {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
  return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 31
}

// Structural and against the real calendar (rejects 2026-02-30), mirroring
// the server's validator (apps/server/src/transactions.ts) so the entry form
// (issue #80) refuses exactly what the API would refuse — without ever
// constructing a Date, so no timezone can touch it.
const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

export const isCalendarDate = (value: string): boolean => {
  const match = CALENDAR_DATE.exec(value)
  if (match === null) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1) return false
  return day <= daysInMonth(year, month)
}

// The day before a calendar date — the entry form's "Yesterday" — by pure
// day arithmetic: month and year roll under, February knows its leap years.
export const previousCalendarDay = (value: string): string => {
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  const day = Number(value.slice(8, 10))
  if (day > 1) return `${pad(year, 4)}-${pad(month, 2)}-${pad(day - 1, 2)}`
  const previousMonth = month > 1 ? month - 1 : 12
  const previousYear = month > 1 ? year : year - 1
  return `${pad(previousYear, 4)}-${pad(previousMonth, 2)}-${pad(daysInMonth(previousYear, previousMonth), 2)}`
}
