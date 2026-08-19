// The app lock's state machine (issue #84): pure transitions, so the two
// subtle rules live in one tested place instead of inside an effect.
//
// Rule one: locking ARMS on the transition to 'background', deliberately
// not on 'inactive' — on iOS the Face ID prompt itself makes the app
// inactive, and arming on it would re-lock the app mid-unlock. Rule two:
// the privacy COVER is broader than the lock — it shows whenever the app
// is not active, so the app switcher's snapshot captures the mark, never
// the ledger. Free of react-native imports so the workspace's node test
// runner covers it.

export type LockState = 'unlocked' | 'locked'

export type LockEvent =
  | { kind: 'app-state'; status: 'active' | 'inactive' | 'background' | 'unknown' | 'extension' }
  | { kind: 'unlocked' }
  | { kind: 'enabled' }
  | { kind: 'disabled' }

export const nextLockState = (
  current: LockState,
  enabled: boolean,
  event: LockEvent,
): LockState => {
  if (!enabled) return 'unlocked'
  switch (event.kind) {
    case 'app-state':
      return event.status === 'background' ? 'locked' : current
    case 'unlocked':
      return 'unlocked'
    // Turning the lock on arms it for the NEXT open — the person who just
    // authenticated to flip the switch is not asked again on the spot.
    case 'enabled':
      return 'unlocked'
    case 'disabled':
      return 'unlocked'
  }
}

// What the person sees: the cover hides content while locked AND while the
// app is not active (the switcher snapshot), whether or not a lock is
// armed — cached financial data never appears in the multitasking view
// once the lock feature is on.
export const coverVisible = (
  state: LockState,
  enabled: boolean,
  appState: 'active' | 'inactive' | 'background' | 'unknown' | 'extension',
): boolean => enabled && (state === 'locked' || appState !== 'active')
