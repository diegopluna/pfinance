import { Link, Outlet, useLocation, useNavigate } from '@tanstack/react-router'
import { Button } from '@pfinance/ui/components/button'
import { InitialsAvatar } from '@pfinance/ui/components/initials-avatar'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@pfinance/ui/components/sidebar'
import { authClient } from '@/lib/auth-client'
import { useMe } from '@/hooks/use-me'

// The signed-in frame every feature screen renders inside (the /_authed
// layout); child routes land in the Outlet. shadcn sidebar in the Claude
// Design 2a–2f arrangement: logo up top, nav, household identity pinned to
// the bottom.
export function Shell() {
  const navigate = useNavigate()
  const pathname = useLocation({ select: (location) => location.pathname })
  const { data: session } = authClient.useSession()
  const { data: me } = useMe()

  const handleSignOut = async () => {
    await authClient.signOut()
    await navigate({ to: '/sign-in' })
  }

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="flex items-center gap-2.5 px-2 py-1 text-[15px] font-semibold tracking-tight">
            <span className="size-5 rounded-md bg-sidebar-foreground" />
            pfinance
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive={pathname === '/'} render={<Link to="/" />}>
                    Dashboard
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {/* The ledger is every Member's (CONTEXT.md); managing
                    Members and Invites is owner-only (issue #6). */}
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={pathname.startsWith('/accounts')}
                    render={<Link to="/accounts" />}
                  >
                    Accounts
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={pathname.startsWith('/transactions')}
                    render={<Link to="/transactions" />}
                  >
                    Transactions
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={pathname.startsWith('/imports')}
                    render={<Link to="/imports" />}
                  >
                    Imports
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={pathname.startsWith('/categories')}
                    render={<Link to="/categories" />}
                  >
                    Categories
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {me?.role === 'owner' && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={pathname.startsWith('/members')}
                      render={<Link to="/members" />}
                    >
                      Members
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <div className="flex items-center gap-2.5 border-t border-sidebar-border px-2 pt-3">
            <InitialsAvatar
              name={session?.user.name ?? ''}
              className="border-sidebar-border bg-sidebar-accent"
            />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[12.5px] font-semibold">{me?.household.name}</span>
              <span className="truncate text-[11px] text-muted-foreground">
                {me ? `${me.household.currency} · ${me.role}` : session?.user.email}
              </span>
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="justify-start px-2 text-muted-foreground"
            onClick={() => void handleSignOut()}
          >
            Sign out
          </Button>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 px-4">
          <SidebarTrigger className="-ml-1" />
        </header>
        <div className="flex-1 px-6 pb-6">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
