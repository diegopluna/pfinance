import { call, type ApiClient } from '@pfinance/api-client'
import type { CurrencyCode } from '@pfinance/currency'
import type { DateFormat } from '@pfinance/db/date-formats'
import {
  Button,
  Chip,
  Dialog,
  FieldError,
  Input,
  Label,
  TextField,
  Typography,
} from 'heroui-native'
import type { InferResponseType } from 'hono/client'
import { useState, type JSX, type ReactNode } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { apiFor } from '@/api/client'
import { failureMessage } from '@/api/use-query'
import {
  formatCalendarDate,
  isCalendarDate,
  previousCalendarDay,
  todayCalendarString,
} from '@/ledger/dates'
import {
  amountExample,
  draftFromTransaction,
  emptyDraft,
  validateDraft,
  type TransactionDraft,
} from '@/ledger/draft'

// The quick-entry form (issue #80): create, edit, and delete a Transaction
// in a few taps, with a missing Category creatable by name on the spot
// (name-only — Category management stays on the web). Rendered by the
// transactions screen in place of the list, so an edited entry never has to
// survive a route change. The sign never appears in the amount field: the
// Money out / Money in choice carries it (ledger/draft.ts), and the stored
// amount is integer minor units end to end (ADR 0006).

type TransactionEntry = InferResponseType<
  ApiClient['api']['transactions']['$get'],
  200
>['transactions'][number]
type AccountEntry = InferResponseType<ApiClient['api']['accounts']['$get'], 200>['accounts'][number]
type CategoryEntry = InferResponseType<
  ApiClient['api']['categories']['$get'],
  200
>['categories'][number]

// One wrapped row of mutually exclusive choices. Unlike the list screen's
// filter chips there is no "tap again to clear": a form field holds a value,
// and clearing is its own explicit choice where one exists (Uncategorized).
function ChoiceChips({
  choices,
  value,
  onChange,
}: {
  choices: { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
}): JSX.Element {
  return (
    <View className="flex-row flex-wrap gap-2">
      {choices.map((choice) => (
        <Chip
          key={choice.value}
          size="sm"
          variant={value === choice.value ? 'primary' : 'soft'}
          color="default"
          onPress={() => onChange(choice.value)}
        >
          <Chip.Label>{choice.label}</Chip.Label>
        </Chip>
      ))}
    </View>
  )
}

function FieldBlock({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <View className="gap-2">
      <Label>{label}</Label>
      {children}
    </View>
  )
}

export function TransactionForm({
  apiUrl,
  entry,
  accounts,
  categories,
  currency,
  dateFormat,
  onDone,
  onCategoryCreated,
  onClose,
}: {
  apiUrl: string
  // null = create; an existing non-Transfer row = edit. A PATCH never sends
  // kind, so an edited Balance Adjustment keeps its kind (issue #81 owns
  // that surface).
  entry: TransactionEntry | null
  accounts: AccountEntry[]
  categories: CategoryEntry[]
  currency: CurrencyCode
  dateFormat: DateFormat
  // The write landed — save or delete alike: close and refresh the list.
  onDone: () => void
  onCategoryCreated: () => void
  onClose: () => void
}): JSX.Element {
  const today = todayCalendarString()
  const [draft, setDraft] = useState<TransactionDraft>(() => {
    if (entry !== null) return draftFromTransaction(entry, currency)
    const fresh = emptyDraft(today)
    // One active Account needs no choice — quick entry starts ready.
    const active = accounts.filter((account) => account.archivedAt === null)
    return active.length === 1 && active[0] !== undefined
      ? { ...fresh, accountId: active[0].id }
      : fresh
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  // Inline name-only Category creation: the freshly created rows render
  // immediately from local state while the parent's list refetches.
  const [newCategoryName, setNewCategoryName] = useState('')
  const [createdCategories, setCreatedCategories] = useState<CategoryEntry[]>([])

  const set = <K extends keyof TransactionDraft>(key: K, value: TransactionDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))

  // Open Accounts only for new entries; editing a row on an archived Account
  // keeps that Account choosable so the form round-trips without forcibly
  // moving the money (the web form's rule). Same for Categories.
  const accountChoices = accounts
    .filter((account) => account.archivedAt === null || account.id === entry?.accountId)
    .map((account) => ({ value: account.id, label: account.name }))
  const categoryChoices = [
    { value: '', label: 'Uncategorized' },
    ...categories
      .filter((category) => category.archivedAt === null || category.id === entry?.categoryId)
      .map((category) => ({ value: category.id, label: category.name })),
    // Only until the parent's refetch catches up — then the created row
    // arrives in `categories` and the local copy would be a duplicate.
    ...createdCategories
      .filter((created) => !categories.some((category) => category.id === created.id))
      .map((category) => ({ value: category.id, label: category.name })),
  ]

  const save = async () => {
    const parsed = validateDraft(draft, currency)
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    setBusy(true)
    setError(null)
    try {
      if (entry === null) {
        // Quick entry only ever logs the ordinary ledger entry; Transfers
        // and Balance Adjustments write through issue #81's surfaces.
        await call(
          apiFor(apiUrl).api.transactions.$post({ json: { ...parsed.value, kind: 'standard' } }),
          'Could not save the transaction.',
        )
      } else {
        await call(
          apiFor(apiUrl).api.transactions[':id'].$patch({
            param: { id: entry.id },
            json: parsed.value,
          }),
          'Could not save the transaction.',
        )
      }
      onDone()
    } catch (failure) {
      setBusy(false)
      setError(failureMessage(failure))
    }
  }

  const remove = async () => {
    if (entry === null) return
    setBusy(true)
    setError(null)
    try {
      await call(
        apiFor(apiUrl).api.transactions[':id'].$delete({ param: { id: entry.id } }),
        'Could not delete the transaction.',
      )
      onDone()
    } catch (failure) {
      setBusy(false)
      setError(failureMessage(failure))
    }
  }

  const createCategory = async () => {
    const name = newCategoryName.trim()
    if (name === '' || busy) return
    setBusy(true)
    setError(null)
    try {
      const { category: created } = await call(
        apiFor(apiUrl).api.categories.$post({ json: { name } }),
        'Could not create the category.',
      )
      setCreatedCategories((current) => [...current, created])
      set('categoryId', created.id)
      setNewCategoryName('')
      onCategoryCreated()
    } catch (failure) {
      setError(failureMessage(failure))
    } finally {
      setBusy(false)
    }
  }

  const dateValid = isCalendarDate(draft.date)

  return (
    <View className="flex-1 bg-background">
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View className="flex-1 gap-4 px-6 pt-2">
            <View className="flex-row items-center justify-between">
              <Typography.Heading type="h2">
                {entry === null ? 'New transaction' : 'Edit transaction'}
              </Typography.Heading>
              <Button variant="ghost" size="sm" isDisabled={busy} onPress={onClose}>
                Cancel
              </Button>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View className="gap-5 pb-8">
                <TextField>
                  <Label>Description</Label>
                  <Input
                    value={draft.description}
                    onChangeText={(text) => set('description', text)}
                    placeholder="Groceries"
                    returnKeyType="next"
                  />
                </TextField>
                <FieldBlock label="Direction">
                  <ChoiceChips
                    choices={[
                      { value: 'out', label: 'Money out' },
                      { value: 'in', label: 'Money in' },
                    ]}
                    value={draft.direction}
                    onChange={(value) => set('direction', value === 'in' ? 'in' : 'out')}
                  />
                </FieldBlock>
                <TextField>
                  <Label>{`Amount (${currency})`}</Label>
                  <Input
                    value={draft.amount}
                    onChangeText={(text) => set('amount', text)}
                    placeholder={amountExample(currency)}
                    keyboardType="decimal-pad"
                  />
                </TextField>
                <FieldBlock label="Date">
                  <ChoiceChips
                    choices={[
                      { value: today, label: 'Today' },
                      { value: previousCalendarDay(today), label: 'Yesterday' },
                    ]}
                    value={draft.date}
                    onChange={(value) => set('date', value)}
                  />
                  <TextField isInvalid={draft.date !== '' && !dateValid}>
                    <Input
                      value={draft.date}
                      onChangeText={(text) => set('date', text)}
                      placeholder="YYYY-MM-DD"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <FieldError>Enter a calendar date like 2026-01-15.</FieldError>
                  </TextField>
                  {dateValid && (
                    <Typography.Paragraph type="body-sm" color="muted">
                      {formatCalendarDate(draft.date, dateFormat)}
                    </Typography.Paragraph>
                  )}
                </FieldBlock>
                <FieldBlock label="Account">
                  <ChoiceChips
                    choices={accountChoices}
                    value={draft.accountId}
                    onChange={(value) => set('accountId', value)}
                  />
                </FieldBlock>
                <FieldBlock label="Category">
                  <ChoiceChips
                    choices={categoryChoices}
                    value={draft.categoryId}
                    onChange={(value) => set('categoryId', value)}
                  />
                  <View className="flex-row items-end gap-2">
                    <View className="flex-1">
                      <TextField>
                        <Input
                          value={newCategoryName}
                          onChangeText={setNewCategoryName}
                          placeholder="New category name"
                          returnKeyType="done"
                          onSubmitEditing={() => void createCategory()}
                        />
                      </TextField>
                    </View>
                    <Button
                      variant="outline"
                      size="sm"
                      isDisabled={newCategoryName.trim() === '' || busy}
                      onPress={() => void createCategory()}
                    >
                      Add
                    </Button>
                  </View>
                </FieldBlock>
                {error !== null && (
                  <Typography.Paragraph type="body-sm" className="text-danger">
                    {error}
                  </Typography.Paragraph>
                )}
                <Button isDisabled={busy} onPress={() => void save()}>
                  {entry === null ? 'Log transaction' : 'Save changes'}
                </Button>
                {entry !== null && (
                  <Button
                    variant="danger-soft"
                    isDisabled={busy}
                    onPress={() => setConfirmingDelete(true)}
                  >
                    Delete transaction
                  </Button>
                )}
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
      {/* Deleting is confirmed in a dialog whose action button repeats the
          consequence — never a bare OK/Cancel (the web's rule). */}
      <Dialog isOpen={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <Dialog.Portal>
          <Dialog.Overlay />
          <Dialog.Content>
            <Dialog.Title>Delete transaction?</Dialog.Title>
            <Dialog.Description>
              {entry !== null && `"${entry.description}" will be removed from the ledger.`}
            </Dialog.Description>
            <View className="mt-4 gap-3">
              <Button
                variant="danger"
                isDisabled={busy}
                onPress={() => {
                  setConfirmingDelete(false)
                  void remove()
                }}
              >
                Delete transaction
              </Button>
              <Button variant="ghost" onPress={() => setConfirmingDelete(false)}>
                Cancel
              </Button>
            </View>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>
    </View>
  )
}
