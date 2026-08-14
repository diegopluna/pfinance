import type { JSX, ReactNode } from 'react'
import { Text, View, type TextProps } from 'react-native'

// The app's two voices. Prose is Spline Sans; anything that is a figure, a
// key, or a piece of structure is Spline Sans Mono — a ledger is a column
// of aligned digits, and the mono is what makes the column true.

// Eyebrows name a region of a screen. They are uppercase and letterspaced
// so they read as labels at a glance and never compete with a title —
// there is no numbering, because none of these screens is a sequence.
export function Eyebrow({
  children,
  tone = 'muted',
  className = '',
  ...props
}: TextProps & { children: ReactNode; tone?: 'muted' | 'foreground' }): JSX.Element {
  return (
    <Text
      className={`font-mono-medium text-[11px] uppercase ${tone === 'muted' ? 'text-muted' : 'text-foreground'} ${className}`}
      style={{ letterSpacing: 1.1 }}
      {...props}
    >
      {children}
    </Text>
  )
}

// A screen's name, in the display voice. `lg` is for the screens that ask a
// question rather than show a ledger — the connect flow, where the title is
// the whole content and has room to be one.
export function Title({
  children,
  size = 'md',
  className = '',
  ...props
}: TextProps & { children: ReactNode; size?: 'md' | 'lg' }): JSX.Element {
  return (
    <Text
      className={`font-mono-medium text-foreground ${size === 'lg' ? 'text-[26px] leading-8' : 'text-[21px]'} ${className}`}
      style={{ letterSpacing: size === 'lg' ? -0.6 : -0.3 }}
      numberOfLines={size === 'lg' ? undefined : 1}
      {...props}
    >
      {children}
    </Text>
  )
}

// Prose: the only place the sans face appears at any size.
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
  return (
    <Text
      className={`font-normal ${size === 'sm' ? 'text-[13px] leading-5' : 'text-[15px] leading-6'} ${color} ${className}`}
      {...props}
    >
      {children}
    </Text>
  )
}

// A badge names a kind that would otherwise have to be inferred from an
// amount: LIABILITY, TRANSFER, ADJUSTMENT. It is outlined rather than
// filled — a filled chip in this app means something you can press.
export function Badge({ children }: { children: ReactNode }): JSX.Element {
  return (
    <View className="rounded-sm border border-separator px-1.5 py-px">
      <Text
        className="font-mono text-[10px] text-muted uppercase"
        style={{ letterSpacing: 0.8 }}
        numberOfLines={1}
      >
        {children}
      </Text>
    </View>
  )
}
