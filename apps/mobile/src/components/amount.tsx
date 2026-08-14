import type { JSX } from 'react'
import { Text, type TextProps } from 'react-native'
import type { LedgerAmount } from '@/ledger/display'

// Money is right-aligned and tabular (DECISIONS.md) — stated once here.
// The app sets every figure in Spline Sans Mono, so the columns align by
// construction: `fontVariant: ['tabular-nums']` only does anything if the
// loaded face ships the feature, while a monospaced face has nothing to opt
// into. The tones mirror the web ledger table: income green, transfers and
// adjustments muted, expenses plain.

const SIZES = {
  sm: 'text-[13px]',
  base: 'text-[15px]',
  lg: 'text-[19px]',
  // The one figure a screen leads with.
  hero: 'text-[38px] leading-[44px]',
} as const

const TONES = {
  plain: 'text-foreground',
  positive: 'text-success',
  negative: 'text-danger',
  muted: 'text-muted',
} as const

export function Figure({
  children,
  size = 'base',
  tone = 'plain',
  className = '',
  ...props
}: TextProps & {
  children: string
  size?: keyof typeof SIZES
  tone?: keyof typeof TONES
}): JSX.Element {
  return (
    <Text
      className={`${size === 'hero' ? 'font-mono-medium' : 'font-mono'} ${SIZES[size]} ${TONES[tone]} ${className}`}
      style={size === 'hero' ? { letterSpacing: -1.2 } : undefined}
      {...props}
    >
      {children}
    </Text>
  )
}

export function Amount({
  amount,
  size = 'base',
}: {
  amount: LedgerAmount
  size?: keyof typeof SIZES
}): JSX.Element {
  return (
    <Figure size={size} tone={amount.tone} className="text-right">
      {amount.text}
    </Figure>
  )
}
