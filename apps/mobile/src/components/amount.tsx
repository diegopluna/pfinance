import type { JSX } from 'react'
import { Text, type TextProps } from 'react-native'
import { useLineHeight } from '@/components/type'
import type { LedgerAmount } from '@/ledger/display'

// Money is right-aligned and tabular (DECISIONS.md) — stated once here.
// Figures are Geist Sans with `fontVariant: ['tabular-nums']`: Geist's
// static TTFs carry the tnum feature (verified against the shipped files),
// so the columns align without switching voices — the mono stays reserved
// for operational identifiers (components/type.tsx). The weights follow the
// web: 500 for a figure in a row, 600 when it leads. The tones mirror the
// web ledger table: income green, transfers and adjustments muted,
// expenses plain.

const SIZES = {
  sm: 'text-body-sm',
  base: 'text-body',
  lg: 'text-figure-lg',
  // The one figure a screen leads with.
  hero: 'text-hero',
} as const

// Points, for the line height the hero needs — the rest inherit the
// platform's own leading, which already tracks the font size.
const HERO_SIZE = 38

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
  // The hero is the only figure with enough leading to crush itself if the
  // line height stayed put while the text size grew (components/type.tsx).
  const heroLineHeight = useLineHeight(HERO_SIZE, 1.16)
  const leading = size === 'hero' || size === 'lg'
  return (
    <Text
      className={`${leading ? 'font-semibold' : 'font-medium'} ${SIZES[size]} ${TONES[tone]} ${className}`}
      style={[
        { fontVariant: ['tabular-nums'] },
        size === 'hero'
          ? { letterSpacing: -1.2, lineHeight: heroLineHeight }
          : { letterSpacing: size === 'lg' ? -0.34 : -0.15 },
      ]}
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
