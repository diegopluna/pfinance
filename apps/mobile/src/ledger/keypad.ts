import { fromMinorUnits, type CurrencyCode } from '@pfinance/currency'

// The quick-add sheet's cash-register amount (issue #80): the keypad edits
// an unsigned integer in minor units directly — typing 2 4 7 9 0 reads
// R$ 247,90 — so there is no decimal separator to place and no parse step
// that can fail while typing. The integer converts to the drafts' unsigned
// decimal text (ledger/draft.ts, ledger/transfer-draft.ts) only at submit.
// Free of react-native imports so the workspace's node test runner covers
// it.

// Twelve digits of minor units: far beyond any household amount, well
// inside Number's exact-integer range.
const LIMIT = 1_000_000_000_000

export const pressDigit = (minor: number, digit: number): number => {
  const next = minor * 10 + digit
  return next >= LIMIT ? minor : next
}

export const pressDoubleZero = (minor: number): number => pressDigit(pressDigit(minor, 0), 0)

export const pressDelete = (minor: number): number => Math.floor(minor / 10)

// The draft's unsigned decimal text for the typed amount; '' for an empty
// keypad so validation refuses it as unentered rather than as zero.
export const keypadAmountText = (minor: number, currency: CurrencyCode): string =>
  minor === 0 ? '' : fromMinorUnits(minor, currency)
