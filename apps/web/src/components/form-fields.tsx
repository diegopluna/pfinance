import { Button } from '@pfinance/ui/components/button'
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
import { Field, FieldError, FieldLabel } from '@pfinance/ui/components/field'
import { Input } from '@pfinance/ui/components/input'
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
        {...inputProps}
      />
      <FieldError errors={errors.map(asMessage)} />
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
          className="flex h-9 w-full items-center justify-between gap-1.5 rounded-3xl border border-transparent bg-input/50 px-3 py-2 text-sm whitespace-nowrap outline-none transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20"
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
      <FieldError errors={errors.map(asMessage)} />
    </Field>
  )
}

export function SubmitButton({ children }: { children: React.ReactNode }) {
  const form = useFormContext()
  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(isSubmitting) => (
        <Button type="submit" disabled={isSubmitting}>
          {children}
        </Button>
      )}
    </form.Subscribe>
  )
}
