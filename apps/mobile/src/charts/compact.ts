import { getCurrency, type CurrencyCode } from '@pfinance/currency'

// The compact value form ("1.2K") for display-only chart geometry — axis
// ticks and bar tips; exact amounts always render via formatAmount. The web
// leans on Intl's compact notation (apps/web/src/lib/format.ts); Hermes'
// Intl support is partial and device-dependent, so this stays plain math
// with fixed suffixes. The minor→major conversion reads the exponent from
// the shared currency package (ADR 0006) — the one float division here
// never touches a ledger amount that is kept.

const STEPS = [
  { threshold: 1_000_000_000, suffix: 'B' },
  { threshold: 1_000_000, suffix: 'M' },
  { threshold: 1_000, suffix: 'K' },
] as const

export const compactAmount = (minorUnits: number, currency: CurrencyCode): string => {
  const major = minorUnits / 10 ** getCurrency(currency).minorUnitExponent
  const sign = major < 0 ? '-' : ''
  const magnitude = Math.abs(major)
  for (const { threshold, suffix } of STEPS) {
    // A step is picked when the magnitude rounds to at least 1.0 of it, in
    // tenths — so 999,999.99 promotes to 1M and 999.95 to 1K, never landing
    // on a four-digit "1000K"/"1000".
    const tenths = Math.round((magnitude / threshold) * 10)
    if (tenths >= 10) {
      // One decimal, with a round result rendering bare: 10K, never 10.0K.
      return `${sign}${tenths % 10 === 0 ? tenths / 10 : (tenths / 10).toFixed(1)}${suffix}`
    }
  }
  return `${sign}${Math.round(magnitude)}`
}
