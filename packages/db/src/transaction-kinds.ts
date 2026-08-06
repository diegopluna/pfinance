// The Transaction kind vocabulary (issues #9, #12). A Balance Adjustment is
// the Transaction flavor whose only purpose is correcting drift between an
// Account's derived Balance and reality (ADR 0001, CONTEXT.md); a transfer
// row is one leg of a Transfer — money moved between the Household's own
// Accounts. Both move the Balance like any Transaction but are excluded from
// the Expense and Income derived views by definition. Everything else is
// standard. Kept free of drizzle imports so the web app can import this
// entry without pulling the ORM into its bundle.

// Non-empty tuple form for drizzle's text({ enum }) and validation.
export const TRANSACTION_KIND_VALUES = ['standard', 'balance_adjustment', 'transfer'] as const

export type TransactionKind = (typeof TRANSACTION_KIND_VALUES)[number]

export function isTransactionKind(value: unknown): value is TransactionKind {
  return (TRANSACTION_KIND_VALUES as readonly unknown[]).includes(value)
}
