import * as Haptics from 'expo-haptics'

// Haptics are for commitments (docs/design/MOTION.md): a keypad key and a
// segmented switch tick, a write that landed confirms. Navigation, row
// taps and scrolling stay silent — the phone already does those. Both
// calls are fire-and-forget; a device without an engine resolves quietly.

/** The tick of a key or a switch. */
export const tick = (): void => {
  void Haptics.selectionAsync()
}

/** A write that landed. */
export const confirm = (): void => {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
}
