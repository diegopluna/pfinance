import {
  Easing,
  Keyframe,
  ReduceMotion,
  type WithSpringConfig,
  type WithTimingConfig,
} from 'react-native-reanimated'

// The app's one motion vocabulary (docs/design/MOTION.md). Every animation
// in the app names a curve and a duration from here; nothing picks its own.
//
// Ease out for anything entering or anything the user caused — the motion
// is spent in the first frames, so the response reads as immediate and the
// settle as free. `sheet` is the front-loaded curve a surface travelling
// its own size wants. `move` is for something already on screen changing
// place or size. There is deliberately no ease-in.
export const ease = {
  out: Easing.bezier(0.25, 1, 0.5, 1),
  sheet: Easing.bezier(0.32, 0.72, 0, 1),
  move: Easing.bezier(0.45, 0, 0.55, 1),
} as const

// Milliseconds. Exits are shorter than enters: the user has moved on.
export const duration = {
  pressIn: 90,
  pressOut: 160,
  enter: 200,
  exit: 150,
  move: 250,
  digits: 180,
  toastIn: 260,
  toastOut: 180,
} as const

// A timing config that honours the system's reduced-motion setting — every
// `withTiming` in the app goes through this, so none can forget.
export const timing = (ms: number, easing = ease.out): WithTimingConfig => ({
  duration: ms,
  easing,
  reduceMotion: ReduceMotion.System,
})

// The one spring: something a finger let go of, coming home. Overshoot is
// clamped — a toast that bounces is a toy.
export const settle: WithSpringConfig = {
  damping: 28,
  stiffness: 320,
  mass: 1,
  overshootClamping: true,
  reduceMotion: ReduceMotion.System,
}

// A surface arriving under the same chrome: fade, a few pixels of rise and
// a touch of scale, so it comes from somewhere rather than switching on.
export const rise = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: 6 }, { scale: 0.985 }] },
  100: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }], easing: ease.out },
})
  .duration(duration.enter)
  .reduceMotion(ReduceMotion.System)

// Leaving is just a fade, and shorter.
export const fade = new Keyframe({
  0: { opacity: 1 },
  100: { opacity: 0, easing: ease.out },
})
  .duration(duration.exit)
  .reduceMotion(ReduceMotion.System)
