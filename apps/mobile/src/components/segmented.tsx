import type { JSX } from 'react'
import { View } from 'react-native'
import { Touchable } from '@/components/touchable'
import { Body } from '@/components/type'

// One row of mutually exclusive views: a bordered track with the selected
// segment inverted — foreground fill, background text — the design's
// selected-state grammar (an accent fill is reserved for the single
// primary action). Shared by the Insights switcher and the quick-add
// sheet's kind picker so the two can never drift.
//
// The radii are concentric: an 8px track with 3px of padding needs a 5px
// segment, or the inner corners look pinched against the outer ones.
export function Segmented<Value extends string>({
  choices,
  value,
  onChange,
}: {
  choices: readonly { value: Value; label: string }[]
  value: Value
  onChange: (value: Value) => void
}): JSX.Element {
  return (
    <View className="flex-row rounded-lg border border-separator p-[3px]">
      {choices.map((choice) => {
        const open = choice.value === value
        return (
          <Touchable
            key={choice.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: open }}
            onPress={() => onChange(choice.value)}
            className={`flex-1 items-center rounded-[5px] py-1.5 ${open ? 'bg-foreground' : ''}`}
          >
            <Body
              size="sm"
              className={open ? 'font-medium text-background' : 'font-medium text-muted'}
            >
              {choice.label}
            </Body>
          </Touchable>
        )
      })}
    </View>
  )
}
