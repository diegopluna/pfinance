import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { InferRequestType, InferResponseType } from 'hono/client'
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
import { Field, FieldLabel } from '@pfinance/ui/components/field'
import { FieldGroup } from '@pfinance/ui/components/field'
import { Input } from '@pfinance/ui/components/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@pfinance/ui/components/select'
import { api } from '@/lib/api'
import { focusFirstInvalid, useAppForm } from '@/hooks/form'
import { useMe } from '@/hooks/use-me'

export const Route = createFileRoute('/_authed/transactions')({
  component: TransactionsScreen,
})

// Both shapes are inferred from the server's route schema so they can't
// drift: the editable state from the create validator, the listed
// Transaction from the list response.
type TransactionFields = InferRequestType<typeof api.api.transactions.$post>['json']
type TransactionEntry = InferResponseType<
  typeof api.api.transactions.$get,
  200
>['transactions'][number]
type AccountEntry = InferResponseType<typeof api.api.accounts.$get, 200>['accounts'][number]

// A Transaction's date is a calendar date string (never a timestamp), so it
// must be formatted from its parts — new Date('2026-01-15') would read it as
// UTC midnight and shift it a day west of Greenwich.
const formatCalendarDate = (date: string) => {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

// Format guidance in the Household Currency, signed: money out is negative.
const amountExample = (currency: CurrencyCode) => {
  const { minorUnitExponent } = getCurrency(currency)
  return minorUnitExponent === 0 ? '-1234' : `-1234.${'5678'.slice(0, minorUnitExponent)}`
}

interface Filters {
  accountId: string
  from: string
  to: string
  q: string
}

const noFilters: Filters = { accountId: '', from: '', to: '', q: '' }

function TransactionsScreen() {
  const queryClient = useQueryClient()
  const { data: me } = useMe()
  const [filters, setFilters] = useState<Filters>(noFilters)
  // The dialog's target outlives `open` so the closing popup keeps its
  // content while Base UI animates out and restores focus; the nonce forces
  // a fresh form mount per open (see the `key` below).
  const [dialogOpen, setDialogOpen] = useState(false)
  const [target, setTarget] = useState<{ entry: TransactionEntry | null; nonce: number }>({
    entry: null,
    nonce: 0,
  })

  // Every amount is entered and shown in the Household Currency (ADR 0002).
  // The USD fallback only covers the frame before /api/me resolves.
  const currency: CurrencyCode =
    me !== undefined && isSupportedCurrency(me.household.currency) ? me.household.currency : 'USD'

  // All Accounts, archived included: the ledger keeps history for closed
  // accounts, so the filter and the rows must still name them.
  const accountsQuery = useQuery({
    queryKey: ['accounts', true],
    queryFn: async () => {
      const response = await api.api.accounts.$get({ query: { includeArchived: 'true' } })
      if (!response.ok) {
        throw new Error('Failed to load accounts')
      }
      return response.json()
    },
  })
  const accounts = accountsQuery.data?.accounts ?? []
  const accountNames = new Map(accounts.map((entry) => [entry.id, entry.name]))
  const accountFilterOptions = [
    { value: '', label: 'All accounts' },
    ...accounts.map((entry) => ({ value: entry.id, label: entry.name })),
  ]

  const transactionsQuery = useQuery({
    queryKey: ['transactions', filters],
    queryFn: async () => {
      const response = await api.api.transactions.$get({
        query: {
          ...(filters.accountId !== '' && { accountId: filters.accountId }),
          ...(filters.from !== '' && { from: filters.from }),
          ...(filters.to !== '' && { to: filters.to }),
          ...(filters.q.trim() !== '' && { q: filters.q.trim() }),
        },
      })
      if (!response.ok) {
        throw new Error('Failed to load transactions')
      }
      return response.json()
    },
    // Keep the previous page while a filter keystroke refetches, so the list
    // doesn't blink empty on every character.
    placeholderData: keepPreviousData,
  })

  const saveTransaction = useMutation({
    mutationFn: async ({ id, fields }: { id: string | null; fields: TransactionFields }) => {
      const response =
        id === null
          ? await api.api.transactions.$post({ json: fields })
          : await api.api.transactions[':id'].$patch({ param: { id }, json: fields })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? 'Failed to save the transaction')
      }
      return response.json()
    },
    onSuccess: async () => {
      // Balances are derived from the ledger, so Accounts refresh too.
      await queryClient.invalidateQueries({ queryKey: ['transactions'] })
      await queryClient.invalidateQueries({ queryKey: ['accounts'] })
      setDialogOpen(false)
    },
  })

  const deleteTransaction = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.api.transactions[':id'].$delete({ param: { id } })
      if (!response.ok) {
        throw new Error('Failed to delete the transaction')
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['transactions'] })
      await queryClient.invalidateQueries({ queryKey: ['accounts'] })
    },
  })

  const openDialog = (entry: TransactionEntry | null) => {
    saveTransaction.reset()
    setTarget((current) => ({ entry, nonce: current.nonce + 1 }))
    setDialogOpen(true)
  }

  const transactions = transactionsQuery.data?.transactions ?? []
  const filtering =
    filters.accountId !== '' || filters.from !== '' || filters.to !== '' || filters.q.trim() !== ''

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">Transactions</h1>
          <p className="max-w-prose text-sm text-muted-foreground">
            The household ledger. Amounts are signed: negative is money out, positive is money in.
          </p>
        </div>
        <Button className="shrink-0" onClick={() => openDialog(null)}>
          New transaction
        </Button>
      </div>

      <TransactionFormDialog
        key={target.nonce}
        open={dialogOpen}
        entry={target.entry}
        accounts={accounts}
        currency={currency}
        error={saveTransaction.isError ? saveTransaction.error.message : null}
        onSubmit={(fields) =>
          saveTransaction
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

      {/* Filter bar: Account, inclusive date range, and description search
          compose; Clear resets the whole bar at once. */}
      <div className="flex flex-wrap items-end gap-2">
        <Field className="w-44 gap-1">
          <FieldLabel htmlFor="filter-account" className="text-xs text-muted-foreground">
            Account
          </FieldLabel>
          <Select
            // One list drives both the closed trigger's label (items) and
            // the open list (children).
            items={accountFilterOptions}
            value={filters.accountId}
            onValueChange={(value: string | null) =>
              setFilters((current) => ({ ...current, accountId: value ?? '' }))
            }
          >
            <SelectTrigger id="filter-account" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {accountFilterOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field className="w-36 gap-1">
          <FieldLabel htmlFor="filter-from" className="text-xs text-muted-foreground">
            From
          </FieldLabel>
          <Input
            id="filter-from"
            type="date"
            value={filters.from}
            onChange={(event) =>
              setFilters((current) => ({ ...current, from: event.target.value }))
            }
          />
        </Field>
        <Field className="w-36 gap-1">
          <FieldLabel htmlFor="filter-to" className="text-xs text-muted-foreground">
            To
          </FieldLabel>
          <Input
            id="filter-to"
            type="date"
            value={filters.to}
            onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))}
          />
        </Field>
        <Field className="min-w-44 flex-1 gap-1">
          <FieldLabel htmlFor="filter-q" className="text-xs text-muted-foreground">
            Search
          </FieldLabel>
          <Input
            id="filter-q"
            type="search"
            placeholder="Search descriptions…"
            value={filters.q}
            onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))}
          />
        </Field>
        {filtering && (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => setFilters(noFilters)}
          >
            Clear
          </Button>
        )}
      </div>

      {transactionsQuery.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading…
        </p>
      ) : transactionsQuery.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Couldn&apos;t load transactions.
        </p>
      ) : transactions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {filtering
            ? 'No transactions match these filters.'
            : 'No transactions yet — log the first one to start the ledger.'}
        </p>
      ) : (
        <Card size="sm">
          <CardContent>
            <ul className="divide-y divide-border">
              {transactions.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                  <span className="w-24 shrink-0 text-xs text-muted-foreground tabular-nums">
                    {formatCalendarDate(entry.date)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{entry.description}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {/* Attribution survives the author's removal: the money
                          still moved (createdBy set null server-side). */}
                      Entered by {entry.enteredBy ?? 'a removed member'}
                    </span>
                  </span>
                  <Badge className="shrink-0">
                    {accountNames.get(entry.accountId) ?? 'Unknown account'}
                  </Badge>
                  <span className="w-28 shrink-0 text-right text-sm font-semibold tracking-tight tabular-nums">
                    {formatAmount(entry.amount, currency)}
                  </span>
                  <span className="-mr-2 flex shrink-0 items-center">
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
                      disabled={deleteTransaction.isPending}
                      onClick={() => {
                        if (window.confirm(`Delete "${entry.description}"?`)) {
                          deleteTransaction.mutate(entry.id)
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      {deleteTransaction.isError && (
        <p role="alert" className="text-sm text-destructive">
          Couldn&apos;t delete that transaction.
        </p>
      )}
    </div>
  )
}

// The create/edit dialog. Mounted fresh per target (see the `key` at the
// call site), so defaultValues are simply the values being edited.
function TransactionFormDialog({
  open,
  entry,
  accounts,
  currency,
  error,
  onSubmit,
  onClose,
}: {
  open: boolean
  entry: TransactionEntry | null
  accounts: AccountEntry[]
  currency: CurrencyCode
  error: string | null
  onSubmit: (fields: TransactionFields) => Promise<void>
  onClose: () => void
}) {
  // Open accounts only for new entries; when editing a Transaction that
  // lives on an archived Account, that Account stays choosable so the form
  // can round-trip without forcibly moving the money.
  const accountOptions = accounts
    .filter((account) => account.archivedAt === null || account.id === entry?.accountId)
    .map((account) => ({ value: account.id, label: account.name }))

  const form = useAppForm({
    defaultValues: {
      accountId: entry?.accountId ?? '',
      date: entry?.date ?? '',
      amount: entry === null ? '' : fromMinorUnits(entry.amount, currency),
      description: entry?.description ?? '',
    },
    onSubmitInvalid: focusFirstInvalid,
    onSubmit: async ({ value }) => {
      await onSubmit({
        accountId: value.accountId,
        date: value.date,
        // Signed decimal string → integer minor units at the boundary
        // (ADR 0006); the sign carries the direction.
        amount: toMinorUnits(value.amount.trim(), currency),
        description: value.description.trim(),
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
          <DialogTitle>{entry === null ? 'New transaction' : 'Edit transaction'}</DialogTitle>
          <DialogDescription>
            Negative amounts are money out, positive are money in · {currency}
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void form.handleSubmit()
          }}
        >
          <FieldGroup>
            <form.AppField
              name="description"
              validators={{
                onSubmit: ({ value }) => (value.trim() ? undefined : 'Describe the transaction'),
              }}
            >
              {(field) => <field.TextField label="Description" placeholder="Groceries" />}
            </form.AppField>
            <div className="grid gap-3 sm:grid-cols-2">
              <form.AppField
                name="amount"
                validators={{
                  onSubmit: ({ value }) =>
                    validAmount(value)
                      ? undefined
                      : `Enter a signed amount like ${amountExample(currency)}`,
                }}
              >
                {(field) => (
                  <field.TextField
                    label={`Amount (${currency})`}
                    placeholder={amountExample(currency)}
                    inputMode="decimal"
                  />
                )}
              </form.AppField>
              <form.AppField
                name="date"
                validators={{
                  onSubmit: ({ value }) => (value === '' ? 'Pick a date' : undefined),
                }}
              >
                {(field) => <field.TextField label="Date" type="date" />}
              </form.AppField>
            </div>
            <form.AppField
              name="accountId"
              validators={{
                onSubmit: ({ value }) => (value === '' ? 'Choose an account' : undefined),
              }}
            >
              {(field) => (
                <field.ComboboxField
                  label="Account"
                  placeholder="Choose"
                  searchPlaceholder="Search accounts…"
                  emptyText="No account found."
                  options={accountOptions}
                />
              )}
            </form.AppField>
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
                  {entry === null ? 'Log transaction' : 'Save changes'}
                </form.SubmitButton>
              </form.AppForm>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  )
}
