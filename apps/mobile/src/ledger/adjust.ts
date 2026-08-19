import type { TransactionFields } from './draft'

// The adjust-balance sheet's wire mapping (issue #81): the user states what
// the Account ACTUALLY holds — the number their bank shows — and the app
// records the difference against the derived Balance as a Balance
// Adjustment. The delta is integer minor-unit subtraction (ADR 0006), never
// float math; direction falls out of the subtraction, so the sheet never
// asks for one. No drift means nothing to record — a zero-amount
// Adjustment is not a fact, and the API would refuse it anyway. Free of
// react-native imports so the workspace's node test runner covers it.

// The keypad types an unsigned magnitude (ledger/keypad.ts); the sign is
// the sheet's own toggle, so a liability's reality — a negative balance —
// is one keypress, not a convention to remember.
export const signedActual = (minor: number, negative: boolean): number =>
  negative ? -minor : minor

// The server default the sheet writes: the row explains itself the way a
// Transfer's does, and the kind badge already names it in the ledger.
export const ADJUSTMENT_DESCRIPTION = 'Balance adjustment'

export const adjustmentFields = (
  account: { id: string; balance: number },
  actual: number,
  today: string,
): TransactionFields | null => {
  const amount = actual - account.balance
  if (amount === 0) return null
  return {
    accountId: account.id,
    date: today,
    amount,
    description: ADJUSTMENT_DESCRIPTION,
    kind: 'balance_adjustment',
    categoryId: null,
  }
}
