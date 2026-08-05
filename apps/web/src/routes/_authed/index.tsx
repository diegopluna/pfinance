import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authed/')({
  component: Home,
})

function Home() {
  return (
    <p className="text-muted-foreground">
      Your household ledger will live here — accounts and transactions are coming next.
    </p>
  )
}
