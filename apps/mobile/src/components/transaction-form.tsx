import type { ApiClient } from '@pfinance/api-client'
import type { CurrencyCode } from '@pfinance/currency'
import type { DateFormat } from '@pfinance/db/date-formats'
import { Checkbox, Dialog, FieldError, Input, Label, TextField } from 'heroui-native'
import { Button } from '@/components/button'
import type { InferResponseType } from 'hono/client'
import { useState, type JSX } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { notify } from '@/components/toaster'
import { fade, rise } from '@/motion'
import { SafeAreaView } from 'react-native-safe-area-context'
import { errorMessage } from '@/api/errors'
import { useCategoryMutations } from '@/api/use-categories'
import { useTransactionMutations } from '@/api/use-transactions'
import { ChoiceChips, FieldBlock } from '@/components/form-fields'
import { Touchable } from '@/components/touchable'
import { Body, Eyebrow, Title } from '@/components/type'
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
// amount is integer minor units end to end (ADR 0006). A checkbox marks the
// Balance Adjustment flavor (issue #81): it moves the Balance but is never
// counted as spending or income.

type TransactionEntry = InferResponseType<
  ApiClient['api']['transactions']['$get'],
  200
>['transactions'][number]
type AccountEntry = InferResponseType<ApiClient['api']['accounts']['$get'], 200>['accounts'][number]
type CategoryEntry = InferResponseType<
  ApiClient['api']['categories']['$get'],
  200
>['categories'][number]

export function TransactionForm({
  entry,
  accounts,
  categories,
  currency,
  dateFormat,
  onDone,
  onClose,
}: {
  // null = create; an existing non-Transfer row = edit (a leg opens the
  // TransferForm instead — the pair can never drift).
  entry: TransactionEntry | null
  accounts: AccountEntry[]
  categories: CategoryEntry[]
  currency: CurrencyCode
  dateFormat: DateFormat
  // The write landed — save or delete alike. Refreshing is the mutation's
  // job (api/query-keys.ts); this only has to close.
  onDone: () => void
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
  // Only the draft's own complaint lives in state; a failed request's
  // message comes off the mutation that failed.
  const [invalid, setInvalid] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')

  const { save: saveTransaction, remove: removeTransaction } = useTransactionMutations()
  const { create: createCategoryMutation } = useCategoryMutations()
  const busy =
    saveTransaction.isPending || removeTransaction.isPending || createCategoryMutation.isPending
  const error =
    invalid ??
    errorMessage(saveTransaction.error) ??
    errorMessage(removeTransaction.error) ??
    errorMessage(createCategoryMutation.error)

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
  ]

  const save = () => {
    const parsed = validateDraft(draft, currency)
    if (!parsed.ok) {
      setInvalid(parsed.error)
      return
    }
    setInvalid(null)
    // The draft composes the kind (standard or balance_adjustment);
    // Transfers write through /api/transfers (transfer-form.tsx).
    saveTransaction.mutate(
      { id: entry?.id ?? null, fields: parsed.value },
      {
        onSuccess: () => {
          notify(entry === null ? 'Transaction added' : 'Transaction saved')
          onDone()
        },
      },
    )
  }

  const remove = () => {
    if (entry === null) return
    setInvalid(null)
    removeTransaction.mutate(entry.id, {
      onSuccess: () => {
        notify('Transaction deleted')
        onDone()
      },
    })
  }

  // Name-only Category creation, on the spot. The mutation's invalidation
  // is awaited before onSuccess runs, so the new Category is already among
  // the chips by the time it is selected — no local copy to bridge the gap.
  const createCategory = () => {
    const name = newCategoryName.trim()
    if (name === '' || busy) return
    setInvalid(null)
    createCategoryMutation.mutate(name, {
      onSuccess: ({ category: created }) => {
        set('categoryId', created.id)
        setNewCategoryName('')
      },
    })
  }

  const dateValid = isCalendarDate(draft.date)

  return (
    <View className="flex-1 bg-background">
      {/* Rendered in place of the Ledger, so the tab bar is still below it
          and already owns the bottom inset. Swapping a whole screen for
          another under the same chrome is a staged change, and a jump cut
          there reads as a glitch rather than a transition: the form rises
          in (docs/design/MOTION.md) and fades out, shorter. */}
      <Animated.View style={{ flex: 1 }} entering={rise} exiting={fade}>
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View className="flex-1 gap-4 px-5 pt-1">
              <View className="flex-row items-center justify-between gap-3">
                <View className="flex-1">
                  <Eyebrow>Ledger entry</Eyebrow>
                  <Title>{entry === null ? 'New transaction' : 'Edit transaction'}</Title>
                </View>
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
                  {/* One press target for the whole row; the Checkbox inside
                    is purely visual so the two never fight over the tap. */}
                  <Touchable
                    feedback="dim"
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: draft.balanceAdjustment }}
                    accessibilityLabel="Balance adjustment"
                    onPress={() => set('balanceAdjustment', !draft.balanceAdjustment)}
                  >
                    <View className="flex-row items-start gap-3" pointerEvents="none">
                      <Checkbox isSelected={draft.balanceAdjustment} />
                      <View className="flex-1 gap-1">
                        <Label>Balance adjustment</Label>
                        <Body size="sm" tone="muted">
                          Corrects drift between the balance and reality — never counted as spending
                          or income.
                        </Body>
                      </View>
                    </View>
                  </Touchable>
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
                      <Body size="sm" tone="muted">
                        {formatCalendarDate(draft.date, dateFormat)}
                      </Body>
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
                            onSubmitEditing={() => createCategory()}
                          />
                        </TextField>
                      </View>
                      <Button
                        variant="outline"
                        size="sm"
                        isDisabled={newCategoryName.trim() === '' || busy}
                        onPress={() => createCategory()}
                      >
                        Add
                      </Button>
                    </View>
                  </FieldBlock>
                  {error !== null && (
                    <Body size="sm" tone="danger">
                      {error}
                    </Body>
                  )}
                  <Button isDisabled={busy} onPress={() => save()}>
                    {/* The mutation stays pending until the Ledger it
                      changed has refetched, so the label says so rather
                      than leaving a dead button under a thumb. */}
                    {busy ? 'Saving…' : entry === null ? 'Log transaction' : 'Save changes'}
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
      </Animated.View>
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
                  remove()
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
