import { formatAmount, type CurrencyCode } from '@pfinance/currency'
import { Button, useThemeColor } from 'heroui-native'
import { useState, type JSX } from 'react'
import { Modal, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTransactionMutations } from '@/api/use-transactions'
import { useTransferMutations } from '@/api/use-transfers'
import { Figure } from '@/components/amount'
import { ChoiceChips } from '@/components/form-fields'
import { Keypad } from '@/components/keypad'
import { Segmented } from '@/components/segmented'
import { Body, Eyebrow } from '@/components/type'
import { previousCalendarDay, todayCalendarString } from '@/ledger/dates'
import { validateDraft } from '@/ledger/draft'
import { keypadAmountText, pressDelete, pressDigit, pressDoubleZero } from '@/ledger/keypad'
import { validateTransferDraft } from '@/ledger/transfer-draft'

// The capture sheet (issue #80): the app's highest-frequency verb gets a
// designed moment instead of a generic form. Keypad-first — the keypad IS
// the amount input, cash-register style (ledger/keypad.ts), so the system
// keyboard never fights it — with the kind as a segmented choice, category
// and account as chips, and the date defaulting to today. Editing an
// existing row still opens the full forms in place on the Ledger: the
// sheet is for capture, the forms are for correction.
//
// Presented as a native page sheet (Modal presentationStyle), so iOS draws
// the rounded card, the grabber affordance and the drag-to-dismiss.

type Kind = 'out' | 'in' | 'transfer'

const KINDS: readonly { value: Kind; label: string }[] = [
  { value: 'out', label: 'Expense' },
  { value: 'in', label: 'Income' },
  { value: 'transfer', label: 'Transfer' },
]

const SUBMIT: Record<Kind, string> = {
  out: 'Add expense',
  in: 'Add income',
  transfer: 'Add transfer',
}

interface Choice {
  value: string
  label: string
}

export function QuickAddSheet({
  open,
  onClose,
  accounts,
  categories,
  currency,
}: {
  open: boolean
  onClose: () => void
  /** Active (unarchived) Accounts, as chip choices. */
  accounts: Choice[]
  /** Active (unarchived) Categories, as chip choices. */
  categories: Choice[]
  currency: CurrencyCode
}): JSX.Element {
  const [kind, setKind] = useState<Kind>('out')
  const [minor, setMinor] = useState(0)
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [accountId, setAccountId] = useState('')
  const [fromAccountId, setFromAccountId] = useState('')
  const [toAccountId, setToAccountId] = useState('')
  const [day, setDay] = useState<'today' | 'yesterday'>('today')
  const [error, setError] = useState<string | null>(null)
  const [mutedColor] = useThemeColor(['muted'])

  const transactions = useTransactionMutations()
  const transfers = useTransferMutations()
  const busy = transactions.save.isPending || transfers.save.isPending

  const reset = () => {
    setKind('out')
    setMinor(0)
    setDescription('')
    setCategoryId('')
    setAccountId('')
    setFromAccountId('')
    setToAccountId('')
    setDay('today')
    setError(null)
  }
  const close = () => {
    reset()
    onClose()
  }

  const today = todayCalendarString()
  const date = day === 'today' ? today : previousCalendarDay(today)
  // One Account needs no choice; the chips only appear when there is one to
  // make. A Transfer always needs two.
  const pickedAccount = accountId !== '' ? accountId : (accounts[0]?.value ?? '')

  const submit = () => {
    if (kind === 'transfer') {
      const validation = validateTransferDraft(
        {
          fromAccountId,
          toAccountId,
          amount: keypadAmountText(minor, currency),
          date,
          description: '',
        },
        currency,
      )
      if (!validation.ok) {
        setError(validation.error)
        return
      }
      transfers.save.mutate(
        { id: null, fields: validation.value },
        { onSuccess: close, onError: (failure) => setError(failure.message) },
      )
      return
    }
    const validation = validateDraft(
      {
        accountId: pickedAccount,
        direction: kind,
        amount: keypadAmountText(minor, currency),
        date,
        description,
        balanceAdjustment: false,
        categoryId,
      },
      currency,
    )
    if (!validation.ok) {
      setError(validation.error)
      return
    }
    transactions.save.mutate(
      { id: null, fields: validation.value },
      { onSuccess: close, onError: (failure) => setError(failure.message) },
    )
  }

  return (
    <Modal
      visible={open}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={close}
    >
      <View className="flex-1 bg-background">
        <SafeAreaView style={{ flex: 1 }} edges={['bottom', 'left', 'right']}>
          <View className="flex-1 gap-3.5 px-5 pt-4">
            <Segmented
              choices={KINDS}
              value={kind}
              onChange={(next) => {
                setKind(next)
                setError(null)
              }}
            />

            {/* The amount, growing from the right as the keypad types. */}
            <Figure size="hero" tone={minor === 0 ? 'muted' : 'plain'}>
              {formatAmount(minor, currency)}
            </Figure>

            {kind !== 'transfer' && (
              <TextInput
                className="h-11 rounded-lg border border-separator px-3 font-normal text-body text-foreground"
                placeholder="What was it?"
                placeholderTextColor={mutedColor}
                value={description}
                onChangeText={(text) => {
                  setDescription(text)
                  setError(null)
                }}
                returnKeyType="done"
                accessibilityLabel="Description"
              />
            )}

            {kind !== 'transfer' && categories.length > 0 && (
              <ChoiceChips
                choices={categories}
                value={categoryId}
                onChange={(next) => setCategoryId(next === categoryId ? '' : next)}
              />
            )}

            {kind !== 'transfer' && accounts.length > 1 && (
              <ChoiceChips choices={accounts} value={pickedAccount} onChange={setAccountId} />
            )}

            {kind === 'transfer' && (
              <View className="gap-2.5">
                <View className="gap-1.5">
                  <Eyebrow>From</Eyebrow>
                  <ChoiceChips
                    choices={accounts}
                    value={fromAccountId}
                    onChange={setFromAccountId}
                  />
                </View>
                <View className="gap-1.5">
                  <Eyebrow>To</Eyebrow>
                  <ChoiceChips choices={accounts} value={toAccountId} onChange={setToAccountId} />
                </View>
              </View>
            )}

            <ChoiceChips
              choices={[
                { value: 'today', label: 'Today' },
                { value: 'yesterday', label: 'Yesterday' },
              ]}
              value={day}
              onChange={(next) => setDay(next === 'yesterday' ? 'yesterday' : 'today')}
            />

            {error !== null && (
              <Body size="sm" tone="danger">
                {error}
              </Body>
            )}

            <View className="flex-1" />

            <Keypad
              onDigit={(digit) => {
                setMinor((current) => pressDigit(current, digit))
                setError(null)
              }}
              onCorner={() => setMinor(pressDoubleZero)}
              onDelete={() => setMinor(pressDelete)}
            />

            <Button isDisabled={busy} onPress={submit}>
              {busy ? 'Saving…' : SUBMIT[kind]}
            </Button>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  )
}
