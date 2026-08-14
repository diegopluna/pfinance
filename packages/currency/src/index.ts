// The Household's Currency is chosen once at creation (ADR 0002) and every
// amount is an INTEGER in its minor unit (ADR 0006). This package is the
// single source of truth for which currencies exist, their minor-unit
// exponent, and how amounts convert and format at the presentation edge —
// nothing outside it may assume a symbol or precision.

export interface Currency {
  /** ISO 4217 alphabetic code. */
  code: string
  /** English display name for pickers. */
  name: string
  /** Minor units per major unit is 10^exponent (USD: 2, JPY: 0, BHD: 3). */
  minorUnitExponent: number
}

// Curated ISO 4217 subset; exponents follow the ISO table.
export const CURRENCIES = [
  { code: 'AED', name: 'UAE Dirham', minorUnitExponent: 2 },
  { code: 'ARS', name: 'Argentine Peso', minorUnitExponent: 2 },
  { code: 'AUD', name: 'Australian Dollar', minorUnitExponent: 2 },
  { code: 'BHD', name: 'Bahraini Dinar', minorUnitExponent: 3 },
  { code: 'BRL', name: 'Brazilian Real', minorUnitExponent: 2 },
  { code: 'CAD', name: 'Canadian Dollar', minorUnitExponent: 2 },
  { code: 'CHF', name: 'Swiss Franc', minorUnitExponent: 2 },
  { code: 'CLP', name: 'Chilean Peso', minorUnitExponent: 0 },
  { code: 'CNY', name: 'Chinese Yuan', minorUnitExponent: 2 },
  { code: 'COP', name: 'Colombian Peso', minorUnitExponent: 2 },
  { code: 'CZK', name: 'Czech Koruna', minorUnitExponent: 2 },
  { code: 'DKK', name: 'Danish Krone', minorUnitExponent: 2 },
  { code: 'EGP', name: 'Egyptian Pound', minorUnitExponent: 2 },
  { code: 'EUR', name: 'Euro', minorUnitExponent: 2 },
  { code: 'GBP', name: 'Pound Sterling', minorUnitExponent: 2 },
  { code: 'HKD', name: 'Hong Kong Dollar', minorUnitExponent: 2 },
  { code: 'HUF', name: 'Hungarian Forint', minorUnitExponent: 2 },
  { code: 'IDR', name: 'Indonesian Rupiah', minorUnitExponent: 2 },
  { code: 'ILS', name: 'Israeli New Shekel', minorUnitExponent: 2 },
  { code: 'INR', name: 'Indian Rupee', minorUnitExponent: 2 },
  { code: 'ISK', name: 'Icelandic Krona', minorUnitExponent: 0 },
  { code: 'JPY', name: 'Japanese Yen', minorUnitExponent: 0 },
  { code: 'KES', name: 'Kenyan Shilling', minorUnitExponent: 2 },
  { code: 'KRW', name: 'South Korean Won', minorUnitExponent: 0 },
  { code: 'KWD', name: 'Kuwaiti Dinar', minorUnitExponent: 3 },
  { code: 'MXN', name: 'Mexican Peso', minorUnitExponent: 2 },
  { code: 'MYR', name: 'Malaysian Ringgit', minorUnitExponent: 2 },
  { code: 'NGN', name: 'Nigerian Naira', minorUnitExponent: 2 },
  { code: 'NOK', name: 'Norwegian Krone', minorUnitExponent: 2 },
  { code: 'NZD', name: 'New Zealand Dollar', minorUnitExponent: 2 },
  { code: 'PEN', name: 'Peruvian Sol', minorUnitExponent: 2 },
  { code: 'PHP', name: 'Philippine Peso', minorUnitExponent: 2 },
  { code: 'PLN', name: 'Polish Zloty', minorUnitExponent: 2 },
  { code: 'RON', name: 'Romanian Leu', minorUnitExponent: 2 },
  { code: 'SAR', name: 'Saudi Riyal', minorUnitExponent: 2 },
  { code: 'SEK', name: 'Swedish Krona', minorUnitExponent: 2 },
  { code: 'SGD', name: 'Singapore Dollar', minorUnitExponent: 2 },
  { code: 'THB', name: 'Thai Baht', minorUnitExponent: 2 },
  { code: 'TRY', name: 'Turkish Lira', minorUnitExponent: 2 },
  { code: 'TWD', name: 'New Taiwan Dollar', minorUnitExponent: 2 },
  { code: 'USD', name: 'US Dollar', minorUnitExponent: 2 },
  { code: 'VND', name: 'Vietnamese Dong', minorUnitExponent: 0 },
  { code: 'ZAR', name: 'South African Rand', minorUnitExponent: 2 },
] as const satisfies readonly Currency[]

export type CurrencyCode = (typeof CURRENCIES)[number]['code']

const byCode = new Map<string, Currency>(CURRENCIES.map((currency) => [currency.code, currency]))

export function isSupportedCurrency(code: unknown): code is CurrencyCode {
  return typeof code === 'string' && byCode.has(code)
}

export function getCurrency(code: CurrencyCode): Currency {
  const currency = byCode.get(code)
  if (currency === undefined) {
    throw new RangeError(`Unsupported currency: "${code}"`)
  }
  return currency
}

/**
 * Integer minor units → exact decimal string ("1234" → "12.34" for USD).
 * String arithmetic, so the round-trip with toMinorUnits is exact.
 */
export function fromMinorUnits(minorUnits: number, code: CurrencyCode): string {
  if (!Number.isSafeInteger(minorUnits)) {
    throw new RangeError(`Amount must be a safe integer in minor units, got ${minorUnits}`)
  }
  const { minorUnitExponent } = getCurrency(code)
  const sign = minorUnits < 0 ? '-' : ''
  const digits = Math.abs(minorUnits).toString()
  if (minorUnitExponent === 0) {
    return sign + digits
  }
  const padded = digits.padStart(minorUnitExponent + 1, '0')
  const major = padded.slice(0, -minorUnitExponent)
  const minor = padded.slice(-minorUnitExponent)
  return `${sign}${major}.${minor}`
}

/**
 * The one way an amount renders anywhere in the app: integer minor units →
 * localized currency string. Formats the exact decimal-string form, so no
 * float ever touches a ledger amount.
 */
export function formatAmount(minorUnits: number, code: CurrencyCode, locale?: string): string {
  const { minorUnitExponent } = getCurrency(code)
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: code,
    minimumFractionDigits: minorUnitExponent,
    maximumFractionDigits: minorUnitExponent,
  })
  // Intl formats numeric strings exactly (NumberFormat v3, everywhere the
  // app runs: workerd, evergreen browsers, Node 20+) — the amount never
  // passes through a float. TS's lib types lag the spec, hence the cast.
  return formatter.format(fromMinorUnits(minorUnits, code) as unknown as number)
}

/**
 * Decimal string at the boundary (form input, CSV cell) → integer minor
 * units. Parses digit-by-digit — never via float multiplication (ADR 0006).
 * Throws RangeError on malformed input or more precision than the Currency
 * carries.
 */
export function toMinorUnits(decimal: string, code: CurrencyCode): number {
  const { minorUnitExponent } = getCurrency(code)
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(decimal.trim())
  if (!match) {
    throw new RangeError(`Not a decimal amount: "${decimal}"`)
  }
  const [, sign, major, minor = ''] = match
  if (minor.length > minorUnitExponent) {
    throw new RangeError(
      `"${decimal}" has more precision than ${code} carries (${minorUnitExponent} minor-unit digits)`,
    )
  }
  const units = Number(`${major}${minor.padEnd(minorUnitExponent, '0')}`)
  if (!Number.isSafeInteger(units)) {
    throw new RangeError(`Amount out of safe integer range: "${decimal}"`)
  }
  return sign === '-' ? -units : units
}

/**
 * The compact value form ("1.2K") for display-only chart geometry — axis
 * ticks and bar tips; exact amounts always render via formatAmount. Fixed
 * English suffixes and integer arithmetic throughout: Hermes' partial Intl
 * support can't vary the output between devices, and no float ever touches
 * the amount (ADR 0006). A suffix is picked when the magnitude rounds to at
 * least 1.0 of it in tenths, so 999,999.99 promotes to 1M and 999.95 to 1K
 * — never a four-digit "1000K".
 */
export function compactAmount(minorUnits: number, code: CurrencyCode): string {
  if (!Number.isSafeInteger(minorUnits)) {
    throw new RangeError(`Amount must be a safe integer in minor units, got ${minorUnits}`)
  }
  const { minorUnitExponent } = getCurrency(code)
  const sign = minorUnits < 0 ? '-' : ''
  const value = Math.abs(minorUnits)
  const minorPerMajor = 10 ** minorUnitExponent
  const steps = [
    { major: 1_000_000_000, suffix: 'B' },
    { major: 1_000_000, suffix: 'M' },
    { major: 1_000, suffix: 'K' },
  ]
  for (const { major, suffix } of steps) {
    // Tenths of the suffix's step, rounded half-up — integer divmod, so the
    // amount never passes through a float.
    const perTenth = (major / 10) * minorPerMajor
    const tenths = Math.floor(value / perTenth) + ((value % perTenth) * 2 >= perTenth ? 1 : 0)
    if (tenths >= 10) {
      // One decimal, with a round result rendering bare: 10K, never 10.0K.
      return `${sign}${Math.floor(tenths / 10)}${tenths % 10 === 0 ? '' : `.${tenths % 10}`}${suffix}`
    }
  }
  const units =
    Math.floor(value / minorPerMajor) + ((value % minorPerMajor) * 2 >= minorPerMajor ? 1 : 0)
  return units === 0 ? '0' : `${sign}${units}`
}
