import { expect, test } from 'vite-plus/test'
import { coverVisible, nextLockState, type LockEvent } from '../src/shell/lock.ts'

// --- The app lock's state machine (issue #84) ---
// Locking arms on the transition to background — never on 'inactive',
// because the Face ID prompt itself makes the app inactive on iOS — and
// the privacy cover is broader than the lock: it hides content whenever
// the app is not active, so the switcher snapshot never shows the ledger.

const appState = (status: 'active' | 'inactive' | 'background'): LockEvent => ({
  kind: 'app-state',
  status,
})

test('going to the background arms the lock', () => {
  expect(nextLockState('unlocked', true, appState('background'))).toBe('locked')
})

test('the Face ID prompt (inactive) never re-locks mid-unlock', () => {
  expect(nextLockState('unlocked', true, appState('inactive'))).toBe('unlocked')
  expect(nextLockState('locked', true, appState('inactive'))).toBe('locked')
})

test('a successful authentication unlocks; returning active alone does not', () => {
  expect(nextLockState('locked', true, appState('active'))).toBe('locked')
  expect(nextLockState('locked', true, { kind: 'unlocked' })).toBe('unlocked')
})

test('with the lock off nothing ever locks', () => {
  expect(nextLockState('locked', false, appState('background'))).toBe('unlocked')
})

test('flipping the switch never asks twice on the spot', () => {
  // The person who just authenticated to enable is not immediately locked;
  // the lock arms on the next background instead.
  expect(nextLockState('unlocked', true, { kind: 'enabled' })).toBe('unlocked')
  expect(nextLockState('locked', true, { kind: 'disabled' })).toBe('unlocked')
})

test('the cover hides content while locked and while not active', () => {
  expect(coverVisible('locked', true, 'active')).toBe(true)
  expect(coverVisible('unlocked', true, 'inactive')).toBe(true)
  expect(coverVisible('unlocked', true, 'background')).toBe(true)
  expect(coverVisible('unlocked', true, 'active')).toBe(false)
  expect(coverVisible('locked', false, 'active')).toBe(false)
})
