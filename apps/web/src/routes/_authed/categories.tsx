import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import type { InferRequestType, InferResponseType } from 'hono/client'
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
import { toast } from '@pfinance/ui/components/sonner'
import type { DateFormat } from '@pfinance/db/date-formats'
import { api } from '@/lib/api'
import { focusFirstInvalid, useAppForm } from '@/hooks/form'
import { useCategories, useCategoryMutations } from '@/hooks/use-categories'
import { useDateFormat } from '@/hooks/use-date-format'
import { useMe } from '@/hooks/use-me'
import { formatMonthYear } from '@/lib/dates'

export const Route = createFileRoute('/_authed/categories')({
  head: () => ({ meta: [{ title: 'Categories · pfinance' }] }),
  component: CategoriesScreen,
})

// Honors the Household date format (issue #31) like every other date.
const archivedLabel = (iso: string | null, format: DateFormat) =>
  iso === null ? 'Archived' : `Archived ${formatMonthYear(new Date(iso), format)}`

// Both shapes are inferred from the server's route schema so they can't
// drift: the editable state from the create validator, the listed Category
// from the list response.
type CategoryFields = InferRequestType<typeof api.api.categories.$post>['json']
type CategoryEntry = InferResponseType<typeof api.api.categories.$get, 200>['categories'][number]

function CategoriesScreen() {
  const { data: me } = useMe()
  const [showArchived, setShowArchived] = useState(false)
  // The dialog's target outlives `open` so the closing popup keeps its
  // content while Base UI animates out and restores focus; the nonce forces
  // a fresh form mount per open (see the `key` below).
  const [dialogOpen, setDialogOpen] = useState(false)
  const [target, setTarget] = useState<{ entry: CategoryEntry | null; nonce: number }>({
    entry: null,
    nonce: 0,
  })

  const categoriesQuery = useCategories(showArchived)
  const { save: saveCategory, setArchived } = useCategoryMutations()

  const openDialog = (entry: CategoryEntry | null) => {
    saveCategory.reset()
    setTarget((current) => ({ entry, nonce: current.nonce + 1 }))
    setDialogOpen(true)
  }

  const categories = categoriesQuery.data?.categories ?? []
  const active = categories.filter((entry) => entry.archivedAt === null)
  const archived = categories.filter((entry) => entry.archivedAt !== null)

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">Categories</h1>
          <p className="max-w-prose text-sm text-muted-foreground">
            The household&apos;s shared vocabulary for spending and income. Flat by design — no
            sub-categories, no budgets.
          </p>
        </div>
        <Button className="shrink-0" onClick={() => openDialog(null)}>
          New category
        </Button>
      </div>

      <CategoryFormDialog
        key={target.nonce}
        open={dialogOpen}
        entry={target.entry}
        householdName={me?.household.name}
        error={saveCategory.isError ? saveCategory.error.message : null}
        onSubmit={(fields) =>
          saveCategory
            .mutateAsync({ id: target.entry?.id ?? null, fields })
            // Close on success; the mutation records failures for the
            // dialog's error line, so swallow the rejection so the form
            // doesn't also throw.
            .then(
              () => {
                setDialogOpen(false)
                toast(target.entry ? 'Category saved' : 'Category added')
              },
              () => undefined,
            )
        }
        onClose={() => setDialogOpen(false)}
      />

      {categoriesQuery.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading…
        </p>
      ) : categoriesQuery.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Couldn&apos;t load categories.
        </p>
      ) : active.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No active categories — add one, or unarchive from the list below.
        </p>
      ) : (
        // One flat alphabetical list (ADR 0003): a Category is only a name,
        // so a row per label beats a card grid.
        <Card size="sm">
          <CardContent>
            <ul className="divide-y divide-border">
              {active.map((entry) => (
                <CategoryRow
                  key={entry.id}
                  entry={entry}
                  disabled={setArchived.isPending}
                  onRename={() => openDialog(entry)}
                  onSetArchived={(archive) => setArchived.mutate({ id: entry.id, archive })}
                />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      {setArchived.isError && (
        <p role="alert" className="text-sm text-destructive">
          Couldn&apos;t update that category.
        </p>
      )}

      {/* Archived vocabulary — retired from assignment, history preserved —
          hidden until asked for, mirroring the Accounts screen. */}
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
          <p className="text-sm text-muted-foreground">No archived categories.</p>
        ) : (
          <Card size="sm" className="opacity-65">
            <CardContent>
              <ul className="divide-y divide-border">
                {archived.map((entry) => (
                  <CategoryRow
                    key={entry.id}
                    entry={entry}
                    disabled={setArchived.isPending}
                    onRename={() => openDialog(entry)}
                    onSetArchived={(archive) => setArchived.mutate({ id: entry.id, archive })}
                  />
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
    </div>
  )
}

// One row of the vocabulary, active or archived: the same name + Rename +
// Archive/Unarchive shape, with the archive stamp only on retired labels.
function CategoryRow({
  entry,
  disabled,
  onRename,
  onSetArchived,
}: {
  entry: CategoryEntry
  disabled: boolean
  onRename: () => void
  onSetArchived: (archive: boolean) => void
}) {
  const isArchived = entry.archivedAt !== null
  const dateFormat = useDateFormat()
  return (
    <li className="flex items-center justify-between gap-3 py-1.5">
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{entry.name}</span>
        {isArchived && (
          <span className="block text-xs text-muted-foreground">
            {archivedLabel(entry.archivedAt, dateFormat)} · history preserved
          </span>
        )}
      </span>
      <span className="flex shrink-0 items-center">
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onRename}>
          Rename
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          disabled={disabled}
          onClick={() => onSetArchived(!isArchived)}
        >
          {isArchived ? 'Unarchive' : 'Archive'}
        </Button>
      </span>
    </li>
  )
}

// The add/rename dialog. Mounted fresh per target (see the `key` at the call
// site), so defaultValues are simply the values being edited.
function CategoryFormDialog({
  open,
  entry,
  householdName,
  error,
  onSubmit,
  onClose,
}: {
  open: boolean
  entry: CategoryEntry | null
  householdName: string | undefined
  error: string | null
  onSubmit: (fields: CategoryFields) => Promise<void>
  onClose: () => void
}) {
  const form = useAppForm({
    defaultValues: {
      name: entry?.name ?? '',
    },
    onSubmitInvalid: focusFirstInvalid,
    onSubmit: async ({ value }) => {
      await onSubmit({ name: value.name.trim() })
    },
  })

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{entry === null ? 'New category' : 'Rename category'}</DialogTitle>
          {householdName !== undefined && (
            <DialogDescription>Belongs to {householdName}</DialogDescription>
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
            <form.AppField
              name="name"
              validators={{
                onSubmit: ({ value }) => (value.trim() ? undefined : 'Name the category'),
              }}
            >
              {(field) => <field.TextField label="Name" placeholder="Groceries" />}
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
                  {entry === null ? 'Create category' : 'Save changes'}
                </form.SubmitButton>
              </form.AppForm>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  )
}
