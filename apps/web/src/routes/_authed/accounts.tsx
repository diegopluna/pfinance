import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ACCOUNT_TYPES, isAccountType, type AccountType } from '@pfinance/db/account-types'
import {
  formatAmount,
  fromMinorUnits,
  isSupportedCurrency,
  toMinorUnits,
  type CurrencyCode,
} from '@pfinance/currency'
import { Button } from '@pfinance/ui/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@pfinance/ui/components/card'
import { FieldGroup } from '@pfinance/ui/components/field'
import { Separator } from '@pfinance/ui/components/separator'
import { api } from '@/lib/api'
import { useAppForm } from '@/hooks/form'
import { useMe } from '@/hooks/use-me'

export const Route = createFileRoute('/_authed/accounts')({
  component: AccountsScreen,
})

const typeOptions = ACCOUNT_TYPES.map(({ type, label, kind }) => ({
  value: type,
  // The kind rides along in the picker so it's obvious which types will
  // count against Net Worth (ADR 0001).
  label: kind === 'liability' ? `${label} — liability` : label,
}))

const typeLabels = new Map<string, string>(ACCOUNT_TYPES.map(({ type, label }) => [type, label]))

interface AccountFields {
  name: string
  type: AccountType
  openingBalance: number
}

function AccountsScreen() {
  const queryClient = useQueryClient()
  const { data: me } = useMe()
  const [showArchived, setShowArchived] = useState(false)
  // null: panel closed · 'new': creating · otherwise the id being edited.
  const [editing, setEditing] = useState<string | null>(null)

  // Every amount is entered and shown in the Household Currency (ADR 0002).
  // The USD fallback only covers the frame before /api/me resolves — the
  // form can't submit without a loaded session anyway.
  const currency: CurrencyCode =
    me !== undefined && isSupportedCurrency(me.household.currency) ? me.household.currency : 'USD'

  const accountsQuery = useQuery({
    queryKey: ['accounts', showArchived],
    queryFn: async () => {
      const response = await api.api.accounts.$get({
        query: { includeArchived: showArchived ? 'true' : 'false' },
      })
      if (!response.ok) {
        throw new Error('Failed to load accounts')
      }
      return response.json()
    },
  })

  const saveAccount = useMutation({
    mutationFn: async ({ id, fields }: { id: string | null; fields: AccountFields }) => {
      const response =
        id === null
          ? await api.api.accounts.$post({ json: fields })
          : await api.api.accounts[':id'].$patch({ param: { id }, json: fields })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? 'Failed to save the account')
      }
      return response.json()
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['accounts'] })
      closePanel()
    },
  })

  const setArchived = useMutation({
    mutationFn: async ({ id, archive }: { id: string; archive: boolean }) => {
      const route = api.api.accounts[':id']
      const response = archive
        ? await route.archive.$post({ param: { id } })
        : await route.unarchive.$post({ param: { id } })
      if (!response.ok) {
        throw new Error('Failed to update the account')
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['accounts'] }),
  })

  const form = useAppForm({
    defaultValues: { name: '', type: '', openingBalance: '' },
    onSubmit: async ({ value }) => {
      if (!isAccountType(value.type)) return
      await saveAccount.mutateAsync({
        id: editing === 'new' ? null : editing,
        fields: {
          name: value.name.trim(),
          type: value.type,
          // Decimal string → integer minor units at the boundary (ADR 0006).
          openingBalance: toMinorUnits(value.openingBalance.trim(), currency),
        },
      })
    },
  })

  const closePanel = () => {
    setEditing(null)
    form.reset({ name: '', type: '', openingBalance: '' })
  }

  const openCreate = () => {
    setEditing('new')
    form.reset({ name: '', type: '', openingBalance: '' })
  }

  const openEdit = (entry: { id: string; name: string; type: string; openingBalance: number }) => {
    setEditing(entry.id)
    form.reset({
      name: entry.name,
      type: entry.type,
      openingBalance: fromMinorUnits(entry.openingBalance, currency),
    })
  }

  const validAmount = (value: string) => {
    try {
      toMinorUnits(value.trim(), currency)
      return true
    } catch {
      return false
    }
  }

  const accounts = accountsQuery.data?.accounts ?? []

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="flex flex-col gap-1.5">
          <CardTitle>Accounts</CardTitle>
          <CardDescription>
            Balances are derived from the ledger: opening balance plus every transaction.
          </CardDescription>
        </div>
        <Button variant="outline" onClick={openCreate}>
          New account
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {editing !== null && (
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              void form.handleSubmit()
            }}
            className="rounded-2xl border border-border p-4"
          >
            <FieldGroup>
              <div className="grid grid-cols-2 gap-3">
                <form.AppField
                  name="name"
                  validators={{
                    onSubmit: ({ value }) => (value.trim() ? undefined : 'Name the account'),
                  }}
                >
                  {(field) => <field.TextField label="Name" placeholder="Checking" />}
                </form.AppField>
                <form.AppField
                  name="type"
                  validators={{
                    onSubmit: ({ value }) => (isAccountType(value) ? undefined : 'Choose a type'),
                  }}
                >
                  {(field) => (
                    <field.ComboboxField
                      label="Type"
                      placeholder="Choose"
                      searchPlaceholder="Search types…"
                      emptyText="No account type found."
                      options={typeOptions}
                    />
                  )}
                </form.AppField>
              </div>
              <form.AppField
                name="openingBalance"
                validators={{
                  onSubmit: ({ value }) =>
                    validAmount(value) ? undefined : 'Enter an amount like 1234.56',
                }}
              >
                {(field) => (
                  <field.TextField
                    label={`Opening balance (${currency})`}
                    placeholder="0.00"
                    inputMode="decimal"
                  />
                )}
              </form.AppField>
              {saveAccount.isError && (
                <p className="text-sm text-destructive">{saveAccount.error.message}</p>
              )}
              <div className="flex items-center gap-2">
                <form.AppForm>
                  <form.SubmitButton>
                    {editing === 'new' ? 'Create account' : 'Save changes'}
                  </form.SubmitButton>
                </form.AppForm>
                <Button type="button" variant="ghost" onClick={closePanel}>
                  Cancel
                </Button>
              </div>
            </FieldGroup>
          </form>
        )}

        {accountsQuery.isPending ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : accountsQuery.isError ? (
          <p className="text-sm text-destructive">Couldn&apos;t load accounts.</p>
        ) : accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No accounts yet — create one to start the ledger.
          </p>
        ) : (
          <ul className="flex flex-col">
            {accounts.map((entry, index) => (
              <li key={entry.id}>
                {index > 0 && <Separator className="my-3" />}
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <span className="truncate">{entry.name}</span>
                      {entry.archivedAt !== null && (
                        <span className="shrink-0 rounded-full border border-border px-1.5 text-[10px] font-semibold tracking-wide text-muted-foreground">
                          ARCHIVED
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {typeLabels.get(entry.type) ?? entry.type}
                      {entry.kind === 'liability' && ' · liability'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-sm font-medium tabular-nums">
                      {formatAmount(entry.balance, currency)}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground"
                      onClick={() => openEdit(entry)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground"
                      disabled={setArchived.isPending}
                      onClick={() =>
                        setArchived.mutate({ id: entry.id, archive: entry.archivedAt === null })
                      }
                    >
                      {entry.archivedAt === null ? 'Archive' : 'Restore'}
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {setArchived.isError && (
          <p className="text-sm text-destructive">Couldn&apos;t update that account.</p>
        )}

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Archived accounts keep their history and stay out of the way.
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => setShowArchived((current) => !current)}
          >
            {showArchived ? 'Hide archived' : 'Show archived'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
