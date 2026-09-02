// The toast store (docs/design/MOTION.md): one line of confirmation after
// a write, one at a time. A new toast replaces the current one rather than
// stacking — these are two-word acknowledgements, and a second one arriving
// means the first has been read. Pure and listener-based so the write
// surfaces can call `toast()` from anywhere, and the Toaster component in
// components/toaster.tsx is the only subscriber.

export interface Toast {
  id: number
  message: string
}

type Listener = (current: Toast | null) => void

let current: Toast | null = null
let nextId = 1
const listeners = new Set<Listener>()

const emit = (): void => {
  for (const listener of listeners) listener(current)
}

/** Show a toast; returns its id so the caller (or a timer) can dismiss it. */
export function toast(message: string): number {
  current = { id: nextId++, message }
  emit()
  return current.id
}

/** Dismiss a toast by id — a no-op if a newer one has already replaced it. */
export function dismissToast(id: number): void {
  if (current === null || current.id !== id) return
  current = null
  emit()
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function currentToast(): Toast | null {
  return current
}
