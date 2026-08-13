import { expect, test } from 'vite-plus/test'
import { categoryLabel, kindBadge, ledgerAmount } from '../src/ledger/display.ts'

// --- Amount treatment per kind (issue #78) ---
// The mobile Transaction list renders amounts under the same rules the web
// table pinned from Core Screens 2a (DECISIONS.md): expenses plain, income
// green with an explicit +, Transfers muted and unsigned (direction is
// from → to, never a sign), Adjustments muted keeping their sign. All
// formatting goes through @pfinance/currency — no float ever touches an
// amount (ADR 0006). Locale is pinned so expectations don't depend on the
// runner's environment; screens pass the device default.

test('a standard expense renders plain and signed', () => {
  expect(ledgerAmount('standard', -1234, 'USD', 'en-US')).toEqual({
    text: '-$12.34',
    tone: 'plain',
  })
})

test('a standard income renders positive with an explicit +', () => {
  expect(ledgerAmount('standard', 5000, 'USD', 'en-US')).toEqual({
    text: '+$50.00',
    tone: 'positive',
  })
})

test('a transfer leg renders muted and unsigned regardless of direction', () => {
  expect(ledgerAmount('transfer', -1234, 'USD', 'en-US')).toEqual({
    text: '$12.34',
    tone: 'muted',
  })
  expect(ledgerAmount('transfer', 1234, 'USD', 'en-US')).toEqual({
    text: '$12.34',
    tone: 'muted',
  })
})

test('a balance adjustment renders muted but keeps its sign', () => {
  expect(ledgerAmount('balance_adjustment', -900, 'USD', 'en-US')).toEqual({
    text: '-$9.00',
    tone: 'muted',
  })
  // Positive adjustments keep the explicit + of any money-in amount.
  expect(ledgerAmount('balance_adjustment', 900, 'USD', 'en-US')).toEqual({
    text: '+$9.00',
    tone: 'muted',
  })
})

// --- Kind badges (issues #9, #12 semantics, DECISIONS.md) ---
// A Transfer leg or Balance Adjustment moves the Balance but is excluded
// from Expense/Income, so neither may ever read as an ordinary entry: both
// carry a visible badge. The leg's sign says which side of the pair this
// Account is on; the counterpart may be gone from the lookup (archived list
// not loaded) without hiding that the row is a Transfer.

test('standard transactions carry no kind badge', () => {
  expect(kindBadge('standard', -1234, 'Groceries account')).toBeNull()
})

test('a balance adjustment is visibly labeled', () => {
  expect(kindBadge('balance_adjustment', -900, null)).toBe('Balance adjustment')
})

test('a transfer leg names its direction and counterpart', () => {
  expect(kindBadge('transfer', -1234, 'Savings')).toBe('Transfer to Savings')
  expect(kindBadge('transfer', 1234, 'Checking')).toBe('Transfer from Checking')
  expect(kindBadge('transfer', -1234, null)).toBe('Transfer to another account')
})

// --- Category text (ADR 0003) ---
// Exactly one Category or Uncategorized — and a Transfer leg carries no
// Category at all (it's never spending to analyze), so it shows a dash,
// not "Uncategorized".

test('category text distinguishes a real label, Uncategorized, and transfer legs', () => {
  expect(categoryLabel('standard', 'Groceries')).toBe('Groceries')
  expect(categoryLabel('standard', null)).toBe('Uncategorized')
  expect(categoryLabel('balance_adjustment', null)).toBe('Uncategorized')
  expect(categoryLabel('transfer', null)).toBe('—')
})
