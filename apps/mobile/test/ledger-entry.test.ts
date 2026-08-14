import { expect, test } from 'vite-plus/test'
import { draftFromEntry, emptyDraft, validateDraft } from '../src/ledger/entry.ts'

// --- The quick-entry form's state and its wire mapping (issue #80) ---
// The form never asks for a sign: direction is a Money out / Money in
// choice and the amount is an unsigned decimal in the Household Currency,
// composed into the signed integer minor units the API stores (ADR 0006)
// via @pfinance/currency — never float math. Validation names the first
// problem in the user's terms; the wire shape only exists once the draft is
// whole.

const draft = {
  accountId: 'acc-1',
  direction: 'out' as const,
  amount: '12.34',
  date: '2026-08-13',
  description: 'Groceries',
  categoryId: 'cat-9',
}

test('a fresh draft starts as an expense dated today with nothing filled in', () => {
  expect(emptyDraft('2026-08-13')).toEqual({
    accountId: '',
    direction: 'out',
    amount: '',
    date: '2026-08-13',
    description: '',
    categoryId: '',
  })
})

test('money out composes a negative amount in minor units', () => {
  expect(validateDraft(draft, 'USD')).toEqual({
    ok: true,
    value: {
      accountId: 'acc-1',
      date: '2026-08-13',
      amount: -1234,
      description: 'Groceries',
      categoryId: 'cat-9',
    },
  })
})

test('money in composes a positive amount', () => {
  const result = validateDraft({ ...draft, direction: 'in' }, 'USD')
  expect(result.ok && result.value.amount).toBe(1234)
})

test('a zero-exponent currency carries whole units', () => {
  const result = validateDraft({ ...draft, amount: '1234' }, 'JPY')
  expect(result.ok && result.value.amount).toBe(-1234)
})

test("the form's blank Category is the API's null — Uncategorized", () => {
  const result = validateDraft({ ...draft, categoryId: '' }, 'USD')
  expect(result.ok && result.value.categoryId).toBe(null)
})

test('description and amount are trimmed at the boundary', () => {
  const result = validateDraft({ ...draft, description: '  Groceries  ', amount: ' 12.34 ' }, 'USD')
  expect(result.ok && result.value.description).toBe('Groceries')
  expect(result.ok && result.value.amount).toBe(-1234)
})

test('each missing field names its own problem, account first', () => {
  expect(validateDraft({ ...draft, accountId: '' }, 'USD')).toEqual({
    ok: false,
    error: 'Choose an account.',
  })
  expect(validateDraft({ ...draft, description: '   ' }, 'USD')).toEqual({
    ok: false,
    error: 'Describe the transaction.',
  })
})

test('a malformed or impossible calendar date is rejected, never coerced', () => {
  const error = { ok: false, error: 'Enter a calendar date like 2026-01-15.' }
  expect(validateDraft({ ...draft, date: '13/08/2026' }, 'USD')).toEqual(error)
  expect(validateDraft({ ...draft, date: '2026-02-30' }, 'USD')).toEqual(error)
  expect(validateDraft({ ...draft, date: '' }, 'USD')).toEqual(error)
})

test('an unparseable, zero, or too-precise amount is rejected with an example', () => {
  const error = { ok: false, error: 'Enter an amount like 12.34.' }
  expect(validateDraft({ ...draft, amount: 'abc' }, 'USD')).toEqual(error)
  expect(validateDraft({ ...draft, amount: '' }, 'USD')).toEqual(error)
  // The sign lives in the direction choice, never in the amount text.
  expect(validateDraft({ ...draft, amount: '-12.34' }, 'USD')).toEqual(error)
  // A zero amount moves no money — with a direction toggle it has no sign.
  expect(validateDraft({ ...draft, amount: '0.00' }, 'USD')).toEqual(error)
  // More precision than the Currency carries (ADR 0006).
  expect(validateDraft({ ...draft, amount: '12.345' }, 'USD')).toEqual(error)
  // The example respects the Currency's exponent.
  expect(validateDraft({ ...draft, amount: 'abc' }, 'JPY')).toEqual({
    ok: false,
    error: 'Enter an amount like 1234.',
  })
})

test('editing decomposes a stored amount back into direction and decimal', () => {
  const entry = {
    accountId: 'acc-1',
    amount: -1234,
    date: '2026-08-13',
    description: 'Groceries',
    categoryId: 'cat-9',
  }
  expect(draftFromEntry(entry, 'USD')).toEqual(draft)
  expect(draftFromEntry({ ...entry, amount: 250000 }, 'USD')).toEqual({
    ...draft,
    direction: 'in',
    amount: '2500.00',
  })
})

test('editing an Uncategorized row yields the blank Category', () => {
  const entry = {
    accountId: 'acc-1',
    amount: -1234,
    date: '2026-08-13',
    description: 'Groceries',
    categoryId: null,
  }
  expect(draftFromEntry(entry, 'USD').categoryId).toBe('')
})

test('a draft round-trips: entry → draft → the same wire fields', () => {
  const entry = {
    accountId: 'acc-1',
    amount: -1234,
    date: '2026-08-13',
    description: 'Groceries',
    categoryId: null,
  }
  expect(validateDraft(draftFromEntry(entry, 'USD'), 'USD')).toEqual({
    ok: true,
    value: entry,
  })
})
