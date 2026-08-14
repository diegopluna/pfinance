import { expect, test } from 'vite-plus/test'
import {
  emptyTransferDraft,
  transferDraftFromLeg,
  validateTransferDraft,
} from '../src/ledger/transfer-draft.ts'

// --- The Transfer form's state and its wire mapping (issue #81) ---
// A Transfer moves money between two of the Household's own Accounts
// (CONTEXT.md): direction is structural — from → to, never a sign — so the
// amount is an unsigned decimal composed into positive integer minor units
// (ADR 0006) via @pfinance/currency. The description is optional: blank
// means the server's own default label ("Transfer").

const draft = {
  fromAccountId: 'acc-phone',
  toAccountId: 'acc-card',
  amount: '12.34',
  date: '2026-08-13',
  description: 'Card payoff',
}

test('a fresh transfer draft is dated today with nothing filled in', () => {
  expect(emptyTransferDraft('2026-08-13')).toEqual({
    fromAccountId: '',
    toAccountId: '',
    amount: '',
    date: '2026-08-13',
    description: '',
  })
})

test('each missing side names its own problem, from-account first', () => {
  expect(validateTransferDraft({ ...draft, fromAccountId: '' }, 'USD')).toEqual({
    ok: false,
    error: 'Choose the account the money leaves.',
  })
  expect(validateTransferDraft({ ...draft, toAccountId: '' }, 'USD')).toEqual({
    ok: false,
    error: 'Choose the account the money reaches.',
  })
})

test('the two sides must be different accounts', () => {
  expect(validateTransferDraft({ ...draft, toAccountId: 'acc-phone' }, 'USD')).toEqual({
    ok: false,
    error: 'Pick two different accounts.',
  })
})

test('an unparseable, zero, signed, or too-precise amount is rejected with an example', () => {
  const error = { ok: false, error: 'Enter an amount like 12.34.' }
  expect(validateTransferDraft({ ...draft, amount: 'abc' }, 'USD')).toEqual(error)
  expect(validateTransferDraft({ ...draft, amount: '' }, 'USD')).toEqual(error)
  // Direction is from → to, never a sign in the amount.
  expect(validateTransferDraft({ ...draft, amount: '-12.34' }, 'USD')).toEqual(error)
  expect(validateTransferDraft({ ...draft, amount: '0.00' }, 'USD')).toEqual(error)
  // More precision than the Currency carries (ADR 0006).
  expect(validateTransferDraft({ ...draft, amount: '12.345' }, 'USD')).toEqual(error)
  // The example respects the Currency's exponent.
  expect(validateTransferDraft({ ...draft, amount: 'abc' }, 'JPY')).toEqual({
    ok: false,
    error: 'Enter an amount like 1234.',
  })
})

test('a malformed or impossible calendar date is rejected, never coerced', () => {
  const error = { ok: false, error: 'Enter a calendar date like 2026-01-15.' }
  expect(validateTransferDraft({ ...draft, date: '13/08/2026' }, 'USD')).toEqual(error)
  expect(validateTransferDraft({ ...draft, date: '2026-02-30' }, 'USD')).toEqual(error)
  expect(validateTransferDraft({ ...draft, date: '' }, 'USD')).toEqual(error)
})

test('a blank description is allowed — the server supplies its default label', () => {
  const result = validateTransferDraft({ ...draft, description: '   ' }, 'USD')
  expect(result.ok && result.value.description).toBe('')
})

test('a whole draft composes the wire shape with positive minor units', () => {
  expect(validateTransferDraft(draft, 'USD')).toEqual({
    ok: true,
    value: {
      fromAccountId: 'acc-phone',
      toAccountId: 'acc-card',
      amount: 1234,
      date: '2026-08-13',
      description: 'Card payoff',
    },
  })
})

// Either leg carries the whole Transfer: the sign says which side of the
// pair its Account is on, counterpartAccountId names the other.
const outflowLeg = {
  accountId: 'acc-phone',
  amount: -1234,
  date: '2026-08-13',
  description: 'Card payoff',
  counterpartAccountId: 'acc-card' as string | null,
}

test('editing reads the whole Transfer off the outflow leg', () => {
  expect(transferDraftFromLeg(outflowLeg, 'USD')).toEqual(draft)
})

test('editing reads the same Transfer off the inflow leg', () => {
  const inflowLeg = {
    ...outflowLeg,
    accountId: 'acc-card',
    amount: 1234,
    counterpartAccountId: 'acc-phone',
  }
  expect(transferDraftFromLeg(inflowLeg, 'USD')).toEqual(draft)
})

test('a missing counterpart leaves that side unchosen rather than inventing one', () => {
  const orphaned = { ...outflowLeg, counterpartAccountId: null }
  expect(transferDraftFromLeg(orphaned, 'USD').toAccountId).toBe('')
})

test('a leg round-trips: leg → draft → the same wire fields', () => {
  expect(validateTransferDraft(transferDraftFromLeg(outflowLeg, 'USD'), 'USD')).toEqual({
    ok: true,
    value: {
      fromAccountId: 'acc-phone',
      toAccountId: 'acc-card',
      amount: 1234,
      date: '2026-08-13',
      description: 'Card payoff',
    },
  })
})
