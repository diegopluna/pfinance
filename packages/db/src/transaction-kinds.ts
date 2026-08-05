// The Transaction kind vocabulary (issue #9). A Balance Adjustment is the
// Transaction flavor whose only purpose is correcting drift between an
// Account's derived Balance and reality (ADR 0001, CONTEXT.md): it moves the
// Balance like any Transaction but is excluded from the Expense and Income
// derived views by definition. Everything else is standard. Kept free of
// drizzle imports so the web app can import this entry without pulling the
// ORM into its bundle.

// Non-empty tuple form for drizzle's text({ enum }) and validation.
export const TRANSACTION_KIND_VALUES = ['standard', 'balance_adjustment'] as const

export type TransactionKind = (typeof TRANSACTION_KIND_VALUES)[number]

export function isTransactionKind(value: unknown): value is TransactionKind {
  return (TRANSACTION_KIND_VALUES as readonly unknown[]).includes(value)
}
