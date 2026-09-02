import { expect, test } from 'vite-plus/test'
import { currentToast, dismissToast, subscribeToasts, toast } from '../src/shell/toast.ts'

// --- The toast store (docs/design/MOTION.md) ---
// One at a time: a newer toast replaces the current one, and a stale
// dismiss — the first toast's timer firing after the second arrived — must
// never take the second down with it.

test('a newer toast replaces the current one', () => {
  const first = toast('Transaction saved')
  const second = toast('Transfer saved')
  expect(second).not.toBe(first)
  expect(currentToast()).toEqual({ id: second, message: 'Transfer saved' })
  dismissToast(second)
})

test('dismissing a stale id leaves the current toast alone', () => {
  const first = toast('Transaction saved')
  const second = toast('Deleted')
  dismissToast(first)
  expect(currentToast()?.id).toBe(second)
  dismissToast(second)
  expect(currentToast()).toBeNull()
})

test('subscribers hear every change, and none after unsubscribing', () => {
  const seen: (string | null)[] = []
  const unsubscribe = subscribeToasts((entry) => seen.push(entry?.message ?? null))
  const id = toast('Adjustment recorded')
  dismissToast(id)
  unsubscribe()
  dismissToast(toast('Unheard'))
  expect(seen).toEqual(['Adjustment recorded', null])
})
