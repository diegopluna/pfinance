import { Chip, Label } from 'heroui-native'
import type { JSX, ReactNode } from 'react'
import { View } from 'react-native'

// The ledger forms' shared field pieces (issues #80, #81): the Transaction
// and Transfer forms are siblings and must read as one surface.

// One wrapped row of mutually exclusive choices. Unlike the list screen's
// filter chips there is no "tap again to clear": a form field holds a value,
// and clearing is its own explicit choice where one exists (Uncategorized).
export function ChoiceChips({
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

export function FieldBlock({
  label,
  children,
}: {
  label: string
  children: ReactNode
}): JSX.Element {
  return (
    <View className="gap-2">
      <Label>{label}</Label>
      {children}
    </View>
  )
}
