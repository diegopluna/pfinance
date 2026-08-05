import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
import { api } from '@/lib/api'
import { useMe } from '@/hooks/use-me'

export const Route = createFileRoute('/_authed/members')({
  component: MembersScreen,
})

// The Invite travels as a copy-paste link into this app's sign-up screen
// (ADR 0005: no email anywhere).
const inviteLink = (token: string) => `${window.location.origin}/sign-up?invite=${token}`

// Compact display of the link (Claude Design 2e): host + abbreviated secret.
const inviteLinkLabel = (token: string) =>
  `${window.location.host}/sign-up?invite=${token.slice(0, 4)}…${token.slice(-4)}`

const joinedLabel = (iso: string) =>
  `Joined ${new Date(iso).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`

const expiryLabel = (iso: string) => {
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return 'expired'
  const days = Math.round(ms / 86_400_000)
  if (days >= 2) return `expires in ${days} days`
  const hours = Math.round(ms / 3_600_000)
  return hours >= 2 ? `expires in ${hours} hours` : 'expires within the hour'
}

function MembersScreen() {
  const queryClient = useQueryClient()
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const { data: me } = useMe()

  const membersQuery = useQuery({
    queryKey: ['members'],
    queryFn: async () => {
      const response = await api.api.members.$get()
      if (!response.ok) {
        throw new Error(response.status === 403 ? 'forbidden' : 'Failed to load members')
      }
      return response.json()
    },
    retry: false,
  })

  const invitesQuery = useQuery({
    queryKey: ['invites'],
    queryFn: async () => {
      const response = await api.api.invites.$get()
      if (!response.ok) {
        throw new Error(response.status === 403 ? 'forbidden' : 'Failed to load invites')
      }
      return response.json()
    },
    retry: false,
  })

  const createInvite = useMutation({
    mutationFn: async () => {
      const response = await api.api.invites.$post()
      if (!response.ok) {
        throw new Error('Failed to create invite')
      }
      return response.json()
    },
    onSuccess: async ({ invite }) => {
      await queryClient.invalidateQueries({ queryKey: ['invites'] })
      // Creating an Invite is for handing its link to someone — copy it
      // right away so the owner can paste it without hunting for the row.
      await copyLink(invite.id, invite.token)
    },
  })

  const revokeInvite = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.api.invites[':id'].$delete({ param: { id } })
      if (!response.ok) {
        throw new Error('Failed to revoke invite')
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invites'] }),
  })

  const removeMember = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.api.members[':id'].$delete({ param: { id } })
      if (!response.ok) {
        throw new Error('Failed to remove member')
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['members'] }),
  })

  const copyLink = async (id: string, token: string) => {
    await navigator.clipboard.writeText(inviteLink(token))
    setCopiedId(id)
    setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 2000)
  }

  // The management surface is the owner's alone; the server answers 403 for
  // everyone else, and this screen relays that instead of half-rendering.
  if (membersQuery.error?.message === 'forbidden' || invitesQuery.error?.message === 'forbidden') {
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
          onClick={() => createInvite.mutate()}
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
                          : ` · ${joinedLabel(entry.createdAt)}`}
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
                        if (confirm(`Remove ${entry.name} from the household?`)) {
                          removeMember.mutate(entry.id)
                        }
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
    </Card>
  )
}
