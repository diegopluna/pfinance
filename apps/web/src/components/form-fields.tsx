import { LoaderCircleIcon } from 'lucide-react'
import { Button } from '@pfinance/ui/components/button'
import { Checkbox } from '@pfinance/ui/components/checkbox'
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from '@pfinance/ui/components/combobox'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@pfinance/ui/components/field'
import { Input } from '@pfinance/ui/components/input'
import { CalendarDatePicker } from '@/components/date-picker'
import { useFieldContext, useFormContext } from '@/hooks/form-context'

// Bound components for useAppForm (see hooks/form.ts): field components read
// the field they're rendered under via context, so screens compose forms
// from `<form.AppField>` / `<form.AppForm>` without prop plumbing.

const asMessage = (error: unknown) =>
  typeof error === 'string' ? { message: error } : (error as { message?: string })

export function TextField({
  label,
  ...inputProps
}: { label: string } & React.ComponentProps<typeof Input>) {
  const field = useFieldContext<string>()
  const errors = field.state.meta.errors
  const invalid = errors.length > 0
  // The error is tied to its control so assistive tech reports it on the
  // field itself, not only as a page-level alert.
  const errorId = `${field.name}-error`
  return (
    <Field data-invalid={invalid || undefined}>
      <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
      <Input
        id={field.name}
        name={field.name}
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={(event) => field.handleChange(event.target.value)}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? errorId : undefined}
        {...inputProps}
      />
      <FieldError id={errorId} errors={errors.map(asMessage)} />
    </Field>
  )
}

// Boolean flag with the label beside the box; the optional description
// explains the consequence of checking it.
export function CheckboxField({ label, description }: { label: string; description?: string }) {
  const field = useFieldContext<boolean>()
  return (
    <Field orientation="horizontal">
      <Checkbox
        id={field.name}
        name={field.name}
        checked={field.state.value}
        onBlur={field.handleBlur}
        onCheckedChange={(checked) => field.handleChange(checked === true)}
      />
      <FieldContent>
        <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
        {description !== undefined && <FieldDescription>{description}</FieldDescription>}
      </FieldContent>
    </Field>
  )
}

type ComboboxOption = { value: string; label: string }

// Select-like combobox: a closed trigger that opens a searchable list.
export function ComboboxField({
  label,
  placeholder,
  searchPlaceholder,
  emptyText,
  options,
  renderValue,
}: {
  label: string
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  options: ReadonlyArray<ComboboxOption>
  // Compact display for the closed trigger when the option labels are long
  // (e.g. "BRL — Brazilian Real" listed, "BRL" once chosen).
  renderValue?: (value: string) => React.ReactNode
}) {
  const field = useFieldContext<string>()
  const errors = field.state.meta.errors
  const invalid = errors.length > 0
  const errorId = `${field.name}-error`
  return (
    <Field data-invalid={invalid || undefined}>
      <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
      <Combobox
        items={options}
        itemToStringLabel={(option: ComboboxOption) => option.label}
        isItemEqualToValue={(a: ComboboxOption, b: ComboboxOption) => a.value === b.value}
        // The form models "nothing chosen" as '', Base UI as null.
        value={options.find((option) => option.value === field.state.value) ?? null}
        onValueChange={(option: ComboboxOption | null) => field.handleChange(option?.value ?? '')}
      >
        <ComboboxTrigger
          id={field.name}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
          className="flex h-9 w-full items-center justify-between gap-1.5 rounded-lg border border-border bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs outline-none transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30"
        >
          <ComboboxValue>
            {(option: ComboboxOption | null) =>
              option === null ? (
                <span className="text-muted-foreground">{placeholder}</span>
              ) : renderValue ? (
                renderValue(option.value)
              ) : (
                option.label
              )
            }
          </ComboboxValue>
        </ComboboxTrigger>
        {/* Wider than the anchor so full option labels stay readable even
            under a narrow trigger. */}
        <ComboboxContent className="w-72 min-w-72">
          <ComboboxInput showTrigger={false} placeholder={searchPlaceholder} />
          <ComboboxEmpty>{emptyText ?? 'No results.'}</ComboboxEmpty>
          <ComboboxList>
            {(option: ComboboxOption) => (
              <ComboboxItem key={option.value} value={option}>
                {option.label}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <FieldError id={errorId} errors={errors.map(asMessage)} />
    </Field>
  )
}

// Calendar-date field over the shadcn date picker; the field value is the
// ledger's YYYY-MM-DD string ('' = nothing picked), see date-picker.tsx.
export function DatePickerField({ label, placeholder }: { label: string; placeholder?: string }) {
  const field = useFieldContext<string>()
  const errors = field.state.meta.errors
  const invalid = errors.length > 0
  const errorId = `${field.name}-error`
  return (
    <Field data-invalid={invalid || undefined}>
      <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
      <CalendarDatePicker
        id={field.name}
        value={field.state.value}
        onChange={field.handleChange}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? errorId : undefined}
      />
      <FieldError id={errorId} errors={errors.map(asMessage)} />
    </Field>
  )
}

export function SubmitButton({ children }: { children: React.ReactNode }) {
  const form = useFormContext()
  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(isSubmitting) => (
        // aria-busy + spinner: progress feedback beyond the disabled dim.
        // The label stays put so the button never changes meaning mid-flight.
        <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting || undefined}>
          {isSubmitting && (
            <LoaderCircleIcon aria-hidden className="animate-spin motion-reduce:hidden" />
          )}
          {children}
        </Button>
      )}
    </form.Subscribe>
  )
}
