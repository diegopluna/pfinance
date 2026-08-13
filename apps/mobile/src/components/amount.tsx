import type { JSX } from 'react'
import { Text } from 'react-native'
import type { LedgerAmount } from '@/ledger/display'

// Money is right-aligned and tabular (DECISIONS.md) — stated once here.
// RN has no font-variant-numeric utility, so the fontVariant style prop
// carries tabular-nums; the tone colors mirror the web ledger table:
// income green, transfers/adjustments muted, expenses plain.
const toneClass = {
  plain: 'text-foreground',
  positive: 'text-success',
  muted: 'text-muted',
} as const

export function Amount({
  amount,
  size = 'base',
}: {
  amount: LedgerAmount
  size?: 'base' | 'lg'
}): JSX.Element {
  return (
    <Text
      className={`text-right font-semibold ${size === 'lg' ? 'text-2xl' : 'text-base'} ${toneClass[amount.tone]}`}
      style={{ fontVariant: ['tabular-nums'] }}
    >
      {amount.text}
    </Text>
  )
}
