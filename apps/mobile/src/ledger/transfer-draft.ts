import { fromMinorUnits, type CurrencyCode } from '@pfinance/currency'
import { isCalendarDate } from './dates'
import { amountExample, parseUnsignedAmount } from './draft'

// The Transfer form's state and its wire mapping (issue #81). A Transfer
// moves money between two of the Household's own Accounts (CONTEXT.md):
// direction is structural — from → to, never a sign — so the amount is an
// unsigned decimal composed into the positive integer minor units
// /api/transfers stores (ADR 0006) via @pfinance/currency, and the server
// signs the legs. Free of react-native imports so the workspace's node test
// runner covers it.

export interface TransferDraft {
  fromAccountId: string
  toAccountId: string
  // Unsigned decimal text in the Household Currency.
  amount: string
  // A calendar date string (YYYY-MM-DD) — never a timestamp (CONTEXT.md).
  date: string
  // Blank means the server's own default label ("Transfer") — a Transfer
  // explains itself, unlike a Transaction.
  description: string
}

// The editable state /api/transfers accepts, for create and edit alike.
export interface TransferFields {
  fromAccountId: string
  toAccountId: string
  amount: number
  date: string
  description: string
}

export type TransferDraftValidation =
  | { ok: true; value: TransferFields }
  | { ok: false; error: string }

// A fresh Transfer is dated today: paying off the card is a register
// moment, like quick entry.
export const emptyTransferDraft = (today: string): TransferDraft => ({
  fromAccountId: '',
  toAccountId: '',
  amount: '',
  date: today,
  description: '',
})

// Editing is handed either leg and reads the whole Transfer off it: the
// leg's sign says which side of the pair its Account is on, and
// counterpartAccountId names the other (the web transactions screen's
// transferSidesOf). A missing counterpart — its Account not in the loaded
// list — leaves that side unchosen rather than inventing one.
export const transferDraftFromLeg = (
  leg: {
    accountId: string
    amount: number
    date: string
    description: string
    counterpartAccountId: string | null
  },
  currency: CurrencyCode,
): TransferDraft => ({
  fromAccountId: leg.amount < 0 ? leg.accountId : (leg.counterpartAccountId ?? ''),
  toAccountId: leg.amount < 0 ? (leg.counterpartAccountId ?? '') : leg.accountId,
  amount: fromMinorUnits(Math.abs(leg.amount), currency),
  date: leg.date,
  description: leg.description,
})

// The first problem in the user's terms, or the whole wire shape — the
// server's Parsed stance (apps/server/src/transfers.ts), client-side so the
// form fails before the network does.
export const validateTransferDraft = (
  draft: TransferDraft,
  currency: CurrencyCode,
): TransferDraftValidation => {
  if (draft.fromAccountId === '') {
    return { ok: false, error: 'Choose the account the money leaves.' }
  }
  if (draft.toAccountId === '') {
    return { ok: false, error: 'Choose the account the money reaches.' }
  }
  if (draft.fromAccountId === draft.toAccountId) {
    return { ok: false, error: 'Pick two different accounts.' }
  }
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
      fromAccountId: draft.fromAccountId,
      toAccountId: draft.toAccountId,
      amount,
      date: draft.date,
      description: draft.description.trim(),
    },
  }
}
