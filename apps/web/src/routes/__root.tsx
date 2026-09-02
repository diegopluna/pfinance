import { HeadContent, Outlet, createRootRoute } from '@tanstack/react-router'
import { Toaster } from '@pfinance/ui/components/sonner'

// HeadContent renders each route's `head` config (per-screen document
// titles); routes compose theirs as "Screen · Goblin". The Toaster is the
// one confirmation surface (docs/design/MOTION.md), mounted once here.
export const Route = createRootRoute({
  head: () => ({ meta: [{ title: 'Goblin' }] }),
  component: () => (
    <>
      <HeadContent />
      <Outlet />
      <Toaster />
    </>
  ),
})
