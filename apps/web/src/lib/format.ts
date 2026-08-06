import { getCurrency, type CurrencyCode } from '@pfinance/currency'

// The compact currency form ("R$ 2 mil") for display-only geometry — axis
// ticks and bar-tip labels; exact amounts live in tooltips and tables via
// formatAmount. The one float division here never touches a ledger amount
// that is kept (ADR 0006).
export const compactAmount = (minorUnits: number, currency: CurrencyCode) =>
  new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(minorUnits / 10 ** getCurrency(currency).minorUnitExponent)
