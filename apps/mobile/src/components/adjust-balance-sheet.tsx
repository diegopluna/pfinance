import { formatAmount, type CurrencyCode } from '@pfinance/currency'
import { Button } from '@/components/button'
import { useState, type JSX } from 'react'
import { Modal, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTransactionMutations } from '@/api/use-transactions'
import { Figure } from '@/components/amount'
import { Keypad } from '@/components/keypad'
import { RollingFigure } from '@/components/rolling-figure'
import { notify } from '@/components/toaster'
import { Body, Eyebrow, SectionTitle } from '@/components/type'
import { adjustmentFields, signedActual } from '@/ledger/adjust'
import { todayCalendarString } from '@/ledger/dates'
import { pressDelete, pressDigit } from '@/ledger/keypad'
import { rise } from '@/motion'

// The adjust-balance sheet (issue #81): when the app and the bank disagree,
// the user states what the Account ACTUALLY holds — the number their bank
// shows — and the sheet records the difference as a Balance Adjustment
// (ledger/adjust.ts computes it; direction falls out of the subtraction).
// The ± key takes the 00 slot: a liability's reality is negative, and here
// sign is a fact, not a convenience. Editing or deleting an existing
// Adjustment stays in the full form behind its Ledger row, where the
// toggle and Delete already live.

export function AdjustBalanceSheet({
  account,
  onClose,
  currency,
}: {
  /** The Account being corrected; null keeps the sheet closed. */
  account: { id: string; name: string; balance: number } | null
  onClose: () => void
  currency: CurrencyCode
}): JSX.Element {
  const [minor, setMinor] = useState(0)
  const [negative, setNegative] = useState(false)
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { save } = useTransactionMutations()

  const reset = () => {
    setMinor(0)
    setNegative(false)
    setTouched(false)
    setError(null)
  }
  const close = () => {
    reset()
    onClose()
  }

  const actual = signedActual(minor, negative)
  const fields =
    account === null || !touched
      ? null
      : adjustmentFields(
          { id: account.id, balance: account.balance },
          actual,
          todayCalendarString(),
        )

  const submit = () => {
    if (fields === null) return
    save.mutate(
      { id: null, fields },
      {
        onSuccess: () => {
          notify('Adjustment recorded')
          close()
        },
        onError: (failure) => setError(failure.message),
      },
    )
  }

  return (
    <Modal
      visible={account !== null}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={close}
    >
      {account !== null && (
        <View className="flex-1 bg-background">
          <SafeAreaView style={{ flex: 1 }} edges={['bottom', 'left', 'right']}>
            <View className="flex-1 gap-4 px-5 pt-4">
              <View className="gap-0.5">
                <SectionTitle>{account.name}</SectionTitle>
                <Eyebrow>Adjust balance</Eyebrow>
              </View>

              <View className="flex-row items-baseline justify-between gap-3">
                <Body size="sm" tone="muted">
                  Balance in the app
                </Body>
                <Figure>{formatAmount(account.balance, currency)}</Figure>
              </View>

              <View className="gap-1">
                <Eyebrow>What the account actually holds</Eyebrow>
                <RollingFigure
                  text={formatAmount(actual, currency)}
                  value={actual}
                  tone={touched ? 'plain' : 'muted'}
                />
                {/* The consequence, stated before the button: what tapping
                    Record will write — or that there is nothing to write.
                    Keyed by which of the three it is, so the line rises in
                    when its meaning changes and holds still while only the
                    figure inside it ticks. */}
                {touched && fields === null ? (
                  <Animated.View key="agrees" entering={rise}>
                    <Body size="sm" tone="muted">
                      No drift — the app already agrees with this balance.
                    </Body>
                  </Animated.View>
                ) : fields !== null ? (
                  <Animated.View key="records" entering={rise}>
                    <Body size="sm" tone="muted">
                      Records a{' '}
                      <Figure size="sm" tone={fields.amount < 0 ? 'negative' : 'positive'}>
                        {`${fields.amount > 0 ? '+' : ''}${formatAmount(fields.amount, currency)}`}
                      </Figure>{' '}
                      balance adjustment
                    </Body>
                  </Animated.View>
                ) : (
                  <Animated.View key="prompt" entering={rise}>
                    <Body size="sm" tone="muted">
                      Enter the balance your bank shows.
                    </Body>
                  </Animated.View>
                )}
              </View>

              {error !== null && (
                <Body size="sm" tone="danger">
                  {error}
                </Body>
              )}

              <View className="flex-1" />

              <Keypad
                corner="sign"
                onDigit={(digit) => {
                  setMinor((current) => pressDigit(current, digit))
                  setTouched(true)
                  setError(null)
                }}
                onCorner={() => {
                  setNegative((current) => !current)
                  setTouched(true)
                }}
                onDelete={() => setMinor(pressDelete)}
              />

              <Button isDisabled={fields === null || save.isPending} onPress={submit}>
                {save.isPending ? 'Saving…' : 'Record adjustment'}
              </Button>
              <Body size="sm" tone="muted" className="pb-1 text-center">
                Moves the balance — never counted as spending or income
              </Body>
            </View>
          </SafeAreaView>
        </View>
      )}
    </Modal>
  )
}
