import { expect, test } from 'vite-plus/test'
import { rollSlots } from '../src/ledger/roll.ts'

// --- The rolling figure's keys (docs/design/MOTION.md) ---
// Keys count from the right, so typing a digit — which shifts the whole
// number one place left — keeps the glyphs that did not change in place.

const keys = (text: string) => rollSlots(text).map((slot) => slot.key)

test('slots count from the right and carry the character', () => {
  expect(keys('$0.12')).toEqual(['4:$', '3:0', '2:.', '1:1', '0:2'])
})

test('typing a digit changes only the glyphs whose character moved', () => {
  const before = new Set(keys('$0.12'))
  const changed = keys('$1.23').filter((key) => !before.has(key))
  // The mark and the point stay; the three digits roll.
  expect(changed).toEqual(['3:1', '1:2', '0:3'])
})

test('a value growing a digit adds one new leftmost glyph', () => {
  const before = new Set(keys('$9.99'))
  const changed = keys('$99.99').filter((key) => !before.has(key))
  expect(changed).toEqual(['5:$', '4:9'])
})

test('surrogate pairs are one glyph', () => {
  expect(rollSlots('₿1').map((slot) => slot.char)).toEqual(['₿', '1'])
})
