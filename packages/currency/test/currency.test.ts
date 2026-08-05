import { expect, test } from 'vite-plus/test'
import { formatAmount, fromMinorUnits, isSupportedCurrency, toMinorUnits } from '../src/index.ts'

// Amounts are integers in the Household currency's minor unit (ADR 0006);
// the exponent comes from the Currency, so 2 (USD), 0 (JPY), and 3 (BHD)
// must all round-trip exactly.

test('decimal strings round-trip through minor units for a 2-exponent currency', () => {
  expect(toMinorUnits('12.34', 'USD')).toBe(1234)
  expect(fromMinorUnits(1234, 'USD')).toBe('12.34')
})

test('0- and 3-exponent currencies round-trip with their own precision', () => {
  expect(toMinorUnits('500', 'JPY')).toBe(500)
  expect(fromMinorUnits(500, 'JPY')).toBe('500')
  expect(toMinorUnits('1.234', 'BHD')).toBe(1234)
  expect(fromMinorUnits(1234, 'BHD')).toBe('1.234')
})

test('formatAmount renders minor units with the currency symbol and precision', () => {
  expect(formatAmount(1234, 'USD', 'en-US')).toBe('$12.34')
  expect(formatAmount(-1234, 'USD', 'en-US')).toBe('-$12.34')
  expect(formatAmount(500, 'JPY', 'en-US')).toBe('¥500')
  // CLDR separates the symbol with a non-breaking space.
  expect(formatAmount(123456, 'BRL', 'pt-BR')).toBe('R$ 1.234,56')
})

test('input with more precision than the Currency carries is rejected, not rounded', () => {
  expect(() => toMinorUnits('12.345', 'USD')).toThrow(RangeError)
  expect(() => toMinorUnits('500.5', 'JPY')).toThrow(RangeError)
})

test('malformed decimal input is rejected at the boundary', () => {
  expect(() => toMinorUnits('12,34', 'USD')).toThrow(RangeError)
  expect(() => toMinorUnits('1e3', 'USD')).toThrow(RangeError)
  expect(() => toMinorUnits('', 'USD')).toThrow(RangeError)
})

test('isSupportedCurrency accepts known ISO codes and rejects everything else', () => {
  expect(isSupportedCurrency('EUR')).toBe(true)
  expect(isSupportedCurrency('DOGE')).toBe(false)
  expect(isSupportedCurrency(undefined)).toBe(false)
})
