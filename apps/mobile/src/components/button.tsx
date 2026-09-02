import { Button as HeroButton } from 'heroui-native'
import type { ComponentProps, JSX } from 'react'
import { duration, timing } from '@/motion'

// heroui-native's Button with its press re-timed to the app's hand
// (docs/design/MOTION.md): scale 0.97 on the same 160ms ease-out that
// Touchable releases with, instead of heroui's 300ms to 0.985 — too slow
// to feel caused and too small to feel at all. Everything else is
// heroui's; this is the one import for a button anywhere in the app so the
// timing can never drift between screens.
//
// Only heroui's default feedback variant (scale + highlight) is exposed:
// its props are a discriminated union over `feedbackVariant`, and the app
// has never needed another member.
type Props = Extract<ComponentProps<typeof HeroButton>, { feedbackVariant?: 'scale-highlight' }>

const PRESS: NonNullable<Props['animation']> = {
  scale: { value: 0.97, timingConfig: timing(duration.pressOut) },
}

export function Button(props: Props): JSX.Element {
  return <HeroButton animation={PRESS} {...props} />
}
