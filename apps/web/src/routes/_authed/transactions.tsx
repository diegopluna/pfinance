import { useEffect, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table'
import type { InferRequestType, InferResponseType } from 'hono/client'
import {
  formatAmount,
  fromMinorUnits,
  getCurrency,
  isSupportedCurrency,
  toMinorUnits,
  type CurrencyCode,
} from '@pfinance/currency'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@pfinance/ui/components/table'
import { CalendarDatePicker } from '@/components/date-picker'
import { useDateFormat } from '@/hooks/use-date-format'
import { formatCalendarDate } from '@/lib/dates'
import { api } from '@/lib/api'
import { focusFirstInvalid, useAppForm } from '@/hooks/form'
import { useAccounts } from '@/hooks/use-accounts'
import { useCategories } from '@/hooks/use-categories'
import { useMe } from '@/hooks/use-me'
import { useTransactionMutations, useTransactions } from '@/hooks/use-transactions'
import { useTransferMutations } from '@/hooks/use-transfers'

export const Route = createFileRoute('/_authed/transactions')({
  head: () => ({ meta: [{ title: 'Transactions · pfinance' }] }),
  // ?new=true (the dashboard's "New transaction") opens the create dialog on
  // arrival; the param is consumed and stripped so refresh doesn't reopen it.
  validateSearch: (search: Record<string, unknown>) =>
    search.new === true || search.new === 'true' ? { new: true as const } : {},
  component: TransactionsScreen,
})

// Both shapes are inferred from the server's route schema so they can't
// drift: the editable state from the create validator, the listed
// Transaction from the list response.
type TransactionFields = InferRequestType<typeof api.api.transactions.$post>['json']
type TransferFields = InferRequestType<typeof api.api.transfers.$post>['json']
type TransactionEntry = InferResponseType<
  typeof api.api.transactions.$get,
  200
>['transactions'][number]
type AccountEntry = InferResponseType<typeof api.api.accounts.$get, 200>['accounts'][number]
type CategoryEntry = InferResponseType<typeof api.api.categories.$get, 200>['categories'][number]

// The filter sentinel for the Uncategorized state — a state, not a Category
// row, so it can't collide with a real id (transactions.ts server-side).
const UNCATEGORIZED = 'uncategorized'

// Format guidance in the Household Currency, signed: money out is negative.
const amountExample = (currency: CurrencyCode) => {
  const { minorUnitExponent } = getCurrency(currency)
  return minorUnitExponent === 0 ? '-1234' : `-1234.${'5678'.slice(0, minorUnitExponent)}`
}

// A Transfer's amount is unsigned — direction is from → to, never a sign.
const transferAmountExample = (currency: CurrencyCode) => amountExample(currency).slice(1)

// Read a Transfer's editable state back off either leg: the leg's sign says
// which side of the pair this Account is on, counterpartAccountId names the
// other (transactions.ts server-side).
const transferSidesOf = (leg: TransactionEntry) => ({
  fromAccountId: leg.amount < 0 ? leg.accountId : (leg.counterpartAccountId ?? ''),
  toAccountId: leg.amount < 0 ? (leg.counterpartAccountId ?? '') : leg.accountId,
})

interface Filters {
  accountId: string
  // '' = all, the UNCATEGORIZED sentinel, or a Category id.
  categoryId: string
  from: string
  to: string
  q: string
}

const noFilters: Filters = { accountId: '', categoryId: '', from: '', to: '', q: '' }

function TransactionsScreen() {
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
  // The Transfer dialog mirrors the Transaction one; its target is either
  // leg of the pair (the form reads the whole Transfer off it), or null for
  // a new Transfer.
  const [transferDialogOpen, setTransferDialogOpen] = useState(false)
  const [transferTarget, setTransferTarget] = useState<{
    entry: TransactionEntry | null
    nonce: number
  }>({ entry: null, nonce: 0 })
  // Deleting is confirmed in an AlertDialog (the imports.tsx pattern) whose
  // action button repeats the consequence — never a bare OK/Cancel. The
  // target outlives `open` (like the edit dialogs above) so the closing
  // popup keeps its content while Base UI animates out.
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<TransactionEntry | null>(null)

  // Every amount is entered and shown in the Household Currency (ADR 0002).
  // The USD fallback only covers the frame before /api/me resolves.
  const currency: CurrencyCode =
    me !== undefined && isSupportedCurrency(me.household.currency) ? me.household.currency : 'USD'

  // All Accounts, archived included: the ledger keeps history for closed
  // accounts, so the filter and the rows must still name them.
  const accountsQuery = useAccounts(true)
  const accounts = accountsQuery.data?.accounts ?? []
  const accountNames = new Map(accounts.map((entry) => [entry.id, entry.name]))
  const accountFilterOptions = [
    { value: '', label: 'All accounts' },
    ...accounts.map((entry) => ({ value: entry.id, label: entry.name })),
  ]

  // All Categories, archived included, for the same reason as Accounts:
  // rows that carry a retired label must still name it (ADR 0003).
  const categoriesQuery = useCategories(true)
  const categories = categoriesQuery.data?.categories ?? []
  const categoryNames = new Map(categories.map((entry) => [entry.id, entry.name]))
  const categoryFilterOptions = [
    { value: '', label: 'All categories' },
    { value: UNCATEGORIZED, label: 'Uncategorized' },
    ...categories.map((entry) => ({ value: entry.id, label: entry.name })),
  ]

  const transactionsQuery = useTransactions({
    ...(filters.accountId !== '' && { accountId: filters.accountId }),
    ...(filters.categoryId !== '' && { categoryId: filters.categoryId }),
    ...(filters.from !== '' && { from: filters.from }),
    ...(filters.to !== '' && { to: filters.to }),
    ...(filters.q.trim() !== '' && { q: filters.q.trim() }),
  })

  const { save: saveTransaction, remove: deleteTransaction } = useTransactionMutations()
  // Transfers write through their own surface (issue #12): both legs move
  // atomically server-side, so the same derived-ledger invalidation covers
  // them (query-keys.ts).
  const { save: saveTransfer, remove: deleteTransfer } = useTransferMutations()

  const openDialog = (entry: TransactionEntry | null) => {
    saveTransaction.reset()
    setTarget((current) => ({ entry, nonce: current.nonce + 1 }))
    setDialogOpen(true)
  }

  // Landed via the dashboard's "New transaction" (?new=true): open the
  // create dialog once, then strip the param so refresh doesn't reopen it.
  const { new: openNew } = Route.useSearch()
  const navigate = useNavigate()
  useEffect(() => {
    if (openNew === true) {
      openDialog(null)
      void navigate({ to: '/transactions', search: {}, replace: true })
    }
    // openDialog/navigate are recreated per render; the param is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openNew])

  const openTransferDialog = (entry: TransactionEntry | null) => {
    saveTransfer.reset()
    setTransferTarget((current) => ({ entry, nonce: current.nonce + 1 }))
    setTransferDialogOpen(true)
  }

  const transactions = transactionsQuery.data?.transactions ?? []
  const filtering =
    filters.accountId !== '' ||
    filters.categoryId !== '' ||
    filters.from !== '' ||
    filters.to !== '' ||
    filters.q.trim() !== ''

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">Transactions</h1>
          <p className="max-w-prose text-sm text-muted-foreground">
            The household ledger. Amounts are signed: negative is money out, positive is money in.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" onClick={() => openTransferDialog(null)}>
            New transfer
          </Button>
          <Button onClick={() => openDialog(null)}>New transaction</Button>
        </div>
      </div>

      <TransactionFormDialog
        key={target.nonce}
        open={dialogOpen}
        entry={target.entry}
        accounts={accounts}
        categories={categories}
        currency={currency}
        error={saveTransaction.isError ? saveTransaction.error.message : null}
        onSubmit={(fields) =>
          saveTransaction
            .mutateAsync({ id: target.entry?.id ?? null, fields })
            // Close on success; the mutation records failures for the
            // dialog's error line, so swallow the rejection so the form
            // doesn't also throw.
            .then(
              () => setDialogOpen(false),
              () => undefined,
            )
        }
        onClose={() => setDialogOpen(false)}
      />

      <TransferFormDialog
        key={transferTarget.nonce}
        open={transferDialogOpen}
        entry={transferTarget.entry}
        accounts={accounts}
        currency={currency}
        error={saveTransfer.isError ? saveTransfer.error.message : null}
        onSubmit={(fields) =>
          saveTransfer.mutateAsync({ id: transferTarget.entry?.transferId ?? null, fields }).then(
            () => setTransferDialogOpen(false),
            () => undefined,
          )
        }
        onClose={() => setTransferDialogOpen(false)}
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
        <Field className="w-44 gap-1">
          <FieldLabel htmlFor="filter-category" className="text-xs text-muted-foreground">
            Category
          </FieldLabel>
          <Select
            items={categoryFilterOptions}
            value={filters.categoryId}
            onValueChange={(value: string | null) =>
              setFilters((current) => ({ ...current, categoryId: value ?? '' }))
            }
          >
            <SelectTrigger id="filter-category" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categoryFilterOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field className="w-40 gap-1">
          <FieldLabel htmlFor="filter-from" className="text-xs text-muted-foreground">
            From
          </FieldLabel>
          <CalendarDatePicker
            id="filter-from"
            value={filters.from}
            placeholder="Any date"
            onChange={(value) => setFilters((current) => ({ ...current, from: value }))}
          />
        </Field>
        <Field className="w-40 gap-1">
          <FieldLabel htmlFor="filter-to" className="text-xs text-muted-foreground">
            To
          </FieldLabel>
          <CalendarDatePicker
            id="filter-to"
            value={filters.to}
            placeholder="Any date"
            onChange={(value) => setFilters((current) => ({ ...current, to: value }))}
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
            <TransactionsTable
              transactions={transactions}
              accountNames={accountNames}
              categoryNames={categoryNames}
              currency={currency}
              deleting={deleteTransaction.isPending || deleteTransfer.isPending}
              // A Transfer leg is not independently editable (issue #12):
              // either leg opens the whole Transfer.
              onEdit={(entry) =>
                entry.transferId === null ? openDialog(entry) : openTransferDialog(entry)
              }
              onDelete={(entry) => {
                setDeleteTarget(entry)
                setDeleteDialogOpen(true)
              }}
            />
          </CardContent>
        </Card>
      )}
      {(deleteTransaction.isError || deleteTransfer.isError) && (
        <p role="alert" className="text-sm text-destructive">
          Couldn&apos;t delete that {deleteTransfer.isError ? 'transfer' : 'transaction'}.
        </p>
      )}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteTarget?.transferId != null ? 'Delete transfer?' : 'Delete transaction?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget !== null &&
                (deleteTarget.transferId !== null
                  ? `"${deleteTarget.description}" — both legs leave the ledger.`
                  : `"${deleteTarget.description}" will be removed from the ledger.`)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleteTarget !== null) {
                  if (deleteTarget.transferId !== null) {
                    deleteTransfer.mutate(deleteTarget.transferId)
                  } else {
                    deleteTransaction.mutate(deleteTarget.id)
                  }
                }
                setDeleteDialogOpen(false)
              }}
            >
              {deleteTarget?.transferId != null ? 'Delete transfer' : 'Delete transaction'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// The ledger as a shadcn data table over TanStack Table (core row model
// only: ordering and filtering are the server's). The full result renders in
// one pass for now — when the ledger grows past that, virtualize the rows
// with @tanstack/react-virtual before reaching for pagination.
function TransactionsTable({
  transactions,
  accountNames,
  categoryNames,
  currency,
  deleting,
  onEdit,
  onDelete,
}: {
  transactions: TransactionEntry[]
  accountNames: Map<string, string>
  categoryNames: Map<string, string>
  currency: CurrencyCode
  deleting: boolean
  onEdit: (entry: TransactionEntry) => void
  onDelete: (entry: TransactionEntry) => void
}) {
  const dateFormat = useDateFormat()
  const columns: ColumnDef<TransactionEntry>[] = [
    {
      accessorKey: 'date',
      header: 'Date',
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatCalendarDate(row.original.date, dateFormat)}
        </span>
      ),
    },
    {
      accessorKey: 'description',
      header: 'Description',
      // A Balance Adjustment or Transfer leg is visibly labeled: both move
      // the Balance but are excluded from Expense/Income, so neither must
      // ever read as an ordinary entry (issues #9, #12).
      cell: ({ row }) => (
        <span className="flex items-center gap-2">
          <span className="block max-w-72 truncate text-sm font-medium">
            {row.original.description}
          </span>
          {row.original.kind === 'balance_adjustment' && <Badge>Balance adjustment</Badge>}
          {row.original.kind === 'transfer' && (
            <Badge>
              {row.original.amount < 0 ? 'Transfer to ' : 'Transfer from '}
              {accountNames.get(row.original.counterpartAccountId ?? '') ?? 'another account'}
            </Badge>
          )}
        </span>
      ),
    },
    {
      id: 'account',
      header: 'Account',
      cell: ({ row }) => (
        <Badge>{accountNames.get(row.original.accountId) ?? 'Unknown account'}</Badge>
      ),
    },
    {
      id: 'category',
      header: 'Category',
      // Exactly one Category or Uncategorized (ADR 0003); the quiet text for
      // the latter keeps real labels visually distinct from the default. A
      // Transfer leg carries no Category at all — it's never spending to
      // analyze — so it shows a dash, not "Uncategorized".
      cell: ({ row }) =>
        row.original.kind === 'transfer' ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : row.original.categoryId === null ? (
          <span className="text-xs text-muted-foreground">Uncategorized</span>
        ) : (
          <Badge>{categoryNames.get(row.original.categoryId) ?? 'Unknown category'}</Badge>
        ),
    },
    {
      accessorKey: 'enteredBy',
      header: 'Entered by',
      // Attribution survives the author's removal: the money still moved
      // (createdBy set null server-side).
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.enteredBy ?? 'A removed member'}
        </span>
      ),
    },
    {
      accessorKey: 'amount',
      header: () => <span className="block text-right">Amount</span>,
      // Amount treatment per kind (Core Screens 2a, DECISIONS.md): expenses
      // plain, income green with an explicit +, Transfers muted and unsigned
      // (direction is from → to, never a sign), Adjustments muted keeping
      // their sign.
      cell: ({ row }) => {
        const { amount, kind } = row.original
        const muted = kind === 'transfer' || kind === 'balance_adjustment'
        const shown = kind === 'transfer' ? Math.abs(amount) : amount
        const formatted = formatAmount(shown, currency)
        return (
          <span
            className={`block text-right text-sm font-semibold tracking-tight tabular-nums ${
              muted ? 'text-muted-foreground' : shown > 0 ? 'text-positive' : ''
            }`}
          >
            {shown > 0 && kind !== 'transfer' ? `+${formatted}` : formatted}
          </span>
        )
      },
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <span className="flex items-center justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => onEdit(row.original)}
          >
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            disabled={deleting}
            onClick={() => onDelete(row.original)}
          >
            Delete
          </Button>
        </span>
      ),
    },
  ]

  const table = useReactTable({
    data: transactions,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <TableHead key={header.id}>
                {header.isPlaceholder
                  ? null
                  : flexRender(header.column.columnDef.header, header.getContext())}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <TableCell key={cell.id}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

// The create/edit dialog. Mounted fresh per target (see the `key` at the
// call site), so defaultValues are simply the values being edited.
function TransactionFormDialog({
  open,
  entry,
  accounts,
  categories,
  currency,
  error,
  onSubmit,
  onClose,
}: {
  open: boolean
  entry: TransactionEntry | null
  accounts: AccountEntry[]
  categories: CategoryEntry[]
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

  // Same round-trip rule for Categories: archived labels are retired from
  // assignment (issue #10) but a row already carrying one keeps it
  // choosable. The explicit head option is how a Category is cleared.
  const categoryOptions = [
    { value: '', label: 'Uncategorized' },
    ...categories
      .filter((category) => category.archivedAt === null || category.id === entry?.categoryId)
      .map((category) => ({ value: category.id, label: category.name })),
  ]

  const form = useAppForm({
    defaultValues: {
      accountId: entry?.accountId ?? '',
      date: entry?.date ?? '',
      amount: entry === null ? '' : fromMinorUnits(entry.amount, currency),
      description: entry?.description ?? '',
      balanceAdjustment: entry?.kind === 'balance_adjustment',
      categoryId: entry?.categoryId ?? '',
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
        // The checkbox is the Balance Adjustment flavor (issue #9): it moves
        // the Balance but never counts as spending or income.
        kind: value.balanceAdjustment ? 'balance_adjustment' : 'standard',
        // '' is the form's Uncategorized; the API's is null (ADR 0003).
        categoryId: value.categoryId === '' ? null : value.categoryId,
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
                {(field) => <field.DatePickerField label="Date" />}
              </form.AppField>
            </div>
            <form.AppField name="balanceAdjustment">
              {(field) => (
                <field.CheckboxField
                  label="Balance adjustment"
                  description="Corrects drift between the balance and reality — never counted as spending or income."
                />
              )}
            </form.AppField>
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
            <form.AppField name="categoryId">
              {(field) => (
                <field.ComboboxField
                  label="Category"
                  searchPlaceholder="Search categories…"
                  emptyText="No category found."
                  options={categoryOptions}
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

// The Transfer create/edit dialog (issue #12): one entity moving money
// between two of the Household's own Accounts. Editing is handed either leg
// and reads the whole pair off it; every save lands on both legs atomically
// server-side. Mounted fresh per target like the Transaction dialog.
function TransferFormDialog({
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
  onSubmit: (fields: TransferFields) => Promise<void>
  onClose: () => void
}) {
  const sides = entry === null ? { fromAccountId: '', toAccountId: '' } : transferSidesOf(entry)

  // Open accounts only for new Transfers; when editing one that touches an
  // archived Account, that Account stays choosable so the form round-trips
  // without forcibly moving the money — the Transaction dialog's rule.
  const accountOptions = accounts
    .filter(
      (account) =>
        account.archivedAt === null ||
        account.id === sides.fromAccountId ||
        account.id === sides.toAccountId,
    )
    .map((account) => ({ value: account.id, label: account.name }))

  const form = useAppForm({
    defaultValues: {
      fromAccountId: sides.fromAccountId,
      toAccountId: sides.toAccountId,
      amount: entry === null ? '' : fromMinorUnits(Math.abs(entry.amount), currency),
      date: entry?.date ?? '',
      description: entry?.description ?? '',
    },
    onSubmitInvalid: focusFirstInvalid,
    onSubmit: async ({ value }) => {
      await onSubmit({
        fromAccountId: value.fromAccountId,
        toAccountId: value.toAccountId,
        // Unsigned decimal string → positive integer minor units (ADR 0006);
        // the direction is from → to, and the server signs the legs.
        amount: toMinorUnits(value.amount.trim(), currency),
        date: value.date,
        // Blank means the server's default label ("Transfer").
        description: value.description.trim(),
      })
    },
  })

  const validAmount = (value: string) => {
    try {
      return toMinorUnits(value.trim(), currency) > 0
    } catch {
      return false
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{entry === null ? 'New transfer' : 'Edit transfer'}</DialogTitle>
          <DialogDescription>
            Moves money between two of your accounts — never counted as spending or income ·{' '}
            {currency}
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
            <div className="grid gap-3 sm:grid-cols-2">
              <form.AppField
                name="fromAccountId"
                validators={{
                  onSubmit: ({ value }) => (value === '' ? 'Choose an account' : undefined),
                }}
              >
                {(field) => (
                  <field.ComboboxField
                    label="From account"
                    placeholder="Choose"
                    searchPlaceholder="Search accounts…"
                    emptyText="No account found."
                    options={accountOptions}
                  />
                )}
              </form.AppField>
              <form.AppField
                name="toAccountId"
                validators={{
                  onSubmit: ({ value, fieldApi }) =>
                    value === ''
                      ? 'Choose an account'
                      : value === fieldApi.form.state.values.fromAccountId
                        ? 'Pick a different account'
                        : undefined,
                }}
              >
                {(field) => (
                  <field.ComboboxField
                    label="To account"
                    placeholder="Choose"
                    searchPlaceholder="Search accounts…"
                    emptyText="No account found."
                    options={accountOptions}
                  />
                )}
              </form.AppField>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <form.AppField
                name="amount"
                validators={{
                  onSubmit: ({ value }) =>
                    validAmount(value)
                      ? undefined
                      : `Enter a positive amount like ${transferAmountExample(currency)}`,
                }}
              >
                {(field) => (
                  <field.TextField
                    label={`Amount (${currency})`}
                    placeholder={transferAmountExample(currency)}
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
                {(field) => <field.DatePickerField label="Date" />}
              </form.AppField>
            </div>
            <form.AppField name="description">
              {(field) => <field.TextField label="Description (optional)" placeholder="Transfer" />}
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
                  {entry === null ? 'Log transfer' : 'Save changes'}
                </form.SubmitButton>
              </form.AppForm>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  )
}
