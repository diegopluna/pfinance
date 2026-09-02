// The rolling figure's keys (components/rolling-figure.tsx). A slot is a
// glyph's position counted from the RIGHT, because that is the end a
// cash-register keypad grows from: typing a digit shifts every digit one
// place left, so counted from the left everything changes, and counted
// from the right the currency mark and any digits that happen to coincide
// stay put. A key is the slot plus the character, so a glyph remounts —
// and rolls — exactly when the character at its position changes.

export interface RollSlot {
  key: string
  char: string
}

export function rollSlots(text: string): RollSlot[] {
  // Code points, not UTF-16 units: a currency mark outside the BMP is one
  // glyph. Nothing a formatted amount contains combines beyond that.
  const chars = Array.from(text)
  const last = chars.length - 1
  return chars.map((char, index) => ({ key: `${last - index}:${char}`, char }))
}
