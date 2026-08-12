import { HeadContent, Outlet, createRootRoute } from '@tanstack/react-router'

// HeadContent renders each route's `head` config (per-screen document
// titles); routes compose theirs as "Screen · pfinance".
export const Route = createRootRoute({
  head: () => ({ meta: [{ title: 'pfinance' }] }),
  component: () => (
    <>
      <HeadContent />
      <Outlet />
    </>
  ),
})
