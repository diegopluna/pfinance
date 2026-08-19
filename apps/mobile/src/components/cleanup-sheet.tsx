import type { CurrencyCode } from '@pfinance/currency'
import type { DateFormat } from '@pfinance/db/date-formats'
import { Button, useThemeColor } from 'heroui-native'
import { useState, type JSX } from 'react'
import { Modal, ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTransactionMutations } from '@/api/use-transactions'
import { Figure } from '@/components/amount'
import { ChoiceChips } from '@/components/form-fields'
import { Body, Eyebrow, SectionTitle } from '@/components/type'
import { assignedFields, type CleanupEntry } from '@/ledger/cleanup'
import { formatCalendarDate } from '@/ledger/dates'
import { ledgerAmount } from '@/ledger/display'

// The cleanup sheet (issue #82): the couch-time triage. One Transaction at
// a time — description, date · account, amount — with the Household's
// Categories as chips beneath; tapping one assigns it and advances, Skip
// passes without judging, and closing mid-queue loses nothing: every
// assignment saved on its own. The queue is a snapshot taken when the
// sheet opens, so background refetches never reshuffle it mid-triage; the
// sheet closes itself when the last row is handled. New Categories stay in
// the full form — triage is for sorting into the vocabulary you have.

export function CleanupSheet({
  open,
  onClose,
  queue,
  accountNames,
  categories,
  currency,
  dateFormat,
}: {
  open: boolean
  onClose: () => void
  /** The uncategorized standard rows, snapshotted at open (ledger/cleanup.ts). */
  queue: CleanupEntry[]
  accountNames: Map<string, string>
  /** Active (unarchived) Categories, as chip choices. */
  categories: { value: string; label: string }[]
  currency: CurrencyCode
  dateFormat: DateFormat
}): JSX.Element {
  const [index, setIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [accent] = useThemeColor(['accent'])
  const { save } = useTransactionMutations()

  const entry = queue[index]
  const close = () => {
    setIndex(0)
    setError(null)
    onClose()
  }
  const advance = () => {
    setError(null)
    if (index + 1 >= queue.length) close()
    else setIndex(index + 1)
  }

  const assign = (categoryId: string) => {
    if (entry === undefined || save.isPending) return
    save.mutate(
      { id: entry.id, fields: assignedFields(entry, categoryId) },
      { onSuccess: advance, onError: (failure) => setError(failure.message) },
    )
  }

  const amount = entry === undefined ? null : ledgerAmount(entry.kind, entry.amount, currency)

  return (
    <Modal
      visible={open}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={close}
    >
      {entry !== undefined && (
        <View className="flex-1 bg-background">
          <SafeAreaView style={{ flex: 1 }} edges={['bottom', 'left', 'right']}>
            <View className="flex-1 gap-4 px-5 pt-4">
              <View className="flex-row items-baseline gap-3">
                <SectionTitle className="flex-1">Clean up</SectionTitle>
                {/* accessibilityLiveRegion: advancing is otherwise silent
                    to a screen reader — the progress is the feedback. */}
                <Eyebrow accessibilityLiveRegion="polite">
                  {index + 1} of {queue.length}
                </Eyebrow>
              </View>
              <View className="h-1 rounded-full bg-surface-secondary">
                <View
                  className="h-1 rounded-full"
                  style={{
                    width: `${((index + 1) / queue.length) * 100}%`,
                    backgroundColor: accent,
                  }}
                />
              </View>

              <View className="gap-1 pt-1">
                {/* The ledger row's own voice — the sheet shows the same
                    row it came from, one at a time. */}
                <Body numberOfLines={2} className="font-medium">
                  {entry.description}
                </Body>
                <Body size="sm" tone="muted" numberOfLines={1}>
                  {formatCalendarDate(entry.date, dateFormat)} ·{' '}
                  {accountNames.get(entry.accountId) ?? 'Unknown account'}
                </Body>
                {amount !== null && (
                  <Figure tone={amount.tone} className="pt-0.5">
                    {amount.text}
                  </Figure>
                )}
              </View>

              <ScrollView showsVerticalScrollIndicator={false} className="flex-1">
                <ChoiceChips choices={categories} value="" onChange={assign} />
              </ScrollView>

              {error !== null && (
                <Body size="sm" tone="danger">
                  {error}
                </Body>
              )}

              <Button variant="outline" isDisabled={save.isPending} onPress={advance}>
                Skip
              </Button>
              <Body size="sm" tone="muted" className="pb-1 text-center">
                Tap a category to assign it and move to the next one
              </Body>
            </View>
          </SafeAreaView>
        </View>
      )}
    </Modal>
  )
}
