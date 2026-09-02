import type { CSSProperties } from 'react'
import { Toaster as Sonner, toast, type ToasterProps } from 'sonner'

// Toasts are Sonner — Emil Kowalski's, the reference the app's motion is
// built to (docs/design/MOTION.md) — dressed in the app's popover surface.
// One line of confirmation after a write; fired at the call sites, never
// from the mutation hooks, which own invalidation and nothing visible.
//
// The theme is pinned to light: the web app defines `.dark` and never
// applies it, so following the OS would put a dark toast on a light page.
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="light"
      position="bottom-right"
      className="toaster group"
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius-xl)',
        } as CSSProperties
      }
      toastOptions={{
        // The toast element's own font beats the container's system stack.
        className: 'font-sans text-sm shadow-lg',
      }}
      {...props}
    />
  )
}

export { Toaster, toast }
