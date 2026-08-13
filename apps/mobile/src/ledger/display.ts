import { formatAmount, type CurrencyCode } from '@pfinance/currency'
import type { TransactionKind } from '@pfinance/db/transaction-kinds'

// Ledger amount treatment per kind, shared by the mobile list screens
// (issue #78) and pinned from Core Screens 2a via the web table
// (DECISIONS.md): expenses plain, income positive with an explicit +,
// Transfers muted and unsigned (direction is from → to, never a sign),
// Adjustments muted keeping their sign. Mirrors the amount cell inlined in
// apps/web/src/routes/_authed/transactions.tsx — the two clients must
// render the same row the same way; promote to a shared package when a
// third caller appears. Free of react-native imports so the workspace's
// node test runner covers it.

export interface LedgerAmount {
  text: string
  tone: 'plain' | 'positive' | 'muted'
}

export const ledgerAmount = (
  kind: TransactionKind,
  amount: number,
  currency: CurrencyCode,
  locale?: string,
): LedgerAmount => {
  const muted = kind === 'transfer' || kind === 'balance_adjustment'
  const shown = kind === 'transfer' ? Math.abs(amount) : amount
  const formatted = formatAmount(shown, currency, locale)
  return {
    text: shown > 0 && kind !== 'transfer' ? `+${formatted}` : formatted,
    tone: muted ? 'muted' : shown > 0 ? 'positive' : 'plain',
  }
}

// A Transfer leg or Balance Adjustment moves the Balance but is excluded
// from Expense/Income, so neither may ever read as an ordinary entry
// (issues #9, #12): both carry a visible badge. The leg's sign says which
// side of the pair this Account is on; a missing counterpart name (not in
// the loaded Account list) still reads as a Transfer.
export const kindBadge = (
  kind: TransactionKind,
  amount: number,
  counterpartName: string | null,
): string | null => {
  if (kind === 'balance_adjustment') return 'Balance adjustment'
  if (kind === 'transfer') {
    const direction = amount < 0 ? 'Transfer to' : 'Transfer from'
    return `${direction} ${counterpartName ?? 'another account'}`
  }
  return null
}

// Exactly one Category or Uncategorized (ADR 0003); a Transfer leg carries
// no Category at all — it's never spending to analyze — so it shows a dash,
// not "Uncategorized".
export const categoryLabel = (kind: TransactionKind, name: string | null): string => {
  if (kind === 'transfer') return '—'
  return name ?? 'Uncategorized'
}
