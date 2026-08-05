import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@pfinance/ui/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@pfinance/ui/components/card'
import { Separator } from '@pfinance/ui/components/separator'
import { api } from '@/lib/api'

export const Route = createFileRoute('/_authed/members')({
  component: MembersScreen,
})

// The Invite travels as a copy-paste link into this app's sign-up screen
// (ADR 0005: no email anywhere).
const inviteLink = (token: string) => `${window.location.origin}/sign-up?invite=${token}`

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

function MembersScreen() {
  const queryClient = useQueryClient()
  const [copiedId, setCopiedId] = useState<string | null>(null)

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
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>
            Only the household owner can manage members and invites.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>Everyone in your household shares the same ledger.</CardDescription>
        </CardHeader>
        <CardContent>
          {membersQuery.isPending ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : membersQuery.isError ? (
            <p className="text-sm text-destructive">Couldn&apos;t load members.</p>
          ) : (
            <ul className="flex flex-col">
              {membersQuery.data.members.map((entry, index) => (
                <li key={entry.id}>
                  {index > 0 && <Separator className="my-3" />}
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{entry.name}</p>
                      <p className="truncate text-sm text-muted-foreground">{entry.email}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-xs text-muted-foreground uppercase">{entry.role}</span>
                      {entry.role !== 'owner' && (
                        <Button
                          variant="outline"
                          size="sm"
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
                  </div>
                </li>
              ))}
            </ul>
          )}
          {removeMember.isError && (
            <p className="mt-3 text-sm text-destructive">Couldn&apos;t remove that member.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pending invites</CardTitle>
          <CardDescription>
            An invite is a single-use link that lets one person join your household — even while
            sign-ups are closed. Links expire after a week.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {invitesQuery.isPending ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : invitesQuery.isError ? (
            <p className="text-sm text-destructive">Couldn&apos;t load invites.</p>
          ) : invitesQuery.data.invites.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending invites.</p>
          ) : (
            <ul className="flex flex-col">
              {invitesQuery.data.invites.map((entry, index) => (
                <li key={entry.id}>
                  {index > 0 && <Separator className="my-3" />}
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-muted-foreground">
                      Expires {formatDate(entry.expiresAt)}
                    </p>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void copyLink(entry.id, entry.token)}
                      >
                        {copiedId === entry.id ? 'Copied!' : 'Copy link'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
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
            <p className="text-sm text-destructive">Couldn&apos;t revoke that invite.</p>
          )}
          {createInvite.isError && (
            <p className="text-sm text-destructive">Couldn&apos;t create an invite.</p>
          )}
          <div>
            <Button disabled={createInvite.isPending} onClick={() => createInvite.mutate()}>
              New invite
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
