import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { InferRequestType, InferResponseType } from 'hono/client'
import { formatAmount, isSupportedCurrency, type CurrencyCode } from '@pfinance/currency'
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
import { Checkbox } from '@pfinance/ui/components/checkbox'
import { Field, FieldLabel } from '@pfinance/ui/components/field'
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
import { useDateFormat } from '@/hooks/use-date-format'
import { formatCalendarDate, formatDayDate } from '@/lib/dates'
import { api } from '@/lib/api'
import { useMe } from '@/hooks/use-me'

export const Route = createFileRoute('/_authed/imports')({
  head: () => ({ meta: [{ title: 'Imports · pfinance' }] }),
  component: ImportsScreen,
})

// Shapes inferred from the server's route schema so they can't drift.
type ImportEntry = InferResponseType<typeof api.api.imports.$get, 200>['imports'][number]
type AccountEntry = InferResponseType<typeof api.api.accounts.$get, 200>['accounts'][number]
type MappingFields = InferRequestType<(typeof api.api.imports)[':id']['preview']['$post']>['json']
type PreviewResponse = InferResponseType<(typeof api.api.imports)[':id']['preview']['$post'], 200>

// The Import being mapped right now: the upload response (or a resumed
// pending row) carries the file's columns for the map step.
interface ActiveImport {
  id: string
  fileName: string
  accountId: string
  columns: string[]
  rowCount: number
}

const DATE_FORMAT_OPTIONS = [
  { value: 'ymd', label: 'Year first — 2026-01-31' },
  { value: 'dmy', label: 'Day first — 31/01/2026' },
  { value: 'mdy', label: 'Month first — 01/31/2026' },
] satisfies { value: MappingFields['dateFormat']; label: string }[]

// Credit-card statements commonly invert the ledger's convention — positive
// = charge (issue #42). The flip is applied server-side at parse time, so
// the preview below already shows the signs that will land in the ledger.
const AMOUNT_SIGN_OPTIONS = [
  { value: 'as-is', label: 'As the file says — negative is money out' },
  { value: 'flip', label: 'Flipped — credit-card statements' },
] satisfies { value: NonNullable<MappingFields['amountSign']>; label: string }[]

// Guess the mapping from the header names so most files start correct; the
// Member confirms or fixes it on the map step either way.
const guessColumn = (columns: string[], pattern: RegExp, fallback: number) => {
  const at = columns.findIndex((name) => pattern.test(name))
  return at === -1 ? Math.min(fallback, columns.length - 1) : at
}

const guessMapping = (columns: string[]): MappingFields => ({
  dateColumn: guessColumn(columns, /date|data|dia|fecha/i, 0),
  descriptionColumn: guessColumn(columns, /desc|hist|memo|payee|narra|detail|concepto/i, 1),
  amountColumn: guessColumn(columns, /amount|valor|value|montant|betrag|importe/i, 2),
  dateFormat: 'ymd',
})

function ImportsScreen() {
  const queryClient = useQueryClient()
  const { data: me } = useMe()
  const currency: CurrencyCode =
    me !== undefined && isSupportedCurrency(me.household.currency) ? me.household.currency : 'USD'

  const [active, setActive] = useState<ActiveImport | null>(null)
  const [mapping, setMapping] = useState<MappingFields | null>(null)
  // Lines of duplicate-flagged rows the Member chose to import anyway.
  const [overrides, setOverrides] = useState<ReadonlySet<number>>(new Set())
  // The history row awaiting delete confirmation, if any.
  const [pendingDelete, setPendingDelete] = useState<ImportEntry | null>(null)

  // All Accounts, archived included, so history rows on a closed Account
  // still name it; the upload picker below offers only open ones.
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

  const importsQuery = useQuery({
    queryKey: ['imports'],
    queryFn: async () => {
      const response = await api.api.imports.$get()
      if (!response.ok) {
        throw new Error('Failed to load imports')
      }
      return response.json()
    },
  })
  const imports = importsQuery.data?.imports ?? []

  const startMapping = (entry: ActiveImport) => {
    setActive(entry)
    setMapping(guessMapping(entry.columns))
    setOverrides(new Set())
  }

  const toggleOverride = (line: number) => {
    setOverrides((current) => {
      const next = new Set(current)
      if (next.has(line)) {
        next.delete(line)
      } else {
        next.add(line)
      }
      return next
    })
  }

  const upload = useMutation({
    mutationFn: async (fields: { accountId: string; fileName: string; csv: string }) => {
      const response = await api.api.imports.$post({ json: fields })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? 'Failed to upload the file')
      }
      return response.json()
    },
    onSuccess: async ({ import: batch, columns }) => {
      await queryClient.invalidateQueries({ queryKey: ['imports'] })
      startMapping({
        id: batch.id,
        fileName: batch.fileName,
        accountId: batch.accountId,
        columns,
        rowCount: batch.rowCount,
      })
    },
  })

  // Resume a pending Import from the history: the single GET returns the
  // file's columns again, and the stored mapping (if any) beats the guess.
  const resume = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.api.imports[':id'].$get({ param: { id } })
      if (!response.ok) {
        throw new Error('Failed to load the import')
      }
      return response.json()
    },
    onSuccess: ({ import: batch, columns }) => {
      setActive({
        id: batch.id,
        fileName: batch.fileName,
        accountId: batch.accountId,
        columns,
        rowCount: batch.rowCount,
      })
      setMapping(batch.mapping ?? guessMapping(columns))
      setOverrides(new Set())
    },
  })

  // The preview runs on every mapping change — it also persists the mapping
  // on the Import server-side, so confirm creates exactly what's on screen.
  const previewQuery = useQuery({
    queryKey: ['import-preview', active?.id, mapping],
    enabled: active !== null && mapping !== null,
    queryFn: async (): Promise<PreviewResponse> => {
      if (active === null || mapping === null) {
        throw new Error('No import selected')
      }
      const response = await api.api.imports[':id'].preview.$post({
        param: { id: active.id },
        json: mapping,
      })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? 'Failed to preview the import')
      }
      return response.json()
    },
  })

  // Confirming creates Transactions and reverting deletes them, so both
  // refresh every ledger view.
  const invalidateLedger = async () => {
    await queryClient.invalidateQueries({ queryKey: ['imports'] })
    await queryClient.invalidateQueries({ queryKey: ['transactions'] })
    await queryClient.invalidateQueries({ queryKey: ['accounts'] })
  }

  const confirm = useMutation({
    mutationFn: async (fields: { id: string; overrides: number[] }) => {
      const response = await api.api.imports[':id'].confirm.$post({
        param: { id: fields.id },
        json: { overrides: fields.overrides },
      })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? 'Failed to confirm the import')
      }
      return response.json()
    },
    onSuccess: async () => {
      await invalidateLedger()
      setActive(null)
      setMapping(null)
      setOverrides(new Set())
    },
  })

  // The revert (issue #15): deleting an Import deletes every Transaction it
  // created server-side.
  const deleteImport = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.api.imports[':id'].$delete({ param: { id } })
      if (!response.ok) {
        throw new Error('Failed to delete the import')
      }
    },
    onSuccess: invalidateLedger,
  })

  const closeWizard = () => {
    confirm.reset()
    setActive(null)
    setMapping(null)
    setOverrides(new Set())
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Imports</h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          Bring in transactions from a bank CSV: upload into an account, map the columns, review the
          preview, confirm. Imported rows start Uncategorized.
        </p>
      </div>

      {active === null ? (
        <UploadCard
          accounts={accounts}
          uploading={upload.isPending}
          error={upload.isError ? upload.error.message : null}
          onUpload={(fields) => upload.mutate(fields)}
        />
      ) : (
        <MappingCard
          active={active}
          mapping={mapping}
          currency={currency}
          accountNames={accountNames}
          preview={previewQuery.data ?? null}
          previewPending={previewQuery.isPending || previewQuery.isFetching}
          previewError={previewQuery.isError ? previewQuery.error.message : null}
          confirming={confirm.isPending}
          confirmError={confirm.isError ? confirm.error.message : null}
          overrides={overrides}
          onToggleOverride={toggleOverride}
          onMappingChange={setMapping}
          onConfirm={() => confirm.mutate({ id: active.id, overrides: [...overrides] })}
          onClose={closeWizard}
        />
      )}

      <h2 className="mt-2 text-sm font-semibold">Import history</h2>
      {importsQuery.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading…
        </p>
      ) : importsQuery.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Couldn&apos;t load imports.
        </p>
      ) : imports.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No imports yet — upload a CSV to bring in your first batch.
        </p>
      ) : (
        <Card size="sm">
          <CardContent>
            <ImportHistoryTable
              imports={imports}
              accountNames={accountNames}
              resuming={resume.isPending}
              deleting={deleteImport.isPending}
              onResume={(id) => resume.mutate(id)}
              onDelete={setPendingDelete}
            />
          </CardContent>
        </Card>
      )}
      {resume.isError && (
        <p role="alert" className="text-sm text-destructive">
          Couldn&apos;t reopen that import.
        </p>
      )}
      {deleteImport.isError && (
        <p role="alert" className="text-sm text-destructive">
          Couldn&apos;t delete that import.
        </p>
      )}

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete import?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete !== null &&
                `"${pendingDelete.fileName}" will be removed from the history.${
                  pendingDelete.status === 'confirmed' && (pendingDelete.createdCount ?? 0) > 0
                    ? ` Its ${pendingDelete.createdCount} imported ${
                        pendingDelete.createdCount === 1 ? 'transaction goes' : 'transactions go'
                      } too.`
                    : ''
                }`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (pendingDelete !== null) {
                  deleteImport.mutate(pendingDelete.id)
                }
                setPendingDelete(null)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// Step 1 — upload: a chosen Account plus the file. The file is read in the
// browser and sent as text; the server stores it verbatim.
function UploadCard({
  accounts,
  uploading,
  error,
  onUpload,
}: {
  accounts: AccountEntry[]
  uploading: boolean
  error: string | null
  onUpload: (fields: { accountId: string; fileName: string; csv: string }) => void
}) {
  const [accountId, setAccountId] = useState('')
  const [file, setFile] = useState<File | null>(null)

  // New batches land on open Accounts only — archived ones are closed in
  // real life.
  const accountOptions = accounts
    .filter((account) => account.archivedAt === null)
    .map((account) => ({ value: account.id, label: account.name }))

  const handleStart = async () => {
    if (accountId === '' || file === null) return
    onUpload({ accountId, fileName: file.name, csv: await file.text() })
  }

  return (
    <Card size="sm">
      <CardContent className="flex flex-wrap items-end gap-3">
        <Field className="w-56 gap-1">
          <FieldLabel htmlFor="import-account" className="text-xs text-muted-foreground">
            Into account
          </FieldLabel>
          <Select
            items={accountOptions}
            value={accountId}
            onValueChange={(value: string | null) => setAccountId(value ?? '')}
          >
            <SelectTrigger id="import-account" className="w-full">
              <SelectValue placeholder="Choose an account" />
            </SelectTrigger>
            <SelectContent>
              {accountOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field className="min-w-64 flex-1 gap-1">
          <FieldLabel htmlFor="import-file" className="text-xs text-muted-foreground">
            CSV file
          </FieldLabel>
          <Input
            id="import-file"
            type="file"
            accept=".csv,text/csv,text/plain"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </Field>
        <Button
          disabled={accountId === '' || file === null || uploading}
          onClick={() => void handleStart()}
        >
          {uploading ? 'Uploading…' : 'Start import'}
        </Button>
        {error !== null && (
          <p role="alert" className="w-full text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// Steps 2–3 — map and preview: three column selects plus the date shape,
// with the parsed result of every row underneath. Malformed rows are shown
// with their line and reason — they are skipped on confirm, never silently
// dropped. Rows matching an existing Transaction are flagged as duplicates
// and skipped by default; a per-row checkbox imports one anyway (issue #14).
function MappingCard({
  active,
  mapping,
  currency,
  accountNames,
  preview,
  previewPending,
  previewError,
  confirming,
  confirmError,
  overrides,
  onToggleOverride,
  onMappingChange,
  onConfirm,
  onClose,
}: {
  active: ActiveImport
  mapping: MappingFields | null
  currency: CurrencyCode
  accountNames: Map<string, string>
  preview: PreviewResponse | null
  previewPending: boolean
  previewError: string | null
  confirming: boolean
  confirmError: string | null
  overrides: ReadonlySet<number>
  onToggleOverride: (line: number) => void
  onMappingChange: (mapping: MappingFields) => void
  onConfirm: () => void
  onClose: () => void
}) {
  // Distinct from the mapping's dateFormat (how the CSV's dates are parsed):
  // this is the Household's display preference (issue #31).
  const householdDateFormat = useDateFormat()
  const columnOptions = active.columns.map((name, index) => ({
    value: String(index),
    label: name.trim() === '' ? `Column ${index + 1}` : name,
  }))
  const rows = preview?.rows ?? []
  const readyCount = rows.filter((row) => row.parsed !== null).length
  const malformedCount = rows.length - readyCount
  const skippedDuplicates = rows.filter(
    (row) => row.parsed !== null && row.duplicate && !overrides.has(row.line),
  ).length
  const importCount = readyCount - skippedDuplicates

  const columnSelect = (
    id: string,
    label: string,
    key: 'dateColumn' | 'descriptionColumn' | 'amountColumn',
  ) => (
    <Field className="w-44 gap-1">
      <FieldLabel htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </FieldLabel>
      <Select
        items={columnOptions}
        value={String(mapping?.[key] ?? 0)}
        onValueChange={(value: string | null) =>
          mapping !== null && onMappingChange({ ...mapping, [key]: Number(value ?? 0) })
        }
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {columnOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )

  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-medium">
              {active.fileName}
              <span className="text-muted-foreground">
                {' '}
                → {accountNames.get(active.accountId) ?? 'Unknown account'}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              {active.rowCount} rows · map the columns, then confirm
            </p>
          </div>
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          {columnSelect('map-date', 'Date column', 'dateColumn')}
          {columnSelect('map-description', 'Description column', 'descriptionColumn')}
          {columnSelect('map-amount', 'Amount column', 'amountColumn')}
          <Field className="w-56 gap-1">
            <FieldLabel htmlFor="map-date-format" className="text-xs text-muted-foreground">
              Date format
            </FieldLabel>
            <Select
              items={DATE_FORMAT_OPTIONS}
              value={mapping?.dateFormat ?? 'ymd'}
              onValueChange={(value: string | null) =>
                mapping !== null &&
                onMappingChange({
                  ...mapping,
                  dateFormat: (value ?? 'ymd') as MappingFields['dateFormat'],
                })
              }
            >
              <SelectTrigger id="map-date-format" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATE_FORMAT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field className="w-72 gap-1">
            <FieldLabel htmlFor="map-amount-sign" className="text-xs text-muted-foreground">
              Amount signs
            </FieldLabel>
            <Select
              items={AMOUNT_SIGN_OPTIONS}
              value={mapping?.amountSign ?? 'as-is'}
              onValueChange={(value: string | null) =>
                mapping !== null &&
                onMappingChange({
                  ...mapping,
                  amountSign: (value ?? 'as-is') as NonNullable<MappingFields['amountSign']>,
                })
              }
            >
              <SelectTrigger id="map-amount-sign" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AMOUNT_SIGN_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        {previewError !== null ? (
          <p role="alert" className="text-sm text-destructive">
            {previewError}
          </p>
        ) : previewPending && preview === null ? (
          <p role="status" className="text-sm text-muted-foreground">
            Parsing…
          </p>
        ) : (
          <>
            <p className="text-sm">
              {importCount} of {rows.length} rows will import
              {malformedCount > 0 && (
                <span className="text-destructive">
                  {' '}
                  · {malformedCount} malformed {malformedCount === 1 ? 'row' : 'rows'} will be
                  skipped
                </span>
              )}
              {skippedDuplicates > 0 && (
                <span className="text-muted-foreground">
                  {' '}
                  · {skippedDuplicates} {skippedDuplicates === 1 ? 'duplicate' : 'duplicates'} will
                  be skipped
                </span>
              )}
            </p>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Line</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>
                      <span className="sr-only">Duplicate</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const skipped = row.duplicate && !overrides.has(row.line)
                    // Skipped duplicates stay readable but visibly dimmed.
                    const dimmed = skipped ? ' opacity-50' : ''
                    return (
                      <TableRow key={row.line}>
                        <TableCell className="text-xs text-muted-foreground tabular-nums">
                          {row.line}
                        </TableCell>
                        {row.parsed === null ? (
                          <TableCell colSpan={4}>
                            <span className="text-sm text-destructive">
                              {row.error} — skipped on confirm
                            </span>
                          </TableCell>
                        ) : (
                          <>
                            <TableCell
                              className={`text-xs text-muted-foreground tabular-nums${dimmed}`}
                            >
                              {formatCalendarDate(row.parsed.date, householdDateFormat)}
                            </TableCell>
                            <TableCell className={dimmed.trim()}>
                              <span className="block max-w-96 truncate text-sm">
                                {row.parsed.description}
                              </span>
                            </TableCell>
                            <TableCell
                              className={`text-right text-sm font-medium tabular-nums${dimmed}`}
                            >
                              {formatAmount(row.parsed.amount, currency)}
                            </TableCell>
                            <TableCell>
                              {row.duplicate && (
                                <span className="flex items-center justify-end gap-2">
                                  <Badge>Duplicate</Badge>
                                  <label className="flex items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground">
                                    <Checkbox
                                      checked={overrides.has(row.line)}
                                      onCheckedChange={() => onToggleOverride(row.line)}
                                    />
                                    Import anyway
                                  </label>
                                </span>
                              )}
                            </TableCell>
                          </>
                        )}
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        {confirmError !== null && (
          <p role="alert" className="text-sm text-destructive">
            {confirmError}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={previewPending || previewError !== null || readyCount === 0 || confirming}
            onClick={onConfirm}
          >
            {confirming
              ? 'Importing…'
              : importCount === 0
                ? 'Finish without importing'
                : `Import ${importCount} ${importCount === 1 ? 'transaction' : 'transactions'}`}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function ImportHistoryTable({
  imports,
  accountNames,
  resuming,
  deleting,
  onResume,
  onDelete,
}: {
  imports: ImportEntry[]
  accountNames: Map<string, string>
  resuming: boolean
  deleting: boolean
  onResume: (id: string) => void
  onDelete: (entry: ImportEntry) => void
}) {
  const householdDateFormat = useDateFormat()
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>File</TableHead>
          <TableHead>Account</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Rows</TableHead>
          <TableHead>
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {imports.map((entry) => (
          <TableRow key={entry.id}>
            <TableCell className="text-xs text-muted-foreground tabular-nums">
              {formatDayDate(new Date(entry.createdAt), householdDateFormat)}
            </TableCell>
            <TableCell>
              <span className="block max-w-56 truncate text-sm font-medium">{entry.fileName}</span>
            </TableCell>
            <TableCell>
              <Badge>{accountNames.get(entry.accountId) ?? 'Unknown account'}</Badge>
            </TableCell>
            <TableCell>
              {entry.status === 'confirmed' ? (
                <Badge>Confirmed</Badge>
              ) : (
                <span className="text-xs text-muted-foreground">Pending</span>
              )}
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {entry.status === 'confirmed'
                ? `${entry.createdCount} imported${
                    (entry.malformedCount ?? 0) > 0 ? ` · ${entry.malformedCount} malformed` : ''
                  }${
                    (entry.duplicateCount ?? 0) > 0
                      ? ` · ${entry.duplicateCount} ${entry.duplicateCount === 1 ? 'duplicate' : 'duplicates'} skipped`
                      : ''
                  }`
                : `${entry.rowCount} rows`}
            </TableCell>
            <TableCell>
              <span className="flex justify-end">
                {entry.status === 'pending' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    disabled={resuming}
                    onClick={() => onResume(entry.id)}
                  >
                    Resume
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  disabled={deleting}
                  onClick={() => onDelete(entry)}
                >
                  Delete
                </Button>
              </span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
