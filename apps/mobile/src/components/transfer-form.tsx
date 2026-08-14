import { call, type ApiClient } from '@pfinance/api-client'
import type { CurrencyCode } from '@pfinance/currency'
import type { DateFormat } from '@pfinance/db/date-formats'
import { Button, Dialog, FieldError, Input, Label, TextField, Typography } from 'heroui-native'
import type { InferResponseType } from 'hono/client'
import { useState, type JSX } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { apiFor } from '@/api/client'
import { failureMessage } from '@/api/use-query'
import { ChoiceChips, FieldBlock } from '@/components/form-fields'
import {
  formatCalendarDate,
  isCalendarDate,
  previousCalendarDay,
  todayCalendarString,
} from '@/ledger/dates'
import { amountExample } from '@/ledger/draft'
import {
  emptyTransferDraft,
  transferDraftFromLeg,
  validateTransferDraft,
  type TransferDraft,
} from '@/ledger/transfer-draft'

// The Transfer form (issue #81): record, edit, and delete a Transfer between
// two of the Household's Accounts — paying off the card from the phone —
// with the quick-entry form's patterns (transaction-form.tsx). Editing is
// handed either leg and reads the whole pair off it (transfer-draft.ts);
// every write goes through /api/transfers, so both legs always move
// atomically server-side. Direction is structural — from → to, never a sign
// in the amount — and a Transfer is excluded from spending and income by
// definition (CONTEXT.md).

type TransactionEntry = InferResponseType<
  ApiClient['api']['transactions']['$get'],
  200
>['transactions'][number]
type AccountEntry = InferResponseType<ApiClient['api']['accounts']['$get'], 200>['accounts'][number]

// A Transfer leg always carries its Transfer's id — the type narrows it so
// an edit can never silently miss its target.
type TransferLeg = TransactionEntry & { transferId: string }

export function TransferForm({
  apiUrl,
  entry,
  accounts,
  currency,
  dateFormat,
  onDone,
  onClose,
}: {
  apiUrl: string
  // null = create; a Transfer leg = edit the whole Transfer it belongs to.
  entry: TransferLeg | null
  accounts: AccountEntry[]
  currency: CurrencyCode
  dateFormat: DateFormat
  // The write landed — save or delete alike: close and refresh the list.
  onDone: () => void
  onClose: () => void
}): JSX.Element {
  const today = todayCalendarString()
  // The stored pair's sides, as they are in the ledger — the draft below
  // starts from them but drifts as the user edits.
  const stored = entry === null ? null : transferDraftFromLeg(entry, currency)
  const [draft, setDraft] = useState<TransferDraft>(() => stored ?? emptyTransferDraft(today))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const set = <K extends keyof TransferDraft>(key: K, value: TransferDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))

  // Open Accounts only for new Transfers; editing one that touches an
  // archived Account keeps that Account choosable so the form round-trips
  // without forcibly moving the money (the quick-entry form's rule). Both
  // sides share one list: the server rejects a same-account pair, and the
  // validation catches it before the network does.
  const accountChoices = accounts
    .filter(
      (account) =>
        account.archivedAt === null ||
        account.id === stored?.fromAccountId ||
        account.id === stored?.toAccountId,
    )
    .map((account) => ({ value: account.id, label: account.name }))

  const save = async () => {
    const parsed = validateTransferDraft(draft, currency)
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    setBusy(true)
    setError(null)
    try {
      if (entry === null) {
        await call(
          apiFor(apiUrl).api.transfers.$post({ json: parsed.value }),
          'Could not save the transfer.',
        )
      } else {
        await call(
          apiFor(apiUrl).api.transfers[':id'].$patch({
            param: { id: entry.transferId },
            json: parsed.value,
          }),
          'Could not save the transfer.',
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
        apiFor(apiUrl).api.transfers[':id'].$delete({ param: { id: entry.transferId } }),
        'Could not delete the transfer.',
      )
      onDone()
    } catch (failure) {
      setBusy(false)
      setError(failureMessage(failure))
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
                {entry === null ? 'New transfer' : 'Edit transfer'}
              </Typography.Heading>
              <Button variant="ghost" size="sm" isDisabled={busy} onPress={onClose}>
                Cancel
              </Button>
            </View>
            <Typography.Paragraph type="body-sm" color="muted">
              Moves money between two of your accounts — never counted as spending or income.
            </Typography.Paragraph>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View className="gap-5 pb-8">
                <FieldBlock label="From account">
                  <ChoiceChips
                    choices={accountChoices}
                    value={draft.fromAccountId}
                    onChange={(value) => set('fromAccountId', value)}
                  />
                </FieldBlock>
                <FieldBlock label="To account">
                  <ChoiceChips
                    choices={accountChoices}
                    value={draft.toAccountId}
                    onChange={(value) => set('toAccountId', value)}
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
                <TextField>
                  <Label>Description</Label>
                  <Input
                    value={draft.description}
                    onChangeText={(text) => set('description', text)}
                    // Blank means the server's own default label.
                    placeholder="Transfer"
                    returnKeyType="done"
                  />
                </TextField>
                {error !== null && (
                  <Typography.Paragraph type="body-sm" className="text-danger">
                    {error}
                  </Typography.Paragraph>
                )}
                <Button isDisabled={busy} onPress={() => void save()}>
                  {entry === null ? 'Log transfer' : 'Save changes'}
                </Button>
                {entry !== null && (
                  <Button
                    variant="danger-soft"
                    isDisabled={busy}
                    onPress={() => setConfirmingDelete(true)}
                  >
                    Delete transfer
                  </Button>
                )}
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
      {/* Deleting is confirmed in a dialog whose action button repeats the
          consequence — never a bare OK/Cancel (the web's rule). Both legs go
          together: the entity cascade removes the pair atomically. */}
      <Dialog isOpen={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <Dialog.Portal>
          <Dialog.Overlay />
          <Dialog.Content>
            <Dialog.Title>Delete transfer?</Dialog.Title>
            <Dialog.Description>
              Both sides of this transfer will be removed from the ledger.
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
                Delete transfer
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
