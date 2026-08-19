import { expect, test } from 'vite-plus/test'
import { adjustmentFields, signedActual } from '../src/ledger/adjust.ts'

// --- The adjust-balance sheet's wire mapping (issue #81) ---
// The user states what the Account actually holds; the recorded Adjustment
// is the integer minor-unit difference against the derived Balance —
// direction falls out of the subtraction, and no drift records nothing.

const account = { id: 'acc-1', balance: 1248035 }

test('drift upward records the positive difference', () => {
  expect(adjustmentFields(account, 1250210, '2026-08-19')).toEqual({
    accountId: 'acc-1',
    date: '2026-08-19',
    amount: 2175,
    description: 'Balance adjustment',
    kind: 'balance_adjustment',
    categoryId: null,
  })
})

test('drift downward records the negative difference', () => {
  expect(adjustmentFields(account, 1247000, '2026-08-19')?.amount).toBe(-1035)
})

test('a liability corrects toward a deeper negative', () => {
  // The car loan's derived balance says -11.759,00; the bank says
  // -11.800,00 — the adjustment is the further -41,00.
  const liability = { id: 'acc-2', balance: -1175900 }
  expect(adjustmentFields(liability, signedActual(1180000, true), '2026-08-19')?.amount).toBe(-4100)
})

test('no drift records nothing', () => {
  expect(adjustmentFields(account, 1248035, '2026-08-19')).toBeNull()
})

test('the sign toggle is the only thing that makes a magnitude negative', () => {
  expect(signedActual(500, false)).toBe(500)
  expect(signedActual(500, true)).toBe(-500)
  expect(signedActual(0, true)).toBe(-0)
})
