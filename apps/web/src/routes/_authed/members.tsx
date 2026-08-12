import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@pfinance/ui/components/alert-dialog'
import { Badge } from '@pfinance/ui/components/badge'
import { Button } from '@pfinance/ui/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@pfinance/ui/components/card'
import { InitialsAvatar } from '@pfinance/ui/components/initials-avatar'
import { Separator } from '@pfinance/ui/components/separator'
import type { DateFormat } from '@pfinance/db/date-formats'
import { isForbidden } from '@/lib/api-call'
import { useDateFormat } from '@/hooks/use-date-format'
import { useInvites, useMemberMutations, useMembers } from '@/hooks/use-members'
import { useMe } from '@/hooks/use-me'
import { formatMonthYear } from '@/lib/dates'

export const Route = createFileRoute('/_authed/members')({
  head: () => ({ meta: [{ title: 'Members · pfinance' }] }),
  component: MembersScreen,
})

// The Invite travels as a copy-paste link into this app's sign-up screen
// (ADR 0005: no email anywhere).
const inviteLink = (token: string) => `${window.location.origin}/sign-up?invite=${token}`

// Compact display of the link (Claude Design 2e): host + abbreviated secret.
const inviteLinkLabel = (token: string) =>
  `${window.location.host}/sign-up?invite=${token.slice(0, 4)}…${token.slice(-4)}`

// Honors the Household date format (issue #31) like every other date.
const joinedLabel = (iso: string, format: DateFormat) =>
  `Joined ${formatMonthYear(new Date(iso), format)}`

const expiryLabel = (iso: string) => {
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return 'expired'
  const days = Math.round(ms / 86_400_000)
  if (days >= 2) return `expires in ${days} days`
  const hours = Math.round(ms / 3_600_000)
  return hours >= 2 ? `expires in ${hours} hours` : 'expires within the hour'
}

function MembersScreen() {
  const dateFormat = useDateFormat()
  const [copiedId, setCopiedId] = useState<string | null>(null)
  // Removal is confirmed in an AlertDialog whose action repeats the
  // consequence; the target outlives `open` so the closing popup keeps its
  // content while it animates out.
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<{ id: string; name: string } | null>(null)
  const { data: me } = useMe()

  const membersQuery = useMembers()
  const invitesQuery = useInvites()
  const { createInvite, revokeInvite, removeMember } = useMemberMutations()

  const copyLink = async (id: string, token: string) => {
    await navigator.clipboard.writeText(inviteLink(token))
    setCopiedId(id)
    setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 2000)
  }

  // The management surface is the owner's alone; the server answers 403 for
  // everyone else, and this screen relays that instead of half-rendering.
  if (isForbidden(membersQuery.error) || isForbidden(invitesQuery.error)) {
    return (
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>
            <h1 className="text-base font-medium">Members</h1>
          </CardTitle>
          <CardDescription>
            Only the household owner can manage members and invites.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  // One card holding both the member list and the pending Invites, per
  // Claude Design 2e ("Settings — household, members, invites").
  return (
    <Card className="w-full max-w-2xl">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="flex flex-col gap-1.5">
          <CardTitle>
            <h1 className="text-base font-medium">Members</h1>
          </CardTitle>
          <CardDescription>
            Everyone in the household sees and edits the same ledger.
          </CardDescription>
        </div>
        <Button
          variant="outline"
          disabled={createInvite.isPending}
          onClick={() =>
            // Creating an Invite is for handing its link to someone — copy it
            // right away so the owner can paste it without hunting for the row.
            createInvite.mutate(undefined, {
              onSuccess: ({ invite }) => copyLink(invite.id, invite.token),
            })
          }
        >
          New invite
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {membersQuery.isPending ? (
          <p role="status" className="text-sm text-muted-foreground">
            Loading…
          </p>
        ) : membersQuery.isError ? (
          <p role="alert" className="text-sm text-destructive">
            Couldn&apos;t load members.
          </p>
        ) : (
          <ul className="flex flex-col">
            {membersQuery.data.members.map((entry, index) => (
              <li key={entry.id}>
                {index > 0 && <Separator className="my-3" />}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <InitialsAvatar name={entry.name} />
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        <span className="truncate">{entry.name}</span>
                        {entry.role === 'owner' && <Badge>Owner</Badge>}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {entry.email}
                        {me?.user.id === entry.userId
                          ? ' · you'
                          : ` · ${joinedLabel(entry.createdAt, dateFormat)}`}
                      </p>
                    </div>
                  </div>
                  {entry.role !== 'owner' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-muted-foreground"
                      disabled={removeMember.isPending}
                      onClick={() => {
                        setRemoveTarget({ id: entry.id, name: entry.name })
                        setRemoveDialogOpen(true)
                      }}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {removeMember.isError && (
          <p role="alert" className="text-sm text-destructive">
            Couldn&apos;t remove that member.
          </p>
        )}

        <p className="mt-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Pending invites
        </p>
        {invitesQuery.isPending ? (
          <p role="status" className="text-sm text-muted-foreground">
            Loading…
          </p>
        ) : invitesQuery.isError ? (
          <p role="alert" className="text-sm text-destructive">
            Couldn&apos;t load invites.
          </p>
        ) : invitesQuery.data.invites.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pending invites.</p>
        ) : (
          <ul className="flex flex-col">
            {invitesQuery.data.invites.map((entry, index) => (
              <li key={entry.id}>
                {index > 0 && <Separator className="my-3" />}
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium tabular-nums">
                      {inviteLinkLabel(entry.token)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Single-use · {expiryLabel(entry.expiresAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void copyLink(entry.id, entry.token)}
                    >
                      {copiedId === entry.id ? 'Copied!' : 'Copy link'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground"
                      disabled={revokeInvite.isPending}
                      onClick={() => revokeInvite.mutate(entry.id)}
                    >
                      Revoke
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {revokeInvite.isError && (
          <p role="alert" className="text-sm text-destructive">
            Couldn&apos;t revoke that invite.
          </p>
        )}
        {createInvite.isError && (
          <p role="alert" className="text-sm text-destructive">
            Couldn&apos;t create an invite.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Invite links work even while sign-ups are disabled — issuing one is the consent. There is
          no email sending; share the link yourself.
        </p>
      </CardContent>
      <AlertDialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove member?</AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget !== null &&
                `${removeTarget.name} loses access to the household and its ledger.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (removeTarget !== null) {
                  removeMember.mutate(removeTarget.id)
                }
                setRemoveDialogOpen(false)
              }}
            >
              Remove member
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
