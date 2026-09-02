import { useEffect, useState, type JSX } from 'react'
import { View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  interpolate,
  Keyframe,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'
import { Body } from '@/components/type'
import { confirm } from '@/haptics'
import { duration, ease, settle } from '@/motion'
import { dismissToast, subscribeToasts, toast, type Toast } from '@/shell/toast'

// The toast (docs/design/MOTION.md), after Sonner: one line, one at a
// time, top centre under the status bar — the one place a floating message
// never collides with the keypad, the tab bar or a sheet's grabber. It
// drops in from where it lives, lingers long enough to be read and not
// long enough to be waited for, and leaves upward; a swipe up takes it
// early and carries the finger's velocity, an abandoned swipe springs
// home, a tap dismisses.
//
// The pill is inverted — foreground fill, background text — so it floats
// by contrast on a screen that has no shadows by decision (MOBILE.md).

const LINGER_MS = 2600
// Past this a swipe is a dismissal even at rest; below it, only a flick is.
const SWIPE_DISTANCE = -14
const SWIPE_VELOCITY = -400

/** A write landed: the success haptic and the toast, together. */
export function notify(message: string): void {
  confirm()
  toast(message)
}

const drop = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: -16 }, { scale: 0.96 }] },
  100: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }], easing: ease.out },
})
  .duration(duration.toastIn)
  .reduceMotion(ReduceMotion.System)

const lift = new Keyframe({
  0: { opacity: 1, transform: [{ translateY: 0 }] },
  100: { opacity: 0, transform: [{ translateY: -12 }], easing: ease.out },
})
  .duration(duration.toastOut)
  .reduceMotion(ReduceMotion.System)

export function Toaster(): JSX.Element {
  const [current, setCurrent] = useState<Toast | null>(null)
  useEffect(() => subscribeToasts(setCurrent), [])
  const insets = useSafeAreaInsets()
  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, right: 0, top: insets.top + 8, alignItems: 'center' }}
    >
      {/* Keyed by id: a replacement is a new pill entering, not a relabel. */}
      {current !== null && <Pill key={current.id} entry={current} />}
    </View>
  )
}

function Pill({ entry }: { entry: Toast }): JSX.Element {
  const offset = useSharedValue(0)

  useEffect(() => {
    const timer = setTimeout(() => dismissToast(entry.id), LINGER_MS)
    return () => clearTimeout(timer)
  }, [entry.id])

  const dismiss = () => dismissToast(entry.id)
  const pan = Gesture.Pan()
    .onUpdate((event) => {
      // Up moves freely; down rubber-bands — there is nowhere to go.
      offset.value = event.translationY < 0 ? event.translationY : event.translationY * 0.12
    })
    .onEnd((event) => {
      if (event.translationY < SWIPE_DISTANCE || event.velocityY < SWIPE_VELOCITY) {
        scheduleOnRN(dismiss)
      } else {
        offset.value = withSpring(0, settle)
      }
    })
  const tap = Gesture.Tap().onEnd(() => {
    scheduleOnRN(dismiss)
  })

  // The finger's translation on an inner view, the enter/exit on the outer
  // one: layout animations and an animated transform on the same node
  // fight over the same property.
  const dragged = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.value }],
    opacity: interpolate(offset.value, [-40, 0], [0.4, 1], 'clamp'),
  }))

  return (
    <Animated.View entering={drop} exiting={lift}>
      <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
        <Animated.View
          style={dragged}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          className="rounded-full bg-foreground px-4 py-2.5"
        >
          <Body size="sm" className="font-medium text-background">
            {entry.message}
          </Body>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  )
}
