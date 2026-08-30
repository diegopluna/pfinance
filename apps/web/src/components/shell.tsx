import { Link, Outlet, useLocation, useNavigate } from '@tanstack/react-router'
import {
  HouseIcon,
  ListIcon,
  SettingsIcon,
  TagIcon,
  UploadIcon,
  UsersIcon,
  WalletIcon,
} from 'lucide-react'
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
      {/* First focusable on every screen: keyboard users skip the nav. */}
      <a
        href="#main-content"
        className="sr-only z-50 rounded-lg bg-background px-3 py-2 text-sm font-medium focus-visible:not-sr-only focus-visible:absolute focus-visible:top-2 focus-visible:left-2 focus-visible:ring-3 focus-visible:ring-ring/30"
      >
        Skip to content
      </a>
      <Sidebar>
        <SidebarHeader>
          <div className="flex flex-col gap-1 px-2 py-1">
            <span className="text-[15px] font-semibold tracking-tight">goblin</span>
            <span aria-hidden className="flex h-[3px] w-18">
              <span className="w-1/2 bg-(--chart-2)" />
              <span className="w-1/2 bg-(--chart-1)" />
            </span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive={pathname === '/'} render={<Link to="/" />}>
                    <HouseIcon aria-hidden />
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
                    <WalletIcon aria-hidden />
                    Accounts
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={pathname.startsWith('/transactions')}
                    render={<Link to="/transactions" />}
                  >
                    <ListIcon aria-hidden />
                    Transactions
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={pathname.startsWith('/imports')}
                    render={<Link to="/imports" />}
                  >
                    <UploadIcon aria-hidden />
                    Imports
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={pathname.startsWith('/categories')}
                    render={<Link to="/categories" />}
                  >
                    <TagIcon aria-hidden />
                    Categories
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {me?.role === 'owner' && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={pathname.startsWith('/members')}
                      render={<Link to="/members" />}
                    >
                      <UsersIcon aria-hidden />
                      Members
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {/* Last in the nav (Claude Design 2e); every Member's, like
                    the preferences it holds (issue #31). */}
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={pathname.startsWith('/settings')}
                    render={<Link to="/settings" />}
                  >
                    <SettingsIcon aria-hidden />
                    Settings
                  </SidebarMenuButton>
                </SidebarMenuItem>
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
              {/* The Claude Design identity line: "BRL · 2 members". */}
              <span className="truncate text-[11px] text-muted-foreground">
                {me
                  ? `${me.household.currency} · ${me.household.memberCount} ${
                      me.household.memberCount === 1 ? 'member' : 'members'
                    }`
                  : session?.user.email}
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
        <div id="main-content" className="flex-1 px-6 pb-6">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
