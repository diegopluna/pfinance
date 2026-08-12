import { useState } from 'react'
import { CalendarIcon } from 'lucide-react'
import { Button } from '@pfinance/ui/components/button'
import { Calendar } from '@pfinance/ui/components/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@pfinance/ui/components/popover'
import { useDateFormat } from '@/hooks/use-date-format'
import { formatCalendarDate, parseCalendarDate, toCalendarString } from '@/lib/dates'

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
  const dateFormat = useDateFormat()
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
          {value === '' ? placeholder : formatCalendarDate(value, dateFormat)}
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
