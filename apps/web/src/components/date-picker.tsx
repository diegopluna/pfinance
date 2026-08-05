import { useState } from 'react'
import { CalendarIcon } from 'lucide-react'
import { Button } from '@pfinance/ui/components/button'
import { Calendar } from '@pfinance/ui/components/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@pfinance/ui/components/popover'

// The ledger's dates are calendar date strings (YYYY-MM-DD, never a
// timestamp — CONTEXT.md), while react-day-picker deals in Date objects.
// Every conversion here goes through local date parts only: toISOString or
// Date-string parsing would read the date as UTC midnight and shift it a day
// west of Greenwich.

export const parseCalendarDate = (value: string): Date | undefined => {
  const [year, month, day] = value.split('-').map(Number)
  if (year === undefined || month === undefined || day === undefined) return undefined
  return new Date(year, month - 1, day)
}

const pad = (value: number, length: number) => value.toString().padStart(length, '0')

export const toCalendarString = (date: Date): string =>
  `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1, 2)}-${pad(date.getDate(), 2)}`

export const formatCalendarDate = (value: string): string => {
  const date = parseCalendarDate(value)
  return date === undefined
    ? value
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

// shadcn date picker (Popover + Calendar) over a calendar date string: ''
// means "nothing picked". Clicking the selected day again clears it, which
// is how a filter bound is emptied without a separate control.
export function CalendarDatePicker({
  id,
  value,
  onChange,
  placeholder = 'Pick a date',
  ...triggerProps
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
} & Pick<React.ComponentProps<'button'>, 'aria-invalid' | 'aria-describedby'>) {
  const [open, setOpen] = useState(false)
  const selected = value === '' ? undefined : parseCalendarDate(value)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            className="w-full justify-between font-normal"
            {...triggerProps}
          />
        }
      >
        <span className={value === '' ? 'text-muted-foreground' : undefined}>
          {value === '' ? placeholder : formatCalendarDate(value)}
        </span>
        <CalendarIcon className="size-4 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          // Dropdown caption so an older date (a backlogged receipt) is a
          // few clicks away, not a month-by-month trek.
          captionLayout="dropdown"
          selected={selected}
          defaultMonth={selected}
          onSelect={(date) => {
            onChange(date === undefined ? '' : toCalendarString(date))
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
