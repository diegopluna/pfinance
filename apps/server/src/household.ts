import { isDateFormat, type DateFormat } from '@pfinance/db'
import type { Parsed } from './parsed.ts'

// The Household's mutable settings (issue #31). Only dateFormat today: name
// renames aren't built yet, and currency is immutable after creation (ADR
// 0002), so it must never appear here.
export interface HouseholdPatch {
  dateFormat: DateFormat
}

export const parseHouseholdPatch = (body: unknown): Parsed<HouseholdPatch> => {
  const record = (body ?? {}) as Record<string, unknown>
  if (!('dateFormat' in record)) {
    return { ok: false, error: 'Nothing to update: send dateFormat.' }
  }
  if (!isDateFormat(record.dateFormat)) {
    return { ok: false, error: 'Unknown date format.' }
  }
  return { ok: true, value: { dateFormat: record.dateFormat } }
}
