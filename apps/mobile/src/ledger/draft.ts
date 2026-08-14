import { fromMinorUnits, getCurrency, toMinorUnits, type CurrencyCode } from '@pfinance/currency'
import type { TransactionKind } from '@pfinance/db/transaction-kinds'
import { isCalendarDate } from './dates'

// The quick-entry form's state and its wire mapping (issue #80). The form
// never asks for a sign: direction is a Money out / Money in choice and the
// amount is an unsigned decimal in the Household Currency, composed into the
// signed integer minor units the API stores (ADR 0006) via
// @pfinance/currency — never float math. Free of react-native imports so the
// workspace's node test runner covers it.

export type Direction = 'out' | 'in'

export interface TransactionDraft {
  accountId: string
  direction: Direction
  // Unsigned decimal text in the Household Currency; the sign lives in the
  // direction choice.
  amount: string
  // A calendar date string (YYYY-MM-DD) — never a timestamp (CONTEXT.md).
  date: string
  description: string
  // The Balance Adjustment flavor (issue #81): it moves the Balance but is
  // never counted as spending or income. A toggle, not a kind picker — the
  // transfer kind can't exist here (legs only write through /api/transfers).
  balanceAdjustment: boolean
  // '' is the form's Uncategorized; the API's is null (ADR 0003).
  categoryId: string
}

// The editable state the API accepts. The kind is composed from the toggle
// and sent on create and edit alike (the web form's rule), so a Balance
// Adjustment is both recordable and revertible in place.
export interface TransactionFields {
  accountId: string
  date: string
  amount: number
  description: string
  kind: 'standard' | 'balance_adjustment'
  categoryId: string | null
}

export type DraftValidation = { ok: true; value: TransactionFields } | { ok: false; error: string }

// A fresh entry is an expense dated today: the register case (user story
// 12) is money out, right now.
export const emptyDraft = (today: string): TransactionDraft => ({
  accountId: '',
  direction: 'out',
  amount: '',
  date: today,
  description: '',
  balanceAdjustment: false,
  categoryId: '',
})

// Editing decomposes the stored signed amount back into the form's terms.
// Zero decomposes as money in — an amount the form itself never produces
// (validation refuses zero), so the arbitrary side only shows in rows
// created elsewhere.
// The input kind is the API's full vocabulary — the form is never handed a
// Transfer leg (legs open the TransferForm), but the row type carries it.
export const draftFromTransaction = (
  entry: Omit<TransactionFields, 'amount' | 'kind'> & { amount: number; kind: TransactionKind },
  currency: CurrencyCode,
): TransactionDraft => ({
  accountId: entry.accountId,
  direction: entry.amount < 0 ? 'out' : 'in',
  amount: fromMinorUnits(Math.abs(entry.amount), currency),
  date: entry.date,
  description: entry.description,
  balanceAdjustment: entry.kind === 'balance_adjustment',
  categoryId: entry.categoryId ?? '',
})

// Format guidance in the Household Currency — unsigned, unlike the web's
// signed example: the sign lives in the direction choice here.
export const amountExample = (currency: CurrencyCode): string => {
  const { minorUnitExponent } = getCurrency(currency)
  return minorUnitExponent === 0 ? '1234' : `12.${'3456'.slice(0, minorUnitExponent)}`
}

// The unsigned decimal → positive integer minor units, or null for anything
// the API would refuse: not a decimal, more precision than the Currency
// carries, a stray sign, or zero (no money moved). Direction never lives in
// the amount text — quick entry's toggle or a Transfer's from → to carries
// it (transfer-draft.ts shares this parser).
export const parseUnsignedAmount = (text: string, currency: CurrencyCode): number | null => {
  const trimmed = text.trim()
  if (trimmed.startsWith('-')) return null
  try {
    const units = toMinorUnits(trimmed, currency)
    return units > 0 ? units : null
  } catch {
    return null
  }
}

// The first problem in the user's terms, or the whole wire shape — the
// server's Parsed stance (apps/server/src/transactions.ts), client-side so
// quick entry fails before the network does.
export const validateDraft = (draft: TransactionDraft, currency: CurrencyCode): DraftValidation => {
  if (draft.accountId === '') return { ok: false, error: 'Choose an account.' }
  const description = draft.description.trim()
  if (description === '') return { ok: false, error: 'Describe the transaction.' }
  const amount = parseUnsignedAmount(draft.amount, currency)
  if (amount === null) {
    return { ok: false, error: `Enter an amount like ${amountExample(currency)}.` }
  }
  if (!isCalendarDate(draft.date)) {
    return { ok: false, error: 'Enter a calendar date like 2026-01-15.' }
  }
  return {
    ok: true,
    value: {
      accountId: draft.accountId,
      date: draft.date,
      amount: draft.direction === 'out' ? -amount : amount,
      description,
      kind: draft.balanceAdjustment ? 'balance_adjustment' : 'standard',
      categoryId: draft.categoryId === '' ? null : draft.categoryId,
    },
  }
}
