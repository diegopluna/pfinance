import { validator } from 'hono/validator'
import { isCalendarMonth } from './net-worth.ts'
import type { Parsed } from './parsed.ts'

// The one 400 shape for every parse failure: hono/validator wrapped around a
// Parsed-returning parser (parsed.ts). The parse function owns all narrowing
// of the raw value, so body and query targets share the adapter.
export const parsedValidator = <Target extends 'json' | 'query', T>(
  target: Target,
  parse: (value: unknown) => Parsed<T>,
) =>
  validator(target, (value: unknown, c) => {
    const parsed = parse(value)
    return parsed.ok ? parsed.value : c.json({ error: parsed.error }, 400)
  })

// The chart routes' month-window query validator: the named param is either
// absent (the route defaults it to the current month) or a real calendar
// month — malformed values are rejected, never silently defaulted.
export const calendarMonthValidator = <K extends string>(param: K) =>
  validator('query', (value, c) => {
    const raw = value[param]
    if (raw === undefined || raw === '') {
      return { [param]: undefined } as { [P in K]: string | undefined }
    }
    if (!isCalendarMonth(raw)) {
      return c.json({ error: `The ${param} filter must be a calendar month like 2026-01.` }, 400)
    }
    return { [param]: raw } as { [P in K]: string | undefined }
  })
