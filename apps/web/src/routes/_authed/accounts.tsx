import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { InferRequestType, InferResponseType } from 'hono/client'
import { ACCOUNT_TYPES, isAccountType } from '@pfinance/db/account-types'
import {
  formatAmount,
  fromMinorUnits,
  getCurrency,
  isSupportedCurrency,
  toMinorUnits,
  type CurrencyCode,
} from '@pfinance/currency'
import { Badge } from '@pfinance/ui/components/badge'
import { Button } from '@pfinance/ui/components/button'
import { Card, CardContent } from '@pfinance/ui/components/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@pfinance/ui/components/dialog'
import { FieldGroup } from '@pfinance/ui/components/field'
import { api } from '@/lib/api'
import { focusFirstInvalid, useAppForm } from '@/hooks/form'
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

// Format guidance in the Household Currency: "1234.56" for BRL, "1234" for
// JPY, "1234.567" for BHD — the example must be an amount the currency's
// minor-unit exponent actually accepts (ADR 0006).
const amountExample = (currency: CurrencyCode) => {
  const { minorUnitExponent } = getCurrency(currency)
  return minorUnitExponent === 0 ? '1234' : `1234.${'5678'.slice(0, minorUnitExponent)}`
}

const archivedLabel = (iso: string | null) =>
  iso === null
    ? 'Archived'
    : `Archived ${new Date(iso).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`

// Both shapes are inferred from the server's route schema so they can't
// drift: the editable state from the create validator, the listed Account
// from the list response.
type AccountFields = InferRequestType<typeof api.api.accounts.$post>['json']
type AccountEntry = InferResponseType<typeof api.api.accounts.$get, 200>['accounts'][number]

function AccountsScreen() {
  const queryClient = useQueryClient()
  const { data: me } = useMe()
  const [showArchived, setShowArchived] = useState(false)
  // The dialog's target outlives `open` so the closing popup keeps its
  // content while Base UI animates out and restores focus; the nonce forces
  // a fresh form mount per open (see the `key` below).
  const [dialogOpen, setDialogOpen] = useState(false)
  const [target, setTarget] = useState<{ entry: AccountEntry | null; nonce: number }>({
    entry: null,
    nonce: 0,
  })

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
      setDialogOpen(false)
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

  const openDialog = (entry: AccountEntry | null) => {
    saveAccount.reset()
    setTarget((current) => ({ entry, nonce: current.nonce + 1 }))
    setDialogOpen(true)
  }

  const accounts = accountsQuery.data?.accounts ?? []
  const active = accounts.filter((entry) => entry.archivedAt === null)
  const archived = accounts.filter((entry) => entry.archivedAt !== null)

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">Accounts</h1>
          <p className="text-sm text-muted-foreground">
            Balances are derived: opening balance plus the sum of each account&apos;s transactions.
            Nothing here is directly editable.
          </p>
        </div>
        <Button className="shrink-0" onClick={() => openDialog(null)}>
          New account
        </Button>
      </div>

      <AccountFormDialog
        key={target.nonce}
        open={dialogOpen}
        entry={target.entry}
        householdName={me?.household.name}
        currency={currency}
        error={saveAccount.isError ? saveAccount.error.message : null}
        onSubmit={(fields) =>
          saveAccount
            .mutateAsync({ id: target.entry?.id ?? null, fields })
            // The mutation records failures for the dialog's error line;
            // swallow the rejection so the form doesn't also throw.
            .then(
              () => undefined,
              () => undefined,
            )
        }
        onClose={() => setDialogOpen(false)}
      />

      {accountsQuery.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading…
        </p>
      ) : accountsQuery.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Couldn&apos;t load accounts.
        </p>
      ) : active.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No accounts yet — create one to start the ledger.
        </p>
      ) : (
        // Account cards with the derived Balance front and center (Claude
        // Design 2c); liabilities carry the LIABILITY badge so debt reads as
        // debt at a glance.
        <div className="grid gap-3 sm:grid-cols-2">
          {active.map((entry) => (
            <Card key={entry.id} size="sm">
              <CardContent className="flex flex-col">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{entry.name}</span>
                  <Badge>
                    {entry.kind === 'liability'
                      ? 'Liability'
                      : (typeLabels.get(entry.type) ?? entry.type)}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {typeLabels.get(entry.type) ?? entry.type}
                </p>
                <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">
                  {formatAmount(entry.balance, currency)}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Opened with {formatAmount(entry.openingBalance, currency)}
                </p>
                <div className="-ml-2 mt-2 flex items-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    onClick={() => openDialog(entry)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    disabled={setArchived.isPending}
                    onClick={() => setArchived.mutate({ id: entry.id, archive: true })}
                  >
                    Archive
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {setArchived.isError && (
        <p role="alert" className="text-sm text-destructive">
          Couldn&apos;t update that account.
        </p>
      )}

      {/* Archived section per Claude Design 2c — dimmed, history preserved —
          but hidden until asked for (issue #7: hidden by default). */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {showArchived ? `Archived (${archived.length})` : 'Archived'}
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
      {showArchived &&
        (archived.length === 0 ? (
          <p className="text-sm text-muted-foreground">No archived accounts.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {archived.map((entry) => (
              <li key={entry.id}>
                <Card size="sm" className="opacity-65">
                  <CardContent className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{entry.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {archivedLabel(entry.archivedAt)} · history preserved
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground"
                        onClick={() => openDialog(entry)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground"
                        disabled={setArchived.isPending}
                        onClick={() => setArchived.mutate({ id: entry.id, archive: false })}
                      >
                        Unarchive
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        ))}
    </div>
  )
}

// The create/edit dialog (Claude Design 2d). Mounted fresh per target (see
// the `key` at the call site), so defaultValues are simply the values being
// edited and TanStack Form never fights a mid-life defaults change.
function AccountFormDialog({
  open,
  entry,
  householdName,
  currency,
  error,
  onSubmit,
  onClose,
}: {
  open: boolean
  entry: AccountEntry | null
  householdName: string | undefined
  currency: CurrencyCode
  error: string | null
  onSubmit: (fields: AccountFields) => Promise<void>
  onClose: () => void
}) {
  const form = useAppForm({
    defaultValues: {
      name: entry?.name ?? '',
      type: entry?.type ?? '',
      openingBalance: entry === null ? '' : fromMinorUnits(entry.openingBalance, currency),
    },
    onSubmitInvalid: focusFirstInvalid,
    onSubmit: async ({ value }) => {
      if (!isAccountType(value.type)) return
      await onSubmit({
        name: value.name.trim(),
        type: value.type,
        // Decimal string → integer minor units at the boundary (ADR 0006).
        openingBalance: toMinorUnits(value.openingBalance.trim(), currency),
      })
    },
  })

  const validAmount = (value: string) => {
    try {
      toMinorUnits(value.trim(), currency)
      return true
    } catch {
      return false
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{entry === null ? 'New account' : 'Edit account'}</DialogTitle>
          {householdName !== undefined && (
            <DialogDescription>
              Belongs to {householdName} · {currency}
            </DialogDescription>
          )}
        </DialogHeader>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void form.handleSubmit()
          }}
        >
          <FieldGroup>
            <div className="grid gap-3 sm:grid-cols-2">
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
                  validAmount(value)
                    ? undefined
                    : `Enter an amount like ${amountExample(currency)}`,
              }}
            >
              {(field) => (
                <field.TextField
                  label={`Opening balance (${currency})`}
                  placeholder={fromMinorUnits(0, currency)}
                  inputMode="decimal"
                />
              )}
            </form.AppField>
            {/* Claude Design 2d's framing of the type choice. */}
            <p className="text-xs text-muted-foreground">
              Liability types (credit card, loan) count negatively toward net worth. The balance is
              derived from here on.
            </p>
            {error !== null && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <form.AppForm>
                <form.SubmitButton>
                  {entry === null ? 'Create account' : 'Save changes'}
                </form.SubmitButton>
              </form.AppForm>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  )
}
