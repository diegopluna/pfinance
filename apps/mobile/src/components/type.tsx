import type { JSX, ReactNode } from 'react'
import { Text, useWindowDimensions, View, type TextProps } from 'react-native'

// One voice: Geist for everything, weights 400–600 (the family stops
// there). Geist Mono appears only for operational identifiers — a Server
// address, a path — never for money; figures are the sans with tabular
// numerals (components/amount.tsx).
//
// Sizes come from the `--text-*` scale in src/global.css. Line heights do
// not: React Native scales `fontSize` with the OS text-size setting but
// leaves a `lineHeight` given in points exactly where it was, so a fixed
// leading crushes its own text the moment someone turns type size up. Every
// line height here is therefore a multiple applied to the current
// fontScale, which useWindowDimensions re-reads when the setting changes.
export function useLineHeight(size: number, ratio: number): number {
  const { fontScale } = useWindowDimensions()
  return Math.round(size * ratio * fontScale)
}

// Eyebrows name a region of a screen. Sentence case in the quiet weight —
// the design's kicker voice; the days of uppercase letterspaced mono are
// over, hierarchy comes from tone and position instead.
export function Eyebrow({
  children,
  tone = 'muted',
  className = '',
  ...props
}: TextProps & { children: ReactNode; tone?: 'muted' | 'foreground' }): JSX.Element {
  const lineHeight = useLineHeight(12, 1.34)
  return (
    <Text
      className={`font-normal text-eyebrow ${tone === 'muted' ? 'text-muted' : 'text-foreground'} ${className}`}
      style={{ letterSpacing: -0.06, lineHeight }}
      {...props}
    >
      {children}
    </Text>
  )
}

// A section's name inside a screen: the web's 13px semibold tracking-tight,
// stronger than an eyebrow, subordinate to the screen title.
export function SectionTitle({
  children,
  className = '',
  ...props
}: TextProps & { children: ReactNode }): JSX.Element {
  const lineHeight = useLineHeight(13, 1.39)
  return (
    <Text
      className={`font-semibold text-body-sm text-foreground ${className}`}
      style={{ letterSpacing: -0.16, lineHeight }}
      numberOfLines={1}
      {...props}
    >
      {children}
    </Text>
  )
}

// A screen's name. `lg` is for the screens that ask a question rather than
// show a ledger — the connect flow, where the title is the whole content
// and has room to be one.
export function Title({
  children,
  size = 'md',
  className = '',
  ...props
}: TextProps & { children: ReactNode; size?: 'md' | 'lg' }): JSX.Element {
  const lineHeight = useLineHeight(size === 'lg' ? 26 : 22, 1.27)
  return (
    <Text
      className={`font-semibold text-foreground ${size === 'lg' ? 'text-title-lg' : 'text-title'} ${className}`}
      style={{ letterSpacing: size === 'lg' ? -0.6 : -0.48, lineHeight }}
      numberOfLines={size === 'lg' ? undefined : 1}
      {...props}
    >
      {children}
    </Text>
  )
}

// Prose.
export function Body({
  children,
  tone = 'foreground',
  size = 'base',
  className = '',
  ...props
}: TextProps & {
  children: ReactNode
  tone?: 'foreground' | 'muted' | 'danger'
  size?: 'base' | 'sm'
}): JSX.Element {
  const color =
    tone === 'muted' ? 'text-muted' : tone === 'danger' ? 'text-danger' : 'text-foreground'
  const lineHeight = useLineHeight(size === 'sm' ? 13 : 15, size === 'sm' ? 1.54 : 1.6)
  return (
    <Text
      className={`font-normal ${size === 'sm' ? 'text-body-sm' : 'text-body'} ${color} ${className}`}
      style={{ lineHeight }}
      {...props}
    >
      {children}
    </Text>
  )
}

// A badge names a kind that would otherwise have to be inferred from an
// amount: a Transfer leg, a Balance Adjustment, a liability. It is outlined
// rather than filled — a filled chip in this app means something you can
// press — and sentence case, like everything else now.
export function Badge({ children }: { children: ReactNode }): JSX.Element {
  return (
    <View className="rounded-sm border border-separator px-1.5 py-px">
      <Text className="font-medium text-caption text-muted" numberOfLines={1}>
        {children}
      </Text>
    </View>
  )
}
