import type { ApiClient } from '@pfinance/api-client'
import type { CurrencyCode } from '@pfinance/currency'
import type { DateFormat } from '@pfinance/db/date-formats'
import { Dialog, FieldError, Input, Label, TextField } from 'heroui-native'
import { Button } from '@/components/button'
import type { InferResponseType } from 'hono/client'
import { useState, type JSX } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { notify } from '@/components/toaster'
import { fade, rise } from '@/motion'
import { SafeAreaView } from 'react-native-safe-area-context'
import { errorMessage } from '@/api/errors'
import { useTransferMutations } from '@/api/use-transfers'
import { ChoiceChips, FieldBlock } from '@/components/form-fields'
import { Body, Eyebrow, Title } from '@/components/type'
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
  entry,
  accounts,
  currency,
  dateFormat,
  onDone,
  onClose,
}: {
  // null = create; a Transfer leg = edit the whole Transfer it belongs to.
  entry: TransferLeg | null
  accounts: AccountEntry[]
  currency: CurrencyCode
  dateFormat: DateFormat
  // The write landed — save or delete alike. Refreshing is the mutation's
  // job (api/query-keys.ts); this only has to close.
  onDone: () => void
  onClose: () => void
}): JSX.Element {
  const today = todayCalendarString()
  // The stored pair's sides, as they are in the ledger — the draft below
  // starts from them but drifts as the user edits.
  const stored = entry === null ? null : transferDraftFromLeg(entry, currency)
  const [draft, setDraft] = useState<TransferDraft>(() => stored ?? emptyTransferDraft(today))
  // Only the draft's own complaint lives in state; a failed request's
  // message comes off the mutation that failed.
  const [invalid, setInvalid] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const { save: saveTransfer, remove: removeTransfer } = useTransferMutations()
  const busy = saveTransfer.isPending || removeTransfer.isPending
  const error = invalid ?? errorMessage(saveTransfer.error) ?? errorMessage(removeTransfer.error)

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

  const save = () => {
    const parsed = validateTransferDraft(draft, currency)
    if (!parsed.ok) {
      setInvalid(parsed.error)
      return
    }
    setInvalid(null)
    saveTransfer.mutate(
      { id: entry?.transferId ?? null, fields: parsed.value },
      {
        onSuccess: () => {
          notify(entry === null ? 'Transfer added' : 'Transfer saved')
          onDone()
        },
      },
    )
  }

  const remove = () => {
    if (entry === null) return
    setInvalid(null)
    removeTransfer.mutate(entry.transferId, {
      onSuccess: () => {
        notify('Transfer deleted')
        onDone()
      },
    })
  }

  const dateValid = isCalendarDate(draft.date)

  return (
    <View className="flex-1 bg-background">
      {/* Rendered in place of the Ledger, so the tab bar is still below it
          and already owns the bottom inset. The same rise-in and fade-out
          as the Transaction form (docs/design/MOTION.md): the two are
          siblings and must move as one. */}
      <Animated.View style={{ flex: 1 }} entering={rise} exiting={fade}>
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View className="flex-1 gap-4 px-5 pt-1">
              <View className="flex-row items-center justify-between gap-3">
                <View className="flex-1">
                  <Eyebrow>Between accounts</Eyebrow>
                  <Title>{entry === null ? 'New transfer' : 'Edit transfer'}</Title>
                </View>
                <Button variant="ghost" size="sm" isDisabled={busy} onPress={onClose}>
                  Cancel
                </Button>
              </View>
              <Body size="sm" tone="muted">
                Moves money between two of your accounts — never counted as spending or income.
              </Body>
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
                      <Body size="sm" tone="muted">
                        {formatCalendarDate(draft.date, dateFormat)}
                      </Body>
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
                    <Body size="sm" tone="danger">
                      {error}
                    </Body>
                  )}
                  <Button isDisabled={busy} onPress={() => save()}>
                    {busy ? 'Saving…' : entry === null ? 'Log transfer' : 'Save changes'}
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
      </Animated.View>
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
                  remove()
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
