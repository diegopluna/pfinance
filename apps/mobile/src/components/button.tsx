import { Button as HeroButton } from 'heroui-native'
import type { ComponentProps, JSX } from 'react'
import { useControlDepth } from '@/components/plate'
import { duration, timing } from '@/motion'

// heroui-native's Button, dressed and timed for the app:
//
// - The press (docs/design/MOTION.md): scale 0.97 on the same 160ms
//   ease-out that Touchable releases with, instead of heroui's 300ms to
//   0.985 — too slow to feel caused and too small to feel at all.
// - The depth (docs/design/LOOK.md): a primary button is the foreground,
//   inverted, and wears a highlight along its top edge; an outline button
//   lifts like a plate. heroui already draws both as pills (its md radius
//   is 24px on a 48px control), which is the shape the look wants.
//
// This is the one import for a button anywhere in the app, so neither the
// timing nor the dress can drift between screens. Only heroui's default
// feedback variant (scale + highlight) is exposed: its props are a
// discriminated union over `feedbackVariant`, and the app has never needed
// another member.
type Props = Extract<ComponentProps<typeof HeroButton>, { feedbackVariant?: 'scale-highlight' }>

const PRESS: NonNullable<Props['animation']> = {
  scale: { value: 0.97, timingConfig: timing(duration.pressOut) },
}

export function Button({ style, variant, ...props }: Props): JSX.Element {
  const depth = useControlDepth(variant === 'outline' ? 'light' : 'dark')
  const dressed = variant === undefined || variant === 'primary' || variant === 'outline'
  return (
    <HeroButton
      animation={PRESS}
      variant={variant}
      style={dressed ? [depth, style] : style}
      {...props}
    />
  )
}
