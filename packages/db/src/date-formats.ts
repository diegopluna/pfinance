// The Household's date-format vocabulary (issue #31): how calendar dates
// display across the app. Presentation only — ledger dates stay YYYY-MM-DD
// strings end-to-end (CONTEXT.md "Transaction"). 'system' defers to the
// viewer's browser locale, the other three fix the day/month/year order.
// Kept free of drizzle imports so the web app can import this entry without
// pulling the ORM into its bundle (the account-types.ts pattern).

export const DATE_FORMATS = ['system', 'dmy', 'mdy', 'ymd'] as const

export type DateFormat = (typeof DATE_FORMATS)[number]

// Non-empty tuple form for drizzle's text({ enum }) and validation.
export const DATE_FORMAT_VALUES = [...DATE_FORMATS] as [DateFormat, ...DateFormat[]]

export function isDateFormat(value: unknown): value is DateFormat {
  return typeof value === 'string' && (DATE_FORMATS as readonly string[]).includes(value)
}
